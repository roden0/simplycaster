mod accounts;
mod accounts_api;
mod backoffice;
mod client_files;
mod download;
mod flac;
mod live;
mod protocol;
mod realign;
mod room;
mod room_file;
mod session;
mod tus;
mod ws;

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
    routing::{get, post},
};
use tower_http::set_header::SetResponseHeaderLayer;

use room::{Room, track_stem};

use protocol::Role;

/// Upper bound for one uploaded Track, so a client cannot fill the disk.
const MAX_TRACK_BYTES: u64 = 4 << 30;
/// WebRTC offers and candidates are a few KB; anything bigger is not signalling.
const MAX_SIGNAL_BYTES: usize = 64 << 10;
/// Largest WebSocket message: a signal plus its JSON envelope. tungstenite's default is 64 MiB.
const MAX_WS_MESSAGE_BYTES: usize = 2 * MAX_SIGNAL_BYTES;

/// What `openssl rand -hex 16` gives: 128 random bits.
const MIN_TOKEN_CHARS: usize = 32;

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
    rooms: Mutex<Vec<SharedRoom>>,
    data: PathBuf,
    backoffice_token: String,
    /// Signs and checks the session cookies (ADR-0009).
    keys: session::Keys,
    /// STUN/TURN for the live conversation (ADR-0005); `None` when not configured.
    turn: Option<live::Turn>,
    accounts: accounts::Accounts,
    /// `None` without `PUBLIC_URL`: only the token works, and recording does not depend on it.
    webauthn: Option<webauthn_rs::prelude::Webauthn>,
    logins: accounts_api::Logins,
    registrations: accounts_api::Registrations,
}

type AppState = Arc<Coordinator>;

