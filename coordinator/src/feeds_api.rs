//! Backoffice API of the Feed Manager (ADR-0013), and the public files it serves.
// Handlers fail with a ready Response, axum's usual style; its size does not matter here.
#![allow(clippy::result_large_err)]

use axum::{
    Json,
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tower_http::services::ServeFile;

use crate::{
    AppState,
    accounts_api::{SignedIn, error},
    feeds::{FEED, Feeds, Upload},
    protocol::{BackofficeError, CreatePodcast, EpisodeDetails, PodcastDetails, PodcastView},
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

pub async fn upload_episode_file(
    who: SignedIn,
    State(state): State<AppState>,
    Path((slug, ep, kind)): Path<(String, String, String)>,
    headers: HeaderMap,
    body: Body,
) -> Result<Json<PodcastView>, Response> {
    let kind = match kind.as_str() {
        "audio" => Upload::Audio,
        "image" => Upload::Image,
        "transcript" => Upload::Transcript,
        _ => return Err(error(BackofficeError::NotFound)),
    };
    receive(&state, &slug, Some(&ep), kind, &headers, body).await?;
    view(&state, &who, &slug)
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

/// Public: a file of a Podcast as of its last generation, with Range and Last-Modified. Anything
/// else, including drafts and `podcast.json`, is a 404.
pub async fn public_file(
    State(state): State<AppState>,
    Path((slug, file)): Path<(String, String)>,
    request: Request,
) -> Result<Response, StatusCode> {
    let path = state
        .feeds
        .as_ref()
        .and_then(|f| f.public_file(&slug, &file))
        .ok_or(StatusCode::NOT_FOUND)?;
    let mut response = ServeFile::new(&path)
        .try_call(request)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Body::new);
    let headers = response.headers_mut();
    if file == FEED {
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/rss+xml; charset=utf-8"),
        );
    }
    // Short: a regenerated feed or a replaced mp3 keeps its URL, and reaches listeners within minutes.
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=300"));
    Ok(response)
}
