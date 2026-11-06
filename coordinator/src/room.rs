//! A Room and its rules: Invitations, Takes, Track parts and what `room.json` records of them.
//! Tested without a network: messages go out through each Participant's channel.

use std::path::PathBuf;

use tokio::sync::mpsc;

use crate::protocol::{
    BackofficeError, ClientMessage, FlacState, IceServer, InvitationView, ParticipantStatus, ParticipantView, Role,
    RoomView, ServerMessage, TrackView,
};
use crate::room_file::{self, InvitationFile, ParticipantFile, RoomFile, TakeFile};
use crate::{MAX_SIGNAL_BYTES, flac, now_ms, random_token, realign, tus, utc_date};

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
        self.save_invitations();
        self.broadcast_roster();
        Ok(())
    }

    fn save_invitations(&self) {
        let list: Vec<_> = self
            .participants
            .iter()
            .map(|p| InvitationFile {
                name: p.view.name.clone(),
                role: p.view.role,
                token: p.token.clone(),
            })
            .collect();
        if let Err(e) = room_file::write_invitations(&self.dir, &list) {
            eprintln!("{}: cannot write the Invitations: {e}", self.id);
        }
    }

    /// A Room from its folder after a restart. Open if it was open and its Invitations were saved
    /// (ADR-0007): same links, and a Take being recorded goes on. Otherwise closed, as a closed Room is
    /// never reopened (ADR-0002). Rooms of iteration 0a lack name, date and participants.
    pub(crate) fn load(dir: PathBuf) -> Result<Room, String> {
        let saved = RoomFile::read(&dir)?;
        let invitations = if saved.closed {
            None
        } else {
            room_file::read_invitations(&dir)
        };
        let id = dir.file_name().unwrap().to_string_lossy().into_owned();
        let mut room = Room::new(id.clone(), saved.room.unwrap_or(id), dir);
        room.closed = invitations.is_none();
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
        let flacs = room.flac_files();
        if !flacs.is_empty() && flacs.iter().all(|(_, path)| path.is_file()) {
            room.flac = FlacState::Ready;
        }
        // room.json may lag behind the disk: resume each unfinished part from what the file holds,
        // or a client resuming from the stale offset would write its bytes twice.
        for u in room.uploads.iter_mut().filter(|u| !u.is_complete()) {
            if let Ok(m) = std::fs::metadata(room.dir.join(u.file())) {
                u.offset = m.len();
            }
        }
        if let Some(list) = invitations {
            room.recording = room.takes.last().is_some_and(|t| t.stop_time.is_none());
            for i in list {
                let mut p = Participant::new(&i.name, i.role);
                p.token = i.token;
                room.participants.push(p);
            }
            return Ok(room);
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

    /// Where the FLAC of a Participant's Track of a Take goes: named like its first part (ADR-0010).
    pub(crate) fn flac_path(&self, take: u32, name: &str) -> PathBuf {
        flac::path(&self.dir, &track_stem(&self.id, take, name, 1))
    }

    /// Zip entry and file of every FLAC of the Room: one per Participant and Take.
    pub(crate) fn flac_files(&self) -> Vec<(String, PathBuf)> {
        (1..=self.take_count())
            .flat_map(|take| self.take_expected(take).into_iter().map(move |name| (take, name)))
            .map(|(take, name)| {
                let path = self.flac_path(take, &name);
                let file = path.file_name().unwrap().to_string_lossy().into_owned();
                (format!("{}/{file}", self.id), path)
            })
            .collect()
    }

    /// How the FLAC delivery builds each Track (ADR-0010): its parts placed from T to the end of the
    /// Take, with silence where audio went missing.
    pub(crate) fn flac_jobs(&self) -> Vec<flac::Job> {
        let mut jobs = Vec::new();
        for take in 1..=self.take_count() {
            let t = &self.takes[take as usize - 1];
            for name in self.take_expected(take) {
                let mut parts: Vec<&tus::Upload> = self
                    .uploads
                    .iter()
                    .filter(|u| u.take == take && u.participant == name)
                    .collect();
                parts.sort_by_key(|u| u.part);
                let planned: Vec<realign::Part> = parts
                    .iter()
                    .map(|u| {
                        let a = u.analysis();
                        realign::Part {
                            start_offset_ms: u.start_time - t.start_time,
                            duration_ms: u.duration_ms,
                            drift_ppm: a.drift_ppm,
                            gaps: a.gaps,
                        }
                    })
                    .collect();
                // A Take without a stop (closed while recording is refused, but 0a Rooms may lack it) ends
                // with its last audio.
                let take_ms = t.stop_time.map(|stop| stop - t.start_time).unwrap_or_else(|| {
                    planned
                        .iter()
                        .map(|p| p.start_offset_ms + p.duration_ms.unwrap_or(0.0))
                        .fold(0.0, f64::max)
                });
                let pieces = realign::plan(&planned, take_ms);
                let drift: Vec<_> = planned.iter().map(|p| p.drift_ppm).collect();
                jobs.push(flac::Job {
                    parts: parts.iter().map(|u| self.dir.join(u.file())).collect(),
                    graph: realign::filter_graph(&drift, &pieces, take_ms),
                    flac: self.flac_path(take, &name),
                });
            }
        }
        jobs
    }

    pub(crate) fn find(&mut self, name: &str) -> Option<&mut Participant> {
        self.participants.iter_mut().find(|p| p.view.name == name)
    }

    /// Audible Sync tone frequency of a Participant: 1000 Hz, 1500 Hz… in Invitation order.
    pub(crate) fn tone_hz(&self, name: &str) -> f64 {
        let i = self.participants.iter().position(|p| p.view.name == name).unwrap_or(0);
        1000.0 + 500.0 * i as f64
    }

    /// A new connection of a Participant: welcomes it and catches it up. A new connection with the same
    /// Invitation replaces the old one (reconnect, CU7); the old one is told and closed, so it does not
    /// linger without updates. Returns the connection id and the Participant's role.
    pub(crate) fn connect(
        &mut self,
        name: &str,
        tx: mpsc::UnboundedSender<ServerMessage>,
        ice_servers: Vec<IceServer>,
    ) -> (u64, Role) {
        self.next_conn_id += 1;
        let conn_id = self.next_conn_id;
        let tone_hz = self.tone_hz(name);
        let p = self.find(name).expect("the Invitation was just found in this Room");
        if let Some((_, old)) = p.conn.replace((conn_id, tx.clone())) {
            let _ = old.send(ServerMessage::Replaced);
        }
        p.view.status = ParticipantStatus::Connected;
        p.view.mic_problem = None;
        let role = p.view.role;
        let _ = tx.send(ServerMessage::Welcome {
            name: name.into(),
            role,
            tone_hz,
            ice_servers,
        });
        // Catch up with the current Take (CU7): keep recording in a new part, or stop.
        if let Some(t) = self.takes.last() {
            let take = self.take_count();
            let _ = tx.send(match t.stop_time {
                None => ServerMessage::TakeStarted {
                    take,
                    start_time: t.start_time,
                },
                Some(stop_time) => ServerMessage::TakeStopped { take, stop_time },
            });
        }
        if role == Role::Host {
            for take in 1..=self.take_count() {
                let _ = tx.send(self.take_tracks_message(take));
            }
        }
        self.broadcast_roster();
        (conn_id, role)
    }

    /// A connection ended. Only marks the Participant disconnected if no newer connection took over.
    pub(crate) fn disconnect(&mut self, name: &str, conn_id: u64) {
        let Some(p) = self.find(name) else { return };
        if p.conn.as_ref().is_some_and(|(id, _)| *id == conn_id) {
            p.conn = None;
            p.view.status = ParticipantStatus::Disconnected;
            self.broadcast_roster();
        }
    }

    /// What a message from a connected Participant does. `Ping` is answered by the socket itself.
    pub(crate) fn on_message(&mut self, name: &str, role: Role, msg: ClientMessage) {
        match msg {
            ClientMessage::Ping { .. } => {}
            ClientMessage::ClockOffset { offset_ms, rtt_ms } => {
                let Some(p) = self.find(name) else { return };
                p.view.clock_offset_ms = Some(offset_ms);
                p.view.clock_rtt_ms = Some(rtt_ms);
                self.broadcast_roster();
            }
            ClientMessage::MicStatus { problem } => {
                let Some(p) = self.find(name) else { return };
                p.view.mic_problem = problem;
                self.broadcast_roster();
            }
            ClientMessage::DriftMark {
                take,
                samples,
                coordinator_time,
                clock_offset_ms,
                clock_rtt_ms,
            } => {
                // Marks belong to the part being recorded: the latest one of this Participant.
                if let Some(u) = self
                    .uploads
                    .iter_mut()
                    .rev()
                    .find(|u| u.take == take && u.participant == name)
                {
                    u.drift_marks.push(tus::DriftMark {
                        samples,
                        coordinator_time,
                        clock_offset_ms,
                        clock_rtt_ms,
                    });
                }
            }
            ClientMessage::Signal { to, data } => {
                if data.len() > MAX_SIGNAL_BYTES {
                    eprintln!("{} {name}: ignoring a signal of {} bytes", self.id, data.len());
                    return;
                }
                let peer = self.participants.iter().find(|p| p.view.name == to);
                if let Some((_, tx)) = peer.and_then(|p| p.conn.as_ref()) {
                    let _ = tx.send(ServerMessage::Signal {
                        from: name.into(),
                        data,
                    });
                }
            }
            ClientMessage::Record | ClientMessage::Stop if role != Role::Host => {
                eprintln!("{} {name}: only the Host can record or stop", self.id);
            }
            ClientMessage::Record => self.start_take(),
            ClientMessage::Stop => self.stop_take(),
        }
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
        if let Err(e) = room_file::remove_invitations(&self.dir) {
            eprintln!("{}: cannot remove the Invitations: {e}", self.id);
        }
        // Parts left incomplete stop growing now: read what they hold, once.
        for i in 0..self.uploads.len() {
            if !self.uploads[i].is_complete() {
                self.uploads[i].duration_ms = self.uploads[i].read_duration_ms(&self.dir);
            }
        }
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
                    .map(|u| u.to_file(t.start_time, self.tone_hz(&u.participant)))
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

    type Inbox = mpsc::UnboundedReceiver<ServerMessage>;

    /// A Room with a Host and Ana, both connected; their inboxes are already drained.
    fn connected_room() -> (Room, Inbox, Inbox) {
        let dir = std::env::temp_dir().join(random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let mut room = Room::new("r_2026-11-06".into(), "r".into(), dir);
        room.invite("host", Role::Host).unwrap();
        room.invite("ana", Role::Guest).unwrap();
        let (host_tx, mut host) = mpsc::unbounded_channel();
        let (ana_tx, mut ana) = mpsc::unbounded_channel();
        room.connect("host", host_tx, vec![]);
        room.connect("ana", ana_tx, vec![]);
        drain(&mut host);
        drain(&mut ana);
        (room, host, ana)
    }

    fn drain(inbox: &mut Inbox) -> Vec<ServerMessage> {
        std::iter::from_fn(|| inbox.try_recv().ok()).collect()
    }

    fn status(room: &Room, name: &str) -> ParticipantStatus {
        room.participants
            .iter()
            .find(|p| p.view.name == name)
            .unwrap()
            .view
            .status
    }

    #[test]
    fn only_the_host_records_and_stops() {
        let (mut room, _host, mut ana) = connected_room();
        room.on_message("ana", Role::Guest, ClientMessage::Record);
        assert!(!room.recording && room.take_count() == 0);
        room.on_message("host", Role::Host, ClientMessage::Record);
        assert!(room.recording);
        assert!(
            drain(&mut ana)
                .iter()
                .any(|m| matches!(m, ServerMessage::TakeStarted { take: 1, .. }))
        );
        room.on_message("ana", Role::Guest, ClientMessage::Stop);
        assert!(room.recording);
        room.on_message("host", Role::Host, ClientMessage::Stop);
        assert!(!room.recording);
        std::fs::remove_dir_all(&room.dir).unwrap();
    }

    #[test]
    fn reconnecting_replaces_the_old_connection() {
        let (mut room, _host, mut old) = connected_room();
        let old_id = room.next_conn_id;
        let (tx, mut new) = mpsc::unbounded_channel();
        let (new_id, role) = room.connect("ana", tx, vec![]);
        assert_eq!(role, Role::Guest);
        assert!(drain(&mut old).iter().any(|m| matches!(m, ServerMessage::Replaced)));
        assert!(matches!(drain(&mut new).first(), Some(ServerMessage::Welcome { .. })));
        // The old socket ends after the new one took over: Ana stays connected.
        room.disconnect("ana", old_id);
        assert_eq!(status(&room, "ana"), ParticipantStatus::Connected);
        room.disconnect("ana", new_id);
        assert_eq!(status(&room, "ana"), ParticipantStatus::Disconnected);
        std::fs::remove_dir_all(&room.dir).unwrap();
    }

    #[test]
    fn a_reconnection_mid_take_catches_up_with_it() {
        let (mut room, _host, _ana) = connected_room();
        room.on_message("host", Role::Host, ClientMessage::Record);
        let (tx, mut inbox) = mpsc::unbounded_channel();
        room.connect("ana", tx, vec![]);
        assert!(
            drain(&mut inbox)
                .iter()
                .any(|m| matches!(m, ServerMessage::TakeStarted { take: 1, .. }))
        );
        std::fs::remove_dir_all(&room.dir).unwrap();
    }

    #[test]
    fn a_drift_mark_goes_to_the_latest_part() {
        let (mut room, _host, _ana) = connected_room();
        room.on_message("host", Role::Host, ClientMessage::Record);
        for part in [1, 2] {
            let saved = format!(
                r#"{{"participant":"ana","part":{part},"file":"p{part}.ogg","complete":false,"bytes":0,
                "startTime":0,"sampleRate":48000}}"#
            );
            room.uploads
                .push(tus::Upload::from_file(1, serde_json::from_str(&saved).unwrap()));
        }
        let mark = ClientMessage::DriftMark {
            take: 1,
            samples: 480_000,
            coordinator_time: 1e12,
            clock_offset_ms: 0.0,
            clock_rtt_ms: 40.0,
        };
        room.on_message("ana", Role::Guest, mark);
        let marks: Vec<_> = room.uploads.iter().map(|u| u.drift_marks.len()).collect();
        assert_eq!(marks, [0, 1]);
        std::fs::remove_dir_all(&room.dir).unwrap();
    }

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
        let dir = std::env::temp_dir().join(random_token());
        std::fs::create_dir_all(&dir).unwrap();
        let mut room = Room::new("r_2026-11-05".into(), "r".into(), dir.clone());
        room.invite("host", Role::Host).unwrap();
        assert_eq!(room.invite("host", Role::Guest), Err(BackofficeError::NameTaken));
        for n in ["a", "b", "c", "d"] {
            room.invite(n, Role::Guest).unwrap();
        }
        assert_eq!(room.invite("e", Role::Guest), Err(BackofficeError::RoomFull));
        let tokens: Vec<_> = room.participants.iter().map(|p| &p.token).collect();
        assert!(tokens.iter().all(|t| t.len() == 32) && tokens[0] != tokens[1]);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_open_room_survives_a_restart() {
        let (mut room, _host, _ana) = connected_room();
        room.on_message("host", Role::Host, ClientMessage::Record);
        let saved = r#"{"participant":"ana","part":1,"file":"t01_ana.ogg","complete":false,"bytes":3,"startTime":0,"sampleRate":48000}"#;
        room.uploads
            .push(tus::Upload::from_file(1, serde_json::from_str(saved).unwrap()));
        room.save_metadata();
        // More bytes reached the disk after room.json was last written.
        std::fs::write(room.dir.join("t01_ana.ogg"), b"OggS-audio").unwrap();

        let back = Room::load(room.dir.clone()).unwrap();
        assert!(!back.closed && back.recording);
        let tokens = |r: &Room| {
            r.participants
                .iter()
                .map(|p| (p.view.name.clone(), p.token.clone()))
                .collect::<Vec<_>>()
        };
        assert_eq!(tokens(&back), tokens(&room));
        assert_eq!(back.uploads[0].offset, 10);
        std::fs::remove_dir_all(&room.dir).unwrap();
    }

    #[test]
    fn closing_removes_the_invitation_secrets() {
        let (mut room, _host, _ana) = connected_room();
        assert!(room.dir.join("invitations.json").is_file());
        room.close().unwrap();
        assert!(!room.dir.join("invitations.json").exists());
        let back = Room::load(room.dir.clone()).unwrap();
        assert!(back.closed);
        assert!(
            back.participants
                .iter()
                .all(|p| room.participants.iter().all(|q| q.token != p.token))
        );
        std::fs::remove_dir_all(&room.dir).unwrap();
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
