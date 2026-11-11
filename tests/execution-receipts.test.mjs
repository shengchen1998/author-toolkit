import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { inspectExecutionReceipts } from "../scripts/lib/index.mjs";
import { clone, exampleRoot, root } from "./helpers.mjs";

const timestamp = "2026-11-09T00:00:00Z";
const targetScope = "scope-example-revision";
const approvalTable =
  "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n" +
  "|---|---|---|---|---|---|---|---|";
const inputHash = "a".repeat(64);
const outputHash = "b".repeat(64);

function approvalRow(id, type, operation, scopeId, path, status = "approved") {
  return `| ${id} | ${type} | ${operation} | ${scopeId} | \`${path}\` | ${status} | Exact test batch. | ${timestamp} |`;
}

function receipt(overrides = {}) {
  return {
    schema_version: "1.0.0",
    approval_id: "EDIT-001",
    operation: "chapter-revision",
    scope_id: targetScope,
    backup_ids: ["backup-edit-001"],
    files: [
      {
        path: "manuscript/chapter-01.md",
        action: "modify",
        input_sha256: inputHash,
        output_sha256: outputHash,
      },
    ],
    recorded_at: timestamp,
    ...overrides,
  };
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "execution-receipts-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  await cp(exampleRoot("en"), projectRoot, { recursive: true });

  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const trackerPath = path.join(projectRoot, manifest.paths.audit_tracker);
  const rows = [
    approvalRow("EDIT-001", "edit", "chapter-revision", targetScope, "manuscript/chapter-01.md"),
    approvalRow("EDIT-002", "edit", "prose", "scope-old", "manuscript/chapter-02.md"),
    approvalRow("EDIT-003", "edit", "prose", targetScope, "manuscript/chapter-03.md", "deferred"),
    approvalRow("RESTORE-001", "restore", "chapter-revision", targetScope, "manuscript/chapter-01.md"),
    approvalRow("PLAN-001", "plan", "revision-plan", targetScope, "manuscript/chapter-01.md"),
  ];
  const tracker = (await readFile(trackerPath, "utf8")).replace(
    approvalTable,
    `${approvalTable}\n${rows.join("\n")}`,
  );
  await writeFile(trackerPath, tracker, "utf8");

  const index = {
    schema_version: "1.0",
    backups: [
      {
        backup_id: "backup-edit-001",
        approval_id: "EDIT-001",
        input_hashes: { "manuscript/chapter-01.md": inputHash },
      },
      {
        backup_id: "backup-edit-002",
        approval_id: "EDIT-002",
        input_hashes: { "manuscript/chapter-02.md": inputHash },
      },
    ],
    restorations: [{ approval_id: "RESTORE-001", scope_id: targetScope }],
    executions: [receipt()],
  };
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  const saveIndex = async (value = index) => {
    await writeFile(indexPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  await saveIndex();
  return { manifest, manifestPath, index, indexPath, saveIndex, trackerPath };
}

function runCli(script, args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("execution receipts prove edit and restore completion within the selected scope", async (t) => {
  const project = await fixture(t);
  const global = await inspectExecutionReceipts(project.manifest, project.manifestPath);
  assert.equal(global.valid, true, global.errors.map((error) => error.message).join("; "));
  assert.equal(global.summary.required, 3);
  assert.equal(global.summary.executed, 2);
  assert.deepEqual(global.summary.unverified.map((approval) => approval.approval_id), ["EDIT-002"]);

  const scoped = await inspectExecutionReceipts(project.manifest, project.manifestPath, {
    scopeId: targetScope,
  });
  assert.equal(scoped.valid, true);
  assert.equal(scoped.summary.required, 2);
  assert.equal(scoped.summary.executed, 2);
  assert.equal(scoped.summary.unverified_count, 0);

  const historicalOutput = scoped.summary.executed;
  assert.equal(historicalOutput, 2, "receipt outputs are not compared with later manuscript text");
});

test("a legacy backup index is valid but its backups do not prove execution", async (t) => {
  const project = await fixture(t);
  delete project.index.executions;
  await project.saveIndex();

  const result = await inspectExecutionReceipts(project.manifest, project.manifestPath, {
    scopeId: targetScope,
  });
  assert.equal(result.valid, true);
  assert.equal(result.summary.executed, 1, "only the completed restoration is verified");
  assert.deepEqual(result.summary.unverified.map((approval) => approval.approval_id), ["EDIT-001"]);

  const validation = runCli("validate.mjs", ["--manifest", project.manifestPath]);
  assert.equal(validation.status, 0, validation.stderr);
  assert.match(validation.stdout, /5 checks, 0 failures/);
});

test("check-index explains backup and approval differences without writing state", async (t) => {
  const project = await fixture(t);
  project.index.backups.push({
    backup_id: "backup-plan-002",
    approval_id: "PLAN-001",
    operation: "draft-baseline",
    scope_id: targetScope,
    input_hashes: { "draft-baseline.md": inputHash },
  });
  await project.saveIndex();
  const before = await readFile(project.indexPath, "utf8");
  const trackerBefore = await readFile(project.trackerPath, "utf8");

  const result = runCli("writes.mjs", ["check-index", "--manifest", project.manifestPath, "--explain"]);
  assert.equal(result.status, 1, result.stderr);
  const explanation = JSON.parse(result.stdout);
  assert.equal(explanation.valid, false);
  assert.equal(explanation.read_only, true);
  assert.equal(explanation.records.length, 1);
  assert.equal(explanation.records[0].collection, "backups");
  assert.equal(explanation.records[0].index, 2);
  assert.equal(explanation.records[0].backup_id, "backup-plan-002");
  assert.equal(explanation.records[0].approval_id, "PLAN-001");
  assert.deepEqual(explanation.records[0].differences, [
    { field: "operation", backup: "draft-baseline", approval: "revision-plan" },
  ]);
  assert.equal(explanation.records[0].approval.type, "plan");
  assert.match(explanation.next_actions.join("\n"), /do not infer which recorded operation or scope is correct/);
  assert.match(explanation.next_actions.join("\n"), /does not repair backup identity mismatches/);
  assert.equal(await readFile(project.indexPath, "utf8"), before);
  assert.equal(await readFile(project.trackerPath, "utf8"), trackerBefore);

  const irrelevantTimestamp = runCli("writes.mjs", ["check-index", "--manifest", project.manifestPath, "--explain", "--recorded-at", timestamp]);
  assert.equal(irrelevantTimestamp.status, 1, "a diagnostic timestamp never repairs or hides the mismatch");
  for (const args of [
    ["check-index", "--manifest", project.manifestPath],
    ["check-index", "--manifest", project.manifestPath, "--explain", "--write"],
    ["record-backup", "--manifest", project.manifestPath, "--explain"],
  ]) {
    const invalid = runCli("writes.mjs", args);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stdout, /check-index --manifest FILE --explain/);
  }
});

test("check-index succeeds for valid legacy and current indexes without a write lock", async (t) => {
  const project = await fixture(t);
  for (const executions of [project.index.executions, undefined]) {
    if (executions) project.index.executions = executions;
    else delete project.index.executions;
    await project.saveIndex();
    const before = await readFile(project.indexPath, "utf8");
    const result = runCli("writes.mjs", ["check-index", "--manifest", project.manifestPath, "--explain"]);
    assert.equal(result.status, 0, result.stderr);
    const explanation = JSON.parse(result.stdout);
    assert.equal(explanation.valid, true);
    assert.deepEqual(explanation.records, []);
    assert.deepEqual(explanation.errors, []);
    assert.equal(await readFile(project.indexPath, "utf8"), before);
  }
});

test("receipt identity and backup references must match the approval", async (t) => {
  const project = await fixture(t);
  project.index.executions[0] = receipt({
    operation: "prose",
    scope_id: "scope-other",
    backup_ids: ["backup-missing"],
  });
  await project.saveIndex();

  const result = await inspectExecutionReceipts(project.manifest, project.manifestPath);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.instancePath.endsWith("/operation")));
  assert.ok(result.errors.some((error) => error.instancePath.endsWith("/scope_id")));
  assert.ok(result.errors.some((error) => error.message.includes("unknown backup ID")));

  project.index.executions[0] = receipt({ backup_ids: ["backup-edit-002"] });
  await project.saveIndex();
  const mismatchedBackup = await inspectExecutionReceipts(project.manifest, project.manifestPath);
  assert.ok(mismatchedBackup.errors.some((error) => error.message.includes("backup approval")));
});

