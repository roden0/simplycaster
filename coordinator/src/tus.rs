//! Core tus 1.0 protocol (plus `creation` with deferred length) for progressive,
//! resumable Track uploads. https://tus.io/protocols/resumable-upload
//!
//! A Participant creates one upload per Track when it starts recording and appends
//! to it with PATCH while the Track grows; the final PATCH carries `Upload-Length`.

use serde::{Deserialize, Serialize};

use axum::{
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::room_file::PartFile;
use crate::{AppState, MAX_TRACK_BYTES, SharedRoom, track_stem};

const TUS_VERSION: &str = "1.0.0";
/// Drift marks must span this long before their slope is trusted to correct a part (ADR-0004).
const MIN_DRIFT_SPAN_MS: f64 = 60_000.0;
/// Beyond this the marks are wrong, not the clock: real audio clocks drift tens of ppm.
const MAX_DRIFT_PPM: f64 = 1000.0;
/// Parts per Participant and Take. Each reconnection starts one, so a client reconnecting in a loop,
/// or a leaked Invitation, would otherwise fill the disk. Real Takes have a handful.
const MAX_PARTS: u32 = 50;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
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
    /// Audio received, read from the Ogg once: when the part completes, or when its Room closes.
    pub duration_ms: Option<f64>,
    /// A PATCH is in flight; reject a concurrent one instead of interleaving bytes.
    busy: bool,
}

impl Upload {
    pub fn from_file(take: u32, p: PartFile) -> Upload {
        Upload {
            id: p.file.trim_end_matches(".ogg").to_string(),
            take,
            participant: p.participant,
            part: p.part,
            start_time: p.start_time,
            sample_rate: p.sample_rate,
            output_latency_ms: p.output_latency_ms,
            input_latency_ms: p.input_latency_ms,
            calibrated_round_trip_ms: p.calibrated_round_trip_ms,
            offset: p.bytes,
            drift_marks: p.drift_marks,
            clock_offset_ms: p.clock_offset_ms,
            clock_rtt_ms: p.clock_rtt_ms,
            length: p.complete.then_some(p.bytes),
            duration_ms: p.duration_ms,
            busy: false,
        }
    }

    /// The part as `room.json` records it; `t` is its Take's T, the Sync tone.
    pub fn to_file(&self, t: f64, tone_hz: f64) -> PartFile {
        PartFile {
            participant: self.participant.clone(),
            part: self.part,
            file: self.file(),
            complete: self.is_complete(),
            bytes: self.offset,
            duration_ms: self.duration_ms,
            start_time: self.start_time,
            start_offset_ms: self.start_time - t,
            sample_rate: self.sample_rate,
            tone_hz,
            output_latency_ms: self.output_latency_ms,
            input_latency_ms: self.input_latency_ms,
            calibrated_round_trip_ms: self.calibrated_round_trip_ms,
            clock_offset_ms: self.clock_offset_ms,
            clock_rtt_ms: self.clock_rtt_ms,
            drift_marks: self.drift_marks.clone(),
            drift_ppm: self.drift_ppm(),
        }
    }

    /// How fast this part's audio clock ran against the Coordinator clock, in ppm, from the
    /// least-squares slope of its drift marks; `None` when there are too few to trust.
    pub fn drift_ppm(&self) -> Option<f64> {
        let m = &self.drift_marks;
        if m.len() < 3 || m.last()?.coordinator_time - m[0].coordinator_time < MIN_DRIFT_SPAN_MS {
            return None;
        }
        let n = m.len() as f64;
        let (t0, s0) = (m[0].coordinator_time, m[0].samples as f64);
        let xs: Vec<f64> = m.iter().map(|d| d.coordinator_time - t0).collect();
        let ys: Vec<f64> = m.iter().map(|d| d.samples as f64 - s0).collect();
        let (mx, my) = (xs.iter().sum::<f64>() / n, ys.iter().sum::<f64>() / n);
        let sxy: f64 = xs.iter().zip(&ys).map(|(x, y)| (x - mx) * (y - my)).sum();
        let sxx: f64 = xs.iter().map(|x| (x - mx).powi(2)).sum();
        let samples_per_s = sxy / sxx * 1000.0;
        let ppm = (samples_per_s / f64::from(self.sample_rate) - 1.0) * 1e6;
        (ppm.abs() < MAX_DRIFT_PPM).then_some(ppm)
    }

