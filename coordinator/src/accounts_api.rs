//! HTTP face of the Accounts (ADR-0011): the extractors that protect the backoffice, signing in, enrolment
//! links and Account management. The rules live in `accounts`.
// Handlers fail with a ready Response, axum's usual style; its size does not matter here.
#![allow(clippy::result_large_err)]

use axum::Json;
use axum::extract::{FromRequestParts, Path, State};
use axum::http::request::Parts;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use webauthn_rs::prelude::{
    DiscoverableAuthentication, DiscoverableKey, PasskeyRegistration, Uuid, Webauthn, WebauthnBuilder,
};
use webauthn_rs_proto::ResidentKeyRequirement;

use crate::accounts::Account;
use crate::protocol::{
    AccountRole, AccountView, BackofficeError, CreateAccount, EnrolmentLink, FinishLogin, FinishRegistration, Me,
    PasskeyChallenge, SignIn, SignInOptions, StartEnrolment,
};
use crate::{AppState, session};

/// A request from a signed-in Account. As an extractor, a handler cannot forget to check it; the Account
/// is looked up every time, so deleting it or changing its role takes effect on its next request.
pub struct SignedIn {
    pub id: String,
    pub role: AccountRole,
}

impl SignedIn {
    /// A Host manages the Rooms they created; an Admin, every Room, also those without a Creator.
    pub fn can_manage(&self, creator: Option<&str>) -> bool {
        self.role == AccountRole::Admin || creator == Some(self.id.as_str())
    }
}

impl FromRequestParts<AppState> for SignedIn {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        session::cookie(&parts.headers, session::ACCOUNT_COOKIE)
            .and_then(|jwt| state.keys.verify(jwt))
            .and_then(|subject| state.accounts.get(subject.strip_prefix(session::ACCOUNT_PREFIX)?))
            .map(|a| SignedIn { id: a.id, role: a.role })
            .ok_or_else(|| StatusCode::UNAUTHORIZED.into_response())
    }
}

/// A signed-in Admin.
pub struct Admin;

impl FromRequestParts<AppState> for Admin {
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        match SignedIn::from_request_parts(parts, state).await?.role {
            AccountRole::Admin => Ok(Admin),
            AccountRole::Host => Err(StatusCode::FORBIDDEN.into_response()),
        }
    }
}

/// A registration between its two requests, and the enrolment link that started it, if any.
pub struct Registering {
    account: String,
    link: Option<String>,
    state: PasskeyRegistration,
}

pub type Logins = crate::accounts::Ceremonies<DiscoverableAuthentication>;
pub type Registrations = crate::accounts::Ceremonies<Registering>;

/// Relying party for `public_url`: passkeys belong to its host name, so changing it means enrolling again.
pub fn webauthn(public_url: &str) -> Result<Webauthn, String> {
    let url = webauthn_rs::prelude::Url::parse(public_url).map_err(|e| format!("PUBLIC_URL: {e}"))?;
    let host = url
        .domain()
        .ok_or("PUBLIC_URL needs a domain name, not an IP")?
        .to_string();
    WebauthnBuilder::new(&host, &url)
        .and_then(|b| b.rp_name("SimplyCaster").build())
        .map_err(|e| format!("PUBLIC_URL: {e}"))
}

pub fn error(e: BackofficeError) -> Response {
    let status = match e {
        BackofficeError::InvalidName | BackofficeError::InvalidEmail => StatusCode::BAD_REQUEST,
        BackofficeError::InvalidEnrolment => StatusCode::NOT_FOUND,
        BackofficeError::PasskeysUnavailable => StatusCode::SERVICE_UNAVAILABLE,
        BackofficeError::NotSaved => StatusCode::INTERNAL_SERVER_ERROR,
        _ => StatusCode::CONFLICT,
    };
    (status, Json(e)).into_response()
}

fn passkeys(state: &AppState) -> Result<&Webauthn, Response> {
    state
        .webauthn
        .as_ref()
        .ok_or_else(|| error(BackofficeError::PasskeysUnavailable))
}