test("receipt input hashes must match the cited pre-write backups", async (t) => {
  const project = await fixture(t);
  project.index.executions[0] = receipt({
    files: [
      {
        path: "manuscript/chapter-01.md",
        action: "modify",
        input_sha256: "c".repeat(64),
        output_sha256: outputHash,
      },
    ],
  });
  await project.saveIndex();

  const result = await inspectExecutionReceipts(project.manifest, project.manifestPath);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (error) => error.keyword === "execution-input" && error.message.includes("backup-edit-001"),
    ),
  );
});

test("receipt paths and per-action hashes are validated semantically", async (t) => {
  const project = await fixture(t);
  project.index.executions[0] = receipt({
    files: [
      {
        path: "manuscript/chapter-02.md",
        action: "modify",
        input_sha256: inputHash,
        output_sha256: null,
      },
    ],
  });
  await project.saveIndex();

  const result = await inspectExecutionReceipts(project.manifest, project.manifestPath);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("exactly match approval paths")));
  assert.ok(result.errors.some((error) => error.message.includes("requires its output hash")));

  project.index.executions[0] = receipt({ backup_ids: [] });
  await project.saveIndex();
  const missingBackup = await inspectExecutionReceipts(project.manifest, project.manifestPath);
  assert.ok(missingBackup.errors.some((error) => error.message.includes("at least one backup")));
});

