import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { exampleRoot, root } from "./helpers.mjs";

const scopeId = "scope-example-revision";
const timestamp = "2026-11-11T00:00:00Z";
const approvalTable = "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|";

function run(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "writes.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

async function fixture(t, { approvals = true } = {}) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "write-operations-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  await cp(exampleRoot("en"), projectRoot, { recursive: true });
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const trackerPath = path.join(projectRoot, manifest.paths.audit_tracker);
  const original = await readFile(path.join(projectRoot, "manuscript/chapter-01.md"));
  const { createHash } = await import("node:crypto");
  const inputHash = createHash("sha256").update(original).digest("hex");
  const output = "Revised text\n";
  const outputHash = createHash("sha256").update(output).digest("hex");
  if (approvals) {
    const tracker = await readFile(trackerPath, "utf8");
    const rows = [
      `| EDIT-001 | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact first batch. | ${timestamp} |`,
      `| EDIT-002 | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-02.md\` | approved | Exact second batch. | ${timestamp} |`,
    ];
    await writeFile(trackerPath, tracker.replace(approvalTable, `${approvalTable}\n${rows.join("\n")}`));
  }
  const evidencePath = path.join(projectRoot, "evidence.json");
  const evidence = {
    schema_version: "1.0.0",
    approval_id: "EDIT-001",
    operation: "chapter-revision",
    scope_id: scopeId,
    backup_ids: ["backup-edit-001"],
    files: [{ path: "manuscript/chapter-01.md", action: "modify", input_sha256: inputHash, output_sha256: outputHash }],
    completed_at: timestamp,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { projectRoot, manifestPath, manifest, evidencePath, evidence, inputHash, output, outputHash };
}

function backup(project, files, approvalId = "EDIT-001") {
  return run([
    "record-backup", "--manifest", project.manifestPath,
    "--operation", "chapter-revision", "--scope-id", scopeId,
    "--approval-id", approvalId, "--batch", files,
    "--recorded-at", timestamp,
  ]);
}

test("backup gate blocks legacy debt without changing the index, including create-only batches", async (t) => {
  const project = await fixture(t);
  const indexPath = path.join(project.projectRoot, project.manifest.paths.backups, "index.json");
  const before = await readFile(indexPath, "utf8");
  const batchPath = path.join(project.projectRoot, "batch.json");
  await writeFile(batchPath, JSON.stringify({ files: [{ path: "manuscript/chapter-01.md", action: "modify", input_sha256: project.inputHash }] }));
  const blocked = backup(project, batchPath);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /write gate closed: 1 unverified approvals/);
  assert.equal(await readFile(indexPath, "utf8"), before);

  const createPath = path.join(project.projectRoot, "create.json");
  await writeFile(createPath, JSON.stringify({ files: [{ path: "manuscript/new.md", action: "create", input_sha256: null }] }));
  const createBlocked = backup(project, createPath);
  assert.equal(createBlocked.status, 1);
  assert.equal(await readFile(indexPath, "utf8"), before);
  const ordinary = spawnSync(process.execPath, [path.join(root, "scripts/status.mjs"), "--manifest", project.manifestPath], { encoding: "utf8" });
  assert.equal(ordinary.status, 0, ordinary.stderr);
});

test("backup and execution form a fail-closed cycle with exact files and current hashes", async (t) => {
  const project = await fixture(t, { approvals: false });
  const trackerPath = path.join(project.projectRoot, project.manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(trackerPath, tracker.replace(approvalTable, `${approvalTable}\n| EDIT-001 | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact first batch. | ${timestamp} |`));
  const batchPath = path.join(project.projectRoot, "batch.json");
  await writeFile(batchPath, JSON.stringify({ files: [{ path: "manuscript/chapter-01.md", action: "modify", input_sha256: project.inputHash }] }));
  const recorded = backup(project, batchPath);
  assert.equal(recorded.status, 0, recorded.stderr);
  const { backup_id: backupId } = JSON.parse(recorded.stdout);
  const backupContents = await readFile(path.join(project.projectRoot, project.manifest.paths.backups, backupId, "manuscript/chapter-01.md"));
  assert.equal(backupContents.toString("utf8"), await readFile(path.join(project.projectRoot, "manuscript/chapter-01.md"), "utf8"));

  await writeFile(path.join(project.projectRoot, "manuscript/chapter-01.md"), project.output);
  project.evidence.backup_ids = [backupId];
  await writeFile(project.evidencePath, `${JSON.stringify(project.evidence, null, 2)}\n`);
  const executed = run(["record-execution", "--manifest", project.manifestPath, "--evidence", project.evidencePath, "--recorded-at", timestamp]);
  assert.equal(executed.status, 0, executed.stderr);
  assert.equal(JSON.parse(executed.stdout).unverified_count, 0);
  const validated = spawnSync(process.execPath, [path.join(root, "scripts/validate.mjs"), "--manifest", project.manifestPath], { encoding: "utf8" });
  assert.equal(validated.status, 1, "the test edit intentionally makes the recorded current scope stale");

  const duplicate = run(["record-execution", "--manifest", project.manifestPath, "--evidence", project.evidencePath]);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /duplicate execution receipt/);
  await writeFile(project.evidencePath, JSON.stringify({ ...project.evidence, completed_at: "2026-11-11T01:00:00Z" }));
  const tampered = spawnSync(process.execPath, [path.join(root, "scripts/validate.mjs"), "--manifest", project.manifestPath], { encoding: "utf8" });
  assert.match(tampered.stdout + tampered.stderr, /evidence hash does not match/);
});

