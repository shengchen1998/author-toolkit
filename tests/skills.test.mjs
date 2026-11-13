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

test("setup requires author-confirmed host command visibility", async () => {
  const [setup, instructions, terminology, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "references/terminology.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);
  const setupStep = setup.match(/^4\. .+$/m)?.[0];
  const readyRule = setup.match(/^Report setup as ready only when .+$/m)?.[0];
  assert.ok(setupStep);
  assert.ok(readyRule);

  assert.match(setupStep, /Ask the author to confirm host command visibility/);
  assert.match(setupStep, /all five commands in the current host's command palette or autocomplete/);
  assert.match(setupStep, /all five exact registered names in its skill picker on a host without skill commands/);
  assert.match(setupStep, /Wait for that confirmation and the author's strategy choice/);
  assert.match(readyRule, /author has confirmed host command visibility for all five strategies/);
  assert.match(readyRule, /model-facing registry metadata or displayed command strings/);
  assert.match(readyRule, /report host command visibility as unverified and do not report setup as ready/);
  assert.match(readyRule, /Do not start .+ or another writing skill from setup/);
  for (const skill of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    assert.match(setupStep, new RegExp(`\`${skill}\``));
    assert.match(readyRule, new RegExp(`\`${skill}\``));
  }
  assert.match(instructions, /Read each semantic skill's installed `SKILL\.md` and applicable references, then execute its procedure directly/);
  assert.match(instructions, /Deterministic shared-state transactions have one installed CLI implementation and no model-executed counterpart/);
  assert.match(instructions, /Do not use model-facing registry metadata to check the explicit author entry points/);
  assert.match(instructions, /setup checks the five strategies' host command visibility with the author/);
  assert.match(instructions, /display its exact host command and wait for the author; do not start it as an internal callee/);
  assert.match(instructions, /never start a strategy automatically/);
  assert.match(terminology, /`host command visibility` \| 宿主命令可见性/);
  assert.match(readme, /confirmation of host\s+command visibility/);
  assert.match(readme, /model-facing registry metadata/);
  assert.match(zhReadme, /宿主命令可见性/);
  assert.match(zhReadme, /模型侧注册元数据/);
});

test("setup reads terminology by section from the single installed source", async () => {
  const [setup, instructions] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
  ]);
  assert.match(setup, /For setup, read the bundled \[controlled workflow terminology\]\(assets\/references\/terminology\.md\)'s \*\*Core terms\*\* and \*\*Contract values\*\* sections/);
  assert.match(setup, /Consult its \*\*Operation identifiers\*\* section by exact identifier/);
  assert.match(setup, /pending action, group of unverified approvals, or backup-index difference/);
  assert.match(instructions, /`<setup-skill-root>\/assets\/references\/terminology\.md`/);
  assert.match(instructions, /Do not copy contracts into the writing project/);
});

test("deterministic initialization and semantic skills have one implementation each", async () => {
  const [setup, existingSetup, project, operations, instructions, development] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "AGENTS.md"), "utf8"),
  ]);
  assert.match(existingSetup, /scripts\/initialize\.mjs --project-root <project-root> --json/);
  assert.match(existingSetup, /only existing-project initialization implementation/);
  assert.match(existingSetup, /do not read `author-project`'s initialization references/);
  assert.doesNotMatch(project, /\| `initialize` \|/);
  assert.match(project, /this skill has no `initialize` operation/);
  assert.match(operations, /That CLI is the only initialization implementation/);
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

test("author-facing commands support Codex dollar-prefixed skill invocation", async () => {
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
  for (const text of [setup, ask, handoff, readme, zhReadme]) {
    for (const skill of strategies) assert.match(text, new RegExp(`\\$${skill}\\b`), skill);
  }
  assert.match(setup, /Use `\$write-fiction`/);
  assert.match(setup, /the `\$` autocomplete/);
  assert.match(setup, /Do not add a qualifier to these unqualified registered skill names/);
  assert.match(ask, /\| Need \| Codex command \|/);
  assert.match(instructions, /`\$write-fiction`/);
  assert.match(instructions, /`\$` autocomplete/);
  assert.match(instructions, /check visibility in the `\$` autocomplete/);
  assert.match(handoff, /`\$author-handoff`/);
  assert.match(reviewHandoff, /Use `\$author-review`/);
  for (const file of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = await readFile(path.join(root, "skills", file, "SKILL.md"), "utf8");
    if (["write-fiction", "revise-fiction"].includes(file)) {
      assert.match(text, /display `\$setup-author-toolkit` and stop/);
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
  assert.match(instructions, /Read the installed `ask-author` skill's `SKILL\.md` before selecting among shared strategies or independent skills/);
  assert.match(instructions, /Manuscript edits require explicit approval of the exact operation, scope, paths, actions, and input versions/);
  assert.match(instructions, /Follow the active strategy and `author-project` for complete-batch backups, execution receipts, staged draft acceptance, commit journals, and separately approved restores/);
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

test("project digest is a generated navigation cache, not another source of truth", async () => {
  const [project, readOperations, existingSetup] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/setup/existing-project.md"), "utf8"),
  ]);
  assert.match(project, /`status --digest`/);
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
  assert.match(readOperations, /older cache, unreadable cache, or unsafe recorded route makes the cache `stale`/);
  assert.match(readOperations, /without reproducing it or rewriting the file/);
  assert.match(existingSetup, /After that check reports `Navigation cache: reusable snapshot only`, read `PROJECT_STATE\.md` for navigation only/);
  assert.match(existingSetup, /When the check reports a stale cache or does not check the cache, use the bounded command results instead of reading the cache/);

  for (const skill of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, /`status --digest`/, skill);
    assert.match(text, /Read `PROJECT_STATE\.md` first/, skill);
    assert.match(text, /needed for the requested work/i, skill);
  }
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
  assert.match(existingSetup, /For an existing v3\.1 manifest, run `node <setup-skill-root>\/scripts\/initialize\.mjs --project-root <project-root> --json` directly for the bounded projection/);
  assert.match(setup, /print `payload-manifest\.json` or the complete manifest, or emit complete session or backup listings/);
  assert.match(setup, /inspect-root\.mjs --project-root <project-root> --json/);
  assert.match(setup, /the existing-project branch goes directly to initialization without manuscript or historical-directory discovery/);
  assert.match(newSetup, /at most 12 candidate manuscript paths with an omitted count/);
  assert.match(newSetup, /recursive historical regular-file counts without historical artifact paths/);
  assert.match(newSetup, /Run `node <setup-skill-root>\/scripts\/inspect-root\.mjs --project-root <project-root> --json`/);
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

  assert.match(project, /For `read`, `validate`, `status`, `status --digest`, and `check-index`, read \[`references\/read-operations\.md`\]/);
  assert.match(project, /For a new manifest and every record or write operation, read \[`references\/operations\.md`\]/);
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
  assert.match(setup, /check\.mjs --project-root <project-root> --diagnose/);
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
  assert.match(existingSetup, /Prefer its text summary for status gates\. Add `--json` only for structured results, and add `--details` only when individual unverified approvals are needed\./);
  assert.match(readOperations, /Prefer the bounded text output for status gates; add `--json` for structured results and `--details` only when complete failed checks or individual unverified approvals are needed\./);
  for (const heading of ["Installation payload", "Project entry files", "Manuscript scope", "Execution evidence"]) {
    assert.match(setup, new RegExp(`\\*\\*${heading}\\*\\*`));
  }
  for (const status of ["Installation", "Project state", "Strategy gate", "Host visibility"]) {
    assert.match(setup, new RegExp(`\\*\\*${status}\\*\\*`));
  }
  assert.match(setup, /A project-state or strategy-gate failure does not change that installation result/);
  assert.match(setup, /toolkit is installed while the affected project-state or evidence-dependent operations are blocked/);
  assert.match(setup, /Distinguish mechanical execution evidence from operation-specific evidence/);

  for (const command of ["initialize\\.mjs --project-root", "doctor\\.mjs", "read\\.mjs --project-root", "preflight\\.mjs --project-root", "validate\\.mjs --manifest", "status\\.mjs --manifest", "writes\\.mjs check-index --manifest", "--explain", "--scope-id", "--require-execution", "--digest", "--diagnose", "project-digest\\.mjs --project-root"]) {
    assert.match(readOperations, new RegExp(command));
  }
  assert.match(readOperations, /operation-specific evidence, evidence reuse, and current-draft revision convergence/);
  assert.match(readOperations, /shares the validation and status implementation with the individual CLIs/);
  assert.match(readOperations, /A project-entry mismatch does not stop project inspection, but exits 1 and prevents digest generation/);
  assert.match(readOperations, /entry-file repair follows an accepted v3\.1 schema even when later project-state validation fails/);
  assert.match(readOperations, /Unsupported or schema-invalid manifests create nothing/);
  assert.match(readOperations, /ordinary preflight leaves unverified approvals nonblocking/);
  assert.match(readOperations, /creates only a missing `<paths\.backups>\/index\.json`/);
  assert.doesNotMatch(readOperations, /## Backup and creation commit|## Record execution|## Restore/);
  assert.match(operations, /\[Digest\]\(read-operations\.md#digest\)/);
  assert.match(operations, /reconcile-executions/);
  assert.match(operations, /including create-only batches/);
  assert.match(readOperations, /check\.mjs/);
  assert.match(readme, /installation payload, project entry files, manuscript scope, and execution\s+evidence/);
  assert.match(zhReadme, /安装载荷、项目入口文件、稿件范围、执行证据/);
  assert.match(readme, /Four independent `Installation`, `Project state`, `Strategy gate`, and `Host\s+visibility` states/);
  assert.match(zhReadme, /`Installation`、`Project state`、`Strategy gate`、`Host visibility` 四项独立状态/);
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
  assert.match(newSetup, /\.\.\/\.\.\/\.\.\/author-project\/SKILL\.md/);
  assert.match(newSetup, /\.\.\/\.\.\/\.\.\/author-project\/references\/operations\.md/);
  assert.doesNotMatch(newSetup, /existing-project\.md|read-operations\.md/);
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

  assert.match(project, /current-draft revision convergence or previous\/base-scope execution gate, target scope ID and `--require-execution`/);
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
  assert.match(draft, /normally confirmation of the proposed scope/);
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
  assert.match(instructions, /staged draft/);
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
