import { test } from "node:test";
import assert from "node:assert/strict";
import { CLICK_COUNT, CLICK_SPACING_SECONDS, LEAD_SECONDS, clickSamples, detectRoundTrip } from "./calibration.ts";

const rate = 48_000;
const first = 1_000_000;
const clicks = Array.from({ length: CLICK_COUNT }, (_, k) => first + (LEAD_SECONDS + k * CLICK_SPACING_SECONDS) * rate);
const length = (LEAD_SECONDS + CLICK_COUNT * CLICK_SPACING_SECONDS) * rate;

function recording(roundTripSeconds: number, gain: number) {
  const x = Float32Array.from({ length }, (_, i) => 0.002 * Math.sin(i * 0.37)); // background noise
  const click = clickSamples(rate);
  for (const c of clicks) x.set(click.map((v) => v * gain), c - first + roundTripSeconds * rate);
  return x;
}

test("measures the round trip of clicks heard back", () => {
  const trip = detectRoundTrip(recording(0.172, 0.3), first, clicks, rate)!;
  assert.ok(Math.abs(trip - 0.172) < 0.0005, `got ${trip}`);
});

test("gives up when the clicks are not heard (e.g. closed headphones)", () => {
  assert.equal(detectRoundTrip(recording(0.172, 0), first, clicks, rate), undefined);
});
