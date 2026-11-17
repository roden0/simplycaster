// Podcasts (ADR-0013): the list, and one page per Podcast with its details, feed and Episodes.
import { t } from "./i18n.ts";
import { el } from "./dom.ts";
import type { EpisodeDetails } from "./protocol/EpisodeDetails.ts";
import type { EpisodeType } from "./protocol/EpisodeType.ts";
import type { EpisodeView } from "./protocol/EpisodeView.ts";
import type { PodcastDetails } from "./protocol/PodcastDetails.ts";
import type { PodcastView } from "./protocol/PodcastView.ts";
import type { ShowType } from "./protocol/ShowType.ts";
import type { NewSubscriptionKey } from "./protocol/NewSubscriptionKey.ts";
import {
  base,
  button,
  copyableLink,
  dateTime,
  error,
  field,
  formDialog,
  load,
  pageHead,
  reasonOf,
  request,
  session,
  showForm,
} from "./backoffice-common.ts";

const api = `${base}/podcasts`;

/** Apple's top-level categories: data for the feed, so never translated. */
// shortcut: no subcategories; add them when someone needs one.
const CATEGORIES = [
  "Arts", "Business", "Comedy", "Education", "Fiction", "Government", "Health & Fitness", "History",
  "Kids & Family", "Leisure", "Music", "News", "Religion & Spirituality", "Science", "Society & Culture",
  "Sports", "Technology", "True Crime", "TV & Film",
];

type Navigate = (path: string) => void;

function podcastUrl(slug: string): string {
  return `${api}/${encodeURIComponent(slug)}`;
}

function link(text: string, path: string, navigate: Navigate): HTMLAnchorElement {
  const a = el("a", text);
  a.href = path;
  a.onclick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path);
  };
  return a;
}

// ── List ────────────────────────────────────────────────────────────────────────────────────────

export function podcastsPage(navigate: Navigate): HTMLElement[] {
  const list = el("ul");
  list.className = "rows";
  const refresh = async () => {
    const podcasts = await load<PodcastView[]>(api);
    if (!podcasts) return;
    if (!podcasts.length) {
      list.replaceChildren(el("li", t("noPodcasts")));
      return;
    }
    list.replaceChildren(...podcasts.map((p) => podcastRow(p, navigate, refresh)));
  };
  refresh();

  const name = field(t("podcastName"), "", 255);
  const create = formDialog(t("newPodcast"), [name.wrap], t("createPodcast"), async () => {
    const made = await request<PodcastView>(api, "POST", { name: name.input.value });
    if (!made || made === true) return false;
    name.input.value = "";
    navigate(`/backoffice/podcasts/${encodeURIComponent(made.slug)}`);
    return true;
  });
  return [pageHead(t("podcasts"), create), error, list];
}

function podcastRow(p: PodcastView, navigate: Navigate, refresh: () => void): HTMLElement {
  const row = el("li");
  row.className = "row";
  const head = el("div");
  head.className = "row-head";
  const title = el("strong");
  title.append(link(p.details.title, `/backoffice/podcasts/${encodeURIComponent(p.slug)}`, navigate));
  const live = p.episodes.filter((e) => e.live).length;
  const meta = el("span", t("podcastMeta", { episodes: p.episodes.length, live }));
  meta.className = "meta";
  const actions = el("div");
  actions.className = "actions";
  if (p.canDelete) actions.append(deletePodcastButton(p, refresh));
  head.append(title, meta, actions);
  const slug = el("small", t("podcastLabel", { slug: p.slug }));
  slug.className = "slug";
  slug.style.marginLeft = "0";
  row.append(head, slug);
  return row;
}

function deletePodcastButton(p: PodcastView, done: () => void): HTMLElement {
  return button(
    t("deletePodcast"),
    async () => {
      if (!confirm(t("deletePodcastConfirm", { name: p.details.title }))) return;
      if (await request(podcastUrl(p.slug), "DELETE")) done();
    },
    "danger",
  );
}

// ── One Podcast ─────────────────────────────────────────────────────────────────────────────────

