// Sync tone written at the start of every Track (the same in all of them, to align when editing).
// The tone each Participant plays aloud at T has its own frequency, set by the Coordinator.
export const TONE_HZ = 1000;
export const TONE_SECONDS = 0.1;
/** The audible tone sounds this long after T, past the written one, so the microphone records it. */
export const AUDIBLE_TONE_DELAY_SECONDS = 0.2;
