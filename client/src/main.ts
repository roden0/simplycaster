import { applyLocale, list, ROLE_LABEL, STATUS_LABEL, t, type MessageKey } from "./i18n.ts";
import { el } from "./dom.ts";
import { estimateOffset, localNow, type ClockSample } from "./clock.ts";
import { createRecorder, type MicState, type Recorder, type WorkerEvent } from "./recorder.ts";
import { createLive, type Live } from "./live.ts";
import { micProblem, parsePendingUploads, partPlan, type PendingUploads } from "./session.ts";
import type { MicProblem } from "./protocol/MicProblem.ts";
import type { ClientMessage } from "./protocol/ClientMessage.ts";
import type { ServerMessage } from "./protocol/ServerMessage.ts";
import type { ParticipantView } from "./protocol/ParticipantView.ts";
import type { TrackView } from "./protocol/TrackView.ts";

const CLOCK_PINGS = 20;
const CLOCK_PING_GAP_MS = 50;
/** Re-measure the clock offset so the system clock's own drift is not carried along a long Take. */
const CLOCK_RESYNC_MS = 30_000;
/**
 * The estimate uses the fastest ping of the last two bursts: more chances of one that met no
 * queue on the way. Older samples go stale as the clocks drift apart (~30 ppm seen: ~2 ms here).
 */
const CLOCK_WINDOW_MS = 65_000;
const DRIFT_MARK_MS = 10_000;
const RECONNECT_MS = 2000;
/** When joining a Take after T, the new part starts this long after now. */
const LATE_START_LEAD_MS = 300;
const PENDING_UPLOADS_KEY = "simplycaster.pendingUploads";

const app = document.querySelector<HTMLElement>("#app")!;
const invite = location.pathname.match(/^\/i\/([^/]+)$/)?.[1];

applyLocale();
document.title = t("appTitle");
app.append(el("h1", t("appTitle")));
app.append(el("small", t("buildInfo", { build: __BUILD_TIME__ })));
const status = app.appendChild(el("p"));
status.setAttribute("role", "status");
// Shown before the microphone is enabled: with the live conversation, no headphones means echo in every Track.
const headphonesNote = app.appendChild(el("p"));
const micRow = app.appendChild(el("p"));
const meterRow = app.appendChild(el("p"));
const calibrationRow = app.appendChild(el("p"));
const takeControls = app.appendChild(el("p"));
const micWarning = app.appendChild(el("p"));
micWarning.setAttribute("role", "alert");
const takeStatus = app.appendChild(el("p"));
takeStatus.setAttribute("role", "status");
const takesList = app.appendChild(el("div"));
const rosterList = el("ul");
app.append(el("h2", t("participants")), rosterList);

/** Coordinator clock minus local clock; known after the first clock sync. */
let clockOffsetMs: number | undefined;
/** Round trip of the ping the offset came from: the offset is wrong by at most half of it. */
let clockRttMs: number | undefined;
let clockSamples: ClockSample[] = [];
let recorder: Recorder | undefined;
let myName = "";
let isHost = false;
/** This Invitation was opened somewhere else, or its Room was closed: never reconnect. */
let ended = false;
/** Frequency of this Participant's audible Sync tone, from the Coordinator. */
let toneHz = 1000;
/** The Take being recorded in the Room, from takeStarted until takeStopped. */
let activeTake: { take: number; startTime: number } | undefined;
/** Take this browser is recording a part of (0 = none). */
let recordingTake = 0;
let send: (msg: ClientMessage) => void = () => {};
/** The live conversation (0c), from the welcome message on. */
let live: Live | undefined;
let lastRoster: ParticipantView[] = [];

if (!invite) {
  status.textContent = t("noInvitation");
} else {
  status.textContent = t("connecting");
  headphonesNote.append(el("strong", t("useHeadphones")));
  const enable = micRow.appendChild(el("button", t("enableMicrophone")));
  enable.onclick = () => {
    enable.remove();
    setupMicrophone();
  };
  connect(invite);
}

// --- Room connection and clock sync (CU3) ---

