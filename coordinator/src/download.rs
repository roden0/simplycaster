//! Host downloads during the Room (one Track, or a Take as a zip) and the zip streaming
//! shared with the Room download in the backoffice (CU9).

use std::{
    io::{self, BufWriter, Write},
    path::PathBuf,
};

use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use tokio::sync::mpsc;

use crate::{AppState, WsParams};

/// Host only: one received Track.
pub async fn track(
    Path((take, file)): Path<(u32, String)>,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
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
    // shortcut: read whole into memory; stream it like the zips if single-Track downloads get used for long Takes.
    let data = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let disposition = format!("attachment; filename=\"{file}\"");
    Ok((
        [
            (header::CONTENT_TYPE, "audio/ogg".to_string()),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        data,
    )
        .into_response())
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
