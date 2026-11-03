import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const expectedSkills = [
  "ask-author",
  "setup-author-toolkit",
  "revise-fiction",
  "revise-draft",
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

  for (const text of [setup, fiction, draft]) {
    assert.match(text, /\.author-toolkit\/project\.json/);
    assert.doesNotMatch(text, /\.author-toolkit\/revise-draft\//);
  }
  assert.match(
    fiction,
    /intake`, `story-bible`, `structure`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `final-review/,
  );
  assert.match(
    draft,
    /intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review/,
  );
  assert.match(draft, /unknown future story is not a finding/i);
  assert.match(draftGates, /Unknown future turns and ending are valid entries/);
  assert.match(draftGates, /Reports list actual subchecks/);
  assert.match(fiction, /current-scope review does not satisfy final review/);

  for (const text of [fiction, draft, fictionGates, draftGates, reporting]) {
    assert.match(text, /\[Author decision loop\]\(/);
  }
  assert.match(state, /## Author decision loop/);
  assert.match(state, /Otherwise, each assistant turn has one active decision/);
  assert.match(state, /discussion alone does not advance the queue or approve work/);
  assert.match(state, /explicitly request batch handling/);
  assert.match(state, /Keep nonblocking unknowns labeled as unknown/);
  assert.match(state, /`pending_action\.reason`/);
  assert.match(draft, /normally confirmation of the proposed scope/);
});