export function podcastPage(slug: string, navigate: Navigate): HTMLElement[] {
  const content = el("div");
  const show = (p: PodcastView) => content.replaceChildren(...renderPodcast(p, navigate, show));
  load<PodcastView>(podcastUrl(slug)).then((p) => p && show(p));
  const back = link(t("allPodcasts"), "/backoffice/podcasts", navigate);
  back.className = "back";
  return [back, error, content];
}

/** Fields Apple requires before it lists a Podcast. */
function missing(p: PodcastView): string[] {
  const d = p.details;
  const required: [boolean, Parameters<typeof t>[0]][] = [
    [!!d.description, "podcastDescription"],
    [!!d.language, "podcastLanguage"],
    [!!d.category, "podcastCategory"],
    [!!d.author, "podcastAuthor"],
    [!!d.ownerEmail, "podcastOwnerEmail"],
    [p.cover, "podcastCover"],
  ];
  return required.filter(([ok]) => !ok).map(([, key]) => t(key));
}

function renderPodcast(p: PodcastView, navigate: Navigate, show: (p: PodcastView) => void): HTMLElement[] {
  const regenerate = button(t("regenerateFeed"), async () => {
    const now = await request<PodcastView>(`${podcastUrl(p.slug)}/feed`, "POST", {});
    if (now && now !== true) show(now);
  });
  const actions: HTMLElement[] = [regenerate];
  if (p.canDelete) actions.push(deletePodcastButton(p, () => navigate("/backoffice/podcasts")));

  const feed = el("section");
  feed.className = "card";
  const generated = p.generatedAt === null ? t("neverGenerated") : t("generatedAt", { when: dateTime(p.generatedAt) });
  const pageUrl = p.feedUrl.replace(/\/feed\.xml$/, "");
  const page = el("a", t("publicPage"));
  page.href = pageUrl;
  page.target = "_blank";
  const pages = el("p");
  pages.append(page, " · ");
  const json = el("a", t("jsonFeed"));
  json.href = `${pageUrl}/feed.json`;
  json.target = "_blank";
  pages.append(json);
  feed.append(el("h2", t("feed")));
  // A private feed has one address per Subscription key: the bare one is a 404.
  if (p.details.private) feed.append(el("p", t("privateFeedHint")), el("p", generated));
  else feed.append(copyableLink(p.feedUrl, t("feed")), el("p", generated), pages);
  const gaps = missing(p);
  if (gaps.length) {
    const warn = el("p", t("podcastMissing", { fields: gaps.join(", ") }));
    warn.className = "alert";
    feed.append(warn);
  }

  const sections = [pageHead(p.details.title, ...actions), feed, detailsSection(p, show)];
  if (p.details.private) sections.push(keysSection(p, show));
  sections.push(episodesSection(p, show));
  return sections;
}

function textArea(label: string, value: string, maxLength: number) {
  const input = el("textarea");
  input.value = value;
  input.maxLength = maxLength;
  input.rows = 5;
  const wrap = el("label", label);
  wrap.className = "field";
  wrap.append(input);
  return { wrap, input };
}

function select<T extends string>(label: string, options: [T, string][], value: T) {
  const input = el("select");
  for (const [v, text] of options) {
    const option = el("option", text);
    option.value = v;
    input.append(option);
  }
  input.value = value;
  const wrap = el("label", label);
  wrap.className = "field";
  wrap.append(input);
  return { wrap, input };
}

function optional<F extends { input: HTMLInputElement }>(f: F): F {
  f.input.required = false;
  return f;
}

function fileField(label: string, accept: string) {
  const input = el("input");
  input.type = "file";
  input.accept = accept;
  const wrap = el("label", label);
  wrap.className = "field";
  wrap.append(input);
  return { wrap, input };
}

/** Apple's artwork rule, checked here because the Coordinator does not open images. */
async function checkArtwork(file: File): Promise<string | undefined> {
  const bitmap = await createImageBitmap(file).catch(() => undefined);
  if (!bitmap) return t("imageUnreadable");
  const { width, height } = bitmap;
  bitmap.close();
  return width === height && width >= 1400 && width <= 3000 ? undefined : t("imageSize", { width, height });
}

/** Seconds of audio, read by the browser: the Coordinator does not process audio (ADR-0001). */
function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** Content type the Coordinator expects for each extension: browsers leave `.srt` and `.vtt` blank. */
function contentType(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "vtt") return "text/vtt";
  if (ext === "srt") return "application/x-subrip";
  return file.type;
}

