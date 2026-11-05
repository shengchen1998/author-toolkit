import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  createConvergenceProject,
  createNoEditEvidence,
  currentScopeReference,
  fileSha256,
  runAuthorProject,
  runAuthorProjectAsync,
  runValidator,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

async function runInput(projectRoot, command, input) {
  const inputPath = await writeJson(
    path.join(projectRoot, `${command}-${input.evaluation_id ?? input.cycle_id}.json`),
    input,
  );
  return runAuthorProject([command, "--project-root", projectRoot, "--input", inputPath]);
}

async function establishNoEditEvaluation(t, { evidenceOptions = {}, complete = false } = {}) {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, started.stderr);
  const manuscript = "The ferry leaves at dawn.\nMara watches it go.";
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), manuscript, "utf8");
  await recordScope(projectRoot, {
    scope_id: "scope-first-publication",
    description: "The first complete nonempty manuscript.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(manuscript).digest("hex"),
    }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  const evidence = await createNoEditEvidence(projectRoot, evidenceOptions);
  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The complete no-edit evidence set awaits convergence evaluation.",
    },
    target_scope: evidence.scopeReference,
    requested_pass: evidence.passReference,
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(transitioned.status, 0, transitioned.stderr);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-001", 2),
  );
  const evaluationResult = JSON.parse(evaluated.stdout);
  let completionResult = null;
  if (complete) {
    assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
    const completed = await runInput(projectRoot, "complete-cycle", {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 3,
      evaluation_id: "evaluation-001-completion",
      decision_id: "COMPLETE-001",
      author_confirmed: true,
    });
    assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
    completionResult = JSON.parse(completed.stdout);
  }
  return {
    projectRoot,
    manifestPath,
    manuscript,
    evidence,
    evaluated,
    evaluationResult,
    completionResult,
  };
}

