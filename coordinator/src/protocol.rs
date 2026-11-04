//! Messages exchanged over the Room WebSocket. TypeScript bindings are
//! generated into `client/src/protocol/` by `cargo test` (ts-rs).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Role {
    Host,
    Guest,
}

#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ParticipantStatus {
    Connected,
    Disconnected,
}

/// Why a Participant's microphone may not be reaching their Track.
#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum MicProblem {
    /// The microphone track ended (device unplugged, permission revoked).
    Ended,
    /// The system muted the microphone track.
    Muted,
    /// The page is in the background; mobile systems often cut the microphone then.
    Hidden,
    /// Seconds of exact digital silence while recording.
    Silent,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ParticipantView {
    /// Fixed name set by the Host; unique in the Room.
    pub name: String,
    pub role: Role,
    pub status: ParticipantStatus,
    /// Coordinator clock minus Participant clock, as measured by the Participant.
    pub clock_offset_ms: Option<f64>,
    pub clock_rtt_ms: Option<f64>,
    /// Some of this Participant's Tracks still have audio pending upload.
    pub syncing: bool,
    pub mic_problem: Option<MicProblem>,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrackView {
    pub participant: String,
    /// 1 for the Track recorded from T; 2, 3… for parts recorded after reconnecting (CU7).
    pub part: u32,
    pub file: String,
    pub bytes: u64,
    /// When this part's first sample was recorded, relative to T (the Sync tone). 0 for part 1.
    pub start_offset_ms: f64,
}

#[derive(Debug, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export)]
pub enum ClientMessage {
    Ping {
        client_time: f64,
    },
    ClockOffset {
        offset_ms: f64,
        rtt_ms: f64,
    },
    /// The Participant's microphone status changed; `None` when it is fine again.
    MicStatus {
        problem: Option<MicProblem>,
    },
    /// While recording: `samples` recorded in the current part at Coordinator time `coordinator_time` (ms).
    /// Comparing marks over a long Take shows how far the Participant's audio clock drifts.
    DriftMark {
        take: u32,
        samples: u64,
        coordinator_time: f64,
    },
    /// Host only.
    Record,
    /// Host only.
    Stop,
}

#[derive(Clone, Debug, Serialize, TS)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
#[ts(export)]
pub enum ServerMessage {
    Welcome {
        name: String,
        role: Role,
        /// Frequency of this Participant's audible Sync tone: distinct per Participant, so each
        /// Track shows whose speakers it picked up (calibration tests in one room).
        tone_hz: f64,
    },
    /// `coordinator_time` is milliseconds since the Unix epoch.
    Pong {
        client_time: f64,
        coordinator_time: f64,
    },
    Roster {
        participants: Vec<ParticipantView>,
    },
    /// Every Participant inserts the Sync tone and starts its Track at `start_time` (Coordinator clock, ms).
    TakeStarted {
        take: u32,
        start_time: f64,
    },
    /// Every Participant ends its Track at `stop_time` (Coordinator clock, ms).
    TakeStopped {
        take: u32,
        stop_time: f64,
    },
    /// Complete Track parts of a Take; `pending` are the Participants who recorded it and still have audio to upload.
    TakeTracks {
        take: u32,
        expected: Vec<String>,
        pending: Vec<String>,
        tracks: Vec<TrackView>,
    },
}
