mod backoffice;
mod download;
mod flac;
mod protocol;
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

use protocol::{
    BackofficeError, ClientMessage, FlacState, InvitationView, ParticipantStatus, ParticipantView, Role, RoomView, ServerMessage,
    TrackView,
};

/// A Room holds the Host and up to four Guests.
const MAX_PARTICIPANTS: usize = 5;
/// Lead time so the TakeStarted message reaches everyone before T.
const START_LEAD_MS: f64 = 1500.0;
/// Lead time so everyone ends the Track at the same Coordinator instant.
const STOP_LEAD_MS: f64 = 500.0;
/// Upper bound for one uploaded Track, so a client cannot fill the disk.
const MAX_TRACK_BYTES: u64 = 4 << 30;

struct Participant {
    /// Secret of this Participant's Invitation link, `/i/{token}`.
    token: String,
    view: ParticipantView,
    /// Live connection: (connection id, outbound queue). `None` when disconnected.
    conn: Option<(u64, mpsc::UnboundedSender<ServerMessage>)>,
}

pub struct Room {
    /// `<name>_<date>`: the folder name and the prefix of every file in it.
    id: String,
    name: String,
    created: String,
    /// Closed Rooms are immutable and their Invitations have expired (CU8, ADR-0002).
    closed: bool,
    flac: FlacState,
    participants: Vec<Participant>,
    next_conn_id: u64,
    /// Number of the last Take started (0 = none yet).
    take: u32,
    recording: bool,
    /// Index = Take number - 1.
    takes: Vec<Take>,
    /// Folder where this Room's Tracks are stored.
    dir: PathBuf,
    uploads: Vec<tus::Upload>,
}

struct Take {
    /// T, the instant of the Sync tone (Coordinator clock, ms).
    start_time: f64,
    stop_time: Option<f64>,
}

impl Room {
    fn new(id: String, name: String, dir: PathBuf) -> Self {
        Room {
            id,
            name,
            created: utc_date(now_ms()),
            closed: false,
            flac: FlacState::None,
            participants: Vec::new(),
            next_conn_id: 0,
            take: 0,
            recording: false,
            takes: Vec::new(),
            dir,
            uploads: Vec::new(),
        }
    }

    /// Creates an Invitation (CU2): a new Participant with its own secret link.
    fn invite(&mut self, name: &str, role: Role) -> Result<(), BackofficeError> {
        if self.closed {
            return Err(BackofficeError::Closed);
        }
        if !valid_name(name) {
            return Err(BackofficeError::InvalidName);
        }
        if self.participants.iter().any(|p| p.view.name == name) {
            return Err(BackofficeError::NameTaken);
        }
        if self.participants.len() >= MAX_PARTICIPANTS {
            return Err(BackofficeError::RoomFull);
        }
        self.participants.push(Participant {
            token: random_token(),
            view: ParticipantView {
                name: name.into(),
                role,
                status: ParticipantStatus::Disconnected,
                clock_offset_ms: None,
                clock_rtt_ms: None,
                syncing: false,
                mic_problem: None,
            },
            conn: None,
        });
        self.broadcast_roster();
        Ok(())
    }

    /// A past Room from its `room.json`, closed: its Invitations were never saved, and a Room
    /// is not reopened (ADR-0002). Rooms of iteration 0a lack name, date and participants.
    fn load(dir: PathBuf) -> Result<Room, String> {
        let json = std::fs::read(dir.join("room.json")).map_err(|e| e.to_string())?;
        let saved: SavedRoom = serde_json::from_slice(&json).map_err(|e| e.to_string())?;
        let id = dir.file_name().unwrap().to_string_lossy().into_owned();
        let mut room = Room::new(id.clone(), saved.room.unwrap_or(id), dir);
        room.closed = true;
        room.created = saved
            .created
            .or_else(|| saved.takes.first().map(|t| utc_date(t.start_time)))
            .unwrap_or_default();
        let mut takes = saved.takes;
        takes.sort_by_key(|t| t.take);
        for (i, t) in takes.into_iter().enumerate() {
            let take = i as u32 + 1;
            room.takes.push(Take {
                start_time: t.start_time,
                stop_time: t.stop_time,
            });
            room.uploads.extend(t.tracks.into_iter().map(|p| tus::Upload::from_saved(take, p)));
        }
        room.take = room.takes.len() as u32;
        // FLACs are renamed into place only when complete, so all present means converted.
        if !room.uploads.is_empty() && room.uploads.iter().all(|u| room.flac_path(u).is_file()) {
            room.flac = FlacState::Ready;
        }
        let mut people = saved.participants.unwrap_or_default();
        for u in &room.uploads {
            if !people.iter().any(|p| p.name == u.participant) {
                // In 0a the Host was always "host".
                let role = if u.participant == "host" { Role::Host } else { Role::Guest };
                people.push(SavedParticipant {
                    name: u.participant.clone(),
                    role,
                });
            }
        }
        for p in people {
            room.participants.push(Participant {
                token: random_token(),
                view: ParticipantView {
                    name: p.name,
                    role: p.role,
                    status: ParticipantStatus::Disconnected,
                    clock_offset_ms: None,
                    clock_rtt_ms: None,
                    syncing: false,
                    mic_problem: None,
                },
                conn: None,
            });
        }
        Ok(room)
    }