/** PUTs a file with a progress bar; XHR because fetch reports no upload progress. */
function upload(url: string, file: File, progress: HTMLProgressElement): Promise<PodcastView | undefined> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType(file));
    xhr.responseType = "json";
    progress.hidden = false;
    progress.value = 0;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress.value = e.loaded / e.total;
    };
    xhr.onload = async () => {
      progress.hidden = true;
      if (xhr.status === 200) return resolve(xhr.response as PodcastView);
      if (xhr.status === 401) session.expired();
      else error.textContent = await reasonOf(new Response(JSON.stringify(xhr.response), { status: xhr.status }));
      resolve(undefined);
    };
    xhr.onerror = () => {
      progress.hidden = true;
      error.textContent = t("requestFailed", { status: 0 });
      resolve(undefined);
    };
    xhr.send(file);
  });
}

/**
 * The file already uploaded to `url`: a link to it (a thumbnail for images) and a button to remove
 * it. Once removed, the line goes and the field takes `emptyLabel`. Its problems are shown here, next
 * to the field, since the page-wide error may be out of sight.
 */
function storedFile(
  url: string,
  text: string,
  field: { wrap: HTMLElement },
  emptyLabel: string,
  removed: (p: PodcastView) => void,
): HTMLElement {
  const line = el("div");
  line.className = "stored-file";
  const open = el("a");
  open.href = url;
  open.target = "_blank";
  if (field.wrap.querySelector("input")?.accept.startsWith("image/")) {
    const thumb = el("img");
    thumb.src = url;
    thumb.alt = "";
    open.append(thumb);
  }
  open.append(text);
  const problem = el("span");
  problem.setAttribute("role", "alert");
  problem.className = "alert";
  const remove = button(
    t("removeFile"),
    async () => {
      if (!confirm(t("removeFileConfirm"))) return;
      const now = await request<PodcastView>(url, "DELETE");
      problem.textContent = error.textContent;
      error.textContent = "";
      if (!now || now === true) return;
      line.remove();
      field.wrap.firstChild!.textContent = emptyLabel;
      removed(now);
    },
    "danger",
  );
  line.append(open, remove, problem);
  return line;
}

function progressBar(): HTMLProgressElement {
  const progress = el("progress");
  progress.max = 1;
  progress.hidden = true;
  return progress;
}

