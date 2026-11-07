import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { computeInventoryFingerprint, recordScope } from "../scripts/lib/index.mjs";
import {
  appendRevisionExecutionApprovals,
  appendTrackerApproval as appendApproval,
  createConvergenceProject,
  createFirstPublicationArtifacts,
  createNoEditEvidence,
  currentScopeReference,
  runInput,
  timestamp,
  writeBackupEvidence,
  writeJson,
} from "./convergence-helpers.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function confirmScope(projectRoot, decisionId, scopeId, files, description = "Approved external manuscript.") {
  await recordScope(projectRoot, {
    scope_id: scopeId,
    description,
    status: "confirmed",
    files: files.map((file) => ({ path: file.path, sha256: sha256(file.contents) })),
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: decisionId,
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  return currentScopeReference(projectRoot);
}

async function writeStoryState(projectRoot, targetScope, files) {
  const references = [];
  const children = [];
  for (const [index, file] of files.entries()) {
    const value = {
      schema_version: "1.0.0",
      state_id: `reconciled-${index + 1}`,
      level: "chapter",
      scope_id: targetScope.scope_id,
      updated_at: timestamp,
      sources: [{ path: file.path, sha256: sha256(file.contents) }],
      summary: `Observed facts for ${file.path}.`,
      records: [],
      children: [],
    };
    const relative = `.author-toolkit/creation/state/chapters/reconciled-${index + 1}.md`;
    const absolute = path.join(projectRoot, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `# Reconciled chapter\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`, "utf8");
    const reference = { path: relative, sha256: sha256(await readFile(absolute)) };
    references.push(reference);
    children.push(reference);
  }
  const current = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: targetScope.scope_id,
    updated_at: timestamp,
    sources: children,
    summary: "Current state after approved external reconciliation.",
    records: [],
    children,
  };
  const relative = ".author-toolkit/creation/state/current.md";
  const absolute = path.join(projectRoot, relative);
  await writeFile(absolute, `# Current state\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\`\n`, "utf8");
  references.push({ path: relative, sha256: sha256(await readFile(absolute)) });
  return references;
}

