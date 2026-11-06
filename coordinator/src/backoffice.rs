//! Backoffice API behind the secret link `/backoffice/{token}`: create Rooms and Invitations
//! (CU1, CU2), close a Room (CU8), download it (CU9) and convert it to FLAC (CU10).
// shortcut: one shared secret instead of accounts; replace with real authentication (JWT planned).
// Handlers fail with a ready Response, axum's usual style; its size does not matter here.
#![allow(clippy::result_large_err)]

use std::sync::{Arc, Mutex};

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};

use crate::{
    AppState, Room, SharedRoom, download, flac,
    protocol::{BackofficeError, CreateInvitation, CreateRoom, FlacState, Role, RoomView},
};

fn check(state: &AppState, token: &str) -> Result<(), Response> {
    if token == state.backoffice_token {
        Ok(())
    } else {
        Err(StatusCode::NOT_FOUND.into_response())
    }
}

fn error(e: BackofficeError) -> Response {
    let status = match e {
        BackofficeError::InvalidName => StatusCode::BAD_REQUEST,
        _ => StatusCode::CONFLICT,
    };
    (status, Json(e)).into_response()
}

fn room(state: &AppState, id: &str) -> Result<SharedRoom, Response> {
    let rooms = state.rooms.lock().unwrap();
    rooms
        .iter()
        .find(|r| r.lock().unwrap().id == id)
        .cloned()
        .ok_or_else(|| StatusCode::NOT_FOUND.into_response())
}

/// Names are typed by hand: accept capitals, and spaces as dashes ("Prueba Sync" → "prueba-sync").
fn normalize(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join("-").to_lowercase()
}

pub async fn list(Path(token): Path<String>, State(state): State<AppState>) -> Result<Json<Vec<RoomView>>, Response> {
    check(&state, &token)?;
    let rooms = state.rooms.lock().unwrap();
    // Newest first.
    Ok(Json(rooms.iter().rev().map(|r| r.lock().unwrap().view()).collect()))
}

/// CU1: a new open Room, with its folder and the Host's Invitation.
pub async fn create_room(
    Path(token): Path<String>,
    State(state): State<AppState>,
    Json(req): Json<CreateRoom>,
) -> Result<Json<RoomView>, Response> {
    check(&state, &token)?;
    let (name, host) = (normalize(&req.name), normalize(&req.host));
    if !crate::room::valid_name(&name) {
        return Err(error(BackofficeError::InvalidName));
    }
    let base = format!("{name}_{}", crate::utc_date(crate::now_ms()));
    // Folders of earlier runs stay on disk: never reuse one. create_dir claims a name atomically, so
    // no lock is held for the disk work and other Rooms are not blocked meanwhile.
    let mut n = 1;
    let id = loop {
        let id = if n == 1 { base.clone() } else { format!("{base}-{n}") };
        match std::fs::create_dir(state.data.join(&id)) {
            Ok(()) => break id,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => n += 1,
            Err(e) => {
                eprintln!("cannot create {id}: {e}");
                return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
            }
        }
    };
    let mut room = Room::new(id.clone(), name, state.data.join(&id));
    if let Err(e) = room.invite(&host, Role::Host) {
        let _ = std::fs::remove_dir(&room.dir);
        return Err(error(e));
    }
    room.save_metadata();
    let view = room.view();
    state.rooms.lock().unwrap().push(Arc::new(Mutex::new(room)));
    Ok(Json(view))
}

/// CU2: an Invitation for a Guest.
pub async fn create_invitation(
    Path((token, id)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(req): Json<CreateInvitation>,
) -> Result<Json<RoomView>, Response> {
    check(&state, &token)?;
    let shared = room(&state, &id)?;
    let mut room = shared.lock().unwrap();
    room.invite(&normalize(&req.name), Role::Guest).map_err(error)?;
    room.save_metadata();
    Ok(Json(room.view()))
}

/// CU8: the backoffice warns about `pending` before calling this.
pub async fn close(
    Path((token, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Json<RoomView>, Response> {
    check(&state, &token)?;
    let shared = room(&state, &id)?;
    let mut room = shared.lock().unwrap();
    room.close().map_err(error)?;
    Ok(Json(room.view()))
}

/// CU9: the closed Room as one folder: every Track part, complete or not, and `room.json`.
pub async fn zip(
    Path((token, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Response, Response> {
    check(&state, &token)?;
    let shared = room(&state, &id)?;
    let room = shared.lock().unwrap();
    if !room.closed {
        return Err(error(BackofficeError::Open));
    }
    // Incomplete parts are kept: what reached the Coordinator is still usable audio.
    let entries = room
        .uploads
        .iter()
        .map(|u| u.file())
        .chain(["room.json".to_string()])
        .map(|f| (format!("{}/{f}", room.id), room.dir.join(f)))
        .collect();
    Ok(download::zip_response(entries, format!("{}.zip", room.id)))
}

/// CU10: starts converting every Track part of a closed Room to FLAC, in the background.
pub async fn convert_flac(
    Path((token, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Json<RoomView>, Response> {
    check(&state, &token)?;
    let shared = room(&state, &id)?;
    let mut room = shared.lock().unwrap();
    if !room.closed {
        return Err(error(BackofficeError::Open));
    }
    if matches!(room.flac, FlacState::None | FlacState::Failed) {
        room.flac = FlacState::Converting;
        let jobs = room
            .uploads
            .iter()
            .map(|u| flac::Job {
                ogg: room.dir.join(u.file()),
                flac: room.flac_path(u),
                drift_ppm: u.drift_ppm(),
            })
            .collect();
        let shared = shared.clone();
        tokio::spawn(async move {
            let result = flac::convert_all(jobs).await;
            let mut room = shared.lock().unwrap();
            room.flac = match result {
                Ok(()) => FlacState::Ready,
                Err(e) => {
                    eprintln!("{}: FLAC conversion failed: {e}", room.id);
                    FlacState::Failed
                }
            };
        });
    }
    Ok(Json(room.view()))
}

/// CU10: the converted Room, like the Ogg download but with FLAC files.
pub async fn flac_zip(
    Path((token, id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Response, Response> {
    check(&state, &token)?;
    let shared = room(&state, &id)?;
    let room = shared.lock().unwrap();
    if room.flac != FlacState::Ready {
        return Err(StatusCode::CONFLICT.into_response());
    }
    let entries = room
        .uploads
        .iter()
        .map(|u| (format!("{}/{}.flac", room.id, u.id), room.flac_path(u)))
        .chain([(format!("{}/room.json", room.id), room.dir.join("room.json"))])
        .collect();
    Ok(download::zip_response(entries, format!("{}_flac.zip", room.id)))
}
