// Rooms page (CU1, CU2, CU8, CU9, CU10): one row per Room, with what can be done to it right now.
import { ROLE_LABEL, STATUS_LABEL, t } from "./i18n.ts";
import { el } from "./dom.ts";
import type { SendInvitation } from "./protocol/SendInvitation.ts";
import type { RoomView } from "./protocol/RoomView.ts";
import { base, button, copyableLink, dateTime, error, field, formDialog, pageHead, request } from "./backoffice-common.ts";

const api = `${base}/rooms`;

/** Rows opened or closed by hand, kept across refreshes; the rest follow `expandedByDefault`. */
const toggled = new Map<string, boolean>();
/** Open Rooms are where the work is: they start expanded. */
const expandedByDefault = (room: RoomView) => !room.closed;

/** Rooms being converted, polled until done; then the list is redrawn once. */
const converting = new Set<string>();

const list = el("ul");
list.className = "rows";
const hint = el("p");
hint.className = "hint";
let shown: HTMLElement | undefined;

export function loadRooms(): Promise<RoomView[] | undefined> {
  return request<RoomView[]>(api, "GET").then((r) => (r === true ? undefined : r));
}

function roomUrl(room: RoomView): string {
  return `${api}/${encodeURIComponent(room.id)}`;
}

function waitForFlac(id: string) {
  if (converting.has(id)) return;
  converting.add(id);
  const timer = setInterval(async () => {
    const res = await fetch(api).catch(() => undefined);
    const rooms: RoomView[] | undefined = res?.ok ? await res.json() : undefined;
    if (rooms?.find((r) => r.id === id)?.flac === "converting") return;
    clearInterval(timer);
    converting.delete(id);
    if (shown?.isConnected) refresh();
  }, 2000);
}

async function refresh() {
  const rooms = await loadRooms();
  if (!rooms) return;
  if (!rooms.length) {
    hint.textContent = "";
    list.replaceChildren(el("li", t("noRooms")));
    return;
  }
  // Once, above the list: it explains the FLAC button of every closed Room.
  hint.textContent = rooms.some((r) => r.closed && r.takeNumbers.length) ? t("flacHint") : "";
  list.replaceChildren(...rooms.map(renderRoom));
  // A link from the dashboard names a Room in the fragment: show it.
  const target = decodeURIComponent(location.hash.slice(1));
  if (target) document.getElementById(`room-${target}`)?.scrollIntoView({ block: "start" });
}

function stateBadge(room: RoomView): HTMLElement {
  const [kind, text] = room.closed
    ? ["closed", t("roomClosedState")]
    : room.recording
      ? ["recording", t("roomRecording", { take: room.takes })]
      : ["open", t("roomOpen")];
  const badge = el("span", text);
  badge.className = `badge ${kind}`;
  return badge;
}

function renderRoom(room: RoomView): HTMLElement {
  const row = el("li");
  row.className = "row";
  row.id = `room-${room.id}`;
  const body = el("div");
  body.className = "row-body";
  body.id = `room-body-${room.id}`;

  const toggle = el("button");
  toggle.type = "button";
  toggle.className = "toggle";
  toggle.setAttribute("aria-controls", body.id);
  const title = el("strong", room.displayName);
  toggle.append(title);
  const setExpanded = (open: boolean) => {
    toggle.setAttribute("aria-expanded", String(open));
    body.hidden = !open;
  };
  const fromHash = decodeURIComponent(location.hash.slice(1)) === room.id;
  setExpanded(fromHash || (toggled.get(room.id) ?? expandedByDefault(room)));
  toggle.onclick = () => {
    const open = body.hidden !== false;
    toggled.set(room.id, open);
    setExpanded(open);
  };

  const created = room.createdAt === null ? room.created : dateTime(room.createdAt);
  const meta = el("span", t("roomMeta", { takes: t("roomTakes", { takes: room.takeNumbers.length }), created }));
  meta.className = "meta";
  const actions = el("div");
  actions.className = "actions";
  const head = el("div");
  head.className = "row-head";
  // The label stays under the name, also when the row wraps on a phone.
  const slug = el("small", t("roomLabel", { slug: room.name }));
  slug.className = "slug";
  const name = el("div");
  name.className = "name";
  name.append(toggle, slug);
  head.append(name, stateBadge(room), meta, actions);
  row.append(head, body);

  const invitations = el("ul");
  invitations.className = "plain";
  for (const inv of room.invitations) {
    const item = el(
      "li",
      t("invitationEntry", { name: inv.name, role: t(ROLE_LABEL[inv.role]), status: t(STATUS_LABEL[inv.status]) }),
    );
    if (!room.closed) {
      const mailUrl = `${roomUrl(room)}/invitations/${encodeURIComponent(inv.name)}/mail`;
      const send = async (email: string) => !!(await request(mailUrl, "POST", { email } satisfies SendInvitation));
      const label = t("invitationLink", { name: inv.name });
      item.append(copyableLink(`${location.origin}/i/${inv.token}`, label, { to: inv.name, send }));
    }
    invitations.append(item);
  }
  body.append(el("h3", t("invitations")), invitations);

  if (room.closed) {
    closedActions(room, actions);
    if (room.takeNumbers.length) body.append(el("h3", t("takesHeading")), takeList(room));
  } else {
    const form = el("form");
    form.className = "inline-form";
    const guest = field(t("guestName"));
    const invite = el("button", t("invite"));
    form.append(guest.wrap, invite);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (await request(`${roomUrl(room)}/invitations`, "POST", { name: guest.input.value })) refresh();
    };
    body.append(form);
    actions.append(
      button(t("invite"), () => {
        toggled.set(room.id, true);
        setExpanded(true);
        guest.input.focus();
      }),
      button(t("closeRoom"), () => close(room)),
    );
  }
  return row;
}