test("duplicate and orphan execution records are rejected", async (t) => {
  const project = await fixture(t);
  project.index.executions.push(clone(project.index.executions[0]));
  project.index.restorations.push({ approval_id: "RESTORE-999", scope_id: targetScope });
  await project.saveIndex();

  const result = await inspectExecutionReceipts(project.manifest, project.manifestPath);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("duplicate execution receipt")));
  assert.ok(result.errors.some((error) => error.message.includes("unknown approval ID: RESTORE-999")));
});

test("status text groups unverified approvals while scoped JSON retains complete details", async (t) => {
  const project = await fixture(t);
  const extraRows = Array.from({ length: 10 }, (_, index) =>
    approvalRow(
      `EXTRA-${String(index + 1).padStart(3, "0")}`,
      "edit",
      `operation-${index}`,
      "scope-old",
      "manuscript/chapter-02.md",
    ),
  );
  const tracker = await readFile(project.trackerPath, "utf8");
  await writeFile(
    project.trackerPath,
    tracker.replace(approvalTable, `${approvalTable}\n${extraRows.join("\n")}`),
    "utf8",
  );

  const text = runCli("status.mjs", ["--manifest", project.manifestPath]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Unverified approvals: 11/);
  assert.match(text.stdout, /Unverified by operation \(first\/last approval IDs\):/);
  assert.match(text.stdout, /- operation-0: 1 \(EXTRA-001 … EXTRA-001\)/);
  assert.match(text.stdout, /- operation-7: 1 \(EXTRA-008 … EXTRA-008\)/);
  assert.doesNotMatch(text.stdout, /prose:/);
  assert.doesNotMatch(text.stdout, /operation-8:/);
  assert.match(text.stdout, /3 more operation groups; use --json/);
  assert.equal(text.stdout.trimEnd().split("\n").length, 18);

  const global = JSON.parse(runCli("status.mjs", ["--manifest", project.manifestPath, "--json"]).stdout);
  assert.equal(global.execution.unverified.length, 11);
  assert.equal(global.execution.unverified.at(-1).approval_id, "EDIT-002");
  assert.equal(global.execution.unverified_by_operation, undefined);

  const scoped = runCli("status.mjs", [
    "--manifest",
    project.manifestPath,
    "--scope-id",
    targetScope,
    "--json",
  ]);
  assert.equal(scoped.status, 0, scoped.stderr);
  const result = JSON.parse(scoped.stdout);
  assert.equal(result.execution.scope_id, targetScope);
  assert.equal(result.execution.required, 2);
  assert.equal(result.execution.executed, 2);
  assert.equal(result.execution.unverified_count, 0);
  assert.equal(result.recorded_blockers.stale_finding_count, 0);
  assert.equal(result.recorded_blockers.blocked_pending_action, null);
  assert.equal(result.evidence.operation_specific, "not_evaluated");
});

test("status operation summaries preserve interleaved first and last approval IDs", async (t) => {
  const project = await fixture(t);
  const groupedRows = [
    approvalRow("EDIT-094", "edit", "interleaved-test", targetScope, "manuscript/chapter-01.md"),
    approvalRow("EDIT-095", "edit", "single-test", targetScope, "manuscript/chapter-01.md"),
    approvalRow("EDIT-096", "edit", "interleaved-test", targetScope, "manuscript/chapter-01.md"),
  ];
  const groupedTracker = await readFile(project.trackerPath, "utf8");
  await writeFile(
    project.trackerPath,
    groupedTracker.replace(approvalTable, `${approvalTable}\n${groupedRows.join("\n")}`),
    "utf8",
  );
  const groupedText = runCli("status.mjs", ["--manifest", project.manifestPath]);
  assert.match(groupedText.stdout, /- interleaved-test: 2 \(EDIT-094 … EDIT-096\)/);
  assert.match(groupedText.stdout, /- single-test: 1 \(EDIT-095 … EDIT-095\)/);
});

