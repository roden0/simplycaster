//! Host downloads during the Room (one Track, or a Take as a zip) and the zip streaming
//! shared with the Room download in the backoffice (CU9).

use std::{
    io::{self, BufWriter, Write},
    path::PathBuf,
};

use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, Request, State},
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use tokio::sync::mpsc;
use tower_http::services::ServeFile;

use crate::AppState;
use crate::ws::WsParams;

/// Host only: one received Track.
pub async fn track(
    Path((take, file)): Path<(u32, String)>,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
    request: Request,
) -> Result<Response, StatusCode> {
    let shared = state.host_room(&params.invite).ok_or(StatusCode::FORBIDDEN)?;
    // Only files listed for the Take are served, so the URL cannot reach anything else on disk.
    let path = {
        let room = shared.lock().unwrap();
        if take == 0 || take > room.take_count() {
            return Err(StatusCode::NOT_FOUND);
        }
        let tr = room.take_tracks(take).into_iter().find(|tr| tr.file == file);
        room.dir.join(tr.ok_or(StatusCode::NOT_FOUND)?.file)
    };
    let file = path.file_name().unwrap().to_string_lossy().into_owned();
    // Streamed from disk in chunks, with Range support: a Track of 1 h is about 115 MB.
    let mut response = ServeFile::new(&path)
        .try_call(request)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Body::new);
    // The name was built by the Coordinator from validated names, so it is a safe header value.
    let disposition = HeaderValue::from_str(&format!("attachment; filename=\"{file}\""))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    response.headers_mut().insert(header::CONTENT_DISPOSITION, disposition);
    Ok(response)
}

/// Host only: every Track of a Take received so far, with `room.json`.
pub async fn take_zip(
    Path(take): Path<u32>,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
) -> Result<Response, StatusCode> {
    let shared = state.host_room(&params.invite).ok_or(StatusCode::FORBIDDEN)?;
    let room = shared.lock().unwrap();
    if take == 0 || take > room.take_count() {
        return Err(StatusCode::NOT_FOUND);
    }
    let entries = room
        .take_tracks(take)
        .into_iter()
        .map(|tr| tr.file)
        .chain(["room.json".to_string()])
        .map(|f| (f.clone(), room.dir.join(f)))
        .collect();
    Ok(zip_response(entries, format!("{}_t{take:02}.zip", room.id)))
}

/// Streams an uncompressed zip (Opus is already compressed) of `(name in the zip, file on disk)`,
/// so a Room of several GB never sits in memory.
pub fn zip_response(entries: Vec<(String, PathBuf)>, download_name: String) -> Response {
    let (tx, rx) = mpsc::channel::<io::Result<Bytes>>(8);
    let name = download_name.clone();
    tokio::task::spawn_blocking(move || {
        let result = (|| -> zip::result::ZipResult<()> {
            let mut zip = zip::ZipWriter::new_stream(BufWriter::with_capacity(1 << 18, ChannelWriter(tx.clone())));
            for (entry, path) in &entries {
                let mut file = std::fs::File::open(path)?;
                let large = file.metadata()?.len() >= u64::from(u32::MAX);
                let options = zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored)
                    .large_file(large);
                zip.start_file(entry.as_str(), options)?;
                io::copy(&mut file, &mut zip)?;
            }
            zip.finish()?.flush()?;
            Ok(())
        })();
        if let Err(e) = result {
            eprintln!("zip {name} failed: {e}");
            // Ends the response with an error, so the browser shows the download as failed, not as a short zip.
            let _ = tx.blocking_send(Err(io::Error::other(e.to_string())));
        }
    });
    let stream = futures_util::stream::unfold(rx, |mut rx| async { rx.recv().await.map(|item| (item, rx)) });
    (
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{download_name}\""),
            ),
        ],
        Body::from_stream(stream),
    )
        .into_response()
}

/// Hands the zip bytes from the blocking thread to the response body.
struct ChannelWriter(mpsc::Sender<io::Result<Bytes>>);

impl Write for ChannelWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0
            .blocking_send(Ok(Bytes::copy_from_slice(buf)))
            .map_err(|_| io::Error::other("download cancelled"))?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Role;
    use crate::{Coordinator, Room, tus};
    use std::sync::{Arc, Mutex};

    async fn get(state: &AppState, host: &str, file: &str, range: Option<&str>) -> Response {
        let mut req = Request::builder().uri(format!("/takes/1/tracks/{file}"));
        if let Some(r) = range {
            req = req.header(header::RANGE, r);
        }
        let params = WsParams { invite: host.into() };
        match track(
            Path((1, file.into())),
            Query(params),
            State(state.clone()),
            req.body(Body::empty()).unwrap(),
        )
        .await
        {
            Ok(r) => r,
            Err(status) => status.into_response(),
        }
    }

    #[tokio::test]
    async fn the_host_downloads_a_listed_track_in_ranges() {
        let dir = std::env::temp_dir().join(crate::random_token());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("t01_ana.ogg"), b"OggS-audio").unwrap();
        std::fs::write(dir.join("secret.txt"), b"no").unwrap();
        let mut room = Room::new("r_2026-11-06".into(), "r".into(), dir.clone());
        room.invite("host", Role::Host).unwrap();
        room.start_take();
        let saved = r#"{"participant":"ana","part":1,"file":"t01_ana.ogg","complete":true,"bytes":10,"startTime":0,"sampleRate":48000}"#;
        room.uploads
            .push(tus::Upload::from_file(1, serde_json::from_str(saved).unwrap()));
        let host = room.participants[0].token.clone();
        let state: AppState = Arc::new(Coordinator {
            rooms: Mutex::new(vec![Arc::new(Mutex::new(room))]),
            data: dir.clone(),
            backoffice_token: "admin".into(),
            turn: None,
        });

        let part = get(&state, &host, "t01_ana.ogg", Some("bytes=0-3")).await;
        assert_eq!(part.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(part.headers()[header::CONTENT_TYPE], "audio/ogg");
        assert_eq!(
            part.headers()[header::CONTENT_DISPOSITION],
            "attachment; filename=\"t01_ana.ogg\""
        );
        let body = axum::body::to_bytes(part.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], b"OggS");
        assert_eq!(
            get(&state, &host, "secret.txt", None).await.status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            get(&state, "guest", "t01_ana.ogg", None).await.status(),
            StatusCode::FORBIDDEN
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
