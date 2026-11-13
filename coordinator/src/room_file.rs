//! `room.json`, the only durable record of a Room (ADR-0002, ADR-0004): one schema to write it and to
//! read it back, so the two cannot drift apart. Fields that Rooms of iteration 0a lack are optional.
//! Invitation tokens never go here: this file is inside every download. They go in `invitations.json`,
//! which no download includes, only while the Room is open, so an open Room survives a restart (ADR-0007).

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::protocol::Role;
use crate::tus::DriftMark;

const FILE: &str = "room.json";
const INVITATIONS: &str = "invitations.json";
const NOTE: &str = "Times are Coordinator clock, ms since the Unix epoch. startTime of a Take is T, the Sync tone.";

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoomFile {
    #[serde(default = "note")]
    pub note: String,
    /// Missing in 0a: the folder name stands in.
    pub room: Option<String>,
    /// What the creator typed; the slug in `room` stands in for older Rooms.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Not used as a key yet (ADR-0011); older Rooms have none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    /// The Account that created the Room; older Rooms have none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    /// `YYYY-MM-DD`; missing in 0a: the date of the first Take stands in.
    pub created: Option<String>,
    /// Saved since the time is shown; older Rooms only know their date.
    pub created_at: Option<f64>,
    #[serde(default)]
    pub closed: bool,
    /// Missing in 0a: the Participants come from the parts.
    pub participants: Option<Vec<ParticipantFile>>,
    pub takes: Vec<TakeFile>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct ParticipantFile {
    pub name: String,
    pub role: Role,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TakeFile {
    pub take: u32,
    pub start_time: f64,
    pub stop_time: Option<f64>,
    pub tracks: Vec<PartFile>,
    /// Deleted from a closed Room: kept, without Tracks, so the Takes after it keep their numbers.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub deleted: bool,
}

/// A Track part: what an editor needs to align it, and what a restart needs to list it again.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PartFile {
    pub participant: String,
    pub part: u32,
    pub file: String,
    pub complete: bool,
    pub bytes: u64,
    /// Audio actually received; shorter than the Take if the browser stopped early.
    pub duration_ms: Option<f64>,
    pub start_time: f64,
    #[serde(default)]
    pub start_offset_ms: f64,
    pub sample_rate: u32,
    #[serde(default)]
    pub tone_hz: f64,
    pub output_latency_ms: Option<f64>,
    pub input_latency_ms: Option<f64>,
    pub calibrated_round_trip_ms: Option<f64>,
    pub clock_offset_ms: Option<f64>,
    pub clock_rtt_ms: Option<f64>,
    #[serde(default)]
    pub drift_marks: Vec<DriftMark>,
    /// What the FLAC delivery corrects (ADR-0004); null when the marks are too few.
    pub drift_ppm: Option<f64>,
    /// Audio missing (filled with silence in the FLAC) or, negative, extra between two drift marks
    /// (ADR-0010). Left out when there are none, as in every file written before it.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub gaps: Vec<crate::realign::Gap>,
}

/// An Invitation of an open Room, with its secret.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct InvitationFile {
    pub name: String,
    pub role: Role,
    pub token: String,
}

/// The Invitations of an open Room, in Invitation order (it sets each Sync tone); `None` when the
/// file is missing, as in closed Rooms and Rooms saved before ADR-0007.
pub fn read_invitations(dir: &Path) -> Option<Vec<InvitationFile>> {
    let json = std::fs::read(dir.join(INVITATIONS)).ok()?;
    serde_json::from_slice(&json)
        .inspect_err(|e| eprintln!("{}: unreadable {INVITATIONS}: {e}", dir.display()))
        .ok()
}

pub fn write_invitations(dir: &Path, invitations: &[InvitationFile]) -> std::io::Result<()> {
    write_private(
        dir,
        INVITATIONS,
        &serde_json::to_vec_pretty(invitations).expect("always serializes"),
    )
}

/// Closing expires every Invitation: their secrets leave the disk.
pub fn remove_invitations(dir: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(dir.join(INVITATIONS)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Written aside and renamed, so a process killed mid-write never leaves a truncated file.
// shortcut: no fsync, so a power cut can still lose the last write; fsync file and folder if that matters.
fn write_atomic(dir: &Path, name: &str, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = dir.join(format!("{name}.tmp"));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, dir.join(name))
}

/// Like `write_atomic`, for files that hold secrets or personal data: only the Coordinator may read them.
pub fn write_private(dir: &Path, name: &str, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let tmp = dir.join(format!("{name}.tmp"));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(&tmp)?.write_all(bytes)?;
    std::fs::rename(&tmp, dir.join(name))
}

/// Deletes a Room's folder. `room.json` goes first: a Room half deleted by a crash is not loaded again.
pub fn remove_room(dir: &Path) -> std::io::Result<()> {
    std::fs::remove_file(dir.join(FILE))?;
    std::fs::remove_dir_all(dir)
}

fn note() -> String {
    NOTE.into()
}

impl RoomFile {
    pub fn new(
        room: &str,
        created: &str,
        created_at: Option<f64>,
        closed: bool,
        participants: Vec<ParticipantFile>,
        takes: Vec<TakeFile>,
    ) -> Self {
        RoomFile {
            note: note(),
            room: Some(room.into()),
            display_name: None,
            uuid: None,
            creator: None,
            created: Some(created.into()),
            created_at,
            closed,
            participants: Some(participants),
            takes,
        }
    }

    pub fn read(dir: &Path) -> Result<RoomFile, String> {
        let json = std::fs::read(dir.join(FILE)).map_err(|e| e.to_string())?;
        serde_json::from_slice(&json).map_err(|e| e.to_string())
    }

    pub fn write(&self, dir: &Path) -> std::io::Result<()> {
        write_atomic(
            dir,
            FILE,
            &serde_json::to_vec_pretty(self).expect("room.json always serializes"),
        )
    }
}
