import { test } from "node:test";
import assert from "node:assert/strict";
import { micProblem, parsePendingUploads, partPlan } from "./session.ts";

test("a part starts at T, or a moment from now when joining late", () => {
  // T is at Coordinator 10 000 ms; this clock runs 1000 ms behind it.
  assert.deepEqual(partPlan(10_000, 1000, 5000, 300), { localStartMs: 9000, late: false });
  assert.deepEqual(partPlan(10_000, 1000, 8800, 300), { localStartMs: 9100, late: true });
  assert.deepEqual(partPlan(10_000, 1000, 20_000, 300), { localStartMs: 20_300, late: true });
});

test("the worst microphone problem wins", () => {
  const ok = { ended: false, muted: false, silent: false };
  assert.equal(micProblem(undefined, true), null);
  assert.equal(micProblem(ok, false), null);
  assert.equal(micProblem({ ...ok, silent: true }, false), "silent");
  assert.equal(micProblem({ ...ok, silent: true }, true), "hidden");
  assert.equal(micProblem({ ...ok, muted: true, silent: true }, true), "muted");
  assert.equal(micProblem({ ended: true, muted: true, silent: true }, true), "ended");
});

test("pending uploads survive bad storage", () => {
  const one = { "t01_ana_1.ogg": { uploadUrl: "/uploads/x", take: 1, invite: "abc" } };
  assert.deepEqual(parsePendingUploads(JSON.stringify(one)), one);
  for (const bad of [null, "", "{", "null", "5", "[]"]) assert.deepEqual(parsePendingUploads(bad), {});
});
