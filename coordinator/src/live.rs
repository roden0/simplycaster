//! STUN and TURN server for the live conversation between Participants (ADR-0005).
//! It relays encrypted WebRTC packets for those who cannot connect directly; it never sees audio.

use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use tokio::net::UdpSocket;
use turn::{
    auth::{LongTermAuthHandler, generate_long_term_credentials},
    relay::relay_range::RelayAddressGeneratorRanges,
    server::{
        Server,
        config::{ConnConfig, ServerConfig},
    },
};
use webrtc_util::vnet::net::Net;

use crate::protocol::IceServer;

/// Credentials are checked again when the browser refreshes a relay, so they outlast any session.
const CREDENTIALS_TTL: Duration = Duration::from_secs(24 * 3600);
const REALM: &str = "simplycaster";

pub struct Turn {
    /// Signs the temporary credentials handed to each connection.
    secret: String,
    addr: SocketAddr,
    /// Kept alive: dropping it stops the server.
    _server: Server,
}

impl Turn {
    /// Starts the server when `TURN_PUBLIC_IP` is set: the address browsers reach it at.
    /// It listens on UDP `TURN_PORT` (3478) and relays on the UDP range `TURN_RELAY_PORTS`.
    pub async fn start() -> Result<Option<Turn>, String> {
        let Ok(ip) = std::env::var("TURN_PUBLIC_IP") else {
            return Ok(None);
        };
        let ip: IpAddr = ip.parse().map_err(|e| format!("TURN_PUBLIC_IP: {e}"))?;
        let port: u16 = env_or("TURN_PORT", "3478").parse().map_err(|e| format!("TURN_PORT: {e}"))?;
        let (min_port, max_port) = parse_range(&env_or("TURN_RELAY_PORTS", "49160-49199"))?;

        let conn = UdpSocket::bind(("0.0.0.0", port))
            .await
            .map_err(|e| format!("cannot listen on UDP {port}: {e}"))?;
        let secret = crate::random_token();
        let server = Server::new(ServerConfig {
            conn_configs: vec![ConnConfig {
                conn: Arc::new(conn),
                relay_addr_generator: Box::new(RelayAddressGeneratorRanges {
                    relay_address: ip,
                    min_port,
                    max_port,
                    max_retries: 10,
                    address: "0.0.0.0".into(),
                    net: Arc::new(Net::new(None)),
                }),
            }],
            realm: REALM.into(),
            auth_handler: Arc::new(LongTermAuthHandler::new(secret.clone())),
            channel_bind_timeout: Duration::from_secs(0),
            alloc_close_notify: None,
        })
        .await
        .map_err(|e| e.to_string())?;
        Ok(Some(Turn {
            secret,
            addr: SocketAddr::new(ip, port),
            _server: server,
        }))
    }

    pub fn describe(&self) -> String {
        format!("STUN/TURN on udp {}", self.addr)
    }

    /// What one connection needs to reach the others: STUN, and TURN with its own credentials.
    pub fn ice_servers(&self) -> Vec<IceServer> {
        let (username, credential) = generate_long_term_credentials(&self.secret, CREDENTIALS_TTL)
            .expect("the system clock is before 1970");
        vec![IceServer {
            urls: vec![
                format!("stun:{}", self.addr),
                format!("turn:{}?transport=udp", self.addr),
            ],
            username: Some(username),
            credential: Some(credential),
        }]
    }
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.into())
}

/// `"49160-49199"` → `(49160, 49199)`.
fn parse_range(s: &str) -> Result<(u16, u16), String> {
    let bad = || format!("TURN_RELAY_PORTS must look like 49160-49199, not {s:?}");
    let (a, b) = s.split_once('-').ok_or_else(bad)?;
    let (a, b): (u16, u16) = (a.trim().parse().map_err(|_| bad())?, b.trim().parse().map_err(|_| bad())?);
    if a == 0 || b < a {
        return Err(bad());
    }
    Ok((a, b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relay_port_ranges() {
        assert_eq!(parse_range("49160-49199"), Ok((49160, 49199)));
        assert!(parse_range("49199-49160").is_err());
        assert!(parse_range("49160").is_err());
    }
}
