import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  computeScopeFingerprint,
  recordScope,
  validateStoryStateMarkdown,
} from "../scripts/lib/index.mjs";
import {
  appendRevisionExecutionApprovals,
  appendTrackerApproval as appendApproval,
  artifactAt,
  createConvergenceProject,
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

function creationDependencyFingerprint(summary, context, files) {
  return sha256(JSON.stringify({
    plan: summary,
    context: context.map(({ path: filePath, version, version_type }) => ({
      path: filePath,
      version,
      version_type,
    })),
    files: files.map(({ path: filePath, action, input_sha256 }) => ({
      path: filePath,
      action,
      input_sha256,
    })),
  }));
}

function storyStateMarkdown(value) {
  return `# Story state\n\n${value.summary}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

async function publishFirstCreation(projectRoot) {
  const contents = "The ferry leaves at dawn.\nMara watches it go.";
  const manuscriptPath = "manuscript/chapter-001.md";
  const manuscriptHash = sha256(contents);
  const batchId = "batch-first-001";
  const commitId = "commit-first-001";
  const scopeId = "scope-first-001";
  const stagingRelative = `.author-toolkit/creation/staging/${batchId}/chapter-001.md`;
  await mkdir(path.dirname(path.join(projectRoot, stagingRelative)), { recursive: true });
  await writeFile(path.join(projectRoot, stagingRelative), contents, "utf8");

  const planSummary = "Publish the accepted first chapter and synchronize its story state.";
  const context = [{
    path: "story-bible.md",
    version: sha256(await readFile(path.join(projectRoot, "story-bible.md"))),
    version_type: "sha256",
  }];
  const files = [{
    path: manuscriptPath,
    action: "create",
    input_sha256: null,
    output_sha256: manuscriptHash,
  }];
  const dependencyFingerprint = creationDependencyFingerprint(planSummary, context, files);
  const scopeFingerprint = computeScopeFingerprint({
    files: [{ path: manuscriptPath, sha256: manuscriptHash }],
    excluded_files: [],
  });
  for (const approval of [{
    id: "MANUSCRIPT-001",
    type: "creation-manuscript",
    paths: [manuscriptPath],
    reason: "Author accepted the exact first manuscript batch.",
  }, {
    id: "SCOPE-001",
    type: "creation-scope",
    paths: [manuscriptPath],
    reason: "Author accepted the complete first publication scope.",
  }]) {
    await appendApproval(projectRoot, {
      ...approval,
      operation: "chapter-review",
      scopeId,
      reason: `${approval.reason} batch_id=${batchId} dependency_fingerprint=${dependencyFingerprint} scope_fingerprint=${scopeFingerprint}`,
    });
  }

  await writeFile(path.join(projectRoot, manuscriptPath), contents, "utf8");
  await recordScope(projectRoot, {
    scope_id: scopeId,
    description: "The first nonempty manuscript in author-confirmed reading order.",
    status: "confirmed",
    files: [{ path: manuscriptPath, sha256: manuscriptHash }],
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
  const targetScope = await currentScopeReference(projectRoot);

  const chapterStateRelative = ".author-toolkit/creation/state/chapters/chapter-001.md";
  await mkdir(path.dirname(path.join(projectRoot, chapterStateRelative)), { recursive: true });
  const chapterState = {
    schema_version: "1.0.0",
    state_id: "chapter-001",
    level: "chapter",
    scope_id: scopeId,
    updated_at: timestamp,
    sources: [{ path: manuscriptPath, sha256: manuscriptHash }],
    summary: "Mara watches the ferry leave at dawn.",
    records: [],
    children: [],
  };
  await writeFile(
    path.join(projectRoot, chapterStateRelative),
    storyStateMarkdown(chapterState),
    "utf8",
  );
  const chapterStateReference = await artifactAt(projectRoot, chapterStateRelative);
  const currentStateRelative = ".author-toolkit/creation/state/current.md";
  const currentState = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: scopeId,
    updated_at: timestamp,
    sources: [chapterStateReference],
    summary: "The first accepted chapter establishes the opening story state.",
    records: [],
    children: [chapterStateReference],
  };
  await writeFile(
    path.join(projectRoot, currentStateRelative),
    storyStateMarkdown(currentState),
    "utf8",
  );
  const currentStateReference = await artifactAt(projectRoot, currentStateRelative);

  const commitRelative = `.author-toolkit/creation/batches/${commitId}.json`;
  await writeJson(path.join(projectRoot, commitRelative), {
    schema_version: "1.0.0",
    batch_id: batchId,
    commit_id: commitId,
    status: "committed",
    scope_before_id: null,
    scope_after_id: scopeId,
    files: files.map((file) => ({ ...file, backup_id: null, status: "verified" })),
    created_at: timestamp,
    updated_at: timestamp,
  });
  const batchRelative = `.author-toolkit/creation/batches/${batchId}.json`;
  await writeJson(path.join(projectRoot, batchRelative), {
    schema_version: "1.0.0",
    batch_id: batchId,
    operation: "chapter-creation",
    source_mode: "author",
    status: "committed",
    scope_id: scopeId,
    plan: {
      summary: planSummary,
      context,
      dependency_fingerprint: dependencyFingerprint,
    },
    files: files.map((file) => ({ ...file, status: "verified" })),
    story_state: [chapterStateReference, currentStateReference],
    approvals: ["MANUSCRIPT-001", "SCOPE-001"],
    commit: commitRelative,
    next_action: "Run revise-draft for the initial full-manuscript convergence evaluation.",
    created_at: timestamp,
    updated_at: timestamp,
  });

  return {
    contents,
    stagingRelative,
    chapterStateRelative,
    currentStateRelative,
    targetScope,
    batchReference: { batch_id: batchId, ...(await artifactAt(projectRoot, batchRelative)) },
    commitReference: {
      commit_id: commitId,
      batch_id: batchId,
      ...(await artifactAt(projectRoot, commitRelative)),
    },
  };
}

test("first nonempty publication resumes bootstrap through revise-draft with verified creation history", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const publication = await publishFirstCreation(projectRoot);

  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "intake",
      reason: "The first nonempty publication needs its initial full-manuscript evaluation.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });

  assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);
  const cycle = JSON.parse(transitioned.stdout).cycle;
  assert.equal(cycle.bootstrap, true);
  assert.equal(cycle.starting_scope, null);
  assert.equal(cycle.starting_evaluation, null);
  assert.equal(cycle.current_strategy, "revise-draft");
  assert.equal(cycle.change_set.from_scope, null);
  assert.deepEqual(cycle.change_set.to_scope, publication.targetScope);
  assert.deepEqual(cycle.change_set.created, [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(publication.contents),
  }]);
  assert.deepEqual(JSON.parse(transitioned.stdout).required_action, {
    strategy: "revise-draft",
    operation: "intake",
    command: "revise-draft",
  });
  assert.equal(await readFile(path.join(projectRoot, publication.stagingRelative), "utf8"), publication.contents);
  assert.equal(await readFile(path.join(projectRoot, "manuscript/chapter-001.md"), "utf8"), publication.contents);
  for (const statePath of [publication.chapterStateRelative, publication.currentStateRelative]) {
    assert.equal(validateStoryStateMarkdown(await readFile(path.join(projectRoot, statePath), "utf8")).valid, true);
  }
});


async function startAndLinkFirstPublication(projectRoot) {
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const publication = await publishFirstCreation(projectRoot);
  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "intake",
      reason: "The first nonempty publication needs its initial full-manuscript evaluation.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);
  return { publication, cycle: JSON.parse(transitioned.stdout).cycle };
}

test("bootstrap completes initial convergence before ordinary creation can begin", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const { publication, cycle: publishedCycle } = await startAndLinkFirstPublication(projectRoot);
  const evidence = await createNoEditEvidence(projectRoot);

  const blockedPlan = await runInput(projectRoot, "check-operation", {
    cycle_id: publishedCycle.cycle_id,
    strategy: "write-fiction",
    operation: "writing-plan",
    manuscript_change: true,
  });
  assert.equal(blockedPlan.status, 1, `${blockedPlan.stdout}\n${blockedPlan.stderr}`);
  assert.deepEqual(JSON.parse(blockedPlan.stdout).required_action, {
    strategy: "revise-draft",
    operation: "intake",
    command: "revise-draft",
  });

  const independent = await runInput(projectRoot, "evaluate-draft", {
    evaluation_id: "evaluation-independent-bootstrap",
    requested_pass: evidence.passReference,
    target_scope: publication.targetScope,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: [],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
  assert.equal(independent.status, 1, `${independent.stdout}\n${independent.stderr}`);
  assert.equal(JSON.parse(independent.stdout).blockers[0].code, "active-cycle-exists");

  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: publishedCycle.cycle_id,
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The initial full-manuscript pass and its three review perspectives are ready.",
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
    evidence.evaluationInput("evaluation-bootstrap-001", 3),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluationResult = JSON.parse(evaluated.stdout);
  assert.equal(evaluationResult.evaluation.outcome, "satisfied");
  assert.equal(evaluationResult.evaluation.cycle_id, publishedCycle.cycle_id);
  for (const [role, artifactId] of [
    ["creation-batch", publication.batchReference.batch_id],
    ["creation-commit", publication.commitReference.commit_id],
    ["review-group", evidence.reviewGroup.review_group_id],
  ]) {
    assert.ok(evaluationResult.evaluation.evidence_graph.artifacts.some(
      (artifact) => artifact.role === role && artifact.artifact_id === artifactId
    ), `${role} ${artifactId}`);
  }

  const premature = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-creation-002",
    initiating_strategy: "write-fiction",
    bootstrap: false,
    starting_scope: publication.targetScope,
  });
  assert.equal(premature.status, 1, `${premature.stdout}\n${premature.stderr}`);
  assert.equal(JSON.parse(premature.stdout).blockers[0].code, "active-cycle-exists");

  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: publishedCycle.cycle_id,
    expected_revision: 4,
    evaluation_id: "evaluation-bootstrap-001-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  const completedResult = JSON.parse(completed.stdout);
  const history = JSON.parse(await readFile(completedResult.cycle_path, "utf8"));
  assert.equal(history.bootstrap, true);
  assert.equal(history.starting_scope, null);
  assert.deepEqual(history.target_scope, publication.targetScope);
  assert.deepEqual(history.requested_pass, evidence.passReference);
  assert.deepEqual(history.related_artifacts.creation_batches, [publication.batchReference]);
  assert.deepEqual(history.related_artifacts.creation_commits, [publication.commitReference]);
  assert.ok(history.related_artifacts.review_groups.some(
    (reference) => reference.review_group_id === evidence.reviewGroup.review_group_id
  ));
  assert.equal(history.completion.decision_id, "COMPLETE-001");
  assert.equal(history.completion.target_evaluation_id, "evaluation-bootstrap-001-completion");

  const repeatedBootstrap = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-002",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(repeatedBootstrap.status, 1, `${repeatedBootstrap.stdout}\n${repeatedBootstrap.stderr}`);
  assert.equal(JSON.parse(repeatedBootstrap.stdout).blockers[0].code, "bootstrap-requires-empty-project");

  const ordinary = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-creation-002",
    initiating_strategy: "write-fiction",
    bootstrap: false,
    starting_scope: publication.targetScope,
  });
  assert.equal(ordinary.status, 0, `${ordinary.stdout}\n${ordinary.stderr}`);
  const ordinaryCycle = JSON.parse(ordinary.stdout).cycle;
  assert.equal(ordinaryCycle.bootstrap, false);
  assert.equal(ordinaryCycle.starting_evaluation.evaluation_id, "evaluation-bootstrap-001-completion");
  assert.equal(ordinaryCycle.related_artifacts.creation_commits.length, 0);
});


test("bootstrap cannot switch to revise-increment or reopen creation after first publication", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const { publication, cycle } = await startAndLinkFirstPublication(projectRoot);

  const increment = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "Attempt to use an increment without a converged previous scope.",
    },
  });
  assert.equal(increment.status, 1, `${increment.stdout}\n${increment.stderr}`);
  assert.equal(JSON.parse(increment.stdout).blockers[0].code, "creation-commit-limit");
  assert.deepEqual(JSON.parse(increment.stdout).required_action, {
    strategy: "revise-draft",
    operation: "intake",
    command: "revise-draft",
  });

  const reopened = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    current_strategy: "write-fiction",
    recovery_position: {
      operation: "writing-plan",
      reason: "Attempt to plan a second batch before initial convergence completes.",
    },
  });
  assert.equal(reopened.status, 1, `${reopened.stdout}\n${reopened.stderr}`);
  assert.equal(JSON.parse(reopened.stdout).blockers[0].code, "creation-commit-limit");

  const secondCommit = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    current_strategy: "revise-draft",
    related_artifacts: {
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(secondCommit.status, 1, `${secondCommit.stdout}\n${secondCommit.stderr}`);
  assert.equal(JSON.parse(secondCommit.stdout).blockers[0].code, "creation-commit-limit");
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 2);
  assert.equal(active.current_strategy, "revise-draft");
  assert.equal(active.related_artifacts.creation_commits.length, 1);
});


test("empty manuscript never receives a satisfied evaluation or completion decision", async (t) => {
  const blank = await createConvergenceProject(t);
  const blankStart = await runInput(blank.projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-empty",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(blankStart.status, 0, `${blankStart.stdout}\n${blankStart.stderr}`);
  const blankTracker = await readFile(path.join(blank.projectRoot, "audit-tracker.md"), "utf8");
  const blankCompletion = await runInput(blank.projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-empty",
    expected_revision: 1,
    evaluation_id: "evaluation-empty-completion",
    decision_id: "EMPTY-001",
    author_confirmed: true,
  });
  assert.equal(blankCompletion.status, 1, `${blankCompletion.stdout}\n${blankCompletion.stderr}`);
  assert.equal(
    JSON.parse(blankCompletion.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );
  assert.equal(await readFile(path.join(blank.projectRoot, "audit-tracker.md"), "utf8"), blankTracker);

  const { projectRoot } = await createConvergenceProject(t);
  const { cycle } = await startAndLinkFirstPublication(projectRoot);
  const evidence = await createNoEditEvidence(projectRoot);
  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Establish the initial evaluation before testing an empty-manuscript change.",
    },
    requested_pass: evidence.passReference,
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const satisfied = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-before-empty", 3),
  );
  assert.equal(satisfied.status, 0, `${satisfied.stdout}\n${satisfied.stderr}`);

  await unlink(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const emptyEvaluation = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-after-empty", 4),
  );
  assert.equal(emptyEvaluation.status, 1, `${emptyEvaluation.stdout}\n${emptyEvaluation.stderr}`);
  const emptyResult = JSON.parse(emptyEvaluation.stdout);
  assert.equal(emptyResult.evaluation.outcome, "not_satisfied");
  assert.ok(emptyResult.evaluation.blockers.some((blocker) => blocker.code === "empty-manuscript"));

  const completion = await runInput(projectRoot, "complete-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 5,
    evaluation_id: "evaluation-after-empty-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  });
  assert.equal(completion.status, 1, `${completion.stdout}\n${completion.stderr}`);
  assert.equal(
    JSON.parse(completion.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.status, "active");
  assert.equal(active.completion, null);
});


test("bootstrap evaluation requires the linked first publication rather than manuscript bytes alone", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const publication = await publishFirstCreation(projectRoot);
  const evidence = await createNoEditEvidence(projectRoot);
  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Attempt to evaluate without linking the first publication artifacts.",
    },
    target_scope: publication.targetScope,
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
    evidence.evaluationInput("evaluation-missing-first-publication", 2),
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "creation-commit-evidence-missing"
  ));
  assert.equal(result.cycle.completion, null);
});


test("bootstrap revise-draft preserves first creation in the cumulative change set after a verified edit", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const { publication, cycle } = await startAndLinkFirstPublication(projectRoot);
  const initialEvidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-bootstrap-plan-101",
    noEditDecisionId: "NOEDITPLAN-101",
  });
  const planned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "chapter-revision",
      reason: "Prepare the exact approved initial-pass edit.",
    },
    requested_pass: initialEvidence.passReference,
  });
  assert.equal(planned.status, 0, `${planned.stdout}\n${planned.stderr}`);

  const revisedContents = "The ferry leaves at dusk.\nMara watches it go.";
  const planRelative = "sessions/bootstrap-plan-101.md";
  await writeFile(path.join(projectRoot, planRelative), "# Initial revision plan\n", "utf8");
  const batchRelative = "sessions/bootstrap-batch-101.json";
  await writeJson(path.join(projectRoot, batchRelative), {
    batch_id: "bootstrap-batch-101",
    action: "Change dawn to dusk in the first chapter.",
  });
  const backupRelative = ".author-toolkit/backups/backup-bootstrap-101/manuscript/chapter-001.md";
  const backupManifestRelative = ".author-toolkit/backups/backup-bootstrap-101/manifest.json";
  await writeBackupEvidence(projectRoot, {
    backupId: "backup-bootstrap-101",
    approvalId: "EDIT-101",
    scope: publication.targetScope,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(publication.contents),
      output_sha256: sha256(revisedContents),
      contents: publication.contents,
    }],
  });
  const execution = {
    cycle_id: cycle.cycle_id,
    expected_revision: 3,
    execution_id: "execution-bootstrap-101",
    plan: { plan_id: "bootstrap-plan-101", ...(await artifactAt(projectRoot, planRelative)) },
    batch: { batch_id: "bootstrap-batch-101", ...(await artifactAt(projectRoot, batchRelative)) },
    requested_pass: initialEvidence.passReference,
    input_scope: publication.targetScope,
    finding_dispositions: [],
    author_decision_ids: ["PLAN-101"],
    approval_ids: ["EDIT-101"],
    backups: [{
      backup_id: "backup-bootstrap-101",
      approval_id: "EDIT-101",
      manifest: await artifactAt(projectRoot, backupManifestRelative),
      files: [{
        path: "manuscript/chapter-001.md",
        backup_path: backupRelative,
        sha256: sha256(publication.contents),
      }],
    }],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(publication.contents),
      output_sha256: sha256(revisedContents),
    }],
  };
  await appendRevisionExecutionApprovals(projectRoot, execution, {
    planReason: "Author approved the exact initial revision plan.",
    editReason: "Author approved the exact initial edit input and output versions.",
  });
  const prepared = await runInput(projectRoot, "prepare-revision-execution", execution);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);

  await writeFile(path.join(projectRoot, "manuscript/chapter-001.md"), revisedContents, "utf8");
  await recordScope(projectRoot, {
    scope_id: publication.targetScope.scope_id,
    description: "The first manuscript after its verified initial revision.",
    status: "confirmed",
    files: [{ path: "manuscript/chapter-001.md", sha256: sha256(revisedContents) }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-101",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  const revisedTarget = await currentScopeReference(projectRoot);
  const finalEvidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-bootstrap-final-101",
    noEditDecisionId: "NOEDITFINAL-101",
  });
  const verified = await runInput(projectRoot, "verify-revision-execution", {
    cycle_id: cycle.cycle_id,
    expected_revision: 4,
    execution_id: "execution-bootstrap-101",
    requested_pass: finalEvidence.passReference,
    target_scope: revisedTarget,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  const verifiedCycle = JSON.parse(verified.stdout).cycle;
  assert.equal(verifiedCycle.change_set.from_scope, null);
  assert.deepEqual(verifiedCycle.change_set.created, [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(revisedContents),
  }]);
  assert.deepEqual(verifiedCycle.change_set.modified, []);

  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 5,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The verified initial edit has new full-target coverage and review.",
    },
    related_artifacts: {
      review_groups: [finalEvidence.reviewGroupReference],
      reviews: finalEvidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [finalEvidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    finalEvidence.evaluationInput("evaluation-bootstrap-edited-101", 6),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluation = JSON.parse(evaluated.stdout).evaluation;
  assert.equal(evaluation.outcome, "satisfied");
  assert.ok(evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "revision-execution" &&
      artifact.artifact_id === "execution-bootstrap-101"
  ));
  assert.ok(evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "creation-commit" &&
      artifact.artifact_id === publication.commitReference.commit_id
  ));
});


test("bootstrap cannot enter revise-increment before its first publication", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "Attempt to enter increment before any converged previous scope exists.",
    },
  });
  assert.equal(transitioned.status, 1, `${transitioned.stdout}\n${transitioned.stderr}`);
  const result = JSON.parse(transitioned.stdout);
  assert.equal(result.blockers[0].code, "cycle-operation-mismatch");
  assert.deepEqual(result.required_action, {
    strategy: "write-fiction",
    operation: "creation-baseline",
    command: "write-fiction",
  });
  assert.equal(result.state_written, false);
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 1);
  assert.equal(active.current_strategy, "write-fiction");
});


test("a rejected empty bootstrap cannot complete before its first approved import reaches initial convergence", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-import-901",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);

  const rejectedContents = "Rejected first staging draft.\n";
  const rejectedFiles = [{
    path: "manuscript/chapter-001.md",
    action: "create",
    input_sha256: null,
    output_sha256: sha256(rejectedContents),
  }];
  const rejectedDependencyFingerprint = sha256("Rejected first bootstrap batch.");
  await writeJson(
    path.join(projectRoot, ".author-toolkit", "creation", "batches", "batch-rejected-bootstrap-901.json"),
    {
      schema_version: "1.0.0",
      batch_id: "batch-rejected-bootstrap-901",
      operation: "chapter-creation",
      source_mode: "author",
      status: "rejected",
      scope_id: null,
      plan: {
        summary: "Reject the first staged bootstrap draft without publication.",
        context: [],
        dependency_fingerprint: rejectedDependencyFingerprint,
      },
      files: rejectedFiles.map((file) => ({ ...file, status: "staged" })),
      story_state: [],
      approvals: ["REJECT-901"],
      commit: null,
      next_action: "Preserve rejected staging and await an approved nonempty import.",
      created_at: timestamp,
      updated_at: timestamp,
    },
  );
  await appendApproval(projectRoot, {
    id: "REJECT-901",
    type: "creation-rejection",
    operation: "chapter-review",
    scopeId: "scope-rejected-bootstrap-901",
    paths: ["manuscript/chapter-001.md"],
    reason: `Author rejected the first empty-project staging batch. batch_id=batch-rejected-bootstrap-901 dependency_fingerprint=${rejectedDependencyFingerprint} scope_fingerprint=${computeScopeFingerprint({ files: [], excluded_files: [] })}`,
  });
  const trackerBeforeRejectedCompletion = await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8");
  const rejectedCompletion = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-import-901",
    expected_revision: 1,
    evaluation_id: "evaluation-rejected-bootstrap-901",
    decision_id: "REJECTCOMPLETE-901",
    author_confirmed: true,
  });
  assert.equal(rejectedCompletion.status, 1, `${rejectedCompletion.stdout}\n${rejectedCompletion.stderr}`);
  assert.equal(
    JSON.parse(rejectedCompletion.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );
  assert.equal(await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8"), trackerBeforeRejectedCompletion);
  const rejectedActive = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(rejectedActive.revision, 1);
  assert.equal(rejectedActive.starting_scope, null);
  assert.equal(rejectedActive.target_scope, null);

  const importedContents = "First approved external chapter.\n";
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), importedContents, "utf8");
  await recordScope(projectRoot, {
    scope_id: "scope-bootstrap-import-901",
    description: "The first approved nonempty external manuscript.",
    status: "confirmed",
    files: [{ path: "manuscript/chapter-001.md", sha256: sha256(importedContents) }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "IMPORT-901",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  const targetScope = await currentScopeReference(projectRoot);
  const chapterState = {
    schema_version: "1.0.0",
    state_id: "imported-chapter-901",
    level: "chapter",
    scope_id: targetScope.scope_id,
    updated_at: timestamp,
    sources: [{ path: "manuscript/chapter-001.md", sha256: sha256(importedContents) }],
    summary: "Observed facts from the first approved external chapter.",
    records: [],
    children: [],
  };
  const chapterRelative = ".author-toolkit/creation/state/chapters/imported-chapter-901.md";
  await mkdir(path.dirname(path.join(projectRoot, chapterRelative)), { recursive: true });
  await writeFile(
    path.join(projectRoot, chapterRelative),
    storyStateMarkdown(chapterState),
    "utf8",
  );
  const chapterReference = await artifactAt(projectRoot, chapterRelative);
  const currentState = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: targetScope.scope_id,
    updated_at: timestamp,
    sources: [chapterReference],
    summary: "Current state after the first approved external import.",
    records: [],
    children: [chapterReference],
  };
  const currentRelative = ".author-toolkit/creation/state/current.md";
  await writeFile(path.join(projectRoot, currentRelative), storyStateMarkdown(currentState), "utf8");
  const currentReference = await artifactAt(projectRoot, currentRelative);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-901",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author approved the first nonempty external import and story state. reconciliation_id=reconciliation-bootstrap-import-901 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-bootstrap-import-901",
    cycle_id: "cycle-bootstrap-import-901",
    expected_revision: 1,
    author_decision_id: "IMPORT-901",
    target_scope: targetScope,
    story_state: [chapterReference, currentReference],
  });
  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const reconciliation = JSON.parse(reconciled.stdout);
  assert.equal(reconciliation.cycle.starting_scope, null);
  assert.equal(reconciliation.cycle.starting_evaluation, null);
  assert.equal(reconciliation.cycle.current_strategy, "revise-draft");
  assert.equal(reconciliation.cycle.recovery_position.operation, "intake");
  assert.equal(reconciliation.cycle.change_set.from_scope, null);
  assert.deepEqual(reconciliation.cycle.change_set.created, [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(importedContents),
  }]);
  assert.deepEqual(reconciliation.cycle.work_set.entries.map((entry) => entry.path), [
    "manuscript/chapter-001.md",
  ]);
  assert.deepEqual(reconciliation.reconciliation.proof_blockers, []);

  const evidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-bootstrap-import-901",
    noEditDecisionId: "NOEDITIMPORT-901",
  });
  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-import-901",
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The first approved import has its initial full-manuscript evidence and review.",
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
    evidence.evaluationInput("evaluation-bootstrap-import-901", 3, "cycle-bootstrap-import-901"),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluation = JSON.parse(evaluated.stdout).evaluation;
  assert.equal(evaluation.outcome, "satisfied");
  assert.ok(evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "manuscript-reconciliation" &&
      artifact.artifact_id === "reconciliation-bootstrap-import-901"
  ));
  assert.ok(!evaluation.blockers.some((blocker) => blocker.code === "creation-commit-evidence-missing"));

  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-import-901",
    expected_revision: 4,
    evaluation_id: "evaluation-bootstrap-import-901-completion",
    decision_id: "COMPLETE-901",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  const completedCycle = JSON.parse(completed.stdout).cycle;
  assert.equal(completedCycle.status, "completed");
  assert.equal(completedCycle.current_strategy, "revise-draft");
  assert.equal(completedCycle.starting_scope, null);
  assert.equal(completedCycle.related_artifacts.creation_commits.length, 0);
  assert.equal(completedCycle.related_artifacts.reconciliations.length, 1);
  assert.equal(completedCycle.completion.decision_id, "COMPLETE-901");
});

test("publication replaces a staged batch reference with its committed identity", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-staged-reference",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const publication = await publishFirstCreation(projectRoot);
  const batchPath = path.join(projectRoot, publication.batchReference.path);
  const committedBatch = JSON.parse(await readFile(batchPath, "utf8"));
  await writeJson(batchPath, {
    ...committedBatch,
    status: "awaiting_author",
    files: committedBatch.files.map((file) => ({ ...file, status: "staged" })),
    story_state: [],
    approvals: ["PLAN-001"],
    commit: null,
  });
  const stagedReference = {
    batch_id: committedBatch.batch_id,
    ...(await artifactAt(projectRoot, publication.batchReference.path)),
  };
  const staged = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-staged-reference",
    expected_revision: 1,
    current_strategy: "write-fiction",
    recovery_position: {
      operation: "chapter-review",
      reason: "The staged batch awaits author review.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [stagedReference],
    },
  });
  assert.equal(staged.status, 0, `${staged.stdout}\n${staged.stderr}`);

  await writeJson(batchPath, committedBatch);
  const published = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-staged-reference",
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "intake",
      reason: "The committed batch awaits initial full-manuscript revision.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(published.status, 0, `${published.stdout}\n${published.stderr}`);
  const cycle = JSON.parse(published.stdout).cycle;
  assert.equal(cycle.revision, 3);
  assert.equal(cycle.current_strategy, "revise-draft");
  assert.deepEqual(cycle.related_artifacts.creation_batches, [publication.batchReference]);
  assert.deepEqual(cycle.related_artifacts.creation_commits, [publication.commitReference]);
});
