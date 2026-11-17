// Dashboard: what needs attention when signing in. Open Rooms, the disk, and the Account itself.
import { t } from "./i18n.ts";
import { el } from "./dom.ts";
import type { Disk } from "./protocol/Disk.ts";
import type { Me } from "./protocol/Me.ts";
import type { PodcastView } from "./protocol/PodcastView.ts";
import { base, button, dateTime, error, jsonRequest, load, registerPasskey } from "./backoffice-common.ts";
import { loadRooms } from "./backoffice-rooms.ts";

/** Below this, a long Take or a few Episodes may not fit: whichever limit comes first. */
const LOW_SHARE = 0.1;
const LOW_BYTES = 5e9;

function card(title: string, ...content: (HTMLElement | string)[]): HTMLElement {
  const section = el("section");
  section.className = "card";
  section.append(el("h2", title), ...content);
  return section;
}

function bytes(n: number): string {
  return new Intl.NumberFormat(undefined, { style: "unit", unit: "gigabyte", maximumFractionDigits: 1 }).format(n / 1e9);
}

async function openRoomsCard(target: HTMLElement, navigate: (path: string) => void) {
  const rooms = await loadRooms();
  if (!rooms) return;
  const open = rooms.filter((r) => !r.closed);
  if (!open.length) {
    target.replaceChildren(el("p", t("noOpenRooms")));
    return;
  }
  const list = el("ul");
  list.className = "plain";
  for (const room of open) {
    const link = el("a", room.displayName);
    link.href = `/backoffice/rooms#${encodeURIComponent(room.id)}`;
    link.onclick = (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(link.pathname + link.hash);
    };
    const state = room.recording ? t("roomRecording", { take: room.takes }) : t("roomOpen");
    const item = el("li");
    item.append(link, el("span", ` · ${state}`));
    list.append(item);
  }
  target.replaceChildren(list);
}

async function diskCard(target: HTMLElement) {
  const disk = await load<Disk>(`${base}/disk`);
  if (!disk) return;
  const meter = el("meter");
  meter.max = disk.total;
  meter.value = disk.total - disk.free;
  // The browser colours the meter by these: high usage is the bad end.
  meter.low = disk.total * 0.7;
  meter.high = disk.total * (1 - LOW_SHARE);
  meter.optimum = 0;
  meter.setAttribute("aria-label", t("diskUsed"));
  const parts: HTMLElement[] = [el("p", t("diskFree", { free: bytes(disk.free), total: bytes(disk.total) })), meter];
  if (disk.free < Math.max(disk.total * LOW_SHARE, LOW_BYTES) && disk.free < disk.total) {
    const warn = el("p", t("diskLow"));
    warn.className = "alert";
    parts.push(warn);
  }
  target.replaceChildren(...parts);
}

/** When each feed was last generated: a scheduled Episode waits for the next one. */
async function feedsCard(target: HTMLElement, navigate: (path: string) => void) {
  const podcasts = await load<PodcastView[]>(`${base}/podcasts`);
  if (!podcasts) return;
  if (!podcasts.length) {
    target.replaceChildren(el("p", t("noPodcasts")));
    return;
  }
  const list = el("ul");
  list.className = "plain";
  for (const p of podcasts) {
    const path = `/backoffice/podcasts/${encodeURIComponent(p.slug)}`;
    const link = el("a", p.details.title);
    link.href = path;
    link.onclick = (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(path);
    };
    const when = p.generatedAt === null ? t("neverGenerated") : dateTime(p.generatedAt);
    const item = el("li");
    item.append(link, el("span", ` · ${when}`));
    list.append(item);
  }
  target.replaceChildren(list);
}

/** Adding a second device is what makes losing one no emergency. */
function accountCard(me: Me): HTMLElement {
  const status = el("p");
  status.setAttribute("role", "status");
  const add = button(t("addPasskey"), async () => {
    const problem = await registerPasskey(await jsonRequest(`${base}/me/passkeys`, "POST", {}));
    status.textContent = problem ?? t("passkeyAdded");
  });
  const content: HTMLElement[] = [el("p", me.initial ? t("initialAdminName") : me.name)];
  if (me.initial) {
    const hint = el("p", t("initialAdminHint"));
    hint.className = "alert";
    content.push(hint);
  }
  return card(t("account"), ...content, add, status);
}

export function dashboardPage(me: Me, navigate: (path: string) => void): HTMLElement[] {
  const rooms = el("div");
  const disk = el("div");
  const grid = el("div");
  grid.className = "cards";
  grid.append(card(t("openRooms"), rooms), card(t("disk"), disk));
  if (me.publishing) {
    const feeds = el("div");
    grid.append(card(t("feeds"), feeds));
    feedsCard(feeds, navigate);
  }
  grid.append(accountCard(me));
  openRoomsCard(rooms, navigate);
  diskCard(disk);
  return [el("h1", t("dashboard")), error, grid];
}
