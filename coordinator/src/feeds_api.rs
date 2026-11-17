//! Backoffice API of the Feed Manager (ADR-0013), and the public files it serves.
// Handlers fail with a ready Response, axum's usual style; its size does not matter here.
#![allow(clippy::result_large_err)]

use std::net::{IpAddr, SocketAddr};

use axum::{
    Json,
    body::Body,
    extract::{ConnectInfo, Path, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tower_http::services::ServeFile;

use crate::{
    AppState,
    accounts_api::{SignedIn, error},
    feeds::{FEED, FEED_JSON, Feeds, INDEX, KEY_MARKER, Upload},
    feeds_pages::PAGE_POLICY,
    protocol::{
        BackofficeError, CreatePodcast, CreateSubscriptionKey, EpisodeDetails, NewSubscriptionKey, PodcastDetails,
        PodcastView,
    },
};

fn feeds(state: &AppState) -> Result<&Feeds, Response> {
    state
        .feeds
        .as_ref()
        .ok_or_else(|| error(BackofficeError::PublishingUnavailable))
}

fn view(state: &AppState, who: &SignedIn, slug: &str) -> Result<Json<PodcastView>, Response> {
    let feeds = feeds(state)?;
    feeds
        .get(slug, |creator| who.can_manage(creator))
        .map(Json)
        .ok_or_else(|| error(BackofficeError::NotFound))
}

pub async fn list(who: SignedIn, State(state): State<AppState>) -> Result<Json<Vec<PodcastView>>, Response> {
    Ok(Json(feeds(&state)?.views(|creator| who.can_manage(creator))))
}

pub async fn get(
    who: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<PodcastView>, Response> {
    view(&state, &who, &slug)
}

pub async fn create(
    who: SignedIn,
    State(state): State<AppState>,
    Json(req): Json<CreatePodcast>,
) -> Result<Json<PodcastView>, Response> {
    let slug = feeds(&state)?.create(&req.name, &who.id).map_err(error)?;
    view(&state, &who, &slug)
}

pub async fn edit(
    who: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(details): Json<PodcastDetails>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?.edit(&slug, details).map_err(error)?;
    view(&state, &who, &slug)
}

pub async fn regenerate(
    who: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?.regenerate(&slug).map_err(error)?;
    view(&state, &who, &slug)
}

/// Any Account edits a Podcast; only its Creator or an Admin deletes it. Someone else's looks forbidden.
pub async fn delete(
    who: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<StatusCode, Response> {
    let feeds = feeds(&state)?;
    let creator = feeds.creator(&slug).ok_or_else(|| error(BackofficeError::NotFound))?;
    if !who.can_manage(creator.as_deref()) {
        return Err(StatusCode::FORBIDDEN.into_response());
    }
    feeds.delete(&slug).map_err(error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_episode(
    who: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(details): Json<EpisodeDetails>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?.create_episode(&slug, details).map_err(error)?;
    view(&state, &who, &slug)
}

pub async fn edit_episode(
    who: SignedIn,
    State(state): State<AppState>,
    Path((slug, ep)): Path<(String, String)>,
    Json(details): Json<EpisodeDetails>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?.edit_episode(&slug, &ep, details).map_err(error)?;
    view(&state, &who, &slug)
}

pub async fn delete_episode(
    who: SignedIn,
    State(state): State<AppState>,
    Path((slug, ep)): Path<(String, String)>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?.delete_episode(&slug, &ep).map_err(error)?;
    view(&state, &who, &slug)
}

pub async fn create_key(
    _: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    Json(req): Json<CreateSubscriptionKey>,
) -> Result<Json<NewSubscriptionKey>, Response> {
    let feed_url = feeds(&state)?.create_key(&slug, &req.name).map_err(error)?;
    Ok(Json(NewSubscriptionKey { feed_url }))
}

pub async fn revoke_key(
    who: SignedIn,
    State(state): State<AppState>,
    Path((slug, id)): Path<(String, String)>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?.revoke_key(&slug, &id).map_err(error)?;
    view(&state, &who, &slug)
}

pub async fn upload_cover(
    who: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> Result<Json<PodcastView>, Response> {
    receive(&state, &slug, None, Upload::Cover, &headers, body).await?;
    view(&state, &who, &slug)
}

pub async fn cover(
    _: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
    request: Request,
) -> Result<Response, Response> {
    stored(&state, &slug, None, Upload::Cover, request).await
}

pub async fn delete_cover(
    who: SignedIn,
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?.remove(&slug, None, Upload::Cover).map_err(error)?;
    view(&state, &who, &slug)
}

fn episode_upload(kind: &str) -> Result<Upload, Response> {
    match kind {
        "audio" => Ok(Upload::Audio),
        "image" => Ok(Upload::Image),
        "transcript" => Ok(Upload::Transcript),
        _ => Err(error(BackofficeError::NotFound)),
    }
}

pub async fn upload_episode_file(
    who: SignedIn,
    State(state): State<AppState>,
    Path((slug, ep, kind)): Path<(String, String, String)>,
    headers: HeaderMap,
    body: Body,
) -> Result<Json<PodcastView>, Response> {
    receive(&state, &slug, Some(&ep), episode_upload(&kind)?, &headers, body).await?;
    view(&state, &who, &slug)
}

pub async fn episode_file(
    _: SignedIn,
    State(state): State<AppState>,
    Path((slug, ep, kind)): Path<(String, String, String)>,
    request: Request,
) -> Result<Response, Response> {
    stored(&state, &slug, Some(&ep), episode_upload(&kind)?, request).await
}

pub async fn delete_episode_file(
    who: SignedIn,
    State(state): State<AppState>,
    Path((slug, ep, kind)): Path<(String, String, String)>,
) -> Result<Json<PodcastView>, Response> {
    feeds(&state)?
        .remove(&slug, Some(&ep), episode_upload(&kind)?)
        .map_err(error)?;
    view(&state, &who, &slug)
}

/// An uploaded file as stored, published or not, for whoever edits the Podcast to check it.
async fn stored(
    state: &AppState,
    slug: &str,
    ep: Option<&str>,
    kind: Upload,
    request: Request,
) -> Result<Response, Response> {
    let path = feeds(state)?
        .stored(slug, ep, kind)
        .ok_or_else(|| error(BackofficeError::NotFound))?;
    let mut response = ServeFile::new(path)
        .try_call(request)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())?
        .map(Body::new);
    // Replacing keeps the address: always ask again.
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    Ok(response)
}

/// Streams the body to disk, at most the limit of its kind, then hands it to the Podcast.
async fn receive(
    state: &AppState,
    slug: &str,
    ep: Option<&str>,
    kind: Upload,
    headers: &HeaderMap,
    body: Body,
) -> Result<(), Response> {
    let feeds = feeds(state)?;
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let ext = kind
        .extension(content_type)
        .ok_or_else(|| error(BackofficeError::InvalidFile))?;
    let path = feeds
        .upload_path(slug)
        .ok_or_else(|| error(BackofficeError::NotFound))?;
    let written = write_limited(&path, body, kind.max_bytes()).await;
    let bytes = match written {
        Ok(n) if n > 0 => n,
        other => {
            let _ = tokio::fs::remove_file(&path).await;
            if let Err(e) = other {
                eprintln!("upload to podcast {slug} failed: {e}");
            }
            return Err(error(BackofficeError::InvalidFile));
        }
    };
    feeds.store(slug, ep, kind, ext, &path, bytes).map_err(error)
}

async fn write_limited(path: &std::path::Path, body: Body, max: u64) -> Result<u64, String> {
    let mut out = tokio::fs::File::create(path).await.map_err(|e| e.to_string())?;
    let mut written = 0u64;
    let mut stream = body.into_data_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        written += chunk.len() as u64;
        if written > max {
            return Err(format!("more than {max} bytes"));
        }
        out.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    out.flush().await.map_err(|e| e.to_string())?;
    Ok(written)
}

/// Who is asking. Behind a reverse proxy on this host or network (Caddy, Traefik), the connection
/// comes from the proxy and the last `X-Forwarded-For` entry is the one it added; otherwise, the peer.
pub fn client_ip(peer: SocketAddr, headers: &HeaderMap) -> IpAddr {
    let behind_proxy = match peer.ip() {
        IpAddr::V4(ip) => ip.is_loopback() || ip.is_private(),
        IpAddr::V6(ip) => ip.is_loopback() || ip.is_unique_local(),
    };
    let forwarded = || {
        let all = headers.get_all("x-forwarded-for");
        let last = all.iter().next_back()?.to_str().ok()?;
        last.rsplit(',').next()?.trim().parse().ok()
    };
    if behind_proxy {
        forwarded().unwrap_or(peer.ip())
    } else {
        peer.ip()
    }
}

/// Public: a file of a Podcast as of its last generation, with Range and Last-Modified. Anything
/// else, including drafts and `podcast.json`, is a 404.
pub async fn public_file(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path((slug, file)): Path<(String, String)>,
    request: Request,
) -> Result<Response, StatusCode> {
    serve(&state, peer, &slug, &page_file(file), None, request).await
}

/// Public: the Podcast's page, `/podcasts/<slug>`.
pub async fn podcast_page(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path(slug): Path<String>,
    request: Request,
) -> Result<Response, StatusCode> {
    serve(&state, peer, &slug, INDEX, None, request).await
}

/// The same with a Subscription key: `/podcasts/<slug>/k/<key>/<file>`.
pub async fn keyed_file(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path((slug, key, file)): Path<(String, String, String)>,
    request: Request,
) -> Result<Response, StatusCode> {
    serve(&state, peer, &slug, &page_file(file), Some(&key), request).await
}

pub async fn keyed_page(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path((slug, key)): Path<(String, String)>,
    request: Request,
) -> Result<Response, StatusCode> {
    serve(&state, peer, &slug, INDEX, Some(&key), request).await
}

/// An Episode's page has no extension in its address.
fn page_file(file: String) -> String {
    if file.contains('.') {
        file
    } else {
        format!("{file}.html")
    }
}

async fn serve(
    state: &AppState,
    peer: SocketAddr,
    slug: &str,
    file: &str,
    key: Option<&str>,
    request: Request,
) -> Result<Response, StatusCode> {
    let feeds = state.feeds.as_ref().ok_or(StatusCode::NOT_FOUND)?;
    let from = client_ip(peer, request.headers());
    if feeds.limited(from) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    // A wrong key, a missing one and a missing file look the same: 404.
    let Some(served) = feeds.public_file(slug, file, key, from) else {
        feeds.failed(from);
        return Err(StatusCode::NOT_FOUND);
    };
    let text = file == FEED || file == FEED_JSON || file.ends_with(".html");
    let mut response = match &served.key {
        Some(key) if text => with_key(&served.path, key, request.headers()).await?,
        _ => ServeFile::new(&served.path)
            .try_call(request)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .map(Body::new),
    };
    let headers = response.headers_mut();
    let content_type = match file {
        FEED => Some("application/rss+xml; charset=utf-8"),
        FEED_JSON => Some("application/feed+json; charset=utf-8"),
        f if f.ends_with(".html") => {
            headers.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static(PAGE_POLICY));
            Some("text/html; charset=utf-8")
        }
        _ => None,
    };
    if let Some(value) = content_type {
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(value));
    }
    // Short: a regenerated feed or a replaced mp3 keeps its URL, and reaches listeners within minutes.
    // Private content stays out of shared caches and search engines.
    let (cache, private) = match served.key {
        Some(_) => ("private, max-age=300", true),
        None => ("public, max-age=300", false),
    };
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    if private {
        headers.insert("x-robots-tag", HeaderValue::from_static("noindex"));
    }
    Ok(response)
}

/// A text file of a private Podcast with its key written in, and an ETag of the result.
async fn with_key(path: &std::path::Path, key: &str, headers: &HeaderMap) -> Result<Response, StatusCode> {
    let template = tokio::fs::read_to_string(path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let body = template.replace(KEY_MARKER, key);
    let digest: String = Sha256::digest(body.as_bytes())[..8]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let etag = format!("\"{digest}\"");
    let unchanged = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|t| t.trim() == etag));
    let status = if unchanged {
        StatusCode::NOT_MODIFIED
    } else {
        StatusCode::OK
    };
    let body = if unchanged { Body::empty() } else { Body::from(body) };
    Response::builder()
        .status(status)
        .header(header::ETAG, etag)
        .body(body)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(xff: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("x-forwarded-for", xff.parse().unwrap());
        h
    }

    #[test]
    fn the_client_address_comes_from_the_proxy_only_when_there_is_one() {
        let proxy: SocketAddr = "172.18.0.3:4000".parse().unwrap();
        let direct: SocketAddr = "203.0.113.9:4000".parse().unwrap();
        // The proxy's own entry is the last one; anything before it was written by the client.
        assert_eq!(
            client_ip(proxy, &headers("1.2.3.4, 198.51.100.7")),
            "198.51.100.7".parse::<IpAddr>().unwrap()
        );
        assert_eq!(client_ip(direct, &headers("1.2.3.4")), direct.ip());
        assert_eq!(client_ip(proxy, &HeaderMap::new()), proxy.ip());
    }
}