async function approveImport(projectRoot, reconciliationId, decisionId, targetScope, files) {
  const snapshot = JSON.parse(await readFile(path.join(projectRoot, targetScope.snapshot_path), "utf8"));
  await appendApproval(projectRoot, {
    id: decisionId,
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: files.map((file) => file.path),
    reason: `Author approved exact external text and story state. reconciliation_id=${reconciliationId} inventory_fingerprint=${snapshot.inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
}

async function startBootstrap(projectRoot, cycleId) {
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: cycleId,
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
}

async function importIntoBootstrap(projectRoot, options) {
  for (const file of options.files) {
    await writeFile(path.join(projectRoot, file.path), file.contents, "utf8");
  }
  const targetScope = await confirmScope(
    projectRoot,
    options.decisionId,
    options.scopeId,
    options.files,
  );
  const storyState = await writeStoryState(projectRoot, targetScope, options.files);
  if (options.approve !== false) {
    await approveImport(
      projectRoot,
      options.reconciliationId,
      options.decisionId,
      targetScope,
      options.files,
    );
  }
  const result = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: options.reconciliationId,
    cycle_id: options.cycleId,
    expected_revision: options.expectedRevision,
    author_decision_id: options.decisionId,
    target_scope: targetScope,
    story_state: storyState,
  });
  return { result, targetScope, storyState };
}

async function evaluateImportedBootstrap(projectRoot, cycleId, expectedRevision, passId) {
  const evidence = await createNoEditEvidence(projectRoot, {
    passId,
    noEditDecisionId: "NOEDIT-700",
  });
  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: expectedRevision,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The imported bootstrap manuscript has complete full-manuscript evidence.",
    },
    requested_pass: evidence.passReference,
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-followup-700", expectedRevision + 1, cycleId),
  );
  return { evaluated, evidence };
}

test("a second approved external change converges with a null bootstrap origin and a continuous import chain", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-bootstrap-second-import";
  await startBootstrap(projectRoot, cycleId);
  const first = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-first-704",
    decisionId: "IMPORT-704",
    scopeId: "scope-first-704",
    files: [{ path: "manuscript/chapter-001.md", contents: "First imported chapter.\n" }],
  });
  assert.equal(first.result.status, 0, `${first.result.stdout}\n${first.result.stderr}`);
  const second = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 2,
    reconciliationId: "reconciliation-second-705",
    decisionId: "IMPORT-705",
    scopeId: "scope-second-705",
    files: [{ path: "manuscript/chapter-001.md", contents: "First imported chapter, externally revised.\n" }],
  });
  assert.equal(second.result.status, 0, `${second.result.stdout}\n${second.result.stderr}`);
  const secondResult = JSON.parse(second.result.stdout);
  assert.equal(secondResult.cycle.starting_scope, null);
  assert.equal(secondResult.cycle.change_set.from_scope, null);
  assert.deepEqual(secondResult.reconciliation.previous_scope, first.targetScope);
  assert.equal(secondResult.required_action.strategy, "revise-draft");

  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    3,
    "pass-second-import",
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
  assert.equal(JSON.parse(evaluated.stdout).cycle.change_set.from_scope, null);
});


test("an approved verified edit after the first bootstrap import converges through the execution chain", async (t) => {
  const fixture = await prepareVerifiedPostImportEdit(t);
  const reviewed = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: fixture.cycleId,
    expected_revision: 5,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The verified post-import edit has new full-target review evidence.",
    },
    related_artifacts: {
      review_groups: [fixture.finalEvidence.reviewGroupReference],
      reviews: fixture.finalEvidence.reviewJobs.map(({ reference }) => reference),
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    fixture.finalEvidence.evaluationInput("evaluation-post-import-edit", 6, fixture.cycleId),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "satisfied");
  assert.ok(!result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-target-mismatch" ||
      blocker.code === "creation-commit-evidence-missing"
  ));
  assert.deepEqual(result.evaluation.target_scope, fixture.targetScope);
});

async function prepareVerifiedPostImportEdit(t) {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-bootstrap-post-import-edit";
  const original = "First imported chapter.\n";
  const output = "First imported chapter, revised through an approved execution.\n";
  const files = [{ path: "manuscript/chapter-001.md", contents: original }];
  await startBootstrap(projectRoot, cycleId);
  const imported = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-post-import-edit",
    decisionId: "IMPORT-806",
    scopeId: "scope-post-import-edit",
    files,
  });
  assert.equal(imported.result.status, 0, `${imported.result.stdout}\n${imported.result.stderr}`);
  const beforeEvidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-before-post-import-edit",
    noEditDecisionId: "NOEDIT-806",
  });
  const planned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "chapter-revision",
      reason: "The initial full-manuscript pass requires one approved edit.",
    },
    target_scope: imported.targetScope,
    requested_pass: beforeEvidence.passReference,
  });
  assert.equal(planned.status, 0, `${planned.stdout}\n${planned.stderr}`);
  const planRelative = "sessions/post-import-plan.json";
  const batchRelative = "sessions/post-import-batch.json";
  await writeJson(path.join(projectRoot, planRelative), { plan_id: "post-import-plan" });
  await writeJson(path.join(projectRoot, batchRelative), { batch_id: "post-import-batch" });
  const backupRelative = ".author-toolkit/backups/backup-806/manuscript/chapter-001.md";
  const backupManifestRelative = ".author-toolkit/backups/backup-806/manifest.json";
  await writeBackupEvidence(projectRoot, {
    backupId: "backup-806",
    approvalId: "EDIT-806",
    scope: imported.targetScope,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
      contents: original,
    }],
  });
  const artifact = async (relative) => ({
    path: relative,
    sha256: sha256(await readFile(path.join(projectRoot, relative))),
  });
  const execution = {
    cycle_id: cycleId,
    expected_revision: 3,
    execution_id: "execution-post-import-806",
    plan: { plan_id: "post-import-plan", ...(await artifact(planRelative)) },
    batch: { batch_id: "post-import-batch", ...(await artifact(batchRelative)) },
    requested_pass: beforeEvidence.passReference,
    input_scope: imported.targetScope,
    finding_dispositions: [],
    author_decision_ids: ["PLAN-806"],
    approval_ids: ["EDIT-806"],
    backups: [{
      backup_id: "backup-806",
      approval_id: "EDIT-806",
      manifest: await artifact(backupManifestRelative),
      files: [{
        path: "manuscript/chapter-001.md",
        backup_path: backupRelative,
        sha256: sha256(original),
      }],
    }],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
    }],
  };
  await appendRevisionExecutionApprovals(projectRoot, execution);
  const prepared = await runInput(projectRoot, "prepare-revision-execution", execution);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  const targetScope = await confirmScope(projectRoot, "SCOPE-807", "scope-post-import-output", [
    { path: "manuscript/chapter-001.md", contents: output },
  ]);
  const finalEvidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-post-import-output",
    noEditDecisionId: "NOEDIT-808",
  });
  const verified = await runInput(projectRoot, "verify-revision-execution", {
    cycle_id: cycleId,
    expected_revision: 4,
    execution_id: "execution-post-import-806",
    requested_pass: finalEvidence.passReference,
    target_scope: targetScope,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  return {
    projectRoot,
    cycleId,
    imported,
    targetScope,
    finalEvidence,
    verified: JSON.parse(verified.stdout),
  };
}


test("bootstrap convergence rejects a gap in the reconciliation chain", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-bootstrap-chain-gap";
  await startBootstrap(projectRoot, cycleId);
  const first = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-chain-gap-first",
    decisionId: "IMPORT-901",
    scopeId: "scope-chain-gap-first",
    files: [{ path: "manuscript/chapter-001.md", contents: "First chain chapter.\n" }],
  });
  assert.equal(first.result.status, 0, `${first.result.stdout}\n${first.result.stderr}`);
  const second = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 2,
    reconciliationId: "reconciliation-chain-gap-second",
    decisionId: "IMPORT-902",
    scopeId: "scope-chain-gap-second",
    files: [{ path: "manuscript/chapter-001.md", contents: "Second chain chapter.\n" }],
  });
  assert.equal(second.result.status, 0, `${second.result.stdout}\n${second.result.stderr}`);
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  active.related_artifacts.reconciliations = active.related_artifacts.reconciliations.filter(
    (reference) => reference.reconciliation_id === "reconciliation-chain-gap-second"
  );
  await writeJson(activePath, active);

  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    3,
    "pass-chain-gap",
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-chain-mismatch"
  ));
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "creation-commit-evidence-missing"
  ));
});


test("a forged reconciliation target cannot replace the verified execution input", async (t) => {
  const fixture = await prepareVerifiedPostImportEdit(t);
  const reconciliationPath = path.join(
    fixture.projectRoot,
    ".author-toolkit",
    "convergence",
    "reconciliations",
    "reconciliation-post-import-edit.json",
  );
  const reconciliation = JSON.parse(await readFile(reconciliationPath, "utf8"));
  reconciliation.target_scope = fixture.targetScope;
  reconciliation.change_set.to_scope = fixture.targetScope;
  await writeJson(reconciliationPath, reconciliation);
  const reconciliationHash = sha256(await readFile(reconciliationPath));
  const activePath = path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  active.related_artifacts.reconciliations[0].sha256 = reconciliationHash;
  await writeJson(activePath, active);
  const manifestPath = path.join(fixture.projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.manuscript_reconciliation.sha256 = reconciliationHash;
  await writeJson(manifestPath, manifest);

  const evaluated = await evaluateVerifiedPostImportFixture(fixture);
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-target-mismatch"
  ));
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-chain-mismatch"
  ));
});


test("a forged execution target cannot complete the reconciliation chain", async (t) => {
  const fixture = await prepareVerifiedPostImportEdit(t);
  const execution = JSON.parse(await readFile(fixture.verified.execution_path, "utf8"));
  execution.target_scope = fixture.imported.targetScope;
  await writeJson(fixture.verified.execution_path, execution);
  const executionHash = sha256(await readFile(fixture.verified.execution_path));
  const activePath = path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  active.related_artifacts.revision_executions[0].sha256 = executionHash;
  await writeJson(activePath, active);

  const evaluated = await evaluateVerifiedPostImportFixture(fixture);
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-target-mismatch"
  ));
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "creation-commit-evidence-missing"
  ));
});

async function evaluateVerifiedPostImportFixture(fixture) {
  const reviewed = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: fixture.cycleId,
    expected_revision: 5,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The execution and reconciliation chain must prove its exact target links.",
    },
    related_artifacts: {
      review_groups: [fixture.finalEvidence.reviewGroupReference],
      reviews: fixture.finalEvidence.reviewJobs.map(({ reference }) => reference),
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  return runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    fixture.finalEvidence.evaluationInput("evaluation-post-import-chain-check", 6, fixture.cycleId),
  );
}


test("bootstrap reconciliation rejects a caller decision ID without a real tracker approval", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-bootstrap-no-approval";
  await startBootstrap(projectRoot, cycleId);
  const { result } = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-no-approval",
    decisionId: "IMPORT-701",
    scopeId: "scope-no-approval",
    files: [{ path: "manuscript/chapter-001.md", contents: "Unapproved import.\n" }],
    approve: false,
  });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.equal(JSON.parse(result.stdout).blockers[0].code, "creation-import-approval-missing");
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 1);
  assert.equal(active.target_scope, null);
});


test("bootstrap evaluation rechecks every exact import approval in the chain", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-bootstrap-approval-tamper";
  await startBootstrap(projectRoot, cycleId);
  const imported = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-approval-tamper",
    decisionId: "IMPORT-702",
    scopeId: "scope-approval-tamper",
    files: [{ path: "manuscript/chapter-001.md", contents: "Approved import.\n" }],
  });
  assert.equal(imported.result.status, 0, `${imported.result.stdout}\n${imported.result.stderr}`);
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const inventoryToken = tracker.match(/inventory_fingerprint=[0-9a-f]{64}/)[0];
  await writeFile(trackerPath, tracker.replace(inventoryToken, `inventory_fingerprint=${"0".repeat(64)}`), "utf8");

  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    2,
    "pass-approval-tamper",
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "creation-import-approval-missing"
  ), JSON.stringify(result.evaluation.blockers, null, 2));
});


test("cycle-external reconciliation still requires previous_scope and creates no cycle", async (t) => {
  const original = "Original chapter.\n";
  const modified = "Externally modified chapter.\n";
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: original }],
  });
  const previousScope = await confirmScope(projectRoot, "SCOPE-703", "scope-previous-703", [
    { path: "manuscript/chapter-001.md", contents: original },
  ]);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), modified, "utf8");
  const files = [{ path: "manuscript/chapter-001.md", contents: modified }];
  const targetScope = await confirmScope(projectRoot, "IMPORT-703", "scope-target-703", files);
  const storyState = await writeStoryState(projectRoot, targetScope, files);
  await approveImport(projectRoot, "reconciliation-outside-703", "IMPORT-703", targetScope, files);
  const input = {
    reconciliation_id: "reconciliation-outside-703",
    author_decision_id: "IMPORT-703",
    target_scope: targetScope,
    story_state: storyState,
  };
  const missing = await runInput(projectRoot, "reconcile-manuscript", input);
  assert.equal(missing.status, 2);
  assert.match(missing.response.errors[0].message, /explicit previous_scope/);

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    ...input,
    previous_scope: previousScope,
  });
  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const result = JSON.parse(reconciled.stdout);
  assert.equal(result.cycle, null);
  assert.deepEqual(result.reconciliation.previous_scope, previousScope);
  assert.equal(result.required_action.strategy, "revise-draft");
  await assert.rejects(readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ), { code: "ENOENT" });
});


test("an external import after a verified edit converges through the unified event chain", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-execution-then-import";
  const original = "First imported chapter.\n";
  const edited = "First imported chapter, revised by execution.\n";
  const external = "First imported chapter, changed externally after execution.\n";
  await startBootstrap(projectRoot, cycleId);
  const imported = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-before-execution-906",
    decisionId: "IMPORT-906",
    scopeId: "scope-before-execution-906",
    files: [{ path: "manuscript/chapter-001.md", contents: original }],
  });
  assert.equal(imported.result.status, 0, `${imported.result.stdout}\n${imported.result.stderr}`);
  const execution = await verifyBootstrapEdit(
    projectRoot,
    cycleId,
    2,
    imported.targetScope,
    original,
    edited,
    "906",
  );
  const second = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 5,
    reconciliationId: "reconciliation-after-execution-908",
    decisionId: "IMPORT-908",
    scopeId: "scope-after-execution-908",
    files: [{ path: "manuscript/chapter-001.md", contents: external }],
  });
  assert.equal(second.result.status, 0, `${second.result.stdout}\n${second.result.stderr}`);
  assert.deepEqual(
    JSON.parse(second.result.stdout).reconciliation.previous_scope,
    execution.targetScope,
  );
  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    6,
    "pass-after-execution-import",
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
});

async function verifyBootstrapEdit(projectRoot, cycleId, expectedRevision, inputScope, original, output, id) {
  const finalId = String(Number(id) + 1);
  const beforeEvidence = await createNoEditEvidence(projectRoot, {
    passId: `pass-before-execution-chain-${id}`,
    noEditDecisionId: `NOEDIT-${id}`,
  });
  const planned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: expectedRevision,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "chapter-revision",
      reason: "An approved edit participates in the ordered reconciliation and execution chain.",
    },
    target_scope: inputScope,
    requested_pass: beforeEvidence.passReference,
  });
  assert.equal(planned.status, 0, `${planned.stdout}\n${planned.stderr}`);
  const planRelative = `sessions/execution-chain-plan-${id}.json`;
  const batchRelative = `sessions/execution-chain-batch-${id}.json`;
  await writeJson(path.join(projectRoot, planRelative), { plan_id: `execution-chain-plan-${id}` });
  await writeJson(path.join(projectRoot, batchRelative), { batch_id: `execution-chain-batch-${id}` });
  const backupRelative = `.author-toolkit/backups/backup-${id}/manuscript/chapter-001.md`;
  const backupManifestRelative = `.author-toolkit/backups/backup-${id}/manifest.json`;
  await writeBackupEvidence(projectRoot, {
    backupId: `backup-${id}`,
    approvalId: `EDIT-${id}`,
    scope: inputScope,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
      contents: original,
    }],
  });
  const artifact = async (relative) => ({
    path: relative,
    sha256: sha256(await readFile(path.join(projectRoot, relative))),
  });
  const execution = {
    cycle_id: cycleId,
    expected_revision: expectedRevision + 1,
    execution_id: `execution-chain-${id}`,
    plan: { plan_id: `execution-chain-plan-${id}`, ...(await artifact(planRelative)) },
    batch: { batch_id: `execution-chain-batch-${id}`, ...(await artifact(batchRelative)) },
    requested_pass: beforeEvidence.passReference,
    input_scope: inputScope,
    finding_dispositions: [],
    author_decision_ids: [`PLAN-${id}`],
    approval_ids: [`EDIT-${id}`],
    backups: [{
      backup_id: `backup-${id}`,
      approval_id: `EDIT-${id}`,
      manifest: await artifact(backupManifestRelative),
      files: [{
        path: "manuscript/chapter-001.md",
        backup_path: backupRelative,
        sha256: sha256(original),
      }],
    }],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
    }],
  };
  await appendRevisionExecutionApprovals(projectRoot, execution);
  const prepared = await runInput(projectRoot, "prepare-revision-execution", execution);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  const targetScope = await confirmScope(projectRoot, `SCOPE-${finalId}`, `scope-execution-chain-${id}`, [
    { path: "manuscript/chapter-001.md", contents: output },
  ]);
  const finalEvidence = await createNoEditEvidence(projectRoot, {
    passId: `pass-execution-chain-output-${id}`,
    noEditDecisionId: `NOEDIT-${finalId}`,
  });
  const verified = await runInput(projectRoot, "verify-revision-execution", {
    cycle_id: cycleId,
    expected_revision: expectedRevision + 2,
    execution_id: `execution-chain-${id}`,
    requested_pass: finalEvidence.passReference,
    target_scope: targetScope,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  return { targetScope, finalEvidence, verified: JSON.parse(verified.stdout) };
}


test("empty reconciliation is an intermediate state that requires a linked nonempty recovery", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-bootstrap-import-empty-recovery";
  const original = "First imported chapter.\n";
  const restored = "Recovered imported chapter.\n";
  await startBootstrap(projectRoot, cycleId);
  const imported = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-before-empty-910",
    decisionId: "IMPORT-910",
    scopeId: "scope-before-empty-910",
    files: [{ path: "manuscript/chapter-001.md", contents: original }],
  });
  assert.equal(imported.result.status, 0, `${imported.result.stdout}\n${imported.result.stderr}`);
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const emptyReference = await writeEmptyStoryState(projectRoot);
  const emptyInventoryFingerprint = computeInventoryFingerprint({
    manuscript_root: "manuscript",
    files: [],
    excluded_files: [],
  });
  await appendApproval(projectRoot, {
    id: "IMPORT-911",
    type: "creation-import",
    operation: "creation-import",
    scopeId: imported.targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed complete deletion. reconciliation_id=reconciliation-empty-911 inventory_fingerprint=${emptyInventoryFingerprint} scope_fingerprint=null`,
  });
  const emptied = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-empty-911",
    cycle_id: cycleId,
    expected_revision: 2,
    author_decision_id: "IMPORT-911",
    target_scope: null,
    story_state: [emptyReference],
  });
  assert.equal(emptied.status, 0, `${emptied.stdout}\n${emptied.stderr}`);
  const emptyCompletion = await runInput(projectRoot, "complete-cycle", {
    cycle_id: cycleId,
    expected_revision: 3,
    evaluation_id: "evaluation-empty-intermediate",
    decision_id: "EMPTY-910",
    author_confirmed: true,
  });
  assert.equal(emptyCompletion.status, 1, `${emptyCompletion.stdout}\n${emptyCompletion.stderr}`);
  assert.equal(
    JSON.parse(emptyCompletion.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );

  const recovered = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 3,
    reconciliationId: "reconciliation-recovered-912",
    decisionId: "IMPORT-912",
    scopeId: "scope-recovered-912",
    files: [{ path: "manuscript/chapter-001.md", contents: restored }],
  });
  assert.equal(recovered.result.status, 0, `${recovered.result.stdout}\n${recovered.result.stderr}`);
  assert.equal(JSON.parse(recovered.result.stdout).reconciliation.recovery_from_empty, true);
  assert.equal(JSON.parse(recovered.result.stdout).reconciliation.previous_scope, null);
  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    4,
    "pass-bootstrap-empty-recovery",
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
});

