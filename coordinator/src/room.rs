//! A Room and its rules: Invitations, Takes, Track parts and what `room.json` records of them.
//! Tested without a network: messages go out through each Participant's channel.

use std::path::PathBuf;

use tokio::sync::mpsc;

use crate::protocol::{
    BackofficeError, FlacState, InvitationView, ParticipantStatus, ParticipantView, Role, RoomView, ServerMessage,
    TrackView,
};
use crate::room_file::{ParticipantFile, RoomFile, TakeFile};
use crate::{flac, now_ms, random_token, tus, utc_date};

/// A Room holds the Host and up to four Guests.
pub(crate) const MAX_PARTICIPANTS: usize = 5;
/// Lead time so the TakeStarted message reaches everyone before T.
pub(crate) const START_LEAD_MS: f64 = 1500.0;
/// Lead time so everyone ends the Track at the same Coordinator instant.
pub(crate) const STOP_LEAD_MS: f64 = 500.0;

pub(crate) struct Participant {
    /// Secret of this Participant's Invitation link, `/i/{token}`.
    pub(crate) token: String,
    pub(crate) view: ParticipantView,
    /// Live connection: (connection id, outbound queue). `None` when disconnected.
    pub(crate) conn: Option<(u64, mpsc::UnboundedSender<ServerMessage>)>,
}

impl Participant {
    /// A disconnected Participant with a fresh Invitation token.
    pub(crate) fn new(name: &str, role: Role) -> Self {
        Participant {
            token: random_token(),
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
        }
    }
}

pub(crate) struct Room {
    /// `<name>_<date>`: the folder name and the prefix of every file in it.
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created: String,
    pub(crate) created_at: Option<f64>,
    /// Closed Rooms are immutable and their Invitations have expired (CU8, ADR-0002).
    pub(crate) closed: bool,
    pub(crate) flac: FlacState,
    pub(crate) participants: Vec<Participant>,
    pub(crate) next_conn_id: u64,
    pub(crate) recording: bool,
    /// Index = Take number - 1.
    pub(crate) takes: Vec<Take>,
    /// Folder where this Room's Tracks are stored.
    pub(crate) dir: PathBuf,
    pub(crate) uploads: Vec<tus::Upload>,
}

pub(crate) struct Take {
    /// T, the instant of the Sync tone (Coordinator clock, ms).
    pub(crate) start_time: f64,
    pub(crate) stop_time: Option<f64>,
}

impl Room {
    pub(crate) fn new(id: String, name: String, dir: PathBuf) -> Self {
        Room {
            id,
            name,
            created: utc_date(now_ms()),
            created_at: Some(now_ms()),
            closed: false,
            flac: FlacState::None,
            participants: Vec::new(),
            next_conn_id: 0,
            recording: false,
            takes: Vec::new(),
            dir,
            uploads: Vec::new(),
        }
    }

    /// Creates an Invitation (CU2): a new Participant with its own secret link.
    pub(crate) fn invite(&mut self, name: &str, role: Role) -> Result<(), BackofficeError> {
        if self.closed {
            return Err(BackofficeError::Closed);
        }
        if !valid_name(name) {
            return Err(BackofficeError::InvalidName);
        }
        if self.participants.iter().any(|p| p.view.name == name) {
            return Err(BackofficeError::NameTaken);
        }
        if self.participants.len() >= MAX_PARTICIPANTS {
            return Err(BackofficeError::RoomFull);
        }
        self.participants.push(Participant::new(name, role));
        self.broadcast_roster();
        Ok(())
    }

