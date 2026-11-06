//! Backoffice API behind the secret link `/backoffice/{token}`: create Rooms and Invitations
//! (CU1, CU2), close a Room (CU8), download it (CU9) and convert it to FLAC (CU10).
// shortcut: one shared secret instead of accounts; replace with real authentication (JWT planned).
// Handlers fail with a ready Response, axum's usual style; its size does not matter here.
#![allow(clippy::result_large_err)]

use std::sync::{Arc, Mutex};

use axum::{
    Json,
    extract::{FromRequestParts, Path, State},
    http::{StatusCode, header, request::Parts},
    response::{IntoResponse, Response},
};

use crate::{
    AppState, Room, SharedRoom, download, flac,
    protocol::{BackofficeError, CreateInvitation, CreateRoom, FlacState, Role, RoomView, SignIn},
    session,
};

/// A request from a signed-in backoffice. As an extractor, a handler cannot forget to check it.
pub struct Admin;

impl FromRequestParts<AppState> for Admin {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let subject = session::cookie(&parts.headers, session::ADMIN_COOKIE).and_then(|jwt| state.keys.verify(jwt));
        match subject {
            Some(s) if s == session::ADMIN_SUBJECT => Ok(Admin),
            _ => Err(StatusCode::UNAUTHORIZED.into_response()),
        }
    }
}

/// Signs in with `BACKOFFICE_TOKEN`: the token is sent once, in a body, never in a URL (ADR-0009).
pub async fn sign_in(State(state): State<AppState>, Json(req): Json<SignIn>) -> Response {
    if !session::same_secret(&req.token, &state.backoffice_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let jwt = state.keys.sign(session::ADMIN_SUBJECT, session::ADMIN_SECONDS);
    let cookie = session::set_cookie(session::ADMIN_COOKIE, &jwt, session::ADMIN_SECONDS);
    (StatusCode::NO_CONTENT, [(header::SET_COOKIE, cookie)]).into_response()
}

pub async fn sign_out() -> Response {
    let cookie = session::set_cookie(session::ADMIN_COOKIE, "", 0);
    (StatusCode::NO_CONTENT, [(header::SET_COOKIE, cookie)]).into_response()
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

pub async fn list(_: Admin, State(state): State<AppState>) -> Result<Json<Vec<RoomView>>, Response> {
    let rooms = state.rooms.lock().unwrap();
    // Newest first.
    Ok(Json(rooms.iter().rev().map(|r| r.lock().unwrap().view()).collect()))
}

/// CU1: a new open Room, with its folder and the Host's Invitation.
pub async fn create_room(
    _: Admin,
    State(state): State<AppState>,
    Json(req): Json<CreateRoom>,
) -> Result<Json<RoomView>, Response> {
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
    _: Admin,
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(req): Json<CreateInvitation>,
) -> Result<Json<RoomView>, Response> {
    let shared = room(&state, &id)?;
    let mut room = shared.lock().unwrap();
    room.invite(&normalize(&req.name), Role::Guest).map_err(error)?;
    room.save_metadata();
    Ok(Json(room.view()))
}

/// CU8: the backoffice warns about `pending` before calling this.
pub async fn close(
    _: Admin,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<RoomView>, Response> {
    let shared = room(&state, &id)?;
    let mut room = shared.lock().unwrap();
    room.close().map_err(error)?;
    Ok(Json(room.view()))
}

/// CU9: the closed Room as one folder: every Track part, complete or not, and `room.json`.
pub async fn zip(_: Admin, Path(id): Path<String>, State(state): State<AppState>) -> Result<Response, Response> {
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
    _: Admin,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<RoomView>, Response> {
    let shared = room(&state, &id)?;
    let mut room = shared.lock().unwrap();
    if !room.closed {
        return Err(error(BackofficeError::Open));
    }
    if matches!(room.flac, FlacState::None | FlacState::Failed) {
        room.flac = FlacState::Converting;
        let jobs = room.flac_jobs();
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
pub async fn flac_zip(_: Admin, Path(id): Path<String>, State(state): State<AppState>) -> Result<Response, Response> {
    let shared = room(&state, &id)?;
    let room = shared.lock().unwrap();
    if room.flac != FlacState::Ready {
        return Err(StatusCode::CONFLICT.into_response());
    }
    let entries = room
        .flac_files()
        .into_iter()
        .chain([(format!("{}/room.json", room.id), room.dir.join("room.json"))])
        .collect();
    Ok(download::zip_response(entries, format!("{}_flac.zip", room.id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Coordinator;
    use axum::http::Request;

    #[tokio::test]
    async fn the_backoffice_signs_in_once_and_then_uses_its_cookie() {
        let state: AppState = Arc::new(Coordinator {
            rooms: Mutex::new(vec![]),
            data: std::env::temp_dir(),
            backoffice_token: "s3cret".into(),
            keys: session::Keys::new(b"test"),
            turn: None,
        });
        let wrong = sign_in(State(state.clone()), Json(SignIn { token: "wrong".into() })).await;
        assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);
        let ok = sign_in(State(state.clone()), Json(SignIn { token: "s3cret".into() })).await;
        assert_eq!(ok.status(), StatusCode::NO_CONTENT);
        let set = ok.headers()[header::SET_COOKIE].to_str().unwrap().to_string();
        assert!(set.contains("HttpOnly") && set.contains("Secure") && set.contains("SameSite=Strict"));

        let parts = |cookie: Option<&str>| {
            let mut req = Request::builder();
            if let Some(c) = cookie {
                req = req.header(header::COOKIE, c);
            }
            req.body(()).unwrap().into_parts().0
        };
        let pair = set.split(';').next().unwrap();
        assert!(Admin::from_request_parts(&mut parts(Some(pair)), &state).await.is_ok());
        assert!(Admin::from_request_parts(&mut parts(None), &state).await.is_err());
        // A Participant's session, even signed with the right key, is not the backoffice's.
        let guest = format!("{}={}", session::ADMIN_COOKIE, state.keys.sign("r/ana", 60));
        assert!(
            Admin::from_request_parts(&mut parts(Some(&guest)), &state)
                .await
                .is_err()
        );
    }
}
