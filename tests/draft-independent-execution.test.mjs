import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  appendRevisionExecutionApprovals,
  artifactAt,
  createConvergenceProject,
  createNoEditEvidence,
  currentScopeReference,
  runInput,
  runValidator,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

const original = "The ferry leaves at dawn.\nMara watches it go.";
const output = "The ferry leaves at dusk.\nMara watches it go.";
const manuscriptPath = "manuscript/chapter-001.md";

async function confirmScope(projectRoot, contents, decisionId) {
  await recordScope(projectRoot, {
    scope_id: "scope-001",
    description: "The complete current manuscript.",
    status: "confirmed",
    files: [{
      path: manuscriptPath,
      sha256: createHash("sha256").update(contents).digest("hex"),
    }],
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
}

async function evaluateDraft(projectRoot, evidence, evaluationId, revisionExecutions = []) {
  return runInput(projectRoot, "evaluate-draft", {
    evaluation_id: evaluationId,
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: revisionExecutions,
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
}

async function executionRequest(projectRoot, evidence, input, plannedOutput) {
  const planRelative = "sessions/independent-plan-001.md";
  const batchRelative = "sessions/independent-batch-001.json";
  await writeFile(path.join(projectRoot, planRelative), "# Independent revision plan\n\nChange dawn to dusk.\n", "utf8");
  await writeJson(path.join(projectRoot, batchRelative), {
    batch_id: "independent-batch-001",
    action: "Change dawn to dusk in chapter 1.",
  });
  const backupRelative = ".author-toolkit/backups/backup-independent-001/manuscript/chapter-001.md";
  await mkdir(path.dirname(path.join(projectRoot, backupRelative)), { recursive: true });
  await writeFile(path.join(projectRoot, backupRelative), input, "utf8");
  const backupManifestRelative = ".author-toolkit/backups/backup-independent-001/manifest.json";
  await writeJson(path.join(projectRoot, backupManifestRelative), {
    backup_id: "backup-independent-001",
    approval_id: "EDIT-002",
    scope_id: "scope-001",
  });
  return {
    execution_id: "execution-independent-001",
    plan: { plan_id: "independent-plan-001", ...(await artifactAt(projectRoot, planRelative)) },
    batch: { batch_id: "independent-batch-001", ...(await artifactAt(projectRoot, batchRelative)) },
    requested_pass: evidence.passReference,
    input_scope: evidence.scopeReference,
    finding_dispositions: [{
      finding_id: "DIAG-001",
      disposition: "execute",
      author_decision_id: "PLAN-002",
    }],
    author_decision_ids: ["PLAN-002"],
    approval_ids: ["EDIT-002"],
    backups: [{
      backup_id: "backup-independent-001",
      approval_id: "EDIT-002",
      manifest: await artifactAt(projectRoot, backupManifestRelative),
      files: [{
        path: manuscriptPath,
        backup_path: backupRelative,
        sha256: createHash("sha256").update(input).digest("hex"),
      }],
    }],
    files: [{
      path: manuscriptPath,
      action: "modify",
      input_sha256: createHash("sha256").update(input).digest("hex"),
      output_sha256: createHash("sha256").update(plannedOutput).digest("hex"),
    }],
  };
}

test("an independent resolved finding recovers only through verified output and then starts a later cycle", async (t) => {
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: original }],
  });
  await confirmScope(projectRoot, original, "SCOPE-001");
  const base = await createNoEditEvidence(projectRoot, { passId: "pass-001" });
  const baseEvaluation = await evaluateDraft(projectRoot, base, "evaluation-independent-001");
  assert.equal(baseEvaluation.status, 0, `${baseEvaluation.stdout}\n${baseEvaluation.stderr}`);

  const preparation = await executionRequest(projectRoot, base, original, output);
  await appendRevisionExecutionApprovals(projectRoot, preparation, {
    planReason: "Author accepted DIAG-001 for the exact independent edit.",
    editReason: "Author approved the exact independent input and planned output.",
  });
  const prepared = await runInput(
    projectRoot,
    "prepare-draft-revision-execution",
    preparation,
  );
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  const preparedResult = JSON.parse(prepared.stdout);
  assert.equal(preparedResult.execution.status, "prepared");
  assert.equal(preparedResult.execution.cycle_id, null);
  assert.equal(preparedResult.cycle, null);
  const preparedBytes = await readFile(preparedResult.execution_path, "utf8");

  const duplicate = await runInput(
    projectRoot,
    "prepare-draft-revision-execution",
    preparation,
  );
  assert.equal(duplicate.status, 1, `${duplicate.stdout}\n${duplicate.stderr}`);
  assert.equal(JSON.parse(duplicate.stdout).blockers[0].code, "revision-execution-already-exists");
  assert.equal(await readFile(preparedResult.execution_path, "utf8"), preparedBytes);

  await writeFile(path.join(projectRoot, manuscriptPath), output, "utf8");
  await confirmScope(projectRoot, output, "SCOPE-002");
  const target = await createNoEditEvidence(projectRoot, {
    passId: "pass-002",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-002",
    findings: [{
      id: "DIAG-001",
      audit: "narrative diagnostics",
      technique: "causality",
      severity: "suggestion",
      location: { file: manuscriptPath, scope: "file" },
      issue: "The departure time needed to match the revised transition.",
      recommendation: "Change dawn to dusk and verify the transition.",
      confidence: "judgment",
    }],
    findingStatuses: {
      "DIAG-001": {
        status: "resolved",
        reason: "Author accepted the independent edit after reviewing the new text.",
      },
    },
  });

  const unverified = await evaluateDraft(projectRoot, target, "evaluation-independent-unverified");
  assert.equal(unverified.status, 1, `${unverified.stdout}\n${unverified.stderr}`);
  assert.ok(JSON.parse(unverified.stdout).blockers.some((blocker) =>
    blocker.code === "verified-execution-required"
  ));
  const preparedEvidence = await evaluateDraft(
    projectRoot,
    target,
    "evaluation-independent-prepared",
    [preparedResult.execution_reference],
  );
  assert.equal(preparedEvidence.status, 1, `${preparedEvidence.stdout}\n${preparedEvidence.stderr}`);
  assert.ok(JSON.parse(preparedEvidence.stdout).blockers.some((blocker) =>
    blocker.code === "approved-edit-unexecuted"
  ));
  const blockedStart = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-draft-blocked",
    initiating_strategy: "revise-draft",
    bootstrap: false,
    starting_scope: await currentScopeReference(projectRoot),
  });
  assert.equal(blockedStart.status, 1, `${blockedStart.stdout}\n${blockedStart.stderr}`);
  assert.equal(JSON.parse(blockedStart.stdout).blockers[0].code, "starting-evaluation-indeterminate");

  await writeFile(path.join(projectRoot, manuscriptPath), `${output}\nUnexpected tampering.`, "utf8");
  const mismatch = await runInput(projectRoot, "verify-draft-revision-execution", {
    execution_id: preparation.execution_id,
    requested_pass: target.passReference,
    target_scope: target.scopeReference,
  });
  assert.equal(mismatch.status, 1, `${mismatch.stdout}\n${mismatch.stderr}`);
  assert.equal(JSON.parse(mismatch.stdout).blockers[0].code, "revision-output-mismatch");
  assert.equal(JSON.parse(mismatch.stdout).state_written, false);
  assert.equal(await readFile(preparedResult.execution_path, "utf8"), preparedBytes);

  await writeFile(path.join(projectRoot, manuscriptPath), output, "utf8");
  const verified = await runInput(projectRoot, "verify-draft-revision-execution", {
    execution_id: preparation.execution_id,
    requested_pass: target.passReference,
    target_scope: target.scopeReference,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  const verifiedResult = JSON.parse(verified.stdout);
  assert.equal(verifiedResult.execution.status, "verified");
  assert.equal(verifiedResult.execution.cycle_id, null);
  assert.equal(verifiedResult.cycle, null);
  const verifiedBytes = await readFile(verifiedResult.execution_path, "utf8");
  const artifact = runValidator(["--revision-execution", verifiedResult.execution_path]);
  assert.equal(artifact.status, 0, `${artifact.stdout}\n${artifact.stderr}`);
  const repeatedVerify = await runInput(projectRoot, "verify-draft-revision-execution", {
    execution_id: preparation.execution_id,
    requested_pass: target.passReference,
    target_scope: target.scopeReference,
  });
  assert.equal(repeatedVerify.status, 1, `${repeatedVerify.stdout}\n${repeatedVerify.stderr}`);
  assert.equal(JSON.parse(repeatedVerify.stdout).blockers[0].code, "revision-execution-identity-mismatch");
  assert.equal(await readFile(verifiedResult.execution_path, "utf8"), verifiedBytes);

  const evaluated = await evaluateDraft(
    projectRoot,
    target,
    "evaluation-independent-002",
    [verifiedResult.execution_reference],
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluationResult = JSON.parse(evaluated.stdout);
  assert.equal(evaluationResult.evaluation.outcome, "satisfied");
  assert.equal(evaluationResult.evaluation.cycle_id, null);
  assert.ok(evaluationResult.evaluation.evidence_graph.artifacts.some((artifact) =>
    artifact.role === "revision-execution" && artifact.artifact_id === preparation.execution_id
  ));

  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-draft-after-independent",
    initiating_strategy: "revise-draft",
    bootstrap: false,
    starting_scope: target.scopeReference,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.equal(JSON.parse(started.stdout).cycle.starting_evaluation.evaluation_id, "evaluation-independent-002");

  const independentDuringCycle = await runInput(
    projectRoot,
    "prepare-draft-revision-execution",
    { ...preparation, execution_id: "execution-independent-parallel" },
  );
  assert.equal(independentDuringCycle.status, 1, `${independentDuringCycle.stdout}\n${independentDuringCycle.stderr}`);
  assert.equal(JSON.parse(independentDuringCycle.stdout).blockers[0].code, "active-cycle-exists");
  assert.equal(JSON.parse(independentDuringCycle.stdout).cycle.cycle_id, "cycle-draft-after-independent");
  const verifyDuringCycle = await runInput(projectRoot, "verify-draft-revision-execution", {
    execution_id: preparation.execution_id,
    requested_pass: target.passReference,
    target_scope: target.scopeReference,
  });
  assert.equal(verifyDuringCycle.status, 1, `${verifyDuringCycle.stdout}\n${verifyDuringCycle.stderr}`);
  assert.equal(JSON.parse(verifyDuringCycle.stdout).blockers[0].code, "active-cycle-exists");
  assert.equal(await readFile(verifiedResult.execution_path, "utf8"), verifiedBytes);
});


test("independent preparation rejects changed current input without publishing an execution", async (t) => {
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: original }],
  });
  await confirmScope(projectRoot, original, "SCOPE-001");
  const base = await createNoEditEvidence(projectRoot, { passId: "pass-001" });
  const preparation = await executionRequest(projectRoot, base, original, output);
  await appendRevisionExecutionApprovals(projectRoot, preparation, {
    planReason: "Author accepted DIAG-001 for the exact independent edit.",
    editReason: "Author approved the exact independent input and planned output.",
  });
  await writeFile(path.join(projectRoot, manuscriptPath), "Changed before independent preparation.\n", "utf8");

  const prepared = await runInput(
    projectRoot,
    "prepare-draft-revision-execution",
    preparation,
  );
  assert.equal(prepared.status, 1, `${prepared.stdout}\n${prepared.stderr}`);
  const result = JSON.parse(prepared.stdout);
  assert.equal(result.valid, false);
  assert.equal(result.state_written, false);
  assert.equal(result.blockers[0].code, "external-reconciliation-required");
  assert.match(result.blockers[0].message, /creation-import/);
  await assert.rejects(
    readFile(path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "executions",
      `${preparation.execution_id}.json`,
    )),
    { code: "ENOENT" },
  );
});
