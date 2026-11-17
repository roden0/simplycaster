// Backoffice (CU1, CU2, CU8, CU9, ADR-0011): sign in, then a page per section under one menu.
import "./backoffice.css";
import { applyLocale, t } from "./i18n.ts";
import { el } from "./dom.ts";
import type { FinishLogin } from "./protocol/FinishLogin.ts";
import type { Me } from "./protocol/Me.ts";
import type { PasskeyChallenge } from "./protocol/PasskeyChallenge.ts";
import type { SignIn } from "./protocol/SignIn.ts";
import type { SignInOptions } from "./protocol/SignInOptions.ts";
import type { StartEnrolment } from "./protocol/StartEnrolment.ts";
import { getPasskey } from "./passkeys.ts";
import { base, button, error, features, jsonRequest, load, passkeyProblem, reasonOf, registerPasskey, session } from "./backoffice-common.ts";
import { dashboardPage } from "./backoffice-dashboard.ts";
import { roomsPage } from "./backoffice-rooms.ts";
import { accountsPage } from "./backoffice-accounts.ts";
import { podcastPage, podcastsPage } from "./backoffice-podcasts.ts";

const main = document.querySelector<HTMLElement>("#app")!;
const header = el("header");
header.className = "bar";
const footer = el("footer", t("buildInfo", { build: __BUILD_TIME__ }));
main.before(header);
main.after(footer);

applyLocale();
document.title = t("backofficeTitle");

type Page = {
  path: string;
  label: Parameters<typeof t>[0];
  admin?: boolean;
  /** Only with PUBLIC_URL set (ADR-0013). */
  publishing?: boolean;
  /** Also answers `<path>/<item>`, handing it the item. */
  nested?: boolean;
  show: (me: Me, item: string) => HTMLElement[];
};
const pages: Page[] = [
  { path: "/backoffice", label: "dashboard", show: (me) => dashboardPage(me, navigate) },
  { path: "/backoffice/rooms", label: "rooms", show: roomsPage },
  {
    path: "/backoffice/podcasts",
    label: "podcasts",
    publishing: true,
    nested: true,
    show: (_, item) => (item ? podcastPage(item, navigate) : podcastsPage(navigate)),
  },
  { path: "/backoffice/accounts", label: "accounts", admin: true, show: accountsPage },
];

let me: Me | undefined;

function navigate(path: string) {
  history.pushState(null, "", path);
  render();
}

addEventListener("popstate", () => render());

/** The page for the address bar; one the Account may not see falls back to the dashboard. */
function render() {
  if (!me) return;
  const signedIn = me;
  const allowed = pages.filter(
    (p) => (!p.admin || signedIn.role === "admin") && (!p.publishing || signedIn.publishing),
  );
  const path = location.pathname;
  const inside = (p: Page) => p.nested && path.startsWith(`${p.path}/`) && path.length > p.path.length + 1;
  const page = allowed.find((p) => p.path === path || inside(p)) ?? allowed[0];
  const item = inside(page) ? decodeURIComponent(path.slice(page.path.length + 1)) : "";
  if (page.path !== path && !item) history.replaceState(null, "", page.path);
  error.textContent = "";
  renderHeader(allowed, page);
  main.replaceChildren(...page.show(signedIn, item));
  document.title = `${t(page.label)} · ${t("backofficeTitle")}`;
}

function renderHeader(allowed: Page[], current: Page) {
  const brand = el("span", t("appTitle"));
  brand.className = "brand";
  const nav = el("nav");
  nav.setAttribute("aria-label", t("backofficeTitle"));
  for (const page of allowed) {
    const link = el("a", t(page.label));
    link.href = page.path;
    if (page === current) link.setAttribute("aria-current", "page");
    link.onclick = (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(page.path);
    };
    nav.append(link);
  }
  const who = el("span", me?.initial ? t("initialAdminName") : (me?.name ?? ""));
  who.className = "who";
  const signOut = button(t("signOut"), async () => {
    await fetch(`${base}/session`, { method: "DELETE" }).catch(() => undefined);
    showSignIn();
  });
  header.replaceChildren(brand, nav, who, signOut);
}

/** Signed in: who it is decides the menu. */
async function start() {
  const now = await load<Me>(`${base}/me`);
  if (!now) return; // a 401 already showed the sign-in
  me = now;
  features.mail = now.mail;
  render();
}

session.expired = showSignIn;

/** Shows how to sign in: a passkey, and the installation token while the Initial Admin exists. */
async function showSignIn() {
  me = undefined;
  header.replaceChildren(Object.assign(el("span", t("appTitle")), { className: "brand" }));
  const options: SignInOptions | undefined = await fetch(`${base}/session`)
    .then((r) => r.json())
    .catch(() => undefined);
  const wrong = el("p");
  wrong.setAttribute("role", "alert");
  wrong.className = "alert";
  const parts: HTMLElement[] = [];

  if (options?.passkeys) {
    const passkey = button(
      t("signInPasskey"),
      async () => {
        wrong.textContent = await signInWithPasskey();
        if (!wrong.textContent) start();
      },
      "primary",
    );
    parts.push(passkey);
  } else {
    parts.push(el("p", t("passkeysOff")));
  }

  if (options?.token) {
    const form = el("form");
    form.className = "inline-form";
    const token = el("input");
    token.type = "password";
    token.required = true;
    token.autocomplete = "current-password";
    const label = el("label", t("backofficeToken"));
    label.className = "field";
    label.append(token);
    form.append(label, el("button", t("signIn")));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const res = await jsonRequest(`${base}/session`, "POST", { token: token.value } satisfies SignIn).catch(
        () => undefined,
      );
      if (res?.ok) start();
      else
        wrong.textContent =
          res?.status === 401 ? t("wrongBackofficeToken") : t("requestFailed", { status: res?.status ?? 0 });
    };
    parts.push(form);
  }
  const box = el("section");
  box.className = "card narrow";
  box.append(el("h1", t("signIn")), ...parts, wrong);
  main.replaceChildren(box);
}

/** The problem signing in, or an empty text when it worked. */
async function signInWithPasskey(): Promise<string> {
  const begin = await jsonRequest(`${base}/login`, "POST", {});
  if (!begin.ok) return reasonOf(begin);
  const { ceremony, options }: PasskeyChallenge = await begin.json();
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
  header.replaceChildren(Object.assign(el("span", t("appTitle")), { className: "brand" }));
  const wrong = el("p");
  wrong.setAttribute("role", "alert");
  wrong.className = "alert";
  const create = button(
    t("enrolButton"),
    async () => {
      const begin = await jsonRequest(`${base}/enrolment`, "POST", { token } satisfies StartEnrolment);
      const problem = await registerPasskey(begin);
      if (problem) {
        wrong.textContent = problem;
        return;
      }
      history.replaceState(null, "", location.pathname);
      start();
    },
    "primary",
  );
  const box = el("section");
  box.className = "card narrow";
  box.append(el("h1", t("enrolTitle")), el("p", t("enrolHint")), create, wrong);
  main.replaceChildren(box);
}

const enrol = new URLSearchParams(location.hash.slice(1)).get("enrol");
if (enrol) showEnrolment(enrol);
else start();
