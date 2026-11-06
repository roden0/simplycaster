//! `room.json`, the only durable record of a Room (ADR-0002, ADR-0004): one schema to write it and to
//! read it back, so the two cannot drift apart. Fields that Rooms of iteration 0a lack are optional.
//! Invitation tokens never go here: this file is inside every download.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::protocol::Role;
use crate::tus::DriftMark;

const FILE: &str = "room.json";
const NOTE: &str = "Times are Coordinator clock, ms since the Unix epoch. startTime of a Take is T, the Sync tone.";

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RoomFile {
    #[serde(default = "note")]
    pub note: String,
    /// Missing in 0a: the folder name stands in.
    pub room: Option<String>,
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

    /// Written aside and renamed, so a process killed mid-write never leaves a truncated room.json.
    // shortcut: no fsync, so a power cut can still lose the last write; fsync file and folder if that matters.
    pub fn write(&self, dir: &Path) -> std::io::Result<()> {
        let tmp = dir.join("room.json.tmp");
        std::fs::write(
            &tmp,
            serde_json::to_vec_pretty(self).expect("room.json always serializes"),
        )?;
        std::fs::rename(&tmp, dir.join(FILE))
    }
}
