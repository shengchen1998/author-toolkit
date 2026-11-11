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
  const setupStep = setup.match(/^8\. .+$/m)?.[0];
  const readyRule = setup.match(/^Report setup as ready only when .+$/m)?.[0];
  assert.ok(setupStep);
  assert.ok(readyRule);

  assert.match(setupStep, /Ask the author to confirm host command visibility/);
  assert.match(setupStep, /all five commands in the current host's command palette or autocomplete/);
  assert.match(setupStep, /all five exact registered names in its skill picker on a host without skill commands/);
  assert.match(setupStep, /Wait for that confirmation and the author's strategy choice/);
  assert.match(readyRule, /author has confirmed host command visibility for all five strategies/);
  assert.match(readyRule, /model-facing Skill tool list, displayed command strings, or plugin or skill `enabled` metadata/);
  assert.match(readyRule, /report host command visibility as unverified and do not report setup as ready/);
  assert.match(readyRule, /Do not invoke .+ or another writing skill from setup/);
  for (const skill of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    assert.match(setupStep, new RegExp(`\`${skill}\``));
    assert.match(readyRule, new RegExp(`\`${skill}\``));
  }
  assert.match(instructions, /each skill that the agent will invoke through the Skill tool/);
  assert.match(instructions, /Do not use that listing to check the explicit author entry points/);
  assert.match(instructions, /setup checks the five strategies' host command visibility with the author/);
  assert.match(instructions, /display its exact host command and wait for the author; do not invoke it through the Skill tool/);
  assert.match(instructions, /never start a strategy automatically/);
  assert.match(terminology, /`host command visibility` \| 宿主命令可见性/);
  assert.match(readme, /confirmation of host\s+command visibility/);
  assert.match(readme, /model-facing\s+Skill tool list/);
  assert.match(zhReadme, /宿主命令可见性/);
  assert.match(zhReadme, /模型侧 Skill 工具列表/);
});

test("setup initialization supports hosts without a Skill tool", async () => {
  const [setup, project] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
  ]);
  const setupStep = setup.match(/^4\. .+$/m)?.[0];
  assert.ok(setupStep);

  assert.match(setupStep, /Resolve the registered `author-project` skill in the current host/);
  assert.match(setupStep, /Execute its `initialize` procedure/);
  assert.match(setupStep, /Skill tool when available; otherwise read the installed skill's `SKILL\.md` and applicable initialization references and execute the same procedure directly/);
  assert.match(setupStep, /Stop for a missing skill, installed file, or initialization failure, not solely because the host has no Skill tool/);
  assert.doesNotMatch(setupStep, /If neither name is registered/);
  assert.match(project, /A caller may invoke this skill through the host's Skill tool or read this installed `SKILL\.md` and its applicable references and execute the requested procedure directly/);
  assert.match(project, /a missing Skill tool is not a missing skill or failed operation/);
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
  assert.match(setup, /Codex uses `\$write-fiction`/);
  assert.match(setup, /the `\$` autocomplete/);
  assert.match(setup, /Do not add a Claude Code plugin qualifier or the Kimi Code `\/skill:` prefix in Codex/);
  assert.doesNotMatch(setup, /On another host, show its skill picker/);
  assert.match(ask, /\| Need \| Codex \| Claude Code \| Kimi Code \|/);
  assert.match(instructions, /`\$write-fiction`/);
  assert.match(instructions, /`\$` autocomplete/);
  assert.match(instructions, /Do not display `\/skill:` or a Claude Code plugin qualifier as a Codex command/);
  assert.match(handoff, /`\$author-handoff`/);
  assert.match(reviewHandoff, /Codex form: `\$author-review`/);
  for (const text of [setup, ask, handoff]) {
    assert.match(text, /not (?:select|a syntax inferred from|inferring).*model's name or identity/);
  }
  for (const file of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = await readFile(path.join(root, "skills", file, "SKILL.md"), "utf8");
    if (["write-fiction", "revise-fiction"].includes(file)) {
      assert.match(text, /Use `\$setup-author-toolkit` in Codex/);
    } else {
      assert.match(text, /Use the same setup command forms as `revise-fiction`/);
    }
  }
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
  const [project, readOperations, instructions, setup] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/assets/AGENTS.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
  ]);
  assert.match(project, /`status --digest`/);
  assert.match(readOperations, /project-digest\.mjs --project-root/);
  assert.match(readOperations, /PROJECT_STATE\.md/);
  assert.match(readOperations, /once after each logical shared-state operation/i);
  assert.match(readOperations, /navigation cache/i);
  assert.match(instructions, /read `PROJECT_STATE\.md` first/i);
  assert.match(setup, /read `PROJECT_STATE\.md` first/i);
  assert.match(instructions, /authoritative/i);
  assert.match(instructions, /only the tracker sections, sessions, plans, and evidence needed/i);

  for (const skill of ["write-fiction", "revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, /`status --digest`/, skill);
    assert.match(text, /Read `PROJECT_STATE\.md` first/, skill);
    assert.match(text, /needed for the requested work/i, skill);
  }
});

test("setup and routine navigation keep operational history listings bounded", async () => {
  const [setup, readOperations, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);

  assert.match(setup, /^1\. Inspect the project root with shallow listings and targeted existence or type checks\./m);
  assert.match(setup, /For an existing v3\.1 manifest, read `PROJECT_STATE\.md` first when present/);
  assert.match(setup, /use `read\.mjs --project-root <project-root>` for the bounded validated projection/);
  assert.match(setup, /do not print `payload-manifest\.json`, the complete manifest, or the full backup index/);
  assert.match(setup, /Without a manifest, limit discovery to the candidate component directories and manuscript paths needed for registration/);
  assert.match(setup, /use presence checks or counts that do not emit session or backup filenames/);

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
  const [project, setup, readOperations, operations, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills/author-project/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/read-operations.md"), "utf8"),
    readFile(path.join(root, "skills/author-project/references/operations.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);

  assert.match(project, /For `initialize` on an existing v3\.1 manifest, `read`, `validate`, `status`, `status --digest`, and `check-index`, read \[`references\/read-operations\.md`\]/);
  assert.match(project, /For a new manifest and every record or write operation, read \[`references\/operations\.md`\]/);
  assert.doesNotMatch(project, /For every operation, read \[`references\/operations\.md`\]/);
  assert.match(setup, /For an existing v3\.1 manifest, perform step 5's entry-file replacement after initialization, then follow it with one `preflight\.mjs` call/);
  assert.match(setup, /doctor, initialize, entry-file repair, preflight, then the final doctor/);
  assert.match(setup, /standalone `validate\.mjs` only when a validation failure requires its complete diagnostics/);
  assert.match(setup, /endpoints do not imply a contiguous ID range/);
  assert.match(setup, /default ordinary status uses the current scope ID/);
  for (const heading of ["Installation payload", "Project entry files", "Manuscript scope", "Execution evidence"]) {
    assert.match(setup, new RegExp(`\\*\\*${heading}\\*\\*`));
  }
  assert.match(setup, /Distinguish mechanical execution evidence from operation-specific evidence/);

  for (const command of ["doctor\\.mjs", "read\\.mjs --project-root", "preflight\\.mjs --project-root", "validate\\.mjs --manifest", "status\\.mjs --manifest", "writes\\.mjs check-index --manifest", "--explain", "--scope-id", "--require-execution", "--digest", "--diagnose", "project-digest\\.mjs --project-root"]) {
    assert.match(readOperations, new RegExp(command));
  }
  assert.match(readOperations, /operation-specific evidence, evidence reuse, and current-draft revision convergence/);
  assert.match(readOperations, /shares the validation and status implementation with the individual CLIs/);
  assert.match(readOperations, /A project-entry mismatch .* does not stop validation/);
  assert.match(readOperations, /ordinary preflight leaves unverified approvals nonblocking/);
  assert.match(readOperations, /create `<paths\.backups>\/index\.json` .* when absent/);
  assert.doesNotMatch(readOperations, /## Backup and creation commit|## Record execution|## Restore/);
  assert.match(operations, /\[Digest\]\(read-operations\.md#digest\)/);
  assert.match(operations, /reconcile-executions/);
  assert.match(operations, /including create-only batches/);
  assert.match(readOperations, /check\.mjs/);
  assert.match(readme, /installation payload, project entry files, manuscript scope, and execution\s+evidence/);
  assert.match(zhReadme, /安装载荷、项目入口文件、稿件范围、执行证据/);
});

test("convergence gates run strict execution checks without gating ordinary inspection", async () => {
  const [setup, project, readOperations, state, increment, request, handoff, readme, zhReadme] =
    await Promise.all([
      readFile(path.join(root, "skills/setup-author-toolkit/SKILL.md"), "utf8"),
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
  assert.match(setup, /default ordinary status uses the current scope ID/);
  assert.match(setup, /Before relying on a recorded current-draft revision convergence statement/);
  assert.match(setup, /does not block ordinary setup, a current-scope review, or unrelated read-only work/);
  assert.doesNotMatch(setup, /evidence-blocked|legacy-unverified/);

  for (const text of [readOperations, state]) {
    assert.match(text, /determines or claims (?:current-draft revision convergence|this state)/);
    assert.match(text, /`blocked`/);
    assert.match(text, /preserved post-write evidence/);
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
