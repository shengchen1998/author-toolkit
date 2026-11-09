import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const referencePointer = "<setup-skill-root>/assets/references/context-fit.md";

test("context-fit checks judge complete proposals before author presentation", async () => {
  const reference = await read("references/context-fit.md");

  assert.match(reference, /# Context-fit check/);
  assert.match(reference, /before presenting an edit proposal or requesting manuscript-edit approval/i);
  for (const pattern of [
    /whole local scene/i,
    /fixed line window/i,
    /physical, sensory, and temporal claims/i,
    /history, familiarity, knowledge, clothing, possessions, and prior contact/i,
    /lexical repetition.*repeated action/is,
    /register.*POV.*character voice.*author's voice/is,
    /requested outcome.*finding's accepted intent/is,
    /Do not turn a request to plant or reinforce a setup into removing or weakening a reveal, or the reverse/i,
    /exact candidate.*surrounding sequence/is,
    /unavailable.*state the uncertainty.*never invent/is,
  ]) {
    assert.match(reference, pattern);
  }
  assert.match(reference, /does not expand.*approved edit paths/i);
  assert.match(reference, /judgment/i);
  assert.doesNotMatch(reference, /±10/);
});

test("fiction workshop and revision gates load context-fit before proposing edits", async () => {
  const workshop = await read("skills/fiction-workshop/SKILL.md");
  assert.match(
    workshop,
    /3\. \*\*Check context fit:\*\* Load `references\/context-fit\.md` and complete it before presenting candidates/,
  );
  assert.match(workshop, /4\. \*\*Propose Changes:\*\*/);

  for (const file of [
    "skills/revise-draft/references/stage-gates.md",
    "skills/revise-fiction/references/stage-gates.md",
  ]) {
    const gates = await read(file);
    for (const heading of ["## 6. Chapter revision", "## 7. Prose", "## 8. AI cleanup"]) {
      const body = gates.split(heading)[1]?.split("\n## ")[0];
      assert.ok(body?.includes(referencePointer), `${file} ${heading}`);
      assert.match(body, /before presenting an edit proposal/i);
    }
  }

  for (const file of [
    "skills/revise-draft/SKILL.md",
    "skills/revise-request/SKILL.md",
    "skills/revise-fiction/SKILL.md",
    "skills/revise-increment/SKILL.md",
  ]) {
    const skill = await read(file);
    assert.ok(skill.includes(referencePointer), file);
    assert.match(skill, /before presenting an edit proposal/i);
  }
});

test("prose and AI rewrite callees use the same proposal-time check", async () => {
  const prose = await read("skills/prose-mechanics/SKILL.md");
  const adapter = await read("references/avoid-ai-writing-adapter.md");
  const reporting = await read("references/workflow-reporting.md");

  assert.ok(prose.includes(referencePointer));
  assert.match(prose, /before presenting fixes for author review/i);
  assert.ok(adapter.includes(referencePointer));
  assert.match(adapter, /complete the context-fit check before presenting/i);
  assert.ok(reporting.includes(referencePointer));
  assert.match(reporting, /context-fit check does not approve a manuscript edit/i);
});
