// Message catalog: `en` is the base locale. Add another locale as a `Catalog` (TypeScript then
// reports any missing key) and list it in `catalogs`.
import type { AccountRole } from "./protocol/AccountRole.ts";
import type { ParticipantStatus } from "./protocol/ParticipantStatus.ts";
import type { Role } from "./protocol/Role.ts";

const en = {
  appTitle: "SimplyCaster",
  // Composed lines: templates, so another language can change the order and the separator.
  listSeparator: " · ",
  rosterEntry: "{name} · {role} · {details}",
  micProblemEntry: "⚠ {problem}",
  roomSummary: "{state} · {takes}",
  buildInfo: "build {build} UTC",
  noInvitation: "Open the personal link from your invitation to join the Room.",
  invalidInvitation: "This invitation is not valid, or its Room has been closed.",
  roomClosed: "The Host closed the Room. Thank you for recording!",
  joinedAs: "You are {name} ({role})",
  connecting: "Connecting…",
  reconnecting: "Connection lost. Reconnecting…",
  enableMicrophone: "Enable microphone",
  microphone: "Microphone",
  inputLevel: "Input level",
  micEnded: "Your microphone stopped. Choose it again, or reload the page and enable it.",
  micMuted: "The system muted your microphone: nothing is being recorded.",
  micHidden: "Keep this page in the foreground while recording: the system may cut the microphone.",
  micSilent: "Your microphone is sending no sound at all.",
  micEndedLabel: "microphone stopped",
  micMutedLabel: "microphone muted",
  micHiddenLabel: "page in background",
  micSilentLabel: "no sound",
  calibrate: "Calibrate latency",
  calibrateHint:
    "Plays a few clicks to measure your audio delay. Use the output you will record with: without headphones, keep the speakers on; with headphones, hold an earpiece against the microphone.",
  calibrating: "Calibrating… keep quiet for a few seconds.",
  latencyCalibrated: "Latency: {ms} ms (calibrated).",
  latencyEstimated: "Latency: {ms} ms (browser estimate, not calibrated).",
  calibrationFailed: "The clicks were not heard: using the browser estimate, {ms} ms. Turn the volume up and try again.",
  openedElsewhere: "This invitation was opened in another window or device. Reload this page to use it here.",
  useHeadphones: "Use headphones: you hear the other Participants live, and without headphones their voices leak into your Track and they hear their own echo.",
  liveConnecting: "live: connecting…",
  liveConnected: "live: you hear each other",
  liveInterrupted: "live: interrupted",
  liveFailed: "live: cannot connect",
  participants: "Participants",
  roleHost: "Host",
  roleGuest: "Guest",
  statusConnected: "connected",
  statusDisconnected: "disconnected",
  statusSyncing: "syncing",
  clockOffset: "clock offset {offset} ms (round trip {rtt} ms)",
  clockPending: "measuring clock…",
  micError: "Could not open the microphone. Allow it for this site and reload the page. ({error})",
  record: "Record",
  stop: "Stop",
  takeStarting: "Take {take} starts in a moment…",
  takeRecording: "Recording take {take}",
  takeStopped: "Take {take} stopped",
  notReadyToRecord: "Take {take} is being recorded: enable your microphone to join it.",
  takeRejoined: "Recording take {take} (continuing after reconnecting)",
  recordingError: "Recording failed. Reload the page to join again. ({error})",
  trackSyncing: "Sending the rest of your Track for take {take}…",
  trackUploaded: "Your Track for take {take} was sent.",
  takeHeading: "Take {take}",
  gatheringRecordings: "Gathering recordings… ({received}/{expected})",
  recordingsGathered: "All recordings gathered.",
  trackEntry: "{file} ({mb} MB)",
  trackPartEntry: "{file} ({mb} MB, starts {seconds} s after the Sync tone)",
  downloadAllZip: "Download all (zip)",
  backofficeTitle: "SimplyCaster backoffice",
  backofficeToken: "Installation token",
  signIn: "Sign in",
  signInPasskey: "Sign in with a passkey",
  passkeysOff: "Passkeys are not available on this server: set PUBLIC_URL.",
  passkeyCancelled: "The passkey request was cancelled or timed out. Try again.",
  passkeyRefused: "That passkey was not accepted.",
  enrolTitle: "Set up your access",
  enrolHint: "Create a passkey to sign in from now on: your device keeps it, and you unlock it with your fingerprint, face or PIN.",
  enrolButton: "Create passkey",
  account: "Your account",
  accountEntry: "{name} · {role} · {passkeys} passkeys",
  accountEntryEmail: "{name} · {email} · {role} · {passkeys} passkeys",
  addPasskey: "Add a passkey on this device",
  passkeyAdded: "Passkey added.",
  initialAdminName: "Initial Admin",
  initialAdminHint: "You signed in with the installation token. Create an Admin with a passkey; once it is registered, delete this Initial Admin to retire the token.",
  accounts: "Accounts",
  newAccount: "New Account",
  accountName: "Name",
  accountEmail: "Email",
  accountRole: "Role",
  createAccount: "Create Account",
  roleAccountHost: "Host",
  roleAccountAdmin: "Admin",
  enrolmentLink: "Send this link to {name}. It works once, for 72 hours:",
  enrolmentLinkLabel: "Enrolment link for {name}",
  newEnrolmentLink: "New link",
  deleteAccount: "Delete",
  deleteAccountConfirm: "Delete the Account of {name}? Its Rooms stay, and only an Admin will see them.",
  signOut: "Sign out",
  wrongBackofficeToken: "That token is not right.",
  newRoom: "New Room",
  roomName: "Room name",
  roomLabel: "Label: {slug}",
  hostName: "Host name",
  createRoom: "Create Room",
  nameHint: "Name it however helps you organize, for example “My show S01E01 - topic”. The file names use a short label made from it. The Host name takes letters, digits and dashes.",
  rooms: "Rooms",
  noRooms: "No Rooms yet.",
  refresh: "Refresh",
  roomHeading: "{name} · created {created}",
  roomOpen: "open",
  roomRecording: "recording take {take}",
  roomClosedState: "closed",
  roomTakes: "{takes} takes",
  invitations: "Invitations",
  invitationEntry: "{name} ({role}, {status})",
  invitationLink: "Link for {name}",
  copy: "Copy",
  copied: "Copied",
  guestName: "Guest name",
  invite: "Invite",
  closeRoom: "Close Room",
  closeConfirm: "Close Room {name}? Its Invitations expire and it cannot be reopened.",
  closePending: "{names} still have audio not uploaded: closing now leaves those Tracks incomplete. Close Room {name} anyway?",
  deleteRoom: "Delete Room",
  deleteRoomConfirm: "Delete Room {name} and all its recordings for good? This cannot be undone here, and copies may stay in the backups until they expire.",
  downloadRoom: "Download Room (original Ogg, zip)",
  convertFlac: "Convert to FLAC",
  convertingFlac: "Converting to FLAC…",
  downloadFlac: "Download in FLAC (zip)",
  flacFailed: "The FLAC conversion failed.",
  flacHint: "FLAC opens in any editor: one file per Participant and Take, all as long as the Take, with each clock's drift corrected and silence where audio was lost. Place them all at zero.",
  requestFailed: "Request failed ({status}).",
  errorInvalidName: "That name is not valid. A Room name needs some letters or digits; other names, only letters, digits and dashes (up to 40).",
  errorNameTaken: "That name is already in this Room.",
  errorRoomFull: "A Room holds at most {max} Participants.",
  errorRecording: "A Take is being recorded: stop it before closing the Room.",
  errorClosed: "This Room is closed.",
  errorOpen: "Close the Room first.",
  errorConverting: "This Room is being converted to FLAC: wait until it finishes.",
  errorInvalidEmail: "That email address is not valid.",
  errorEmailTaken: "There is already an Account with that email.",
  errorLastAdmin: "Another Admin who can sign in must remain. Register a passkey for one first.",
  errorInvalidEnrolment: "This link is not valid: it was used already or has expired. Ask an Admin for a new one.",
  errorPasskeysUnavailable: "Passkeys are not available right now.",
  errorNotSaved: "The change could not be saved.",
};

