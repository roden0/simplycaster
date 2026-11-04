//! Core tus 1.0 protocol (plus `creation` with deferred length) for progressive,
//! resumable Track uploads. https://tus.io/protocols/resumable-upload
//!
//! A Participant creates one upload per Track when it starts recording and appends
//! to it with PATCH while the Track grows; the final PATCH carries `Upload-Length`.

use serde::Serialize;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::{AppState, MAX_TRACK_BYTES, invitation, track_stem};

const TUS_VERSION: &str = "1.0.0";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftMark {
    pub samples: u64,
    pub coordinator_time: f64,
    pub clock_offset_ms: f64,
    pub clock_rtt_ms: f64,
}

pub struct Upload {
    /// Also the file stem on disk and the last URL segment.
    pub id: String,
    pub take: u32,
    pub participant: String,
    pub part: u32,
    /// Coordinator time of the part's first sample (ms), sent by the client as `X-Track-Start`.
    pub start_time: f64,
    /// Rate of the Participant's audio clock, the unit of `drift_marks` samples.
    pub sample_rate: u32,
    /// Latencies the browser reported and compensated when choosing the first sample (ms).
    pub output_latency_ms: Option<f64>,
    pub input_latency_ms: Option<f64>,
    /// Measured at join (clicks through the speakers back into the microphone); used instead of the
    /// reported latencies when present.
    pub calibrated_round_trip_ms: Option<f64>,
    pub offset: u64,
    /// `(samples, coordinator_time)` pairs reported while this part was recorded.
    pub drift_marks: Vec<DriftMark>,
    /// The Participant's clock estimate when the part started: offset to the Coordinator and the
    /// round trip it was measured with (its error is at most half of it).
    pub clock_offset_ms: Option<f64>,
    pub clock_rtt_ms: Option<f64>,
    pub length: Option<u64>,
    /// A PATCH is in flight; reject a concurrent one instead of interleaving bytes.
    busy: bool,
}

impl Upload {
    pub fn is_complete(&self) -> bool {
        self.length == Some(self.offset)
    }

    pub fn file(&self) -> String {
        format!("{}.ogg", self.id)
    }
}

fn tus(status: StatusCode) -> Response {
    tus_with(status, [])
}

