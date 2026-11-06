// Pure rules of a Participant's session, kept apart from the DOM so they can be tested.
import type { MicState } from "./recorder.ts";
import type { MicProblem } from "./protocol/MicProblem.ts";

/**
 * When to start recording a part of a Take that starts at `startTime` (Coordinator clock). Joining after
 * T (a reconnection, CU7) records a new part from `nowMs + leadMs` on, without the Sync tone.
 */
export function partPlan(startTime: number, clockOffsetMs: number, nowMs: number, leadMs: number) {
  const localStart = startTime - clockOffsetMs;
  const late = localStart < nowMs + leadMs;
  return { localStartMs: late ? nowMs + leadMs : localStart, late };
}

/** The worst current microphone problem: a lost device first, a silent one last. */
export function micProblem(mic: MicState | undefined, pageHidden: boolean): MicProblem | null {
  if (!mic) return null;
  if (mic.ended) return "ended";
  if (mic.muted) return "muted";
  if (pageHidden) return "hidden";
  if (mic.silent) return "silent";
  return null;
}

/** Uploads not yet confirmed by the Coordinator, by local file name, so a reloaded page can finish them. */
export type PendingUploads = Record<string, { uploadUrl: string; take: number; invite: string }>;

/** What `localStorage` holds, or nothing when it is missing or not an object (never throws). */
export function parsePendingUploads(raw: string | null): PendingUploads {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as PendingUploads) : {};
  } catch {
    return {};
  }
}