test("a no-edit full-manuscript pass reaches satisfied and completes after a fresh author decision", async (t) => {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const start = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(start.status, 0, start.stderr);

  const manuscript = "The ferry leaves at dawn.\nMara watches it go.";
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), manuscript, "utf8");
  await recordScope(projectRoot, {
    scope_id: "scope-first-publication",
    description: "The first complete nonempty manuscript.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(manuscript).digest("hex"),
    }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  const evidence = await createNoEditEvidence(projectRoot);
  const transition = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The complete no-edit evidence set awaits convergence evaluation.",
    },
    target_scope: evidence.scopeReference,
    requested_pass: evidence.passReference,
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(transition.status, 0, transition.stderr);
  assert.equal(JSON.parse(transition.stdout).cycle.revision, 2);

  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-001", 2),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluationResult = JSON.parse(evaluated.stdout);
  assert.equal(evaluationResult.valid, true);
  assert.equal(evaluationResult.evaluation.outcome, "satisfied");
  assert.equal(evaluationResult.cycle.revision, 3);
  assert.equal(evaluationResult.cycle.target_evaluation.evaluation_id, "evaluation-001");
  const evaluationBeforeCompletion = await readFile(evaluationResult.evaluation_path, "utf8");
  const trackerHashBeforeCompletion = await fileSha256(path.join(projectRoot, "audit-tracker.md"));
  assert.ok(
    evaluationResult.evaluation.evidence_graph.artifacts.some((artifact) =>
      artifact.role === "tracker" && artifact.sha256 === trackerHashBeforeCompletion
    ),
  );

  const status = runValidator(["--convergence-status", manifestPath]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).outcome, "satisfied");
  assert.equal(JSON.parse(status.stdout).current, true);
  const gate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(gate.status, 0, `${gate.stdout}\n${gate.stderr}`);
  assert.equal(JSON.parse(gate.stdout).valid, true);

  for (const [option, reference] of [
    ["--requested-pass", evidence.passReference],
    ["--no-edit-skip", evidence.noEditReference],
    ["--review-group", evidence.reviewGroupReference],
    ["--semantic-attestation", evidence.hostAttestationReference],
    ["--convergence-evaluation", { path: evaluationResult.evaluation_path }],
  ]) {
    const result = runValidator([option, path.resolve(projectRoot, reference.path)]);
    assert.equal(result.status, 0, `${option}: ${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /1 checks, 0 failures/);
  }

  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-001-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  const completionResult = JSON.parse(completed.stdout);
  assert.equal(completionResult.valid, true);
  assert.equal(completionResult.cycle.status, "completed");
  assert.equal(completionResult.cycle.completion.decision_id, "COMPLETE-001");
  assert.equal(
    completionResult.cycle.completion.target_evaluation_id,
    "evaluation-001-completion",
  );
  assert.equal(completionResult.evaluation.outcome, "satisfied");
  const trackerHashAfterCompletion = await fileSha256(path.join(projectRoot, "audit-tracker.md"));
  assert.notEqual(trackerHashAfterCompletion, trackerHashBeforeCompletion);
  const trackerEvidence = completionResult.evaluation.evidence_graph.artifacts.find(
    (artifact) => artifact.role === "tracker",
  );
  assert.equal(trackerEvidence.sha256, trackerHashAfterCompletion);
  assert.equal(await readFile(evaluationResult.evaluation_path, "utf8"), evaluationBeforeCompletion);
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json")),
    { code: "ENOENT" },
  );
  const completedCycle = JSON.parse(await readFile(
    path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "cycles",
      "cycle-bootstrap-001.json",
    ),
    "utf8",
  ));
  assert.equal(completedCycle.status, "completed");
  assert.equal(completedCycle.revision, 4);
  const finalGate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(finalGate.status, 0, `${finalGate.stdout}\n${finalGate.stderr}`);
});


test("a no-change request inherits the last satisfied pass and only extends its checks", async (t) => {
  const first = await establishNoEditEvaluation(t, { complete: true });
  const startingScope = await currentScopeReference(first.projectRoot);
  const started = await runInput(first.projectRoot, "start-cycle", {
    cycle_id: "cycle-request-002",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const startResult = JSON.parse(started.stdout);
  assert.equal(startResult.cycle.bootstrap, false);
  assert.equal(startResult.cycle.starting_evaluation.evaluation_id, "evaluation-001-completion");
  assert.equal(startResult.cycle.target_evaluation, null);

  const second = await createNoEditEvidence(first.projectRoot, {
    passId: "pass-002",
    baselinePass: first.evidence.passReference,
    noEditDecisionId: "NOEDIT-002",
    requestedSubchecks: [{
      operation: "diagnostics",
      subcheck: "information-release",
      author_decision_id: "REQUEST-002",
    }],
  });
  const firstIndex = JSON.parse(await readFile(
    path.join(first.projectRoot, first.evidence.coverageIndexReference.path),
    "utf8",
  ));
  const secondIndexPath = path.join(first.projectRoot, second.coverageIndexReference.path);
  const secondIndex = JSON.parse(await readFile(secondIndexPath, "utf8"));
  for (const operation of ["characters", "prose", "ai-cleanup"]) {
    secondIndex.entries.find((entry) => entry.operation === operation).units =
      structuredClone(firstIndex.entries.find((entry) => entry.operation === operation).units);
  }
  await writeJson(secondIndexPath, secondIndex);
  second.coverageIndexReference.sha256 = await fileSha256(secondIndexPath);
  const coverageClaimArtifacts = [second.passReference, second.coverageIndexReference];
  for (const entry of secondIndex.entries) {
    for (const unitReference of entry.units) {
      coverageClaimArtifacts.push(unitReference);
      const unit = JSON.parse(await readFile(path.join(first.projectRoot, unitReference.path), "utf8"));
      coverageClaimArtifacts.push({
        path: unit.source_report,
        sha256: unit.source_report_sha256,
      });
    }
    coverageClaimArtifacts.push({
      path: entry.synthesis_report,
      sha256: entry.synthesis_report_sha256,
    });
  }
  second.hostAttestation.claims[0].artifacts = coverageClaimArtifacts.map(
    ({ path: artifactPath, sha256 }) => ({ path: artifactPath, sha256 }),
  );
  const secondHostPath = path.join(first.projectRoot, second.hostAttestationReference.path);
  await writeJson(secondHostPath, second.hostAttestation);
  second.hostAttestationReference.sha256 = await fileSha256(secondHostPath);
  assert.equal(
    secondIndex.entries.find((entry) => entry.operation === "prose").units[0].path,
    firstIndex.entries.find((entry) => entry.operation === "prose").units[0].path,
  );
  const diagnostics = second.pass.required_operations.find(
    (requirement) => requirement.operation === "diagnostics",
  );
  assert.deepEqual(diagnostics.subchecks, ["causality", "information-release"]);
  assert.equal(second.pass.baseline_pass.pass_id, first.evidence.pass.pass_id);
  const transitioned = await runInput(first.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 1,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The no-change request adds one check and reuses the unchanged full target.",
    },
    target_scope: second.scopeReference,
    requested_pass: second.passReference,
    related_artifacts: {
      review_groups: [second.reviewGroupReference],
      reviews: second.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [second.noEditReference],
    },
  });
  assert.equal(transitioned.status, 0, transitioned.stderr);
  const evaluated = await runInput(
    first.projectRoot,
    "evaluate-cycle",
    second.evaluationInput("evaluation-002", 2, "cycle-request-002"),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");

  const completed = await runInput(first.projectRoot, "complete-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 3,
    evaluation_id: "evaluation-002-completion",
    decision_id: "COMPLETE-002",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  assert.equal(JSON.parse(completed.stdout).cycle.status, "completed");
});


test("status and gate recompute text, artifact, attestation, review, and coverage currency", async (t) => {
  const { projectRoot, manifestPath, manuscript, evidence, evaluated } =
    await establishNoEditEvaluation(t);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);

  function status() {
    const result = runValidator(["--convergence-status", manifestPath]);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  function gateFails() {
    const result = runValidator(["--convergence-gate", manifestPath]);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout);
  }
  function gatePasses() {
    const result = runValidator(["--convergence-gate", manifestPath]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).current, true);
  }

  const reportPath = path.join(projectRoot, evidence.reports[0].path);
  const reportBefore = await readFile(reportPath, "utf8");
  await writeFile(reportPath, `${reportBefore}\nA later unrecorded note.\n`, "utf8");
  let current = status();
  assert.equal(current.outcome, "indeterminate");
  assert.equal(current.current, false);
  assert.ok(current.blockers.some((blocker) => blocker.code === "artifact-hash-mismatch"));
  gateFails();
  await writeFile(reportPath, reportBefore, "utf8");
  gatePasses();

  const manuscriptPath = path.join(projectRoot, "manuscript", "chapter-001.md");
  await writeFile(manuscriptPath, `${manuscript}\nA new paragraph.`, "utf8");
  current = status();
  assert.equal(current.outcome, "indeterminate");
  assert.ok(current.blockers.some((blocker) => blocker.code === "target-scope-not-current"));
  gateFails();
  await writeFile(manuscriptPath, manuscript, "utf8");
  gatePasses();

  const attestationPath = path.join(projectRoot, evidence.hostAttestationReference.path);
  const attestationBefore = await readFile(attestationPath, "utf8");
  await rm(attestationPath);
  current = status();
  assert.equal(current.outcome, "indeterminate");
  assert.ok(current.blockers.some((blocker) => blocker.code === "artifact-unavailable"));
  gateFails();
  await writeFile(attestationPath, attestationBefore, "utf8");
  gatePasses();

  const readerPath = path.join(projectRoot, evidence.reviewStates[2].reference.path);
  const readerBefore = await readFile(readerPath, "utf8");
  const incompleteReader = JSON.parse(readerBefore);
  incompleteReader.status = "in_progress";
  incompleteReader.chunks = [];
  incompleteReader.next_sequence = 1;
  await writeJson(readerPath, incompleteReader);
  current = status();
  assert.equal(current.outcome, "not_satisfied");
  assert.ok(current.blockers.some((blocker) => blocker.code === "incomplete-review-chain"));
  gateFails();
  await writeFile(readerPath, readerBefore, "utf8");
  gatePasses();

  const coveragePath = path.join(projectRoot, evidence.coverageIndexReference.path);
  const coverageBefore = await readFile(coveragePath, "utf8");
  const degradedCoverage = JSON.parse(coverageBefore);
  degradedCoverage.entries.find((entry) => entry.operation === "diagnostics").synthesis_coverage =
    "partial";
  await writeJson(coveragePath, degradedCoverage);
  current = status();
  assert.equal(current.outcome, "not_satisfied");
  assert.ok(current.blockers.some((blocker) => blocker.code === "degraded-required-coverage"));
  gateFails();
  await writeFile(coveragePath, coverageBefore, "utf8");
  gatePasses();

  const refutedAttestation = JSON.parse(attestationBefore);
  refutedAttestation.claims[0].verdict = "refuted";
  await writeJson(attestationPath, refutedAttestation);
  current = status();
  assert.equal(current.outcome, "not_satisfied");
  assert.ok(current.blockers.some((blocker) => blocker.code === "semantic-claim-refuted"));
  gateFails();
  await writeFile(attestationPath, attestationBefore, "utf8");
  gatePasses();
});


function finding(id, issue) {
  return {
    id,
    audit: "narrative diagnostics",
    technique: "causality",
    severity: "suggestion",
    location: { file: "manuscript/chapter-001.md", scope: "file" },
    issue,
    recommendation: "Consider the recorded editorial choice.",
    confidence: "judgment",
  };
}

test("deferred and dismissed findings remain valid explicit no-edit decisions", async (t) => {
  const findings = [
    finding("DIAG-001", "The transition may be intentionally abrupt."),
    finding("DIAG-002", "The repeated image may be a deliberate motif."),
  ];
  const { evaluated, evaluationResult } = await establishNoEditEvaluation(t, {
    evidenceOptions: {
      findings,
      findingStatuses: {
        "DIAG-001": {
          status: "deferred",
          reason: "Author deferred the transition choice until the next draft.",
        },
        "DIAG-002": {
          status: "dismissed",
          reason: "Author confirmed that the repeated image is intentional.",
        },
      },
    },
  });
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(evaluationResult.evaluation.outcome, "satisfied");
  assert.deepEqual(evaluationResult.evaluation.blockers, []);
});

test("an open finding is not_satisfied and author completion cannot override it", async (t) => {
  const { projectRoot, manifestPath, evaluated, evaluationResult } =
    await establishNoEditEvaluation(t, {
      evidenceOptions: {
        findings: [finding("DIAG-001", "The causality between these events is unclear.")],
        findingStatuses: {
          "DIAG-001": { status: "open", reason: "Author decision is required." },
        },
      },
    });
  assert.equal(evaluated.status, 1);
  assert.equal(evaluationResult.evaluation.outcome, "not_satisfied");
  assert.ok(evaluationResult.evaluation.blockers.some((blocker) => blocker.code === "open-findings"));
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const trackerBefore = await readFile(trackerPath, "utf8");
  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-open-completion",
    decision_id: "COMPLETE-900",
    author_confirmed: true,
  });
  assert.equal(completed.status, 1);
  assert.equal(
    JSON.parse(completed.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );
  assert.equal(await readFile(trackerPath, "utf8"), trackerBefore);
  const gate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(gate.status, 1);
  assert.equal(JSON.parse(gate.stdout).outcome, "not_satisfied");
  await assert.rejects(
    readFile(path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "cycles",
      "cycle-bootstrap-001.json",
    )),
    { code: "ENOENT" },
  );
});

test("an indeterminate evaluation rejects completion without recording a decision", async (t) => {
  const { projectRoot, evidence, evaluated } = await establishNoEditEvaluation(t);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  await rm(path.join(projectRoot, evidence.hostAttestationReference.path));
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const trackerBefore = await readFile(trackerPath, "utf8");
  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-indeterminate-completion",
    decision_id: "COMPLETE-901",
    author_confirmed: true,
  });
  assert.equal(completed.status, 1);
  assert.equal(
    JSON.parse(completed.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );
  assert.equal(await readFile(trackerPath, "utf8"), trackerBefore);
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 3);
  assert.equal(active.completion, null);
});


test("independent evaluations serialize on expected cycle revision", async (t) => {
  const { projectRoot, evidence, evaluated } = await establishNoEditEvaluation(t);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const inputs = [];
  for (const evaluationId of ["evaluation-race-a", "evaluation-race-b"]) {
    inputs.push(await writeJson(
      path.join(projectRoot, `${evaluationId}.json`),
      evidence.evaluationInput(evaluationId, 3),
    ));
  }
  const processes = await Promise.all(inputs.map((input) => runAuthorProjectAsync([
    "evaluate-cycle",
    "--project-root",
    projectRoot,
    "--input",
    input,
  ])));
  const results = processes.map((process) => ({
    status: process.status,
    result: JSON.parse(process.stdout),
  }));
  const winner = results.find(({ status }) => status === 0);
  const loser = results.find(({ status }) => status === 1);
  assert.ok(winner, JSON.stringify(results, null, 2));
  assert.ok(loser, JSON.stringify(results, null, 2));
  assert.equal(loser.result.blockers[0].code, "cycle-revision-conflict");
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 4);
  assert.equal(active.target_evaluation.evaluation_id, winner.result.evaluation.evaluation_id);
});

test("independent completions cannot publish two decisions or completed records", async (t) => {
  const { projectRoot, evaluated } = await establishNoEditEvaluation(t);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const inputs = [];
  for (const [suffix, decisionId] of [["a", "COMPLETE-100"], ["b", "COMPLETE-101"]]) {
    inputs.push(await writeJson(path.join(projectRoot, `complete-race-${suffix}.json`), {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 3,
      evaluation_id: `evaluation-complete-race-${suffix}`,
      decision_id: decisionId,
      author_confirmed: true,
    }));
  }
  const processes = await Promise.all(inputs.map((input) => runAuthorProjectAsync([
    "complete-cycle",
    "--project-root",
    projectRoot,
    "--input",
    input,
  ])));
  const results = processes.map((process) => ({
    status: process.status,
    result: JSON.parse(process.stdout),
  }));
  const winner = results.find(({ status }) => status === 0);
  const loser = results.find(({ status }) => status === 1);
  assert.ok(winner, JSON.stringify(results, null, 2));
  assert.ok(loser, JSON.stringify(results, null, 2));
  assert.equal(loser.result.blockers[0].code, "active-cycle-required");
  const tracker = await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8");
  assert.ok(tracker.includes(winner.result.cycle.completion.decision_id));
  const losingDecision = winner.result.cycle.completion.decision_id === "COMPLETE-100"
    ? "COMPLETE-101"
    : "COMPLETE-100";
  assert.ok(!tracker.includes(losingDecision));
  const completed = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "cycles", "cycle-bootstrap-001.json"),
    "utf8",
  ));
  assert.equal(completed.completion.decision_id, winner.result.cycle.completion.decision_id);
});


test("a later full-manuscript pass cannot omit the satisfied baseline", async (t) => {
  const first = await establishNoEditEvaluation(t, { complete: true });
  const started = await runInput(first.projectRoot, "start-cycle", {
    cycle_id: "cycle-request-002",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: await currentScopeReference(first.projectRoot),
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const second = await createNoEditEvidence(first.projectRoot, {
    passId: "pass-002",
    noEditDecisionId: "NOEDIT-002",
  });
  const transitioned = await runInput(first.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 1,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "current-scope-review",
      reason: "This pass is missing its required baseline link.",
    },
    target_scope: second.scopeReference,
    requested_pass: second.passReference,
    related_artifacts: {
      review_groups: [second.reviewGroupReference],
      reviews: second.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [second.noEditReference],
    },
  });
  assert.equal(transitioned.status, 0, transitioned.stderr);
  const evaluated = await runInput(
    first.projectRoot,
    "evaluate-cycle",
    second.evaluationInput("evaluation-002", 2, "cycle-request-002"),
  );
  assert.equal(evaluated.status, 1);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "indeterminate");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "requested-pass-baseline-missing",
  ));
});


test("artifact contracts are closed and evaluation roots reject unsafe paths", async (t) => {
  const { projectRoot, evidence, evaluated } = await establishNoEditEvaluation(t);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const invalidPass = structuredClone(evidence.pass);
  invalidPass.unexpected = true;
  const invalidPassPath = await writeJson(path.join(projectRoot, "invalid-pass.json"), invalidPass);
  assert.equal(runValidator(["--requested-pass", invalidPassPath]).status, 1);
  const invalidAttestation = structuredClone(evidence.hostAttestation);
  invalidAttestation.claims[0].verdict = "unknown";
  const invalidAttestationPath = await writeJson(
    path.join(projectRoot, "invalid-attestation.json"),
    invalidAttestation,
  );
  assert.equal(runValidator(["--semantic-attestation", invalidAttestationPath]).status, 1);

  const unsafeInput = evidence.evaluationInput("evaluation-unsafe", 3);
  unsafeInput.coverage_index = {
    ...unsafeInput.coverage_index,
    path: "../outside.json",
  };
  const unsafe = await runInput(projectRoot, "evaluate-cycle", unsafeInput);
  assert.equal(unsafe.status, 2);
  assert.match(unsafe.stderr, /safe paths/);
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 3);
});


test("current target evaluation rejects a same-ID scope with a new fingerprint after a same-line edit", async (t) => {
  const { projectRoot, manifestPath, manuscript, evidence, evaluated } =
    await establishNoEditEvaluation(t);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const previousFingerprint = evidence.scopeReference.scope_fingerprint;
  const revisedManuscript = "The ferry leaves at dusk.\nMara watches it go.";
  assert.equal(
    revisedManuscript.split(/\r?\n/).length,
    manuscript.split(/\r?\n/).length,
  );
  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-001.md"),
    revisedManuscript,
    "utf8",
  );
  await recordScope(projectRoot, {
    scope_id: evidence.scopeReference.scope_id,
    description: "The same scope ID reconfirmed after a same-line text edit.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(revisedManuscript).digest("hex"),
    }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date("2026-11-05T01:00:00Z"),
  });
  const currentManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(currentManifest.current_scope.scope_id, evidence.scopeReference.scope_id);
  assert.notEqual(currentManifest.current_scope.scope_fingerprint, previousFingerprint);
  assert.notEqual(
    currentManifest.current_scope.snapshot_path,
    evidence.scopeReference.snapshot_path,
  );
  assert.notEqual(
    currentManifest.current_scope.snapshot_sha256,
    evidence.scopeReference.snapshot_sha256,
  );

  const status = runValidator(["--convergence-status", manifestPath]);
  assert.equal(status.status, 0, status.stderr);
  const current = JSON.parse(status.stdout);
  assert.equal(current.outcome, "indeterminate");
  assert.equal(current.current, false);
  assert.ok(current.blockers.some(
    (blocker) => blocker.code === "target-scope-identity-mismatch",
  ), JSON.stringify(current.blockers, null, 2));
  const gate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(gate.status, 1, `${gate.stdout}\n${gate.stderr}`);
  assert.ok(JSON.parse(gate.stdout).blockers.some(
    (blocker) => blocker.code === "target-scope-identity-mismatch",
  ));

  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const trackerBefore = await readFile(trackerPath, "utf8");
  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-scope-change-completion",
    decision_id: "COMPLETE-800",
    author_confirmed: true,
  });
  assert.equal(completed.status, 1, `${completed.stdout}\n${completed.stderr}`);
  assert.equal(
    JSON.parse(completed.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );
  assert.equal(await readFile(trackerPath, "utf8"), trackerBefore);

  const reevaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-scope-change", 3),
  );
  assert.equal(reevaluated.status, 1, `${reevaluated.stdout}\n${reevaluated.stderr}`);
  const reevaluation = JSON.parse(reevaluated.stdout);
  assert.equal(reevaluation.evaluation.outcome, "indeterminate");
  assert.ok(reevaluation.evaluation.blockers.some(
    (blocker) => blocker.code === "target-scope-identity-mismatch",
  ));
  const finalGate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(finalGate.status, 1, `${finalGate.stdout}\n${finalGate.stderr}`);
});

test("target identity diagnostics include snapshot path and hash mismatches", async (t) => {
  const { projectRoot, manifestPath, evaluated } = await establishNoEditEvaluation(t);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const snapshot = JSON.parse(await readFile(
    path.join(projectRoot, manifest.current_scope.snapshot_path),
    "utf8",
  ));
  snapshot.author_confirmation.decision_id = "SCOPE-ALT";
  const alternateSnapshotRelative =
    ".author-toolkit/convergence/scopes/alternate-target.json";
  await writeJson(path.join(projectRoot, alternateSnapshotRelative), snapshot);
  manifest.current_scope.snapshot_path = alternateSnapshotRelative;
  manifest.current_scope.snapshot_sha256 = await fileSha256(
    path.join(projectRoot, alternateSnapshotRelative),
  );
  await writeJson(manifestPath, manifest);

  const status = runValidator(["--convergence-status", manifestPath]);
  assert.equal(status.status, 0, status.stderr);
  const current = JSON.parse(status.stdout);
  assert.equal(current.outcome, "indeterminate");
  assert.equal(current.current, false);
  const identityBlocker = current.blockers.find(
    (blocker) => blocker.code === "target-scope-identity-mismatch",
  );
  assert.ok(identityBlocker, JSON.stringify(current.blockers, null, 2));
  assert.match(identityBlocker.message, /snapshot_path/);
  assert.match(identityBlocker.message, /snapshot_sha256/);
  const gate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(gate.status, 1, `${gate.stdout}\n${gate.stderr}`);
});
