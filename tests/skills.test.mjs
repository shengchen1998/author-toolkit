import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const expectedSkills = [
  "ask-author",
  "setup-author-toolkit",
  "revise-fiction",
  "revise-draft",
  "revise-increment",
  "revise-request",
  "write-fiction",
  "author-project",
  "author-handoff",
  "author-review",
  "fiction-workshop",
  "character-archetypes",
  "story-structure",
  "narrative-nonfiction",
  "prose-mechanics",
  "avoid-ai-writing",
];
const userEntries = new Set([
  "ask-author",
  "setup-author-toolkit",
  "revise-fiction",
  "revise-draft",
  "revise-increment",
  "revise-request",
  "write-fiction",
]);

async function frontmatter(skill) {
  const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${skill} has YAML frontmatter`);
  return match[1];
}

for (const skill of expectedSkills) {
  test(`${skill} has the expected name and invocation mode`, async () => {
    const metadata = await frontmatter(skill);
    assert.match(metadata, new RegExp(`^name: ${skill}$`, "m"));
    assert.match(metadata, /^description: .+$/m);
    const userOnly = /^disable-model-invocation: true$/m.test(metadata);
    assert.equal(userOnly, userEntries.has(skill));
  });
}

test("the inventory contains exactly 16 skills and seven user entries", async () => {
  const entries = await readdir(path.join(root, "skills"), { withFileTypes: true });
  const actual = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(actual, [...expectedSkills].sort());
  assert.equal(expectedSkills.length, 16);
  assert.equal(userEntries.size, 7);
});

test("the upstream AI-writing skill has no local integration section", async () => {
  const text = await readFile(path.join(root, "skills/avoid-ai-writing/SKILL.md"), "utf8");
  assert.doesNotMatch(text, /Cross-listed as a prose-mechanics audit/);
  const adapter = await readFile(path.join(root, "references/avoid-ai-writing-adapter.md"), "utf8");
  assert.match(adapter, /P0 to `warning`, P1 to `suggestion`, P2 to `note`/);
});

test("backup and handoff writes resolve registered project paths", async () => {
  const operations = await readFile(
    path.join(root, "skills/author-project/references/operations.md"),
    "utf8",
  );
  const handoff = await readFile(path.join(root, "skills/author-handoff/SKILL.md"), "utf8");
  const review = await readFile(path.join(root, "skills/author-review/SKILL.md"), "utf8");

  assert.match(operations, /<paths\.backups>\/<backup-id>/);
  assert.match(operations, /<paths\.backups>\/index\.json/);
  assert.match(handoff, /paths\.handoffs/);
  assert.match(review, /paths\.handoffs/);
});

test("workflow reporting pointers do not form a cycle", async () => {
  const reporting = await readFile(path.join(root, "references/workflow-reporting.md"), "utf8");
  const state = await readFile(
    path.join(root, "skills/revise-fiction/references/state-and-findings.md"),
    "utf8",
  );

  assert.match(reporting, /state-and-findings\.md/);
  assert.doesNotMatch(state, /workflow-reporting\.md/);
});

test("revision strategies share one project and keep distinct evidence gates", async () => {
  const setup = await readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8");
  const fiction = await readFile(path.join(root, "skills/revise-fiction/SKILL.md"), "utf8");
  const draft = await readFile(path.join(root, "skills/revise-draft/SKILL.md"), "utf8");
  const increment = await readFile(path.join(root, "skills/revise-increment/SKILL.md"), "utf8");
  const draftGates = await readFile(
    path.join(root, "skills/revise-draft/references/stage-gates.md"),
    "utf8",
  );
  const fictionGates = await readFile(
    path.join(root, "skills/revise-fiction/references/stage-gates.md"),
    "utf8",
  );
  const state = await readFile(
    path.join(root, "skills/revise-fiction/references/state-and-findings.md"),
    "utf8",
  );
  const reporting = await readFile(path.join(root, "references/workflow-reporting.md"), "utf8");

  for (const text of [setup, fiction, draft, increment]) {
    assert.match(text, /\.author-toolkit\/project\.json/);
    assert.doesNotMatch(text, /\.author-toolkit\/revise-draft\//);
  }
  assert.match(
    fiction,
    /intake`, `story-bible`, `structure`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `final-review/,
  );
  for (const text of [draft, increment]) {
    assert.match(
      text,
      /intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review/,
    );
  }
  assert.match(draft, /unknown future story is not a finding/i);
  assert.match(draftGates, /Unknown future turns and ending are valid entries/);
  assert.match(draftGates, /Reports list actual subchecks/);
  assert.match(fiction, /current-scope review does not satisfy final review/);

  for (const text of [fiction, draft, increment, fictionGates, draftGates]) {
    assert.match(text, /\[Author decision loop\]\(/);
  }
  assert.match(reporting, /author decision loop identified by that state reference/);
  assert.match(state, /## Author decision loop/);
  assert.match(state, /Otherwise, each assistant turn has one active decision/);
  assert.match(state, /discussion alone does not advance the queue or approve work/);
  assert.match(state, /explicitly request batch handling/);
  assert.match(state, /Keep nonblocking unknowns labeled as unknown/);
  assert.match(state, /`pending_action\.reason`/);
  assert.match(draft, /normally confirmation of the proposed scope/);
});

test("creation and revision strategies share state and stable switching gates", async () => {
  const [setup, instructions, ask, fiction, draft, increment, write, state] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "skills/ask-author/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/revise-fiction/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/revise-draft/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/revise-increment/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/write-fiction/SKILL.md"), "utf8"),
    readFile(
      path.join(root, "skills/revise-fiction/references/state-and-findings.md"),
      "utf8",
    ),
  ]);

  for (const text of [fiction, draft, increment, write]) {
    assert.match(text, /\.author-toolkit\/project\.json/);
    assert.match(text, /stable operation gate/i);
  }
  for (const text of [setup, instructions, ask]) {
    assert.match(text, /write-fiction/);
    assert.match(text, /revise-increment/);
  }
  assert.match(ask, /standalone `fiction-workshop`/);
  assert.match(instructions, /staging/);
  assert.match(instructions, /stable operation gate/i);
  assert.match(state, /Creation evidence does not satisfy `chapter-revision`/);
});

test("incremental revision restores current-draft revision convergence for the target scope", async () => {
  const [increment, write, state, ask] = await Promise.all([
    readFile(path.join(root, "skills/revise-increment/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/write-fiction/SKILL.md"), "utf8"),
    readFile(
      path.join(root, "skills/revise-fiction/references/state-and-findings.md"),
      "utf8",
    ),
    readFile(path.join(root, "skills/ask-author/SKILL.md"), "utf8"),
  ]);

  assert.match(
    increment,
    /On a new increment, establish the previous scope, the requested target scope, and the change set/,
  );
  assert.match(increment, /Verify that the previous scope has reached current-draft revision convergence/);
  assert.match(
    increment,
    /show the `revise-draft` command and stop rather than skipping unfinished work for the previous scope/,
  );
  assert.match(increment, /On resume, locate the active increment in the latest session and any current plan/);
  assert.match(increment, /own approved edits may stale that previous scope without reopening the entry gate/);
  assert.match(increment, /Rederive the current change set, work set, and current-draft revision convergence/);
  assert.match(increment, /Reconcile external manuscript changes and any interrupted write or commit/);
  assert.match(increment, /`create` action alone cannot prove that other chapters are unaffected/);
  assert.match(increment, /Missing reusable units add the affected old paths to the work set/);
  assert.match(increment, /The full-target current-scope review has the same scope/);
  assert.match(increment, /fresh reader must read the full target scope sequentially/);
  assert.match(increment, /accepted edit returns to `revision-plan` and `chapter-revision`/i);
  assert.match(increment, /another full-target current-scope review/);
  assert.match(
    increment,
    /adds no report v2 `stage` value, pending-action operation name, manifest field, or separate state tree/,
  );
  assert.match(
    write,
    /creation acceptance and publication do not establish current-draft revision convergence for the publication scope/,
  );
  assert.match(write, /Offer `revise-increment`/);
  assert.match(
    ask,
    /Revise added or affected chapters after the previous scope has reached current-draft revision convergence and the manuscript grows/,
  );
  assert.match(state, /## Current-draft revision convergence/);
  assert.match(state, /no open finding, stale required evidence, missing synthesis, or approved but unexecuted edit remains/);
  assert.match(state, /Recompute this state from current evidence at each resume/);
});

test("request-driven revision restores current-draft revision convergence for the full-manuscript target scope", async () => {
  const [request, draft, increment, fiction, write, setup, ask, state, reporting, structure] =
    await Promise.all([
      readFile(path.join(root, "skills/revise-request/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/revise-draft/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/revise-increment/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/revise-fiction/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/write-fiction/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/ask-author/SKILL.md"), "utf8"),
      readFile(
        path.join(root, "skills/revise-fiction/references/state-and-findings.md"),
        "utf8",
      ),
      readFile(path.join(root, "references/workflow-reporting.md"), "utf8"),
      readFile(path.join(root, "skills/story-structure/SKILL.md"), "utf8"),
    ]);

  assert.match(request, /confirmed base scope is a full-manuscript scope that has reached/);
  assert.match(request, /Show `revise-increment` when creation or import grew the scope/);
  assert.match(request, /otherwise show `revise-draft`/);
  assert.match(request, /entry's own approved edits are expected to stale that base scope/);
  assert.match(request, /request set[\s\S]*work set/);
  assert.match(request, /Requested macro structure[\s\S]*`story-structure` Audit/);
  assert.match(
    request,
    /Required coverage for current-draft revision convergence includes every applicable subcheck required by the base scope's current-draft revision convergence evidence plus newly requested checks/,
  );
  assert.match(request, /After any manuscript change, run a new full-target current-scope review/);
  assert.match(request, /fresh reader reads the full target scope sequentially/);
  assert.match(request, /Request completion alone does not establish current-draft revision convergence/);
  assert.match(
    request,
    /adds no report v2 `stage` value, pending-action operation name, manifest field, or separate state tree/,
  );

  for (const text of [draft, increment, fiction, write, setup, ask, state, reporting, structure]) {
    assert.match(text, /revise-request/);
  }
  assert.match(
    ask,
    /Revise existing content after the full-manuscript base scope has reached current-draft revision convergence/,
  );
  assert.match(state, /## Current-draft revision convergence/);
});

test("project operations register creation state and resumable publication", async () => {
  const [project, operations, templateText] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/assets/project-template.json"), "utf8"),
  ]);
  const template = JSON.parse(templateText);

  assert.match(project, /upgrade-v31/);
  assert.match(project, /write-fiction/);
  for (const operation of [
    "creation-baseline",
    "writing-plan",
    "chapter-creation",
    "chapter-review",
    "creation-commit",
    "creation-import",
    "milestone-review",
  ]) {
    assert.match(operations, new RegExp(`\`${operation}\``));
  }
  assert.match(operations, /3\.0\.0/);
  assert.match(operations, /3\.1\.0/);
  assert.match(operations, /paths\.creation/);
  assert.match(operations, /expected absent/i);
  assert.match(operations, /<paths\.creation>\/batches\/<commit-id>\.json/);
  assert.match(operations, /legacy `STAGES` remains revision-only/);
  assert.match(operations, /move created files into the safety backup/i);
  assert.equal(template.schema_version, "3.1.0");
  assert.equal(template.paths.creation, ".author-toolkit/creation/");
});