function detailsSection(p: PodcastView, show: (p: PodcastView) => void): HTMLElement {
  const d = p.details;
  const title = field(t("podcastTitle"), d.title, 255);
  const description = textArea(t("podcastDescription"), d.description, 65536);
  const language = optional(field(t("podcastLanguage"), d.language, 35));
  language.input.placeholder = "es";
  const category = select(t("podcastCategory"), [["", "—"], ...CATEGORIES.map((c): [string, string] => [c, c])], d.category);
  const author = optional(field(t("podcastAuthor"), d.author, 255));
  const owner = optional(field(t("podcastOwnerEmail"), d.ownerEmail, 255));
  owner.input.type = "email";
  const ownerHint = el("small", t("podcastOwnerHint"));
  ownerHint.className = "hint";
  const explicit = el("input");
  explicit.type = "checkbox";
  explicit.checked = d.explicit;
  const explicitLabel = el("label");
  explicitLabel.className = "check";
  explicitLabel.append(explicit, t("explicit"));
  const showType = select<ShowType>(
    t("podcastType"),
    [
      ["episodic", t("episodic")],
      ["serial", t("serial")],
    ],
    d.showType,
  );
  const copyright = optional(field(t("podcastCopyright"), d.copyright, 255));
  const privateBox = el("input");
  privateBox.type = "checkbox";
  privateBox.checked = d.private;
  const privateLabel = el("label");
  privateLabel.className = "check";
  privateLabel.append(privateBox, t("podcastPrivate"));
  const privateHint = el("small", t("podcastPrivateHint"));
  privateHint.className = "hint";
  const cover = fileField(p.cover ? t("replaceCover") : t("podcastCover"), "image/jpeg,image/png");
  const coverHint = el("small", t("artworkHint"));
  coverHint.className = "hint";
  const progress = progressBar();
  const problem = el("p");
  problem.setAttribute("role", "alert");
  problem.className = "alert";

  const form = el("form");
  form.className = "stack";
  const save = el("button", t("save"));
  save.className = "primary";
  form.append(
    title.wrap,
    description.wrap,
    language.wrap,
    category.wrap,
    author.wrap,
    owner.wrap,
    ownerHint,
    explicitLabel,
    showType.wrap,
    copyright.wrap,
    privateLabel,
    privateHint,
    cover.wrap,
    ...(p.cover
      ? [storedFile(`${podcastUrl(p.slug)}/cover`, t("uploadedCover"), cover, t("podcastCover"), show)]
      : []),
    coverHint,
    progress,
    problem,
    save,
  );
  form.onsubmit = async (e) => {
    e.preventDefault();
    const file = cover.input.files?.[0];
    save.disabled = true;
    try {
      error.textContent = file ? ((await checkArtwork(file)) ?? "") : "";
      if (error.textContent) return;
      const details: PodcastDetails = {
        title: title.input.value,
        description: description.input.value,
        language: language.input.value,
        category: category.input.value,
        author: author.input.value,
        ownerEmail: owner.input.value,
        explicit: explicit.checked,
        showType: showType.input.value as ShowType,
        copyright: copyright.input.value,
        private: privateBox.checked,
      };
      const now = await request<PodcastView>(podcastUrl(p.slug), "PUT", details);
      if (!now || now === true) return;
      const after = file ? await upload(`${podcastUrl(p.slug)}/cover`, file, progress) : now;
      if (after) show(after);
    } finally {
      save.disabled = false;
      // Next to the button just pressed: the page-wide error may be scrolled out of sight.
      problem.textContent = error.textContent;
      error.textContent = "";
    }
  };

  const section = el("details");
  section.className = "card";
  // Open while something Apple needs is missing: that is the work left to do.
  section.open = missing(p).length > 0;
  section.append(el("summary", t("podcastDetails")), form);
  return section;
}

// ── Subscription keys ──────────────────────────────────────────────────────────────────────────

/** Who can read a private Podcast: one key each, revocable, its address shown only once. */
function keysSection(p: PodcastView, show: (p: PodcastView) => void): HTMLElement {
  const section = el("section");
  const created = el("div");
  const list = el("ul");
  list.className = "rows";
  if (!p.keys.length) list.append(el("li", t("noKeys")));
  for (const k of p.keys) {
    const row = el("li");
    row.className = "row";
    const head = el("div");
    head.className = "row-head";
    const used =
      k.lastUsedAt === null
        ? t("keyNeverUsed")
        : t("keyUsed", { when: dateTime(k.lastUsedAt), addresses: k.addresses });
    const meta = el("span", `${t("keyCreated", { when: dateTime(k.createdAt) })} · ${used}`);
    meta.className = "meta";
    const actions = el("div");
    actions.className = "actions";
    actions.append(
      button(
        t("revokeKey"),
        async () => {
          if (!confirm(t("revokeKeyConfirm", { name: k.name }))) return;
          const now = await request<PodcastView>(`${podcastUrl(p.slug)}/keys/${encodeURIComponent(k.id)}`, "DELETE");
          if (now && now !== true) show(now);
        },
        "danger",
      ),
    );
    head.append(el("strong", k.name), meta, actions);
    row.append(head);
    list.append(row);
  }
  const name = field(t("keyName"), "", 255);
  const add = formDialog(t("newKey"), [name.wrap], t("createKey"), async () => {
    const made = await request<NewSubscriptionKey>(`${podcastUrl(p.slug)}/keys`, "POST", { name: name.input.value });
    if (!made || made === true) return false;
    const fresh = await load<PodcastView>(podcastUrl(p.slug));
    if (fresh) show(fresh);
    // After the redraw, so the address is not lost with the old page.
    const box = el("div");
    box.className = "notice";
    box.setAttribute("role", "status");
    box.append(el("p", t("keyCreatedOnce", { name: name.input.value })), copyableLink(made.feedUrl, t("keyName")));
    document.querySelector("#key-result")?.replaceChildren(box);
    name.input.value = "";
    return true;
  });
  created.id = "key-result";
  section.append(pageHead(t("subscriptionKeys"), add), created, list);
  return section;
}

