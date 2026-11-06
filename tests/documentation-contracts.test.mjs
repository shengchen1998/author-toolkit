import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("new-project instructions stay concise and retain routing and manuscript safety", async () => {
  const [instructions, setup] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
  ]);
  const size = Buffer.byteLength(instructions, "utf8");
  assert.ok(size >= 2048 && size <= 3072, `template is 2–3 KB, received ${size} bytes`);

  assert.match(instructions, /<project-root>/);
  assert.match(instructions, /\.author-toolkit\/project\.json/);
  assert.match(instructions, /<project-root>\/\.author-toolkit\/references\/terminology\.md/);
  assert.match(instructions, /state-and-findings\.md/);
  assert.match(instructions, /active skill's `SKILL\.md` and (?:its )?references/);
  for (const entry of [
    "ask-author",
    "setup-author-toolkit",
    "write-fiction",
    "revise-fiction",
    "revise-draft",
    "revise-increment",
    "revise-request",
  ]) {
    assert.match(instructions, new RegExp(`\`${entry}\``), `${entry} remains routable`);
  }
  assert.match(
    instructions,
    /previous full-manuscript scope without current-draft revision convergence \| `revise-draft`/,
  );
  assert.match(
    instructions,
    /previous full-manuscript scope with current-draft revision convergence \| `revise-increment`/,
  );
  assert.match(
    instructions,
    /full-manuscript base scope with current-draft revision convergence \| `revise-request`/,
  );
  assert.match(instructions, /exact host command/i);
  assert.match(instructions, /wait/i);
  assert.match(instructions, /never invoke another user entry through the Skill tool/i);

  assert.match(instructions, /exact operation, scope, paths, actions, and input versions/i);
  assert.match(instructions, /explicit (?:current )?author approval/i);
  assert.match(instructions, /back up every existing affected file/i);
  assert.match(instructions, /SHA-256/);
  assert.match(instructions, /create targets? (?:are|is|to be)? ?absent/i);
  assert.match(instructions, /separate explicit approval/i);
  assert.match(instructions, /safety backup/i);
  assert.match(instructions, /reconcile-manuscript/);
  assert.match(instructions, /pending action/i);
  assert.match(instructions, /does not authorize/i);

  assert.match(
    setup,
    /Copy `assets\/AGENTS\.md` to `<project-root>\/AGENTS\.md` only when that file is absent/,
  );
  assert.match(setup, /existing instruction file remains unchanged/);
});

function markdownAnchor(heading) {
  return heading
    .replaceAll("`", "")
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .replaceAll(" ", "-");
}

function directoryBetween(text, nextHeading) {
  const start = text.indexOf("## Directory\n");
  assert.ok(start >= 0, "document begins with a directory before detailed rules");
  const end = text.indexOf(`\n## ${nextHeading}\n`, start);
  assert.ok(end > start, `directory precedes ${nextHeading}`);
  const directory = text.slice(start, end);
  const headings = new Set(
    [...text.matchAll(/^#{2,6} (.+)$/gm)].map((match) => markdownAnchor(match[1])),
  );
  for (const match of directory.matchAll(/\[[^\]]+\]\((#[^)]+)\)/g)) {
    assert.ok(headings.has(match[1].slice(1)), `${match[1]} resolves to a real heading`);
  }
  return directory;
}

test("terminology opens with a linked high-frequency contract index and stays mirrored", async () => {
  const canonicalPath = path.join(root, "references/terminology.md");
  const deployedPath = path.join(
    root,
    "skills/setup-author-toolkit/assets/references/terminology.md",
  );
  const [terminology, deployed] = await Promise.all([
    readFile(canonicalPath, "utf8"),
    readFile(deployedPath, "utf8"),
  ]);
  const directory = directoryBetween(terminology, "Writing rules");

  for (const anchor of [
    "#writing-rules",
    "#core-terms",
    "#operation-identifiers",
    "#contract-values",
  ]) {
    assert.ok(directory.includes(`](${anchor})`), `${anchor} is in the directory`);
  }
  for (const value of [
    "open",
    "resolved",
    "deferred",
    "dismissed",
    "stale",
    "approved",
    "cancelled",
    "superseded",
    "in_progress",
    "awaiting_author",
    "blocked",
    "satisfied",
    "not_satisfied",
    "indeterminate",
    "revision-plan",
    "edit",
    "story-bible",
    "creation-manuscript",
    "creation-scope",
    "creation-rejection",
    "creation-import",
  ]) {
    assert.match(directory, new RegExp(`\`${value}\``), `${value} is in the quick index`);
  }
  for (const heading of ["Writing rules", "Core terms", "Operation identifiers", "Contract values"]) {
    assert.match(terminology, new RegExp(`^## ${heading}$`, "m"));
  }
  assert.equal(deployed, terminology, "setup carries the indexed canonical terminology");
});

test("shared evidence opens with quick routes to decisions, reuse, and convergence", async () => {
  const state = await readFile(
    path.join(root, "skills/revise-fiction/references/state-and-findings.md"),
    "utf8",
  );
  const directory = directoryBetween(state, "Report envelope");
  assert.ok(Buffer.byteLength(directory, "utf8") <= 2048, "evidence directory stays compact");

  for (const anchor of [
    "#living-tracker",
    "#author-approvals",
    "#evidence-reuse-across-skills",
    "#coverage-units-and-synthesis",
    "#current-draft-revision-convergence",
  ]) {
    assert.ok(directory.includes(`](${anchor})`), `${anchor} is in the evidence quick routes`);
  }
  assert.match(directory, /finding (?:identity and )?statuses/i);
  assert.match(directory, /approvals/i);
  assert.match(directory, /evidence reuse/i);
  assert.match(directory, /dependency exception/i);
  assert.match(
    directory,
    /https:\/\/github\.com\/shengchen1998\/author-toolkit\/issues\/14/,
    "dependency exception index links the approved spec until its contract lands",
  );
  assert.match(directory, /exact dependenc/i);
});
