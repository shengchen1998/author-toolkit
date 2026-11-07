import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { recordBackup, recordRestore } from "../scripts/lib/index.mjs";
import { createNoEditEvidence } from "./convergence-helpers.mjs";
import { root } from "./helpers.mjs";

const packagedAssets = path.join(root, "skills", "setup-author-toolkit", "assets");

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function response(processResult, command) {
  const value = JSON.parse(processResult.stdout);
  assert.equal(value.response_contract_version, "1.0");
  assert.equal(value.command, command);
  assert.equal(typeof value.valid, "boolean");
  assert.ok(Object.hasOwn(value, "result"));
  assert.ok(Array.isArray(value.errors));
  return value;
}

async function installedProject(t, { withManuscript = true } = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-backup-commands-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const assets = path.join(temporary, "installed-skill", "assets");
  await cp(packagedAssets, assets, { recursive: true });
  const projectRoot = path.join(temporary, "writing-project");
  await mkdir(path.join(projectRoot, "manuscript"), { recursive: true });
  if (withManuscript) {
    await writeFile(
      path.join(projectRoot, "manuscript", "chapter-001.md"),
      "# Chapter One\n\nThe ferry leaves at dawn.\n",
      "utf8",
    );
  }
  const projectCli = path.join(assets, "runtime", "author-project.mjs");
  const validateCli = path.join(assets, "runtime", "validate.mjs");
  let sequence = 0;
  const project = {
    projectRoot,
    validateCli,
    manifestPath: path.join(projectRoot, ".author-toolkit", "project.json"),
    run(cli, args) {
      return spawnSync(process.execPath, [cli, ...args], {
        cwd: temporary,
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: "" },
      });
    },
    async command(command, input) {
      const inputPath = path.join(projectRoot, `${command}-${sequence++}.json`);
      await writeJson(inputPath, input);
      const processResult = this.run(projectCli, [
        command,
        "--project-root",
        projectRoot,
        "--input",
        inputPath,
      ]);
      return { processResult, value: response(processResult, command) };
    },
  };
  const initialized = project.run(projectCli, [
    "init",
    "--project-root",
    projectRoot,
    "--language",
    "en",
  ]);
  assert.equal(initialized.status, 0, `${initialized.stdout}\n${initialized.stderr}`);
  return project;
}

