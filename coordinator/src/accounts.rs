//! Accounts and their rules (ADR-0011): who may sign in to the backoffice and how. Kept in
//! `accounts.json`, outside every Room folder so no download can include it. Rooms know nothing of this.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use webauthn_rs::prelude::{AuthenticationResult, Passkey};

use crate::protocol::{AccountRole, AccountView, BackofficeError};
use crate::{now_ms, random_token, room_file};

const FILE: &str = "accounts.json";
/// The HMAC key of the email fingerprints (ADR-0012). Losing it makes every fingerprint useless.
const EMAIL_KEY_FILE: &str = "email.key";
const INITIAL_NAME: &str = "admin";
const ENROLMENT_MS: f64 = 72.0 * 3600.0 * 1000.0;
/// An unfinished passkey ceremony: as long as the browser's own timeout.
const CEREMONY_MS: f64 = 5.0 * 60.0 * 1000.0;
/// Ceremonies start without signing in, so their memory is bounded.
const MAX_CEREMONIES: usize = 1000;
const MAX_NAME_CHARS: usize = 80;
const MAX_EMAIL_BYTES: usize = 254;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    /// Only in files from before ADR-0012: turned into `email_print` and `email_hint` on load.
    #[serde(default, skip_serializing)]
    email: Option<String>,
    /// HMAC of the normalised email, unique and unverified. Only the initial Admin has none.
    #[serde(default)]
    pub email_print: Option<String>,
    #[serde(default)]
    pub email_hint: Option<String>,
    pub role: AccountRole,
    /// The initial Admin, whose credential is `BACKOFFICE_TOKEN`.
    #[serde(default)]
    pub initial: bool,
    /// Public keys only: reading this file does not let anyone sign in.
    #[serde(default)]
    pub passkeys: Vec<Passkey>,
}

impl Account {
    fn can_sign_in(&self) -> bool {
        self.initial || !self.passkeys.is_empty()
    }