async function writeEmptyStoryState(projectRoot) {
  const storyBible = {
    path: "story-bible.md",
    sha256: sha256(await readFile(path.join(projectRoot, "story-bible.md"))),
  };
  const emptyState = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: null,
    updated_at: timestamp,
    sources: [storyBible],
    summary: "No accepted manuscript remains after external deletion.",
    records: [],
    children: [],
  };
  const relative = ".author-toolkit/creation/state/current.md";
  await mkdir(path.dirname(path.join(projectRoot, relative)), { recursive: true });
  await writeFile(
    path.join(projectRoot, relative),
    `# Empty current state\n\n\`\`\`json\n${JSON.stringify(emptyState, null, 2)}\n\`\`\`\n`,
    "utf8",
  );
  return { path: relative, sha256: sha256(await readFile(path.join(projectRoot, relative))) };
}


test("interleaved imports and edits can pass through empty recovery to a current nonempty target", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-interleaved-empty-recovery";
  const firstText = "First imported chapter.\n";
  const firstEdit = "First imported chapter, edited once.\n";
  const secondImport = "First imported chapter, imported again.\n";
  const secondEdit = "First imported chapter, edited twice.\n";
  const restored = "Recovered after interleaved edits and empty state.\n";
  await startBootstrap(projectRoot, cycleId);
  const first = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-interleaved-first-920",
    decisionId: "IMPORT-920",
    scopeId: "scope-interleaved-first-920",
    files: [{ path: "manuscript/chapter-001.md", contents: firstText }],
  });
  assert.equal(first.result.status, 0, `${first.result.stdout}\n${first.result.stderr}`);
  const firstExecution = await verifyBootstrapEdit(
    projectRoot,
    cycleId,
    2,
    first.targetScope,
    firstText,
    firstEdit,
    "921",
  );
  const second = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 5,
    reconciliationId: "reconciliation-interleaved-second-922",
    decisionId: "IMPORT-922",
    scopeId: "scope-interleaved-second-922",
    files: [{ path: "manuscript/chapter-001.md", contents: secondImport }],
  });
  assert.equal(second.result.status, 0, `${second.result.stdout}\n${second.result.stderr}`);
  assert.deepEqual(JSON.parse(second.result.stdout).reconciliation.previous_scope, firstExecution.targetScope);
  const secondExecution = await verifyBootstrapEdit(
    projectRoot,
    cycleId,
    6,
    second.targetScope,
    secondImport,
    secondEdit,
    "923",
  );

  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const emptyReference = await writeEmptyStoryState(projectRoot);
  const emptyInventoryFingerprint = computeInventoryFingerprint({
    manuscript_root: "manuscript",
    files: [],
    excluded_files: [],
  });
  await appendApproval(projectRoot, {
    id: "IMPORT-924",
    type: "creation-import",
    operation: "creation-import",
    scopeId: secondExecution.targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed empty intermediate state. reconciliation_id=reconciliation-interleaved-empty-924 inventory_fingerprint=${emptyInventoryFingerprint} scope_fingerprint=null`,
  });
  const emptied = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-interleaved-empty-924",
    cycle_id: cycleId,
    expected_revision: 9,
    author_decision_id: "IMPORT-924",
    target_scope: null,
    story_state: [emptyReference],
  });
  assert.equal(emptied.status, 0, `${emptied.stdout}\n${emptied.stderr}`);
  const recovered = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 10,
    reconciliationId: "reconciliation-interleaved-recovered-925",
    decisionId: "IMPORT-925",
    scopeId: "scope-interleaved-recovered-925",
    files: [{ path: "manuscript/chapter-001.md", contents: restored }],
  });
  assert.equal(recovered.result.status, 0, `${recovered.result.stdout}\n${recovered.result.stderr}`);
  assert.equal(JSON.parse(recovered.result.stdout).reconciliation.recovery_from_empty, true);
  assert.equal(JSON.parse(recovered.result.stdout).reconciliation.previous_scope, null);

  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    11,
    "pass-interleaved-empty-recovery",
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
});


test("removing a required execution event breaks the import-edit-import chain", async (t) => {
  const fixture = await prepareExecutionThenImportFixture(t);
  const activePath = path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  active.related_artifacts.revision_executions = [];
  await writeJson(activePath, active);
  const { evaluated } = await evaluateImportedBootstrap(
    fixture.projectRoot,
    fixture.cycleId,
    6,
    "pass-missing-execution-link",
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-chain-mismatch"
  ));
});


test("empty recovery cannot skip its empty predecessor", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-skip-empty-predecessor";
  await startBootstrap(projectRoot, cycleId);
  const imported = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-before-skipped-empty",
    decisionId: "IMPORT-930",
    scopeId: "scope-before-skipped-empty",
    files: [{ path: "manuscript/chapter-001.md", contents: "Chapter before empty state.\n" }],
  });
  assert.equal(imported.result.status, 0, `${imported.result.stdout}\n${imported.result.stderr}`);
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const emptyReference = await writeEmptyStoryState(projectRoot);
  const emptyInventoryFingerprint = computeInventoryFingerprint({
    manuscript_root: "manuscript",
    files: [],
    excluded_files: [],
  });
  await appendApproval(projectRoot, {
    id: "IMPORT-931",
    type: "creation-import",
    operation: "creation-import",
    scopeId: imported.targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed empty state. reconciliation_id=reconciliation-skipped-empty inventory_fingerprint=${emptyInventoryFingerprint} scope_fingerprint=null`,
  });
  const emptied = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-skipped-empty",
    cycle_id: cycleId,
    expected_revision: 2,
    author_decision_id: "IMPORT-931",
    target_scope: null,
    story_state: [emptyReference],
  });
  assert.equal(emptied.status, 0, `${emptied.stdout}\n${emptied.stderr}`);
  const recovered = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 3,
    reconciliationId: "reconciliation-after-skipped-empty",
    decisionId: "IMPORT-932",
    scopeId: "scope-after-skipped-empty",
    files: [{ path: "manuscript/chapter-001.md", contents: "Recovered chapter.\n" }],
  });
  assert.equal(recovered.result.status, 0, `${recovered.result.stdout}\n${recovered.result.stderr}`);
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  active.related_artifacts.reconciliations = active.related_artifacts.reconciliations.filter(
    (reference) => reference.reconciliation_id !== "reconciliation-skipped-empty"
  );
  await writeJson(activePath, active);

  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    4,
    "pass-skip-empty-predecessor",
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-chain-mismatch"
  ));
});