/// The response that starts a session for an Account.
fn session_for(state: &AppState, id: &str) -> Response {
    let subject = format!("{}{id}", session::ACCOUNT_PREFIX);
    let jwt = state.keys.sign(&subject, session::ACCOUNT_SECONDS);
    let cookie = session::set_cookie(session::ACCOUNT_COOKIE, &jwt, session::ACCOUNT_SECONDS);
    (StatusCode::NO_CONTENT, [(header::SET_COOKIE, cookie)]).into_response()
}

/// What the sign-in page offers.
pub async fn sign_in_options(State(state): State<AppState>) -> Json<SignInOptions> {
    Json(SignInOptions {
        token: state.accounts.initial_id().is_some(),
        passkeys: state.webauthn.is_some(),
    })
}

/// Signs in as the initial Admin with `BACKOFFICE_TOKEN`, sent once in a body (ADR-0009). Deleting
/// that Account retires the token even if it stays in the environment.
pub async fn sign_in(State(state): State<AppState>, Json(req): Json<SignIn>) -> Response {
    match state.accounts.initial_id() {
        Some(id) if session::same_secret(&req.token, &state.backoffice_token) => session_for(&state, &id),
        _ => StatusCode::UNAUTHORIZED.into_response(),
    }
}

pub async fn sign_out() -> Response {
    let cookie = session::set_cookie(session::ACCOUNT_COOKIE, "", 0);
    (StatusCode::NO_CONTENT, [(header::SET_COOKIE, cookie)]).into_response()
}

pub async fn me(who: SignedIn, State(state): State<AppState>) -> Result<Json<Me>, Response> {
    let account = state
        .accounts
        .get(&who.id)
        .ok_or_else(|| StatusCode::UNAUTHORIZED.into_response())?;
    Ok(Json(Me {
        name: account.name,
        role: account.role,
        initial: account.initial,
    }))
}

/// Starts a sign-in where the browser offers the passkeys it holds: one touch, nothing typed.
pub async fn login_start(State(state): State<AppState>) -> Result<Json<PasskeyChallenge>, Response> {
    let (options, ceremony) = passkeys(&state)?
        .start_discoverable_authentication()
        .map_err(|e| failed("login start", e))?;
    let ceremony = state
        .logins
        .start(ceremony)
        .ok_or_else(|| error(BackofficeError::PasskeysUnavailable))?;
    let options = serde_json::to_value(options.public_key).expect("options always serialize");
    Ok(Json(PasskeyChallenge { ceremony, options }))
}

pub async fn login_finish(State(state): State<AppState>, Json(req): Json<FinishLogin>) -> Response {
    let unauthorized = || StatusCode::UNAUTHORIZED.into_response();
    let Ok(webauthn) = passkeys(&state) else {
        return error(BackofficeError::PasskeysUnavailable);
    };
    let Some(ceremony) = state.logins.finish(&req.ceremony) else {
        return unauthorized();
    };
    let Ok((user, credential)) = webauthn.identify_discoverable_authentication(&req.credential) else {
        return unauthorized();
    };
    let Some(account) = state.accounts.get(&user.to_string()) else {
        return unauthorized();
    };
    let Some(passkey) = account.passkeys.iter().find(|p| p.cred_id().as_slice() == credential) else {
        return unauthorized();
    };
    match webauthn.finish_discoverable_authentication_v2(&req.credential, ceremony, DiscoverableKey::from(passkey)) {
        Ok(result) => {
            state.accounts.signed_in(&account.id, &result);
            session_for(&state, &account.id)
        }
        Err(_) => unauthorized(),
    }
}

/// An enrolment link opened: it stays live until a passkey is registered with it.
pub async fn enrolment_start(
    State(state): State<AppState>,
    Json(req): Json<StartEnrolment>,
) -> Result<Json<PasskeyChallenge>, Response> {
    let account = state
        .accounts
        .enrolling(&req.token)
        .ok_or_else(|| error(BackofficeError::InvalidEnrolment))?;
    registration(&state, &account, Some(req.token)).map(Json)
}

