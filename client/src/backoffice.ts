// Backoffice (CU1, CU2, CU8, CU9): create Rooms and Invitations, close and download Rooms.
import { t, type MessageKey } from "./i18n.ts";
import { el } from "./dom.ts";
import type { RoomView } from "./protocol/RoomView.ts";
import type { BackofficeError } from "./protocol/BackofficeError.ts";

const app = document.querySelector<HTMLElement>("#app")!;
const token = location.pathname.match(/^\/backoffice\/([^/]+)$/)?.[1];
const api = `/api/backoffice/${token}/rooms`;

const ERROR_KEY: Record<BackofficeError, MessageKey> = {
  invalidName: "errorInvalidName",
  nameTaken: "errorNameTaken",
  roomFull: "errorRoomFull",
  recording: "errorRecording",
  closed: "errorClosed",
  open: "errorOpen",
};

document.title = t("backofficeTitle");
app.append(el("h1", t("backofficeTitle")), el("small", t("buildInfo", { build: __BUILD_TIME__ })));
const error = el("p");
error.setAttribute("role", "alert");
const roomsList = el("div");

/** Calls the API; on failure shows why and returns undefined. */
async function call(path: string, body?: object): Promise<RoomView | RoomView[] | undefined> {
  error.textContent = "";
  const res = await fetch(api + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body && JSON.stringify(body),
  });
  if (res.ok) return res.json();
  const reason: BackofficeError | undefined = await res.json().catch(() => undefined);
  error.textContent =
    res.status === 404 && !path ? t("backofficeInvalidLink") : reason ? t(ERROR_KEY[reason]) : t("requestFailed", { status: res.status });
}

function field(label: string, value = "") {
  const input = el("input");
  input.value = value;
  input.required = true;
  input.maxLength = 40;
  const wrap = el("label", label);
  wrap.append(" ", input);
  return { wrap, input };
}

/** Rooms being converted, polled until done; then the list is redrawn once. */
const converting = new Set<string>();

function waitForFlac(id: string) {
  if (converting.has(id)) return;
  converting.add(id);
  const timer = setInterval(async () => {
    const res = await fetch(api).catch(() => undefined);
    const rooms: RoomView[] | undefined = res?.ok ? await res.json() : undefined;
    if (rooms?.find((r) => r.id === id)?.flac === "converting") return;
    clearInterval(timer);
    converting.delete(id);
    refresh();
  }, 2000);
}

async function refresh() {
  const rooms = (await call("")) as RoomView[] | undefined;
  if (!rooms) return;
  if (!rooms.length) {
    roomsList.replaceChildren(el("p", t("noRooms")));
    return;
  }
  // Once, above the list: it explains the FLAC button of every closed Room.
  const hint = el("p");
  if (rooms.some((r) => r.closed)) hint.append(el("small", t("flacHint")));
  // A rule before each Room, so its buttons clearly belong to it.
  roomsList.replaceChildren(hint, ...rooms.flatMap((r) => [el("hr"), renderRoom(r)]));
}

/** Creation date and time in the viewer's locale and time zone, or just the date for old Rooms. */
function createdText(room: RoomView): string {
  if (room.createdAt === null) return room.created;
  return new Date(room.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

function renderRoom(room: RoomView): HTMLElement {
  const section = el("section");
  const state = room.closed
    ? t("roomClosedState")
    : room.recording
      ? t("roomRecording", { take: room.takes })
      : t("roomOpen");
  section.append(
    el("h3", t("roomHeading", { name: room.name, created: createdText(room) })),
    el("p", `${state} · ${t("roomTakes", { takes: room.takes })}`),
  );

  const list = el("ul");
  for (const inv of room.invitations) {
    const item = el(
      "li",
      t("invitationEntry", {
        name: inv.name,
        role: t(inv.role === "host" ? "roleHost" : "roleGuest"),
        status: t(inv.status === "connected" ? "statusConnected" : "statusDisconnected"),
      }),
    );
    if (!room.closed) {
      const link = el("input");
      link.readOnly = true;
      // Wide enough to read, never wider than a phone screen.
      link.style.width = "min(100%, 40em)";
      link.style.boxSizing = "border-box";
      link.value = `${location.origin}/i/${inv.token}`;
      link.setAttribute("aria-label", t("invitationLink", { name: inv.name }));
      const copy = el("button", t("copy"));
      copy.onclick = async () => {
        link.select();
        await navigator.clipboard?.writeText(link.value).catch(() => {});
        copy.textContent = t("copied");
      };
      item.append(el("br"), link, " ", copy);
    }
    list.append(item);
  }
  section.append(el("h4", t("invitations")), list);

  if (room.closed) {
    const roomUrl = `${api}/${encodeURIComponent(room.id)}`;
    const download = el("a", t("downloadRoom"));
    download.href = `${roomUrl}/zip`;
    const flacRow = el("p");
    if (room.flac === "ready") {
      const flac = el("a", t("downloadFlac"));
      flac.href = `${roomUrl}/flac/zip`;
      flacRow.append(flac);
    } else if (room.flac === "converting") {
      flacRow.append(el("span", t("convertingFlac")));
      flacRow.setAttribute("role", "status");
      waitForFlac(room.id);
    } else {
      const convert = el("button", t("convertFlac"));
      convert.onclick = async () => {
        if (await call(`/${encodeURIComponent(room.id)}/flac`, {})) refresh();
      };
      if (room.flac === "failed") flacRow.append(el("span", t("flacFailed")), " ");
      flacRow.append(convert);
    }
    section.append(download, flacRow);
    return section;
  }

  const form = el("form");
  const guest = field(t("guestName"));
  form.append(guest.wrap, " ", el("button", t("invite")));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await call(`/${encodeURIComponent(room.id)}/invitations`, { name: guest.input.value })) refresh();
  };

  const close = el("button", t("closeRoom"));
  close.onclick = async () => {
    // Ask with fresh data: uploads may have finished, or a Take started, since the last refresh.
    const rooms = (await call("")) as RoomView[] | undefined;
    const now = rooms?.find((r) => r.id === room.id);
    if (!now) return;
    if (now.recording) {
      error.textContent = t("errorRecording");
      return;
    }
    const question = now.pending.length
      ? t("closePending", { names: now.pending.join(", "), name: room.name })
      : t("closeConfirm", { name: room.name });
    if (confirm(question) && (await call(`/${encodeURIComponent(room.id)}/close`, {}))) refresh();
  };
  const closeRow = el("p");
  closeRow.append(close);
  section.append(form, closeRow);
  return section;
}

if (!token) {
  app.append(el("p", t("backofficeNoLink")));
} else {
  const form = el("form");
  const name = field(t("roomName"));
  const host = field(t("hostName"), "host");
  form.append(name.wrap, " ", host.wrap, " ", el("button", t("createRoom")), el("br"), el("small", t("nameHint")));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (await call("", { name: name.input.value, host: host.input.value })) {
      name.input.value = "";
      refresh();
    }
  };
  const reload = el("button", t("refresh"));
  reload.onclick = refresh;
  app.append(el("h2", t("newRoom")), form, error, el("h2", t("rooms")), reload, roomsList);
  refresh();
}
