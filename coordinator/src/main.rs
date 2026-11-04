mod protocol;
mod tus;

use std::{
    io::Write,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::http::{HeaderValue, header};
use axum::{
    Router,
    extract::{
        Path as UrlPath, Query, State,
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

use protocol::{ClientMessage, ParticipantStatus, ParticipantView, Role, ServerMessage, TrackView};

// shortcut: iteration 0a has one hard-coded Room with two Invitations; replace with real Rooms in 0b.
// Each is (fixed name, role, env var with the link's secret token). Without the variable the
// token is the fixed name itself (/i/host, /i/ana): fine locally, never on a public deployment.
const INVITATIONS: [(&str, Role, &str); 2] = [
    ("host", Role::Host, "HOST_INVITE"),
    ("ana", Role::Guest, "GUEST_INVITE"),
];
/// Lead time so the TakeStarted message reaches everyone before T.
const START_LEAD_MS: f64 = 1500.0;
/// Lead time so everyone ends the Track at the same Coordinator instant.
const STOP_LEAD_MS: f64 = 500.0;
/// Upper bound for one uploaded Track, so a client cannot fill the disk.
const MAX_TRACK_BYTES: u64 = 4 << 30;

struct Participant {
    view: ParticipantView,
    /// Live connection: (connection id, outbound queue). `None` when disconnected.
    conn: Option<(u64, mpsc::UnboundedSender<ServerMessage>)>,
}

struct Room {
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
    fn new(dir: PathBuf) -> Self {
        let participants = INVITATIONS
            .iter()
            .map(|&(name, role, _)| Participant {
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
            })
            .collect();
        Room {
            participants,
            next_conn_id: 0,
            take: 0,
            recording: false,
            takes: Vec::new(),
            dir,
            uploads: Vec::new(),
        }
    }

    fn find(&mut self, name: &str) -> Option<&mut Participant> {
        self.participants.iter_mut().find(|p| p.view.name == name)
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
                            "toneHz": tone_hz(&u.participant),
                            "outputLatencyMs": u.output_latency_ms,
                            "inputLatencyMs": u.input_latency_ms,
                            "calibratedRoundTripMs": u.calibrated_round_trip_ms,
                            "clockOffsetMs": u.clock_offset_ms,
                            "clockRttMs": u.clock_rtt_ms,
                            "driftMarks": u.drift_marks,
                        })
                    })
                    .collect();
                serde_json::json!({ "take": take, "startTime": t.start_time, "stopTime": t.stop_time, "tracks": parts })
            })
            .collect();
        let meta = serde_json::json!({
            "note": "Times are Coordinator clock, ms since the Unix epoch. startTime of a Take is T, the Sync tone.",
            "takes": takes,
        });
        if let Err(e) = std::fs::write(self.dir.join("room.json"), serde_json::to_vec_pretty(&meta).unwrap()) {
            eprintln!("cannot write room.json: {e}");
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

type AppState = Arc<Mutex<Room>>;

fn invite_tokens() -> &'static [String] {
    static TOKENS: OnceLock<Vec<String>> = OnceLock::new();
    TOKENS.get_or_init(|| {
        INVITATIONS
            .iter()
            .map(|(name, _, var)| std::env::var(var).unwrap_or_else(|_| name.to_string()))
            .collect()
    })
}

/// The Invitation behind a link token: (fixed name, role).
fn invitation(token: &str) -> Option<(&'static str, Role)> {
    let i = invite_tokens().iter().position(|t| t == token)?;
    Some((INVITATIONS[i].0, INVITATIONS[i].1))
}

/// Audible Sync tone frequency of a Participant: 1000 Hz, 1500 Hz… in Invitation order.
fn tone_hz(name: &str) -> f64 {
    let i = INVITATIONS.iter().position(|(n, _, _)| *n == name).unwrap_or(0);
    1000.0 + 500.0 * i as f64
}

fn is_host(token: &str) -> bool {
    invitation(token).is_some_and(|(_, role)| role == Role::Host)
}

fn now_ms() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs_f64() * 1000.0
}

#[derive(Deserialize)]
struct WsParams {
    invite: String,
}

async fn ws_handler(ws: WebSocketUpgrade, Query(params): Query<WsParams>, State(state): State<AppState>) -> Response {
    let Some((name, _)) = invitation(&params.invite) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    ws.on_upgrade(move |socket| handle_socket(socket, name.to_string(), state))
}