async function confirmCurrentScope(project) {
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  const proposed = await project.command("record-scope", {
    scope_id: "scope-draft-001",
    description: "The complete manuscript before the approved edit.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  assert.equal(proposed.processResult.status, 0, proposed.processResult.stdout);
  const confirmed = await project.command("record-scope", {
    ...proposed.value.result.current_scope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: manifest.updated_at,
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmed.processResult.status, 0, confirmed.processResult.stdout);
  return confirmed.value.result.current_scope;
}

async function recordEditApproval(project, scope, files) {
  const plan = { plan_id: "plan-001", path: "sessions/plan-001.md" };
  const batch = { batch_id: "batch-001", path: "sessions/batch-001.json" };
  await writeFile(path.join(project.projectRoot, plan.path), "# Approved revision plan\n", "utf8");
  await writeJson(path.join(project.projectRoot, batch.path), { batch_id: batch.batch_id });
  plan.sha256 = sha256(await readFile(path.join(project.projectRoot, plan.path)));
  batch.sha256 = sha256(await readFile(path.join(project.projectRoot, batch.path)));
  const recorded = await project.command("record-approval", {
    approval_id: "EDIT-001",
    type: "edit",
    operation: "chapter-revision",
    scope_id: scope.scope_id,
    paths: files.map((file) => file.path),
    files,
    status: "approved",
    reason: "Author approved the exact ordered edit batch.",
    revision: { plan, batch, scope_fingerprint: scope.scope_fingerprint },
  });
  assert.equal(recorded.processResult.status, 0, recorded.processResult.stdout);
  return { plan, batch };
}

test("record-backup preserves approved original bytes and create absence in a validated index", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const original = await readFile(
    path.join(project.projectRoot, "manuscript", "chapter-001.md"),
  );
  const output = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  const createdOutput = "# Chapter Two\n\nMara boards the ferry.\n";
  const files = [
    {
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
    },
    {
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: sha256(createdOutput),
    },
  ];
  await recordEditApproval(project, scope, files);
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");

  const recorded = await project.command("record-backup", {
    backup_id: "backup-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
    expected_index_sha256: sha256(await readFile(indexPath)),
  });

  assert.equal(recorded.processResult.status, 0, `${recorded.processResult.stdout}\n${recorded.processResult.stderr}`);
  assert.equal(recorded.value.valid, true);
  assert.equal(recorded.value.result.state_written, true);
  assert.equal(recorded.value.result.backup.backup_id, "backup-001");
  assert.equal(recorded.value.result.backup.approval_id, "EDIT-001");
  assert.equal(recorded.value.result.backup.files.length, 1);
  assert.equal(recorded.value.result.backup.files[0].sha256, files[0].input_sha256);
  const backupPath = path.join(
    project.projectRoot,
    ".author-toolkit",
    "backups",
    "backup-001",
    "manuscript",
    "chapter-001.md",
  );
  assert.deepEqual(await readFile(backupPath), original);
  await assert.rejects(readFile(path.join(
    project.projectRoot,
    ".author-toolkit",
    "backups",
    "backup-001",
    "manuscript",
    "chapter-002.md",
  )), { code: "ENOENT" });

  const manifest = JSON.parse(await readFile(path.join(
    project.projectRoot,
    recorded.value.result.backup.manifest.path,
  ), "utf8"));
  assert.equal(manifest.operation, "chapter-revision");
  assert.equal(manifest.scope_fingerprint, scope.scope_fingerprint);
  assert.deepEqual(manifest.files.map((file) => file.backup_path), [
    ".author-toolkit/backups/backup-001/manuscript/chapter-001.md",
    null,
  ]);
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(index.backups.length, 1);
  assert.equal(index.backups[0].backup_id, "backup-001");
  assert.deepEqual(index.backups[0].manifest, recorded.value.result.backup.manifest);
  assert.deepEqual(index.restorations, []);

  const validated = project.run(
    path.join(path.dirname(path.dirname(project.manifestPath)), "..", "installed-skill", "assets", "runtime", "validate.mjs"),
    ["--backup-index", indexPath],
  );
  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
  const response = JSON.parse(validated.stdout);
  assert.equal(response.valid, true);
  assert.equal(response.result.checks, 1);
  assert.deepEqual(response.errors, []);
});


test("record-restore uses independent approval and current safety backups before verified restoration", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
  const output = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  const createdOutput = "# Chapter Two\n\nMara boards the ferry.\n";
  const files = [
    {
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
    },
    {
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: sha256(createdOutput),
    },
  ];
  await recordEditApproval(project, scope, files);
  const backup = await project.command("record-backup", {
    backup_id: "backup-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
  });
  assert.equal(backup.processResult.status, 0, backup.processResult.stdout);
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-002.md"), createdOutput, "utf8");

  const proposed = await project.command("record-scope", {
    scope_id: "scope-edited-001",
    description: "The complete manuscript after the approved edit.",
    status: "proposed",
    files: ["manuscript/chapter-001.md", "manuscript/chapter-002.md"],
  });
  assert.equal(proposed.processResult.status, 0, proposed.processResult.stdout);
  const editedScope = proposed.value.result.current_scope;
  const confirmed = await project.command("record-scope", {
    ...editedScope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmed.processResult.status, 0, confirmed.processResult.stdout);
  const restoreFiles = [
    {
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: files[0].output_sha256,
      output_sha256: files[0].input_sha256,
    },
    {
      path: "manuscript/chapter-002.md",
      action: "delete",
      input_sha256: files[1].output_sha256,
      output_sha256: null,
    },
  ];
  const restoreApproval = await project.command("record-approval", {
    approval_id: "RESTORE-001",
    type: "restore",
    operation: "chapter-revision",
    scope_id: editedScope.scope_id,
    paths: restoreFiles.map((file) => file.path),
    files: restoreFiles,
    status: "approved",
    reason: "Author approved this exact restoration. restore_source=backup-001",
  });
  assert.equal(restoreApproval.processResult.status, 0, restoreApproval.processResult.stdout);
  const sourceManifestBefore = await readFile(path.join(
    project.projectRoot,
    backup.value.result.backup.manifest.path,
  ));

  const restored = await project.command("record-restore", {
    restoration_id: "restoration-001",
    source_backup_id: "backup-001",
    safety_backup_id: "safety-001",
    operation: "chapter-revision",
    approval_id: "RESTORE-001",
    scope_id: editedScope.scope_id,
    scope_fingerprint: editedScope.scope_fingerprint,
    files: restoreFiles,
    expected_index_sha256: sha256(await readFile(
      path.join(project.projectRoot, ".author-toolkit", "backups", "index.json"),
    )),
  });

  assert.equal(restored.processResult.status, 0, `${restored.processResult.stdout}\n${restored.processResult.stderr}`);
  assert.equal(restored.value.valid, true);
  assert.equal(restored.value.result.state_written, true);
  assert.equal(restored.value.result.evidence_invalidated, true);
  assert.equal(restored.value.result.validation.full_manuscript, false);
  assert.ok(restored.value.result.validation.blockers.length > 0);
  assert.deepEqual(
    await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md")),
    original,
  );
  await assert.rejects(readFile(path.join(project.projectRoot, "manuscript", "chapter-002.md")), {
    code: "ENOENT",
  });
  assert.equal(
    await readFile(path.join(
      project.projectRoot,
      ".author-toolkit",
      "backups",
      "safety-001",
      "manuscript",
      "chapter-001.md",
    ), "utf8"),
    output,
  );
  assert.equal(
    await readFile(path.join(
      project.projectRoot,
      ".author-toolkit",
      "backups",
      "safety-001",
      "manuscript",
      "chapter-002.md",
    ), "utf8"),
    createdOutput,
  );
  assert.deepEqual(
    await readFile(path.join(project.projectRoot, backup.value.result.backup.manifest.path)),
    sourceManifestBefore,
  );
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(index.backups.length, 2);
  assert.equal(index.restorations.length, 1);
  assert.equal(index.restorations[0].source.type, "backup");
  assert.equal(index.restorations[0].source.backup_id, "backup-001");
  assert.equal(index.restorations[0].safety_backup_id, "safety-001");
  assert.equal(index.restorations[0].approval_id, "RESTORE-001");
  const validatedIndex = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(validatedIndex.status, 0, `${validatedIndex.stdout}\n${validatedIndex.stderr}`);
  const validIndexText = await readFile(indexPath, "utf8");
  const mismatchedRestoration = JSON.parse(validIndexText);
  mismatchedRestoration.restorations[0].files[0].output_sha256 = "0".repeat(64);
  await writeJson(indexPath, mismatchedRestoration);
  const invalidRestoration = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(invalidRestoration.status, 1, `${invalidRestoration.stdout}\n${invalidRestoration.stderr}`);
  assert.match(invalidRestoration.stdout, /restoration|inverse|safety/i);
  await writeFile(indexPath, validIndexText, "utf8");

  const restoredScope = await project.command("record-scope", {
    scope_id: "scope-restored-001",
    description: "The complete restored manuscript, pending author confirmation.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  assert.equal(restoredScope.processResult.status, 0, restoredScope.processResult.stdout);
  const confirmedRestoredScope = await project.command("record-scope", {
    ...restoredScope.value.result.current_scope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-003",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmedRestoredScope.processResult.status, 0, confirmedRestoredScope.processResult.stdout);
  const validatedProject = project.run(project.validateCli, ["--project-root", project.projectRoot]);
  assert.equal(validatedProject.status, 0, `${validatedProject.stdout}\n${validatedProject.stderr}`);
});


test("revision preparation consumes indexed backup evidence and verification still checks actual outputs", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
  const output = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(original),
    output_sha256: sha256(output),
  }];
  const { plan, batch } = await recordEditApproval(project, scope, files);
  const planApproval = await project.command("record-approval", {
    approval_id: "PLAN-001",
    type: "revision-plan",
    operation: "revision-plan",
    scope_id: scope.scope_id,
    paths: files.map((file) => file.path),
    files,
    status: "approved",
    reason: "Author approved the exact revision plan and batch.",
    revision: { plan, batch, scope_fingerprint: scope.scope_fingerprint },
  });
  assert.equal(planApproval.processResult.status, 0, planApproval.processResult.stdout);
  const backup = await project.command("record-backup", {
    backup_id: "backup-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
  });
  assert.equal(backup.processResult.status, 0, backup.processResult.stdout);
  const evidence = await createNoEditEvidence(project.projectRoot, { passId: "pass-001" });
  const execution = {
    execution_id: "execution-001",
    plan,
    batch,
    requested_pass: evidence.passReference,
    input_scope: evidence.scopeReference,
    finding_dispositions: [],
    author_decision_ids: ["PLAN-001"],
    approval_ids: ["EDIT-001"],
    backups: [backup.value.result.backup],
    files,
  };
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
  const indexBefore = await readFile(indexPath, "utf8");
  const alteredIndex = JSON.parse(indexBefore);
  alteredIndex.backups[0].manifest.sha256 = "0".repeat(64);
  await writeJson(indexPath, alteredIndex);

  const dangling = await project.command("prepare-draft-revision-execution", execution);
  assert.equal(dangling.processResult.status, 1, `${dangling.processResult.stdout}\n${dangling.processResult.stderr}`);
  assert.equal(dangling.value.result.state_written, false);
  assert.match(dangling.value.errors[0].message, /backup index|backup manifest/i);
  await writeFile(indexPath, indexBefore, "utf8");

  const prepared = await project.command("prepare-draft-revision-execution", execution);
  assert.equal(prepared.processResult.status, 0, `${prepared.processResult.stdout}\n${prepared.processResult.stderr}`);
  assert.equal(prepared.value.result.execution.status, "prepared");
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  const proposedTarget = await project.command("record-scope", {
    scope_id: scope.scope_id,
    description: "The complete manuscript after the approved output.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  assert.equal(proposedTarget.processResult.status, 0, proposedTarget.processResult.stdout);
  const targetScope = proposedTarget.value.result.current_scope;
  const confirmedTarget = await project.command("record-scope", {
    ...targetScope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmedTarget.processResult.status, 0, confirmedTarget.processResult.stdout);
  const targetEvidence = await createNoEditEvidence(project.projectRoot, {
    passId: "pass-002",
    baselinePass: evidence.passReference,
    noEditDecisionId: "NOEDIT-002",
  });
  await writeFile(
    path.join(project.projectRoot, "manuscript", "chapter-001.md"),
    "tampered output\n",
    "utf8",
  );
  const verification = {
    execution_id: execution.execution_id,
    requested_pass: targetEvidence.passReference,
    target_scope: targetEvidence.scopeReference,
  };
  const tampered = await project.command("verify-draft-revision-execution", verification);
  assert.equal(tampered.processResult.status, 1, `${tampered.processResult.stdout}\n${tampered.processResult.stderr}`);
  assert.match(tampered.value.errors[0].message, /Current output hash differs|output/i);

  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  const verified = await project.command("verify-draft-revision-execution", verification);
  assert.equal(verified.processResult.status, 0, `${verified.processResult.stdout}\n${verified.processResult.stderr}`);
  assert.equal(verified.value.result.execution.status, "verified");
  const validatedIndex = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(validatedIndex.status, 0, `${validatedIndex.stdout}\n${validatedIndex.stderr}`);
});


test("record-restore resumes an exact post-output interruption without rewriting recovery evidence", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
  const output = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(original),
    output_sha256: sha256(output),
  }];
  await recordEditApproval(project, scope, files);
  const backup = await project.command("record-backup", {
    backup_id: "backup-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
  });
  assert.equal(backup.processResult.status, 0, backup.processResult.stdout);
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  const proposed = await project.command("record-scope", {
    scope_id: "scope-edited-001",
    description: "The complete manuscript after the approved edit.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  const editedScope = proposed.value.result.current_scope;
  const confirmed = await project.command("record-scope", {
    ...editedScope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmed.processResult.status, 0, confirmed.processResult.stdout);
  const restoreFiles = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: files[0].output_sha256,
    output_sha256: files[0].input_sha256,
  }];
  const approval = await project.command("record-approval", {
    approval_id: "RESTORE-001",
    type: "restore",
    operation: "chapter-revision",
    scope_id: editedScope.scope_id,
    paths: restoreFiles.map((file) => file.path),
    files: restoreFiles,
    status: "approved",
    reason: "Author approved this exact restoration. restore_source=backup-001",
  });
  assert.equal(approval.processResult.status, 0, approval.processResult.stdout);
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
  const request = {
    restoration_id: "restoration-001",
    source_backup_id: "backup-001",
    safety_backup_id: "safety-001",
    operation: "chapter-revision",
    approval_id: "RESTORE-001",
    scope_id: editedScope.scope_id,
    scope_fingerprint: editedScope.scope_fingerprint,
    files: restoreFiles,
    expected_index_sha256: sha256(await readFile(indexPath)),
  };
  const sourceManifestBefore = await readFile(path.join(
    project.projectRoot,
    backup.value.result.backup.manifest.path,
  ));
  const interrupted = await recordRestore(project.projectRoot, request, {
    checkpoint(point) {
      if (point === "manuscript-restored") throw new Error("Simulated post-output interruption");
    },
  });
  assert.equal(interrupted.valid, false);
  assert.equal(interrupted.state_written, true);
  assert.equal(interrupted.recovery.manuscript_restored, true);
  assert.equal(interrupted.recovery.index_updated, false);
  assert.deepEqual(JSON.parse(await readFile(indexPath, "utf8")).restorations, []);
  const safetyManifestBefore = await readFile(path.join(
    project.projectRoot,
    ".author-toolkit",
    "backups",
    "safety-001",
    "manifest.json",
  ));

  const recovered = await recordRestore(project.projectRoot, request);
  assert.equal(recovered.valid, true, JSON.stringify(recovered));
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.state_written, true);
  assert.equal(recovered.restoration.restoration_id, "restoration-001");
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).restorations.length, 1);
  assert.deepEqual(
    await readFile(path.join(project.projectRoot, ".author-toolkit", "backups", "safety-001", "manifest.json")),
    safetyManifestBefore,
  );
  assert.deepEqual(
    await readFile(path.join(project.projectRoot, backup.value.result.backup.manifest.path)),
    sourceManifestBefore,
  );
  const validated = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
});


test("record-backup blocks changed inputs and validation rejects altered bytes and dangling manifests", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const manuscriptPath = path.join(project.projectRoot, "manuscript", "chapter-001.md");
  const original = await readFile(manuscriptPath);
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(original),
    output_sha256: sha256("# Chapter One\n\nThe ferry leaves at dusk.\n"),
  }];
  await recordEditApproval(project, scope, files);
  const request = {
    backup_id: "backup-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
  };
  await writeFile(manuscriptPath, "changed before backup\n", "utf8");
  const changed = await project.command("record-backup", request);
  assert.equal(changed.processResult.status, 1, changed.processResult.stdout);
  assert.equal(changed.value.errors[0].code, "backup-scope-not-current");
  assert.equal(changed.value.result.state_written, false);
  assert.deepEqual(JSON.parse(await readFile(
    path.join(project.projectRoot, ".author-toolkit", "backups", "index.json"),
    "utf8",
  )).backups, []);

  await writeFile(manuscriptPath, original);
  const recorded = await project.command("record-backup", request);
  assert.equal(recorded.processResult.status, 0, recorded.processResult.stdout);
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
  const validIndex = await readFile(indexPath, "utf8");
  const backupPath = path.join(project.projectRoot, recorded.value.result.backup.files[0].backup_path);
  const validBytes = await readFile(backupPath);
  await writeFile(backupPath, "altered recovery bytes\n", "utf8");
  const altered = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(altered.status, 1, `${altered.stdout}\n${altered.stderr}`);
  assert.match(altered.stdout, /backup bytes|input hash|hash/i);
  await writeFile(backupPath, validBytes);

  const danglingIndex = JSON.parse(validIndex);
  danglingIndex.backups[0].manifest.path = ".author-toolkit/backups/missing/manifest.json";
  await writeJson(indexPath, danglingIndex);
  const dangling = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(dangling.status, 1, `${dangling.stdout}\n${dangling.stderr}`);
  assert.match(dangling.stdout, /manifest path|backup manifest/i);
  await writeFile(indexPath, validIndex, "utf8");
  const valid = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
});

