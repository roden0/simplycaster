//! The WebSocket of each Participant: the roster, the Takes, the clock, drift marks and live signalling.

use axum::{
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;

use crate::protocol::{ClientMessage, IceServer, ParticipantStatus, Role, ServerMessage};
use crate::{AppState, MAX_SIGNAL_BYTES, MAX_WS_MESSAGE_BYTES, SharedRoom, live, now_ms, tus};

#[derive(Deserialize)]
pub struct WsParams {
    pub invite: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
) -> Response {
    let Some((room, name, _)) = state.by_invite(&params.invite) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let ice_servers = state.turn.as_ref().map(live::Turn::ice_servers).unwrap_or_default();
    ws.max_message_size(MAX_WS_MESSAGE_BYTES)
        .max_frame_size(MAX_WS_MESSAGE_BYTES)
        .on_upgrade(move |socket| handle_socket(socket, name, room, ice_servers))
}

async fn handle_socket(socket: WebSocket, name: String, shared: SharedRoom, ice_servers: Vec<IceServer>) {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let (conn_id, role, room_id) = {
        let mut room = shared.lock().unwrap();
        room.next_conn_id += 1;
        let conn_id = room.next_conn_id;
        let tone_hz = room.tone_hz(&name);
        let p = room.find(&name).unwrap();
        // A new connection with the same Invitation replaces the old one (reconnect, CU7);
        // the old one is told and closed, so it does not linger without updates.
        if let Some((_, old)) = p.conn.replace((conn_id, tx.clone())) {
            let _ = old.send(ServerMessage::Replaced);
        }
        p.view.status = ParticipantStatus::Connected;
        p.view.mic_problem = None;
        let _ = tx.send(ServerMessage::Welcome {
            name: name.clone(),
            role: p.view.role,
            tone_hz,
            ice_servers,
        });
        let role = p.view.role;
        // Catch up with the current Take (CU7): keep recording in a new part, or stop.
        if let Some(t) = room.takes.last() {
            let take = room.take_count();
            let _ = tx.send(match t.stop_time {
                None => ServerMessage::TakeStarted {
                    take,
                    start_time: t.start_time,
                },
                Some(stop_time) => ServerMessage::TakeStopped { take, stop_time },
            });
        }
        if role == Role::Host {
            for take in 1..=room.take_count() {
                let _ = tx.send(room.take_tracks_message(take));
            }
        }
        room.broadcast_roster();
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
            ClientMessage::Ping { client_time } => {
                let _ = tx.send(ServerMessage::Pong {
                    client_time,
                    coordinator_time: now_ms(),
                });
            }
            ClientMessage::ClockOffset { offset_ms, rtt_ms } => {
                let mut room = shared.lock().unwrap();
                let p = room.find(&name).unwrap();
                p.view.clock_offset_ms = Some(offset_ms);
                p.view.clock_rtt_ms = Some(rtt_ms);
                room.broadcast_roster();
            }
            ClientMessage::MicStatus { problem } => {
                let mut room = shared.lock().unwrap();
                room.find(&name).unwrap().view.mic_problem = problem;
                room.broadcast_roster();
            }
            ClientMessage::DriftMark {
                take,
                samples,
                coordinator_time,
                clock_offset_ms,
                clock_rtt_ms,
            } => {
                let mut room = shared.lock().unwrap();
                // Marks belong to the part being recorded: the latest one of this Participant.
                if let Some(u) = room
                    .uploads
                    .iter_mut()
                    .rev()
                    .find(|u| u.take == take && u.participant == name)
                {
                    u.drift_marks.push(tus::DriftMark {
                        samples,
                        coordinator_time,
                        clock_offset_ms,
                        clock_rtt_ms,
                    });
                }
            }
            ClientMessage::Signal { to, data } => {
                if data.len() > MAX_SIGNAL_BYTES {
                    eprintln!("{room_id} {name}: ignoring a signal of {} bytes", data.len());
                    continue;
                }
                let room = shared.lock().unwrap();
                let peer = room.participants.iter().find(|p| p.view.name == to);
                if let Some((_, tx)) = peer.and_then(|p| p.conn.as_ref()) {
                    let _ = tx.send(ServerMessage::Signal {
                        from: name.clone(),
                        data,
                    });
                }
            }
            ClientMessage::Record | ClientMessage::Stop if role != Role::Host => {
                eprintln!("{room_id} {name}: only the Host can record or stop");
            }
            ClientMessage::Record => shared.lock().unwrap().start_take(),
            ClientMessage::Stop => shared.lock().unwrap().stop_take(),
        }
    }

    writer.abort();
    let mut room = shared.lock().unwrap();
    let p = room.find(&name).unwrap();
    // Only mark disconnected if no newer connection took over.
    if p.conn.as_ref().is_some_and(|(id, _)| *id == conn_id) {
        p.conn = None;
        p.view.status = ParticipantStatus::Disconnected;
        room.broadcast_roster();
    }
}
