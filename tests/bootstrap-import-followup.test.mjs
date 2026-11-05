import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  createConvergenceProject,
  createNoEditEvidence,
  currentScopeReference,
  runAuthorProject,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function runInput(projectRoot, command, input) {
  const identity = input.reconciliation_id ?? input.evaluation_id ?? input.cycle_id ?? "request";
  const inputPath = await writeJson(path.join(projectRoot, `${command}-${identity}.json`), input);
  return runAuthorProject([command, "--project-root", projectRoot, "--input", inputPath]);
}

async function appendApproval(projectRoot, approval) {
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|---|---|\n";
  const index = tracker.indexOf(separator, tracker.indexOf("## Approvals"));
  assert.ok(index >= 0);
  const insertAt = index + separator.length;
  const paths = approval.paths.map((value) => `\`${value}\``).join(", ");
  const row = `| ${approval.id} | ${approval.type} | ${approval.operation} | ${approval.scopeId} | ${paths} | approved | ${approval.reason} | ${timestamp} |\n`;
  await writeFile(trackerPath, tracker.slice(0, insertAt) + row + tracker.slice(insertAt), "utf8");
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
  for (const approval of [{
    id: "PLAN-806",
    type: "revision-plan",
    operation: "revision-plan",
    reason: "Author approved the exact revision plan.",
  }, {
    id: "EDIT-806",
    type: "edit",
    operation: "chapter-revision",
    reason: "Author approved the exact input and output versions.",
  }]) {
    await appendApproval(projectRoot, {
      ...approval,
      scopeId: imported.targetScope.scope_id,
      paths: ["manuscript/chapter-001.md"],
    });
  }
  const planRelative = "sessions/post-import-plan.json";
  const batchRelative = "sessions/post-import-batch.json";
  await writeJson(path.join(projectRoot, planRelative), { plan_id: "post-import-plan" });
  await writeJson(path.join(projectRoot, batchRelative), { batch_id: "post-import-batch" });
  const backupRelative = ".author-toolkit/backups/backup-806/manuscript/chapter-001.md";
  await mkdir(path.dirname(path.join(projectRoot, backupRelative)), { recursive: true });
  await writeFile(path.join(projectRoot, backupRelative), original, "utf8");
  const backupManifestRelative = ".author-toolkit/backups/backup-806/manifest.json";
  await writeJson(path.join(projectRoot, backupManifestRelative), {
    backup_id: "backup-806",
    approval_id: "EDIT-806",
    scope_id: imported.targetScope.scope_id,
  });
  const artifact = async (relative) => ({
    path: relative,
    sha256: sha256(await readFile(path.join(projectRoot, relative))),
  });
  const prepared = await runInput(projectRoot, "prepare-revision-execution", {
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
  });
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
  assert.match(missing.stderr, /explicit previous_scope/);

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
