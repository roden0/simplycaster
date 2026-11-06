mod backoffice;
mod download;
mod flac;
mod live;
mod protocol;
mod room;
mod room_file;
mod tus;

use std::{
    io::Read,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::http::{HeaderValue, header};
use axum::{
    Router,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use tower_http::{
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
};

use room::{Room, track_stem};

use protocol::{ClientMessage, IceServer, ParticipantStatus, Role, ServerMessage};

/// Upper bound for one uploaded Track, so a client cannot fill the disk.
const MAX_TRACK_BYTES: u64 = 4 << 30;
/// WebRTC offers and candidates are a few KB; anything bigger is not signalling.
const MAX_SIGNAL_BYTES: usize = 64 << 10;
/// Largest WebSocket message: a signal plus its JSON envelope. tungstenite's default is 64 MiB.
const MAX_WS_MESSAGE_BYTES: usize = 2 * MAX_SIGNAL_BYTES;

/// Every Room folder in `data` with a `room.json`, oldest first.
fn load_rooms(data: &std::path::Path) -> Vec<SharedRoom> {
    let mut rooms: Vec<Room> = std::fs::read_dir(data)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().join("room.json").is_file())
        .filter_map(|e| {
            Room::load(e.path())
                .inspect_err(|err| eprintln!("skipping {}: {err}", e.path().display()))
                .ok()
        })
        .collect();
    rooms.sort_by(|a, b| (&a.created, &a.id).cmp(&(&b.created, &b.id)));
    rooms.into_iter().map(|r| Arc::new(Mutex::new(r))).collect()
}

type SharedRoom = Arc<Mutex<Room>>;

pub struct Coordinator {
    /// Lock order: this list, then a Room; never the list while holding a Room.
    // shortcut: a restart brings Rooms back from room.json closed, since Invitations are not saved;
    // save them too if open Rooms must survive a redeploy.
    rooms: Mutex<Vec<SharedRoom>>,
    data: PathBuf,
    backoffice_token: String,
    /// STUN/TURN for the live conversation (ADR-0005); `None` when not configured.
    turn: Option<live::Turn>,
}

type AppState = Arc<Coordinator>;

impl Coordinator {
    /// The open Room behind an Invitation link token, and the Participant's fixed name and role.
    fn by_invite(&self, token: &str) -> Option<(SharedRoom, String, Role)> {
        for shared in self.rooms.lock().unwrap().iter() {
            let room = shared.lock().unwrap();
            if room.closed {
                continue;
            }
            if let Some(p) = room.participants.iter().find(|p| p.token == token) {
                return Some((shared.clone(), p.view.name.clone(), p.view.role));
            }
        }
        None
    }

    fn host_room(&self, token: &str) -> Option<SharedRoom> {
        self.by_invite(token)
            .and_then(|(room, _, role)| (role == Role::Host).then_some(room))
    }
}

/// 128 random bits, hex: the secret of a link.
fn random_token() -> String {
    // shortcut: /dev/urandom exists on Linux and macOS only; use the getrandom crate if Windows matters.
    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .expect("cannot read /dev/urandom");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64() * 1000.0
}

/// `YYYY-MM-DD` (UTC) of a Unix time in ms, with Howard Hinnant's days-to-civil algorithm.
fn utc_date(ms: f64) -> String {
    let z = (ms / 86_400_000.0).floor() as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

#[derive(Deserialize)]
struct WsParams {
    invite: String,
}

async fn ws_handler(ws: WebSocketUpgrade, Query(params): Query<WsParams>, State(state): State<AppState>) -> Response {
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

/// The backoffice secret. Without `BACKOFFICE_TOKEN` it is the guessable `admin`, allowed only on loopback:
/// listening anywhere else, the Coordinator refuses to start rather than expose the backoffice (ADR-0006 A3).
fn backoffice_token(token: Option<String>, ip: IpAddr) -> Result<String, String> {
    // Empty counts as unset: docker-compose passes `BACKOFFICE_TOKEN=` when .env leaves it blank.
    match token.filter(|t| !t.is_empty()) {
        Some(t) => Ok(t),
        None if ip.is_loopback() => Ok("admin".into()),
        None => Err(format!(
            "BACKOFFICE_TOKEN is required when listening on {ip}; generate one with: openssl rand -hex 16"
        )),
    }
}

#[tokio::main]
async fn main() {
    // shortcut: static files are read from disk next to the repo; embed them in the binary before distributing.
    let dist = std::env::var("CLIENT_DIST")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../client/dist"));
    let static_files = ServeDir::new(&dist).fallback(ServeFile::new(dist.join("index.html")));

    let data = std::env::var("DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("data"));
    std::fs::create_dir_all(&data).expect("cannot create the data folder");

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);
    // Loopback by default; the Docker image sets BIND=0.0.0.0 behind the platform's HTTPS proxy.
    let ip: IpAddr = std::env::var("BIND")
        .ok()
        .and_then(|b| b.parse().ok())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    let backoffice_token =
        backoffice_token(std::env::var("BACKOFFICE_TOKEN").ok(), ip).unwrap_or_else(|e| panic!("{e}"));
    let secret = backoffice_token != "admin";

    let turn = live::Turn::start()
        .await
        .unwrap_or_else(|e| panic!("cannot start TURN: {e}"));
    let rooms = load_rooms(&data);
    let past = rooms.len();
    let state = Arc::new(Coordinator {
        rooms: Mutex::new(rooms),
        data: data.clone(),
        backoffice_token,
        turn,
    });
    let link = format!("/backoffice/{}", state.backoffice_token);
    let live_info = state.turn.as_ref().map(live::Turn::describe);

    let api = "/api/backoffice/{token}/rooms";
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/takes/{take}/uploads", post(tus::create))
        .route("/uploads/{id}", axum::routing::head(tus::head).patch(tus::patch))
        .route("/takes/{take}/zip", get(download::take_zip))
        .route("/takes/{take}/tracks/{file}", get(download::track))
        .route_service("/backoffice/{token}", ServeFile::new(dist.join("backoffice.html")))
        .route(api, get(backoffice::list).post(backoffice::create_room))
        .route(
            &format!("{api}/{{id}}/invitations"),
            post(backoffice::create_invitation),
        )
        .route(&format!("{api}/{{id}}/close"), post(backoffice::close))
        .route(&format!("{api}/{{id}}/zip"), get(backoffice::zip))
        .route(&format!("{api}/{{id}}/flac"), post(backoffice::convert_flac))
        .route(&format!("{api}/{{id}}/flac/zip"), get(backoffice::flac_zip))
        .fallback_service(static_files)
        // Revalidate on every load so a new build is never hidden behind a cached index.html.
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache"),
        ))
        .with_state(state);

    let addr = SocketAddr::new(ip, port);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!(
        "Coordinator listening on http://{addr}, storing Rooms in {} ({} past Rooms loaded)",
        data.display(),
        past
    );
    match live_info {
        Some(t) => println!("  live conversation: {t}"),
        None => println!("  live conversation: no STUN/TURN (set TURN_PUBLIC_IP); only direct connections"),
    }
    if secret {
        println!("  backoffice: /backoffice/<BACKOFFICE_TOKEN>");
    } else {
        println!("  backoffice: {link}  (set BACKOFFICE_TOKEN to make it secret)");
    }
    axum::serve(listener, app).await.unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_date_of_unix_times() {
        assert_eq!(utc_date(0.0), "1970-01-01");
        assert_eq!(utc_date(951_782_400_000.0), "2000-02-29");
        assert_eq!(utc_date(1_793_884_607_932.0), "2026-11-05");
    }

    #[test]
    fn the_backoffice_fails_closed_off_loopback() {
        let local: IpAddr = "127.0.0.1".parse().unwrap();
        let any: IpAddr = "0.0.0.0".parse().unwrap();
        assert_eq!(backoffice_token(None, local).unwrap(), "admin");
        assert_eq!(backoffice_token(None, "::1".parse().unwrap()).unwrap(), "admin");
        assert!(backoffice_token(None, any).is_err());
        assert!(backoffice_token(Some(String::new()), any).is_err());
        assert_eq!(backoffice_token(Some("s3cret".into()), any).unwrap(), "s3cret");
    }
}