    /// A past Room from its `room.json`, closed: its Invitations were never saved, and a Room
    /// is not reopened (ADR-0002). Rooms of iteration 0a lack name, date and participants.
    pub(crate) fn load(dir: PathBuf) -> Result<Room, String> {
        let saved = RoomFile::read(&dir)?;
        let id = dir.file_name().unwrap().to_string_lossy().into_owned();
        let mut room = Room::new(id.clone(), saved.room.unwrap_or(id), dir);
        room.closed = true;
        room.created = saved
            .created
            .or_else(|| saved.takes.first().map(|t| utc_date(t.start_time)))
            .unwrap_or_default();
        // Saved since the time was shown; older Rooms only know their date.
        room.created_at = saved.created_at;
        let mut takes = saved.takes;
        takes.sort_by_key(|t| t.take);
        for (i, t) in takes.into_iter().enumerate() {
            let take = i as u32 + 1;
            room.takes.push(Take {
                start_time: t.start_time,
                stop_time: t.stop_time,
            });
            room.uploads
                .extend(t.tracks.into_iter().map(|p| tus::Upload::from_file(take, p)));
        }
        // FLACs are renamed into place only when complete, so all present means converted.
        if !room.uploads.is_empty() && room.uploads.iter().all(|u| room.flac_path(u).is_file()) {
            room.flac = FlacState::Ready;
        }
        let mut people = saved.participants.unwrap_or_default();
        for u in &room.uploads {
            if !people.iter().any(|p| p.name == u.participant) {
                // In 0a the Host was always "host".
                let role = if u.participant == "host" {
                    Role::Host
                } else {
                    Role::Guest
                };
                people.push(ParticipantFile {
                    name: u.participant.clone(),
                    role,
                });
            }
        }
        for p in people {
            room.participants.push(Participant::new(&p.name, p.role));
        }
        Ok(room)
    }

    /// Number of the last Take started (0 = none yet).
    pub(crate) fn take_count(&self) -> u32 {
        self.takes.len() as u32
    }

    pub(crate) fn flac_path(&self, u: &tus::Upload) -> PathBuf {
        flac::path(&self.dir, &u.id)
    }

    pub(crate) fn find(&mut self, name: &str) -> Option<&mut Participant> {
        self.participants.iter_mut().find(|p| p.view.name == name)
    }

    /// Audible Sync tone frequency of a Participant: 1000 Hz, 1500 Hz… in Invitation order.
    pub(crate) fn tone_hz(&self, name: &str) -> f64 {
        let i = self.participants.iter().position(|p| p.view.name == name).unwrap_or(0);
        1000.0 + 500.0 * i as f64
    }

    pub(crate) fn broadcast_roster(&self) {
        self.broadcast(ServerMessage::Roster {
            participants: self.participants.iter().map(|p| p.view.clone()).collect(),
        });
    }