export type MessageKey = keyof typeof en;
export type Catalog = Record<MessageKey, string>;

const catalogs: Record<string, Catalog> = { en };

/** The first of the browser's languages with a catalog, by full tag or by language; `en` otherwise. */
export function pickLocale(languages: readonly string[], available: readonly string[]): string {
  for (const tag of languages) {
    const lower = tag.toLowerCase();
    const match = available.find((a) => a === lower) ?? available.find((a) => a === lower.split("-")[0]);
    if (match) return match;
  }
  return "en";
}

const locale = pickLocale(globalThis.navigator?.languages ?? [], Object.keys(catalogs));

/** Sets the page language, for screen readers and hyphenation. */
export function applyLocale() {
  document.documentElement.lang = locale;
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return catalogs[locale][key].replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? `{${p}}`));
}

/** Joins the parts of a composed line with the locale's separator. */
export function list(parts: string[]): string {
  return parts.join(t("listSeparator"));
}

export const ROLE_LABEL: Record<Role, MessageKey> = { host: "roleHost", guest: "roleGuest" };
export const ACCOUNT_ROLE_LABEL: Record<AccountRole, MessageKey> = {
  host: "roleAccountHost",
  admin: "roleAccountAdmin",
};
export const STATUS_LABEL: Record<ParticipantStatus, MessageKey> = {
  connected: "statusConnected",
  disconnected: "statusDisconnected",
};
