// UP2: measures the alignment error between the Tracks of a Take, using real claps
// that every microphone picked up, and the audio clock drift from the drift marks.
//
// Usage: node tools/measure-sync.ts <room folder> [take]
//   <room folder> holds room.json and the .ogg files (coordinator/data/room-… or an unzipped Take).
// Requires ffmpeg on the PATH.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Opus always decodes at 48 kHz. */
const SAMPLE_RATE = 48_000;
/** Ignore the start: the Sync tone, and its sound from the speakers reaching the microphones. */
const SKIP_START_MS = 1000;
/** A clap is a sample at least this fraction of the loudest one in the part. */
const CLAP_THRESHOLD = 0.5;
/** The onset is where the clap first rises above this fraction of the loudest sample. */
const ONSET_THRESHOLD = 0.1;
const ONSET_SEARCH_MS = 5;
const MIN_CLAP_GAP_MS = 1000;
/** Claps on different Tracks within this distance are the same clap. */
const SAME_CLAP_MS = 300;

/** Onsets of claps in a mono signal, in ms from its first sample. */
export function findClaps(x: Float32Array, sampleRate = SAMPLE_RATE): number[] {
  const skip = Math.round((SKIP_START_MS * sampleRate) / 1000);
  let peak = 0;
  for (let i = skip; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak === 0) return [];
  const search = Math.round((ONSET_SEARCH_MS * sampleRate) / 1000);
  const gap = Math.round((MIN_CLAP_GAP_MS * sampleRate) / 1000);
  const onsets: number[] = [];
  for (let i = skip; i < x.length; i++) {
    if (Math.abs(x[i]) < CLAP_THRESHOLD * peak) continue;
    let j = i;
    while (j > i - search && Math.abs(x[j - 1]) >= ONSET_THRESHOLD * peak) j--;
    onsets.push((j * 1000) / sampleRate);
    i += gap;
  }
  return onsets;
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

type Part = {
  participant: string;
  part: number;
  file: string;
  complete: boolean;
  startTime: number;
  startOffsetMs: number;
  sampleRate: number;
  driftMarks: { samples: number; coordinatorTime: number }[];
};

function decode(path: string): Float32Array {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-"], {
    maxBuffer: 2 ** 31,
  });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

function main(dir: string, takeNumber: number) {
  const meta = JSON.parse(readFileSync(join(dir, "room.json"), "utf8"));
  const take = meta.takes.find((t: { take: number }) => t.take === takeNumber);
  if (!take) throw new Error(`take ${takeNumber} not found in room.json`);
  const parts: Part[] = take.tracks;

  // Claps per Participant, on the Take's timeline (ms after T, the Sync tone).
  const claps = new Map<string, number[]>();
  for (const p of parts) {
    if (!p.complete) console.warn(`warning: ${p.file} is incomplete`);
    const onsets = findClaps(decode(join(dir, p.file))).map((ms) => ms + p.startOffsetMs);
    claps.set(p.participant, [...(claps.get(p.participant) ?? []), ...onsets]);
  }

  const [reference, ...others] = [...claps.keys()];
  console.log(`Take ${takeNumber}: claps (ms after the Sync tone), error relative to ${reference}`);
  for (const at of claps.get(reference)!) {
    const cells = others.map((name) => {
      const match = claps.get(name)!.find((c) => Math.abs(c - at) < SAME_CLAP_MS);
      return match === undefined ? `${name}: not found` : `${name}: ${(match - at).toFixed(2)} ms`;
    });
    console.log(`  ${(at / 1000).toFixed(3)} s  ${cells.join("  ")}`);
  }
  console.log("  (sound travels ~1 ms per 34 cm: clap at the same distance from every microphone)");

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