    /// Participants that recorded (part of) a Take, in the order they started.
    pub(crate) fn take_expected(&self, take: u32) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        for u in self.uploads.iter().filter(|u| u.take == take) {
            if !names.contains(&u.participant) {
                names.push(u.participant.clone());
            }
        }
        names
    }

    /// Participants with some part of this Take not yet fully uploaded.
    pub(crate) fn take_pending(&self, take: u32) -> Vec<String> {
        let mut names = self.take_expected(take);
        names.retain(|n| {
            self.uploads
                .iter()
                .any(|u| u.take == take && &u.participant == n && !u.is_complete())
        });
        names
    }

    /// Participants with audio of any Take not yet uploaded.
    pub(crate) fn pending(&self) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        for n in (1..=self.take_count()).flat_map(|t| self.take_pending(t)) {
            if !names.contains(&n) {
                names.push(n);
            }
        }
        names
    }

    pub(crate) fn take_tracks(&self, take: u32) -> Vec<TrackView> {
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

    pub(crate) fn take_tracks_message(&self, take: u32) -> ServerMessage {
        ServerMessage::TakeTracks {
            take,
            expected: self.take_expected(take),
            pending: self.take_pending(take),
            tracks: self.take_tracks(take),
        }
    }

    /// A Participant is syncing while a stopped Take still has audio of theirs pending upload.
    pub(crate) fn refresh_syncing(&mut self) {
        let stopped = if self.recording {
            self.take_count() - 1
        } else {
            self.take_count()
        };
        let pending: Vec<String> = (1..=stopped).flat_map(|t| self.take_pending(t)).collect();
        for p in &mut self.participants {
            p.view.syncing = pending.contains(&p.view.name);
        }
    }

    pub(crate) fn start_take(&mut self) {
        if self.recording || self.closed {
            return;
        }
        self.recording = true;
        let start_time = now_ms() + START_LEAD_MS;
        self.takes.push(Take {
            start_time,
            stop_time: None,
        });
        self.broadcast(ServerMessage::TakeStarted {
            take: self.take_count(),
            start_time,
        });
    }

    pub(crate) fn stop_take(&mut self) {
        if !self.recording {
            return;
        }
        self.recording = false;
        let (take, stop_time) = (self.take_count(), now_ms() + STOP_LEAD_MS);
        self.takes[take as usize - 1].stop_time = Some(stop_time);
        self.broadcast(ServerMessage::TakeStopped { take, stop_time });
        self.broadcast_take_tracks(take);
        self.save_metadata();
        self.refresh_syncing();
        self.broadcast_roster();
    }

    /// Closes the Room (CU8): what has not been uploaded stays incomplete, and every Invitation expires.
    pub(crate) fn close(&mut self) -> Result<(), BackofficeError> {
        if self.closed {
            return Err(BackofficeError::Closed);
        }
        // Closing mid-Take would cut every Track short: the Host stops first.
        if self.recording {
            return Err(BackofficeError::Recording);
        }
        self.closed = true;
        self.save_metadata();
        self.broadcast(ServerMessage::RoomClosed);
        Ok(())
    }

    pub(crate) fn view(&self) -> RoomView {
        RoomView {
            id: self.id.clone(),
            name: self.name.clone(),
            created: self.created.clone(),
            created_at: self.created_at,
            closed: self.closed,
            recording: self.recording,
            takes: self.take_count(),
            pending: self.pending(),
            flac: self.flac,
            invitations: self
                .participants
                .iter()
                .map(|p| InvitationView {
                    name: p.view.name.clone(),
                    role: p.view.role,
                    token: p.token.clone(),
                    status: p.view.status,
                })
                .collect(),
        }
    }

    /// Writes `room.json` next to the Tracks: what an editor needs to align them.
    // shortcut: rewritten whole on every change; fine for a handful of Takes.
    pub(crate) fn save_metadata(&self) {
        let takes = (1..=self.take_count())
            .map(|take| {
                let t = &self.takes[take as usize - 1];
                let tracks = self
                    .uploads
                    .iter()
                    .filter(|u| u.take == take)
                    .map(|u| u.to_file(t.start_time, self.tone_hz(&u.participant), u.duration_ms(&self.dir)))
                    .collect();
                TakeFile {
                    take,
                    start_time: t.start_time,
                    stop_time: t.stop_time,
                    tracks,
                }
            })
            .collect();
        let participants = self
            .participants
            .iter()
            .map(|p| ParticipantFile {
                name: p.view.name.clone(),
                role: p.view.role,
            })
            .collect();
        let file = RoomFile::new(
            &self.name,
            &self.created,
            self.created_at,
            self.closed,
            participants,
            takes,
        );
        if let Err(e) = file.write(&self.dir) {
            eprintln!("{}: cannot write room.json: {e}", self.id);
        }
    }

    pub(crate) fn broadcast_take_tracks(&self, take: u32) {
        self.broadcast(self.take_tracks_message(take));
    }

    pub(crate) fn broadcast(&self, msg: ServerMessage) {
        for (_, tx) in self.participants.iter().filter_map(|p| p.conn.as_ref()) {
            let _ = tx.send(msg.clone());
        }
    }
}

