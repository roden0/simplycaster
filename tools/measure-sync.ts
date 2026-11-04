// UP2: measures how well the Tracks of a Take line up, for a test with every Participant
// in one room, without headphones.
//
// - Acoustic tones: each browser plays its own tone (its own frequency) at T + 200 ms. Where each
//   tone lands in each Track shows that machine's uncorrected latency: its own tone should land at
//   200 ms; any difference is the error of that Track's start.
// - Audio alignment: cross-correlating the sound every microphone picked up (voices, claps) gives
//   the real offset between Tracks, independent of the tones.
// - Drift: from the drift marks, how fast each audio clock runs against the Coordinator.
//
// Usage: node tools/measure-sync.ts <room folder> [take]
//   <room folder> holds room.json and the .ogg files (an unzipped Take).
// Requires ffmpeg on the PATH.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIBLE_TONE_DELAY_SECONDS, TONE_SECONDS } from "../client/src/sync-tone.ts";

const TONE_RATE = 48_000;
/** Tones are looked for from the end of the written tone up to this point (ms after T). */
const TONE_SEARCH_END_MS = 2500;
/** Below this amplitude a tone counts as not heard (about -50 dBFS). */
const TONE_MIN_AMPLITUDE = 0.003;
/** Envelope resolution for the alignment: 1 sample per ms. */
const ENV_RATE = 1000;
const WINDOW_MS = 10_000;
const MAX_LAG_MS = 1000;
/** Skip the tones at the start when aligning by audio. */
const ALIGN_FROM_MS = 3000;

type Part = {
  participant: string;
  part: number;
  file: string;
  complete: boolean;
  startTime: number;
  startOffsetMs: number;
  sampleRate: number;
  toneHz?: number;
  outputLatencyMs?: number | null;
  inputLatencyMs?: number | null;
  driftMarks: { samples: number; coordinatorTime: number }[];
};

/** Onset (ms) and peak amplitude of a pure tone in `x`, searched in [fromMs, toMs). */
export function toneOnset(x: Float32Array, hz: number, fromMs: number, toMs: number, rate = TONE_RATE) {
  // 10 ms Hann window: tones 500 Hz apart do not leak into each other.
  const size = Math.round(rate * 0.01);
  const hop = Math.round(rate * 0.001);
  const w = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const wsum = w.reduce((a, b) => a + b, 0);
  const amplitude = (start: number, f: number) => {
    const k = (2 * Math.PI * f) / rate;
    let re = 0;
    let im = 0;
    for (let i = 0; i < size; i++) {
      re += x[start + i] * w[i] * Math.cos(k * i);
      im -= x[start + i] * w[i] * Math.sin(k * i);
    }
    return (2 * Math.hypot(re, im)) / wsum;
  };
  const amps: number[] = [];
  const first = Math.round((fromMs * rate) / 1000);
  const last = Math.min(x.length - size, Math.round((toMs * rate) / 1000));
  for (let s = first; s < last; s += hop) {
    const a = amplitude(s, hz);
    // A tone stands out from its neighbours; the click of another tone starting is broadband.
    const side = (amplitude(s, hz - 250) + amplitude(s, hz + 250)) / 2;
    amps.push(a > 4 * side ? a : 0);
  }
  const peak = Math.max(0, ...amps);
  if (peak < TONE_MIN_AMPLITUDE) return undefined;
  // A Hann window centred on the onset of a steady tone sees exactly half its amplitude.
  const i = amps.findIndex((a) => a >= peak / 2);
  return { onsetMs: fromMs + i + (size / 2 / rate) * 1000, peak };
}

/** 1 ms envelope: mean |x| over each millisecond. */
function envelope(x: Float32Array, rate: number): Float32Array {
  const per = rate / ENV_RATE;
  const e = new Float32Array(Math.floor(x.length / per));
  for (let i = 0; i < e.length; i++) {
    let s = 0;
    for (let k = 0; k < per; k++) s += Math.abs(x[i * per + k]);
    e[i] = s / per;
  }
  return e;
}

/** Lag (ms) of `b` behind `a` that best matches the window starting at `start`, with its correlation. */
export function bestLag(a: Float32Array, b: Float32Array, start: number, width: number, maxLag: number) {
  const wa = a.subarray(start, start + width);
  const ma = wa.reduce((p, q) => p + q, 0) / width;
  let va = 0;
  for (const v of wa) va += (v - ma) ** 2;
  let best = { lag: 0, corr: -2 };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    if (start + lag < 0 || start + lag + width > b.length) continue;
    const wb = b.subarray(start + lag, start + lag + width);
    const mb = wb.reduce((p, q) => p + q, 0) / width;
    let num = 0;
    let vb = 0;
    for (let i = 0; i < width; i++) {
      num += (wa[i] - ma) * (wb[i] - mb);
      vb += (wb[i] - mb) ** 2;
    }
    const corr = num / Math.sqrt(va * vb || 1);
    if (corr > best.corr) best = { lag, corr };
  }
  return best;
}

