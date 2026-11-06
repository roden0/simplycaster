import { test } from "node:test";
import assert from "node:assert/strict";
import { list, pickLocale, t } from "./i18n.ts";

test("the first browser language with a catalog wins, by tag or by language", () => {
  assert.equal(pickLocale(["es-ES", "en"], ["en", "es"]), "es");
  assert.equal(pickLocale(["pt-BR", "pt", "es"], ["en", "es", "pt-br"]), "pt-br");
  assert.equal(pickLocale(["fr-FR", "de"], ["en", "es"]), "en");
  assert.equal(pickLocale([], ["en"]), "en");
});

test("composed lines come from templates", () => {
  assert.equal(t("rosterEntry", { name: "ana", role: "Guest", details: list(["connected", "syncing"]) }), "ana · Guest · connected · syncing");
  assert.equal(t("errorRoomFull", { max: 5 }), "A Room holds at most 5 Participants.");
});