impl Coordinator {
    /// The open Room behind an Invitation link token, and the Participant's fixed name and role.
    fn by_invite(&self, token: &str) -> Option<(SharedRoom, String, Role)> {
        // shortcut: walks every Room, closed ones too, on each PATCH and connection; add a token index
        // when there are hundreds of Rooms or contention is measured (ADR-0006 B12).
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

    /// The open Room and role of the Participant `room`/`name`, if the request carries a valid
    /// session cookie for them (ADR-0009).
    fn by_session(&self, headers: &axum::http::HeaderMap, room: &str, name: &str) -> Option<(SharedRoom, Role)> {
        let jwt = session::cookie(headers, &session::participant_cookie(room, name))?;
        if self.keys.verify(jwt)? != format!("{room}/{name}") {
            return None;
        }
        let shared = self
            .rooms
            .lock()
            .unwrap()
            .iter()
            .find(|r| r.lock().unwrap().id == room)?
            .clone();
        let role = {
            let r = shared.lock().unwrap();
            if r.closed {
                return None;
            }
            r.participants.iter().find(|p| p.view.name == name)?.view.role
        };
        Some((shared, role))
    }

    fn host_session(&self, headers: &axum::http::HeaderMap, room: &str, name: &str) -> Option<SharedRoom> {
        self.by_session(headers, room, name)
            .and_then(|(room, role)| (role == Role::Host).then_some(room))
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

/// The backoffice secret. Without `BACKOFFICE_TOKEN` it is the guessable `admin`, allowed only on loopback:
/// listening anywhere else, the Coordinator refuses to start rather than expose the backoffice (ADR-0006 A3).
/// There, a short token is refused too: signing in has no limit of attempts, so its length is the defence.
fn backoffice_token(token: Option<String>, ip: IpAddr) -> Result<String, String> {
    // Empty counts as unset: docker-compose passes `BACKOFFICE_TOKEN=` when .env leaves it blank.
    match token.filter(|t| !t.is_empty()) {
        Some(t) if ip.is_loopback() || t.len() >= MIN_TOKEN_CHARS => Ok(t),
        Some(_) => Err(format!(
            "BACKOFFICE_TOKEN needs at least {MIN_TOKEN_CHARS} characters; generate one with: openssl rand -hex 16"
        )),
        None if ip.is_loopback() => Ok("admin".into()),
        None => Err(format!(
            "BACKOFFICE_TOKEN is required when listening on {ip}; generate one with: openssl rand -hex 16"
        )),
    }
}

async fn to_backoffice() -> axum::response::Redirect {
    axum::response::Redirect::permanent("/backoffice")
}

#[tokio::main]
async fn main() {
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
    let keys = session::Keys::load_or_create(&data).unwrap_or_else(|e| panic!("cannot read the session key: {e}"));
    let accounts =
        accounts::Accounts::load_or_create(&data).unwrap_or_else(|e| panic!("cannot read the Accounts: {e}"));
    let public_url = std::env::var("PUBLIC_URL")
        .ok()
        .filter(|u| !u.is_empty())
        .or_else(|| ip.is_loopback().then(|| format!("http://localhost:{port}")));
    let webauthn = public_url.as_deref().and_then(|url| {
        accounts_api::webauthn(url)
            .inspect_err(|e| eprintln!("passkeys are off: {e}"))
            .ok()
    });
    let rooms = load_rooms(&data);
    let past = rooms.len();
    let state = Arc::new(Coordinator {
        rooms: Mutex::new(rooms),
        data: data.clone(),
        backoffice_token,
        keys,
        turn,
        accounts,
        webauthn,
        logins: Default::default(),
        registrations: Default::default(),
    });
    let passkeys = state.webauthn.is_some();
    let live_info = state.turn.as_ref().map(live::Turn::describe);

    let api = "/api/backoffice/rooms";
    let app = Router::new()
        .route("/ws", get(ws::ws_handler))
        .route("/takes/{take}/uploads", post(tus::create))
        .route("/uploads/{id}", axum::routing::head(tus::head).patch(tus::patch))
        .route("/takes/{take}/zip", get(download::take_zip))
        .route("/takes/{take}/tracks/{file}", get(download::track))
        .route("/api/session", post(ws::join))
        .route("/backoffice", get(client_files::backoffice))
        // Old links (/backoffice/<token>, ADR-0009) and a trailing slash would fall to the Participant
        // page: send them to the sign-in, which also drops the token from the address bar.
        .route("/backoffice/", get(to_backoffice))
        .route("/backoffice/{*old}", get(to_backoffice))
        .route(
            "/api/backoffice/session",
            get(accounts_api::sign_in_options)
                .post(accounts_api::sign_in)
                .delete(accounts_api::sign_out),
        )
        .route("/api/backoffice/me", get(accounts_api::me))
        .route("/api/backoffice/me/passkeys", post(accounts_api::passkey_start))
        .route("/api/backoffice/passkeys", post(accounts_api::registration_finish))
        .route("/api/backoffice/login", post(accounts_api::login_start))
        .route("/api/backoffice/login/finish", post(accounts_api::login_finish))
        .route("/api/backoffice/enrolment", post(accounts_api::enrolment_start))
        .route(
            "/api/backoffice/accounts",
            get(accounts_api::list).post(accounts_api::create),
        )
        .route(
            "/api/backoffice/accounts/{id}",
            axum::routing::delete(accounts_api::delete),
        )
        .route(
            "/api/backoffice/accounts/{id}/enrolment",
            post(accounts_api::enrol_again),
        )
        .route(api, get(backoffice::list).post(backoffice::create_room))
        .route(&format!("{api}/{{id}}"), axum::routing::delete(backoffice::delete_room))
        .route(
            &format!("{api}/{{id}}/invitations"),
            post(backoffice::create_invitation),
        )
        .route(&format!("{api}/{{id}}/close"), post(backoffice::close))
        .route(
            &format!("{api}/{{id}}/takes/{{take}}"),
            axum::routing::delete(backoffice::delete_take),
        )
        .route(&format!("{api}/{{id}}/zip"), get(backoffice::zip))
        .route(&format!("{api}/{{id}}/flac"), post(backoffice::convert_flac))
        .route(&format!("{api}/{{id}}/flac/zip"), get(backoffice::flac_zip))
        .fallback(client_files::fallback)
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
    if !passkeys {
        println!("  passkeys: off (set PUBLIC_URL); the backoffice only takes the token");
    }
    if secret {
        println!("  backoffice: /backoffice, signing in with BACKOFFICE_TOKEN");
    } else {
        println!("  backoffice: /backoffice, signing in with admin  (set BACKOFFICE_TOKEN to make it secret)");
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
        assert!(backoffice_token(Some("s3cret".into()), any).is_err());
        assert_eq!(backoffice_token(Some("s3cret".into()), local).unwrap(), "s3cret");
        let long = "a".repeat(MIN_TOKEN_CHARS);
        assert_eq!(backoffice_token(Some(long.clone()), any).unwrap(), long);
    }
}
