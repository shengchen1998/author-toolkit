import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { exampleRoot, root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "setup-report.mjs");
const scopeId = "scope-example-revision";
const timestamp = "2026-11-18T00:00:00Z";

function run(args) {
  return spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: "utf8" });
}

function begin() {
  const result = run(["begin", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).report_store;
}

function capture(reportStore, kind, args, expectedStatus = 0) {
  const result = run(["capture", "--report-store", reportStore, "--kind", kind, "--", ...args]);
  assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}

async function fixture(t, { existing = false } = {}) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "setup-report-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  if (existing) await cp(exampleRoot("en"), projectRoot, { recursive: true });
  return { temporary, projectRoot };
}

function captureDoctor(reportStore) {
  return capture(reportStore, "doctor", ["--require-sibling", "author-project"]);
}

function captureEntriesAndCheck(reportStore, projectRoot, strict = false) {
  capture(reportStore, "entry-files", ["--project-root", projectRoot]);
  const scopeArgs = strict ? ["--scope-id", scopeId, "--require-execution"] : [];
  return capture(
    reportStore,
    "check",
    ["--project-root", projectRoot, "--diagnose", ...scopeArgs],
  );
}

function render(reportStore) {
  const result = run(["render", "--report-store", reportStore]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("setup report captures and renders a new project without resubmitting JSON", async (t) => {
  const { projectRoot } = await fixture(t);
  const reportStore = begin();
  const doctor = captureDoctor(reportStore);
  assert.equal(doctor.valid, true, doctor.failures);
  const scaffold = capture(reportStore, "scaffold", [
    "--project-root",
    projectRoot,
    "--language",
    "zh-CN",
    "--created-at",
    timestamp,
  ]);
  assert.equal(scaffold.valid, true);
  const check = captureEntriesAndCheck(reportStore, projectRoot);
  assert.equal(check.valid, true);

  const report = render(reportStore);
  for (const heading of ["Installation payload", "Project entry files", "Manuscript scope", "Execution evidence"]) {
    assert.match(report, new RegExp(`## ${heading}\n`));
  }
  assert.match(report, /Installation: passed\n- Project state: passed\n- Strategy gate: not requested/);
  assert.match(report, /Setup readiness: ready/);
  assert.match(report, /Language: zh-CN/);
  assert.match(report, /Current scope: none recorded/);
  assert.match(report, /Current scope hashes: not applicable/);
  assert.match(report, /Approval verification: 0\/0 execution receipts verified; 0 unverified approvals/);
  assert.match(report, /Operation-specific evidence: not evaluated/);
  assert.doesNotMatch(report, /\/write-fiction|\/revise-request/);
  await assert.rejects(readFile(reportStore, "utf8"), { code: "ENOENT" });
});

test("setup report renders an existing scope and omits a reusable cache detail", async (t) => {
  const { projectRoot } = await fixture(t, { existing: true });
  const reportStore = begin();
  captureDoctor(reportStore);
  const initialized = capture(reportStore, "initialize", ["--project-root", projectRoot]);
  assert.equal(initialized.projection.current_scope.scope_id, scopeId);
  capture(reportStore, "entry-files", ["--project-root", projectRoot]);
  const digest = spawnSync(process.execPath, [
    path.join(root, "scripts", "project-digest.mjs"),
    "--project-root",
    projectRoot,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(digest.status, 0, digest.stderr);
  const check = capture(reportStore, "check", [
    "--project-root",
    projectRoot,
    "--diagnose",
    "--scope-id",
    scopeId,
    "--require-execution",
  ]);
  assert.equal(check.valid, true);
  assert.equal(check.navigation_cache.reusable, true);

  const report = render(reportStore);
  assert.match(report, new RegExp(`Current scope: ${scopeId} \\(confirmed\\)`));
  assert.match(report, /Current scope hashes: recorded; validation: passed/);
  assert.match(report, /manuscript\/chapter-01\.md: [a-f\d]{64}/);
  assert.match(report, /Strategy gate: passed/);
  assert.doesNotMatch(report, /Navigation cache:/);
  assert.doesNotMatch(report, /recorded_unevaluated/);
});

test("setup report exposes a format-valid cache whose pending state is stale", async (t) => {
  const { projectRoot } = await fixture(t, { existing: true });
  const reportStore = begin();
  captureDoctor(reportStore);
  capture(reportStore, "initialize", ["--project-root", projectRoot]);
  capture(reportStore, "entry-files", ["--project-root", projectRoot]);
  const digest = spawnSync(process.execPath, [
    path.join(root, "scripts", "project-digest.mjs"),
    "--project-root",
    projectRoot,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(digest.status, 0, digest.stderr);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.pending_action.reason = "Current state changed after cache generation.";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const check = capture(reportStore, "check", [
    "--project-root",
    projectRoot,
    "--diagnose",
    "--scope-id",
    scopeId,
    "--require-execution",
  ]);
  assert.equal(check.valid, true);
  assert.equal(check.navigation_cache.format_valid, true);
  assert.equal(check.navigation_cache.reusable, false);

  const report = render(reportStore);
  assert.match(report, /Navigation cache: stale \(cache pending action differs from current manifest\); recorded next action withheld/);
  assert.match(report, /Recovery: run `check --digest` at the next strategy start; the cache refreshes only after validation passes/);
});

test("setup report preserves a failed strict gate and grouped unverified approvals", async (t) => {
  const { projectRoot } = await fixture(t, { existing: true });
  const manifest = JSON.parse(await readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"));
  const trackerPath = path.join(projectRoot, manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(
    trackerPath,
    tracker.replace(
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|",
      `| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|\n| EDIT-001 | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact test batch. | ${timestamp} |`,
    ),
  );
  const reportStore = begin();
  captureDoctor(reportStore);
  capture(reportStore, "initialize", ["--project-root", projectRoot]);
  capture(reportStore, "entry-files", ["--project-root", projectRoot]);
  const check = capture(reportStore, "check", [
    "--project-root",
    projectRoot,
    "--diagnose",
    "--scope-id",
    scopeId,
    "--require-execution",
  ], 1);
  assert.equal(check.setup.strategy_gate, "failed");

  const report = render(reportStore);
  assert.match(report, /Installation: passed\n- Project state: passed\n- Strategy gate: failed/);
  assert.match(report, /toolkit installed; evidence-dependent operations are blocked/);
  assert.match(report, /Approval verification: 0\/1 execution receipts verified; 1 unverified approvals/);
  assert.match(report, /chapter-revision: 1 \(EDIT-001 … EDIT-001\)/);
  assert.match(report, /Execution recovery audit: 0 reconcilable; 1 unsupported; read-only preview/);
  assert.match(report, /Current-draft revision convergence: not established/);
});

test("setup report renders recorded project failures without treating them as installation failures", async (t) => {
  const { projectRoot } = await fixture(t, { existing: true });
  await rm(path.join(projectRoot, "story-bible.md"));
  const reportStore = begin();
  captureDoctor(reportStore);
  const initialized = capture(reportStore, "initialize", ["--project-root", projectRoot], 3);
  assert.equal(initialized.schema_valid, true);
  assert.equal(initialized.valid, false);
  capture(reportStore, "entry-files", ["--project-root", projectRoot]);
  const check = capture(reportStore, "check", [
    "--project-root",
    projectRoot,
    "--diagnose",
    "--scope-id",
    scopeId,
    "--require-execution",
  ], 1);
  assert.equal(check.setup.project_state, "failed");
  assert.equal(check.setup.strategy_gate, "blocked_by_project_state");

  const report = render(reportStore);
  assert.match(report, /Installation: passed\n- Project state: failed\n- Strategy gate: blocked by project state/);
  assert.match(report, /toolkit installed; project-state operations are blocked/);
  assert.match(report, /Registered paths validation: failed/);
  assert.match(report, /story-bible\.md/);
  assert.match(report, /Current scope hashes: recorded; validation: passed/);
  assert.match(report, /Current hash verification: independently verified/);
  assert.match(report, /Approval verification: unavailable/);
  assert.doesNotMatch(report, /Setup readiness: ready/);
});

test("setup report validates arguments, preserves child argument errors, and bounds cleanup", async (t) => {
  const { temporary } = await fixture(t);
  for (const args of [[], ["begin", "--unknown"], ["capture"], ["render"], ["cleanup"]]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stdout, /Usage:/);
  }
  const unknown = run(["capture", "--report-store", "missing", "--kind", "unknown", "--"]);
  assert.equal(unknown.status, 2);

  const reportStore = begin();
  captureDoctor(reportStore);
  const duplicate = run([
    "capture",
    "--report-store",
    reportStore,
    "--kind",
    "doctor",
    "--",
    "--require-sibling",
    "author-project",
  ]);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already contains a doctor result/);
  assert.equal(duplicate.stdout, "");

  const invalidChild = run(["capture", "--report-store", reportStore, "--kind", "check", "--", "--unknown"]);
  assert.equal(invalidChild.status, 2);
  assert.match(invalidChild.stdout, /Usage:/);
  assert.match(invalidChild.stderr, /could not capture check/);
  assert.equal(run(["cleanup", "--report-store", reportStore]).status, 0);
  await assert.rejects(readFile(reportStore, "utf8"), { code: "ENOENT" });

  const ordinary = path.join(temporary, "report.json");
  await writeFile(ordinary, JSON.stringify({ schema_version: "1.0", report_id: "ordinary", results: {} }));
  const unsafe = run(["cleanup", "--report-store", ordinary]);
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /requires a store created by setup-report begin/);
  assert.equal(JSON.parse(await readFile(ordinary, "utf8")).report_id, "ordinary");
});
