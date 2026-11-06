//! The client, built by Vite into `client/dist`, inside the binary (ADR-0008): release builds embed it,
//! so one file is the whole application; debug builds read it from disk, so a rebuilt client shows
//! without recompiling the Coordinator.

use axum::{
    http::{HeaderValue, StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "../client/dist"]
// `make types` compiles the Coordinator before the client is built.
#[allow_missing = true]
struct Client;

/// The file at `path`, with its media type, or `None` if the client has no such file.
pub fn file(path: &str) -> Option<Response> {
    let file = Client::get(path)?;
    let mime = HeaderValue::from_str(file.metadata.mimetype()).ok()?;
    Some(([(header::CONTENT_TYPE, mime)], file.data).into_response())
}

/// Any other path is the Participant page, which reads its Invitation from the URL (`/i/{token}`).
pub async fn fallback(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    file(path)
        .or_else(|| file("index.html"))
        .unwrap_or_else(|| (StatusCode::NOT_FOUND, "client not built: run make client").into_response())
}

pub async fn backoffice() -> Response {
    file("backoffice.html").unwrap_or_else(|| StatusCode::NOT_FOUND.into_response())
}
