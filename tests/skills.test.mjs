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

test("shared skills resolve setup from their installed directories", async () => {
  const siblingConsumers = [
    "ask-author",
    "revise-fiction",
    "revise-draft",
    "revise-increment",
    "revise-request",
    "write-fiction",
    "author-project",
    "author-handoff",
    "author-review",
  ];
  const [setup, instructions] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
  ]);

  assert.match(setup, /Toolkit skills from one installation are siblings\. For this skill, `<setup-skill-root>` is its own installed directory\./);
  assert.match(instructions, /For `setup-author-toolkit`, `<setup-skill-root>` is its own installed directory; from another toolkit skill, resolve it as `\.\.\/setup-author-toolkit` relative to that skill's installed directory/);
  for (const skill of siblingConsumers) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, /Toolkit skills from one installation are siblings\./, skill);
    assert.match(text, /`<setup-skill-root>` as `\.\.\/setup-author-toolkit` relative to this skill's installed directory/, skill);
  }
});

test("setup assumes the five strategy entries are installed", async () => {
  const [setup, instructions, terminology, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "references/terminology.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);
  const setupStep = setup.match(/^4\. .+(?:\n {3}.+)*/m)?.[0];
  const readyRule = setup.match(/^Report setup as ready only when .+$/m)?.[0];
  assert.ok(setupStep);
  assert.ok(readyRule);

  assert.match(setupStep, /Assume these entries are installed; do not check their host visibility or ask the author to confirm it/);
  assert.match(setupStep, /`ask-author` as the optional "help me choose" routing entry/);
  assert.match(setupStep, /Wait for the author's choice of a strategy or the `ask-author` routing entry/);
  assert.match(setup, /reuse that command syntax for these entries/);
  assert.match(readyRule, /installation and project state pass, and all selected paths are registered\./);
  assert.match(readyRule, /Assume the five strategy entries are installed without checking or reporting their host visibility/);
  assert.match(readyRule, /Do not start .+ or another writing skill from setup/);
  for (const skill of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    assert.match(setupStep, new RegExp(`\`${skill}\``));
    assert.match(readyRule, new RegExp(`\`${skill}\``));
  }
  assert.match(instructions, /Read each semantic skill's installed `SKILL\.md` and applicable references, then execute its procedure directly/);
  assert.match(instructions, /Deterministic shared-state transactions have one installed CLI implementation and no model-executed counterpart/);
  assert.match(instructions, /Assume the explicit author entry points below are installed; do not check their host visibility or infer availability from model-facing registry metadata/);
  assert.match(instructions, /display its exact host command, or its exact registered skill name when the host uses only a skill picker, and wait for the author; do not start it as an internal callee/);
  assert.match(instructions, /never start a strategy automatically/);
  assert.doesNotMatch(terminology, /host command visibility|host_visibility/);
  assert.match(readme, /setup assumes the five\s+strategy entries are installed/);
  assert.match(zhReadme, /setup 始终假定五个策略入口已安装/);
  for (const text of [setup, instructions, readme, zhReadme]) {
    assert.doesNotMatch(text, /host_visibility|Host visibility|host command visibility|宿主命令可见性/);
  }
  assert.match(readme, /reuses that command syntax/);
  assert.match(readme, /registers a detected or explicitly supplied language directly/);
  assert.match(zhReadme, /沿用相同的命令语法/);
  assert.match(zhReadme, /无需单独确认语言/);
});

test("setup reads a bounded reporting preset from the single installed source", async () => {
  const [setup, instructions] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
  ]);
  assert.match(setup, /scripts\/terminology\.mjs --preset setup-report/);
  assert.match(setup, /setup report interpretation and entry routing/);
  assert.match(setup, /--preset setup` for the complete setup selection/);
  assert.match(setup, /do not read the full terminology file/);
  assert.match(setup, /scripts\/terminology\.mjs --section "Operation identifiers"/);
  assert.match(setup, /pending action, group of unverified approvals, or backup-index difference/);
  assert.match(instructions, /`<setup-skill-root>\/assets\/references\/terminology\.md`/);
  assert.match(instructions, /Do not copy contracts into the writing project/);
});

test("new-project setup proceeds without prompting for an optional title", async () => {
  const newSetup = await readFile(
    path.join(root, "skills/setup-author-toolkit/assets/setup/new-project.md"),
    "utf8",
  );
  assert.match(
    newSetup,
    /The project title is optional: use one already supplied by the author, or proceed directly with an empty title\./,
  );
});

test("deterministic initialization and semantic skills have one implementation each", async () => {
  const [setup, existingSetup, newSetup, project, operations, instructions, development] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/new-project.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "AGENTS.md"), "utf8"),
  ]);
  assert.match(existingSetup, /setup-report\.mjs capture --report-store <report-store> --kind initialize -- --project-root <project-root>/);
  assert.match(existingSetup, /only existing-project initialization implementation/);
  assert.match(existingSetup, /do not read `author-project`'s initialization references/);
  assert.match(newSetup, /setup-report\.mjs capture --report-store <report-store> --kind scaffold -- --project-root <project-root>/);
  assert.match(newSetup, /The CLI reads the four sibling templates/);
  assert.match(newSetup, /do not manually create state or repeat standalone validation after success/);
  assert.doesNotMatch(project, /\| `initialize` \|/);
  assert.doesNotMatch(project, /\| `scaffold-project` \|/);
  assert.match(project, /this skill has no `scaffold-project` or `initialize` operation/);
  assert.match(operations, /That CLI is the only new-project scaffolding implementation/);
  assert.match(operations, /That CLI is the only existing-project initialization implementation/);
  assert.match(development, /### Implementation and host independence/);
  assert.match(development, /one authoritative implementation/);
  assert.match(development, /remove the equivalent model-executed procedure and its skill-operation entry/);
  assert.match(development, /no host-specific tool invocation is part of the runtime contract/);
  assert.match(instructions, /Read each semantic skill's installed `SKILL\.md` and applicable references, then execute its procedure directly/);
  assert.match(instructions, /no model-executed counterpart/);
  for (const skill of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, /Read each needed callee's installed `SKILL\.md` and applicable references/, skill);
    assert.match(text, /Execute its procedure directly/, skill);
  }
});

test("skill procedure bodies contain no host-specific tool invocation", async () => {
  for (const skill of expectedSkills.filter((name) => name !== "avoid-ai-writing")) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.doesNotMatch(text, /Skill tool/i, skill);
    assert.doesNotMatch(text, /current skill listing|listed registered name|listed registered names/i, skill);
  }
});

test("author-facing entries use host-independent skill invocation", async () => {
  const [setup, instructions, ask, handoff, reviewHandoff, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "skills/ask-author/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-handoff/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-review/assets/review-handoff-template.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);
  const strategies = ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"];
  for (const text of [setup, instructions, ask, handoff, reviewHandoff, readme, zhReadme]) {
    assert.doesNotMatch(text, /`\$[a-z]/);
  }
  for (const text of [setup, ask, handoff, readme, zhReadme]) {
    for (const skill of strategies) assert.match(text, new RegExp(`\\b${skill}\\b`), skill);
  }
  assert.match(setup, /current host's skill command or skill picker/);
  assert.match(setup, /Do not add a qualifier to these unqualified registered skill names/);
  assert.match(setup, /Read `\.\.\/ask-author\/SKILL\.md` once and use only the \*\*Need\*\* labels from its \*\*Author-facing commands\*\* table as the descriptions for the five strategy entries/);
  assert.match(ask, /\| Need \| Registered skill \|/);
  assert.match(instructions, /current host's skill command or skill picker/);
  assert.match(instructions, /`write-fiction`/);
  assert.match(handoff, /current host's skill command or skill picker/);
  assert.match(handoff, /`author-handoff`/);
  assert.match(reviewHandoff, /Start `author-review` through the current host's skill command or skill picker/);
  assert.doesNotMatch(reviewHandoff, /\$author-review\b/);
  for (const file of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = await readFile(path.join(root, "skills", file, "SKILL.md"), "utf8");
    assert.doesNotMatch(text, /\$setup-author-toolkit\b/, file);
    if (["write-fiction", "revise-fiction"].includes(file)) {
      assert.match(text, /display the host command for user-invoked `setup-author-toolkit` and stop/);
    } else {
      assert.match(text, /Use the same setup command forms as `revise-fiction`/);
    }
  }
});

test("project instructions defer detailed routing and write procedures", async () => {
  const [instructions, ask, operations] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "skills/ask-author/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
  ]);

  assert.match(instructions, /Match the author's language/);
  assert.match(instructions, /When the route is unclear, show the `ask-author` host command or registered skill name and wait; `ask-author` owns strategy selection/);
  assert.doesNotMatch(instructions, /Read the installed `ask-author` skill's `SKILL\.md` before selecting/);
  assert.match(instructions, /Manuscript edits require explicit approval of the exact operation, scope, paths, actions, and input versions/);
  assert.match(instructions, /Restores require separate approval/);
  assert.match(instructions, /Follow the active strategy and `author-project` for complete write procedures/);
  assert.doesNotMatch(instructions, /\| Request \| Skill \||record-backup|range\.mjs|workflow-reporting\.md|Finish with the current operation/);

  assert.match(ask, /\| Request \| Skill \|/);
  for (const skill of ["fiction-workshop", "story-structure", "character-archetypes", "narrative-nonfiction", "prose-mechanics", "avoid-ai-writing"]) {
    assert.match(ask, new RegExp(`\\| \`${skill}\` \\|`), skill);
  }
  assert.match(ask, /no outline, ending, or whole-book structure audit is required/);
  assert.match(operations, /## Backup and creation commit/);
  assert.match(operations, /an unverified approval from another batch/);
  assert.match(operations, /## Complete write/);
  assert.match(operations, /complete-write --manifest/);
  assert.match(operations, /interrupted or historical work/);
  assert.match(operations, /## Restore/);
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

test("author-project operation rows expose the installed CLI argument contracts", async () => {
  const [project, operations] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
  ]);
  const commands = [
    "node <setup-skill-root>/scripts/status.mjs --manifest <project-root>/.author-toolkit/project.json",
    "node <setup-skill-root>/scripts/check.mjs --project-root <project-root> --full [--scope-id <scope-id>]",
    "node <setup-skill-root>/scripts/check.mjs --project-root <project-root> --digest --json",
    "node <setup-skill-root>/scripts/project-digest.mjs --project-root <project-root>",
  ];
  for (const command of commands) assert.ok(project.includes(command), command);
  assert.match(operations, /Both forms always emit JSON without a `--json` option/);
  assert.match(operations, /The command always emits JSON without a `--json` option/);
});

test("shared session notes use one template and compatible UTC filenames", async () => {
  const [project, readOperations, sharedState, template, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "skills/revise-fiction/references/state-and-findings.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/assets/session-note-template.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);

  assert.match(template, /`<paths\.sessions>\/<YYYY-MM-DDTHHMMSSZ>_<operation>\.md`/);
  const fields = [
    "Operation",
    "Active plan",
    "Work performed",
    "Author decisions",
    "Artifacts",
    "Open questions",
    "Stale propagation",
    "Next action",
  ];
  for (const field of fields) assert.match(template, new RegExp(`^- ${field}:`, "m"), field);
  assert.match(template, /^  - Reports:/m);
  assert.match(template, /^  - Backups:/m);
  assert.ok(project.includes("assets/session-note-template.md"));
  assert.ok(readOperations.includes("../assets/session-note-template.md"));
  assert.ok(sharedState.includes("../../author-project/assets/session-note-template.md"));
  assert.ok(readme.includes("(skills/author-project/assets/session-note-template.md)"));
  assert.ok(zhReadme.includes("(skills/author-project/assets/session-note-template.md)"));

  for (const language of ["en", "zh"]) {
    const sessions = path.join(root, "examples", `fiction-revision-${language}`, "sessions");
    const files = await readdir(sessions);
    assert.ok(files.length > 0);
    for (const file of files) {
      assert.match(file, /^\d{4}-\d{2}-\d{2}T\d{6}Z_[a-z0-9-]+\.md$/, file);
      const note = await readFile(path.join(sessions, file), "utf8");
      for (const field of fields) assert.match(note, new RegExp(`^- ${field}:`, "m"), `${file}: ${field}`);
    }
  }
});

test("fiction-workshop separates standalone and shared session notes", async () => {
  const skill = await readFile(path.join(root, "skills/fiction-workshop/SKILL.md"), "utf8");
  assert.match(skill, /Without `\.author-toolkit\/project\.json`, write a brief note at `sessions\/YYYY-MM-DD_topic-slug\.md`/);
  assert.match(skill, /return the stopping point to the caller for its `author-project` session note/);
  assert.match(skill, /standalone work in a toolkit project leaves registered sessions unchanged/);
});

test("project digest is a generated navigation cache, not another source of truth", async () => {
  const [project, readOperations, existingSetup, startHere] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/START_HERE.md"), "utf8"),
  ]);
  assert.match(project, /`status --digest`/);
  assert.match(project, /`check --digest`/);
  assert.match(readOperations, /check\.mjs --project-root <project-root> --digest --json/);
  assert.match(readOperations, /`projection` field returns the same validated bounded manifest projection as `read\.mjs`/);
  assert.match(readOperations, /project-digest\.mjs --project-root/);
  assert.match(readOperations, /PROJECT_STATE\.md/);
  assert.match(readOperations, /once after each logical shared-state operation/i);
  assert.match(readOperations, /navigation cache/i);
  assert.match(readOperations, /Generated at/);
  assert.match(readOperations, /Validation at generation: passed/);
  assert.match(readOperations, /rerunning preflight before reuse/);
  assert.match(readOperations, /not an execution gate or a current-draft revision convergence claim/);
  assert.match(readOperations, /current-scope execution evidence/);
  assert.match(readOperations, /withholds the recorded next action and shows `revise-draft`/);
  assert.match(readOperations, /compares `generated_at` with the valid manifest's `created_at` and `updated_at`/);
  assert.match(readOperations, /scope\/pending mismatch makes the cache `stale`/);
  assert.match(readOperations, /not proof of complete freshness or an execution gate/);
  assert.match(readOperations, /without reproducing it or rewriting the file/);
  assert.match(existingSetup, /After that check's captured JSON reports `navigation_cache\.reusable` as `true`, read `PROJECT_STATE\.md` for navigation only/);
  assert.match(existingSetup, /When the check reports an absent or stale cache, or does not check the cache, use the bounded command results instead of reading the cache/);
  assert.match(startHere, /JSON `navigation_cache\.reusable` is `true`/);

  const startupSiblings = {
    "write-fiction": ["author-project", "revise-fiction"],
    "revise-fiction": ["author-project", "revise-fiction"],
    "revise-draft": ["author-project", "revise-fiction"],
    "revise-increment": ["author-project", "revise-fiction", "revise-draft"],
    "revise-request": ["author-project", "revise-fiction", "revise-draft"],
  };
  for (const [skill, siblings] of Object.entries(startupSiblings)) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, /procedure once with `check --digest`/, skill);
    assert.match(text, /single JSON result supplies the bounded projection/, skill);
    assert.doesNotMatch(text, /procedures separately with `read`, `validate`, and `status --digest`/, skill);
    assert.match(text, /Read `PROJECT_STATE\.md` first/, skill);
    assert.match(text, /needed for the requested work/i, skill);
    for (const sibling of siblings) {
      assert.ok(text.includes(`--require-sibling ${sibling}`), `${skill}: ${sibling}`);
    }
  }
  assert.match(readOperations, /payload\.siblings/);
  assert.match(readOperations, /payload\.sibling_failures/);
  assert.match(readOperations, /prevents digest generation/);
});

test("new Story Bibles use a neutral heading and an optional title field", async () => {
  const [template, newSetup] = await Promise.all([
    readFile(path.join(root, "skills/author-project/assets/story-bible-template.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/new-project.md"), "utf8"),
  ]);

  assert.match(template, /^# Story Bible\n/);
  assert.match(template, /^- Title:$/m);
  assert.doesNotMatch(template, /PROJECT_TITLE/);
  assert.match(newSetup, /writes a supplied project title to the `Title` field and otherwise leaves that field empty/);
  assert.match(newSetup, /retaining the neutral `# Story Bible` heading/);
});

test("setup and routine navigation keep operational history listings bounded", async () => {
  const [setup, existingSetup, newSetup, readOperations, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/new-project.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);

  assert.match(setup, /^1\. Check only whether `<project-root>\/\.author-toolkit\/project\.json` exists\./m);
  assert.match(existingSetup, /For an existing v3\.1 manifest, run `node <setup-skill-root>\/scripts\/setup-report\.mjs capture --report-store <report-store> --kind initialize -- --project-root <project-root>` for the bounded projection/);
  assert.match(setup, /print `payload-manifest\.json` or the complete manifest, or emit complete session or backup listings/);
  assert.doesNotMatch(setup, /inspect-root\.mjs/);
  assert.match(newSetup, /at most 12 candidate manuscript paths with an omitted count/);
  assert.match(newSetup, /recursive historical regular-file counts without historical artifact paths/);
  assert.match(newSetup, /Run `node <setup-skill-root>\/scripts\/inspect-root\.mjs --project-root <project-root> --json`/);
  assert.match(newSetup, /adding `--language-sample` when the author has not supplied a language/);
  assert.match(newSetup, /Without `--language-sample`, discovery reads no file contents/);
  assert.match(newSetup, /Use its entry-file results directly rather than pre-reading those files/);
  assert.match(newSetup, /do not enumerate historical artifact trees/);
  assert.doesNotMatch(existingSetup, /inspect-root\.mjs/);

  const navigationRule = /For routine navigation, use `PROJECT_STATE\.md` pointers, targeted artifact reads, or aggregate counts rather than emitting complete file listings of the registered session or backup directories\./;
  assert.match(readOperations, navigationRule);
  assert.match(readOperations, /Cache generation may scan those directories internally without emitting the list/);
  assert.match(readme, /Routine navigation uses its\s+pointers, targeted artifact reads, or aggregate counts/);
  assert.match(readme, /complete\s+file listings of the registered session or backup directories/);
  assert.match(zhReadme, /常规导航使用缓存指针, 按需读取目标产物或计数/);
  assert.match(zhReadme, /不输出已登记会话或备份目录的完整文件清单/);

  for (const skill of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, navigationRule, skill);
  }
});

test("existing-project setup uses bounded inspection references and a categorized summary", async () => {
  const [project, setup, existingSetup, readOperations, operations, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);

  assert.match(project, /For `validate`, read only \[Read and validate\]\(references\/read-operations\.md#read-and-validate\)/);
  assert.match(project, /For `read`, `status`, `check --full`, `check --digest`, `status --digest`, and `check-index`, read \[`references\/read-operations\.md`\]/);
  assert.match(project, /Setup owns new-project registration through `<setup-skill-root>\/scripts\/scaffold-project\.mjs`/);
  assert.match(project, /### Operation reference routes/);
  assert.doesNotMatch(project, /For every record or write operation, read \[`references\/operations\.md`\]/);
  assert.doesNotMatch(project, /For every operation, read \[`references\/operations\.md`\]/);
  assert.match(existingSetup, /Once initialization's manifest-schema check passes, perform step 3's entry-file replacement even if later project-state validation fails/);
  assert.match(existingSetup, /Initialization exits 3 for this schema-valid project-validation failure/);
  assert.match(existingSetup, /exit 3 does not make project validation successful/);
  assert.match(setup, /existing-project branch explicitly handles exit 3 after an accepted v3\.1 schema/);
  assert.match(existingSetup, /Report a validation failure as a project-state blocker and a requested execution-gate failure as a blocker for evidence-dependent operations/);
  assert.match(existingSetup, /neither changes a passing installation into an installation failure/);
  assert.match(existingSetup, /unsupported or schema-invalid manifest still stops before entry-file replacement/);
  assert.match(existingSetup, /perform step 3's entry-file replacement even if later project-state validation fails/);
  assert.match(existingSetup, /doctor`, initialize, entry-file repair, and one diagnostic check/);
  assert.match(setup, /final installation and project-state verification/);
  assert.doesNotMatch(setup, /then the final doctor|Rerun the same doctor command/);
  assert.match(setup, /setup-report\.mjs capture --report-store <report-store> --kind check -- --project-root <project-root> --diagnose/);
  assert.match(existingSetup, /without rerunning preflight/);
  assert.doesNotMatch(existingSetup, /run preflight again/);
  assert.match(existingSetup, /add `--scope-id <current-scope-id> --require-execution` to that same final diagnostic call/);
  assert.match(existingSetup, /otherwise retain the ordinary form/);
  assert.match(existingSetup, /final diagnostic check in step 2 has already requested the strict execution gate/);
  assert.match(setup, /adding the selected branch's strict-execution options to this same call when applicable/);
  assert.match(setup, /without repeating doctor or preflight/);
  assert.match(existingSetup, /standalone `validate\.mjs` only when a validation failure requires its complete diagnostics/);
  assert.match(existingSetup, /endpoints do not imply a contiguous ID range/);
  assert.match(existingSetup, /default ordinary status uses the current scope ID/);
  assert.match(existingSetup, /outside setup, prefer the text summary for status gates, add `--json` only for structured results, and add `--details` only when individual unverified approvals are needed\./);
  assert.match(readOperations, /Prefer the bounded text output for status gates; add `--json` for structured results and `--details` only when complete failed checks or individual unverified approvals are needed\./);
  for (const heading of ["Installation payload", "Project entry files", "Manuscript scope", "Execution evidence"]) {
    assert.match(setup, new RegExp(`\\*\\*${heading}\\*\\*`));
  }
  for (const status of ["Installation", "Project state", "Strategy gate"]) {
    assert.match(setup, new RegExp(`\\*\\*${status}\\*\\*`));
  }
  assert.match(setup, /A project-state or strategy-gate failure does not change that installation result/);
  assert.match(setup, /failed requested gates as blockers for evidence-dependent operations/);
  assert.match(setup, /Mechanical execution evidence remains distinct from operation completion and current-draft revision convergence/);
  assert.match(setup, /includes recorded scope hashes and validation/);
  assert.match(setup, /a reusable cache adds no detail and no recorded route/);
  assert.match(setup, /every non-reusable navigation-cache result/);
  assert.match(setup, /setup-report\.mjs render --report-store <report-store>/);
  assert.match(setup, /rather than reconstructing its fields from the captured JSON/);
  assert.match(readme, /It reports any non-reusable\s+navigation-cache state/);
  assert.match(zhReadme, /setup 报告所有非可复用的导航缓存状态/);

  for (const command of ["--kind initialize", "doctor\\.mjs", "read\\.mjs --project-root", "preflight\\.mjs --project-root", "validate\\.mjs --manifest", "status\\.mjs --manifest", "writes\\.mjs check-index --manifest", "--explain", "--scope-id", "--require-execution", "--digest", "--diagnose", "project-digest\\.mjs --project-root"]) {
    assert.match(readOperations, new RegExp(command));
  }
  assert.match(readOperations, /operation-specific evidence, evidence reuse, and current-draft revision convergence/);
  assert.match(readOperations, /shares the validation and status implementation with the individual CLIs/);
  assert.match(readOperations, /A project-entry mismatch does not stop project inspection, but exits 1 and prevents digest generation/);
  assert.match(readOperations, /entry-file repair follows an accepted v3\.1 schema even when later project-state validation fails/);
  assert.match(readOperations, /Unsupported or schema-invalid manifests create nothing/);
  assert.match(readOperations, /ordinary preflight leaves unverified approvals nonblocking/);
  assert.match(readOperations, /restores missing registered directories/);
  assert.match(readOperations, /creates only a missing `<paths\.backups>\/index\.json`/);
  assert.doesNotMatch(readOperations, /## Backup and creation commit|## Record execution|## Restore/);
  assert.match(operations, /\[Digest\]\(read-operations\.md#digest\)/);
  assert.match(project, /\| `scaffold-report` \|/);
  assert.match(operations, /## Scaffold report/);
  assert.match(operations, /scaffold-report\.mjs --manifest/);
  assert.match(operations, /When `findings` is omitted, the CLI supplies `findings: \[\]`/);
  assert.match(operations, /--preset <stage> --scope-id <scope-id>/);
  assert.match(operations, /additional non-scope `inputs`/);
  assert.match(project, /\| `coverage-index` \|/);
  assert.match(operations, /## Coverage index/);
  assert.match(operations, /coverage-index\.mjs --manifest/);
  assert.match(operations, /"operation": "prose"/);
  assert.match(project, /\| `review-brief` \|/);
  assert.match(operations, /## Review brief/);
  assert.match(operations, /review-brief\.mjs --project-root/);
  assert.match(operations, /reconcile-executions/);
  assert.match(operations, /including create-only batches/);
  assert.match(readOperations, /check\.mjs/);
  assert.match(readme, /installation payload, project entry files, manuscript scope, and execution\s+evidence/);
  assert.match(zhReadme, /安装载荷、项目入口文件、稿件范围、执行证据/);
  assert.match(readme, /Three independent `Installation`, `Project state`, and `Strategy gate` states/);
  assert.match(zhReadme, /`Installation`、`Project state`、`Strategy gate` 三项独立状态/);
});

test("author-project routes operations to targeted reference sections", async () => {
  const [project, operations, readOperations] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
  ]);
  const routes = project.split("### Operation reference routes")[1]?.split("## Invocation boundary")[0];
  assert.ok(routes);
  assert.match(routes, /read the \[opening project-operation rules\].*and only the linked sections/);
  assert.match(routes, /Do not read unrelated operation sections/);
  assert.match(routes, /\[Digest\]\(references\/read-operations\.md#digest\)/);
  assert.match(readOperations, /^### Digest$/m);

  const operationNames = [
    "next-finding-id",
    "record-findings",
    "scaffold-report",
    "coverage-index",
    "evidence-retention",
    "review-brief",
    "set-pending",
    "record-scope",
    "record-backup",
    "complete-write",
    "record-execution",
    "reconcile-executions",
    "record-restore",
  ];
  for (const operation of operationNames) {
    assert.ok(routes.includes(`\`${operation}\``), `Missing reference route for ${operation}`);
  }

  const headings = new Set(
    [...operations.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
      match[1].toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")
    ),
  );
  for (const match of project.matchAll(/references\/operations\.md#([a-z0-9-]+)/g)) {
    assert.ok(headings.has(match[1]), `Missing operations.md heading for #${match[1]}`);
  }

  const completeWriteRoute = routes.split("\n").find((line) => line.startsWith("| `complete-write` |"));
  assert.ok(completeWriteRoute);
  for (const anchor of ["shared-scope-and-evidence", "tracker-and-approvals", "backup-and-creation-commit", "complete-write"]) {
    assert.ok(completeWriteRoute.includes(`#${anchor}`), `Complete write must read #${anchor}`);
  }
});

test("setup discloses only the selected project branch", async () => {
  const [setup, existingSetup, newSetup] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/new-project.md"), "utf8"),
  ]);
  const setupSteps = setup.match(/^\d+\. .+$/gm) ?? [];
  assert.equal(setupSteps.length, 4);
  assert.match(setup, /when the manifest exists, read only \[Existing project\]\(assets\/setup\/existing-project\.md\); otherwise read only \[New project\]\(assets\/setup\/new-project\.md\)/);
  assert.doesNotMatch(setup, /author-project\/references\/operations\.md|read-operations\.md/);
  assert.doesNotMatch(existingSetup, /author-project\/SKILL\.md|author-project\/references\/|read-operations\.md/);
  assert.doesNotMatch(newSetup, /author-project\/SKILL\.md|author-project\/references\//);
  assert.doesNotMatch(newSetup, /--author-project-root/);
  assert.match(newSetup, /Register the detected or author-supplied language directly and report it in the final setup output/);
  assert.match(newSetup, /only when exactly one unomitted candidate exists/);
  assert.match(newSetup, /lexicographically first direct manuscript file with strict UTF-8 decoding and at most 300 Unicode code points without reading the whole manuscript/);
  assert.match(newSetup, /A non-unique or empty candidate selection returns no text; invalid UTF-8 is an explicit file-path error/);
  assert.match(newSetup, /use `zh-Hans` for Simplified Chinese and `zh-Hant` for Traditional Chinese/);
  assert.match(newSetup, /use `zh` when Chinese is clear but no single script is established/);
  assert.match(newSetup, /Do not infer a regional tag such as `zh-CN` from a sample/);
  assert.match(newSetup, /Use `und` for mixed-language or otherwise inconclusive text/);
  assert.match(newSetup, /built-in project validation gates the new manifest and skeleton files before entry-file installation/);
  assert.match(newSetup, /That check deliberately repeats project validation/);
  assert.doesNotMatch(newSetup, /--skip-doctor/);
  assert.doesNotMatch(newSetup, /existing-project\.md/);
});

test("new-project setup reports both convergence-dependent entry gates", async () => {
  const [setup, newSetup] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/new-project.md"), "utf8"),
  ]);

  assert.match(setup, /for `revise-request` and `revise-increment`, apply the selected branch's routing rules for their required scopes and current-draft revision convergence/);
  assert.match(newSetup, /When existing manuscript is registered, the final setup report must name the registered manuscript root/);
  assert.match(newSetup, /`revise-request` and `revise-increment` are not currently eligible because their required base scope or previous scope has not been verified/);
  assert.match(newSetup, /When the five strategy entries are presented in a table, include a status column and mark the `revise-request` and `revise-increment` rows as `not currently eligible`, keeping that status in each row rather than only in surrounding prose/);
  assert.match(newSetup, /Offer `write-fiction` for continued creation, or `revise-draft` to establish the initial revision scope and reach current-draft revision convergence/);
});

test("convergence gates run strict execution checks without gating ordinary inspection", async () => {
  const [setup, existingSetup, project, readOperations, state, increment, request, handoff, readme, zhReadme] =
    await Promise.all([
      readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
      readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
      readFile(path.join(root, "skills/revise-fiction/references/state-and-findings.md"), "utf8"),
      readFile(path.join(root, "skills/revise-increment/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/revise-request/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/author-handoff/SKILL.md"), "utf8"),
      readFile(path.join(root, "README.md"), "utf8"),
      readFile(path.join(root, "README.zh-CN.md"), "utf8"),
    ]);

  assert.match(project, /add `--scope-id <target-scope-id> --require-execution` for a current-draft revision convergence or previous\/base-scope execution gate/);
  assert.match(existingSetup, /default ordinary status uses the current scope ID/);
  assert.match(existingSetup, /Before relying on a recorded current-draft revision convergence statement/);
  assert.match(existingSetup, /a project-validation failure prevents the later status and execution-gate stages/);
  assert.match(existingSetup, /Apply the other conditions in \[Current-draft revision convergence\]\(\.\.\/\.\.\/\.\.\/revise-fiction\/references\/state-and-findings\.md#current-draft-revision-convergence\)/);
  assert.match(existingSetup, /does not block ordinary setup, a current-scope review, or unrelated read-only work/);
  assert.doesNotMatch(setup, /evidence-blocked|legacy-unverified/);

  for (const text of [readOperations, state]) {
    assert.match(text, /determines or claims (?:current-draft revision convergence|this state)/);
    assert.match(text, /`blocked`/);
    assert.match(text, /preserved post-write evidence/);
    assert.match(text, /execution_recovery|execution recovery audit/);
    assert.match(text, /reconcilable_count|Zero reconcilable approvals/);
    assert.match(text, /end recovery/);
    assert.doesNotMatch(text, /evidence-blocked|legacy-unverified/);
  }
  assert.match(state, /previous scope ID before entering `revise-increment`/);
  assert.match(state, /base scope ID before entering `revise-request`/);
  assert.match(state, /own approved edits may stale its verified previous or base scope/);
  for (const text of [increment, request]) {
    assert.match(text, /`--require-execution`/);
    assert.match(text, /recorded statement of that state does not replace this check/);
    assert.match(text, /Record the affected operation as `blocked`/i);
  }
  assert.match(handoff, /ordinary `status`, passing the current scope ID through `--scope-id`/);
  assert.match(handoff, /Treat recorded statements of current-draft revision convergence as historical/);
  assert.match(readme, /A recorded statement of that state or a\s+current-scope-review pending action does not replace that check/);
  assert.match(zhReadme, /已记录的该状态声明或 `current-scope-review` 待处理操作不能替代该检查/);
  assert.match(readme, /unsupported unverified approvals/);
  assert.match(zhReadme, /无可用证据的未核对批准数/);
});

test("unrecoverable execution evidence ends at an author decision without waiving gates", async () => {
  const [draft, state, readOperations, operations, existingSetup] = await Promise.all([
    readFile(path.join(root, "skills/revise-draft/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/revise-fiction/references/state-and-findings.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
  ]);
  for (const text of [draft, state]) {
    assert.match(text, /zero reconcilable approvals|it is zero and unverified approvals remain/i);
    assert.match(text, /end recovery/);
    assert.match(text, /not established/);
    assert.match(text, /new scope|A new scope/);
  }
  assert.match(readOperations, /never appends receipts, changes approvals, opens the backup gate, or writes files/);
  assert.match(operations, /do not loop reconciliation or bypass the backup gate/);
  assert.match(existingSetup, /not as a promise that rerunning revision will repair missing evidence/);
});

test("shared state references use task-based reading", async () => {
  const [state, reporting, instructions, review, ...strategies] = await Promise.all([
    readFile(path.join(root, "skills/revise-fiction/references/state-and-findings.md"), "utf8"),
    readFile(path.join(root, "references/workflow-reporting.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "skills/author-review/SKILL.md"), "utf8"),
    ...["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"].map((skill) =>
      readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8")
    ),
  ]);

  assert.match(state, /^## Task-based reading$/m);
  for (const task of ["Writing a report", "Changing finding status", "Changing approval status", "Propagating stale evidence", "Recording a stopping point"]) {
    assert.ok(state.includes(`| ${task} |`), `Missing state-reading route for ${task}`);
  }
  assert.match(reporting, /only the applicable row and linked sections under `Task-based reading`/);
  assert.match(instructions, /reference routes to selected sections, use the host's heading search and bounded line-range reads/);
  assert.match(instructions, /ending each section before the next same-level heading/);
  assert.match(review, /state-and-findings\.md#report-envelope/);
  assert.match(review, /state-and-findings\.md#finding-identity-across-reruns/);

  const headings = new Set(
    [...state.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
      match[1].toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")
    ),
  );
  for (const match of state.matchAll(/\]\(#([a-z0-9-]+)\)/g)) {
    assert.ok(headings.has(match[1]), `Missing state-and-findings.md heading for #${match[1]}`);
  }
  for (const strategy of strategies) {
    assert.match(strategy, /Read only the applicable row and linked sections in \[Task-based reading\]\([^\n]*state-and-findings\.md#task-based-reading\)/);
    assert.doesNotMatch(strategy, /Before writing any report or changing finding or approval status/);
  }
  for (const match of [state, ...strategies, review].join("\n").matchAll(/state-and-findings\.md#([a-z0-9-]+)/g)) {
    assert.ok(headings.has(match[1]), `Missing state-and-findings.md heading for #${match[1]}`);
  }
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

test("manuscript publication generates evidence and receipts in one transaction", async () => {
  const [project, operations, reporting, creation, ...strategies] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "references/workflow-reporting.md"), "utf8"),
    readFile(path.join(root, "skills/write-fiction/references/creation-state.md"), "utf8"),
    ...["revise-fiction", "revise-draft", "revise-increment", "revise-request"].map((skill) => readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8")),
  ]);
  assert.match(project, /`complete-write`/);
  assert.match(project, /`record-execution`.*interrupted or historical recovery/);
  assert.match(operations, /The writing skill supplies decided content but performs no manuscript-write counterpart/);
  assert.match(operations, /not one filesystem transaction/);
  assert.match(reporting, /the diagnostic skill does not write manuscript/);
  assert.match(reporting, /`complete-write` publishes the supplied content/);
  assert.match(creation, /Run `author-project` with `complete-write` and the journal path/);
  for (const text of strategies) {
    assert.match(text, /`complete-write`/);
    assert.doesNotMatch(text, /run `author-project` with `record-execution`/);
  }
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
  assert.match(
    draft,
    /read the shared preamble and the \[Intake\]\(references\/stage-gates\.md#1-intake\) and \[Draft baseline\]\(references\/stage-gates\.md#2-draft-baseline\) sections, stopping before `## 3\. Diagnostics`/,
  );
  assert.match(draft, /normally confirmation of the proposed scope/);
  assert.match(draft, /persist the proposed `draft-baseline` artifact/);
  const draftBaselineRoute = draft.match(/^\| `draft-baseline` \| (.+) \|$/m)?.[1];
  assert.ok(draftBaselineRoute);
  assert.match(draftBaselineRoute, /^Execute the local \[Draft baseline\]\(references\/stage-gates\.md#2-draft-baseline\) procedure with `assets\/draft-baseline-template\.md`/);
  assert.match(draftBaselineRoute, /optional editorial reference: \[developmental editing\]\(\.\.\/fiction-workshop\/references\/developmental-editing\.md\)/);
  assert.doesNotMatch(draftBaselineRoute, /`fiction-workshop`/);
  assert.match(draftGates, /\.author-toolkit\/proposals\/<scope-id>-draft-baseline\.md/);
  assert.match(draftGates, /`pending_action\.artifacts`/);
  assert.match(draftGates, /non-authoritative working artifact/);
  assert.match(draftGates, /reuse it only when its scope and input versions still match/);
  assert.match(draftGates, /requires no `edit` approval/);
  assert.match(draft, /Publishing or changing `draft-baseline\.md`.*uses its own `edit` approval/);
});

test("shared prose advances clean audits without weakening author gates", async () => {
  const [prose, reporting, fictionGates, draftGates, increment, chineseRules, adapter] =
    await Promise.all([
      readFile(path.join(root, "skills/prose-mechanics/SKILL.md"), "utf8"),
      readFile(path.join(root, "references/workflow-reporting.md"), "utf8"),
      readFile(path.join(root, "skills/revise-fiction/references/stage-gates.md"), "utf8"),
      readFile(path.join(root, "skills/revise-draft/references/stage-gates.md"), "utf8"),
      readFile(path.join(root, "skills/revise-increment/SKILL.md"), "utf8"),
      readFile(path.join(root, "skills/prose-mechanics/references/chinese-rules.md"), "utf8"),
      readFile(path.join(root, "skills/prose-mechanics/references/avoid-ai-writing-adapter.md"), "utf8"),
    ]);
  const continuation = prose.split("### Shared clean-audit continuation\n")[1]?.split("\n## Common Mistakes")[0];
  assert.ok(continuation, "shared prose has one clean-audit continuation contract");

  for (const strategy of ["revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    assert.match(continuation, new RegExp(`\`${strategy}\``));
    const entry = await readFile(path.join(root, `skills/${strategy}/SKILL.md`), "utf8");
    assert.match(entry, /Clean-audit continuation|clean-audit continuation/);
  }
  for (const gates of [fictionGates, draftGates]) {
    assert.match(gates, /following its shared clean-audit continuation rule/);
  }

  assert.match(continuation, /selected audits 1-18/);
  assert.match(continuation, /does not apply to standalone audits, audit 19, or `ai-cleanup`/);
  assert.match(continuation, /every unit of the agreed scope/);
  assert.match(continuation, /`findings: \[\]`/);
  assert.match(continuation, /`operation_coverage=full`/);
  assert.match(continuation, /`engine\.degraded=false`/);
  assert.match(continuation, /language-inapplicable subchecks/);
  assert.match(continuation, /requested applicable coverage that is partial or skipped is not clean/);
  assert.match(continuation, /Validate and publish the report/);
  assert.match(continuation, /index the run in the tracker before continuing/);
  assert.match(continuation, /without presenting an empty report template or asking whether to continue/);
  assert.match(continuation, /Continue automatically only within the author-selected audit queue/);
  assert.match(continuation, /Stop when the author pauses/);
  assert.match(continuation, /partial, skipped, degraded, or failed/);
  assert.match(continuation, /retain every current matching unit accumulated for the target scope/);
  assert.match(continuation, /Generate the complete full-target synthesis only after the selected queue finishes/);
  assert.match(continuation, /stop at the `prose` operation gate/);
  assert.match(continuation, /Historical findings do not block/);
  assert.match(continuation, /Findings returned by the current audit stop the queue/);
  assert.match(continuation, /before requesting confirmation to enter the next audit/);
  assert.match(continuation, /`pending_action\.operation=prose`/);
  assert.match(continuation, /`pending_action\.status=in_progress`/);
  assert.match(continuation, /resume by validating reusable evidence before the first unfinished selected audit/);

  assert.match(prose, /Standalone work waits for the author's next request/);
  assert.match(prose, /In standalone work, stop at it and wait for the author/);
  assert.match(prose, /Do not start the next audit without confirmation/);
  assert.match(chineseRules, /等待作者决定后再修改/);
  assert.match(adapter, /Do not route through `prose-mechanics`/);
  assert.match(reporting, /do not create an author gate solely to ask whether to continue after a clean audit/);
  assert.match(increment, /retain every accumulated matching unit/);
});

test("revision plans separate decisions from exact write approvals", async () => {
  const [state, template, fictionGates, draftGates, operations] = await Promise.all([
    readFile(path.join(root, "skills/revise-fiction/references/state-and-findings.md"), "utf8"),
    readFile(path.join(root, "skills/revise-fiction/assets/revision-plan-template.md"), "utf8"),
    readFile(path.join(root, "skills/revise-fiction/references/stage-gates.md"), "utf8"),
    readFile(path.join(root, "skills/revise-draft/references/stage-gates.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
  ]);
  assert.match(state, /Only `edit` and `restore` approvals authorize writes/);
  assert.match(state, /actual operation, exact paths, actions, and input versions/);
  assert.match(template, /\| Batch \| Operation \| Files \| Intended changes \| Plan approval ID \| Edit approval ID \| Backup ID \|/);
  assert.match(template, /## Baseline and Story Bible batches/);
  assert.match(template, /never the plan's `revision-plan` operation or `plan` approval type/);
  for (const text of [fictionGates, draftGates]) {
    assert.match(text, /Plan approval does not supply the separate `edit` approval/);
  }
  assert.match(operations, /an `edit` approval ID for the write's actual operation/);
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
  assert.match(instructions, /Restores require separate approval/);
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

test("request-driven revision defaults to request review and preserves prior decisions", async () => {
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
  assert.match(request, /Propose `review_mode=request`/);
  assert.match(request, /explicitly requests a full-target current-scope review/);
  assert.match(request, /only the declared request-review units/);
  assert.match(request, /Do not silently turn them into full chapters/);
  assert.match(request, /once per logical round/);
  assert.match(request, /`review_mode=request` never satisfies the full-target current-scope review requirement/);
  assert.match(request, /convergence has not been reverified/);
  assert.match(request, /shared review-brief decision-reuse rules/);
  assert.match(state, /## Review brief and decision reuse/);
  assert.match(state, /<paths\.reports>\/review_brief\.md/);
  assert.match(state, /Keep a `resolved` or `dismissed` status and its original reason/);
  assert.match(state, /Reviewers, including the fresh reader, do not receive this brief/);
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

  assert.match(project, /write-fiction/);
  assert.doesNotMatch(`${project}\n${operations}`, /upgrade-v31|migrate-v3|3\.0\.0/);
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
  assert.match(operations, /3\.1\.0/);
  assert.match(operations, /paths\.creation/);
  assert.match(operations, /expected absent/i);
  assert.match(operations, /<paths\.creation>\/batches\/<commit-id>\.json/);
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
