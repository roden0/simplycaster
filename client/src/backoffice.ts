// Backoffice (CU1, CU2, CU8, CU9, ADR-0011): sign in, manage Accounts, Rooms and Invitations.
import { ACCOUNT_ROLE_LABEL, applyLocale, ROLE_LABEL, STATUS_LABEL, t, type MessageKey } from "./i18n.ts";

/** Same as the Coordinator's MAX_PARTICIPANTS. */
// shortcut: repeated by hand; send it from the Coordinator if it ever becomes configurable.
const MAX_PARTICIPANTS = 5;
import { el } from "./dom.ts";
import type { RoomView } from "./protocol/RoomView.ts";
import type { BackofficeError } from "./protocol/BackofficeError.ts";
import type { SignIn } from "./protocol/SignIn.ts";
import type { AccountRole } from "./protocol/AccountRole.ts";
import type { AccountView } from "./protocol/AccountView.ts";
import type { CreateAccount } from "./protocol/CreateAccount.ts";
import type { EnrolmentLink } from "./protocol/EnrolmentLink.ts";
import type { FinishLogin } from "./protocol/FinishLogin.ts";
import type { FinishRegistration } from "./protocol/FinishRegistration.ts";
import type { Me } from "./protocol/Me.ts";
import type { PasskeyChallenge } from "./protocol/PasskeyChallenge.ts";
import type { SignInOptions } from "./protocol/SignInOptions.ts";
import type { StartEnrolment } from "./protocol/StartEnrolment.ts";
import { createPasskey, getPasskey } from "./passkeys.ts";

const app = document.querySelector<HTMLElement>("#app")!;
const base = "/api/backoffice";
const api = `${base}/rooms`;

const ERROR_KEY: Record<BackofficeError, MessageKey> = {
  invalidName: "errorInvalidName",
  nameTaken: "errorNameTaken",
  roomFull: "errorRoomFull",
  recording: "errorRecording",
  closed: "errorClosed",
  open: "errorOpen",
  converting: "errorConverting",
  invalidEmail: "errorInvalidEmail",
  emailTaken: "errorEmailTaken",
  lastAdmin: "errorLastAdmin",
  invalidEnrolment: "errorInvalidEnrolment",
  passkeysUnavailable: "errorPasskeysUnavailable",
  notSaved: "errorNotSaved",
};

applyLocale();
document.title = t("backofficeTitle");
/** What is under the title: the sign-in form, or the Rooms. */
const main = el("div");
app.append(el("h1", t("backofficeTitle")), el("small", t("buildInfo", { build: __BUILD_TIME__ })), main);
const error = el("p");
error.setAttribute("role", "alert");
const roomsList = el("div");

/** Why a failed response failed, for the person reading it. */
async function reasonOf(res: Response): Promise<string> {
  const reason: BackofficeError | undefined = await res.json().catch(() => undefined);
  return reason ? t(ERROR_KEY[reason], { max: MAX_PARTICIPANTS }) : t("requestFailed", { status: res.status });
}

function jsonRequest(url: string, method: string, body?: object): Promise<Response> {
  return fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body && JSON.stringify(body),
  });
}

/** Calls any backoffice URL; on failure shows why and returns undefined. No content comes back as `true`. */
async function request<T>(url: string, method: string, body?: object): Promise<T | true | undefined> {
  error.textContent = "";
  const res = await jsonRequest(url, method, body);
  if (res.status === 204) return true;
  if (res.ok) return res.json();
  if (res.status === 401) {
    showSignIn(); // the session expired, or the Account is gone
    return;
  }
  error.textContent = await reasonOf(res);
}

/** Calls the Rooms API. */
function call(path: string, body?: object): Promise<RoomView | RoomView[] | true | undefined> {
  return request(api + path, body ? "POST" : "GET", body);
}

/** Why a passkey request did not finish: the browser's error is not meant for people. */
function passkeyProblem(e: unknown): string {
  return e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")
    ? t("passkeyCancelled")
    : t("passkeyRefused");
}

/** Finishes a registration started by `start`, which also signs in. Returns the problem, if any. */
async function registerPasskey(start: Response): Promise<string | undefined> {
  if (!start.ok) return reasonOf(start);
  const { ceremony, options }: PasskeyChallenge = await start.json();
  try {
    const credential = await createPasskey(options);
    const res = await jsonRequest(`${base}/passkeys`, "POST", { ceremony, credential } satisfies FinishRegistration);
    return res.ok ? undefined : reasonOf(res);
  } catch (e) {
    return passkeyProblem(e);
  }
}