fn tus_with<const N: usize>(status: StatusCode, headers: [(&'static str, String); N]) -> Response {
    let mut res = status.into_response();
    let h = res.headers_mut();
    h.insert("Tus-Resumable", HeaderValue::from_static(TUS_VERSION));
    for (name, value) in headers {
        h.insert(name, HeaderValue::from_str(&value).unwrap());
    }
    res
}

/// The Participant's Invitation, sent as a header on every tus request.
fn invite(headers: &HeaderMap) -> Option<String> {
    let token = headers.get("X-Invite")?.to_str().ok()?;
    invitation(token).map(|(name, _)| name.to_string())
}

fn header_f64(headers: &HeaderMap, name: &str) -> Option<f64> {
    headers.get(name)?.to_str().ok()?.parse().ok()
}

fn header_u64(headers: &HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.parse().ok()
}

/// POST /takes/{take}/uploads — creates the upload for the next part of this Participant's Track.
pub async fn create(Path(take): Path<u32>, State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(name) = invite(&headers) else {
        return tus(StatusCode::FORBIDDEN);
    };
    let length = header_u64(&headers, "Upload-Length");
    if length.is_none() && headers.get("Upload-Defer-Length").is_none_or(|v| v != "1") {
        return tus(StatusCode::BAD_REQUEST);
    }
    if length.is_some_and(|l| l > MAX_TRACK_BYTES) {
        return tus(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let Some(start_time) = headers
        .get("X-Track-Start")
        .and_then(|v| v.to_str().ok()?.parse::<f64>().ok())
        .filter(|t| t.is_finite())
    else {
        return tus(StatusCode::BAD_REQUEST);
    };
    let Some(sample_rate) = header_u64(&headers, "X-Sample-Rate").and_then(|r| u32::try_from(r).ok()) else {
        return tus(StatusCode::BAD_REQUEST);
    };
    let latency = |name| header_f64(&headers, name).filter(|ms| (0.0..10_000.0).contains(ms));
    let (output_latency_ms, input_latency_ms) = (latency("X-Output-Latency-Ms"), latency("X-Input-Latency-Ms"));
    let calibrated_round_trip_ms = latency("X-Round-Trip-Ms");
    let clock_offset_ms = header_f64(&headers, "X-Clock-Offset-Ms").filter(|ms| ms.is_finite());
    let clock_rtt_ms = latency("X-Clock-Rtt-Ms");

    let mut room = state.lock().unwrap();
    if take == 0 || take as usize > room.takes.len() {
        return tus(StatusCode::NOT_FOUND);
    }
    // The file name is built here, never taken from the client.
    let part = 1 + room
        .uploads
        .iter()
        .filter(|u| u.take == take && u.participant == name)
        .count() as u32;
    let id = track_stem(take, &name, part);
    if let Err(e) = std::fs::File::create(room.dir.join(format!("{id}.ogg"))) {
        eprintln!("cannot create {id}.ogg: {e}");
        return tus(StatusCode::INTERNAL_SERVER_ERROR);
    }
    room.uploads.push(Upload {
        id: id.clone(),
        take,
        participant: name,
        part,
        start_time,
        sample_rate,
        output_latency_ms,
        input_latency_ms,
        calibrated_round_trip_ms,
        offset: 0,
        length,
        drift_marks: Vec::new(),
        clock_offset_ms,
        clock_rtt_ms,
        busy: false,
    });
    tus_with(StatusCode::CREATED, [("Location", format!("/uploads/{id}"))])
}

/// HEAD /uploads/{id} — how much the Coordinator already has, to resume from there.
pub async fn head(Path(id): Path<String>, State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(name) = invite(&headers) else {
        return tus(StatusCode::FORBIDDEN);
    };
    let room = state.lock().unwrap();
    let Some(u) = room.uploads.iter().find(|u| u.id == id && u.participant == name) else {
        return tus(StatusCode::NOT_FOUND);
    };
    let length = match u.length {
        Some(l) => ("Upload-Length", l.to_string()),
        None => ("Upload-Defer-Length", "1".to_string()),
    };
    tus_with(
        StatusCode::OK,
        [
            ("Upload-Offset", u.offset.to_string()),
            length,
            ("Cache-Control", "no-store".to_string()),
        ],
    )
}

/// PATCH /uploads/{id} — appends bytes at `Upload-Offset`.
pub async fn patch(Path(id): Path<String>, State(state): State<AppState>, headers: HeaderMap, body: Body) -> Response {
    let Some(name) = invite(&headers) else {
        return tus(StatusCode::FORBIDDEN);
    };
    if headers
        .get(header::CONTENT_TYPE)
        .is_none_or(|v| v != "application/offset+octet-stream")
    {
        return tus(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }
    let Some(client_offset) = header_u64(&headers, "Upload-Offset") else {
        return tus(StatusCode::BAD_REQUEST);
    };
    let new_length = header_u64(&headers, "Upload-Length");

    let (path, offset, length) = {
        let mut room = state.lock().unwrap();
        let dir = room.dir.clone();
        let Some(u) = room.uploads.iter_mut().find(|u| u.id == id && u.participant == name) else {
            return tus(StatusCode::NOT_FOUND);
        };
        if u.busy || client_offset != u.offset {
            return tus(StatusCode::CONFLICT);
        }
        match (u.length, new_length) {
            (Some(a), Some(b)) if a != b => return tus(StatusCode::BAD_REQUEST),
            (_, Some(b)) if b > MAX_TRACK_BYTES || b < u.offset => return tus(StatusCode::BAD_REQUEST),
            (None, Some(b)) => u.length = Some(b),
            _ => {}
        }
        u.busy = true;
        (dir.join(format!("{id}.ogg")), u.offset, u.length)
    };

    let limit = length.unwrap_or(MAX_TRACK_BYTES);
    let result = append(&path, body, limit - offset).await;
    // Whatever reached the disk counts, even on error: the client resumes from there.
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(offset);

    let mut room = state.lock().unwrap();
    let Some(u) = room.uploads.iter_mut().find(|u| u.id == id) else {
        return tus(StatusCode::NOT_FOUND); // uploads are never removed; kept for safety
    };
    u.busy = false;
    u.offset = size;
    let offset = u.offset;
    if let Err(e) = result {
        eprintln!("{id}: PATCH failed at offset {offset}: {e}");
        return tus_with(StatusCode::BAD_REQUEST, [("Upload-Offset", offset.to_string())]);
    }
    if u.is_complete() {
        let take = u.take;
        room.refresh_syncing();
        room.broadcast_roster();
        room.broadcast_take_tracks(take);
        room.save_metadata();
    }
    tus_with(StatusCode::NO_CONTENT, [("Upload-Offset", offset.to_string())])
}

/// Appends the request body to the file, at most `max` bytes.
async fn append(path: &std::path::Path, body: Body, max: u64) -> Result<(), String> {
    let mut written = 0u64;
    let mut out = tokio::fs::OpenOptions::new()
        .append(true)
        .open(path)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = body.into_data_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        if written + chunk.len() as u64 > max {
            return Err("more bytes than the upload length".to_string());
        }
        out.write_all(&chunk).await.map_err(|e| e.to_string())?;
        written += chunk.len() as u64;
    }
    out.flush().await.map_err(|e| e.to_string())
}