    fn view(&self) -> AccountView {
        AccountView {
            id: self.id.clone(),
            name: self.name.clone(),
            email_hint: self.email_hint.clone(),
            role: self.role,
            initial: self.initial,
            passkeys: self.passkeys.len() as u32,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Enrolment {
    /// The link's secret is only ever kept hashed.
    hash: String,
    account: String,
    expires_ms: f64,
}

#[derive(Serialize, Deserialize, Default)]
struct Store {
    accounts: Vec<Account>,
    enrolments: Vec<Enrolment>,
}

pub struct Accounts {
    dir: PathBuf,
    store: Mutex<Store>,
    email_key: Vec<u8>,
}

fn hash(token: &str) -> String {
    hex(&Sha256::digest(token.as_bytes()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The form two spellings of one mailbox share. Only Gmail is known to ignore dots and `+tags`;
/// elsewhere they can name different people, and a link would reach the wrong one.
fn normalise(email: &str) -> String {
    let email = email.trim().to_lowercase();
    match email.rsplit_once('@') {
        Some((user, "gmail.com" | "googlemail.com")) => {
            let user = user.split('+').next().unwrap_or_default().replace('.', "");
            format!("{user}@gmail.com")
        }
        _ => email,
    }
}

/// Enough to recognise an address without keeping it: `r•••@gmail.com`.
fn hint(email: &str) -> String {
    let email = email.trim().to_lowercase();
    let (user, domain) = email.rsplit_once('@').unwrap_or((&email, ""));
    let first: String = user.chars().take(1).collect();
    format!("{first}•••@{domain}")
}

fn valid_name(name: &str) -> bool {
    (1..=MAX_NAME_CHARS).contains(&name.chars().count()) && !name.chars().any(char::is_control)
}

fn valid_email(email: &str) -> bool {
    email.len() <= MAX_EMAIL_BYTES
        && !email.chars().any(|c| c.is_whitespace() || c.is_control())
        && email
            .split_once('@')
            .is_some_and(|(user, domain)| !user.is_empty() && !domain.is_empty() && !domain.contains('@'))
}

impl Accounts {
    /// The Accounts on disk. With no Admin (first start, or removed by hand to recover access) the
    /// initial Admin is created. An unreadable file stops the start: carrying on would forget everyone.
    pub fn load_or_create(dir: &Path) -> Result<Accounts, String> {
        let store = match std::fs::read(dir.join(FILE)) {
            Ok(json) => serde_json::from_slice(&json).map_err(|e| format!("{FILE}: {e}"))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Store::default(),
            Err(e) => return Err(format!("{FILE}: {e}")),
        };
        let email_key = crate::session::secret_file(dir, EMAIL_KEY_FILE)
            .map_err(|e| format!("{EMAIL_KEY_FILE}: {e}"))?
            .into_bytes();
        let accounts = Accounts {
            dir: dir.into(),
            store: Mutex::new(store),
            email_key,
        };
        {
            let mut store = accounts.store.lock().unwrap();
            let mut migrated = false;
            for account in &mut store.accounts {
                if let Some(email) = account.email.take() {
                    account.email_print = Some(accounts.print(&email));
                    account.email_hint = Some(hint(&email));
                    migrated = true;
                }
            }
            if migrated {
                accounts.save(&store)?;
            }
            if !store.accounts.iter().any(|a| a.role == AccountRole::Admin) {
                store.accounts.push(Account {
                    id: uuid::Uuid::now_v7().to_string(),
                    name: INITIAL_NAME.into(),
                    email: None,
                    email_print: None,
                    email_hint: None,
                    role: AccountRole::Admin,
                    initial: true,
                    passkeys: vec![],
                });
                accounts.save(&store)?;
            }
        }
        Ok(accounts)
    }

    /// Whether `email` is the one `account` was created with, however it is spelt.
    pub fn has_email(&self, account: &Account, email: &str) -> bool {
        account.email_print.as_deref() == Some(self.print(email).as_str())
    }

    /// The fingerprint an email is found by.
    fn print(&self, email: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.email_key).expect("HMAC takes any key");
        mac.update(normalise(email).as_bytes());
        hex(&mac.finalize().into_bytes())
    }

    fn save(&self, store: &Store) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(store).expect("accounts always serialize");
        room_file::write_private(&self.dir, FILE, &json).map_err(|e| format!("{FILE}: {e}"))
    }

    /// The current state of an Account; `None` once it is deleted, which ends its sessions.
    pub fn get(&self, id: &str) -> Option<Account> {
        self.store.lock().unwrap().accounts.iter().find(|a| a.id == id).cloned()
    }

    pub fn initial_id(&self) -> Option<String> {
        let store = self.store.lock().unwrap();
        store.accounts.iter().find(|a| a.initial).map(|a| a.id.clone())
    }

    pub fn views(&self) -> Vec<AccountView> {
        self.store.lock().unwrap().accounts.iter().map(Account::view).collect()
    }

    /// A new Account and the secret of its enrolment link.
    pub fn create(&self, name: &str, email: &str, role: AccountRole) -> Result<String, BackofficeError> {
        let (name, email) = (name.trim(), email.trim());
        if !valid_name(name) {
            return Err(BackofficeError::InvalidName);
        }
        if !valid_email(email) {
            return Err(BackofficeError::InvalidEmail);
        }
        let print = self.print(email);
        let mut store = self.store.lock().unwrap();
        if store.accounts.iter().any(|a| a.email_print.as_deref() == Some(&print)) {
            return Err(BackofficeError::EmailTaken);
        }
        let id = uuid::Uuid::now_v7().to_string();
        store.accounts.push(Account {
            id: id.clone(),
            name: name.into(),
            email: None,
            email_print: Some(print),
            email_hint: Some(hint(email)),
            role,
            initial: false,
            passkeys: vec![],
        });
        let token = Self::add_enrolment(&mut store, &id);
        self.persist(&store)?;
        Ok(token)
    }

    /// A new enrolment link for an Account, to finish signing up or recover it. Replaces earlier links.
    pub fn enrol_again(&self, id: &str) -> Result<Option<String>, BackofficeError> {
        let mut store = self.store.lock().unwrap();
        if !store.accounts.iter().any(|a| a.id == id) {
            return Ok(None);
        }
        let token = Self::add_enrolment(&mut store, id);
        self.persist(&store)?;
        Ok(Some(token))
    }

    fn add_enrolment(store: &mut Store, id: &str) -> String {
        let now = now_ms();
        store.enrolments.retain(|e| e.account != id && e.expires_ms > now);
        let token = random_token();
        store.enrolments.push(Enrolment {
            hash: hash(&token),
            account: id.into(),
            expires_ms: now + ENROLMENT_MS,
        });
        token
    }

    /// A failed write is reported instead of silently losing an Account after a restart.
    fn persist(&self, store: &Store) -> Result<(), BackofficeError> {
        self.save(store).map_err(|e| {
            eprintln!("accounts: cannot save: {e}");
            BackofficeError::NotSaved
        })
    }

    /// The Account a live enrolment link belongs to. The link is spent when a passkey is registered.
    pub fn enrolling(&self, token: &str) -> Option<Account> {
        let store = self.store.lock().unwrap();
        let now = now_ms();
        let hashed = hash(token);
        let enrolment = store
            .enrolments
            .iter()
            .find(|e| e.hash == hashed && e.expires_ms > now)?;
        store.accounts.iter().find(|a| a.id == enrolment.account).cloned()
    }

    /// Adds a registered passkey. With `token`, the enrolment link must still be live and is spent, so
    /// two tabs racing on the same link register one passkey.
    pub fn add_passkey(&self, id: &str, passkey: Passkey, token: Option<&str>) -> Result<(), BackofficeError> {
        let mut store = self.store.lock().unwrap();
        if let Some(token) = token {
            let (hashed, now) = (hash(token), now_ms());
            let live = store
                .enrolments
                .iter()
                .any(|e| e.hash == hashed && e.account == id && e.expires_ms > now);
            if !live {
                return Err(BackofficeError::InvalidEnrolment);
            }
            store.enrolments.retain(|e| e.hash != hashed);
        }
        let account = store
            .accounts
            .iter_mut()
            .find(|a| a.id == id)
            .ok_or(BackofficeError::InvalidEnrolment)?;
        account.passkeys.push(passkey);
        self.persist(&store)
    }

    /// Saves the signature counter after a sign-in, when it changed.
    pub fn signed_in(&self, id: &str, result: &AuthenticationResult) {
        let mut store = self.store.lock().unwrap();
        let Some(account) = store.accounts.iter_mut().find(|a| a.id == id) else {
            return;
        };
        let changed = account
            .passkeys
            .iter_mut()
            .any(|p| p.update_credential(result) == Some(true));
        if changed {
            let _ = self.persist(&store);
        }
    }

    /// Deletes an Account and its links. Refused if no other Admin could sign in afterwards.
    pub fn delete(&self, id: &str) -> Result<bool, BackofficeError> {
        let mut store = self.store.lock().unwrap();
        let Some(i) = store.accounts.iter().position(|a| a.id == id) else {
            return Ok(false);
        };
        let another_admin = store
            .accounts
            .iter()
            .any(|a| a.id != id && a.role == AccountRole::Admin && a.can_sign_in());
        if store.accounts[i].role == AccountRole::Admin && !another_admin {
            return Err(BackofficeError::LastAdmin);
        }
        store.accounts.remove(i);
        store.enrolments.retain(|e| e.account != id);
        self.persist(&store)?;
        Ok(true)
    }
}

#[cfg(test)]
impl Accounts {
    /// Skips the rule about the last Admin, which cannot be met without a real passkey.
    pub fn remove_for_test(&self, id: &str) {
        self.store.lock().unwrap().accounts.retain(|a| a.id != id);
    }
}

/// Passkey ceremonies between their two requests, in memory: a restart only makes people try again.
pub struct Ceremonies<T> {
    pending: Mutex<HashMap<String, (f64, T)>>,
}

impl<T> Default for Ceremonies<T> {
    fn default() -> Self {
        Ceremonies {
            pending: Mutex::new(HashMap::new()),
        }
    }
}

impl<T> Ceremonies<T> {
    /// Its id for the second request, or `None` when too many are unfinished.
    pub fn start(&self, state: T) -> Option<String> {
        let mut pending = self.pending.lock().unwrap();
        let oldest = now_ms() - CEREMONY_MS;
        pending.retain(|_, (started, _)| *started > oldest);
        if pending.len() >= MAX_CEREMONIES {
            return None;
        }
        let id = random_token();
        pending.insert(id.clone(), (now_ms(), state));
        Some(id)
    }

    /// Single use: a ceremony cannot be answered twice.
    pub fn finish(&self, id: &str) -> Option<T> {
        let (started, state) = self.pending.lock().unwrap().remove(id)?;
        (started > now_ms() - CEREMONY_MS).then_some(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> PathBuf {
        let dir = std::env::temp_dir().join(random_token());
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn initial(accounts: &Accounts) -> String {
        accounts.initial_id().unwrap()
    }

    #[test]
    fn the_first_start_creates_the_initial_admin_once() {
        let dir = folder();
        let id = initial(&Accounts::load_or_create(&dir).unwrap());
        assert_eq!(initial(&Accounts::load_or_create(&dir).unwrap()), id);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn the_file_is_private_and_keeps_links_only_hashed() {
        use std::os::unix::fs::PermissionsExt;
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        let token = accounts.create("Ana", "ana@example.com", AccountRole::Host).unwrap();
        let path = dir.join(FILE);
        assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        let json = std::fs::read_to_string(&path).unwrap();
        assert!(!json.contains(&token));
        assert!(!json.contains("ana@") && json.contains("a•••@example.com"));
        let key = dir.join(EMAIL_KEY_FILE);
        assert_eq!(std::fs::metadata(&key).unwrap().permissions().mode() & 0o777, 0o600);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn emails_are_validated_and_unique_ignoring_case() {
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        accounts.create("Ana", "Ana@Example.com", AccountRole::Host).unwrap();
        assert_eq!(
            accounts.create("Otra", "ana@example.com", AccountRole::Host),
            Err(BackofficeError::EmailTaken)
        );
        for bad in ["", "ana", "@b", "a@", "a b@c", "a@b@c"] {
            assert_eq!(
                accounts.create("X", bad, AccountRole::Host),
                Err(BackofficeError::InvalidEmail),
                "{bad}"
            );
        }
        assert_eq!(
            accounts.create("  ", "x@y", AccountRole::Host),
            Err(BackofficeError::InvalidName)
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn gmail_spellings_are_one_mailbox_and_other_providers_keep_theirs() {
        assert_eq!(normalise(" R.Od+news@GoogleMail.com "), "rod@gmail.com");
        assert_eq!(normalise("r.od+x@example.com"), "r.od+x@example.com");
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        accounts.create("Rod", "rod@gmail.com", AccountRole::Host).unwrap();
        assert_eq!(
            accounts.create("Otro", "r.o.d+podcast@googlemail.com", AccountRole::Host),
            Err(BackofficeError::EmailTaken)
        );
        accounts.create("Ana", "a.na@example.com", AccountRole::Host).unwrap();
        accounts.create("Ana 2", "ana@example.com", AccountRole::Host).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_account_knows_its_email_in_any_spelling() {
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        let token = accounts.create("Rod", "rod@gmail.com", AccountRole::Host).unwrap();
        let rod = accounts.enrolling(&token).unwrap();
        assert!(accounts.has_email(&rod, " R.od+x@googlemail.com"));
        assert!(!accounts.has_email(&rod, "rod@example.com"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn plain_emails_from_older_files_become_fingerprints_on_load() {
        let dir = folder();
        let old = r#"{"accounts":[{"id":"01a1c17a-b809-7108-a941-4cc0446b0272","name":"Ana","email":"ana@example.com","role":"admin"}],"enrolments":[]}"#;
        std::fs::write(dir.join(FILE), old).unwrap();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        let json = std::fs::read_to_string(dir.join(FILE)).unwrap();
        assert!(!json.contains("ana@example.com"));
        assert_eq!(accounts.views()[0].email_hint.as_deref(), Some("a•••@example.com"));
        assert_eq!(
            accounts.create("Otra", "Ana@Example.com", AccountRole::Host),
            Err(BackofficeError::EmailTaken)
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_link_is_replaced_by_a_new_one_and_a_wrong_one_finds_nobody() {
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        let first = accounts.create("Ana", "ana@example.com", AccountRole::Host).unwrap();
        let ana = accounts.enrolling(&first).unwrap();
        let second = accounts.enrol_again(&ana.id).unwrap().unwrap();
        assert!(accounts.enrolling(&first).is_none());
        assert_eq!(accounts.enrolling(&second).unwrap().id, ana.id);
        assert!(accounts.enrolling("nope").is_none());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_expired_link_is_not_live() {
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        let token = accounts.create("Ana", "ana@example.com", AccountRole::Host).unwrap();
        accounts.store.lock().unwrap().enrolments[0].expires_ms = now_ms() - 1.0;
        assert!(accounts.enrolling(&token).is_none());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_last_admin_able_to_sign_in_cannot_be_deleted() {
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        let first = initial(&accounts);
        assert_eq!(accounts.delete(&first), Err(BackofficeError::LastAdmin));
        // An Admin who has not registered a passkey yet could not take over.
        let token = accounts.create("Bea", "bea@example.com", AccountRole::Admin).unwrap();
        let bea = accounts.enrolling(&token).unwrap().id;
        assert_eq!(accounts.delete(&first), Err(BackofficeError::LastAdmin));
        // The initial Admin can still sign in, so Bea can go.
        assert_eq!(accounts.delete(&bea), Ok(true));
        assert!(accounts.get(&bea).is_none());
        assert_eq!(accounts.delete("nobody"), Ok(false));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_host_can_always_be_deleted_and_with_it_go_its_links() {
        let dir = folder();
        let accounts = Accounts::load_or_create(&dir).unwrap();
        let token = accounts.create("Ana", "ana@example.com", AccountRole::Host).unwrap();
        let ana = accounts.enrolling(&token).unwrap().id;
        assert_eq!(accounts.delete(&ana), Ok(true));
        assert!(accounts.enrolling(&token).is_none());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_ceremony_answers_once_and_memory_is_bounded() {
        let ceremonies = Ceremonies::<u8>::default();
        let id = ceremonies.start(7).unwrap();
        assert_eq!(ceremonies.finish(&id), Some(7));
        assert_eq!(ceremonies.finish(&id), None);
        for _ in 0..MAX_CEREMONIES {
            ceremonies.start(0).unwrap();
        }
        assert!(ceremonies.start(0).is_none());
    }
}
