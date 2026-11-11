import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { exampleRoot, root } from "./helpers.mjs";

const scopeId = "scope-example-revision";
const timestamp = "2026-11-09T00:00:00Z";

function run(args, installedTool = path.join(root, "scripts", "preflight.mjs")) {
  return spawnSync(process.execPath, [installedTool, ...args], { cwd: root, encoding: "utf8" });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "preflight-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const setupRoot = path.join(temporary, "setup-author-toolkit");
  await cp(path.join(root, "skills", "setup-author-toolkit"), setupRoot, { recursive: true });
  const projectRoot = path.join(temporary, "project");
  await cp(exampleRoot("en"), projectRoot, { recursive: true });
  await cp(
    path.join(setupRoot, "assets", "AGENTS.md"),
    path.join(projectRoot, "AGENTS.md"),
  );
  await rm(path.join(projectRoot, "CLAUDE.md"), { force: true });
  await symlink("AGENTS.md", path.join(projectRoot, "CLAUDE.md"));
  await writeFile(path.join(projectRoot, "PROJECT_STATE.md"), "previous cache\n");
  return {
    setupRoot,
    projectRoot,
    manifestPath: path.join(projectRoot, ".author-toolkit", "project.json"),
  };
}

test("preflight combines payload, validation, and ordinary status in one bounded summary", async (t) => {
  const { projectRoot } = await fixture(t);
  const result = run(["--project-root", projectRoot]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Payload failures: 0/);
  assert.match(result.stdout, /Project validation: 5 checks, 0 failures/);
  assert.match(result.stdout, new RegExp(`Scope: ${scopeId} \\(confirmed\\)`));
  assert.match(result.stdout, /Execution evidence: 0\/0 verified; 0 unverified/);
  assert.match(result.stdout, /Operation-specific evidence: not evaluated/);
  assert.match(result.stdout, /Navigation cache: not requested/);
  assert.match(result.stdout, /Preflight: passed/);
  assert.ok(result.stdout.trimEnd().split("\n").length <= 14);
  assert.equal(await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8"), "previous cache\n");
});

test("preflight defaults to current scope and refreshes the navigation cache only on request", async (t) => {
  const { projectRoot } = await fixture(t);
  const previous = await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8");
  const result = run(["--project-root", projectRoot, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.status.execution.scope_id, scopeId);
  assert.equal(parsed.execution_gate, null);
  assert.equal(parsed.digest, null);
  assert.equal(await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8"), previous);

  const digest = run(["--project-root", projectRoot, "--digest"]);
  assert.equal(digest.status, 0, digest.stderr);
  assert.match(digest.stdout, /Navigation cache: refreshed PROJECT_STATE.md/);
  assert.match(await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8"), /Generated navigation cache/);
});

test("preflight permits entry-file repair after initialization", async (t) => {
  const { projectRoot } = await fixture(t);
  await writeFile(path.join(projectRoot, "AGENTS.md"), "custom\n");
  const result = run(["--project-root", projectRoot, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.payload.valid, false);
  assert.deepEqual(parsed.payload.payload_failures, []);
  assert.deepEqual(parsed.payload.entry_failures, parsed.payload.failures);
  assert.deepEqual(parsed.payload.failures.map((failure) => failure.path), ["project:AGENTS.md"]);
  assert.equal(parsed.validation.valid, true);
});

test("preflight reports only project-entry mismatches as repairable setup failures", async (t) => {
  const { projectRoot } = await fixture(t);
  await rm(path.join(projectRoot, "CLAUDE.md"));
  const result = run(["--project-root", projectRoot]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Payload failures: 1/);
  assert.match(result.stdout, /project:CLAUDE\.md: missing or unreadable/);
  assert.match(result.stdout, /Preflight: passed/);

  const json = run(["--project-root", projectRoot, "--json"]);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.payload.clis, 11);
  assert.equal(parsed.payload.project.agents, "ok");
});

test("check is a strict-mode-compatible preflight alias", async (t) => {
  const { projectRoot } = await fixture(t);
  const ordinary = run(["--project-root", projectRoot]);
  const alias = run(["--project-root", projectRoot], path.join(root, "scripts", "check.mjs"));
  assert.equal(alias.status, ordinary.status, alias.stderr);
  assert.equal(alias.stdout, ordinary.stdout);
  const help = run(["--help"], path.join(root, "scripts", "check.mjs"));
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--require-execution/);
});

test("preflight rejects an incomplete installed payload before reading project state", async (t) => {
  const { setupRoot, projectRoot } = await fixture(t);
  await writeFile(path.join(setupRoot, "assets", "references", "terminology.md"), "drift\n");
  const result = run(
    ["--project-root", projectRoot, "--json"],
    path.join(setupRoot, "scripts", "preflight.mjs"),
  );
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
  assert.equal(parsed.payload.valid, false);
  assert.equal(parsed.payload.payload_failures.length, 1);
  assert.deepEqual(parsed.payload.entry_failures, []);
  assert.equal(parsed.payload.failures[0].path, "assets/references/terminology.md");
  assert.equal(parsed.validation, null);
  assert.equal(parsed.status, null);
});

test("preflight strict execution is explicit and does not change ordinary inspection", async (t) => {
  const { projectRoot, manifestPath } = await fixture(t);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const trackerPath = path.join(projectRoot, manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(
    trackerPath,
    tracker.replace(
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|",
      `| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|\n| EDIT-001 | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact test batch. | ${timestamp} |\n| EDIT-094 | edit | prose | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact test batch. | ${timestamp} |`,
    ),
  );

  const ordinary = run(["--project-root", projectRoot, "--json"]);
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(JSON.parse(ordinary.stdout).status.execution.unverified_count, 2);

  const strict = run([
    "--project-root",
    projectRoot,
    "--scope-id",
    scopeId,
    "--require-execution",
    "--json",
  ]);
  assert.equal(strict.status, 1);
  const parsed = JSON.parse(strict.stdout);
  assert.equal(parsed.valid, false);
  assert.equal(parsed.validation.valid, true);
  assert.deepEqual(parsed.execution_gate, { scope_id: scopeId, unverified_count: 2, valid: false });

  const digest = run([
    "--project-root",
    projectRoot,
    "--scope-id",
    scopeId,
    "--require-execution",
    "--digest",
  ]);
  assert.equal(digest.status, 1);
  assert.match(digest.stdout, /Unverified by operation \(first\/last approval IDs\):/);
  assert.match(digest.stdout, /- chapter-revision: 1 \(EDIT-001 … EDIT-001\)/);
  assert.match(digest.stdout, /- prose: 1 \(EDIT-094 … EDIT-094\)/);
  assert.match(digest.stdout, /Navigation cache: not refreshed; earlier checks failed/);
  assert.equal(await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8"), "previous cache\n");

  const implicit = run(["--project-root", projectRoot, "--require-execution"]);
  assert.equal(implicit.status, 2);
  assert.match(implicit.stderr, /--require-execution requires --scope-id ID/);
});

test("preflight stops before status or digest when project validation fails", async (t) => {
  const { projectRoot, manifestPath } = await fixture(t);
  const previous = await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.current_scope.files[0].sha256 = "0".repeat(64);
  await writeFile(manifestPath, JSON.stringify(manifest));

  const result = run(["--project-root", projectRoot, "--digest", "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
  assert.equal(parsed.validation.valid, false);
  assert.equal(parsed.validation.checks.find((check) => check.path === "scope").valid, false);
  assert.equal(parsed.status, null);
  assert.equal(parsed.digest, null);
  assert.equal(await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8"), previous);
});

test("preflight diagnose returns recorded projection and backup-index differences without repairing state", async (t) => {
  const { projectRoot, manifestPath } = await fixture(t);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const trackerPath = path.join(projectRoot, manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(
    trackerPath,
    tracker.replace(
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|",
      `| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|\n| PLAN-001 | plan | revision-plan | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact test batch. | ${timestamp} |`,
    ),
  );
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  index.backups.push({
    backup_id: "backup-plan-001",
    approval_id: "PLAN-001",
    operation: "draft-baseline",
    scope_id: scopeId,
    input_hashes: { "manuscript/chapter-01.md": manifest.current_scope.files[0].sha256 },
    manifest_path: "backups/backup-plan-001/manifest.json",
  });
  await writeFile(indexPath, JSON.stringify(index));
  manifest.pending_action.artifacts = Array.from({ length: 115 }, (_, position) => `reports/structure/pending-${position}.md`);
  await writeFile(manifestPath, JSON.stringify(manifest));
  const before = await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8");

  const ordinary = run(["--project-root", projectRoot, "--json"]);
  assert.equal(ordinary.status, 1);
  assert.equal(JSON.parse(ordinary.stdout).diagnosis, null);
  assert.ok(JSON.parse(ordinary.stdout).validation.checks.every((check) => check.valid || !Object.hasOwn(check, "omitted_error_count")));
  assert.deepEqual(JSON.parse(ordinary.stdout).validation.checks.find((check) => check.path === "executions").summary.unverified, []);

  const ordinaryText = run(["--project-root", projectRoot]);
  assert.equal(ordinaryText.status, 1, ordinaryText.stderr);
  assert.equal(ordinaryText.stderr, "");
  assert.match(ordinaryText.stdout, /- executions: \/backups\/0\/scope_id backup operation and scope must match its approval/);
  assert.match(ordinaryText.stdout, /Execution evidence: 0\/0 verified; 0 unverified/);
  assert.match(ordinaryText.stdout, /Navigation cache: not requested/);
  assert.match(ordinaryText.stdout, /Preflight: failed/);
  assert.doesNotMatch(ordinaryText.stdout, /Cannot read properties of undefined/);

  const result = run(["--project-root", projectRoot, "--diagnose", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
  assert.equal(parsed.validation.valid, false);
  assert.equal(parsed.status, null);
  assert.equal(parsed.digest, null);
  assert.equal(parsed.diagnosis.read_only, true);
  assert.equal(parsed.diagnosis.projection.verification, "recorded_unverified");
  assert.equal(parsed.diagnosis.projection.current_scope.scope_id, scopeId);
  assert.equal(parsed.diagnosis.projection.current_scope.files[0].sha256, manifest.current_scope.files[0].sha256);
  assert.equal(parsed.diagnosis.projection.pending_action.artifacts.length, 2);
  assert.equal(parsed.diagnosis.projection.pending_action.artifact_count, 115);
  assert.deepEqual(parsed.diagnosis.backup_index.records[0].differences, [
    { field: "operation", backup: "draft-baseline", approval: "revision-plan" },
  ]);
  assert.equal(await readFile(path.join(projectRoot, "PROJECT_STATE.md"), "utf8"), before);
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).backups.at(-1).operation, "draft-baseline");

  const text = run(["--project-root", projectRoot, "--diagnose"]);
  assert.equal(text.status, 1, text.stderr);
  assert.match(text.stdout, /Recorded projection: unverified/);
  assert.match(text.stdout, /Pending artifacts: 115; 2 bounded pointers shown in --json/);
  assert.match(text.stdout, /backups\[0\] backup-plan-001 \/ PLAN-001: operation: backup=draft-baseline, approval=revision-plan/);
  assert.match(text.stdout, /Diagnosis: recorded state only; no repairs or writes performed/);
  assert.doesNotMatch(text.stdout, /pending-2\.md/);
  assert.ok(text.stdout.trimEnd().split("\n").length <= 24);

  const incompatible = run(["--project-root", projectRoot, "--diagnose", "--digest"]);
  assert.equal(incompatible.status, 2);
  assert.match(incompatible.stderr, /--diagnose cannot be combined with --digest/);
});

test("preflight diagnose bounds repeated errors and reports an unreadable pending artifact index", async (t) => {
  const { projectRoot, manifestPath } = await fixture(t);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const trackerPath = path.join(projectRoot, manifest.paths.audit_tracker);
  const approvalTable = "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|";
  const rows = Array.from({ length: 94 }, (_, position) =>
    `| EDIT-${String(position + 1).padStart(3, "0")} | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact test batch. | ${timestamp} |`,
  );
  await writeFile(trackerPath, (await readFile(trackerPath, "utf8")).replace(approvalTable, `${approvalTable}\n${rows.join("\n")}`));
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  index.backups = Array.from({ length: 14 }, (_, position) => ({
    backup_id: `backup-${position}`,
    approval_id: `MISSING-${String(position + 1).padStart(3, "0")}`,
    operation: "chapter-revision",
    scope_id: scopeId,
    input_hashes: {},
    manifest_path: `backups/backup-${position}/manifest.json`,
  }));
  await writeFile(indexPath, JSON.stringify(index));
  manifest.pending_action.artifacts = ["reports/structure/2026-01-17_structure.md"];
  manifest.pending_action.artifact_index = ".author-toolkit/pending-artifacts.json";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(path.join(projectRoot, ".author-toolkit", "pending-artifacts.json"), "{ invalid\n");

  const result = run(["--project-root", projectRoot, "--diagnose", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  const parsed = JSON.parse(result.stdout);
  const executions = parsed.validation.checks.find((check) => check.path === "executions");
  assert.equal(executions.errors.length, 12, "diagnostic JSON bounds displayed failure diagnostics");
  assert.equal(executions.omitted_error_count, 16);
  assert.equal(executions.summary.unverified_count, 94);
  assert.equal(executions.summary.unverified, undefined);
  const diagnosis = parsed.diagnosis;
  assert.equal(diagnosis.projection.pending_action.artifact_count, null);
  assert.match(diagnosis.projection.pending_action.artifact_count_error, /JSON|position|Unexpected/);
  assert.equal(diagnosis.projection.pending_action.artifacts.length, 1);
  assert.equal(diagnosis.backup_index.records.length, 12);
  assert.equal(diagnosis.backup_index.omitted_record_count, 2);

  const text = run(["--project-root", projectRoot, "--diagnose"]);
  assert.equal(text.status, 1, text.stderr);
  assert.match(text.stdout, /Execution evidence: 0\/94 verified; 94 unverified/);
  assert.match(text.stdout, /\.\.\. 16 more errors/);
  assert.match(text.stdout, /Pending artifacts: unavailable; 1 bounded pointers shown in --json/);
  assert.match(text.stdout, /2 more conflicting records/);
  assert.ok(text.stdout.trimEnd().split("\n").length <= 40);
});

test("preflight reports malformed manifests and argument errors", async (t) => {
  const { projectRoot, manifestPath } = await fixture(t);
  await writeFile(manifestPath, "{ invalid\n");
  const result = run(["--project-root", projectRoot, "--json"]);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.validation.checks.length, 1);
  assert.equal(parsed.validation.checks[0].path, "manifest");
  assert.equal(parsed.status, null);

  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--digest/);
  for (const args of [[], ["--unknown"], ["--project-root"], ["--project-root", projectRoot, "extra"]]) {
    const invalid = run(args);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stdout, /Usage:/);
  }
});