async fn handle_socket(socket: WebSocket, name: String, state: AppState) {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let (conn_id, role) = {
        let mut room = state.lock().unwrap();
        room.next_conn_id += 1;
        let conn_id = room.next_conn_id;
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
            tone_hz: tone_hz(&name),
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
            if matches!(msg, ServerMessage::Replaced) {
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
                let mut room = state.lock().unwrap();
                let p = room.find(&name).unwrap();
                p.view.clock_offset_ms = Some(offset_ms);
                p.view.clock_rtt_ms = Some(rtt_ms);
                room.broadcast_roster();
            }
            ClientMessage::MicStatus { problem } => {
                let mut room = state.lock().unwrap();
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
                let mut room = state.lock().unwrap();
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
            ClientMessage::Record => {
                let mut room = state.lock().unwrap();
                if !room.recording {
                    room.recording = true;
                    room.take += 1;
                    let start_time = now_ms() + START_LEAD_MS;
                    room.takes.push(Take {
                        start_time,
                        stop_time: None,
                    });
                    let msg = ServerMessage::TakeStarted {
                        take: room.take,
                        start_time,
                    };
                    room.broadcast(msg);
                }
            }
            ClientMessage::Stop => {
                let mut room = state.lock().unwrap();
                if room.recording {
                    room.recording = false;
                    let (take, stop_time) = (room.take, now_ms() + STOP_LEAD_MS);
                    room.takes[take as usize - 1].stop_time = Some(stop_time);
                    let msg = ServerMessage::TakeStopped { take, stop_time };
                    room.broadcast(msg);
                    room.broadcast_take_tracks(room.take);
                    room.save_metadata();
                    room.refresh_syncing();
                    room.broadcast_roster();
                }
            }
        }
    }

    writer.abort();
    let mut room = state.lock().unwrap();
    let p = room.find(&name).unwrap();
    // Only mark disconnected if no newer connection took over.
    if p.conn.as_ref().is_some_and(|(id, _)| *id == conn_id) {
        p.conn = None;
        p.view.status = ParticipantStatus::Disconnected;
        room.broadcast_roster();
    }
}

/// File stem of a Track part: `t01_ana`, then `t01_ana_p2`, `t01_ana_p3`… after reconnecting.
fn track_stem(take: u32, participant: &str, part: u32) -> String {
    match part {
        1 => format!("t{take:02}_{participant}"),
        _ => format!("t{take:02}_{participant}_p{part}"),
    }
}

/// Host only: one received Track.
async fn download_track(
    UrlPath((take, file)): UrlPath<(u32, String)>,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
) -> Result<Response, StatusCode> {
    if !is_host(&params.invite) {
        return Err(StatusCode::FORBIDDEN);
    }
    // Only files listed for the Take are served, so the URL cannot reach anything else on disk.
    let path = {
        let room = state.lock().unwrap();
        if take == 0 || take > room.take {
            return Err(StatusCode::NOT_FOUND);
        }
        let tr = room.take_tracks(take).into_iter().find(|tr| tr.file == file);
        room.dir.join(tr.ok_or(StatusCode::NOT_FOUND)?.file)
    };
    let file = path.file_name().unwrap().to_string_lossy().into_owned();
    // shortcut: read whole into memory, like the zip; stream from disk if Takes get long.
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

/// Host only: every Track of a Take received so far, in one uncompressed zip (Opus is already compressed).
async fn download_take_zip(
    UrlPath(take): UrlPath<u32>,
    Query(params): Query<WsParams>,
    State(state): State<AppState>,
) -> Result<Response, StatusCode> {
    if !is_host(&params.invite) {
        return Err(StatusCode::FORBIDDEN);
    }
    let (dir, files) = {
        let room = state.lock().unwrap();
        if take == 0 || take > room.take {
            return Err(StatusCode::NOT_FOUND);
        }
        let files: Vec<String> = room.take_tracks(take).into_iter().map(|tr| tr.file).collect();
        (room.dir.clone(), files)
    };
    // shortcut: the zip is built in memory; stream it from disk if Takes get long enough to matter.
    let zip = tokio::task::spawn_blocking(move || -> zip::result::ZipResult<Vec<u8>> {
        let mut cursor = std::io::Cursor::new(Vec::new());
        let mut archive = zip::ZipWriter::new(&mut cursor);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for file in files.iter().map(String::as_str).chain(["room.json"]) {
            archive.start_file(file, options)?;
            archive.write_all(&std::fs::read(dir.join(file))?)?;
        }
        archive.finish()?;
        Ok(cursor.into_inner())
    })
    .await
    .unwrap()
    .map_err(|e| {
        eprintln!("zip of take {take} failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let disposition = format!("attachment; filename=\"t{take:02}.zip\"");
    Ok((
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        zip,
    )
        .into_response())
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
    // A new folder per run, so a restart never overwrites earlier Tracks.
    let room_dir = data.join(format!("room-{}", (now_ms() / 1000.0) as u64));
    std::fs::create_dir_all(&room_dir).expect("cannot create the Room folder");

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/takes/{take}/uploads", post(tus::create))
        .route("/uploads/{id}", axum::routing::head(tus::head).patch(tus::patch))
        .route("/takes/{take}/zip", get(download_take_zip))
        .route("/takes/{take}/tracks/{file}", get(download_track))
        .fallback_service(static_files)
        // Revalidate on every load so a new build is never hidden behind a cached index.html.
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache"),
        ))
        .with_state(Arc::new(Mutex::new(Room::new(room_dir.clone()))));

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);
    // Loopback by default; the Docker image sets BIND=0.0.0.0 behind the platform's HTTPS proxy.
    let ip: IpAddr = std::env::var("BIND")
        .ok()
        .and_then(|b| b.parse().ok())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    let addr = SocketAddr::new(ip, port);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!(
        "Coordinator listening on http://{addr}, storing Tracks in {}",
        room_dir.display()
    );
    for ((name, _, var), token) in INVITATIONS.iter().zip(invite_tokens()) {
        let source = if token == name {
            format!("set {var} to make it secret")
        } else {
            format!("from {var}")
        };
        println!("  {name}: /i/{token}  ({source})");
    }
    axum::serve(listener, app).await.unwrap();
}