test("record-backup resumes interrupted publication and lock contention prevents state writes", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(original),
    output_sha256: sha256("# Chapter One\n\nThe ferry leaves at dusk.\n"),
  }];
  await recordEditApproval(project, scope, files);
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
  const request = {
    backup_id: "backup-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
    expected_index_sha256: sha256(await readFile(indexPath)),
  };
  const interrupted = await recordBackup(project.projectRoot, request, {
    checkpoint(point) {
      if (point === "manifest-published") throw new Error("Simulated backup publication interruption");
    },
  });
  assert.equal(interrupted.valid, false);
  assert.equal(interrupted.state_written, true);
  assert.equal(interrupted.recovery.manifest_published, true);
  assert.equal(interrupted.recovery.index_updated, false);
  assert.deepEqual(JSON.parse(await readFile(indexPath, "utf8")).backups, []);

  const recovered = await recordBackup(project.projectRoot, request);
  assert.equal(recovered.valid, true, JSON.stringify(recovered));
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).backups.length, 1);
  const lockDirectory = path.join(
    project.projectRoot,
    ".author-toolkit",
    "convergence",
    "active-cycle.lock",
  );
  await mkdir(lockDirectory, { recursive: true });
  await writeJson(path.join(lockDirectory, "owner.json"), {
    pid: process.pid,
    token: "held-by-test",
    acquired_at: new Date().toISOString(),
  });
  const contended = await recordBackup(project.projectRoot, {
    ...request,
    backup_id: "backup-002",
    expected_index_sha256: sha256(await readFile(indexPath)),
  }, { lockTimeoutMs: 20, lockRetryMs: 1 });
  assert.equal(contended.valid, false);
  assert.equal(contended.state_written, false);
  assert.equal(contended.blockers[0].code, "project-lock-timeout");
  assert.equal(JSON.parse(await readFile(indexPath, "utf8")).backups.length, 1);
  await rm(lockDirectory, { recursive: true, force: true });
});


