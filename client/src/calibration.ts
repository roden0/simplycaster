// Latency calibration at join (CU3): a few clicks are played and recorded back. The delay from
// rendering a click to capturing its sound is the round trip (output + input latency) that the
// first sample of a Track must account for. It is measured in frames of the AudioContext itself,
// so no clock is involved. It must be done with the output used for recording: with headphones,
// an earpiece held against the microphone.

export const CLICK_COUNT = 4;
/** Longer than any round trip we expect, so each click is looked for before the next one. */
export const CLICK_SPACING_SECONDS = 0.6;
/** Recording starts this long before the first click, to measure the background noise. */
export const LEAD_SECONDS = 0.3;
const CLICK_SECONDS = 0.005;
const CLICK_HZ = 2000;
/** Clicks whose round trips disagree by more than this mean echoes or noise, not a measurement. */
const MAX_SPREAD_SECONDS = 0.003;

/** A short, sharp burst: easy to time in the recording. */
export function clickSamples(sampleRate: number) {
  const click = new Float32Array(Math.round(CLICK_SECONDS * sampleRate));
  for (let i = 0; i < click.length; i++) click[i] = 0.8 * Math.sin((2 * Math.PI * CLICK_HZ * i) / sampleRate);
  return click;
}

/**
 * Round trip (s) from the recorded input, or undefined when the clicks were not heard clearly.
 * `recorded[0]` is frame `firstFrame`; `clickFrames` are the frames the clicks were rendered at.
 */
export function detectRoundTrip(
  recorded: Float32Array,
  firstFrame: number,
  clickFrames: number[],
  sampleRate: number,
): number | undefined {
  const abs = (i: number) => Math.abs(recorded[i] ?? 0);
  const leadEnd = clickFrames[0] - firstFrame;
  const lead = Array.from({ length: leadEnd }, (_, i) => abs(i)).sort((a, b) => a - b);
  const noise = lead[Math.floor(lead.length / 2)] ?? 0;
  const spacing = Math.round(CLICK_SPACING_SECONDS * sampleRate);
  const trips: number[] = [];
  for (const click of clickFrames) {
    const from = click - firstFrame;
    let peak = 0;
    for (let i = from; i < from + spacing; i++) peak = Math.max(peak, abs(i));
    if (peak < Math.max(10 * noise, 0.005)) continue; // not heard above the noise
    let onset = from;
    while (abs(onset) < 0.3 * peak) onset++;
    trips.push((onset - from) / sampleRate);
  }
  if (trips.length < CLICK_COUNT - 1) return undefined;
  trips.sort((a, b) => a - b);
  if (trips[trips.length - 1] - trips[0] > MAX_SPREAD_SECONDS) return undefined;
  return trips[Math.floor(trips.length / 2)];
}
