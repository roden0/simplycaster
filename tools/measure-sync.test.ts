import { test } from "node:test";
import assert from "node:assert/strict";
import { findClaps, slope } from "./measure-sync.ts";

test("finds clap onsets after the Sync tone, ignoring quieter noise", () => {
  const sr = 1000; // 1 sample per ms keeps the numbers readable
  const x = new Float32Array(5000);
  for (let i = 0; i < 100; i++) x[i] = 1; // Sync tone: inside the skipped start
  for (let i = 0; i < x.length; i++) x[i] += 0.01 * Math.sin(i); // background noise
  x[2000] = 0.3; // clap rising edge
  x[2001] = 0.9; // clap peak
  x[3500] = 0.8;
  assert.deepEqual(findClaps(x, sr), [2000, 3500]);
});

test("slope of a straight line", () => {
  assert.equal(slope([[0, 1], [1, 3], [2, 5]]), 2);
});
