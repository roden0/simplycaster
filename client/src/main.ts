import { t } from "./i18n.ts";
import { estimateOffset, localNow, type ClockSample } from "./clock.ts";
import { createRecorder, type Recorder, type WorkerEvent } from "./recorder.ts";
import type { ClientMessage } from "./protocol/ClientMessage.ts";
import type { ServerMessage } from "./protocol/ServerMessage.ts";
import type { ParticipantView } from "./protocol/ParticipantView.ts";
import type { TrackView } from "./protocol/TrackView.ts";

const CLOCK_PINGS = 10;
/** Re-measure the clock offset so the system clock's own drift is not carried along a long Take. */
const CLOCK_RESYNC_MS = 60_000;
const DRIFT_MARK_MS = 10_000;
const RECONNECT_MS = 2000;
/** When joining a Take after T, the new part starts this long after now. */
const LATE_START_LEAD_MS = 300;
const PENDING_UPLOADS_KEY = "simplycaster.pendingUploads";

const app = document.querySelector<HTMLElement>("#app")!;
const invite = location.pathname.match(/^\/i\/([^/]+)$/)?.[1];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}

document.title = t("appTitle");
app.append(el("h1", t("appTitle")));
app.append(el("small", t("buildInfo", { build: __BUILD_TIME__ })));
const status = app.appendChild(el("p"));
status.setAttribute("role", "status");
const micRow = app.appendChild(el("p"));
const meterRow = app.appendChild(el("p"));
const takeControls = app.appendChild(el("p"));
const takeStatus = app.appendChild(el("p"));
takeStatus.setAttribute("role", "status");
const takesList = app.appendChild(el("div"));
const rosterList = el("ul");
app.append(el("h2", t("participants")), rosterList);

/** Coordinator clock minus local clock; known after the first clock sync. */
let clockOffsetMs: number | undefined;
let recorder: Recorder | undefined;
let myName = "";
let isHost = false;
/** Frequency of this Participant's audible Sync tone, from the Coordinator. */
let toneHz = 1000;
/** The Take being recorded in the Room, from takeStarted until takeStopped. */
let activeTake: { take: number; startTime: number } | undefined;
/** Take this browser is recording a part of (0 = none). */
let recordingTake = 0;
let send: (msg: ClientMessage) => void = () => {};

if (!invite) {
  status.textContent = t("noInvitation");
} else {
  status.textContent = t("connecting");
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
  send = (msg) => ws.send(JSON.stringify(msg));
  let samples: ClockSample[] = [];
  let opened = false;
  const syncClock = () => {
    samples = [];
    for (let i = 0; i < CLOCK_PINGS; i++) {
      setTimeout(() => send({ type: "ping", clientTime: localNow() }), i * 100);
    }
  };
  let resync: ReturnType<typeof setInterval>;

  ws.onopen = () => {
    opened = true;
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
          role: t(msg.role === "host" ? "roleHost" : "roleGuest"),
        });
        isHost = msg.role === "host";
        toneHz = msg.toneHz;
        if (isHost) renderHostControls();
        break;
      case "pong":
        samples.push({ clientSend: msg.clientTime, clientReceive: localNow(), coordinatorTime: msg.coordinatorTime });
        if (samples.length === CLOCK_PINGS) {
          const estimate = estimateOffset(samples);
          clockOffsetMs = estimate.offsetMs;
          send({ type: "clockOffset", ...estimate });
          startTrack();
        }
        break;
      case "roster":
        renderRoster(msg.participants);
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
      const role = t(p.role === "host" ? "roleHost" : "roleGuest");
      const state =
        t(p.status === "connected" ? "statusConnected" : "statusDisconnected") +
        (p.syncing ? ` · ${t("statusSyncing")}` : "");
      return el("li", `${p.name} · ${role} · ${state}${p.status === "connected" ? ` · ${clock}` : ""}`);
    }),
  );
}

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
  let localStart = startTime - clockOffsetMs;
  // Joining after T (reconnect, CU7): record a new part from now on, without the Sync tone.
  const late = localStart < localNow() + LATE_START_LEAD_MS;
  if (late) localStart = localNow() + LATE_START_LEAD_MS;
  // Unique local name per part; the Coordinator names the files it stores.
  const fileName = `t${String(take).padStart(2, "0")}_${myName}_${Date.now()}.ogg`;
  recorder.start(fileName, localStart, localStart + clockOffsetMs, !late, toneHz, take, invite!);
  recordingTake = take;
  takeStatus.textContent = t(late ? "takeRejoined" : "takeStarting", { take });
  if (!late) setTimeout(() => (takeStatus.textContent = t("takeRecording", { take })), localStart - localNow());
}

setInterval(() => {
  const mark = recordingTake && clockOffsetMs !== undefined ? recorder?.driftMark() : undefined;
  if (mark) send({ type: "driftMark", take: recordingTake, samples: mark.samples, coordinatorTime: mark.localMs + clockOffsetMs! });
}, DRIFT_MARK_MS);

// Uploads not yet confirmed by the Coordinator, so a reloaded page can finish them (CU7).
type PendingUploads = Record<string, { uploadUrl: string; take: number; invite: string }>;

function pendingUploads(): PendingUploads {
  try {
    return JSON.parse(localStorage.getItem(PENDING_UPLOADS_KEY) ?? "{}");
  } catch {
    return {};
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
  meterRow.append(meterLabel, el("br"), el("small", t("useHeadphones")));

  try {
    const rec = await createRecorder(onRecorderEvent);
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
    select.onchange = () => rec.openMicrophone(select.value);
    recorder = rec;
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