test("a wrong final reconciliation target cannot close the event chain", async (t) => {
  const fixture = await prepareExecutionThenImportFixture(t);
  const reconciliationPath = path.join(
    fixture.projectRoot,
    ".author-toolkit",
    "convergence",
    "reconciliations",
    "reconciliation-after-execution-908.json",
  );
  const reconciliation = JSON.parse(await readFile(reconciliationPath, "utf8"));
  reconciliation.target_scope = fixture.first.targetScope;
  reconciliation.change_set.to_scope = fixture.first.targetScope;
  await writeJson(reconciliationPath, reconciliation);
  const reconciliationHash = sha256(await readFile(reconciliationPath));
  const activePath = path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  active.related_artifacts.reconciliations.at(-1).sha256 = reconciliationHash;
  await writeJson(activePath, active);
  const manifestPath = path.join(fixture.projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.manuscript_reconciliation.sha256 = reconciliationHash;
  await writeJson(manifestPath, manifest);

  const { evaluated } = await evaluateImportedBootstrap(
    fixture.projectRoot,
    fixture.cycleId,
    6,
    "pass-wrong-final-target",
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-target-mismatch" ||
      blocker.code === "reconciliation-chain-mismatch"
  ));
});

async function prepareExecutionThenImportFixture(t) {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-execution-then-import";
  const original = "First imported chapter.\n";
  const edited = "First imported chapter, revised by execution.\n";
  const external = "First imported chapter, changed externally after execution.\n";
  await startBootstrap(projectRoot, cycleId);
  const first = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 1,
    reconciliationId: "reconciliation-before-execution-906",
    decisionId: "IMPORT-906",
    scopeId: "scope-before-execution-906",
    files: [{ path: "manuscript/chapter-001.md", contents: original }],
  });
  assert.equal(first.result.status, 0, `${first.result.stdout}\n${first.result.stderr}`);
  const execution = await verifyBootstrapEdit(
    projectRoot,
    cycleId,
    2,
    first.targetScope,
    original,
    edited,
    "906",
  );
  const second = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 5,
    reconciliationId: "reconciliation-after-execution-908",
    decisionId: "IMPORT-908",
    scopeId: "scope-after-execution-908",
    files: [{ path: "manuscript/chapter-001.md", contents: external }],
  });
  assert.equal(second.result.status, 0, `${second.result.stdout}\n${second.result.stderr}`);
  return { projectRoot, cycleId, first, execution, second };
}


