import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

async function skillText(relativePath) {
  return readFile(path.join(root, "skills", relativePath), "utf8");
}

test("first-time creation routes publication through revise-draft without weakening ordinary creation", async () => {
  const [write, creationState, creationGates, draft, ask, instructions, operations, terminology] =
    await Promise.all([
      skillText("write-fiction/SKILL.md"),
      skillText("write-fiction/references/creation-state.md"),
      skillText("write-fiction/references/stage-gates.md"),
      skillText("revise-draft/SKILL.md"),
      skillText("ask-author/SKILL.md"),
      skillText("setup-author-toolkit/assets/AGENTS.md"),
      skillText("author-project/references/operations.md"),
      readFile(path.join(root, "references", "terminology.md"), "utf8"),
    ]);

  assert.match(write, /actually empty manuscript inventory[\s\S]*`bootstrap: true`/);
  assert.match(write, /After first-time bootstrap publication[\s\S]*`revise-draft`/);
  assert.match(write, /\/author-toolkit:revise-draft/);
  assert.match(write, /\/skill:author-toolkit:revise-draft/);
  assert.match(write, /For ordinary creation[\s\S]*`revise-increment`/);
  assert.match(write, /must not use `revise-increment`/);
  assert.match(creationState, /bootstrap[\s\S]*`scope_before_id: null`/);
  assert.match(creationState, /first nonempty publication[\s\S]*`revise-draft`/);
  assert.match(creationGates, /bootstrap[\s\S]*`revise-draft`/);
  assert.match(draft, /bootstrap[\s\S]*same cycle[\s\S]*initial full-manuscript/);
  assert.match(draft, /bootstrap[\s\S]*evaluate-cycle[\s\S]*never `evaluate-draft`/);
  assert.match(ask, /first-time bootstrap publication[\s\S]*`revise-draft`/);
  assert.match(instructions, /first-time bootstrap publication[\s\S]*`revise-draft`/);
  assert.match(operations, /bootstrap publication[\s\S]*null `scope_before_id`/);
  assert.match(operations, /empty manuscript inventory[\s\S]*`empty-manuscript`/);
  assert.match(terminology, /`bootstrap`[\s\S]*`revise-draft`/);
});
