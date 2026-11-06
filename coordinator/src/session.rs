//! Signed session cookies (ADR-0009). The backoffice token and the Invitation tokens are typed or opened
//! once and exchanged for a cookie, so they no longer travel in the URLs that proxies log.
//! A cookie holds a JWT (HS256) whose subject says who it is: `backoffice`, or `<room id>/<name>`.

use std::path::Path;

use axum::http::{HeaderMap, HeaderValue, header};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

pub const ADMIN_COOKIE: &str = "sc_admin";
pub const ADMIN_SUBJECT: &str = "backoffice";
pub const ADMIN_SECONDS: u64 = 12 * 3600;
/// A Room may span days; reopening the Invitation link renews it anyway.
pub const PARTICIPANT_SECONDS: u64 = 7 * 24 * 3600;
const KEY_FILE: &str = "session.key";

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: u64,
}

pub struct Keys {
    encoding: EncodingKey,
    decoding: DecodingKey,
}

impl Keys {
    pub fn new(secret: &[u8]) -> Keys {
        Keys {
            encoding: EncodingKey::from_secret(secret),
            decoding: DecodingKey::from_secret(secret),
        }
    }

    /// The signing key in `data/session.key`, created on first start. Kept on disk so sessions
    /// survive a restart (ADR-0007); delete the file to sign everyone out. Never in a download.
    pub fn load_or_create(data: &Path) -> std::io::Result<Keys> {
        let path = data.join(KEY_FILE);
        let secret = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let s = format!("{}{}", crate::random_token(), crate::random_token()); // 256 bits
                std::fs::write(&path, &s)?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
                }
                s
            }
            Err(e) => return Err(e),
        };
        Ok(Keys::new(secret.trim().as_bytes()))
    }

    pub fn sign(&self, subject: &str, seconds: u64) -> String {
        let exp = (crate::now_ms() / 1000.0) as u64 + seconds;
        let claims = Claims {
            sub: subject.into(),
            exp,
        };
        jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &self.encoding).expect("HS256 always signs")
    }

    /// The subject of a valid, unexpired token signed with this key.
    pub fn verify(&self, token: &str) -> Option<String> {
        let validation = Validation::new(Algorithm::HS256);
        jsonwebtoken::decode::<Claims>(token, &self.decoding, &validation)
            .ok()
            .map(|d| d.claims.sub)
    }
}

/// The cookie of one Participant: one per Room and name, so two Invitations open in the same
/// browser (tabs while testing) do not overwrite each other.
pub fn participant_cookie(room: &str, name: &str) -> String {
    format!("sc_{room}.{name}")
}

/// `Set-Cookie` for a session. `Secure` is accepted on http://localhost too; recording needs a
/// secure context anyway. `SameSite=Strict` keeps other sites from sending it (no CSRF).
pub fn set_cookie(name: &str, value: &str, seconds: u64) -> HeaderValue {
    let cookie = format!("{name}={value}; Path=/; Max-Age={seconds}; HttpOnly; Secure; SameSite=Strict");
    HeaderValue::from_str(&cookie).expect("names and JWTs are header-safe")
}

/// The value of cookie `name` in the request, if sent.
pub fn cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v)
}

/// Compares secrets in time independent of where they differ.
pub fn same_secret(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_token_is_valid_only_with_its_key_and_before_it_expires() {
        let keys = Keys::new(b"one key");
        let token = keys.sign("r_2026-11-06/ana", 60);
        assert_eq!(keys.verify(&token).as_deref(), Some("r_2026-11-06/ana"));
        assert_eq!(Keys::new(b"another key").verify(&token), None);
        let tampered = format!("{}x", &token[..token.len() - 1]);
        assert_eq!(keys.verify(&tampered), None);
        let expired = jsonwebtoken::encode(
            &Header::new(Algorithm::HS256),
            &Claims {
                sub: "backoffice".into(),
                exp: 1,
            },
            &keys.encoding,
        )
        .unwrap();
        assert_eq!(keys.verify(&expired), None);
    }

    #[test]
    fn cookies_are_read_from_any_cookie_header() {
        let mut headers = HeaderMap::new();
        headers.append(header::COOKIE, "a=1; sc_admin=xyz".parse().unwrap());
        headers.append(header::COOKIE, "sc_r.ana=abc".parse().unwrap());
        assert_eq!(cookie(&headers, ADMIN_COOKIE), Some("xyz"));
        assert_eq!(cookie(&headers, &participant_cookie("r", "ana")), Some("abc"));
        assert_eq!(cookie(&headers, "sc_r.bea"), None);
    }

    #[test]
    fn secrets_compare_whole() {
        assert!(same_secret("abc", "abc"));
        assert!(!same_secret("abc", "abd"));
        assert!(!same_secret("abc", "abcd"));
    }

    #[test]
    fn the_key_is_kept_across_restarts() {
        let dir = std::env::temp_dir().join(crate::random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let token = Keys::load_or_create(&dir).unwrap().sign("backoffice", 60);
        assert!(Keys::load_or_create(&dir).unwrap().verify(&token).is_some());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