/** A read-only link with a button to copy it. */
function copyableLink(value: string, label: string): HTMLElement[] {
  const link = el("input");
  link.readOnly = true;
  // Wide enough to read, never wider than a phone screen.
  link.style.width = "min(100%, 40em)";
  link.style.boxSizing = "border-box";
  link.value = value;
  link.setAttribute("aria-label", label);
  const copy = el("button", t("copy"));
  copy.type = "button";
  copy.onclick = async () => {
    link.select();
    await navigator.clipboard?.writeText(link.value).catch((e) => console.warn("copy failed", e));
    copy.textContent = t("copied");
  };
  return [link, copy];
}

function field(label: string, value = "", maxLength = 40) {
  const input = el("input");
  input.value = value;
  input.required = true;
  input.maxLength = maxLength;
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
    el("h3", t("roomHeading", { name: room.displayName, created: createdText(room) })),
    el("p", t("roomSummary", { state, takes: t("roomTakes", { takes: room.takeNumbers.length }) })),
    el("small", t("roomLabel", { slug: room.name })),
  );

  const list = el("ul");
  for (const inv of room.invitations) {
    const item = el(
      "li",
      t("invitationEntry", {
        name: inv.name,
        role: t(ROLE_LABEL[inv.role]),
        status: t(STATUS_LABEL[inv.status]),
      }),
    );
    if (!room.closed) {
      const [link, copy] = copyableLink(`${location.origin}/i/${inv.token}`, t("invitationLink", { name: inv.name }));
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
    const remove = el("button", t("deleteRoom"));
    remove.onclick = async () => {
      if (!confirm(t("deleteRoomConfirm", { name: room.displayName }))) return;
      if (await request(`${api}/${encodeURIComponent(room.id)}`, "DELETE")) refresh();
    };
    const removeRow = el("p");
    removeRow.append(remove);
    // Deleting a Take never renumbers the others: their files keep their names.
    const takes = el("ul");
    for (const take of room.takeNumbers) {
      const removeTake = el("button", t("deleteTake"));
      removeTake.onclick = async () => {
        if (!confirm(t("deleteTakeConfirm", { take, name: room.displayName }))) return;
        if (await request(`${roomUrl}/takes/${take}`, "DELETE")) refresh();
      };
      const item = el("li", t("takeEntry", { take }));
      item.append(" ", removeTake);
      takes.append(item);
    }
    if (room.takeNumbers.length) section.append(el("h4", t("takesHeading")), takes);
    section.append(download, flacRow, removeRow);
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
      ? t("closePending", { names: now.pending.join(", "), name: room.displayName })
      : t("closeConfirm", { name: room.displayName });
    if (confirm(question) && (await call(`/${encodeURIComponent(room.id)}/close`, {}))) refresh();
  };
  const closeRow = el("p");
  closeRow.append(close);
  section.append(form, closeRow);
  return section;
}

/** Shows how to sign in: a passkey, and the installation token while the Initial Admin exists. */
async function showSignIn() {
  const options: SignInOptions | undefined = await fetch(`${base}/session`)
    .then((r) => r.json())
    .catch(() => undefined);
  const wrong = el("p");
  wrong.setAttribute("role", "alert");
  const parts: HTMLElement[] = [];

  if (options?.passkeys) {
    const passkey = el("button", t("signInPasskey"));
    passkey.onclick = async () => {
      wrong.textContent = await signInWithPasskey();
      if (!wrong.textContent) showRooms();
    };
    parts.push(passkey);
  } else {
    parts.push(el("p", t("passkeysOff")));
  }

  if (options?.token) {
    const form = el("form");
    const token = el("input");
    token.type = "password";
    token.required = true;
    token.autocomplete = "current-password";
    const label = el("label", t("backofficeToken"));
    label.append(" ", token);
    form.append(label, " ", el("button", t("signIn")));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const res = await jsonRequest(`${base}/session`, "POST", { token: token.value } satisfies SignIn).catch(
        () => undefined,
      );
      if (res?.ok) showRooms();
      else wrong.textContent = res?.status === 401 ? t("wrongBackofficeToken") : t("requestFailed", { status: res?.status ?? 0 });
    };
    parts.push(form);
  }
  main.replaceChildren(...parts, wrong);
}

/** The problem signing in, or an empty text when it worked. */
async function signInWithPasskey(): Promise<string> {
  const start = await jsonRequest(`${base}/login`, "POST", {});
  if (!start.ok) return reasonOf(start);
  const { ceremony, options }: PasskeyChallenge = await start.json();
  try {
    const credential = await getPasskey(options);
    const res = await jsonRequest(`${base}/login/finish`, "POST", { ceremony, credential } satisfies FinishLogin);
    return res.ok ? "" : t("passkeyRefused");
  } catch (e) {
    return passkeyProblem(e);
  }
}