// ── Episodes ────────────────────────────────────────────────────────────────────────────────────

function episodeState(e: EpisodeView): [string, string] {
  const at = e.details.publishedAt;
  if (e.live) return ["live", t("episodeLive")];
  if (e.audioBytes === null) return ["draft", t("episodeNoAudio")];
  if (at === null) return ["draft", t("episodeDraft")];
  if (at > Date.now()) return ["scheduled", t("episodeScheduled")];
  return ["scheduled", t("episodePending")];
}

function duration(seconds: number): string {
  const s = Math.round(seconds);
  const parts = s >= 3600 ? [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60] : [Math.floor(s / 60), s % 60];
  return parts.map((n, i) => (i ? String(n).padStart(2, "0") : String(n))).join(":");
}

function megabytes(bytes: number): string {
  return new Intl.NumberFormat(undefined, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(
    bytes / 1e6,
  );
}

function episodesSection(p: PodcastView, show: (p: PodcastView) => void): HTMLElement {
  const section = el("section");
  const list = el("ul");
  list.className = "rows";
  const episodes = [...p.episodes].sort((a, b) => (b.details.publishedAt ?? Infinity) - (a.details.publishedAt ?? Infinity));
  if (!episodes.length) list.append(el("li", t("noEpisodes")));
  for (const e of episodes) list.append(episodeRow(p, e, show));
  const add = button(t("newEpisode"), () => episodeForm(p, undefined, show), "primary");
  section.append(pageHead(t("episodes"), add), list);
  return section;
}

function episodeRow(p: PodcastView, e: EpisodeView, show: (p: PodcastView) => void): HTMLElement {
  const row = el("li");
  row.className = "row";
  const head = el("div");
  head.className = "row-head";
  const [kind, text] = episodeState(e);
  const badge = el("span", text);
  badge.className = `badge ${kind}`;
  const parts: string[] = [];
  if (e.details.publishedAt !== null) parts.push(dateTime(e.details.publishedAt));
  if (e.details.duration !== null) parts.push(duration(e.details.duration));
  if (e.audioBytes !== null) parts.push(megabytes(e.audioBytes));
  const meta = el("span", parts.join(" · "));
  meta.className = "meta";
  const actions = el("div");
  actions.className = "actions";
  const url = `${podcastUrl(p.slug)}/episodes/${encodeURIComponent(e.slug)}`;
  if (e.live && !p.details.private) {
    const open = el("a", t("publicPage"));
    open.href = `${p.feedUrl.replace(/\/feed\.xml$/, "")}/${encodeURIComponent(e.slug)}`;
    open.target = "_blank";
    open.className = "button";
    actions.append(open);
  }
  actions.append(
    button(t("edit"), () => episodeForm(p, e, show)),
    button(
      t("deleteEpisode"),
      async () => {
        if (!confirm(t("deleteEpisodeConfirm", { name: e.details.title }))) return;
        const now = await request<PodcastView>(url, "DELETE");
        if (now && now !== true) show(now);
      },
      "danger",
    ),
  );
  head.append(el("strong", e.details.title), badge, meta, actions);
  const slug = el("small", t("podcastLabel", { slug: e.slug }));
  slug.className = "slug";
  slug.style.marginLeft = "0";
  row.append(head, slug);
  return row;
}

/** `datetime-local` value of a time, in the viewer's zone. */
function localInput(ms: number): string {
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function numberField(label: string, value: number | null) {
  const f = optional(field(label, value === null ? "" : String(value), 6));
  f.input.type = "number";
  f.input.min = "0";
  return f;
}

/** Creates an Episode (with `e` undefined) or edits it; files are optional when editing. */
function episodeForm(p: PodcastView, e: EpisodeView | undefined, show: (p: PodcastView) => void) {
  const d = e?.details;
  const title = field(t("episodeTitle"), d?.title ?? "", 255);
  const notes = textArea(t("episodeNotes"), d?.notes ?? "", 65536);
  const notesHint = el("small", t("episodeNotesHint"));
  notesHint.className = "hint";
  const date = optional(field(t("episodeDate"), d?.publishedAt == null ? "" : localInput(d.publishedAt)));
  date.input.type = "datetime-local";
  const dateHint = el("small", t("episodeDateHint"));
  dateHint.className = "hint";
  const explicit = select(
    t("explicit"),
    [
      ["", t("explicitInherit", { value: p.details.explicit ? t("yes") : t("no") })],
      ["true", t("yes")],
      ["false", t("no")],
    ],
    d?.explicit == null ? "" : String(d.explicit),
  );
  const type = select<EpisodeType>(
    t("episodeType"),
    [
      ["full", t("episodeFull")],
      ["trailer", t("episodeTrailer")],
      ["bonus", t("episodeBonus")],
    ],
    d?.episodeType ?? "full",
  );
  const season = numberField(t("episodeSeason"), d?.season ?? null);
  const number = numberField(t("episodeNumber"), d?.number ?? null);
  const audio = fileField(e?.audioBytes != null ? t("replaceAudio") : t("episodeAudio"), "audio/mpeg,.mp3");
  audio.input.required = !e;
  const image = fileField(e?.image ? t("replaceImage") : t("episodeImage"), "image/jpeg,image/png");
  const transcript = fileField(e?.transcript ? t("replaceTranscript") : t("episodeTranscript"), ".vtt,.srt");
  const fileUrl = (kind: string) => `${podcastUrl(p.slug)}/episodes/${encodeURIComponent(e!.slug)}/${kind}`;
  const storedImage = e?.image
    ? [storedFile(fileUrl("image"), t("uploadedImage"), image, t("episodeImage"), show)]
    : [];
  const storedTranscript = e?.transcript
    ? [storedFile(fileUrl("transcript"), t("uploadedTranscript"), transcript, t("episodeTranscript"), show)]
    : [];
  const progress = progressBar();
  const numbers = el("div");
  numbers.className = "inline-form";
  numbers.append(season.wrap, number.wrap);

  // Once created, a retry after a failed upload edits the same Episode instead of making another.
  let made = e?.slug;
  showForm(
    e ? t("editEpisode") : t("newEpisode"),
    [
      title.wrap,
      notes.wrap,
      notesHint,
      date.wrap,
      dateHint,
      explicit.wrap,
      type.wrap,
      numbers,
      audio.wrap,
      image.wrap,
      ...storedImage,
      transcript.wrap,
      ...storedTranscript,
      progress,
    ],
    e ? t("save") : t("createEpisode"),
    async () => {
      const audioFile = audio.input.files?.[0];
      const imageFile = image.input.files?.[0];
      const transcriptFile = transcript.input.files?.[0];
      error.textContent = imageFile ? ((await checkArtwork(imageFile)) ?? "") : "";
      if (error.textContent) return false;
      const seconds = audioFile ? await audioDuration(audioFile) : (d?.duration ?? null);
      const details: EpisodeDetails = {
        title: title.input.value,
        notes: notes.input.value,
        publishedAt: date.input.value ? new Date(date.input.value).getTime() : null,
        duration: seconds,
        explicit: explicit.input.value === "" ? null : explicit.input.value === "true",
        episodeType: type.input.value as EpisodeType,
        season: season.input.value === "" ? null : Number(season.input.value),
        number: number.input.value === "" ? null : Number(number.input.value),
      };
      const before = new Set(p.episodes.map((x) => x.slug));
      const url = made ? `${podcastUrl(p.slug)}/episodes/${encodeURIComponent(made)}` : `${podcastUrl(p.slug)}/episodes`;
      let now = await request<PodcastView>(url, made ? "PUT" : "POST", details);
      if (!now || now === true) return false;
      // A new Episode's slug comes from the server: the one that was not there before.
      made ??= now.episodes.find((x) => !before.has(x.slug))?.slug;
      const slug = made;
      const files: [string, File | undefined][] = [
        ["audio", audioFile],
        ["image", imageFile],
        ["transcript", transcriptFile],
      ];
      for (const [kind, file] of files) {
        if (!file || !slug || !now) continue;
        const after = await upload(`${podcastUrl(p.slug)}/episodes/${encodeURIComponent(slug)}/${kind}`, file, progress);
        if (!after) {
          // The Episode exists by now: show it, and keep the form for another try.
          show(now);
          return false;
        }
        now = after;
      }
      show(now);
      return true;
    },
  );
}
