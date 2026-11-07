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
  createRevisionExecutionFixture,
  currentScopeReference,
  projectClock,
  runInput,
  runValidator,
  timestamp,
  writeBackupEvidence,
  writeJson,
} from "./convergence-helpers.mjs";

async function confirmCurrentScope(
  projectRoot,
  contents,
  scopeId = "scope-001",
  decisionId = "SCOPE-001",
) {
  await recordScope(projectRoot, {
    scope_id: scopeId,
    description: "The complete current manuscript.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
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
    now: await projectClock(projectRoot),
  });
}

test("unconverged manuscript changes require revise-draft recovery while independent and read-only work remain available", async (t) => {
  const manuscript = "A narrow independent prose edit leaves this manuscript unconverged.\n";
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await confirmCurrentScope(projectRoot, manuscript);
  const manifestBefore = await readFile(manifestPath, "utf8");

  for (const [strategy, operation] of [
    ["write-fiction", "writing-plan"],
    ["revise-request", "chapter-revision"],
    ["revise-increment", "chapter-revision"],
    ["revise-fiction", "chapter-revision"],
  ]) {
    const result = await runInput(projectRoot, "check-operation", {
      strategy,
      operation,
      manuscript_change: true,
    });
    assert.equal(result.status, 1, `${strategy}: ${result.stdout}\n${result.stderr}`);
    const gate = JSON.parse(result.stdout);
    assert.equal(gate.valid, false, strategy);
    assert.equal(gate.blockers[0].code, "starting-evaluation-indeterminate", strategy);
    assert.deepEqual(gate.required_action, {
      strategy: "revise-draft",
      operation: "intake",
      command: "revise-draft",
    }, strategy);
  }

  for (const request of [
    {
      strategy: "revise-draft",
      operation: "prose",
      manuscript_change: true,
    },
    {
      strategy: "revise-fiction",
      operation: "structure",
      manuscript_change: false,
    },
    {
      strategy: "revise-fiction",
      operation: "final-review",
      manuscript_change: false,
    },
  ]) {
    const result = await runInput(projectRoot, "check-operation", request);
    assert.equal(result.status, 0, `${request.operation}: ${result.stdout}\n${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).valid, true, request.operation);
  }
  assert.equal(await readFile(manifestPath, "utf8"), manifestBefore);
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json")),
    { code: "ENOENT" },
  );
});


test("an independent full-manuscript revise-draft evaluation restores the gate without creating a cycle", async (t) => {
  const manuscript = "The complete current manuscript has full no-edit evidence.\n";
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await confirmCurrentScope(projectRoot, manuscript);
  const evidence = await createNoEditEvidence(projectRoot);
  const evaluated = await runInput(projectRoot, "evaluate-draft", {
    evaluation_id: "evaluation-independent-001",
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.valid, true);
  assert.equal(result.evaluation.outcome, "satisfied");
  assert.equal(result.evaluation.cycle_id, null);
  assert.equal(result.cycle, null);
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json")),
    { code: "ENOENT" },
  );

  const status = runValidator(["--convergence-status", manifestPath]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.equal(JSON.parse(status.stdout).result.outcome, "satisfied");
  assert.equal(JSON.parse(status.stdout).result.current, true);
  assert.equal(JSON.parse(status.stdout).result.evaluation.cycle_id, null);
  const gate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(gate.status, 0, `${gate.stdout}\n${gate.stderr}`);

  const unlinkedEdit = await runInput(projectRoot, "check-operation", {
    strategy: "revise-fiction",
    operation: "chapter-revision",
    manuscript_change: true,
  });
  assert.equal(unlinkedEdit.status, 1, `${unlinkedEdit.stdout}\n${unlinkedEdit.stderr}`);
  assert.equal(JSON.parse(unlinkedEdit.stdout).blockers[0].code, "active-cycle-required");
  assert.deepEqual(JSON.parse(unlinkedEdit.stdout).required_action, {
    strategy: "revise-fiction",
    operation: "intake",
    command: "revise-fiction",
  });

  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-fiction-001",
    initiating_strategy: "revise-fiction",
    bootstrap: false,
    starting_scope: await currentScopeReference(projectRoot),
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const cycle = JSON.parse(started.stdout).cycle;
  assert.equal(cycle.current_strategy, "revise-fiction");
  assert.equal(cycle.starting_evaluation.evaluation_id, "evaluation-independent-001");
  assert.equal(cycle.recovery_position.operation, "intake");

  const independentDuringRecovery = await runInput(projectRoot, "evaluate-draft", {
    evaluation_id: "evaluation-independent-002",
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
  assert.equal(independentDuringRecovery.status, 1);
  assert.equal(JSON.parse(independentDuringRecovery.stdout).blockers[0].code, "active-cycle-exists");
  assert.equal(JSON.parse(independentDuringRecovery.stdout).cycle.cycle_id, "cycle-fiction-001");
});


test("a narrowed independent pass blocks dependent entries without reducing the last satisfied baseline", async (t) => {
  const manuscript = "The manuscript has one satisfied baseline and one narrowed pass.\n";
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await confirmCurrentScope(projectRoot, manuscript);

  async function evaluate(evidence, evaluationId) {
    return runInput(projectRoot, "evaluate-draft", {
      evaluation_id: evaluationId,
      requested_pass: evidence.passReference,
      target_scope: evidence.scopeReference,
      coverage_index: evidence.coverageIndexReference,
      reports: evidence.reports,
      review_group: evidence.reviewGroupReference,
      no_edit_skips: [evidence.noEditReference],
      semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
    });
  }

  const first = await createNoEditEvidence(projectRoot, { passId: "pass-001" });
  const firstEvaluation = await evaluate(first, "evaluation-independent-001");
  assert.equal(firstEvaluation.status, 0, `${firstEvaluation.stdout}\n${firstEvaluation.stderr}`);

  const narrowed = await createNoEditEvidence(projectRoot, {
    passId: "pass-002",
    baselinePass: first.passReference,
    noEditDecisionId: "NOEDIT-002",
    narrowing: {
      author_decision_id: "NARROW-002",
      reason: "The author requested only a narrowed independent pass.",
      gaps: ["The pass does not establish unrestricted full-manuscript coverage."],
    },
  });
  const narrowedEvaluation = await evaluate(narrowed, "evaluation-independent-narrowed-002");
  assert.equal(narrowedEvaluation.status, 1, `${narrowedEvaluation.stdout}\n${narrowedEvaluation.stderr}`);
  const narrowedResult = JSON.parse(narrowedEvaluation.stdout);
  assert.equal(narrowedResult.evaluation.outcome, "not_satisfied");
  assert.equal(narrowedResult.evaluation.cycle_id, null);
  assert.ok(narrowedResult.blockers.some((blocker) => blocker.code === "narrowed-requested-pass"));
  const gate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(gate.status, 1, `${gate.stdout}\n${gate.stderr}`);
  assert.equal(JSON.parse(gate.stdout).result.outcome, "not_satisfied");

  const blocked = await runInput(projectRoot, "check-operation", {
    strategy: "revise-request",
    operation: "chapter-revision",
    manuscript_change: true,
  });
  assert.equal(blocked.status, 1, `${blocked.stdout}\n${blocked.stderr}`);
  assert.equal(JSON.parse(blocked.stdout).blockers[0].code, "starting-evaluation-indeterminate");

  const recovered = await createNoEditEvidence(projectRoot, {
    passId: "pass-003",
    baselinePass: first.passReference,
    noEditDecisionId: "NOEDIT-003",
  });
  assert.equal(recovered.pass.baseline_pass.pass_id, first.pass.pass_id);
  assert.notEqual(recovered.pass.baseline_pass.pass_id, narrowed.pass.pass_id);
  assert.deepEqual(recovered.pass.required_operations, first.pass.required_operations);
  const recoveredEvaluation = await evaluate(recovered, "evaluation-independent-003");
  assert.equal(recoveredEvaluation.status, 0, `${recoveredEvaluation.stdout}\n${recoveredEvaluation.stderr}`);
  const recoveredResult = JSON.parse(recoveredEvaluation.stdout);
  assert.equal(recoveredResult.evaluation.outcome, "satisfied");
  assert.ok(recoveredResult.evaluation.evidence_graph.artifacts.some((artifact) =>
    artifact.role === "baseline-evaluation" && artifact.artifact_id === "evaluation-independent-001"
  ));
  const finalGate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(finalGate.status, 0, `${finalGate.stdout}\n${finalGate.stderr}`);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-after-latest-satisfied",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: recovered.scopeReference,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.equal(
    JSON.parse(started.stdout).cycle.starting_evaluation.evaluation_id,
    "evaluation-independent-003",
  );
});


test("a newer narrowed, not_satisfied, or indeterminate independent evaluation blocks start-cycle", async (t) => {
  for (const outcome of ["narrowed", "not_satisfied", "indeterminate"]) {
    const manuscript = `The latest independent ${outcome} result must control entry.\n`;
    const { projectRoot } = await createConvergenceProject(t, {
      manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
    });
    await confirmCurrentScope(projectRoot, manuscript);
    const evaluate = (evidence, evaluationId, attestations = null) => runInput(
      projectRoot,
      "evaluate-draft",
      {
        evaluation_id: evaluationId,
        requested_pass: evidence.passReference,
        target_scope: evidence.scopeReference,
        coverage_index: evidence.coverageIndexReference,
        reports: evidence.reports,
        review_group: evidence.reviewGroupReference,
        no_edit_skips: [evidence.noEditReference],
        semantic_attestations: attestations ?? [
          evidence.hostAttestationReference,
          evidence.freshAttestationReference,
        ],
      },
    );
    const base = await createNoEditEvidence(projectRoot, { passId: `pass-base-${outcome}` });
    const baseEvaluation = await evaluate(base, `evaluation-base-${outcome}`);
    assert.equal(baseEvaluation.status, 0, `${outcome}: ${baseEvaluation.stdout}\n${baseEvaluation.stderr}`);
    const trackerPath = path.join(projectRoot, "audit-tracker.md");
    const baseTracker = await readFile(trackerPath, "utf8");

    const options = {
      passId: `pass-latest-${outcome}`,
      baselinePass: base.passReference,
      noEditDecisionId: `NOEDIT-LATEST-${outcome.toUpperCase()}`,
    };
    if (outcome === "narrowed") {
      options.narrowing = {
        author_decision_id: "NARROW-LATEST-001",
        reason: "The author requested a narrowed diagnostic after the satisfied baseline.",
        gaps: ["This narrowed result does not restore unrestricted full-manuscript convergence."],
      };
    }
    const latest = await createNoEditEvidence(projectRoot, options);
    await writeFile(trackerPath, baseTracker, "utf8");
    if (outcome === "not_satisfied") {
      const coverageIndexPath = path.join(projectRoot, latest.coverageIndexReference.path);
      const coverageIndex = JSON.parse(await readFile(coverageIndexPath, "utf8"));
      coverageIndex.entries[0].synthesis_coverage = "partial";
      await writeJson(coverageIndexPath, coverageIndex);
      latest.coverageIndexReference.sha256 = createHash("sha256")
        .update(await readFile(coverageIndexPath))
        .digest("hex");
    }
    const latestEvaluation = await evaluate(
      latest,
      `evaluation-latest-${outcome}`,
      outcome === "indeterminate" ? [latest.freshAttestationReference] : null,
    );
    assert.equal(latestEvaluation.status, 1, `${outcome}: ${latestEvaluation.stdout}\n${latestEvaluation.stderr}`);
    assert.equal(
      JSON.parse(latestEvaluation.stdout).evaluation.outcome,
      outcome === "narrowed" ? "not_satisfied" : outcome,
    );

    const started = await runInput(projectRoot, "start-cycle", {
      cycle_id: `cycle-blocked-${outcome}`,
      initiating_strategy: "revise-request",
      bootstrap: false,
      starting_scope: base.scopeReference,
    });
    assert.equal(started.status, 1, `${outcome}: ${started.stdout}\n${started.stderr}`);
    assert.equal(
      JSON.parse(started.stdout).blockers[0].code,
      "starting-evaluation-indeterminate",
      outcome,
    );
    await assert.rejects(
      readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json")),
      { code: "ENOENT" },
    );
  }
});


test("manuscript-changing revise-fiction uses verified execution and restores full-target convergence before completion", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const output = "The ferry leaves at dusk.\nMara watches it go.";
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: original }],
  });
  await confirmCurrentScope(projectRoot, original);
  const base = await createNoEditEvidence(projectRoot, { passId: "pass-001" });
  const baseEvaluation = await runInput(projectRoot, "evaluate-draft", {
    evaluation_id: "evaluation-independent-001",
    requested_pass: base.passReference,
    target_scope: base.scopeReference,
    coverage_index: base.coverageIndexReference,
    reports: base.reports,
    review_group: base.reviewGroupReference,
    no_edit_skips: [base.noEditReference],
    semantic_attestations: [base.hostAttestationReference, base.freshAttestationReference],
  });
  assert.equal(baseEvaluation.status, 0, `${baseEvaluation.stdout}\n${baseEvaluation.stderr}`);

  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-fiction-001",
    initiating_strategy: "revise-fiction",
    bootstrap: false,
    starting_scope: base.scopeReference,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.equal(JSON.parse(started.stdout).cycle.starting_evaluation.evaluation_id, "evaluation-independent-001");
  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-fiction-001",
    expected_revision: 1,
    current_strategy: "revise-fiction",
    recovery_position: {
      operation: "chapter-revision",
      reason: "The whole-book operation gates produced one exact approved manuscript batch.",
    },
    target_scope: base.scopeReference,
    requested_pass: base.passReference,
  });
  assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);

  const planRelative = "sessions/fiction-plan-001.md";
  const batchRelative = "sessions/fiction-batch-001.json";
  await writeFile(path.join(projectRoot, planRelative), "# Whole-book revision plan\n\nChange dawn to dusk.\n", "utf8");
  await writeJson(path.join(projectRoot, batchRelative), {
    batch_id: "fiction-batch-001",
    action: "Change dawn to dusk in chapter 1.",
  });
  const backupRelative = ".author-toolkit/backups/backup-fiction-001/manuscript/chapter-001.md";
  const backupManifestRelative = ".author-toolkit/backups/backup-fiction-001/manifest.json";
  await writeBackupEvidence(projectRoot, {
    backupId: "backup-fiction-001",
    approvalId: "EDIT-001",
    scope: base.scopeReference,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: createHash("sha256").update(original).digest("hex"),
      output_sha256: createHash("sha256").update(output).digest("hex"),
      contents: original,
    }],
  });
  const execution = {
    cycle_id: "cycle-fiction-001",
    expected_revision: 2,
    execution_id: "execution-fiction-001",
    plan: { plan_id: "fiction-plan-001", ...(await artifactAt(projectRoot, planRelative)) },
    batch: { batch_id: "fiction-batch-001", ...(await artifactAt(projectRoot, batchRelative)) },
    requested_pass: base.passReference,
    input_scope: base.scopeReference,
    finding_dispositions: [],
    author_decision_ids: ["PLAN-001"],
    approval_ids: ["EDIT-001"],
    backups: [{
      backup_id: "backup-fiction-001",
      approval_id: "EDIT-001",
      manifest: await artifactAt(projectRoot, backupManifestRelative),
      files: [{
        path: "manuscript/chapter-001.md",
        backup_path: backupRelative,
        sha256: createHash("sha256").update(original).digest("hex"),
      }],
    }],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: createHash("sha256").update(original).digest("hex"),
      output_sha256: createHash("sha256").update(output).digest("hex"),
    }],
  };
  await appendRevisionExecutionApprovals(projectRoot, execution, {
    planReason: "Author confirmed the exact whole-book revision plan.",
  });
  const prepared = await runInput(projectRoot, "prepare-revision-execution", execution);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  await confirmCurrentScope(projectRoot, output, "scope-001", "SCOPE-002");
  const target = await createNoEditEvidence(projectRoot, {
    passId: "pass-002",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-002",
  });
  const verified = await runInput(projectRoot, "verify-revision-execution", {
    cycle_id: "cycle-fiction-001",
    expected_revision: 3,
    execution_id: "execution-fiction-001",
    requested_pass: target.passReference,
    target_scope: target.scopeReference,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  assert.equal(JSON.parse(verified.stdout).execution.status, "verified");
  assert.equal(JSON.parse(verified.stdout).cycle.current_strategy, "revise-fiction");

  const reviewLinked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-fiction-001",
    expected_revision: 4,
    current_strategy: "revise-fiction",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Verified outputs require full-target review and convergence evaluation.",
    },
    related_artifacts: {
      review_groups: [target.reviewGroupReference],
      reviews: target.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [target.noEditReference],
    },
  });
  assert.equal(reviewLinked.status, 0, `${reviewLinked.stdout}\n${reviewLinked.stderr}`);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    target.evaluationInput("evaluation-fiction-002", 5, "cycle-fiction-001"),
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const currentScopeOnly = JSON.parse(evaluated.stdout).evaluation;
  assert.equal(currentScopeOnly.outcome, "not_satisfied");
  assert.ok(currentScopeOnly.blockers.some(
    (blocker) => blocker.code === "whole-book-operation-missing"
  ));
  assert.ok(currentScopeOnly.blockers.some(
    (blocker) => blocker.code === "whole-book-final-review-mismatch"
  ));

  const wholeBook = await createNoEditEvidence(projectRoot, {
    passId: "pass-003-whole-book",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-003",
    storyBibleDecisionId: "STORY-003",
    wholeBook: true,
  });
  const wholeBookLinked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-fiction-001",
    expected_revision: 6,
    current_strategy: "revise-fiction",
    recovery_position: {
      operation: "final-review",
      reason: "Story Bible, structure, and final-review evidence now cover the full target.",
    },
    requested_pass: wholeBook.passReference,
    related_artifacts: {
      review_groups: [wholeBook.reviewGroupReference],
      reviews: wholeBook.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [wholeBook.noEditReference],
    },
  });
  assert.equal(wholeBookLinked.status, 0, `${wholeBookLinked.stdout}\n${wholeBookLinked.stderr}`);
  const wholeBookEvaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    wholeBook.evaluationInput("evaluation-fiction-003", 7, "cycle-fiction-001"),
  );
  assert.equal(wholeBookEvaluated.status, 0, `${wholeBookEvaluated.stdout}\n${wholeBookEvaluated.stderr}`);
  const wholeBookResult = JSON.parse(wholeBookEvaluated.stdout);
  assert.equal(wholeBookResult.evaluation.outcome, "satisfied");
  assert.ok(wholeBookResult.evaluation.evidence_graph.artifacts.some((artifact) =>
    artifact.role === "report" && artifact.path === wholeBook.reports.find(
      (reference) => reference.report_id === "pass-003-whole-book-story-bible"
    ).path
  ));
  assert.ok(wholeBook.reviewJobs.every(({ job }) => job.mode === "final"));

  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-fiction-001",
    expected_revision: 8,
    evaluation_id: "evaluation-fiction-003-completion",
    decision_id: "COMPLETE-002",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  const completedResult = JSON.parse(completed.stdout);
  assert.equal(completedResult.cycle.initiating_strategy, "revise-fiction");
  assert.equal(completedResult.cycle.current_strategy, "revise-fiction");
  assert.equal(completedResult.cycle.status, "completed");
  assert.equal(completedResult.evaluation.outcome, "satisfied");
  assert.equal(completedResult.cycle.related_artifacts.revision_executions.length, 1);
  const finalGate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(finalGate.status, 0, `${finalGate.stdout}\n${finalGate.stderr}`);
});

async function evaluateIndependent(projectRoot, evidence, evaluationId) {
  return runInput(projectRoot, "evaluate-draft", {
    evaluation_id: evaluationId,
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
}

async function exerciseCrossStrategyFiction(t, { initiatingStrategy, switchAfterExecution = false }) {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const output = "The ferry leaves at dusk.\nMara watches it go.";
  const cycleId = `cycle-${initiatingStrategy}-fiction-crossing`;
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: original }],
  });
  await confirmCurrentScope(projectRoot, original);
  const base = await createNoEditEvidence(projectRoot, { passId: "pass-001" });
  const baseEvaluation = await evaluateIndependent(projectRoot, base, "evaluation-independent-001");
  assert.equal(baseEvaluation.status, 0, `${baseEvaluation.stdout}\n${baseEvaluation.stderr}`);

  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: cycleId,
    initiating_strategy: initiatingStrategy,
    bootstrap: false,
    starting_scope: base.scopeReference,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const fictionPlanned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: 1,
    current_strategy: "revise-fiction",
    recovery_position: {
      operation: "chapter-revision",
      reason: "Cross-entry manuscript work now follows the revise-fiction whole-book gates.",
    },
    target_scope: base.scopeReference,
    requested_pass: base.passReference,
  });
  assert.equal(fictionPlanned.status, 0, `${fictionPlanned.stdout}\n${fictionPlanned.stderr}`);

  const fixture = await createRevisionExecutionFixture(projectRoot, {
    cycleId,
    expectedRevision: 2,
    inputScope: base.scopeReference,
    requestedPass: base.passReference,
    original,
    output,
  });
  const prepared = await runInput(projectRoot, "prepare-revision-execution", fixture.execution);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  await writeFile(path.join(projectRoot, fixture.manuscriptPath), output, "utf8");
  await confirmCurrentScope(projectRoot, output, "scope-001", "SCOPE-002");
  const currentOnly = await createNoEditEvidence(projectRoot, {
    passId: "pass-002-current-only",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-002",
  });
  const verified = await runInput(projectRoot, "verify-revision-execution", {
    cycle_id: cycleId,
    expected_revision: 3,
    execution_id: fixture.execution.execution_id,
    requested_pass: currentOnly.passReference,
    target_scope: currentOnly.scopeReference,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);

  if (switchAfterExecution) {
    const switched = await runInput(projectRoot, "transition-cycle", {
      cycle_id: cycleId,
      expected_revision: 4,
      current_strategy: "revise-request",
      recovery_position: {
        operation: "current-scope-review",
        reason: "Attempt to leave whole-book responsibility behind after execution.",
      },
      requested_pass: currentOnly.passReference,
    });
    assert.equal(switched.status, 1, `${switched.stdout}\n${switched.stderr}`);
    assert.equal(
      JSON.parse(switched.stdout).blockers[0].code,
      "revise-fiction-strategy-change-blocked",
    );
    const active = JSON.parse(await readFile(
      path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
      "utf8",
    ));
    assert.equal(active.revision, 4);
    assert.equal(active.current_strategy, "revise-fiction");
  }

  const reviewLinked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: 4,
    current_strategy: "revise-fiction",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The current-scope review alone cannot satisfy whole-book gates.",
    },
    requested_pass: currentOnly.passReference,
    related_artifacts: {
      review_groups: [currentOnly.reviewGroupReference],
      reviews: currentOnly.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [currentOnly.noEditReference],
    },
  });
  assert.equal(reviewLinked.status, 0, `${reviewLinked.stdout}\n${reviewLinked.stderr}`);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    currentOnly.evaluationInput("evaluation-cross-current-only", 5, cycleId),
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const currentOnlyResult = JSON.parse(evaluated.stdout).evaluation;
  assert.equal(currentOnlyResult.outcome, "not_satisfied");
  assert.ok(currentOnlyResult.blockers.some(
    (blocker) => blocker.code === "whole-book-operation-missing"
  ));
  assert.ok(currentOnlyResult.blockers.some(
    (blocker) => blocker.code === "whole-book-final-review-mismatch"
  ));
  const failedGate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(failedGate.status, 1, `${failedGate.stdout}\n${failedGate.stderr}`);
  const failedCompletion = await runInput(projectRoot, "complete-cycle", {
    cycle_id: cycleId,
    expected_revision: 6,
    evaluation_id: "evaluation-cross-current-only-completion",
    decision_id: "COMPLETE-901",
    author_confirmed: true,
  });
  assert.equal(failedCompletion.status, 1, `${failedCompletion.stdout}\n${failedCompletion.stderr}`);

  const wholeBook = await createNoEditEvidence(projectRoot, {
    passId: "pass-003-whole-book",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-003",
    storyBibleDecisionId: "STORY-003",
    wholeBook: true,
  });
  const wholeBookLinked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycleId,
    expected_revision: 6,
    current_strategy: "revise-fiction",
    recovery_position: {
      operation: "final-review",
      reason: "Complete Story Bible, structure, and final-review evidence is now linked.",
    },
    requested_pass: wholeBook.passReference,
    related_artifacts: {
      review_groups: [wholeBook.reviewGroupReference],
      reviews: wholeBook.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [wholeBook.noEditReference],
    },
  });
  assert.equal(wholeBookLinked.status, 0, `${wholeBookLinked.stdout}\n${wholeBookLinked.stderr}`);
  const wholeBookEvaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    wholeBook.evaluationInput("evaluation-cross-whole-book", 7, cycleId),
  );
  assert.equal(wholeBookEvaluated.status, 0, `${wholeBookEvaluated.stdout}\n${wholeBookEvaluated.stderr}`);
  assert.equal(JSON.parse(wholeBookEvaluated.stdout).evaluation.outcome, "satisfied");

  if (switchAfterExecution) {
    const switchedAfterSatisfied = await runInput(projectRoot, "transition-cycle", {
      cycle_id: cycleId,
      expected_revision: 8,
      current_strategy: "revise-request",
      recovery_position: {
        operation: "current-scope-review",
        reason: "The active revise-fiction cycle must still complete before a strategy switch.",
      },
      requested_pass: wholeBook.passReference,
    });
    assert.equal(switchedAfterSatisfied.status, 1, `${switchedAfterSatisfied.stdout}\n${switchedAfterSatisfied.stderr}`);
    assert.equal(
      JSON.parse(switchedAfterSatisfied.stdout).blockers[0].code,
      "revise-fiction-strategy-change-blocked",
    );
  }
  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: cycleId,
    expected_revision: 8,
    evaluation_id: "evaluation-cross-whole-book-completion",
    decision_id: "COMPLETE-002",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  assert.equal(JSON.parse(completed.stdout).cycle.current_strategy, "revise-fiction");
  const finalGate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(finalGate.status, 0, `${finalGate.stdout}\n${finalGate.stderr}`);
}

for (const initiatingStrategy of ["revise-request", "revise-draft"]) {
  test(`${initiatingStrategy} to revise-fiction requires whole-book evidence after verified execution`, async (t) => {
    await exerciseCrossStrategyFiction(t, { initiatingStrategy });
  });
}

test("revise-fiction execution cannot switch strategy before whole-book completion", async (t) => {
  await exerciseCrossStrategyFiction(t, {
    initiatingStrategy: "revise-fiction",
    switchAfterExecution: true,
  });
});
