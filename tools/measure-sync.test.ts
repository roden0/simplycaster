import { test } from "node:test";
import assert from "node:assert/strict";
import { bestLag, slope, toneOnset } from "./measure-sync.ts";

test("finds when each tone starts and ignores the other frequency", () => {
  const rate = 48_000;
  const x = new Float32Array(rate); // 1 s
  const put = (hz: number, fromMs: number) => {
    for (let i = (fromMs * rate) / 1000; i < ((fromMs + 100) * rate) / 1000; i++) x[i] += 0.2 * Math.sin((2 * Math.PI * hz * i) / rate);
  };
  put(1000, 300);
  put(1500, 450);
  assert.ok(Math.abs(toneOnset(x, 1000, 110, 900)!.onsetMs - 300) <= 2);
  assert.ok(Math.abs(toneOnset(x, 1500, 110, 900)!.onsetMs - 450) <= 2);
  assert.equal(toneOnset(x, 2000, 110, 900), undefined);
});

test("finds how far one envelope lags behind another", () => {
  const n = 5000;
  const a = Float32Array.from({ length: n }, (_, i) => (i % 377 < 5 ? 1 : 0) + ((i * 7919) % 13) / 100);
  const b = new Float32Array(n);
  b.set(a.subarray(0, n - 42), 42); // b is a, 42 samples later
  assert.equal(bestLag(a, b, 500, 3000, 200).lag, 42);
});

test("slope of a straight line", () => {
  assert.equal(slope([[0, 1], [1, 3], [2, 5]]), 2);
});