test("backup rejects mismatched current hashes before writing a backup", async (t) => {
  const project = await fixture(t, { approvals: false });
  const trackerPath = path.join(project.projectRoot, project.manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(trackerPath, tracker.replace(approvalTable, `${approvalTable}\n| EDIT-001 | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact batch. | ${timestamp} |`));
  const batchPath = path.join(project.projectRoot, "batch.json");
  await writeFile(batchPath, JSON.stringify({ files: [{ path: "manuscript/chapter-01.md", action: "modify", input_sha256: "0".repeat(64) }] }));
  const result = backup(project, batchPath);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /input hash mismatch immediately before backup/);
  const index = JSON.parse(await readFile(path.join(project.projectRoot, project.manifest.paths.backups, "index.json"), "utf8"));
  assert.equal(index.backups.length, 0);
});

test("reconciliation previews valid evidence, preserves rejected approvals, and is idempotent", async (t) => {
  const project = await fixture(t);
  const indexPath = path.join(project.projectRoot, project.manifest.paths.backups, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  index.backups.push({ backup_id: "backup-edit-001", approval_id: "EDIT-001", input_hashes: { "manuscript/chapter-01.md": project.inputHash } });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  const invalidPath = path.join(project.projectRoot, "invalid.json");
  await writeFile(invalidPath, JSON.stringify({ ...project.evidence, output_sha256: "wrong" }));
  const before = await readFile(indexPath, "utf8");

  const preview = run(["reconcile-executions", "--manifest", project.manifestPath, "--evidence", project.evidencePath, "--evidence", invalidPath, "--recorded-at", timestamp]);
  assert.equal(preview.status, 0, preview.stderr);
  const previewResult = JSON.parse(preview.stdout);
  assert.equal(previewResult.dry_run, true);
  assert.deepEqual(previewResult.reconciled, ["EDIT-001"]);
  assert.equal(previewResult.rejected.length, 1);
  assert.equal(previewResult.unverified_count, 1);
  assert.equal(await readFile(indexPath, "utf8"), before);

  const committed = run(["reconcile-executions", "--manifest", project.manifestPath, "--evidence", project.evidencePath, "--evidence", invalidPath, "--write", "--recorded-at", timestamp]);
  assert.equal(committed.status, 0, committed.stderr);
  const saved = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(saved.executions.length, 1);
  assert.equal(saved.executions[0].approval_id, "EDIT-001");
  assert.ok(saved.executions[0].evidence.sha256);

  const repeated = run(["reconcile-executions", "--manifest", project.manifestPath, "--evidence", project.evidencePath, "--write"]);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(JSON.parse(repeated.stdout).already_recorded, ["EDIT-001"]);
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).executions.length, 1);

  const remaining = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(remaining.executions.some((receipt) => receipt.approval_id === "EDIT-002"), false);
  const status = spawnSync(process.execPath, [path.join(root, "scripts/status.mjs"), "--manifest", project.manifestPath, "--json"], { encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).execution.unverified.map((approval) => approval.approval_id), ["EDIT-002"]);
});

test("a create-only batch remains gated until its execution receipt clears its pending record", async (t) => {
  const project = await fixture(t, { approvals: false });
  const trackerPath = path.join(project.projectRoot, project.manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(trackerPath, tracker.replace(approvalTable, `${approvalTable}\n| CREATE-001 | edit | creation-commit | ${scopeId} | \`manuscript/new.md\` | approved | Exact create batch. | ${timestamp} |`));
  const batchPath = path.join(project.projectRoot, "create.json");
  await writeFile(batchPath, JSON.stringify({ files: [{ path: "manuscript/new.md", action: "create", input_sha256: null }] }));
  const created = run(["record-backup", "--manifest", project.manifestPath, "--operation", "creation-commit", "--scope-id", scopeId, "--approval-id", "CREATE-001", "--batch", batchPath, "--recorded-at", timestamp]);
  assert.equal(created.status, 0, created.stderr);
  const blocked = run(["record-backup", "--manifest", project.manifestPath, "--operation", "creation-commit", "--scope-id", scopeId, "--approval-id", "CREATE-001", "--batch", batchPath, "--backup-id", "other"]);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /write gate closed: 1 unverified approvals/);
  const indexPath = path.join(project.projectRoot, project.manifest.paths.backups, "index.json");
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).pending_backups.length, 1);
  const validated = spawnSync(process.execPath, [path.join(root, "scripts/validate.mjs"), "--manifest", project.manifestPath], { encoding: "utf8" });
  assert.equal(validated.status, 0, validated.stderr);
  await writeFile(path.join(project.projectRoot, "manuscript/new.md"), project.output);
  project.evidence.approval_id = "CREATE-001";
  project.evidence.operation = "creation-commit";
  project.evidence.backup_ids = [];
  project.evidence.files = [{ path: "manuscript/new.md", action: "create", input_sha256: null, output_sha256: project.outputHash }];
  await writeFile(project.evidencePath, `${JSON.stringify(project.evidence, null, 2)}\n`);
  const executed = run(["record-execution", "--manifest", project.manifestPath, "--evidence", project.evidencePath, "--recorded-at", timestamp]);
  assert.equal(executed.status, 0, executed.stderr);
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(index.pending_backups.length, 0);
  assert.equal(index.executions[0].approval_id, "CREATE-001");
});