/// Fixed names end up in file names: lowercase letters, digits and `-` only.
pub(crate) fn valid_name(name: &str) -> bool {
    (1..=40).contains(&name.len())
        && name
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

/// File stem of a Track part: `<room>_t01_ana`, then `<room>_t01_ana_p2`… after reconnecting.
pub(crate) fn track_stem(room: &str, take: u32, participant: &str, part: u32) -> String {
    match part {
        1 => format!("{room}_t{take:02}_{participant}"),
        _ => format!("{room}_t{take:02}_{participant}_p{part}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_safe_for_files() {
        assert!(valid_name("ana"));
        assert!(valid_name("prueba-sync-2"));
        for bad in ["", "Ana", "a b", "../x", "a_b", &"x".repeat(41)] {
            assert!(!valid_name(bad), "{bad:?}");
        }
    }

    /// A Room folder named `id` holding `json` as its room.json.
    fn room_folder(id: &str, json: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(random_token()).join(id);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("room.json"), json).unwrap();
        dir
    }

    fn saved_json(dir: &std::path::Path) -> serde_json::Value {
        serde_json::from_slice(&std::fs::read(dir.join("room.json")).unwrap()).unwrap()
    }

    #[test]
    fn a_0a_room_loads_with_what_it_lacks_derived() {
        // 0a saved no name, date nor participants: they come from the folder, the first Take and the parts.
        let dir = room_folder("prueba", include_str!("testdata/room-0a.json"));
        let room = Room::load(dir.clone()).unwrap();
        assert!(room.closed);
        assert_eq!((room.id.as_str(), room.name.as_str()), ("prueba", "prueba"));
        assert_eq!((room.created.as_str(), room.created_at), ("2026-11-04", None));
        let people: Vec<_> = room
            .participants
            .iter()
            .map(|p| (p.view.name.as_str(), p.view.role))
            .collect();
        assert_eq!(people, [("host", Role::Host), ("ana", Role::Guest)]);
        assert_eq!(room.take_count(), 1);
        let parts: Vec<_> = room
            .uploads
            .iter()
            .map(|u| (u.id.as_str(), u.part, u.is_complete()))
            .collect();
        assert_eq!(
            parts,
            [("t01_host", 1, true), ("t01_ana", 1, false), ("t01_ana_p2", 2, true)]
        );
        assert_eq!(room.uploads[0].drift_marks.len(), 1);
        assert_eq!(room.uploads[1].calibrated_round_trip_ms, Some(180.0));

        // Saved again it gains the current fields, and loads the same.
        room.save_metadata();
        let again = Room::load(dir.clone()).unwrap();
        assert_eq!((again.name.as_str(), again.created.as_str()), ("prueba", "2026-11-04"));
        assert_eq!(again.participants.len(), 2);
        assert_eq!(again.uploads.len(), 3);
        std::fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_current_room_is_saved_back_unchanged() {
        let original = include_str!("testdata/room-current.json");
        let dir = room_folder("directo_2026-11-05", original);
        let room = Room::load(dir.clone()).unwrap();
        room.save_metadata();
        // Every field survives a load and a save, as the editor reading room.json expects.
        assert_eq!(
            saved_json(&dir),
            serde_json::from_str::<serde_json::Value>(original).unwrap()
        );
        std::fs::remove_dir_all(dir.parent().unwrap()).unwrap();
    }

    #[test]
    fn invitations_are_unique_and_limited() {
        let mut room = Room::new("r_2026-11-05".into(), "r".into(), PathBuf::from("."));
        room.invite("host", Role::Host).unwrap();
        assert_eq!(room.invite("host", Role::Guest), Err(BackofficeError::NameTaken));
        for n in ["a", "b", "c", "d"] {
            room.invite(n, Role::Guest).unwrap();
        }
        assert_eq!(room.invite("e", Role::Guest), Err(BackofficeError::RoomFull));
        let tokens: Vec<_> = room.participants.iter().map(|p| &p.token).collect();
        assert!(tokens.iter().all(|t| t.len() == 32) && tokens[0] != tokens[1]);
    }

    #[test]
    fn closing_waits_for_the_take_to_stop() {
        let dir = std::env::temp_dir().join(random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let mut room = Room::new("r_2026-11-05".into(), "r".into(), dir.clone());
        room.start_take();
        assert_eq!(room.close(), Err(BackofficeError::Recording));
        room.stop_take();
        room.close().unwrap();
        assert_eq!(room.invite("late", Role::Guest), Err(BackofficeError::Closed));

        // After a restart it comes back closed, from its room.json, even with a half-written leftover.
        assert!(!dir.join("room.json.tmp").exists());
        std::fs::write(dir.join("room.json.tmp"), b"{\"room\":").unwrap();
        let past = Room::load(dir.clone()).unwrap();
        assert!(past.closed);
        assert_eq!((past.name.as_str(), past.take_count()), ("r", 1));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