/** The page an enrolment link opens: its secret came in the fragment, which is never sent to a server. */
function showEnrolment(token: string) {
  const wrong = el("p");
  wrong.setAttribute("role", "alert");
  const create = el("button", t("enrolButton"));
  create.onclick = async () => {
    const start = await jsonRequest(`${base}/enrolment`, "POST", { token } satisfies StartEnrolment);
    const problem = await registerPasskey(start);
    if (problem) {
      wrong.textContent = problem;
      return;
    }
    history.replaceState(null, "", location.pathname);
    showRooms();
  };
  main.replaceChildren(el("h2", t("enrolTitle")), el("p", t("enrolHint")), create, wrong);
}

function accountLine(account: AccountView): string {
  const role = t(ACCOUNT_ROLE_LABEL[account.role]);
  const name = account.initial ? t("initialAdminName") : account.name;
  return account.email
    ? t("accountEntryEmail", { name, email: account.email, role, passkeys: account.passkeys })
    : t("accountEntry", { name, role, passkeys: account.passkeys });
}

/** Where a new enrolment link is shown, and the link's address. */
const enrolmentResult = el("div");

function showEnrolmentLink(name: string, token: string) {
  const url = `${location.origin}/backoffice#enrol=${token}`;
  const [link, copy] = copyableLink(url, t("enrolmentLinkLabel", { name }));
  enrolmentResult.replaceChildren(el("p", t("enrolmentLink", { name })), link, " ", copy);
}

const accountsList = el("ul");

async function refreshAccounts() {
  const accounts = await request<AccountView[]>(`${base}/accounts`, "GET");
  if (!accounts || accounts === true) return;
  accountsList.replaceChildren(
    ...accounts.map((account) => {
      const item = el("li", accountLine(account));
      const url = `${base}/accounts/${encodeURIComponent(account.id)}`;
      const name = account.initial ? t("initialAdminName") : account.name;
      const again = el("button", t("newEnrolmentLink"));
      again.onclick = async () => {
        const link = await request<EnrolmentLink>(`${url}/enrolment`, "POST", {});
        if (link && link !== true) showEnrolmentLink(name, link.token);
      };
      const remove = el("button", t("deleteAccount"));
      remove.onclick = async () => {
        if (confirm(t("deleteAccountConfirm", { name })) && (await request(url, "DELETE"))) refreshAccounts();
      };
      item.append(" ", again, " ", remove);
      return item;
    }),
  );
}

/** Admins only: who can use this instance. */
function accountsSection(): HTMLElement {
  const section = el("section");
  const form = el("form");
  const name = field(t("accountName"), "", 80);
  const email = field(t("accountEmail"), "", 254);
  email.input.type = "email";
  const role = el("select");
  for (const value of ["host", "admin"] satisfies AccountRole[]) {
    const option = el("option", t(ACCOUNT_ROLE_LABEL[value]));
    option.value = value;
    role.append(option);
  }
  const roleLabel = el("label", t("accountRole"));
  roleLabel.append(" ", role);
  form.append(name.wrap, " ", email.wrap, " ", roleLabel, " ", el("button", t("createAccount")));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = { name: name.input.value, email: email.input.value, role: role.value as AccountRole };
    const link = await request<EnrolmentLink>(`${base}/accounts`, "POST", body satisfies CreateAccount);
    if (link && link !== true) {
      showEnrolmentLink(name.input.value, link.token);
      name.input.value = email.input.value = "";
      refreshAccounts();
    }
  };
  section.append(el("h2", t("accounts")), accountsList, el("h3", t("newAccount")), form, enrolmentResult);
  refreshAccounts();
  return section;
}

/** The signed-in Account: adding a second device is what makes losing one no emergency. */
function accountSection(me: Me): HTMLElement {
  const section = el("section");
  const status = el("p");
  status.setAttribute("role", "status");
  const add = el("button", t("addPasskey"));
  add.onclick = async () => {
    const problem = await registerPasskey(await jsonRequest(`${base}/me/passkeys`, "POST", {}));
    status.textContent = problem ?? t("passkeyAdded");
  };
  section.append(el("h2", t("account")), el("p", me.initial ? t("initialAdminName") : me.name));
  if (me.initial) section.append(el("p", t("initialAdminHint")));
  section.append(add, status);
  return section;
}

async function showRooms() {
  const form = el("form");
  const name = field(t("roomName"), "", 120);
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
  main.replaceChildren(el("h2", t("newRoom")), form, error, el("h2", t("rooms")), reload, roomsList);
  refresh();
  const me = await request<Me>(`${base}/me`, "GET");
  if (me && me !== true) {
    main.append(accountSection(me));
    if (me.role === "admin") main.append(accountsSection());
  }
  const signOut = el("button", t("signOut"));
  signOut.onclick = async () => {
    await fetch(`${base}/session`, { method: "DELETE" }).catch(() => undefined);
    showSignIn();
  };
  main.append(signOut);
}

const enrol = new URLSearchParams(location.hash.slice(1)).get("enrol");
if (enrol) showEnrolment(enrol);
else {
  const first = await fetch(api).catch(() => undefined);
  if (first?.status === 401) showSignIn();
  else showRooms();
}