    fn flac_path(&self, u: &tus::Upload) -> PathBuf {
        flac::path(&self.dir, &u.id)
    }

    fn find(&mut self, name: &str) -> Option<&mut Participant> {
        self.participants.iter_mut().find(|p| p.view.name == name)
    }

    /// Audible Sync tone frequency of a Participant: 1000 Hz, 1500 Hz… in Invitation order.
    fn tone_hz(&self, name: &str) -> f64 {
        let i = self.participants.iter().position(|p| p.view.name == name).unwrap_or(0);
        1000.0 + 500.0 * i as f64
    }

    fn broadcast_roster(&self) {
        self.broadcast(ServerMessage::Roster {
            participants: self.participants.iter().map(|p| p.view.clone()).collect(),
        });
    }

    /// Participants that recorded (part of) a Take, in the order they started.
    fn take_expected(&self, take: u32) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        for u in self.uploads.iter().filter(|u| u.take == take) {
            if !names.contains(&u.participant) {
                names.push(u.participant.clone());
            }
        }
        names
    }

    /// Participants with some part of this Take not yet fully uploaded.
    fn take_pending(&self, take: u32) -> Vec<String> {
        let mut names = self.take_expected(take);
        names.retain(|n| {
            self.uploads
                .iter()
                .any(|u| u.take == take && &u.participant == n && !u.is_complete())
        });
        names
    }

    /// Participants with audio of any Take not yet uploaded.
    fn pending(&self) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        for n in (1..=self.take).flat_map(|t| self.take_pending(t)) {
            if !names.contains(&n) {
                names.push(n);
            }
        }
        names
    }

    fn take_tracks(&self, take: u32) -> Vec<TrackView> {
        let t = &self.takes[take as usize - 1];
        self.uploads
            .iter()
            .filter(|u| u.take == take && u.is_complete())
            .map(|u| TrackView {
                participant: u.participant.clone(),
                part: u.part,
                file: u.file(),
                bytes: u.offset,
                start_offset_ms: u.start_time - t.start_time,
            })
            .collect()
    }

    fn take_tracks_message(&self, take: u32) -> ServerMessage {
        ServerMessage::TakeTracks {
            take,
            expected: self.take_expected(take),
            pending: self.take_pending(take),
            tracks: self.take_tracks(take),
        }
    }

    /// A Participant is syncing while a stopped Take still has audio of theirs pending upload.
    fn refresh_syncing(&mut self) {
        let stopped = if self.recording { self.take - 1 } else { self.take };
        let pending: Vec<String> = (1..=stopped).flat_map(|t| self.take_pending(t)).collect();
        for p in &mut self.participants {
            p.view.syncing = pending.contains(&p.view.name);
        }
    }

    fn start_take(&mut self) {
        if self.recording || self.closed {
            return;
        }
        self.recording = true;
        self.take += 1;
        let start_time = now_ms() + START_LEAD_MS;
        self.takes.push(Take {
            start_time,
            stop_time: None,
        });
        self.broadcast(ServerMessage::TakeStarted {
            take: self.take,
            start_time,
        });
    }

    fn stop_take(&mut self) {
        if !self.recording {
            return;
        }
        self.recording = false;
        let (take, stop_time) = (self.take, now_ms() + STOP_LEAD_MS);
        self.takes[take as usize - 1].stop_time = Some(stop_time);
        self.broadcast(ServerMessage::TakeStopped { take, stop_time });
        self.broadcast_take_tracks(take);
        self.save_metadata();
        self.refresh_syncing();
        self.broadcast_roster();
    }

    /// Closes the Room (CU8): what has not been uploaded stays incomplete, and every Invitation expires.
    fn close(&mut self) -> Result<(), BackofficeError> {
        if self.closed {
            return Err(BackofficeError::Closed);
        }
        // Closing mid-Take would cut every Track short: the Host stops first.
        if self.recording {
            return Err(BackofficeError::Recording);
        }
        self.closed = true;
        self.save_metadata();
        self.broadcast(ServerMessage::RoomClosed);
        Ok(())
    }

    fn view(&self) -> RoomView {
        RoomView {
            id: self.id.clone(),
            name: self.name.clone(),
            created: self.created.clone(),
            closed: self.closed,
            recording: self.recording,
            takes: self.take,
            pending: self.pending(),
            flac: self.flac,
            invitations: self
                .participants
                .iter()
                .map(|p| InvitationView {
                    name: p.view.name.clone(),
                    role: p.view.role,
                    token: p.token.clone(),
                    status: p.view.status,
                })
                .collect(),
        }
    }

    /// Writes `room.json` next to the Tracks: what an editor needs to align them.
    // shortcut: rewritten whole on every change; fine for a handful of Takes.
    fn save_metadata(&self) {
        let takes: Vec<_> = (1..=self.take)
            .map(|take| {
                let t = &self.takes[take as usize - 1];
                let parts: Vec<_> = self
                    .uploads
                    .iter()
                    .filter(|u| u.take == take)
                    .map(|u| {
                        serde_json::json!({
                            "participant": u.participant,
                            "part": u.part,
                            "file": u.file(),
                            "complete": u.is_complete(),
                            "bytes": u.offset,
                            "startTime": u.start_time,
                            "startOffsetMs": u.start_time - t.start_time,
                            "sampleRate": u.sample_rate,
                            "toneHz": self.tone_hz(&u.participant),
                            "outputLatencyMs": u.output_latency_ms,
                            "inputLatencyMs": u.input_latency_ms,
                            "calibratedRoundTripMs": u.calibrated_round_trip_ms,
                            "clockOffsetMs": u.clock_offset_ms,
                            "clockRttMs": u.clock_rtt_ms,
                            "driftMarks": u.drift_marks,
                            // What the FLAC delivery corrects (ADR-0004); null when the marks are too few.
                            "driftPpm": u.drift_ppm(),
                        })
                    })
                    .collect();
                serde_json::json!({ "take": take, "startTime": t.start_time, "stopTime": t.stop_time, "tracks": parts })
            })
            .collect();
        let meta = serde_json::json!({
            "note": "Times are Coordinator clock, ms since the Unix epoch. startTime of a Take is T, the Sync tone.",
            "room": self.name,
            "created": self.created,
            "closed": self.closed,
            "participants": self.participants.iter().map(|p| serde_json::json!({ "name": p.view.name, "role": p.view.role })).collect::<Vec<_>>(),
            "takes": takes,
        });
        if let Err(e) = std::fs::write(self.dir.join("room.json"), serde_json::to_vec_pretty(&meta).unwrap()) {
            eprintln!("{}: cannot write room.json: {e}", self.id);
        }
    }

    fn broadcast_take_tracks(&self, take: u32) {
        self.broadcast(self.take_tracks_message(take));
    }

    fn broadcast(&self, msg: ServerMessage) {
        for (_, tx) in self.participants.iter().filter_map(|p| p.conn.as_ref()) {
            let _ = tx.send(msg.clone());
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedRoom {
    room: Option<String>,
    created: Option<String>,
    participants: Option<Vec<SavedParticipant>>,
    takes: Vec<SavedTake>,
}

#[derive(Deserialize)]
struct SavedParticipant {
    name: String,
    role: Role,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedTake {
    take: u32,
    start_time: f64,
    stop_time: Option<f64>,
    tracks: Vec<tus::SavedPart>,
}

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

/// Fixed names end up in file names: lowercase letters, digits and `-` only.
fn valid_name(name: &str) -> bool {
    (1..=40).contains(&name.len())
        && name
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
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
    ws.on_upgrade(move |socket| handle_socket(socket, name, room))
}

async fn handle_socket(socket: WebSocket, name: String, shared: SharedRoom) {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let (conn_id, role) = {
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
        });
        let role = p.view.role;
        // Catch up with the current Take (CU7): keep recording in a new part, or stop.
        if let Some(t) = room.takes.last() {
            let take = room.take;
            let _ = tx.send(match t.stop_time {
                None => ServerMessage::TakeStarted {
                    take,
                    start_time: t.start_time,
                },
                Some(stop_time) => ServerMessage::TakeStopped { take, stop_time },
            });
        }
        if role == Role::Host {
            for take in 1..=room.take {
                let _ = tx.send(room.take_tracks_message(take));
            }
        }
        room.broadcast_roster();
        (conn_id, role)
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
            eprintln!("{name}: ignoring malformed message: {text}");
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
            ClientMessage::Record | ClientMessage::Stop if role != Role::Host => {
                eprintln!("{name}: only the Host can record or stop");
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

/// File stem of a Track part: `<room>_t01_ana`, then `<room>_t01_ana_p2`… after reconnecting.
fn track_stem(room: &str, take: u32, participant: &str, part: u32) -> String {
    match part {
        1 => format!("{room}_t{take:02}_{participant}"),
        _ => format!("{room}_t{take:02}_{participant}_p{part}"),
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
    // Without the variable the backoffice link is the guessable /backoffice/admin: fine locally only.
    let backoffice_token = std::env::var("BACKOFFICE_TOKEN").unwrap_or_else(|_| "admin".into());
    let secret = backoffice_token != "admin";

    let rooms = load_rooms(&data);
    let past = rooms.len();
    let state = Arc::new(Coordinator {
        rooms: Mutex::new(rooms),
        data: data.clone(),
        backoffice_token,
    });
    let link = format!("/backoffice/{}", state.backoffice_token);

    let api = "/api/backoffice/{token}/rooms";
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/takes/{take}/uploads", post(tus::create))
        .route("/uploads/{id}", axum::routing::head(tus::head).patch(tus::patch))
        .route("/takes/{take}/zip", get(download::take_zip))
        .route("/takes/{take}/tracks/{file}", get(download::track))
        .route_service("/backoffice/{token}", ServeFile::new(dist.join("backoffice.html")))
        .route(api, get(backoffice::list).post(backoffice::create_room))
        .route(&format!("{api}/{{id}}/invitations"), post(backoffice::create_invitation))
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

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);
    // Loopback by default; the Docker image sets BIND=0.0.0.0 behind the platform's HTTPS proxy.
    let ip: IpAddr = std::env::var("BIND")
        .ok()
        .and_then(|b| b.parse().ok())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    let addr = SocketAddr::new(ip, port);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!(
        "Coordinator listening on http://{addr}, storing Rooms in {} ({} past Rooms loaded)",
        data.display(),
        past
    );
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
    fn names_safe_for_files() {
        assert!(valid_name("ana"));
        assert!(valid_name("prueba-sync-2"));
        for bad in ["", "Ana", "a b", "../x", "a_b", &"x".repeat(41)] {
            assert!(!valid_name(bad), "{bad:?}");
        }
    }

    #[test]
    fn invitations_are_unique_and_limited() {
        let mut room = Room::new("r_2026-11-05".into(), "r".into(), PathBuf::from("."));
        room.invite("host", Role::Host).unwrap();
        assert_eq!(room.invite("host", Role::Guest), Err(BackofficeError::NameTaken));
        for n in ["a", "b", "c", "d"] {
            room.invite(n, Role::Guest).unwrap();
        }
        assert_eq!(room.invite("e", Role::Guest), Err(BackofficeError::RoomFull));
        let tokens: Vec<_> = room.participants.iter().map(|p| &p.token).collect();
        assert!(tokens.iter().all(|t| t.len() == 32) && tokens[0] != tokens[1]);
    }

    #[test]
    fn closing_waits_for_the_take_to_stop() {
        let dir = std::env::temp_dir().join(random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let mut room = Room::new("r_2026-11-05".into(), "r".into(), dir.clone());
        room.start_take();
        assert_eq!(room.close(), Err(BackofficeError::Recording));
        room.stop_take();
        room.close().unwrap();
        assert_eq!(room.invite("late", Role::Guest), Err(BackofficeError::Closed));

        // After a restart it comes back closed, from its room.json.
        let past = Room::load(dir.clone()).unwrap();
        assert!(past.closed);
        assert_eq!((past.name.as_str(), past.take), ("r", 1));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
