//! Backoffice API for signed-in Accounts (ADR-0011): create Rooms and Invitations (CU1, CU2), close a
//! Room (CU8), download it (CU9), convert it to FLAC (CU10) and delete it.
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
    AppState, Room, SharedRoom,
    accounts_api::{SignedIn, error},
    download, flac,
    protocol::{BackofficeError, CreateInvitation, CreateRoom, FlacState, Role, RoomView},
};

/// Same limit as `valid_name`, which has the last word.
const MAX_SLUG: usize = 40;
const MAX_DISPLAY_NAME: usize = 120;

/// A Room this Account may manage. Someone else's looks just like one that does not exist.
fn room(state: &AppState, id: &str, who: &SignedIn) -> Result<SharedRoom, Response> {
    let rooms = state.rooms.lock().unwrap();
    rooms
        .iter()
        .find(|r| {
            let room = r.lock().unwrap();
            room.id == id && who.can_manage(room.creator.as_deref())
        })
        .cloned()
        .ok_or_else(|| StatusCode::NOT_FOUND.into_response())
}

/// Names are typed by hand: accept capitals, and spaces as dashes ("Prueba Sync" → "prueba-sync").
fn normalize(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join("-").to_lowercase()
}

/// The slug of a free-text Room name: "Mi programa S01E01 - temática" → "mi-programa-s01e01-tematica".
/// May be empty or end up invalid; `valid_name` decides.
fn slug(text: &str) -> String {
    let mut out = String::new();
    for c in text.to_lowercase().chars() {
        let c = match c {
            'á' | 'à' | 'ä' | 'â' | 'ã' | 'å' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            'ç' => 'c',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.truncate(MAX_SLUG);
    out.trim_end_matches('-').to_string()
}

fn valid_display_name(name: &str) -> bool {
    (1..=MAX_DISPLAY_NAME).contains(&name.chars().count()) && !name.chars().any(char::is_control)
}

pub async fn list(who: SignedIn, State(state): State<AppState>) -> Result<Json<Vec<RoomView>>, Response> {
    let rooms = state.rooms.lock().unwrap();
    let mine = |room: &&SharedRoom| who.can_manage(room.lock().unwrap().creator.as_deref());
    // Newest first.
    Ok(Json(
        rooms
            .iter()
            .rev()
            .filter(mine)
            .map(|r| r.lock().unwrap().view())
            .collect(),
    ))
}

/// CU1: a new open Room, with its folder and the Host's Invitation.
pub async fn create_room(
    who: SignedIn,
    State(state): State<AppState>,
    Json(req): Json<CreateRoom>,
) -> Result<Json<RoomView>, Response> {
    let (display_name, name, host) = (req.name.trim(), slug(&req.name), normalize(&req.host));
    if !crate::room::valid_name(&name) || !valid_display_name(display_name) {
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
    room.display_name = Some(display_name.into());
    room.uuid = Some(uuid::Uuid::now_v7().to_string());
    room.creator = Some(who.id);
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
    who: SignedIn,
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(req): Json<CreateInvitation>,
) -> Result<Json<RoomView>, Response> {
    let shared = room(&state, &id, &who)?;
    let mut room = shared.lock().unwrap();
    room.invite(&normalize(&req.name), Role::Guest).map_err(error)?;
    room.save_metadata();
    Ok(Json(room.view()))
}

/// CU8: the backoffice warns about `pending` before calling this.
pub async fn close(
    who: SignedIn,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<RoomView>, Response> {
    let shared = room(&state, &id, &who)?;
    let mut room = shared.lock().unwrap();
    room.close().map_err(error)?;
    Ok(Json(room.view()))
}

/// Deletes a closed Room for good: never one that could still be recording or converting. Its folder goes
/// after the locks are released, because deleting hours of audio is slow.
pub async fn delete_room(
    who: SignedIn,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, Response> {
    let dir = {
        let mut rooms = state.rooms.lock().unwrap();
        let found = rooms.iter().position(|r| r.lock().unwrap().id == id);
        let i = found.ok_or_else(|| StatusCode::NOT_FOUND.into_response())?;
        let shared = rooms[i].clone();
        let room = shared.lock().unwrap();
        if !who.can_manage(room.creator.as_deref()) {
            return Err(StatusCode::NOT_FOUND.into_response());
        }
        if !room.closed {
            return Err(error(BackofficeError::Open));
        }
        if room.flac == FlacState::Converting {
            return Err(error(BackofficeError::Converting));
        }
        rooms.remove(i);
        room.dir.clone()
    };
    let removed = tokio::task::spawn_blocking(move || crate::room_file::remove_room(&dir)).await;
    match removed {
        Ok(Ok(())) => Ok(StatusCode::NO_CONTENT),
        other => {
            eprintln!("{id}: cannot delete the Room: {other:?}");
            Err(StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
    }
}

/// Deletes one Take of a closed Room, Tracks and FLACs, for good. Like a whole Room: never while
/// converting, and the files go after the lock is released.
pub async fn delete_take(
    who: SignedIn,
    Path((id, take)): Path<(String, u32)>,
    State(state): State<AppState>,
) -> Result<Json<RoomView>, Response> {
    let shared = room(&state, &id, &who)?;
    let (files, view) = {
        let mut room = shared.lock().unwrap();
        if !room.has_take(take) {
            return Err(StatusCode::NOT_FOUND.into_response());
        }
        (room.delete_take(take).map_err(error)?, room.view())
    };
    tokio::task::spawn_blocking(move || {
        for f in files {
            if let Err(e) = std::fs::remove_file(&f)
                && e.kind() != std::io::ErrorKind::NotFound
            {
                eprintln!("{}: cannot delete: {e}", f.display());
            }
        }
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())?;
    Ok(Json(view))
}

/// CU9: the closed Room as one folder: every Track part, complete or not, and `room.json`.
pub async fn zip(who: SignedIn, Path(id): Path<String>, State(state): State<AppState>) -> Result<Response, Response> {
    let shared = room(&state, &id, &who)?;
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
    who: SignedIn,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<RoomView>, Response> {
    let shared = room(&state, &id, &who)?;
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
pub async fn flac_zip(
    who: SignedIn,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Response, Response> {
    let shared = room(&state, &id, &who)?;
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
    use crate::accounts_api::{Admin, sign_in};
    use crate::protocol::{AccountRole, SignIn};
    use crate::session;
    use axum::extract::FromRequestParts;
    use axum::http::{Request, header};
    use std::path::PathBuf;

    fn coordinator() -> (AppState, PathBuf) {
        let dir = std::env::temp_dir().join(crate::random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let state = Arc::new(Coordinator {
            rooms: Mutex::new(vec![]),
            data: dir.clone(),
            backoffice_token: "s3cret".into(),
            keys: session::Keys::new(b"test"),
            turn: None,
            accounts: crate::accounts::Accounts::load_or_create(&dir).unwrap(),
            webauthn: None,
            logins: Default::default(),
            registrations: Default::default(),
        });
        (state, dir)
    }

    fn parts(cookie: Option<&str>) -> axum::http::request::Parts {
        let mut req = Request::builder();
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        req.body(()).unwrap().into_parts().0
    }

    fn host(id: &str) -> SignedIn {
        SignedIn {
            id: id.into(),
            role: AccountRole::Host,
        }
    }

    fn admin() -> SignedIn {
        SignedIn {
            id: "admin".into(),
            role: AccountRole::Admin,
        }
    }

    async fn new_room(state: &AppState, who: SignedIn, name: &str) -> RoomView {
        let req = CreateRoom {
            name: name.into(),
            host: "host".into(),
        };
        create_room(who, State(state.clone()), Json(req)).await.unwrap().0
    }

    async fn delete(state: &AppState, who: SignedIn, id: &str) -> Result<StatusCode, StatusCode> {
        delete_room(who, Path(id.into()), State(state.clone()))
            .await
            .map_err(|r| r.status())
    }

    async fn visible(state: &AppState, who: SignedIn) -> Vec<String> {
        let rooms = list(who, State(state.clone())).await.unwrap().0;
        rooms.into_iter().map(|r| r.id).collect()
    }

    #[tokio::test]
    async fn the_token_signs_in_as_the_initial_admin_until_that_account_is_gone() {
        let (state, dir) = coordinator();
        let wrong = sign_in(State(state.clone()), Json(SignIn { token: "wrong".into() })).await;
        assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);
        let ok = sign_in(State(state.clone()), Json(SignIn { token: "s3cret".into() })).await;
        assert_eq!(ok.status(), StatusCode::NO_CONTENT);
        let set = ok.headers()[header::SET_COOKIE].to_str().unwrap().to_string();
        assert!(set.contains("HttpOnly") && set.contains("Secure") && set.contains("SameSite=Strict"));
        let pair = set.split(';').next().unwrap();
        assert!(Admin::from_request_parts(&mut parts(Some(pair)), &state).await.is_ok());
        assert!(Admin::from_request_parts(&mut parts(None), &state).await.is_err());

        // A Participant's session, even signed with the right key, is not an Account's.
        let guest = format!("{}={}", session::ACCOUNT_COOKIE, state.keys.sign("r/ana", 60));
        assert!(
            SignedIn::from_request_parts(&mut parts(Some(&guest)), &state)
                .await
                .is_err()
        );

        // Without its Account the token is retired, and the live session ends on its next request.
        let id = state.accounts.initial_id().unwrap();
        state.accounts.remove_for_test(&id);
        let again = sign_in(State(state.clone()), Json(SignIn { token: "s3cret".into() })).await;
        assert_eq!(again.status(), StatusCode::UNAUTHORIZED);
        assert!(
            SignedIn::from_request_parts(&mut parts(Some(pair)), &state)
                .await
                .is_err()
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn a_host_is_forbidden_what_only_an_admin_may_do() {
        let (state, dir) = coordinator();
        let token = state
            .accounts
            .create("Ana", "ana@example.com", AccountRole::Host)
            .unwrap();
        let ana = state.accounts.enrolling(&token).unwrap().id;
        let subject = format!("{}{ana}", session::ACCOUNT_PREFIX);
        let cookie = format!("{}={}", session::ACCOUNT_COOKIE, state.keys.sign(&subject, 60));
        assert!(
            SignedIn::from_request_parts(&mut parts(Some(&cookie)), &state)
                .await
                .is_ok()
        );
        let refused = Admin::from_request_parts(&mut parts(Some(&cookie)), &state).await;
        assert_eq!(refused.err().unwrap().status(), StatusCode::FORBIDDEN);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn each_host_sees_their_rooms_and_an_admin_sees_all() {
        let (state, dir) = coordinator();
        let ana = new_room(&state, host("ana"), "Mi programa").await;
        let bea = new_room(&state, host("bea"), "Mi programa").await;
        assert_ne!(ana.id, bea.id);
        assert_eq!(visible(&state, host("ana")).await, std::slice::from_ref(&ana.id));
        assert_eq!(visible(&state, host("bea")).await, std::slice::from_ref(&bea.id));
        assert_eq!(visible(&state, admin()).await.len(), 2);

        let denied = close(host("bea"), Path(ana.id.clone()), State(state.clone())).await;
        assert_eq!(denied.err().unwrap().status(), StatusCode::NOT_FOUND);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn a_room_without_creator_is_only_for_admins() {
        let (state, dir) = coordinator();
        let view = new_room(&state, host("ana"), "antigua").await;
        state.rooms.lock().unwrap()[0].lock().unwrap().creator = None;
        assert!(visible(&state, host("ana")).await.is_empty());
        assert_eq!(visible(&state, admin()).await, [view.id]);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn only_a_closed_room_not_converting_can_be_deleted() {
        let (state, dir) = coordinator();
        let view = new_room(&state, host("ana"), "borrar").await;
        let folder = dir.join(&view.id);
        assert_eq!(delete(&state, host("ana"), &view.id).await, Err(StatusCode::CONFLICT));
        assert_eq!(delete(&state, host("bea"), &view.id).await, Err(StatusCode::NOT_FOUND));
        let _ = close(host("ana"), Path(view.id.clone()), State(state.clone()))
            .await
            .unwrap();

        let shared = state.rooms.lock().unwrap()[0].clone();
        shared.lock().unwrap().flac = FlacState::Converting;
        assert_eq!(delete(&state, host("ana"), &view.id).await, Err(StatusCode::CONFLICT));
        shared.lock().unwrap().flac = FlacState::None;

        assert!(folder.is_dir());
        assert_eq!(delete(&state, host("ana"), &view.id).await, Ok(StatusCode::NO_CONTENT));
        assert!(!folder.exists());
        assert!(visible(&state, admin()).await.is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn a_take_of_a_closed_room_is_deleted_without_renumbering_the_others() {
        let (state, dir) = coordinator();
        let view = new_room(&state, host("ana"), "tomas").await;
        let shared = state.rooms.lock().unwrap()[0].clone();
        let file = |take: u32| shared.lock().unwrap().dir.join(format!("t{take}_host.ogg"));
        {
            let mut room = shared.lock().unwrap();
            for take in 1..=3 {
                room.start_take();
                room.stop_take();
                let saved = format!(
                    r#"{{"participant":"host","part":1,"file":"t{take}_host.ogg","complete":true,"bytes":3,
                    "startTime":0,"sampleRate":48000}}"#
                );
                room.uploads.push(crate::tus::Upload::from_file(
                    take,
                    serde_json::from_str(&saved).unwrap(),
                ));
                std::fs::write(room.dir.join(format!("t{take}_host.ogg")), "ogg").unwrap();
            }
            std::fs::create_dir_all(room.dir.join("flac")).unwrap();
            std::fs::write(room.flac_path(2, "host"), "flac").unwrap();
        }
        let del = |who: SignedIn, take: u32| delete_take(who, Path((view.id.clone(), take)), State(state.clone()));
        assert_eq!(del(host("ana"), 2).await.unwrap_err().status(), StatusCode::CONFLICT);
        let _ = close(host("ana"), Path(view.id.clone()), State(state.clone()))
            .await
            .unwrap();
        shared.lock().unwrap().flac = FlacState::Converting;
        assert_eq!(del(host("ana"), 2).await.unwrap_err().status(), StatusCode::CONFLICT);
        shared.lock().unwrap().flac = FlacState::Ready;
        assert_eq!(del(host("bea"), 2).await.unwrap_err().status(), StatusCode::NOT_FOUND);
        assert_eq!(del(host("ana"), 9).await.unwrap_err().status(), StatusCode::NOT_FOUND);

        let after = del(host("ana"), 2).await.unwrap().0;
        assert_eq!(after.take_numbers, [1, 3]);
        assert_eq!(after.flac, FlacState::Ready);
        assert!(!file(2).exists() && !shared.lock().unwrap().flac_path(2, "host").exists());
        assert!(file(1).exists() && file(3).exists());
        assert_eq!(del(admin(), 2).await.unwrap_err().status(), StatusCode::NOT_FOUND);

        // After a restart Take 3 is still Take 3, with its Track.
        let loaded = crate::room::Room::load(shared.lock().unwrap().dir.clone()).unwrap();
        assert_eq!(loaded.view().take_numbers, [1, 3]);
        assert!(loaded.uploads.iter().any(|u| u.take == 3 && u.file() == "t3_host.ogg"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn a_room_keeps_its_creator_and_names_after_a_restart() {
        let (state, dir) = coordinator();
        let view = new_room(&state, host("ana"), "Mi programa S01E01 - temática").await;
        assert_eq!(view.display_name, "Mi programa S01E01 - temática");
        assert_eq!(view.name, "mi-programa-s01e01-tematica");
        let loaded = Room::load(dir.join(&view.id)).unwrap();
        assert_eq!(loaded.creator.as_deref(), Some("ana"));
        assert_eq!(loaded.display_name.as_deref(), Some("Mi programa S01E01 - temática"));
        assert!(loaded.uuid.is_some());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn slugs_are_valid_names_or_empty() {
        assert_eq!(slug("Prueba Sync"), "prueba-sync");
        assert_eq!(slug("  ¡Ñandú!  --  Año 1 "), "nandu-ano-1");
        assert_eq!(slug("¿¿??"), "");
        assert_eq!(slug(&"a".repeat(50)).len(), MAX_SLUG);
        // Cut at the limit, it does not end in a dash.
        let cut = slug(&format!("{} b", "a".repeat(MAX_SLUG - 1)));
        assert!(cut.len() < MAX_SLUG && crate::room::valid_name(&cut));
    }

    #[tokio::test]
    async fn a_name_without_any_usable_letter_is_refused() {
        let (state, dir) = coordinator();
        let req = CreateRoom {
            name: "¿¿??".into(),
            host: "host".into(),
        };
        let refused = create_room(host("ana"), State(state.clone()), Json(req)).await;
        assert_eq!(refused.err().unwrap().status(), StatusCode::BAD_REQUEST);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
