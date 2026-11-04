import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateOffset } from "./clock.ts";

test("picks the shortest round trip and assumes a symmetric path", () => {
  const { offsetMs, rttMs } = estimateOffset([
    { clientSend: 0, clientReceive: 100, coordinatorTime: 1090 }, // slow, asymmetric
    { clientSend: 200, clientReceive: 210, coordinatorTime: 1205 }, // best
  ]);
  assert.equal(rttMs, 10);
  assert.equal(offsetMs, 1000);
});