/** Least-squares slope of y over x. */
export function slope(points: [number, number][]): number {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  const num = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const den = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return num / den;
}

function decode(path: string, rate: number, seconds?: number): Float32Array {
  const limit = seconds ? ["-t", String(seconds)] : [];
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, ...limit, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], {
    maxBuffer: 2 ** 31,
  });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (ms: number) => `${ms >= 0 ? "+" : ""}${ms.toFixed(1)} ms`;

function main(dir: string, takeNumber: number) {
  const meta = JSON.parse(readFileSync(join(dir, "room.json"), "utf8"));
  const take = meta.takes.find((t: { take: number }) => t.take === takeNumber);
  if (!take) throw new Error(`take ${takeNumber} not found in room.json`);
  const parts: Part[] = take.tracks;
  for (const p of parts) if (!p.complete) console.warn(`warning: ${p.file} is incomplete`);
  // Tones and alignment only make sense for the part recorded from T.
  const firsts = parts.filter((p) => p.part === 1);
  const tones = firsts.filter((p) => p.toneHz).map((p) => ({ who: p.participant, hz: p.toneHz! }));
  const expectedMs = AUDIBLE_TONE_DELAY_SECONDS * 1000;

  console.log(`Take ${takeNumber}: acoustic tones, ms after T in each Track (expected ${expectedMs} ms)`);
  const ownError = new Map<string, number>();
  for (const p of firsts) {
    const x = decode(join(dir, p.file), TONE_RATE, TONE_SEARCH_END_MS / 1000 + 0.1);
    const cells = tones.map(({ who, hz }) => {
      const found = toneOnset(x, hz, TONE_SECONDS * 1000 + 10, TONE_SEARCH_END_MS);
      if (!found) return `${who} ${hz} Hz: not heard`;
      if (who === p.participant) ownError.set(who, found.onsetMs - expectedMs);
      return `${who} ${hz} Hz: ${found.onsetMs.toFixed(1)} ms (${(20 * Math.log10(found.peak)).toFixed(0)} dBFS)`;
    });
    const reported = `reported latency out ${p.outputLatencyMs?.toFixed(1) ?? "?"} / in ${p.inputLatencyMs?.toFixed(1) ?? "?"} ms`;
    console.log(`  ${p.file}: ${cells.join("  ")}  [${reported}]`);
  }
  for (const [who, e] of ownError) console.log(`  ${who}: start error from own tone ${fmt(e)}`);

  const [ref, ...others] = firsts;
  if (ref && others.length) {
    console.log(`Audio alignment (cross-correlation, ${WINDOW_MS / 1000} s windows), relative to ${ref.participant}:`);
    const envRef = envelope(decode(join(dir, ref.file), 8000), 8000);
    for (const p of others) {
      const env = envelope(decode(join(dir, p.file), 8000), 8000);
      const lags: number[] = [];
      for (let s = ALIGN_FROM_MS; s + WINDOW_MS + MAX_LAG_MS < Math.min(envRef.length, env.length); s += WINDOW_MS) {
        const { lag, corr } = bestLag(envRef, env, s, WINDOW_MS, MAX_LAG_MS);
        if (corr >= 0.5) lags.push(lag);
      }
      if (!lags.length) {
        console.log(`  ${p.participant}: no window correlates well (no shared sound?)`);
        continue;
      }
      const m = median(lags);
      const spread = Math.max(...lags) - Math.min(...lags);
      const predicted = (ownError.get(p.participant) ?? NaN) - (ownError.get(ref.participant) ?? NaN);
      console.log(
        `  ${p.participant}: ${fmt(m)} (median of ${lags.length} windows, spread ${spread} ms)` +
          (Number.isNaN(predicted) ? "" : `; own tones predict ${fmt(predicted)}`),
      );
    }
    console.log("  (sound travels ~1 ms per 34 cm: keep the microphones close together)");
  }

  console.log("Audio clock drift from drift marks (positive: audio clock runs fast):");
  for (const p of parts) {
    const points: [number, number][] = [
      [0, 0],
      ...p.driftMarks.map((m): [number, number] => [(m.samples * 1000) / p.sampleRate, m.coordinatorTime - p.startTime]),
    ];
    if (points.length < 3) {
      console.log(`  ${p.file}: not enough marks`);
      continue;
    }
    const ppm = (1 / slope(points) - 1) * 1e6;
    const lastMs = points[points.length - 1][1];
    console.log(`  ${p.file}: ${ppm.toFixed(1)} ppm (${((ppm * lastMs) / 1e6).toFixed(1)} ms over ${(lastMs / 60000).toFixed(1)} min)`);
  }
}

if (import.meta.main) {
  const [dir, take = "1"] = process.argv.slice(2);
  if (!dir) {
    console.error("usage: node tools/measure-sync.ts <room folder> [take]");
    process.exit(2);
  }
  main(dir, Number(take));
}