test("status strict execution check preserves ordinary reads and selects the target scope", async (t) => {
  const project = await fixture(t);
  const manifest = ["--manifest", project.manifestPath];

  const passed = runCli("status.mjs", [
    ...manifest,
    "--scope-id",
    targetScope,
    "--require-execution",
  ]);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Execution evidence: 2\/2/);

  const failed = runCli("status.mjs", [
    ...manifest,
    "--scope-id",
    "scope-old",
    "--require-execution",
    "--json",
  ]);
  assert.equal(failed.status, 1);
  assert.equal(JSON.parse(failed.stdout).execution.unverified_count, 1);
  assert.match(failed.stderr, /Execution gate failed: 1 unverified approvals in scope scope-old/);

  const reviewPending = JSON.parse(await readFile(project.manifestPath, "utf8"));
  reviewPending.pending_action = {
    operation: "current-scope-review",
    status: "awaiting_author",
    scope_id: "scope-old",
    reason: "Recorded current-draft revision convergence statement awaiting strategy verification.",
    updated_at: timestamp,
  };
  await writeFile(project.manifestPath, `${JSON.stringify(reviewPending, null, 2)}\n`, "utf8");

  const ordinaryReview = runCli("status.mjs", [
    ...manifest,
    "--scope-id",
    "scope-old",
  ]);
  assert.equal(ordinaryReview.status, 0, ordinaryReview.stderr);
  assert.match(ordinaryReview.stdout, /current-scope-review \(awaiting_author; scope-old\)/);

  const strictReview = runCli("status.mjs", [
    ...manifest,
    "--scope-id",
    "scope-old",
    "--require-execution",
  ]);
  assert.equal(strictReview.status, 1);
  assert.match(strictReview.stderr, /Execution gate failed: 1 unverified approvals in scope scope-old/);

  const unrelatedScope = runCli("status.mjs", [
    ...manifest,
    "--scope-id",
    targetScope,
    "--require-execution",
  ]);
  assert.equal(unrelatedScope.status, 0, unrelatedScope.stderr);

  const missingScope = runCli("status.mjs", [...manifest, "--require-execution"]);
  assert.equal(missingScope.status, 2);
  assert.match(missingScope.stderr, /--require-execution requires --scope-id ID/);

  const ordinary = runCli("status.mjs", [...manifest, "--scope-id", "scope-old"]);
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.match(ordinary.stdout, /Unverified approvals: 1/);
});

test("status reports bounded recorded blockers without implying evidence completeness", async (t) => {
  const project = await fixture(t);
  const staleRows = Array.from({ length: 10 }, (_, index) =>
    `| STALE-${String(index + 1).padStart(3, "0")} | structure | story-structure-audit | \`manuscript/chapter-01.md\` | stale | \`reports/structure/2026-01-17_structure.md\` | ${timestamp} | ${`Stale reason ${index + 1}. ${"long ".repeat(100)}`} |`,
  );
  const tracker = await readFile(project.trackerPath, "utf8");
  await writeFile(
    project.trackerPath,
    tracker.replace("\n\n## Audit runs", `\n${staleRows.join("\n")}\n\n## Audit runs`),
    "utf8",
  );
  const manifest = clone(project.manifest);
  manifest.pending_action.status = "blocked";
  manifest.pending_action.scope_id = "scope-old";
  manifest.pending_action.reason = `Waiting for reconciliation. ${"long ".repeat(100)}`;
  await writeFile(project.manifestPath, JSON.stringify(manifest), "utf8");

  const text = runCli("status.mjs", ["--manifest", project.manifestPath]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Recorded stale findings \(all scopes\): 10/);
  assert.match(text.stdout, /2 more; use --json for the complete list/);
  assert.match(text.stdout, /Blocked pending action: structure \(scope-old\)/);
  assert.match(text.stdout, /Operation-specific evidence: not evaluated/);
  assert.match(text.stdout, /Navigation: use author-project status --digest and PROJECT_STATE\.md/);
  assert.ok(text.stdout.trimEnd().split("\n").length <= 20);
  assert.ok(text.stdout.split("\n").every((line) => [...line].length <= 400));

  const global = JSON.parse(runCli("status.mjs", ["--manifest", project.manifestPath, "--json"]).stdout);
  assert.equal(global.recorded_blockers.stale_findings.length, 10);
  assert.equal(global.recorded_blockers.blocked_pending_action.scope_id, "scope-old");
  assert.equal(global.evidence.operation_specific, "not_evaluated");

  const scoped = JSON.parse(
    runCli("status.mjs", ["--manifest", project.manifestPath, "--scope-id", targetScope, "--json"]).stdout,
  );
  assert.equal(scoped.recorded_blockers.stale_findings.length, 10);
  assert.equal(scoped.recorded_blockers.blocked_pending_action, null);
});