test("a real creation commit joins the event chain before an external import", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-creation-then-import";
  const original = "First committed chapter.\n";
  const external = "First committed chapter, changed externally.\n";
  await startBootstrap(projectRoot, cycleId);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), original, "utf8");
  const publicationScope = await confirmScope(projectRoot, "SCOPE-001", "scope-first-publication", [
    { path: "manuscript/chapter-001.md", contents: original },
  ]);
  const publication = await createFirstPublicationArtifacts(projectRoot);
  const linked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "intake",
      reason: "The real first creation commit precedes external reconciliation.",
    },
    target_scope: publicationScope,
    related_artifacts: publication.relatedArtifacts,
  });
  assert.equal(linked.status, 0, `${linked.stdout}\n${linked.stderr}`);
  const imported = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 2,
    reconciliationId: "reconciliation-after-creation-commit",
    decisionId: "IMPORT-940",
    scopeId: "scope-after-creation-commit",
    files: [{ path: "manuscript/chapter-001.md", contents: external }],
  });
  assert.equal(imported.result.status, 0, `${imported.stdout}\n${imported.stderr}`);
  assert.deepEqual(JSON.parse(imported.result.stdout).reconciliation.previous_scope, publicationScope);

  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    3,
    "pass-creation-then-import",
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
});


