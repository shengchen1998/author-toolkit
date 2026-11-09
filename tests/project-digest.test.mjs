import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";
import { validateProjectFiles, validateScopeCurrency, validateTracker } from "../scripts/lib/index.mjs";

const timestamp = "2026-11-09T00:00:00Z";

async function projectFixture(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "project-digest-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  const manuscript = "manuscript/chapter-001.md";
  const manifest = {
    schema_version: "3.1.0",
    project_type: "fiction",
    language: "zh-CN",
    manuscript_root: "manuscript",
    paths: {
      story_bible: "story-bible.md",
      audit_tracker: "audit-tracker.md",
      reports: "reports",
      sessions: "sessions",
      backups: ".author-toolkit/backups",
      handoffs: ".author-toolkit/handoffs",
      creation: ".author-toolkit/creation",
    },
    current_scope: {
      scope_id: "scope-request-001",
      description: "Full manuscript target scope.",
      status: "confirmed",
      files: [{ path: manuscript, sha256: createHash("sha256").update("正文").digest("hex") }],
      excluded_files: [],
      created_at: timestamp,
    },
    pending_action: {
      operation: "diagnostics",
      status: "awaiting_author",
      scope_id: "scope-request-001",
      reason: "确认诊断发现项。",
      artifacts: ["reports/diagnostics/latest.md"],
      updated_at: timestamp,
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
  const tracker = await readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
  const finding = "| DIAG-001 | diagnostics | developmental | `manuscript/chapter-001.md`, lines \\| preserved | open | `reports/diagnostics/latest.md` | 2026-11-09T00:00:00Z | 等待作者决定。 |";
  const populatedTracker = tracker
    .replace("- Pending action:", "- Pending action:\n- Next action: 确认 DIAG-001。")
    .replace(/^\| Finding ID[^\n]*\n\|[-|]+\|$/m, (header) => `${header}\n${finding}`)
    .replace("## Audit runs", `## Audit runs\n\n| Stage | Scope | Report | Engine and fallback | Language coverage | Run at | Result |\n|---|---|---|---|---|---|---|\n| diagnostics | scope-request-001 | \`reports/diagnostics/legacy.md\` | \`conversational\` | full | ${timestamp} | Historical fallback. |`);

  for (const directory of ["reports/diagnostics", "sessions", ".author-toolkit/revision-plan", ".author-toolkit/creation", ".author-toolkit/backups", ".author-toolkit/handoffs"]) {
    await mkdir(path.join(projectRoot, directory), { recursive: true });
  }
  await mkdir(path.dirname(path.join(projectRoot, ".author-toolkit", "project.json")), { recursive: true });
  await mkdir(path.dirname(path.join(projectRoot, manuscript)), { recursive: true });
  await writeFile(path.join(projectRoot, ".author-toolkit", "project.json"), JSON.stringify(manifest));
  await writeFile(path.join(projectRoot, "audit-tracker.md"), populatedTracker);
  await writeFile(path.join(projectRoot, "story-bible.md"), "Story");
  await writeFile(path.join(projectRoot, manuscript), "正文");
  await writeFile(path.join(projectRoot, "reports/diagnostics/latest.md"), "Report");
  await writeFile(path.join(projectRoot, ".author-toolkit/revision-plan/plan-001.md"), "Plan");
  await writeFile(path.join(projectRoot, "sessions/2026-11-09_diagnostics.md"), "- Active plan: `.author-toolkit/revision-plan/plan-001.md`\n");
  await writeFile(path.join(projectRoot, ".author-toolkit/backups/index.json"), "unreadable backup index");
  return projectRoot;
}

function digestCli(projectRoot) {
  return spawnSync(
    process.execPath,
    [path.join(root, "scripts", "project-digest.mjs"), "--project-root", projectRoot],
    { encoding: "utf8" },
  );
}

test("project digest generates a bounded navigation cache from shared state", async (t) => {
  const projectRoot = await projectFixture(t);
  const result = digestCli(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "PROJECT_STATE.md\n");

  const output = await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8");
  const lines = output.trimEnd().split("\n");
  assert.ok(lines.length >= 20 && lines.length <= 30, `${lines.length} lines`);
  assert.match(output, /navigation cache/i);
  assert.match(output, /manifest, tracker, and current evidence remain authoritative/i);
  assert.match(output, /Scope: `scope-request-001` \(confirmed; 1 file\)/);
  assert.match(output, /Scope hashes: `\.author-toolkit\/project\.json` -> `current_scope\.files`/);
  assert.match(output, /Pending action: `diagnostics` \(awaiting_author\)/);
  assert.match(output, /Findings: open=1, resolved=0, deferred=0, dismissed=0, stale=0/);
  assert.match(output, /Active plan: `\.author-toolkit\/revision-plan\/plan-001\.md`/);
  assert.match(output, /Latest report: `reports\/diagnostics\/latest\.md`/);
  assert.match(output, /Latest session: `sessions\/2026-11-09_diagnostics\.md`/);
  assert.match(output, /Next action: 确认 DIAG-001。/);
  assert.match(output, /Tracker: `audit-tracker.md` -> `## Findings`, `## Audit runs`, `## Approved decisions`/);
  assert.doesNotMatch(output, /index\.json|unreadable backup index/);

  const manifest = JSON.parse(await readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"));
  assert.equal((await validateProjectFiles(manifest, path.join(projectRoot, ".author-toolkit", "project.json"))).valid, true);
  assert.equal((await validateScopeCurrency(manifest, path.join(projectRoot, ".author-toolkit", "project.json"))).valid, true);
  assert.equal((await validateTracker(manifest, path.join(projectRoot, ".author-toolkit", "project.json"))).valid, true);
});

test("project digest uses explicit session fields and a historical report fallback", async (t) => {
  const projectRoot = await projectFixture(t);
  await rm(path.join(projectRoot, "reports/diagnostics/latest.md"));
  await writeFile(
    path.join(projectRoot, "sessions/2026-11-09_diagnostics.md"),
    "- Active plan: `.author-toolkit/revision-plan/plan-session.md`\n- Next action: 从 session 继续。\n",
  );

  const result = digestCli(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const output = await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8");
  assert.match(output, /Active plan: `\.author-toolkit\/revision-plan\/plan-session\.md`/);
  assert.match(output, /Latest report: `reports\/diagnostics\/legacy\.md`/);
  assert.match(output, /Next action: 从 session 继续。/);
});

test("project digest keeps long pending reasons and artifact lists bounded", async (t) => {
  const projectRoot = await projectFixture(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.pending_action.reason = "需要确认。".repeat(300);
  manifest.pending_action.artifacts = Array.from({ length: 61 }, (_, index) => `reports/diagnostics/${String(index).padStart(3, "0")}.md`);
  await writeFile(manifestPath, JSON.stringify(manifest));

  const result = digestCli(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const output = await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8");
  assert.ok(output.trimEnd().split("\n").length <= 30);
  assert.match(output, /Pending reason: 需要确认。.*…$/m);
  assert.match(output, /Pending artifacts: .*\+ 59 more; see `\.author-toolkit\/project\.json`/);
  assert.ok(output.length < 3000);
});

test("project digest stays outside manuscript inventory even at the manuscript root", async (t) => {
  const projectRoot = await projectFixture(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.manuscript_root = ".";
  manifest.current_scope.files = [
    { path: "manuscript/chapter-001.md", sha256: createHash("sha256").update("正文").digest("hex") },
    { path: "story-bible.md", sha256: createHash("sha256").update("Story").digest("hex") },
    { path: "audit-tracker.md", sha256: createHash("sha256").update(await readFile(path.join(projectRoot, "audit-tracker.md"))).digest("hex") },
  ];
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.equal(digestCli(projectRoot).status, 0);
  const currency = await validateScopeCurrency(manifest, manifestPath);
  assert.equal(currency.valid, true, JSON.stringify(currency.errors));
});

test("project digest rejects missing or invalid manifests without replacing an existing cache", async (t) => {
  const projectRoot = await projectFixture(t);
  const digestPath = path.join(projectRoot, "PROJECT_STATE.md");
  await writeFile(digestPath, "Existing author notes\n");
  await writeFile(path.join(projectRoot, ".author-toolkit", "project.json"), "{}\n");

  const result = digestCli(projectRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manifest/i);
  assert.equal(await readFile(digestPath, "utf8"), "Existing author notes\n");

  assert.equal(digestCli(projectRoot).status, 1);
  assert.equal(await readFile(digestPath, "utf8"), "Existing author notes\n");
});
