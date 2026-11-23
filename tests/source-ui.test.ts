import test from "node:test";
import assert from "node:assert/strict";
import { extractBlockCandidates } from "../src/web/src/lib/sources.ts";

test("quick blocking preserves English words and ignores plain numeric fragments", () => {
  assert.deepEqual(extractBlockCandidates("software credits APIs | 2026"), ["software", "credits", "APIs"]);
});
test("quick blocking strips both Chinese and ASCII column tags", () => {
  assert.deepEqual(extractBlockCandidates("【广告】[Promo] API credits | software 2026"), ["API", "credits", "software"]);
});
