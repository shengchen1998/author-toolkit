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

test("status text is bounded while scoped JSON retains the complete execution result", async (t) => {
  const project = await fixture(t);
  const extraRows = Array.from({ length: 10 }, (_, index) =>
    approvalRow(
      `EXTRA-${String(index + 1).padStart(3, "0")}`,
      "edit",
      "prose",
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
  assert.match(text.stdout, /3 more; use --json/);
  assert.equal(text.stdout.trimEnd().split("\n").length, 13);

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
});
