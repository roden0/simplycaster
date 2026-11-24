// Accounts page, Admins only (ADR-0011): who can use this instance, and their enrolment links.
import { ACCOUNT_ROLE_LABEL, list as joined, t } from "./i18n.ts";
import { el } from "./dom.ts";
import type { AccountRole } from "./protocol/AccountRole.ts";
import type { AccountView } from "./protocol/AccountView.ts";
import type { CreateAccount } from "./protocol/CreateAccount.ts";
import type { EnrolmentLink } from "./protocol/EnrolmentLink.ts";
import type { SendEnrolment } from "./protocol/SendEnrolment.ts";
import { base, button, copyableLink, error, field, formDialog, load, pageHead, request } from "./backoffice-common.ts";

const list = el("ul");
list.className = "rows";
/** Where a new enrolment link is shown, above the list. */
const enrolmentResult = el("div");

/** `mail` false for the initial Admin: it has no email to send to. */
function showEnrolmentLink(name: string, link: EnrolmentLink, email?: string, mail = true) {
  const { account, token } = link;
  const mailUrl = `${base}/accounts/${encodeURIComponent(account)}/enrolment/mail`;
  const send = async (to: string) =>
    !!(await request(mailUrl, "POST", { token, email: to } satisfies SendEnrolment));
  const url = `${location.origin}/backoffice#enrol=${token}`;
  const box = el("div");
  box.className = "notice";
  box.setAttribute("role", "status");
  box.append(el("p", t("enrolmentLink", { name })), copyableLink(url, t("enrolmentLinkLabel", { name }), mail ? { to: name, email, send } : undefined));
  enrolmentResult.replaceChildren(box);
}

async function refresh() {
  const accounts = await load<AccountView[]>(`${base}/accounts`);
  if (accounts) list.replaceChildren(...accounts.map(renderAccount));
}

function renderAccount(account: AccountView): HTMLElement {
  const name = account.initial ? t("initialAdminName") : account.name;
  const url = `${base}/accounts/${encodeURIComponent(account.id)}`;
  const row = el("li");
  row.className = "row";
  const head = el("div");
  head.className = "row-head";
  const role = el("span", t(ACCOUNT_ROLE_LABEL[account.role]));
  role.className = `badge ${account.role}`;
  const passkeys = t("accountPasskeys", { passkeys: account.passkeys });
  const meta = el("span", account.emailHint ? joined([account.emailHint, passkeys]) : passkeys);
  meta.className = "meta";
  const actions = el("div");
  actions.className = "actions";
  actions.append(
    button(t("newEnrolmentLink"), async () => {
      const link = await request<EnrolmentLink>(`${url}/enrolment`, "POST", {});
      if (link && link !== true) showEnrolmentLink(name, link, undefined, !account.initial);
    }),
    button(
      t("deleteAccount"),
      async () => {
        if (confirm(t("deleteAccountConfirm", { name })) && (await request(url, "DELETE"))) refresh();
      },
      "danger",
    ),
  );
  head.append(el("strong", name), role, meta, actions);
  row.append(head);
  return row;
}

function newAccountButton(): HTMLElement {
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
  roleLabel.className = "field";
  roleLabel.append(role);
  return formDialog(t("newAccount"), [name.wrap, email.wrap, roleLabel], t("createAccount"), async () => {
    const body = { name: name.input.value, email: email.input.value, role: role.value as AccountRole };
    const link = await request<EnrolmentLink>(`${base}/accounts`, "POST", body satisfies CreateAccount);
    if (!link || link === true) return false;
    showEnrolmentLink(body.name, link, body.email);
    name.input.value = email.input.value = "";
    refresh();
    return true;
  });
}

export function accountsPage(): HTMLElement[] {
  enrolmentResult.replaceChildren();
  refresh();
  return [pageHead(t("accounts"), newAccountButton()), error, enrolmentResult, list];
}