test("cycle-external empty recovery accepts explicit null previous_scope but rejects omission without writes", async (t) => {
  const original = "Original chapter before external deletion.\n";
  const restored = "Recovered chapter with explicit null previous scope.\n";
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: original }],
  });
  const previousScope = await confirmScope(projectRoot, "SCOPE-950", "scope-previous-950", [
    { path: "manuscript/chapter-001.md", contents: original },
  ]);
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const emptyReference = await writeEmptyStoryState(projectRoot);
  const emptyInventoryFingerprint = computeInventoryFingerprint({
    manuscript_root: "manuscript",
    files: [],
    excluded_files: [],
  });
  await appendApproval(projectRoot, {
    id: "IMPORT-950",
    type: "creation-import",
    operation: "creation-import",
    scopeId: previousScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed external empty state. reconciliation_id=reconciliation-external-empty-950 inventory_fingerprint=${emptyInventoryFingerprint} scope_fingerprint=null`,
  });
  const emptied = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-external-empty-950",
    previous_scope: previousScope,
    author_decision_id: "IMPORT-950",
    target_scope: null,
    story_state: [emptyReference],
  });
  assert.equal(emptied.status, 0, `${emptied.stdout}\n${emptied.stderr}`);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), restored, "utf8");
  const targetScope = await confirmScope(projectRoot, "IMPORT-951", "scope-recovered-951", [
    { path: "manuscript/chapter-001.md", contents: restored },
  ]);
  const storyState = await writeStoryState(projectRoot, targetScope, [
    { path: "manuscript/chapter-001.md", contents: restored },
  ]);
  await approveImport(projectRoot, "reconciliation-external-recovery-951", "IMPORT-951", targetScope, [
    { path: "manuscript/chapter-001.md", contents: restored },
  ]);
  const input = {
    reconciliation_id: "reconciliation-external-recovery-951",
    author_decision_id: "IMPORT-951",
    target_scope: targetScope,
    story_state: storyState,
  };
  const manifestBeforeOmission = await readFile(manifestPath, "utf8");
  const omitted = await runInput(projectRoot, "reconcile-manuscript", input);
  assert.equal(omitted.status, 2, `${omitted.stdout}\n${omitted.stderr}`);
  assert.match(omitted.response.errors[0].message, /previous_scope/);
  assert.equal(await readFile(manifestPath, "utf8"), manifestBeforeOmission);
  await assert.rejects(readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "reconciliations", `${input.reconciliation_id}.json`),
    "utf8",
  ), { code: "ENOENT" });

  const recovered = await runInput(projectRoot, "reconcile-manuscript", {
    ...input,
    previous_scope: null,
  });
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const result = JSON.parse(recovered.stdout);
  assert.equal(result.cycle, null);
  assert.equal(result.reconciliation.previous_scope, null);
  assert.equal(result.reconciliation.recovery_from_empty, true);
  assert.equal(result.required_action.strategy, "revise-draft");
});


test("creation commit and verified edit form a continuous chain before external import", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const cycleId = "cycle-creation-edit-import";
  const original = "First committed chapter.\n";
  const edited = "First committed chapter, revised by execution.\n";
  const external = "First committed chapter, changed externally after execution.\n";
  await startBootstrap(projectRoot, cycleId);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), original, "utf8");
  const publicationScope = await confirmScope(projectRoot, "SCOPE-001", "scope-first-publication", [
    { path: "manuscript/chapter-001.md", contents: original },
  ]);
  const publication = await createFirstPublicationArtifacts(projectRoot);
  const linked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "intake",
      reason: "Creation publication precedes an approved edit and external import.",
    },
    target_scope: publicationScope,
    related_artifacts: publication.relatedArtifacts,
  });
  assert.equal(linked.status, 0, `${linked.stdout}\n${linked.stderr}`);
  const execution = await verifyBootstrapEdit(
    projectRoot,
    cycleId,
    2,
    publicationScope,
    original,
    edited,
    "970",
  );
  const imported = await importIntoBootstrap(projectRoot, {
    cycleId,
    expectedRevision: 5,
    reconciliationId: "reconciliation-after-creation-edit",
    decisionId: "IMPORT-970",
    scopeId: "scope-after-creation-edit",
    files: [{ path: "manuscript/chapter-001.md", contents: external }],
  });
  assert.equal(imported.result.status, 0, `${imported.stdout}\n${imported.stderr}`);
  assert.deepEqual(JSON.parse(imported.result.stdout).reconciliation.previous_scope, execution.targetScope);

  const { evaluated } = await evaluateImportedBootstrap(
    projectRoot,
    cycleId,
    6,
    "pass-creation-edit-import",
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
});
