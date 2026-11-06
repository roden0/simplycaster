//! The WebSocket of each Participant: the roster, the Takes, the clock, drift marks and live signalling.

use axum::{
    Json,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;

use crate::protocol::{ClientMessage, IceServer, Join, ServerMessage, Session};
use crate::session;
use crate::{AppState, MAX_WS_MESSAGE_BYTES, SharedRoom, live, now_ms};

#[derive(Deserialize)]
/// Which Participant session a request uses; the cookie of that name proves it (ADR-0009).
pub struct SessionQuery {
    pub room: String,
    pub name: String,
}

/// Exchanges an Invitation for the session cookie of its Participant. Called on every page load, so
/// reopening the link renews the session; returns the query that `/ws` and the downloads take.
pub async fn join(State(state): State<AppState>, Json(req): Json<Join>) -> Response {
    let Some((room, name, _)) = state.by_invite(&req.invite) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let room = room.lock().unwrap().id.clone();
    let jwt = state.keys.sign(&format!("{room}/{name}"), session::PARTICIPANT_SECONDS);
    let cookie = session::set_cookie(
        &session::participant_cookie(&room, &name),
        &jwt,
        session::PARTICIPANT_SECONDS,
    );
    ([(header::SET_COOKIE, cookie)], Json(Session { room, name })).into_response()
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<SessionQuery>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    let Some((room, _)) = state.by_session(&headers, &q.room, &q.name) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let name = q.name;
    let ice_servers = state.turn.as_ref().map(live::Turn::ice_servers).unwrap_or_default();
    ws.max_message_size(MAX_WS_MESSAGE_BYTES)
        .max_frame_size(MAX_WS_MESSAGE_BYTES)
        .on_upgrade(move |socket| handle_socket(socket, name, room, ice_servers))
}

/// Only transport here: the rules of what each message does live in `Room` and are tested there.
async fn handle_socket(socket: WebSocket, name: String, shared: SharedRoom, ice_servers: Vec<IceServer>) {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let (conn_id, role, room_id) = {
        let mut room = shared.lock().unwrap();
        let (conn_id, role) = room.connect(&name, tx.clone(), ice_servers);
        (conn_id, role, room.id.clone())
    };

    let (mut sink, mut stream) = socket.split();
    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let text = serde_json::to_string(&msg).unwrap();
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
            if matches!(msg, ServerMessage::Replaced | ServerMessage::RoomClosed) {
                let _ = sink.close().await;
                break;
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        let Message::Text(text) = msg else { continue };
        let Ok(msg) = serde_json::from_str::<ClientMessage>(&text) else {
            // Never the whole message: it comes from outside.
            let start: String = text.chars().take(200).collect();
            eprintln!(
                "{room_id} {name}: ignoring a malformed message of {} bytes: {start}",
                text.len()
            );
            continue;
        };
        match msg {
            // Answered without the Room lock, so contention never skews the clock estimate.
            ClientMessage::Ping { client_time } => {
                let _ = tx.send(ServerMessage::Pong {
                    client_time,
                    coordinator_time: now_ms(),
                });
            }
            msg => shared.lock().unwrap().on_message(&name, role, msg),
        }
    }

    writer.abort();
    shared.lock().unwrap().disconnect(&name, conn_id);
}