function closedActions(room: RoomView, actions: HTMLElement) {
  if (room.takeNumbers.length) audioActions(room, actions);
  actions.append(
    button(
      t("deleteRoom"),
      async () => {
        if (!confirm(t("deleteRoomConfirm", { name: room.displayName }))) return;
        if (await request(roomUrl(room), "DELETE")) refresh();
      },
      "danger",
    ),
  );
}

/** Download and FLAC: only for a Room with Takes, there is nothing else to give. */
function audioActions(room: RoomView, actions: HTMLElement) {
  const download = el("a", t("downloadRoom"));
  download.href = `${roomUrl(room)}/zip`;
  download.className = "button";
  actions.append(download);
  if (room.flac === "ready") {
    const flac = el("a", t("downloadFlac"));
    flac.href = `${roomUrl(room)}/flac/zip`;
    flac.className = "button";
    actions.append(flac);
  } else if (room.flac === "converting") {
    const status = el("span", t("convertingFlac"));
    status.setAttribute("role", "status");
    status.className = "meta";
    actions.append(status);
    waitForFlac(room.id);
  } else {
    if (room.flac === "failed") {
      const failed = el("span", t("flacFailed"));
      failed.className = "meta";
      actions.append(failed);
    }
    actions.append(
      button(t("convertFlac"), async () => {
        if (await request(`${roomUrl(room)}/flac`, "POST", {})) refresh();
      }),
    );
  }
}

/** Deleting a Take never renumbers the others: their files keep their names. */
function takeList(room: RoomView): HTMLElement {
  const takes = el("ul");
  takes.className = "plain";
  for (const take of room.takeNumbers) {
    const item = el("li", t("takeEntry", { take }));
    item.append(
      button(
        t("deleteTake"),
        async () => {
          if (!confirm(t("deleteTakeConfirm", { take, name: room.displayName }))) return;
          if (await request(`${roomUrl(room)}/takes/${take}`, "DELETE")) refresh();
        },
        "danger",
      ),
    );
    takes.append(item);
  }
  return takes;
}

async function close(room: RoomView) {
  // Ask with fresh data: uploads may have finished, or a Take started, since the last refresh.
  const now = (await loadRooms())?.find((r) => r.id === room.id);
  if (!now) return;
  if (now.recording) {
    error.textContent = t("errorRecording");
    return;
  }
  const question = now.pending.length
    ? t("closePending", { names: now.pending.join(", "), name: room.displayName })
    : t("closeConfirm", { name: room.displayName });
  if (confirm(question) && (await request(`${roomUrl(room)}/close`, "POST", {}))) refresh();
}

function newRoomButton(): HTMLElement {
  const name = field(t("roomName"), "", 120);
  const host = field(t("hostName"), "host");
  const help = el("small", t("nameHint"));
  help.className = "hint";
  return formDialog(t("newRoom"), [name.wrap, host.wrap, help], t("createRoom"), async () => {
    if (!(await request(api, "POST", { name: name.input.value, host: host.input.value }))) return false;
    name.input.value = "";
    refresh();
    return true;
  });
}

export function roomsPage(): HTMLElement[] {
  shown = el("div");
  shown.append(hint, list);
  refresh();
  return [pageHead(t("rooms"), button(t("refresh"), refresh), newRoomButton()), error, shown];
}
