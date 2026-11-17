// What every backoffice page shares: calling the API, showing why it failed, and small form pieces.
import { t, type MessageKey } from "./i18n.ts";
import { el } from "./dom.ts";
import type { BackofficeError } from "./protocol/BackofficeError.ts";
import type { FinishRegistration } from "./protocol/FinishRegistration.ts";
import type { PasskeyChallenge } from "./protocol/PasskeyChallenge.ts";
import { createPasskey } from "./passkeys.ts";

/** Same as the Coordinator's MAX_PARTICIPANTS. */
// shortcut: repeated by hand; send it from the Coordinator if it ever becomes configurable.
const MAX_PARTICIPANTS = 5;

export const base = "/api/backoffice";

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

/** The page-wide error line, above the content of every page. */
export const error = el("p");
error.setAttribute("role", "alert");
error.className = "alert";

/** What to do when the session is gone: set by the page shell, which owns the sign-in. */
export const session = { expired: () => {} };

/** Why a failed response failed, for the person reading it. */
export async function reasonOf(res: Response): Promise<string> {
  const reason: BackofficeError | undefined = await res.json().catch(() => undefined);
  return reason ? t(ERROR_KEY[reason], { max: MAX_PARTICIPANTS }) : t("requestFailed", { status: res.status });
}

export function jsonRequest(url: string, method: string, body?: object): Promise<Response> {
  return fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body && JSON.stringify(body),
  });
}

/** Calls any backoffice URL; on failure shows why and returns undefined. No content comes back as `true`. */
export async function request<T>(url: string, method: string, body?: object): Promise<T | true | undefined> {
  error.textContent = "";
  const res = await jsonRequest(url, method, body).catch(() => undefined);
  if (!res) {
    error.textContent = t("requestFailed", { status: 0 });
    return;
  }
  if (res.status === 204) return true;
  if (res.ok) return res.json();
  if (res.status === 401) {
    session.expired(); // the session expired, or the Account is gone
    return;
  }
  error.textContent = await reasonOf(res);
}

/** Like `request`, for a GET whose answer is data. */
export async function load<T>(url: string): Promise<T | undefined> {
  const data = await request<T>(url, "GET");
  return data === true ? undefined : data;
}

/** Why a passkey request did not finish: the browser's error is not meant for people. */
export function passkeyProblem(e: unknown): string {
  return e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")
    ? t("passkeyCancelled")
    : t("passkeyRefused");
}

/** Finishes a registration started by `start`, which also signs in. Returns the problem, if any. */
export async function registerPasskey(start: Response): Promise<string | undefined> {
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

export function button(text: string, onclick: () => void, kind?: "primary" | "danger"): HTMLButtonElement {
  const b = el("button", text);
  b.type = "button";
  if (kind) b.className = kind;
  b.onclick = onclick;
  return b;
}

/** A read-only link with a button to copy it. */
export function copyableLink(value: string, label: string): HTMLElement {
  const wrap = el("div");
  wrap.className = "copyable";
  const link = el("input");
  link.readOnly = true;
  link.value = value;
  link.setAttribute("aria-label", label);
  const copy = button(t("copy"), async () => {
    link.select();
    await navigator.clipboard?.writeText(link.value).catch((e) => console.warn("copy failed", e));
    copy.textContent = t("copied");
  });
  wrap.append(link, copy);
  return wrap;
}

export function field(label: string, value = "", maxLength = 40) {
  const input = el("input");
  input.value = value;
  input.required = true;
  input.maxLength = maxLength;
  const wrap = el("label", label);
  wrap.className = "field";
  wrap.append(input);
  return { wrap, input };
}

/** The title row of a page: its heading and its actions. */
export function pageHead(title: string, ...actions: HTMLElement[]): HTMLElement {
  const head = el("div");
  head.className = "page-head";
  const tools = el("div");
  tools.className = "actions";
  tools.append(...actions);
  head.append(el("h1", title), tools);
  return head;
}

/**
 * A modal form: `submit` returns true when done, which closes it; otherwise it stays open with the
 * reason shown inside. Returns the button that opens it, with the dialog beside it so both leave
 * the page together.
 */
export function formDialog(
  title: string,
  fields: HTMLElement[],
  submitText: string,
  submit: () => Promise<boolean>,
): HTMLElement {
  const dialog = el("dialog");
  const form = el("form");
  const problem = el("p");
  problem.setAttribute("role", "alert");
  problem.className = "alert";
  const cancel = button(t("cancel"), () => dialog.close());
  const ok = el("button", submitText);
  ok.className = "primary";
  const actions = el("div");
  actions.className = "actions";
  actions.append(cancel, ok);
  form.append(el("h2", title), ...fields, problem, actions);
  form.onsubmit = async (e) => {
    e.preventDefault();
    ok.disabled = true;
    const done = await submit().finally(() => (ok.disabled = false));
    // The page-wide error sits behind the modal: show it here instead.
    problem.textContent = done ? "" : error.textContent;
    if (done) {
      error.textContent = "";
      dialog.close();
    }
  };
  dialog.append(form);
  const open = button(
    title,
    () => {
      problem.textContent = "";
      dialog.showModal();
    },
    "primary",
  );
  const wrap = el("span");
  wrap.className = "contents";
  wrap.append(open, dialog);
  return wrap;
}

/** A date and time in the viewer's locale and time zone. */
export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