    /// Length of the audio received so far (ms), from the Ogg file itself. Shorter than its
    /// Take when the browser stopped early, e.g. closed mid-Take: the part keeps what it recorded.
    /// Reads the file: call it without the Room lock, or once per part.
    pub fn read_duration_ms(&self, dir: &std::path::Path) -> Option<f64> {
        ogg_opus_duration_ms(&dir.join(self.file()))
    }

    /// Whether a PATCH at `client_offset`, declaring `new_length` if any, may write now: one at a time,
    /// exactly where the Coordinator is, and never past the declared or maximum length. A deferred
    /// length is fixed by the first PATCH that declares it.
    pub fn check_patch(&mut self, client_offset: u64, new_length: Option<u64>) -> Result<(), StatusCode> {
        if self.busy || client_offset != self.offset {
            return Err(StatusCode::CONFLICT);
        }
        match (self.length, new_length) {
            (Some(a), Some(b)) if a != b => Err(StatusCode::BAD_REQUEST),
            (_, Some(b)) if b > MAX_TRACK_BYTES || b < self.offset => Err(StatusCode::BAD_REQUEST),
            (None, Some(b)) => {
                self.length = Some(b);
                Ok(())
            }
            _ => Ok(()),
        }
    }

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

/// The Room and fixed name behind the Invitation sent as a header on every tus request.
/// Closed Rooms match nothing, so nothing more reaches them (CU8).
fn invite(state: &AppState, headers: &HeaderMap) -> Option<(SharedRoom, String)> {
    let token = headers.get("X-Invite")?.to_str().ok()?;
    state.by_invite(token).map(|(room, name, _)| (room, name))
}

fn header_f64(headers: &HeaderMap, name: &str) -> Option<f64> {
    headers.get(name)?.to_str().ok()?.parse().ok()
}

fn header_u64(headers: &HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.parse().ok()
}

/// POST /takes/{take}/uploads — creates the upload for the next part of this Participant's Track.
pub async fn create(Path(take): Path<u32>, State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some((shared, name)) = invite(&state, &headers) else {
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

    let mut room = shared.lock().unwrap();
    if take == 0 || take as usize > room.takes.len() {
        return tus(StatusCode::NOT_FOUND);
    }
    // The file name is built here, never taken from the client.
    let part = 1 + room
        .uploads
        .iter()
        .filter(|u| u.take == take && u.participant == name)
        .count() as u32;
    // Not limited to the Take being recorded: a POST right after the stop is legitimate. 403 and not 409,
    // which tus-js-client would retry.
    if part > MAX_PARTS {
        eprintln!("{} {name}: refusing part {part} of Take {take}", room.id);
        return tus(StatusCode::FORBIDDEN);
    }
    let id = track_stem(&room.id, take, &name, part);
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
        duration_ms: None,
        drift_marks: Vec::new(),
        clock_offset_ms,
        clock_rtt_ms,
        busy: false,
    });
    // Listed in room.json from the start, so a restart mid-Take still finds this file.
    room.save_metadata();
    tus_with(StatusCode::CREATED, [("Location", format!("/uploads/{id}"))])
}

/// HEAD /uploads/{id} — how much the Coordinator already has, to resume from there.
pub async fn head(Path(id): Path<String>, State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some((shared, name)) = invite(&state, &headers) else {
        return tus(StatusCode::FORBIDDEN);
    };
    let room = shared.lock().unwrap();
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
    let Some((shared, name)) = invite(&state, &headers) else {
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
        let mut room = shared.lock().unwrap();
        let dir = room.dir.clone();
        let Some(u) = room.uploads.iter_mut().find(|u| u.id == id && u.participant == name) else {
            return tus(StatusCode::NOT_FOUND);
        };
        if let Err(status) = u.check_patch(client_offset, new_length) {
            return tus(status);
        }
        u.busy = true;
        (dir.join(format!("{id}.ogg")), u.offset, u.length)
    };

    let limit = length.unwrap_or(MAX_TRACK_BYTES);
    let writing = Writing {
        room: shared.clone(),
        id: id.clone(),
        path: path.clone(),
        offset,
    };
    let result = append(&path, body, limit - offset).await;
    drop(writing); // before taking the lock again: its Drop takes it
    // Read once, without the lock, if this PATCH completed the part (ADR-0006 B5).
    let size = std::fs::metadata(&path).map(|m| m.len()).ok();
    let duration_ms = (length.is_some() && size == length)
        .then(|| ogg_opus_duration_ms(&path))
        .flatten();

    let mut room = shared.lock().unwrap();
    let Some(u) = room.uploads.iter_mut().find(|u| u.id == id) else {
        return tus(StatusCode::NOT_FOUND); // uploads are never removed; kept for safety
    };
    let offset = u.offset;
    if let Err(e) = result {
        eprintln!("{id}: PATCH failed at offset {offset}: {e}");
        return tus_with(StatusCode::BAD_REQUEST, [("Upload-Offset", offset.to_string())]);
    }
    if u.is_complete() {
        u.duration_ms = duration_ms;
        let take = u.take;
        room.refresh_syncing();
        room.broadcast_roster();
        room.broadcast_take_tracks(take);
        room.save_metadata();
    }
    tus_with(StatusCode::NO_CONTENT, [("Upload-Offset", offset.to_string())])
}