function connect(invite: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?invite=${encodeURIComponent(invite)}`);
  // Only while open: send() throws on a socket still connecting. What is skipped is resent anyway:
  // the next drift mark in 10 s, the mic status on open, the live offers with the roster.
  send = (msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  let opened = false;
  /** Pongs still expected from the current burst. */
  let burstLeft = 0;
  const syncClock = () => {
    burstLeft = CLOCK_PINGS;
    for (let i = 0; i < CLOCK_PINGS; i++) {
      setTimeout(() => send({ type: "ping", clientTime: localNow() }), i * CLOCK_PING_GAP_MS);
    }
  };
  let resync: ReturnType<typeof setInterval>;

  ws.onopen = () => {
    opened = true;
    // The Coordinator forgets the microphone status on reconnect: tell it again.
    sentMicProblem = undefined;
    refreshMicProblem();
    syncClock();
    resync = setInterval(syncClock, CLOCK_RESYNC_MS);
  };

  ws.onmessage = (event) => {
    const msg: ServerMessage = JSON.parse(event.data);
    switch (msg.type) {
      case "welcome":
        myName = msg.name;
        status.textContent = t("joinedAs", {
          name: msg.name,
          role: t(ROLE_LABEL[msg.role]),
        });
        isHost = msg.role === "host";
        toneHz = msg.toneHz;
        live ??= createLive(
          msg.name,
          (to, data) => send({ type: "signal", to, data }),
          () => renderRoster(lastRoster),
        );
        live.setIceServers(msg.iceServers);
        if (recorder) live.setTrack(recorder.micTrack());
        if (isHost) renderHostControls();
        break;
      case "pong":
        clockSamples.push({ clientSend: msg.clientTime, clientReceive: localNow(), coordinatorTime: msg.coordinatorTime });
        clockSamples = clockSamples.filter((s) => s.clientSend > localNow() - CLOCK_WINDOW_MS);
        if (--burstLeft === 0) {
          const estimate = estimateOffset(clockSamples);
          clockOffsetMs = estimate.offsetMs;
          clockRttMs = estimate.rttMs;
          send({ type: "clockOffset", ...estimate });
          startTrack();
        }
        break;
      case "roster":
        lastRoster = msg.participants;
        renderRoster(msg.participants);
        live?.roster(msg.participants.filter((p) => p.status === "connected").map((p) => p.name));
        break;
      case "signal":
        live?.receive(msg.from, msg.data);
        break;
      case "takeStarted":
        activeTake = { take: msg.take, startTime: msg.startTime };
        startTrack();
        break;
      case "takeStopped":
        activeTake = undefined;
        // Sent again on every reconnect: only act on the part being recorded.
        if (recordingTake !== msg.take) break;
        recordingTake = 0;
        recorder!.stop(msg.stopTime - clockOffsetMs!);
        takeStatus.textContent = t("takeStopped", { take: msg.take });
        break;
      case "replaced":
        ended = true;
        live?.leave();
        status.textContent = t("openedElsewhere");
        break;
      case "roomClosed":
        ended = true;
        live?.leave();
        status.textContent = t("roomClosed");
        break;
      case "takeTracks":
        if (isHost) renderTakeTracks(msg.take, msg.expected, msg.pending, msg.tracks);
        break;
    }
  };

  ws.onclose = () => {
    clearInterval(resync);
    // The Coordinator rejects unknown invitations before the upgrade, so the socket never opens.
    if (!opened) {
      status.textContent = t("invalidInvitation");
      return;
    }
    // Reconnecting would only take the Invitation back from the other window, or find it expired.
    if (ended) return;
    status.textContent = t("reconnecting");
    setTimeout(() => connect(invite), RECONNECT_MS);
  };
}

function renderRoster(participants: ParticipantView[]) {
  rosterList.replaceChildren(
    ...participants.map((p) => {
      const clock =
        p.clockOffsetMs === null
          ? t("clockPending")
          : t("clockOffset", { offset: p.clockOffsetMs.toFixed(1), rtt: p.clockRttMs!.toFixed(1) });
      const liveState = p.name === myName ? undefined : live?.state(p.name);
      const liveLabel = liveState && LIVE_LABEL[liveState];
      const details = [
        t(STATUS_LABEL[p.status]),
        ...(p.syncing ? [t("statusSyncing")] : []),
        ...(p.micProblem ? [t("micProblemEntry", { problem: t(MIC_PROBLEM_LABEL[p.micProblem]) })] : []),
        ...(liveLabel ? [t(liveLabel)] : []),
        ...(p.status === "connected" ? [clock] : []),
      ];
      return el("li", t("rosterEntry", { name: p.name, role: t(ROLE_LABEL[p.role]), details: list(details) }));
    }),
  );
}

/** How the live conversation with each other Participant is going. */
const LIVE_LABEL: Partial<Record<RTCPeerConnectionState, MessageKey>> = {
  new: "liveConnecting",
  connecting: "liveConnecting",
  connected: "liveConnected",
  disconnected: "liveInterrupted",
  failed: "liveFailed",
};

// --- Takes (CU4, CU5) ---

function renderHostControls() {
  const record = el("button", t("record"));
  const stop = el("button", t("stop"));
  record.onclick = () => send({ type: "record" });
  stop.onclick = () => send({ type: "stop" });
  takeControls.replaceChildren(record, " ", stop);
}

/** Starts recording the active Take as soon as microphone and clock are ready (CU4, CU7). */
function startTrack() {
  if (!activeTake || recordingTake === activeTake.take) return;
  const { take, startTime } = activeTake;
  if (!recorder || clockOffsetMs === undefined) {
    takeStatus.textContent = t("notReadyToRecord", { take });
    return;
  }
  // Joining after T (reconnect, CU7): record a new part from now on, without the Sync tone.
  const { localStartMs: localStart, late } = partPlan(startTime, clockOffsetMs, localNow(), LATE_START_LEAD_MS);
  // Unique local name per part; the Coordinator names the files it stores.
  const fileName = `t${String(take).padStart(2, "0")}_${myName}_${Date.now()}.ogg`;
  recorder.start({
    fileName,
    localStartMs: localStart,
    startTime: localStart + clockOffsetMs,
    tone: !late,
    toneHz,
    take,
    invite: invite!,
    clockOffsetMs,
    clockRttMs: clockRttMs!,
  });
  recordingTake = take;
  takeStatus.textContent = t(late ? "takeRejoined" : "takeStarting", { take });
  if (!late) setTimeout(() => (takeStatus.textContent = t("takeRecording", { take })), localStart - localNow());
}

setInterval(() => {
  const mark = recordingTake && clockOffsetMs !== undefined ? recorder?.driftMark() : undefined;
  if (mark)
    send({
      type: "driftMark",
      take: recordingTake,
      samples: mark.samples,
      coordinatorTime: mark.localMs + clockOffsetMs!,
      clockOffsetMs: clockOffsetMs!,
      clockRttMs: clockRttMs!,
    });
}, DRIFT_MARK_MS);

// --- Keeping the microphone alive ---

const MIC_PROBLEM_LABEL = {
  ended: "micEndedLabel",
  muted: "micMutedLabel",
  hidden: "micHiddenLabel",
  silent: "micSilentLabel",
} as const;
const MIC_PROBLEM_WARNING = {
  ended: "micEnded",
  muted: "micMuted",
  hidden: "micHidden",
  silent: "micSilent",
} as const;

let micState: MicState | undefined;
/** Last status told to the Coordinator; `undefined` forces sending it again. */
let sentMicProblem: MicProblem | null | undefined;

/** Shows the worst current microphone problem here and tells the Coordinator, so the Host sees it too. */
function refreshMicProblem() {
  const problem = micProblem(micState, document.hidden);
  micWarning.textContent = problem ? t(MIC_PROBLEM_WARNING[problem]) : "";
  if (problem === sentMicProblem) return;
  sentMicProblem = problem;
  send({ type: "micStatus", problem });
}

// The screen turning off freezes the page on mobile, and the microphone with it.
// Held for the whole stay in the Room, not just while recording: a screen that turns off
// while waiting is already hidden at T, and a hidden page cannot take the lock.
async function keepAwake() {
  try {
    await navigator.wakeLock?.request("screen");
  } catch {
    // Not supported or refused: recording still works while the screen stays on.
  }
}

document.addEventListener("visibilitychange", () => {
  refreshMicProblem();
  // The system drops the wake lock when the page is hidden; take it again on return.
  if (!document.hidden && recorder) keepAwake();
});

// Uploads not yet confirmed by the Coordinator, so a reloaded page can finish them (CU7).
function pendingUploads(): PendingUploads {
  try {
    return parsePendingUploads(localStorage.getItem(PENDING_UPLOADS_KEY));
  } catch {
    return {}; // storage blocked: nothing to resume
  }
}

function updatePendingUploads(change: (p: PendingUploads) => void) {
  const p = pendingUploads();
  change(p);
  try {
    localStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: resuming after a reload will not work, recording still does.
  }
}

function onRecorderEvent(e: WorkerEvent) {
  if ("uploadStarted" in e) {
    updatePendingUploads((p) => (p[e.uploadStarted] = { uploadUrl: e.uploadUrl, take: e.take, invite: invite! }));
  } else if ("uploaded" in e) {
    updatePendingUploads((p) => delete p[e.fileName]);
    if (recordingTake !== e.uploaded) takeStatus.textContent = t("trackUploaded", { take: e.uploaded });
  } else if ("uploadLost" in e) {
    updatePendingUploads((p) => delete p[e.uploadLost]);
  } else if ("recorded" in e) {
    takeStatus.textContent = t("trackSyncing", { take: e.recorded });
  } else {
    takeStatus.textContent = t("recordingError", { error: e.error });
  }
}

/** Host only: what the Coordinator has gathered for a stopped Take. */
function renderTakeTracks(take: number, expected: string[], pending: string[], tracks: TrackView[]) {
  let section = takesList.querySelector<HTMLElement>(`[data-take="${take}"]`);
  if (!section) {
    section = el("section");
    section.dataset.take = String(take);
    takesList.prepend(section);
  }
  const progress = el(
    "p",
    pending.length > 0
      ? t("gatheringRecordings", { received: expected.length - pending.length, expected: expected.length })
      : t("recordingsGathered"),
  );
  progress.setAttribute("role", "status");
  const list = el("ul");
  const query = `?invite=${encodeURIComponent(invite!)}`;
  list.append(
    ...tracks.map((tr) => {
      const mb = (tr.bytes / 1e6).toFixed(1);
      const label =
        tr.part === 1
          ? t("trackEntry", { file: tr.file, mb })
          : t("trackPartEntry", { file: tr.file, mb, seconds: (tr.startOffsetMs / 1000).toFixed(3) });
      const link = el("a", label);
      link.href = `/takes/${take}/tracks/${encodeURIComponent(tr.file)}${query}`;
      const item = el("li");
      item.append(link);
      return item;
    }),
  );
  section.replaceChildren(el("h3", t("takeHeading", { take })), progress, list);
  if (tracks.length > 0) {
    const zip = el("a", t("downloadAllZip"));
    zip.href = `/takes/${take}/zip${query}`;
    section.append(zip);
  }
}

// --- Latency calibration (CU3) ---

let latencyText: HTMLElement | undefined;

function showLatency(failed = false) {
  const { ms, calibrated } = recorder!.latency();
  const key = calibrated ? "latencyCalibrated" : failed ? "calibrationFailed" : "latencyEstimated";
  latencyText!.textContent = t(key, { ms: ms.toFixed(0) });
}

function setupCalibration(rec: Recorder) {
  const button = el("button", t("calibrate"));
  latencyText = el("span");
  latencyText.setAttribute("role", "status");
  button.onclick = async () => {
    // Clicks during a Take would end up in the Track.
    if (recordingTake) return;
    button.disabled = true;
    latencyText!.textContent = t("calibrating");
    const trip = await rec.calibrate();
    button.disabled = false;
    showLatency(trip === undefined);
  };
  calibrationRow.replaceChildren(button, " ", latencyText, el("br"), el("small", t("calibrateHint")));
  showLatency();
}

// --- Microphone choice and input level (CU3) ---

async function setupMicrophone() {
  const label = el("label", t("microphone"));
  const select = el("select");
  label.append(" ", select);
  const meterLabel = el("label", t("inputLevel"));
  const meter = el("meter");
  meter.min = 0;
  meter.max = 1;
  meter.high = 0.8;
  meterLabel.append(" ", meter);
  micRow.append(label);
  meterRow.append(meterLabel);

  try {
    const rec = await createRecorder(onRecorderEvent, (state) => {
      micState = state;
      refreshMicProblem();
    });
    const current = await rec.openMicrophone();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    select.replaceChildren(
      ...devices.map((d) => {
        const o = el("option", d.label || d.deviceId);
        o.value = d.deviceId;
        o.selected = d.deviceId === current;
        return o;
      }),
    );
    select.onchange = async () => {
      await rec.openMicrophone(select.value);
      live?.setTrack(rec.micTrack());
      showLatency(); // a new microphone needs a new calibration
    };
    recorder = rec;
    live?.setTrack(rec.micTrack());
    keepAwake();
    setupCalibration(rec);
    for (const [fileName, p] of Object.entries(pendingUploads())) {
      if (p.invite === invite) rec.resumeUpload(fileName, p.uploadUrl, p.take, p.invite);
    }
    startTrack();
    (function draw() {
      meter.value = rec.level();
      requestAnimationFrame(draw);
    })();
  } catch (e) {
    micRow.append(el("p", t("micError", { error: String(e) })));
  }
}