/// Another passkey for the signed-in Account (a second device, so losing one is no emergency).
pub async fn passkey_start(who: SignedIn, State(state): State<AppState>) -> Result<Json<PasskeyChallenge>, Response> {
    let account = state
        .accounts
        .get(&who.id)
        .ok_or_else(|| StatusCode::UNAUTHORIZED.into_response())?;
    registration(&state, &account, None).map(Json)
}

fn registration(state: &AppState, account: &Account, link: Option<String>) -> Result<PasskeyChallenge, Response> {
    let id = Uuid::parse_str(&account.id).expect("the Coordinator generates these ids");
    let known = account.passkeys.iter().map(|p| p.cred_id().clone()).collect();
    let label = account.email.as_deref().unwrap_or(&account.name);
    let (mut options, registration) = passkeys(state)?
        .start_passkey_registration(id, label, &account.name, Some(known))
        .map_err(|e| failed("registration start", e))?;
    // Sign-in names no user, so the authenticator must keep the credential discoverable.
    if let Some(selection) = options.public_key.authenticator_selection.as_mut() {
        selection.resident_key = Some(ResidentKeyRequirement::Required);
        selection.require_resident_key = true;
    }
    let ceremony = state
        .registrations
        .start(Registering {
            account: account.id.clone(),
            link,
            state: registration,
        })
        .ok_or_else(|| error(BackofficeError::PasskeysUnavailable))?;
    let options = serde_json::to_value(options.public_key).expect("options always serialize");
    Ok(PasskeyChallenge { ceremony, options })
}

pub async fn registration_finish(State(state): State<AppState>, Json(req): Json<FinishRegistration>) -> Response {
    let Ok(webauthn) = passkeys(&state) else {
        return error(BackofficeError::PasskeysUnavailable);
    };
    let Some(ceremony) = state.registrations.finish(&req.ceremony) else {
        return error(BackofficeError::InvalidEnrolment);
    };
    let passkey = match webauthn.finish_passkey_registration(&req.credential, &ceremony.state) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("accounts: passkey not registered: {e}");
            return StatusCode::BAD_REQUEST.into_response();
        }
    };
    match state
        .accounts
        .add_passkey(&ceremony.account, passkey, ceremony.link.as_deref())
    {
        Ok(()) => session_for(&state, &ceremony.account),
        Err(e) => error(e),
    }
}

fn failed(what: &str, e: impl std::fmt::Display) -> Response {
    eprintln!("accounts: {what} failed: {e}");
    StatusCode::INTERNAL_SERVER_ERROR.into_response()
}

pub async fn list(_: Admin, State(state): State<AppState>) -> Json<Vec<AccountView>> {
    Json(state.accounts.views())
}

pub async fn create(
    _: Admin,
    State(state): State<AppState>,
    Json(req): Json<CreateAccount>,
) -> Result<Json<EnrolmentLink>, Response> {
    let token = state.accounts.create(&req.name, &req.email, req.role).map_err(error)?;
    Ok(Json(EnrolmentLink { token }))
}

pub async fn enrol_again(
    _: Admin,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<EnrolmentLink>, Response> {
    match state.accounts.enrol_again(&id).map_err(error)? {
        Some(token) => Ok(Json(EnrolmentLink { token })),
        None => Err(StatusCode::NOT_FOUND.into_response()),
    }
}

/// Their Rooms stay, and the Creator recorded in them no longer matches anyone: only an Admin sees them.
pub async fn delete(_: Admin, Path(id): Path<String>, State(state): State<AppState>) -> Result<StatusCode, Response> {
    match state.accounts.delete(&id).map_err(error)? {
        true => Ok(StatusCode::NO_CONTENT),
        false => Err(StatusCode::NOT_FOUND.into_response()),
    }
}