/// Marks an upload busy while a PATCH writes it. Dropping it records what reached the disk and frees
/// the upload, also when axum drops the handler because the client disconnected mid-body (ADR-0006 A1).
struct Writing {
    room: SharedRoom,
    id: String,
    path: std::path::PathBuf,
    offset: u64,
}

impl Drop for Writing {
    fn drop(&mut self) {
        // Whatever reached the disk counts, even on error: the client resumes from there.
        let size = std::fs::metadata(&self.path).map(|m| m.len()).unwrap_or(self.offset);
        // No unwrap: a panic inside Drop while unwinding would abort the whole Coordinator.
        let Ok(mut room) = self.room.lock() else { return };
        if let Some(u) = room.uploads.iter_mut().find(|u| u.id == self.id) {
            u.busy = false;
            u.offset = size;
        }
    }
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

/// Opus duration of an Ogg file: granule position of the last page minus the pre-skip of the
/// header, at 48 kHz. Reads only the head and the last 64 KB (an Ogg page is never larger).
fn ogg_opus_duration_ms(path: &std::path::Path) -> Option<f64> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path).ok()?;
    let mut head = [0u8; 512];
    let n = f.read(&mut head).ok()?;
    let at = head[..n].windows(8).position(|w| w == b"OpusHead")?;
    let pre_skip = u16::from_le_bytes(head.get(at + 10..at + 12)?.try_into().ok()?);
    let len = f.metadata().ok()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(65_536))).ok()?;
    let mut tail = Vec::new();
    f.read_to_end(&mut tail).ok()?;
    // The last page header: "OggS", version 0, then the granule position.
    let page = tail.windows(5).rposition(|w| w == b"OggS\0")?;
    let granule = i64::from_le_bytes(tail.get(page + 6..page + 14)?.try_into().ok()?);
    (granule >= i64::from(pre_skip)).then(|| (granule - i64::from(pre_skip)) as f64 / 48.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn part(marks: &[(f64, u64)]) -> Upload {
        let saved = format!(
            r#"{{"participant":"ana","part":1,"file":"x.ogg","complete":true,"bytes":1,"startTime":0,"sampleRate":48000,
            "outputLatencyMs":null,"inputLatencyMs":null,"calibratedRoundTripMs":null,"clockOffsetMs":null,"clockRttMs":null,
            "driftMarks":[{}]}}"#,
            marks
                .iter()
                .map(|(t, s)| format!(r#"{{"samples":{s},"coordinatorTime":{t},"clockOffsetMs":0,"clockRttMs":0}}"#))
                .collect::<Vec<_>>()
                .join(",")
        );
        Upload::from_file(1, serde_json::from_str(&saved).unwrap())
    }

    #[test]
    fn drift_from_the_slope_of_the_marks() {
        // An audio clock 30 ppm fast, marked every 10 s for 10 min, with ±20 samples of jitter.
        let marks: Vec<_> = (0..60)
            .map(|i| {
                let t = 1e12 + i as f64 * 10_000.0;
                let jitter = if i % 2 == 0 { 20.0 } else { -20.0 };
                (t, (i as f64 * 10.0 * 48_000.0 * 1.00003 + jitter) as u64)
            })
            .collect();
        let ppm = part(&marks).drift_ppm().unwrap();
        assert!((ppm - 30.0).abs() < 0.5, "{ppm}");
    }

    /// The bytes of an Ogg Opus file of 10 s that matter to its duration: head and last page.
    fn ten_second_ogg() -> Vec<u8> {
        let mut ogg = b"OggS\0\x02".to_vec();
        ogg.extend([0u8; 22]);
        ogg.extend(b"OpusHead\x01\x01");
        ogg.extend(312u16.to_le_bytes());
        ogg.extend([0u8; 300]);
        ogg.extend(b"OggS\0\x04");
        ogg.extend((48_000i64 * 10 + 312).to_le_bytes());
        ogg.extend([0u8; 40]);
        ogg
    }

    #[test]
    fn duration_from_the_last_ogg_page() {
        let ogg = ten_second_ogg();
        let path = std::env::temp_dir().join(format!("{}.ogg", crate::random_token()));
        std::fs::write(&path, ogg).unwrap();
        assert_eq!(ogg_opus_duration_ms(&path), Some(10_000.0));
        std::fs::remove_file(path).unwrap();
    }

    /// A Room recording Take 1, with Ana and Bea invited; returns their Invitation tokens.
    fn studio() -> (AppState, std::path::PathBuf, String, String) {
        use crate::{Coordinator, Role, Room};
        use std::sync::{Arc, Mutex};
        let dir = std::env::temp_dir().join(crate::random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let mut room = Room::new("r_2026-11-06".into(), "r".into(), dir.clone());
        room.invite("ana", Role::Guest).unwrap();
        room.invite("bea", Role::Guest).unwrap();
        room.start_take();
        let (ana, bea) = (room.participants[0].token.clone(), room.participants[1].token.clone());
        let state = Arc::new(Coordinator {
            rooms: Mutex::new(vec![Arc::new(Mutex::new(room))]),
            data: dir.clone(),
            backoffice_token: "admin".into(),
            turn: None,
        });
        (state, dir, ana, bea)
    }

    fn headers(token: &str, pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("X-Invite", token.parse().unwrap());
        for (k, v) in pairs {
            h.insert(*k, v.parse().unwrap());
        }
        h
    }

    const NEW_PART: [(&str, &str); 3] = [
        ("Upload-Defer-Length", "1"),
        ("X-Track-Start", "0"),
        ("X-Sample-Rate", "48000"),
    ];

    /// Creates the next part of the Participant behind `token` and returns its upload id.
    async fn new_part(state: &AppState, token: &str) -> String {
        let created = create(Path(1), State(state.clone()), headers(token, &NEW_PART)).await;
        assert_eq!(created.status(), StatusCode::CREATED);
        created.headers()["Location"]
            .to_str()
            .unwrap()
            .trim_start_matches("/uploads/")
            .to_string()
    }

    fn patch_at(token: &str, offset: &str) -> HeaderMap {
        headers(
            token,
            &[
                ("Content-Type", "application/offset+octet-stream"),
                ("Upload-Offset", offset),
            ],
        )
    }

    #[tokio::test]
    async fn a_patch_cancelled_mid_body_does_not_lock_the_upload() {
        let (state, dir, ana, _) = studio();
        let id = new_part(&state, &ana).await;

        // The connection drops mid-body: the handler future is dropped while it waits for bytes.
        let stalled = Body::from_stream(futures_util::stream::pending::<Result<Vec<u8>, std::io::Error>>());
        let cut = std::time::Duration::from_millis(50);
        let first = patch(Path(id.clone()), State(state.clone()), patch_at(&ana, "0"), stalled);
        assert!(tokio::time::timeout(cut, first).await.is_err());

        // The client resumes from offset 0, and must not get 409 forever.
        let resumed = patch(Path(id), State(state), patch_at(&ana, "0"), Body::from("OggS")).await;
        assert_eq!(resumed.status(), StatusCode::NO_CONTENT);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn an_upload_grows_and_completes_with_its_final_length() {
        let (state, dir, ana, _) = studio();
        let id = new_part(&state, &ana).await;
        let first = patch(
            Path(id.clone()),
            State(state.clone()),
            patch_at(&ana, "0"),
            Body::from("Ogg"),
        )
        .await;
        assert_eq!(first.headers()["Upload-Offset"], "3");
        // A retry of a PATCH that already arrived is refused: the client asks HEAD and resumes.
        let again = patch(
            Path(id.clone()),
            State(state.clone()),
            patch_at(&ana, "0"),
            Body::from("Ogg"),
        )
        .await;
        assert_eq!(again.status(), StatusCode::CONFLICT);
        let mut last = patch_at(&ana, "3");
        last.insert("Upload-Length", "4".parse().unwrap());
        let done = patch(Path(id.clone()), State(state.clone()), last, Body::from("S")).await;
        assert_eq!(done.status(), StatusCode::NO_CONTENT);
        assert_eq!(std::fs::read(dir.join(format!("{id}.ogg"))).unwrap(), b"OggS");
        let saved = crate::room_file::RoomFile::read(&dir).unwrap();
        assert!(saved.takes[0].tracks[0].complete);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn room_json_records_the_duration_of_a_completed_part() {
        let (state, dir, ana, _) = studio();
        let id = new_part(&state, &ana).await;
        let ogg = ten_second_ogg();
        let mut last = patch_at(&ana, "0");
        last.insert("Upload-Length", ogg.len().to_string().parse().unwrap());
        let done = patch(Path(id), State(state), last, Body::from(ogg)).await;
        assert_eq!(done.status(), StatusCode::NO_CONTENT);
        let saved = crate::room_file::RoomFile::read(&dir).unwrap();
        assert_eq!(saved.takes[0].tracks[0].duration_ms, Some(10_000.0));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn parts_per_take_are_limited() {
        let (state, dir, ana, bea) = studio();
        for _ in 0..MAX_PARTS {
            new_part(&state, &ana).await;
        }
        let one_more = create(Path(1), State(state.clone()), headers(&ana, &NEW_PART)).await;
        assert_eq!(one_more.status(), StatusCode::FORBIDDEN);
        new_part(&state, &bea).await; // per Participant
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn nobody_touches_the_upload_of_another_participant() {
        let (state, dir, ana, bea) = studio();
        let id = new_part(&state, &ana).await;
        let head = head(Path(id.clone()), State(state.clone()), headers(&bea, &[])).await;
        assert_eq!(head.status(), StatusCode::NOT_FOUND);
        let write = patch(Path(id), State(state.clone()), patch_at(&bea, "0"), Body::from("x")).await;
        assert_eq!(write.status(), StatusCode::NOT_FOUND);
        let stranger = create(Path(1), State(state), headers("not-an-invitation", &NEW_PART)).await;
        assert_eq!(stranger.status(), StatusCode::FORBIDDEN);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn a_closed_room_receives_nothing_more() {
        let (state, dir, ana, _) = studio();
        let id = new_part(&state, &ana).await;
        {
            let rooms = state.rooms.lock().unwrap();
            let mut room = rooms[0].lock().unwrap();
            room.stop_take();
            room.close().unwrap();
        }
        let write = patch(Path(id), State(state.clone()), patch_at(&ana, "0"), Body::from("x")).await;
        assert_eq!(write.status(), StatusCode::FORBIDDEN);
        let more = create(Path(1), State(state), headers(&ana, &NEW_PART)).await;
        assert_eq!(more.status(), StatusCode::FORBIDDEN);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn a_track_cannot_exceed_the_maximum_size() {
        let (state, dir, ana, _) = studio();
        let too_big = (MAX_TRACK_BYTES + 1).to_string();
        let mut big = headers(&ana, &NEW_PART);
        big.remove("Upload-Defer-Length");
        big.insert("Upload-Length", too_big.parse().unwrap());
        assert_eq!(
            create(Path(1), State(state), big).await.status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_patch_writes_only_where_and_as_much_as_allowed() {
        let mut u = part(&[]);
        u.length = None;
        u.offset = 10;
        assert_eq!(u.check_patch(0, None), Err(StatusCode::CONFLICT));
        assert_eq!(u.check_patch(10, Some(5)), Err(StatusCode::BAD_REQUEST));
        assert_eq!(
            u.check_patch(10, Some(MAX_TRACK_BYTES + 1)),
            Err(StatusCode::BAD_REQUEST)
        );
        assert_eq!(u.check_patch(10, None), Ok(()));
        assert_eq!(u.check_patch(10, Some(20)), Ok(()));
        assert_eq!(u.length, Some(20));
        assert_eq!(u.check_patch(10, Some(30)), Err(StatusCode::BAD_REQUEST));
        u.busy = true;
        assert_eq!(u.check_patch(10, None), Err(StatusCode::CONFLICT));
    }

    #[test]
    fn too_few_or_absurd_marks_are_not_trusted() {
        assert_eq!(
            part(&[(0.0, 0), (10_000.0, 480_000), (20_000.0, 960_000)]).drift_ppm(),
            None
        );
        assert_eq!(
            part(&[(0.0, 0), (60_000.0, 2_900_000), (120_000.0, 5_800_000)]).drift_ppm(),
            None
        );
    }
}
