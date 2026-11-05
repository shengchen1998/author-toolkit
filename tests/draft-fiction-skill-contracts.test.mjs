import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

async function skillText(relativePath) {
  return readFile(path.join(root, "skills", relativePath), "utf8");
}

test("revise-draft separates independent work from active-cycle recovery and preserves the satisfied baseline", async () => {
  const [draft, gates, operations, state] = await Promise.all([
    skillText("revise-draft/SKILL.md"),
    skillText("revise-draft/references/stage-gates.md"),
    skillText("author-project/references/operations.md"),
    skillText("revise-fiction/references/state-and-findings.md"),
  ]);

  assert.match(draft, /Independent local, diagnostic, direct `prose` or `ai-cleanup`, and narrowed requested passes may finish without a current-draft convergence cycle/);
  assert.match(draft, /must not claim full-manuscript current-draft revision convergence/);
  assert.match(draft, /evaluate-draft/);
  assert.match(draft, /`cycle_id: null`/);
  assert.match(draft, /active cycle[\s\S]*same cycle[\s\S]*evaluate-cycle/);
  assert.match(draft, /does not reduce the last satisfied full-manuscript subcheck baseline/);
  for (const strategy of ["write-fiction", "revise-request", "revise-increment", "revise-fiction"]) {
    assert.match(draft, new RegExp(strategy));
  }
  assert.match(draft, /remain blocked until a full-manuscript convergence evaluation is satisfied/);
  assert.match(gates, /Independent and active-cycle work use the same operation gates/);
  assert.match(operations, /evaluate-draft[\s\S]*without creating an active cycle/);
  assert.match(operations, /`cycle_id` is null for an independent `revise-draft` evaluation/);
  assert.match(state, /independent `revise-draft` evaluation/i);
});

test("revise-fiction keeps read-only whole-book work available and gates manuscript-changing recovery", async () => {
  const [fiction, gates, operations, instructions] = await Promise.all([
    skillText("revise-fiction/SKILL.md"),
    skillText("revise-fiction/references/stage-gates.md"),
    skillText("author-project/references/operations.md"),
    skillText("setup-author-toolkit/assets/AGENTS.md"),
  ]);

  assert.match(fiction, /Read-only `structure` analysis and `final-review` use `manuscript_change: false`/);
  assert.match(fiction, /do not open a current-draft convergence cycle/);
  assert.match(fiction, /Manuscript-changing or required-evidence-invalidating work/);
  assert.match(fiction, /satisfied full-manuscript starting evaluation/);
  assert.match(fiction, /`initiating_strategy: "revise-fiction"`/);
  assert.match(fiction, /whole-book operation gates/);
  assert.match(fiction, /restore current-draft revision convergence for the full-manuscript target scope/);
  assert.match(gates, /prepare-revision-execution/);
  assert.match(gates, /verify-revision-execution/);
  assert.match(gates, /`final-review` produces findings only and does not open a cycle/);
  assert.match(operations, /independent `revise-draft` manuscript work remains available without a cycle/);
  assert.match(operations, /After that gate succeeds, the other four strategies must start and link an active cycle before manuscript-changing work/);

  for (const text of [fiction, instructions]) {
    assert.match(text, /exact (?:host )?command/i);
    assert.match(text, /wait/i);
    assert.match(text, /(?:do not|never) invoke (?:another user entry|it) through the Skill tool/i);
  }
});
