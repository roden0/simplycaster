//! Optional email over SMTP (ADR-0012). Without `SMTP_URL` the backoffice offers no sending and every
//! link is copied by hand, as before. Recording never depends on it.

use lettre::message::{Mailbox, header::ContentType};
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::protocol::BackofficeError;

/// The emails' texts (`en`), like the rest of the visible text: one entry per message.
pub mod en {
    pub const INVITATION_SUBJECT: &str = "Your invitation to record {room}";
    pub const INVITATION_BODY: &str = "Hi {name},\n\nYou are invited to record {room} on SimplyCaster. \
Open this link in Chrome, Firefox or Safari, ideally with headphones:\n\n{link}\n\n\
The link is yours alone: do not share it.\n";
    pub const SIGN_IN_SUBJECT: &str = "Your SimplyCaster sign-in link";
    pub const SIGN_IN_BODY: &str = "Hi {name},\n\nOpen this link to sign in to SimplyCaster. \
It works once, for the next 15 minutes:\n\n{link}\n\n\
If you did not ask for it, ignore this email: nobody can sign in without the link.\n";
    pub const ENROLMENT_SUBJECT: &str = "Set up your SimplyCaster account";
    pub const ENROLMENT_BODY: &str = "Hi {name},\n\nOpen this link to set up your SimplyCaster account \
with a passkey. It works once, for the next 72 hours:\n\n{link}\n\n\
If you did not expect this email, you can ignore it.\n";
}

/// Fills `{key}` placeholders.
pub fn fill(text: &str, values: &[(&str, &str)]) -> String {
    values
        .iter()
        .fold(text.to_string(), |s, (k, v)| s.replace(&format!("{{{k}}}"), v))
}

pub struct Mailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    /// Links in an email must be absolute.
    public_url: String,
}

impl Mailer {
    /// From `SMTP_URL` (`smtps://user:password@host:465`) and `SMTP_FROM`; `None` when `SMTP_URL` is unset.
    pub fn from_env(public_url: Option<&str>) -> Result<Option<Mailer>, String> {
        let Some(url) = std::env::var("SMTP_URL").ok().filter(|u| !u.is_empty()) else {
            return Ok(None);
        };
        let public_url = public_url.ok_or("SMTP_URL needs PUBLIC_URL, for the links in the emails")?;
        let from = std::env::var("SMTP_FROM")
            .map_err(|_| "SMTP_URL needs SMTP_FROM, the sender (`SimplyCaster <podcast@example.com>`)")?
            .parse()
            .map_err(|e| format!("SMTP_FROM: {e}"))?;
        let transport = AsyncSmtpTransport::<Tokio1Executor>::from_url(&url)
            .map_err(|e| format!("SMTP_URL: {e}"))?
            .build();
        Ok(Some(Mailer {
            transport,
            from,
            public_url: public_url.trim_end_matches('/').into(),
        }))
    }

    /// `path` (starting with `/`) on this instance.
    pub fn link(&self, path: &str) -> String {
        format!("{}{path}", self.public_url)
    }

    /// A plain-text email. A failure is logged and reported, so the link can still be copied by hand.
    pub async fn send(&self, to: &str, subject: String, body: String) -> Result<(), BackofficeError> {
        let to: Mailbox = to.trim().parse().map_err(|_| BackofficeError::InvalidEmail)?;
        let message = Message::builder()
            .from(self.from.clone())
            .to(to)
            .subject(subject)
            .header(ContentType::TEXT_PLAIN)
            .body(body)
            .map_err(|_| BackofficeError::InvalidEmail)?;
        self.transport.send(message).await.map(drop).map_err(|e| {
            eprintln!("mail: not sent: {e}");
            BackofficeError::MailFailed
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholders_are_filled() {
        let text = fill(en::INVITATION_SUBJECT, &[("room", "Episode 12")]);
        assert_eq!(text, "Your invitation to record Episode 12");
    }
}