test("record-restore recreates original deletions and preserves reorder inputs with null safety absence", async (t) => {
  const project = await installedProject(t);
  const chapterOne = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
  const chapterTwo = "# Chapter Two\n\nThe letter is missing.\n";
  const chapterThree = "# Chapter Three\n\nMara finds the platform.\n";
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-002.md"), chapterTwo, "utf8");
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-003.md"), chapterThree, "utf8");
  const proposed = await project.command("record-scope", {
    scope_id: "scope-draft-001",
    description: "The complete manuscript before deletion and reordering.",
    status: "proposed",
    files: [
      "manuscript/chapter-001.md",
      "manuscript/chapter-003.md",
      "manuscript/chapter-002.md",
    ],
  });
  const initialScope = proposed.value.result.current_scope;
  const confirmed = await project.command("record-scope", {
    ...initialScope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmed.processResult.status, 0, confirmed.processResult.stdout);
  const files = [
    {
      path: "manuscript/chapter-001.md",
      action: "reorder",
      input_sha256: sha256(chapterOne),
      output_sha256: sha256(chapterOne),
    },
    {
      path: "manuscript/chapter-003.md",
      action: "reorder",
      input_sha256: sha256(chapterThree),
      output_sha256: sha256(chapterThree),
    },
    {
      path: "manuscript/chapter-002.md",
      action: "delete",
      input_sha256: sha256(chapterTwo),
      output_sha256: null,
    },
  ];
  await recordEditApproval(project, initialScope, files);
  const backup = await project.command("record-backup", {
    backup_id: "backup-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: initialScope.scope_id,
    scope_fingerprint: initialScope.scope_fingerprint,
    files,
  });
  assert.equal(backup.processResult.status, 0, backup.processResult.stdout);
  await rm(path.join(project.projectRoot, "manuscript", "chapter-002.md"));
  const editedProposal = await project.command("record-scope", {
    scope_id: "scope-edited-001",
    description: "The complete manuscript after deletion and reordering.",
    status: "proposed",
    files: ["manuscript/chapter-003.md", "manuscript/chapter-001.md"],
  });
  const editedScope = editedProposal.value.result.current_scope;
  const editedConfirmation = await project.command("record-scope", {
    ...editedScope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(editedConfirmation.processResult.status, 0, editedConfirmation.processResult.stdout);
  const restoreFiles = [
    files[0],
    files[1],
    {
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: files[2].input_sha256,
    },
  ];
  const restoreApproval = await project.command("record-approval", {
    approval_id: "RESTORE-001",
    type: "restore",
    operation: "chapter-revision",
    scope_id: editedScope.scope_id,
    paths: restoreFiles.map((file) => file.path),
    files: restoreFiles,
    status: "approved",
    reason: "Author approved this exact restoration. restore_source=backup-001",
  });
  assert.equal(restoreApproval.processResult.status, 0, restoreApproval.processResult.stdout);

  const restored = await project.command("record-restore", {
    restoration_id: "restoration-001",
    source_backup_id: "backup-001",
    safety_backup_id: "safety-001",
    operation: "chapter-revision",
    approval_id: "RESTORE-001",
    scope_id: editedScope.scope_id,
    scope_fingerprint: editedScope.scope_fingerprint,
    files: restoreFiles,
  });
  assert.equal(restored.processResult.status, 0, `${restored.processResult.stdout}\n${restored.processResult.stderr}`);
  assert.equal(
    await readFile(path.join(project.projectRoot, "manuscript", "chapter-002.md"), "utf8"),
    chapterTwo,
  );
  assert.deepEqual(
    await readFile(path.join(
      project.projectRoot,
      ".author-toolkit",
      "backups",
      "safety-001",
      "manuscript",
      "chapter-001.md",
    )),
    chapterOne,
  );
  await assert.rejects(readFile(path.join(
    project.projectRoot,
    ".author-toolkit",
    "backups",
    "safety-001",
    "manuscript",
    "chapter-002.md",
  )), { code: "ENOENT" });
  const index = JSON.parse(await readFile(
    path.join(project.projectRoot, ".author-toolkit", "backups", "index.json"),
    "utf8",
  ));
  assert.equal(index.restorations[0].files[2].action, "create");
  assert.equal(index.restorations[0].files[2].input_sha256, null);
  assert.equal(index.restorations[0].files[2].backup_path, null);
  const validated = project.run(project.validateCli, [
    "--backup-index",
    path.join(project.projectRoot, ".author-toolkit", "backups", "index.json"),
  ]);
  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
});


test("record-backup accepts exact creation-manuscript approval for a creation commit", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
  const output = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  const created = "# Chapter Two\n\nMara boards the ferry.\n";
  const files = [
    {
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
    },
    {
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: sha256(created),
    },
  ];
  const publicationFingerprint = sha256(JSON.stringify({
    files: [
      { path: files[0].path, sha256: files[0].output_sha256 },
      { path: files[1].path, sha256: files[1].output_sha256 },
    ],
    excluded_files: [],
  }));
  const dependencyFingerprint = sha256(JSON.stringify({
    plan: "Revise chapter one and create chapter two.",
    context: [],
    files: files.map(({ path: filePath, action, input_sha256 }) => ({
      path: filePath,
      action,
      input_sha256,
    })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  }));
  const approval = await project.command("record-approval", {
    approval_id: "CREATE-001",
    type: "creation-manuscript",
    operation: "chapter-review",
    scope_id: scope.scope_id,
    paths: files.map((file) => file.path),
    files,
    status: "approved",
    reason: [
      "Author accepted the exact creation batch.",
      "batch_id=batch-001",
      `dependency_fingerprint=${dependencyFingerprint}`,
      `scope_fingerprint=${publicationFingerprint}`,
    ].join(" "),
  });
  assert.equal(approval.processResult.status, 0, approval.processResult.stdout);

  const recorded = await project.command("record-backup", {
    backup_id: "backup-creation-001",
    operation: "creation-commit",
    approval_id: "CREATE-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
  });
  assert.equal(recorded.processResult.status, 0, `${recorded.processResult.stdout}\n${recorded.processResult.stderr}`);
  assert.equal(recorded.value.valid, true);
  assert.equal(recorded.value.result.backup.files.length, 1);
  const manifest = JSON.parse(await readFile(path.join(
    project.projectRoot,
    recorded.value.result.backup.manifest.path,
  ), "utf8"));
  assert.equal(manifest.operation, "creation-commit");
  assert.equal(manifest.approval_id, "CREATE-001");
  assert.equal(manifest.files[1].input_sha256, null);
  assert.equal(manifest.files[1].backup_path, null);
  const validated = project.run(project.validateCli, [
    "--backup-index",
    path.join(project.projectRoot, ".author-toolkit", "backups", "index.json"),
  ]);
  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
});


test("record-restore resolves a creation commit and preserves its journal as immutable history", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmCurrentScope(project);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
  const output = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  const created = "# Chapter Two\n\nMara boards the ferry.\n";
  const files = [
    {
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
    },
    {
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: sha256(created),
    },
  ];
  const publicationFingerprint = sha256(JSON.stringify({
    files: [
      { path: files[0].path, sha256: files[0].output_sha256 },
      { path: files[1].path, sha256: files[1].output_sha256 },
    ],
    excluded_files: [],
  }));
  const dependencyFingerprint = sha256(JSON.stringify({
    plan: "Revise chapter one and create chapter two.",
    context: [],
    files: files.map(({ path: filePath, action, input_sha256 }) => ({
      path: filePath,
      action,
      input_sha256,
    })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  }));
  const creationApproval = await project.command("record-approval", {
    approval_id: "CREATE-001",
    type: "creation-manuscript",
    operation: "chapter-review",
    scope_id: scope.scope_id,
    paths: files.map((file) => file.path),
    files,
    status: "approved",
    reason: [
      "Author accepted the exact creation batch.",
      "batch_id=batch-001",
      `dependency_fingerprint=${dependencyFingerprint}`,
      `scope_fingerprint=${publicationFingerprint}`,
    ].join(" "),
  });
  assert.equal(creationApproval.processResult.status, 0, creationApproval.processResult.stdout);
  const backup = await project.command("record-backup", {
    backup_id: "backup-creation-001",
    operation: "creation-commit",
    approval_id: "CREATE-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files,
  });
  assert.equal(backup.processResult.status, 0, backup.processResult.stdout);
  const now = new Date().toISOString();
  const commit = {
    schema_version: "1.0.0",
    batch_id: "batch-001",
    commit_id: "commit-001",
    status: "committed",
    scope_before_id: scope.scope_id,
    scope_after_id: "scope-edited-001",
    files: files.map((file) => ({
      ...file,
      backup_id: file.action === "create" ? null : "backup-creation-001",
      status: "verified",
    })),
    created_at: now,
    updated_at: now,
  };
  const commitPath = ".author-toolkit/creation/batches/commit-001.json";
  await writeJson(path.join(project.projectRoot, commitPath), commit);
  const commitSha256 = sha256(await readFile(path.join(project.projectRoot, commitPath)));
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-002.md"), created, "utf8");
  const proposed = await project.command("record-scope", {
    scope_id: "scope-edited-001",
    description: "The complete manuscript after the creation commit.",
    status: "proposed",
    files: ["manuscript/chapter-001.md", "manuscript/chapter-002.md"],
  });
  const editedScope = proposed.value.result.current_scope;
  const confirmed = await project.command("record-scope", {
    ...editedScope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmed.processResult.status, 0, confirmed.processResult.stdout);
  const restoreFiles = [
    {
      path: files[0].path,
      action: "modify",
      input_sha256: files[0].output_sha256,
      output_sha256: files[0].input_sha256,
    },
    {
      path: files[1].path,
      action: "delete",
      input_sha256: files[1].output_sha256,
      output_sha256: null,
    },
  ];
  const restoreApproval = await project.command("record-approval", {
    approval_id: "RESTORE-001",
    type: "restore",
    operation: "creation-commit",
    scope_id: editedScope.scope_id,
    paths: restoreFiles.map((file) => file.path),
    files: restoreFiles,
    status: "approved",
    reason: "Author approved this exact creation restoration. restore_source=commit-001",
  });
  assert.equal(restoreApproval.processResult.status, 0, restoreApproval.processResult.stdout);

  const restored = await project.command("record-restore", {
    restoration_id: "restoration-001",
    source_commit: { commit_id: "commit-001", path: commitPath, sha256: commitSha256 },
    safety_backup_id: "safety-001",
    operation: "creation-commit",
    approval_id: "RESTORE-001",
    scope_id: editedScope.scope_id,
    scope_fingerprint: editedScope.scope_fingerprint,
    files: restoreFiles,
  });
  assert.equal(restored.processResult.status, 0, `${restored.processResult.stdout}\n${restored.processResult.stderr}`);
  assert.equal(restored.value.valid, true);
  assert.deepEqual(
    await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md")),
    original,
  );
  await assert.rejects(readFile(path.join(project.projectRoot, "manuscript", "chapter-002.md")), {
    code: "ENOENT",
  });
  assert.deepEqual(JSON.parse(await readFile(path.join(project.projectRoot, commitPath), "utf8")), commit);
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(index.restorations[0].source.type, "commit");
  assert.equal(index.restorations[0].source.commit_id, "commit-001");
  assert.deepEqual(index.restorations[0].source.manifest, { path: commitPath, sha256: commitSha256 });
  const validated = project.run(project.validateCli, ["--backup-index", indexPath]);
  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
});


test("record-backup permits pure-create bootstrap with a null input scope and real empty inventory", async (t) => {
  const project = await installedProject(t, { withManuscript: false });
  const output = "# Chapter One\n\nThe ferry leaves at dawn.\n";
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "create",
    input_sha256: null,
    output_sha256: sha256(output),
  }];
  const publicationFingerprint = sha256(JSON.stringify({
    files: [{ path: files[0].path, sha256: files[0].output_sha256 }],
    excluded_files: [],
  }));
  const dependencyFingerprint = sha256(JSON.stringify({
    plan: "Create the first chapter.",
    context: [],
    files: [{ path: files[0].path, action: "create", input_sha256: null }],
  }));
  const approval = await project.command("record-approval", {
    approval_id: "CREATE-001",
    type: "creation-manuscript",
    operation: "chapter-review",
    scope_id: "scope-first-001",
    paths: files.map((file) => file.path),
    files,
    status: "approved",
    reason: [
      "Author accepted the first creation batch.",
      "batch_id=batch-001",
      `dependency_fingerprint=${dependencyFingerprint}`,
      `scope_fingerprint=${publicationFingerprint}`,
    ].join(" "),
  });
  assert.equal(approval.processResult.status, 0, approval.processResult.stdout);

  const recorded = await project.command("record-backup", {
    backup_id: "backup-bootstrap-001",
    operation: "creation-commit",
    approval_id: "CREATE-001",
    scope_id: null,
    scope_fingerprint: null,
    files,
  });
  assert.equal(recorded.processResult.status, 0, `${recorded.processResult.stdout}\n${recorded.processResult.stderr}`);
  assert.equal(recorded.value.valid, true);
  assert.deepEqual(recorded.value.result.backup.files, []);
  const manifest = JSON.parse(await readFile(path.join(
    project.projectRoot,
    recorded.value.result.backup.manifest.path,
  ), "utf8"));
  assert.equal(manifest.scope_id, null);
  assert.equal(manifest.scope_fingerprint, null);
  assert.equal(manifest.files[0].input_sha256, null);
  assert.equal(manifest.files[0].backup_path, null);
  const validated = project.run(project.validateCli, [
    "--backup-index",
    path.join(project.projectRoot, ".author-toolkit", "backups", "index.json"),
  ]);
  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
});


test("record-backup rejects operational and other non-manuscript paths before publication", async (t) => {
  const targetPaths = [
    "story-bible.md",
    "audit-tracker.md",
    ".author-toolkit/project.json",
    ".author-toolkit/references/terminology.md",
    ".author-toolkit/convergence/evaluations/external.md",
  ];
  for (const targetPath of targetPaths) {
    await t.test(targetPath, async (t) => {
      const project = await installedProject(t);
      const scope = await confirmCurrentScope(project);
      const absoluteTarget = path.join(project.projectRoot, targetPath);
      await mkdir(path.dirname(absoluteTarget), { recursive: true });
      if (targetPath.endsWith("/external.md")) {
        await writeFile(absoluteTarget, "historical evidence\n", "utf8");
      }
      const original = await readFile(absoluteTarget);
      const file = {
        path: targetPath,
        action: "modify",
        input_sha256: sha256(original),
        output_sha256: sha256("forged operational output\n"),
      };
      await recordEditApproval(project, scope, [file]);
      const protectedOriginal = await readFile(absoluteTarget);
      const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
      const indexBefore = await readFile(indexPath, "utf8");

      const recorded = await project.command("record-backup", {
        backup_id: "backup-operational-001",
        operation: "chapter-revision",
        approval_id: "EDIT-001",
        scope_id: scope.scope_id,
        scope_fingerprint: scope.scope_fingerprint,
        files: [file],
      });

      assert.equal(recorded.processResult.status, 1, recorded.processResult.stdout);
      assert.equal(recorded.value.valid, false);
      assert.ok(recorded.value.errors.some((error) => error.code === "backup-manuscript-path-invalid"));
      assert.equal(recorded.value.result.state_written, false);
      assert.deepEqual(await readFile(absoluteTarget), protectedOriginal);
      assert.equal(await readFile(indexPath, "utf8"), indexBefore);
    });
  }
});


test("record-restore rejects operational targets before safety backups or manuscript writes", async (t) => {
  const targetPaths = [
    "story-bible.md",
    "audit-tracker.md",
    ".author-toolkit/project.json",
    ".author-toolkit/references/terminology.md",
    ".author-toolkit/convergence/evaluations/external.md",
  ];
  for (const targetPath of targetPaths) {
    await t.test(targetPath, async (t) => {
      const project = await installedProject(t);
      const scope = await confirmCurrentScope(project);
      const createFile = {
        path: "manuscript/chapter-002.md",
        action: "create",
        input_sha256: null,
        output_sha256: sha256("created manuscript output\n"),
      };
      await recordEditApproval(project, scope, [createFile]);
      const sourceBackup = await project.command("record-backup", {
        backup_id: "backup-source-001",
        operation: "chapter-revision",
        approval_id: "EDIT-001",
        scope_id: scope.scope_id,
        scope_fingerprint: scope.scope_fingerprint,
        files: [createFile],
      });
      assert.equal(sourceBackup.processResult.status, 0, sourceBackup.processResult.stdout);

      const absoluteTarget = path.join(project.projectRoot, targetPath);
      await mkdir(path.dirname(absoluteTarget), { recursive: true });
      if (targetPath.endsWith("/external.md")) {
        await writeFile(absoluteTarget, "immutable historical evidence\n", "utf8");
      }
      const targetBeforeApproval = await readFile(absoluteTarget);
      const restoreFile = {
        path: targetPath,
        action: "delete",
        input_sha256: sha256(targetBeforeApproval),
        output_sha256: null,
      };
      const sourceManifestPath = path.join(
        project.projectRoot,
        sourceBackup.value.result.backup.manifest.path,
      );
      const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
      sourceManifest.files = [{ ...createFile, path: targetPath, output_sha256: restoreFile.input_sha256, backup_path: null }];
      await writeJson(sourceManifestPath, sourceManifest);
      const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
      const index = JSON.parse(await readFile(indexPath, "utf8"));
      index.backups[0].manifest.sha256 = sha256(await readFile(sourceManifestPath));
      await writeJson(indexPath, index);

      const restoreApproval = await project.command("record-approval", {
        approval_id: "RESTORE-001",
        type: "restore",
        operation: "chapter-revision",
        scope_id: scope.scope_id,
        paths: [targetPath],
        files: [restoreFile],
        status: "approved",
        reason: "Author approved this exact restoration. restore_source=backup-source-001",
      });
      assert.equal(restoreApproval.processResult.status, 0, restoreApproval.processResult.stdout);
      const protectedOriginal = await readFile(absoluteTarget);
      const indexBefore = await readFile(indexPath, "utf8");

      const restored = await project.command("record-restore", {
        restoration_id: "restoration-operational-001",
        source_backup_id: "backup-source-001",
        safety_backup_id: "safety-operational-001",
        operation: "chapter-revision",
        approval_id: "RESTORE-001",
        scope_id: scope.scope_id,
        scope_fingerprint: scope.scope_fingerprint,
        files: [restoreFile],
      });

      assert.equal(restored.processResult.status, 1, restored.processResult.stdout);
      assert.equal(restored.value.valid, false);
      assert.ok(restored.value.errors.some((error) => error.code === "restore-manuscript-path-invalid"));
      assert.equal(restored.value.result.state_written, false);
      assert.deepEqual(await readFile(absoluteTarget), protectedOriginal);
      assert.equal(await readFile(indexPath, "utf8"), indexBefore);
      const validated = project.run(project.validateCli, ["--backup-index", indexPath]);
      assert.equal(validated.status, 1, `${validated.stdout}\n${validated.stderr}`);
      assert.match(validated.stdout, /manuscript path/);
    });
  }
});


test("record-restore requires restored bytes in the source backup input scope", async (t) => {
  const project = await installedProject(t);
  const manuscriptPath = path.join(project.projectRoot, "manuscript", "chapter-001.md");
  const original = await readFile(manuscriptPath);
  const edited = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  const forged = "# Chapter One\n\nA version outside the source scope.\n";
  const scope = await confirmCurrentScope(project);
  const backupFile = {
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(original),
    output_sha256: sha256(edited),
  };
  await recordEditApproval(project, scope, [backupFile]);
  const backup = await project.command("record-backup", {
    backup_id: "backup-source-scope-001",
    operation: "chapter-revision",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    files: [backupFile],
  });
  assert.equal(backup.processResult.status, 0, backup.processResult.stdout);

  await writeFile(manuscriptPath, edited, "utf8");
  const proposed = await project.command("record-scope", {
    scope_id: "scope-edited-001",
    description: "The current edited manuscript.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  assert.equal(proposed.processResult.status, 0, proposed.processResult.stdout);
  const confirmed = await project.command("record-scope", {
    ...proposed.value.result.current_scope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmed.processResult.status, 0, confirmed.processResult.stdout);
  const editedScope = confirmed.value.result.current_scope;

  const sourceManifestPath = path.join(project.projectRoot, backup.value.result.backup.manifest.path);
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  sourceManifest.files[0].input_sha256 = sha256(forged);
  await writeJson(sourceManifestPath, sourceManifest);
  const originalBytesPath = path.join(project.projectRoot, sourceManifest.files[0].backup_path);
  await writeFile(originalBytesPath, forged, "utf8");
  const indexPath = path.join(project.projectRoot, ".author-toolkit", "backups", "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  index.backups[0].manifest.sha256 = sha256(await readFile(sourceManifestPath));
  await writeJson(indexPath, index);

  const restoreFile = {
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(edited),
    output_sha256: sha256(forged),
  };
  const approval = await project.command("record-approval", {
    approval_id: "RESTORE-001",
    type: "restore",
    operation: "chapter-revision",
    scope_id: editedScope.scope_id,
    paths: [restoreFile.path],
    files: [restoreFile],
    status: "approved",
    reason: "Author approved this exact restoration. restore_source=backup-source-scope-001",
  });
  assert.equal(approval.processResult.status, 0, approval.processResult.stdout);
  const before = await readFile(manuscriptPath, "utf8");

  const restored = await project.command("record-restore", {
    restoration_id: "restoration-source-scope-001",
    source_backup_id: "backup-source-scope-001",
    safety_backup_id: "safety-source-scope-001",
    operation: "chapter-revision",
    approval_id: "RESTORE-001",
    scope_id: editedScope.scope_id,
    scope_fingerprint: editedScope.scope_fingerprint,
    files: [restoreFile],
  });

  assert.equal(restored.processResult.status, 1, restored.processResult.stdout);
  assert.ok(restored.value.errors.some((error) => error.code === "restore-source-scope-mismatch"));
  assert.equal(restored.value.result.state_written, false);
  assert.equal(await readFile(manuscriptPath, "utf8"), before);
});


test("direct manifest validation resolves backup index from a noncanonical project root", async (t) => {
  const project = await installedProject(t);
  const initialized = project.run(path.join(path.dirname(project.validateCli), "author-project.mjs"), [
    "init",
    "--project-root",
    project.projectRoot,
    "--language",
    "en",
  ]);
  assert.equal(initialized.status, 0, `${initialized.stdout}\n${initialized.stderr}`);
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  const noncanonical = path.join(project.projectRoot, "project.json");
  await writeJson(noncanonical, manifest);
  await rm(project.manifestPath, { force: true });

  const validated = project.run(project.validateCli, ["--manifest", noncanonical]);

  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
  assert.match(validated.stdout, /backups/);
  const response = JSON.parse(validated.stdout);
  assert.equal(response.valid, true);
  assert.equal(response.result.mode, "artifacts");
  assert.equal(response.result.checks, 4);
  assert.deepEqual(response.errors, []);
});