test("local coverage reuse never preserves stale whole-book synthesis", async () => {
  const [state, draftGates, fictionGates, reporting] = await Promise.all([
    readFile(
      path.join(root, "skills/revise-fiction/references/state-and-findings.md"),
      "utf8",
    ),
    readFile(path.join(root, "skills/revise-draft/references/stage-gates.md"), "utf8"),
    readFile(path.join(root, "skills/revise-fiction/references/stage-gates.md"), "utf8"),
    readFile(path.join(root, "references/workflow-reporting.md"), "utf8"),
  ]);

  for (const text of [state, draftGates, fictionGates]) {
    assert.match(text, /coverage unit/i);
    assert.match(text, /whole-book synthesis/i);
    assert.match(text, /write-fiction/);
  }
  assert.match(state, /coverage index[\s\S]*paths\.reports/i);
  assert.match(state, /creation operations remain outside report v2 `stage`/i);
  assert.match(reporting, /`write-fiction`/);
});

test("creation handoffs and workshop output remain pointer based", async () => {
  const [handoff, template, workshop] = await Promise.all([
    readFile(path.join(root, "skills/author-handoff/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-handoff/assets/handoff-template.md"), "utf8"),
    readFile(path.join(root, "skills/fiction-workshop/SKILL.md"), "utf8"),
  ]);

  for (const term of [
    "creation batch",
    "staging",
    "chapter",
    "volume",
    "commit",
    "review job",
    "reader-state",
  ]) {
    assert.match(handoff + template, new RegExp(term, "i"));
  }
  assert.match(handoff, /fresh-reader state remains independent/i);
  assert.match(handoff, /Do not include chapter excerpts/);
  assert.match(workshop, /write-fiction/);
  assert.match(workshop, /staging\/<batch-id>\//);
  assert.match(workshop, /staged path, SHA-256 hash, and intended target path/i);
  assert.match(workshop, /Standalone behavior remains unchanged/);
});

test("review layers require real text, fresh isolation, and complete synthesis", async () => {
  const [review, protocol, handoff] = await Promise.all([
    readFile(path.join(root, "skills/author-review/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-review/references/chunked-review.md"), "utf8"),
    readFile(
      path.join(root, "skills/author-review/assets/review-handoff-template.md"),
      "utf8",
    ),
  ]);

  assert.match(review, /chunk -> volume\/phase -> book/);
  assert.match(protocol, /context budget/i);
  assert.match(protocol, /chapter or scene boundaries/i);
  assert.match(protocol, /intent` and `standards` chunk work may run in parallel/i);
  assert.match(protocol, /fresh` reading is strictly sequential/i);
  assert.match(protocol, /same logical reviewer/i);
  assert.match(protocol, /only its own reader-state/i);
  assert.match(protocol, /three perspectives remain isolated/i);
  assert.match(protocol, /final fresh[\s\S]*actual manuscript text/i);
  assert.match(protocol, /never substitutes summaries for the original manuscript/i);
  assert.match(protocol, /cross-file findings cite every real contributing location/i);
  assert.match(protocol, /chunk reports/i);
  assert.match(protocol, /synthesis report/i);
  assert.match(protocol, /every required unit and every applicable synthesis/i);
  assert.match(protocol, /partial` or `skipped/);
  assert.match(review, /resumable handoffs/i);
  assert.match(review, /collect` validates the review job and coverage/i);
  assert.match(handoff, /Review job path:/);
  assert.match(handoff, /Reader-state path:/);
});
