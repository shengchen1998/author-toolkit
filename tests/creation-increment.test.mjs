import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { computeScopeFingerprint, recordScope } from "../scripts/lib/index.mjs";
import {
  appendRevisionExecutionApprovals,
  appendTrackerApproval as appendApproval,
  artifactAt,
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

function creationDependencyFingerprint(summary, context, files) {
  return sha256(JSON.stringify({
    plan: summary,
    context: context.map(({ path: filePath, version, version_type }) => ({
      path: filePath,
      version,
      version_type,
    })).sort((left, right) =>
      left.path.localeCompare(right.path) ||
      left.version_type.localeCompare(right.version_type) ||
      left.version.localeCompare(right.version)
    ),
    files: files.map(({ path: filePath, action, input_sha256 }) => ({
      path: filePath,
      action,
      input_sha256,
    })).sort((left, right) => left.path.localeCompare(right.path)),
  }));
}

function creationApprovalReason(text, batchId, dependencyFingerprint, scopeFingerprint) {
  return `${text} batch_id=${batchId} dependency_fingerprint=${dependencyFingerprint} scope_fingerprint=${scopeFingerprint}`;
}

async function confirmScope(projectRoot, scopeId, files, decisionId) {
  await recordScope(projectRoot, {
    scope_id: scopeId,
    description: "The complete confirmed manuscript in reading order.",
    status: "confirmed",
    files: files.map((file) => ({ path: file.path, sha256: file.sha256 })),
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

async function establishSatisfiedBase(t, { twoChapters = false } = {}) {
  const { projectRoot } = await createConvergenceProject(t);
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const secondOriginal = "The harbor master rings once.\nMara keeps her ticket hidden.";
  const baseFiles = [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(original),
  }];
  if (twoChapters) {
    baseFiles.push({ path: "manuscript/chapter-002.md", sha256: sha256(secondOriginal) });
  }
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), original, "utf8");
  if (twoChapters) {
    await writeFile(path.join(projectRoot, "manuscript", "chapter-002.md"), secondOriginal, "utf8");
  }
  const startingScope = await confirmScope(projectRoot, "scope-base-001", baseFiles, "SCOPE-001");
  const firstPublication = await createFirstPublicationArtifacts(projectRoot);
  const evidence = await createNoEditEvidence(projectRoot);
  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Establish the satisfied full-manuscript creation baseline.",
    },
    target_scope: startingScope,
    requested_pass: evidence.passReference,
    related_artifacts: {
      ...firstPublication.relatedArtifacts,
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-base-001", 2),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-base-001-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  return { projectRoot, startingScope, baseEvidence: evidence, original, secondOriginal };
}

async function startOrdinaryCreation(fixture) {
  const started = await runInput(fixture.projectRoot, "start-cycle", {
    cycle_id: "cycle-creation-002",
    initiating_strategy: "write-fiction",
    bootstrap: false,
    starting_scope: fixture.startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  return JSON.parse(started.stdout).cycle;
}

async function publishMultiChapterBatch(fixture) {
  const { projectRoot, startingScope } = fixture;
  const startingSnapshot = JSON.parse(
    await readFile(path.join(projectRoot, startingScope.snapshot_path), "utf8"),
  );
  const retainedFiles = startingSnapshot.files;
  const chapters = [
    {
      path: `manuscript/chapter-${String(retainedFiles.length + 1).padStart(3, "0")}.md`,
      contents: "The next ferry arrives at noon.\nMara finds the missing letter.",
    },
    {
      path: `manuscript/chapter-${String(retainedFiles.length + 2).padStart(3, "0")}.md`,
      contents: "At dusk, Mara follows the lantern.\nThe harbor answers with three bells.",
    },
  ];
  for (const chapter of chapters) {
    const staged = path.join(
      projectRoot,
      ".author-toolkit",
      "creation",
      "staging",
      "batch-002",
      path.basename(chapter.path),
    );
    await mkdir(path.dirname(staged), { recursive: true });
    await writeFile(staged, chapter.contents, "utf8");
    await writeFile(path.join(projectRoot, chapter.path), chapter.contents, "utf8");
  }
  const files = chapters.map((chapter) => ({
    path: chapter.path,
    action: "create",
    input_sha256: null,
    output_sha256: sha256(chapter.contents),
  }));
  const createdFiles = files.map(({ path: filePath, output_sha256 }) => ({
    path: filePath,
    sha256: output_sha256,
  }));
  let targetFiles = [...retainedFiles, ...createdFiles];
  if (fixture.insertBefore) targetFiles = [...createdFiles, ...retainedFiles];
  if (fixture.insertMiddle) {
    assert.ok(retainedFiles.length >= 2, "middle insertion requires two retained chapters");
    targetFiles = [retainedFiles[0], ...createdFiles, ...retainedFiles.slice(1)];
  }
  if (fixture.reorderWithoutJournal) {
    assert.ok(retainedFiles.length >= 2, "retained reorder requires two retained chapters");
    targetFiles = [retainedFiles[1], retainedFiles[0], ...createdFiles];
  }
  const storyBibleHash = sha256(await readFile(path.join(projectRoot, "story-bible.md")));
  const planSummary = "Publish two coherent chapters in one explicitly approved batch.";
  const context = [{ path: "story-bible.md", version: storyBibleHash, version_type: "sha256" }];
  const dependencyFingerprint = creationDependencyFingerprint(planSummary, context, files);
  const scopeFingerprint = computeScopeFingerprint({ files: targetFiles, excluded_files: [] });
  const targetScopeId = "scope-creation-002";
  for (const approval of [{
    id: "MANUSCRIPT-002",
    type: fixture.manuscriptApprovalType ?? "creation-manuscript",
    operation: "chapter-review",
    paths: files.map((file) => file.path),
    reason: creationApprovalReason(
      "Author accepted the exact two-chapter manuscript batch.",
      "batch-002",
      fixture.manuscriptDependencyOverride ?? dependencyFingerprint,
      scopeFingerprint,
    ),
  }, {
    id: "SCOPE-002",
    type: fixture.scopeApprovalType ?? "creation-scope",
    operation: "chapter-review",
    paths: targetFiles.map((file) => file.path),
    reason: creationApprovalReason(
      "Author accepted the complete expanded publication scope and reading order.",
      "batch-002",
      dependencyFingerprint,
      scopeFingerprint,
    ),
  }]) {
    if (!fixture.skipApprovals) {
      await appendApproval(projectRoot, {
        ...approval,
        scopeId: targetScopeId,
      });
    }
  }
  const targetScope = await confirmScope(
    projectRoot,
    targetScopeId,
    targetFiles,
    "SCOPE-002",
  );
  const commitRelative = ".author-toolkit/creation/batches/commit-002.json";
  await writeJson(path.join(projectRoot, commitRelative), {
    schema_version: "1.0.0",
    batch_id: "batch-002",
    commit_id: "commit-002",
    status: "committed",
    scope_before_id: startingScope.scope_id,
    scope_after_id: targetScope.scope_id,
    files: files.map((file) => ({ ...file, backup_id: null, status: "verified" })),
    created_at: timestamp,
    updated_at: timestamp,
  });
  const batchRelative = ".author-toolkit/creation/batches/batch-002.json";
  await writeJson(path.join(projectRoot, batchRelative), {
    schema_version: "1.0.0",
    batch_id: "batch-002",
    operation: "chapter-creation",
    source_mode: "mixed",
    status: "committed",
    scope_id: targetScope.scope_id,
    plan: {
      summary: planSummary,
      context,
      dependency_fingerprint: dependencyFingerprint,
    },
    files: files.map((file) => ({ ...file, status: "verified" })),
    story_state: [],
    approvals: ["MANUSCRIPT-002", "SCOPE-002"],
    commit: commitRelative,
    next_action: "Run revise-increment for the complete expanded manuscript.",
    created_at: timestamp,
    updated_at: timestamp,
  });
  return {
    chapters,
    targetFiles,
    targetScope,
    batchReference: { batch_id: "batch-002", ...(await artifactAt(projectRoot, batchRelative)) },
    commitReference: {
      commit_id: "commit-002",
      batch_id: "batch-002",
      ...(await artifactAt(projectRoot, commitRelative)),
    },
  };
}

test("ordinary creation links one multi-chapter commit and blocks the next writing plan", async (t) => {
  const fixture = await establishSatisfiedBase(t);
  const cycle = await startOrdinaryCreation(fixture);
  const startingSnapshot = await readFile(
    path.join(fixture.projectRoot, fixture.startingScope.snapshot_path),
    "utf8",
  );
  const publication = await publishMultiChapterBatch(fixture);
  const transitioned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "The accepted creation batch is published; restore full-target convergence.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);
  const linked = JSON.parse(transitioned.stdout).cycle;
  assert.equal(linked.initiating_strategy, "write-fiction");
  assert.equal(linked.current_strategy, "revise-increment");
  assert.equal(linked.starting_scope.scope_fingerprint, fixture.startingScope.scope_fingerprint);
  assert.equal(linked.target_scope.scope_fingerprint, publication.targetScope.scope_fingerprint);
  assert.deepEqual(linked.related_artifacts.creation_commits, [publication.commitReference]);
  assert.equal(linked.related_artifacts.creation_commits[0].files, undefined);
  assert.deepEqual(linked.change_set.created, publication.chapters.map((chapter) => ({
    path: chapter.path,
    sha256: sha256(chapter.contents),
  })));
  assert.equal(
    await readFile(path.join(fixture.projectRoot, fixture.startingScope.snapshot_path), "utf8"),
    startingSnapshot,
  );

  const blocked = await runInput(fixture.projectRoot, "check-operation", {
    cycle_id: cycle.cycle_id,
    strategy: "write-fiction",
    operation: "writing-plan",
    manuscript_change: true,
  });
  assert.equal(blocked.status, 1, `${blocked.stdout}\n${blocked.stderr}`);
  const blockedResult = JSON.parse(blocked.stdout);
  assert.deepEqual(blockedResult.required_action, {
    strategy: "revise-increment",
    operation: "intake",
    command: "revise-increment",
  });
  assert.equal(blockedResult.cycle.revision, linked.revision);

  const reopened = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: linked.revision,
    current_strategy: "write-fiction",
    recovery_position: {
      operation: "writing-plan",
      reason: "Attempt to plan another batch before the publication cycle completes.",
    },
  });
  assert.equal(reopened.status, 1, `${reopened.stdout}\n${reopened.stderr}`);
  const reopenedResult = JSON.parse(reopened.stdout);
  assert.equal(reopenedResult.blockers[0].code, "creation-commit-limit");
  assert.deepEqual(reopenedResult.required_action, blockedResult.required_action);
  const active = JSON.parse(await readFile(
    path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, linked.revision);
  assert.equal(active.current_strategy, "revise-increment");

  const secondCommit = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: linked.revision,
    current_strategy: "revise-increment",
    related_artifacts: {
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(secondCommit.status, 1, `${secondCommit.stdout}\n${secondCommit.stderr}`);
  assert.equal(JSON.parse(secondCommit.stdout).blockers[0].code, "creation-commit-limit");
});

test("revise-increment resumes creation with eligible local reuse and full-target evidence", async (t) => {
  const fixture = await establishSatisfiedBase(t);
  const cycle = await startOrdinaryCreation(fixture);
  const publication = await publishMultiChapterBatch(fixture);
  const published = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "Resume the originating cycle after one accepted publication.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(published.status, 0, `${published.stdout}\n${published.stderr}`);

  const evidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-increment-002",
    baselinePass: fixture.baseEvidence.passReference,
    noEditDecisionId: "NOEDIT-002",
    reusedCoverageUnits: fixture.baseEvidence.coverageUnits,
  });
  const retained = evidence.coverageUnits.find(
    ({ unit }) => unit.unit_id === fixture.baseEvidence.coverageUnits[0].unit.unit_id,
  );
  assert.deepEqual(retained.unit.paths, [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(fixture.original),
  }]);
  const added = evidence.coverageUnits.find(
    ({ unit }) => unit.unit_id === "pass-increment-002-diagnostics-local",
  );
  assert.deepEqual(added.unit.paths.map((file) => file.path), [
    "manuscript/chapter-002.md",
    "manuscript/chapter-003.md",
  ]);
  const reviewed = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "New full-target syntheses and all three full-target reviews are ready.",
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
    fixture.projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-increment-002", 3, cycle.cycle_id),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluationResult = JSON.parse(evaluated.stdout);
  assert.equal(evaluationResult.evaluation.outcome, "satisfied");
  assert.equal(
    evaluationResult.evaluation.review_group.review_group_id,
    evidence.reviewGroup.review_group_id,
  );
  assert.notEqual(
    evidence.reviewGroup.scope_fingerprint,
    fixture.baseEvidence.reviewGroup.scope_fingerprint,
  );
  assert.ok(evaluationResult.evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "coverage-unit" &&
      artifact.artifact_id === fixture.baseEvidence.coverageUnits[0].unit.unit_id
  ));
  assert.ok(evaluationResult.evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "creation-batch" && artifact.artifact_id === "batch-002"
  ), JSON.stringify(evaluationResult.evaluation.evidence_graph, null, 2));
  assert.ok(evaluationResult.evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "creation-commit" && artifact.artifact_id === "commit-002"
  ));

  const completed = await runInput(fixture.projectRoot, "complete-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 4,
    evaluation_id: "evaluation-increment-002-completion",
    decision_id: "COMPLETE-002",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  const completedCycle = JSON.parse(completed.stdout).cycle;
  assert.equal(completedCycle.starting_scope.scope_fingerprint, fixture.startingScope.scope_fingerprint);
  assert.equal(completedCycle.target_scope.scope_fingerprint, publication.targetScope.scope_fingerprint);

  const next = await runInput(fixture.projectRoot, "start-cycle", {
    cycle_id: "cycle-creation-003",
    initiating_strategy: "write-fiction",
    bootstrap: false,
    starting_scope: publication.targetScope,
  });
  assert.equal(next.status, 0, `${next.stdout}\n${next.stderr}`);
});


async function createRejectedBatch(fixture) {
  const { projectRoot, startingScope } = fixture;
  const stagedContents = "This rejected chapter must never enter the manuscript.";
  const stagedRelative = ".author-toolkit/creation/staging/batch-rejected-002/chapter-002.md";
  const stagedPath = path.join(projectRoot, stagedRelative);
  await mkdir(path.dirname(stagedPath), { recursive: true });
  await writeFile(stagedPath, stagedContents, "utf8");
  const storyBibleHash = sha256(await readFile(path.join(projectRoot, "story-bible.md")));
  const planSummary = "Reject the staged chapter without publishing any manuscript bytes.";
  const context = [{ path: "story-bible.md", version: storyBibleHash, version_type: "sha256" }];
  const files = [{
    path: "manuscript/chapter-002.md",
    action: "create",
    input_sha256: null,
    output_sha256: sha256(stagedContents),
    status: "staged",
  }];
  const dependencyFingerprint = creationDependencyFingerprint(planSummary, context, files);
  const approvalReason = creationApprovalReason(
    "Author rejected the exact staged batch and preserved it outside the manuscript.",
    "batch-rejected-002",
    dependencyFingerprint,
    startingScope.scope_fingerprint,
  );
  const batchRelative = ".author-toolkit/creation/batches/batch-rejected-002.json";
  await writeJson(path.join(projectRoot, batchRelative), {
    schema_version: "1.0.0",
    batch_id: "batch-rejected-002",
    operation: "chapter-review",
    source_mode: "ai",
    status: "rejected",
    scope_id: startingScope.scope_id,
    plan: {
      summary: planSummary,
      context,
      dependency_fingerprint: dependencyFingerprint,
    },
    files,
    story_state: [],
    approvals: ["REJECT-002"],
    commit: null,
    next_action: "Revalidate the unchanged starting scope and complete the no-change cycle.",
    created_at: timestamp,
    updated_at: timestamp,
  });
  return {
    stagedPath,
    approvalReason,
    batchReference: {
      batch_id: "batch-rejected-002",
      ...(await artifactAt(projectRoot, batchRelative)),
    },
  };
}

test("rejected staging requires its decision and completes only after starting-scope revalidation", async (t) => {
  const fixture = await establishSatisfiedBase(t);
  const cycle = await startOrdinaryCreation(fixture);
  const rejected = await createRejectedBatch(fixture);
  const evidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-rejected-002",
    baselinePass: fixture.baseEvidence.passReference,
    noEditDecisionId: "NOEDITREJECT-002",
    reusedCoverageUnits: fixture.baseEvidence.coverageUnits,
  });
  const transitionInput = {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Rejected staging published nothing; revalidate the unchanged starting scope.",
    },
    target_scope: fixture.startingScope,
    requested_pass: evidence.passReference,
    related_artifacts: {
      creation_batches: [rejected.batchReference],
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  };
  const unauthorized = await runInput(fixture.projectRoot, "transition-cycle", transitionInput);
  assert.equal(unauthorized.status, 1, `${unauthorized.stdout}\n${unauthorized.stderr}`);
  assert.equal(
    JSON.parse(unauthorized.stdout).blockers[0].code,
    "creation-rejection-approval-missing",
  );
  await appendApproval(fixture.projectRoot, {
    id: "REJECT-002",
    type: "creation-rejection",
    operation: "chapter-review",
    scopeId: fixture.startingScope.scope_id,
    paths: ["manuscript/chapter-002.md"],
    reason: rejected.approvalReason,
  });
  const transitioned = await runInput(fixture.projectRoot, "transition-cycle", transitionInput);
  assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-rejected-002", 2, cycle.cycle_id),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
  assert.equal(
    await readFile(rejected.stagedPath, "utf8"),
    "This rejected chapter must never enter the manuscript.",
  );
  await assert.rejects(readFile(path.join(fixture.projectRoot, "manuscript", "chapter-002.md"), "utf8"), {
    code: "ENOENT",
  });
  const completed = await runInput(fixture.projectRoot, "complete-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 3,
    evaluation_id: "evaluation-rejected-002-completion",
    decision_id: "COMPLETE-002",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  const completedCycle = JSON.parse(completed.stdout).cycle;
  assert.equal(completedCycle.related_artifacts.creation_commits.length, 0);
  assert.equal(completedCycle.target_scope.scope_fingerprint, fixture.startingScope.scope_fingerprint);
});


test("creation publication rejects approval identifiers without current author decisions", async (t) => {
  const fixture = await establishSatisfiedBase(t);
  fixture.skipApprovals = true;
  const cycle = await startOrdinaryCreation(fixture);
  const publication = await publishMultiChapterBatch(fixture);
  const transitioned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "Attempt to link publication without the required author acceptance rows.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(transitioned.status, 1, `${transitioned.stdout}\n${transitioned.stderr}`);
  const result = JSON.parse(transitioned.stdout);
  assert.equal(result.blockers[0].code, "creation-approval-missing");
  assert.equal(result.state_written, false);
  const active = JSON.parse(await readFile(
    path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.related_artifacts.creation_commits.length, 0);
});


function continuityFinding() {
  return {
    id: "REVIEW-102",
    audit: "intent and consistency review",
    technique: "continuity",
    severity: "suggestion",
    location: { file: "manuscript/chapter-002.md", scope: "file" },
    issue: "The letter discovery needs a consistent transition from the opening chapter.",
    recommendation: "Clarify the approved discovery passage without changing the other chapters.",
    confidence: "judgment",
  };
}

async function injectContinuityFinding(projectRoot, evidence, finding) {
  const reportReference = evidence.reviewReports[0];
  const reportPath = path.join(projectRoot, reportReference.path);
  const markdown = await readFile(reportPath, "utf8");
  const match = markdown.match(/```json\n([\s\S]+?)\n```/);
  assert.ok(match);
  const envelope = JSON.parse(match[1]);
  envelope.findings.push(finding);
  await writeFile(reportPath, markdown.replace(match[1], JSON.stringify(envelope, null, 2)), "utf8");
  reportReference.sha256 = sha256(await readFile(reportPath));

  const groupPath = path.join(projectRoot, evidence.reviewGroupReference.path);
  evidence.reviewGroup.reports.find((report) => report.path === reportReference.path).sha256 =
    reportReference.sha256;
  await writeJson(groupPath, evidence.reviewGroup);
  evidence.reviewGroupReference.sha256 = sha256(await readFile(groupPath));
  const reviewClaim = evidence.hostAttestation.claims.find(
    (claim) => claim.claim_type === "review-semantics",
  );
  for (const artifact of reviewClaim.artifacts) {
    if (artifact.path === reportReference.path) artifact.sha256 = reportReference.sha256;
    if (artifact.path === evidence.reviewGroupReference.path) {
      artifact.sha256 = evidence.reviewGroupReference.sha256;
    }
  }
  const attestationPath = path.join(projectRoot, evidence.hostAttestationReference.path);
  await writeJson(attestationPath, evidence.hostAttestation);
  evidence.hostAttestationReference.sha256 = sha256(await readFile(attestationPath));

  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|---|---|\n";
  const index = tracker.indexOf(separator, tracker.indexOf("## Findings"));
  const row = `| ${finding.id} | current-scope-review | intent | ${finding.location.file} | open | ${reportReference.path} | ${timestamp} | Author decision is required after full-target review. |\n`;
  await writeFile(
    trackerPath,
    tracker.slice(0, index + separator.length) + row + tracker.slice(index + separator.length),
    "utf8",
  );
}

test("accepted increment review findings reenter verified execution before convergence", async (t) => {
  const fixture = await establishSatisfiedBase(t);
  const cycle = await startOrdinaryCreation(fixture);
  const publication = await publishMultiChapterBatch(fixture);
  const published = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "Resume the originating creation cycle.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(published.status, 0, `${published.stdout}\n${published.stderr}`);
  const initialEvidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-increment-review-002",
    baselinePass: fixture.baseEvidence.passReference,
    noEditDecisionId: "NOEDITREVIEW-002",
    reusedCoverageUnits: fixture.baseEvidence.coverageUnits,
  });
  const finding = continuityFinding();
  await injectContinuityFinding(fixture.projectRoot, initialEvidence, finding);
  const reviewed = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Full-target review has returned a continuity finding.",
    },
    requested_pass: initialEvidence.passReference,
    related_artifacts: {
      review_groups: [initialEvidence.reviewGroupReference],
      reviews: initialEvidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [initialEvidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const openEvaluation = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    initialEvidence.evaluationInput("evaluation-increment-open-002", 3, cycle.cycle_id),
  );
  assert.equal(openEvaluation.status, 1, `${openEvaluation.stdout}\n${openEvaluation.stderr}`);
  assert.ok(JSON.parse(openEvaluation.stdout).evaluation.blockers.some(
    (blocker) => blocker.code === "open-findings"
  ));

  await appendApproval(fixture.projectRoot, {
    id: "RESOLVE-102",
    type: "finding-decision",
    operation: "current-scope-review",
    scopeId: publication.targetScope.scope_id,
    paths: ["manuscript/chapter-002.md"],
    reason: "Author accepted the review finding for verified revision execution.",
  });
  const planRelative = "sessions/increment-plan-102.md";
  const batchRelative = "sessions/increment-batch-102.json";
  await writeFile(
    path.join(fixture.projectRoot, planRelative),
    "# Continuity rework\n\nClarify the chapter-two discovery transition.\n",
    "utf8",
  );
  await writeJson(path.join(fixture.projectRoot, batchRelative), {
    batch_id: "increment-batch-102",
    finding_id: finding.id,
  });
  const originalChapter = publication.chapters[0].contents;
  const reworkedChapter = "The next ferry arrives at noon.\nMara finds the missing letter beside her ticket.";
  const backupRelative = ".author-toolkit/backups/backup-102/manuscript/chapter-002.md";
  const backupManifestRelative = ".author-toolkit/backups/backup-102/manifest.json";
  await writeBackupEvidence(fixture.projectRoot, {
    backupId: "backup-102",
    approvalId: "EDIT-102",
    scope: publication.targetScope,
    files: [{
      path: "manuscript/chapter-002.md",
      action: "modify",
      input_sha256: sha256(originalChapter),
      output_sha256: sha256(reworkedChapter),
      contents: originalChapter,
    }],
  });
  const reworkPlanned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 4,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "chapter-revision",
      reason: "The accepted continuity finding returns to its exact approved execution batch.",
    },
  });
  assert.equal(reworkPlanned.status, 0, `${reworkPlanned.stdout}\n${reworkPlanned.stderr}`);
  const execution = {
    cycle_id: cycle.cycle_id,
    expected_revision: 5,
    execution_id: "execution-102",
    plan: { plan_id: "increment-plan-102", ...(await artifactAt(fixture.projectRoot, planRelative)) },
    batch: { batch_id: "increment-batch-102", ...(await artifactAt(fixture.projectRoot, batchRelative)) },
    requested_pass: initialEvidence.passReference,
    input_scope: publication.targetScope,
    finding_dispositions: [{
      finding_id: finding.id,
      disposition: "execute",
      author_decision_id: "RESOLVE-102",
    }],
    author_decision_ids: ["PLAN-102", "RESOLVE-102"],
    approval_ids: ["EDIT-102"],
    backups: [{
      backup_id: "backup-102",
      approval_id: "EDIT-102",
      manifest: await artifactAt(fixture.projectRoot, backupManifestRelative),
      files: [{
        path: "manuscript/chapter-002.md",
        backup_path: backupRelative,
        sha256: sha256(originalChapter),
      }],
    }],
    files: [{
      path: "manuscript/chapter-002.md",
      action: "modify",
      input_sha256: sha256(originalChapter),
      output_sha256: sha256(reworkedChapter),
    }],
  };
  await appendRevisionExecutionApprovals(fixture.projectRoot, execution, {
    planReason: "Author accepted the continuity finding and its exact rework plan.",
    editReason: "Author approved the exact continuity-fix input and output versions.",
  });
  const prepared = await runInput(fixture.projectRoot, "prepare-revision-execution", execution);
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  assert.equal(JSON.parse(prepared.stdout).execution.status, "prepared");

  await writeFile(
    path.join(fixture.projectRoot, "manuscript", "chapter-002.md"),
    reworkedChapter,
    "utf8",
  );
  const reworkedTarget = await confirmScope(fixture.projectRoot, publication.targetScope.scope_id, [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(fixture.original),
  }, {
    path: "manuscript/chapter-002.md",
    sha256: sha256(reworkedChapter),
  }, {
    path: "manuscript/chapter-003.md",
    sha256: sha256(publication.chapters[1].contents),
  }], "SCOPE-102");
  const finalEvidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-increment-rework-002",
    baselinePass: fixture.baseEvidence.passReference,
    noEditDecisionId: "NOEDITREWORK-002",
    reusedCoverageUnits: fixture.baseEvidence.coverageUnits,
    findings: [finding],
    findingStatuses: {
      [finding.id]: {
        status: "open",
        reason: "The accepted continuity fix awaits verified execution-102.",
      },
    },
  });
  const verified = await runInput(fixture.projectRoot, "verify-revision-execution", {
    cycle_id: cycle.cycle_id,
    expected_revision: 6,
    execution_id: "execution-102",
    requested_pass: finalEvidence.passReference,
    target_scope: reworkedTarget,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  const verifiedResult = JSON.parse(verified.stdout);
  const decided = await runInput(fixture.projectRoot, "record-finding-decision", {
    finding_id: finding.id,
    status: "resolved",
    report: `reports/diagnostics/${finalEvidence.pass.pass_id}-local.md`,
    reason: "The accepted continuity fix is preserved in verified execution-102.",
    author_decision_id: "RESOLVE-102",
    revision_execution: verifiedResult.execution_reference,
  });
  assert.equal(decided.status, 0, `${decided.stdout}\n${decided.stderr}`);
  const verifiedCycle = verifiedResult.cycle;
  assert.equal(verifiedCycle.starting_scope.scope_fingerprint, fixture.startingScope.scope_fingerprint);
  assert.deepEqual(verifiedCycle.change_set.created, [{
    path: "manuscript/chapter-002.md",
    sha256: sha256(reworkedChapter),
  }, {
    path: "manuscript/chapter-003.md",
    sha256: sha256(publication.chapters[1].contents),
  }]);
  assert.deepEqual(verifiedCycle.change_set.modified, []);

  const finalReview = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 7,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Verified continuity rework has new affected coverage and full-target review.",
    },
    related_artifacts: {
      review_groups: [finalEvidence.reviewGroupReference],
      reviews: finalEvidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [finalEvidence.noEditReference],
    },
  });
  assert.equal(finalReview.status, 0, `${finalReview.stdout}\n${finalReview.stderr}`);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    finalEvidence.evaluationInput("evaluation-increment-rework-002", 8, cycle.cycle_id),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluation = JSON.parse(evaluated.stdout).evaluation;
  assert.equal(evaluation.outcome, "satisfied");
  assert.ok(evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "revision-execution" && artifact.artifact_id === "execution-102"
  ));
  assert.ok(evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "creation-commit" && artifact.artifact_id === "commit-002"
  ));
  const completed = await runInput(fixture.projectRoot, "complete-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: 9,
    evaluation_id: "evaluation-increment-rework-002-completion",
    decision_id: "COMPLETE-002",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
});


test("creation publication rejects a reading-order change omitted from its journal", async (t) => {
  const fixture = await establishSatisfiedBase(t, { twoChapters: true });
  fixture.reorderWithoutJournal = true;
  const cycle = await startOrdinaryCreation(fixture);
  const publication = await publishMultiChapterBatch(fixture);
  const transitioned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "Attempt to omit the retained chapter's reorder transition.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
  assert.equal(transitioned.status, 1, `${transitioned.stdout}\n${transitioned.stderr}`);
  assert.equal(JSON.parse(transitioned.stdout).blockers[0].code, "creation-order-mismatch");
});


test("increment evaluation cannot omit the creation commit execution record", async (t) => {
  const fixture = await establishSatisfiedBase(t);
  const cycle = await startOrdinaryCreation(fixture);
  const publication = await publishMultiChapterBatch(fixture);
  const evidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-missing-commit-002",
    baselinePass: fixture.baseEvidence.passReference,
    noEditDecisionId: "NOEDITMISSING-002",
    reusedCoverageUnits: fixture.baseEvidence.coverageUnits,
  });
  const transitioned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Attempt to evaluate creation without linking its commit journal.",
    },
    target_scope: publication.targetScope,
    requested_pass: evidence.passReference,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-missing-commit-002", 2, cycle.cycle_id),
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluation = JSON.parse(evaluated.stdout).evaluation;
  assert.equal(evaluation.outcome, "not_satisfied");
  assert.ok(evaluation.blockers.some((blocker) => blocker.code === "creation-commit-evidence-missing"));
});


for (const approvalType of ["creation-manuscript", "creation-acceptance"]) {
  test(`rejected staging rejects ${approvalType} as a rejection decision`, async (t) => {
    const fixture = await establishSatisfiedBase(t);
    const cycle = await startOrdinaryCreation(fixture);
    const rejected = await createRejectedBatch(fixture);
    await appendApproval(fixture.projectRoot, {
      id: "REJECT-002",
      type: approvalType,
      operation: "chapter-review",
      scopeId: fixture.startingScope.scope_id,
      paths: ["manuscript/chapter-002.md"],
      reason: rejected.approvalReason,
    });
    const transitioned = await runInput(fixture.projectRoot, "transition-cycle", {
      cycle_id: cycle.cycle_id,
      expected_revision: cycle.revision,
      current_strategy: "revise-increment",
      recovery_position: {
        operation: "current-scope-review",
        reason: "Attempt to use a non-rejection approval for rejected staging.",
      },
      target_scope: fixture.startingScope,
      related_artifacts: {
        creation_batches: [rejected.batchReference],
      },
    });
    assert.equal(transitioned.status, 1, `${transitioned.stdout}\n${transitioned.stderr}`);
    const result = JSON.parse(transitioned.stdout);
    assert.equal(result.blockers[0].code, "creation-rejection-approval-missing");
    assert.equal(result.state_written, false);
    const active = JSON.parse(await readFile(
      path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
      "utf8",
    ));
    assert.equal(active.target_evaluation, null);
    assert.equal(active.completion, null);
    assert.equal(active.related_artifacts.creation_commits.length, 0);
  });
}


async function linkPublication(fixture, cycle, publication) {
  return runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: cycle.cycle_id,
    expected_revision: cycle.revision,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "intake",
      reason: "Validate exact creation acceptance before increment recovery.",
    },
    target_scope: publication.targetScope,
    related_artifacts: {
      creation_batches: [publication.batchReference],
      creation_commits: [publication.commitReference],
    },
  });
}

for (const [scenario, manuscriptApprovalType, scopeApprovalType] of [
  ["duplicate scope approvals", "creation-scope", "creation-scope"],
  ["duplicate manuscript approvals", "creation-manuscript", "creation-manuscript"],
]) {
  test(`ordinary creation rejects ${scenario}`, async (t) => {
    const fixture = await establishSatisfiedBase(t);
    fixture.manuscriptApprovalType = manuscriptApprovalType;
    fixture.scopeApprovalType = scopeApprovalType;
    const cycle = await startOrdinaryCreation(fixture);
    const publication = await publishMultiChapterBatch(fixture);
    const transitioned = await linkPublication(fixture, cycle, publication);
    assert.equal(transitioned.status, 1, `${transitioned.stdout}\n${transitioned.stderr}`);
    const result = JSON.parse(transitioned.stdout);
    assert.equal(result.blockers[0].code, "creation-approval-missing");
    assert.equal(result.state_written, false);
    const active = JSON.parse(await readFile(
      path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
      "utf8",
    ));
    assert.equal(active.related_artifacts.creation_commits.length, 0);
  });
}

test("ordinary creation rejects a manuscript approval bound to different action inputs", async (t) => {
  const fixture = await establishSatisfiedBase(t);
  fixture.manuscriptDependencyOverride = "0".repeat(64);
  const cycle = await startOrdinaryCreation(fixture);
  const publication = await publishMultiChapterBatch(fixture);
  const transitioned = await linkPublication(fixture, cycle, publication);
  assert.equal(transitioned.status, 1, `${transitioned.stdout}\n${transitioned.stderr}`);
  const result = JSON.parse(transitioned.stdout);
  assert.equal(result.blockers[0].code, "creation-approval-missing");
  assert.equal(result.state_written, false);
});


for (const [scenario, option, expectedOrder] of [
  ["before retained chapters", "insertBefore", [
    "manuscript/chapter-003.md",
    "manuscript/chapter-004.md",
    "manuscript/chapter-001.md",
    "manuscript/chapter-002.md",
  ]],
  ["between retained chapters", "insertMiddle", [
    "manuscript/chapter-001.md",
    "manuscript/chapter-003.md",
    "manuscript/chapter-004.md",
    "manuscript/chapter-002.md",
  ]],
]) {
  test(`creation publication permits pure insertion ${scenario}`, async (t) => {
    const fixture = await establishSatisfiedBase(t, { twoChapters: true });
    fixture[option] = true;
    const cycle = await startOrdinaryCreation(fixture);
    const publication = await publishMultiChapterBatch(fixture);
    const transitioned = await linkPublication(fixture, cycle, publication);
    assert.equal(transitioned.status, 0, `${transitioned.stdout}\n${transitioned.stderr}`);
    const linked = JSON.parse(transitioned.stdout).cycle;
    assert.deepEqual(linked.change_set.reordered, []);
    assert.deepEqual(linked.change_set.created.map((file) => file.path), [
      "manuscript/chapter-003.md",
      "manuscript/chapter-004.md",
    ]);
    assert.deepEqual(publication.targetFiles.map((file) => file.path), expectedOrder);
    const manifest = JSON.parse(await readFile(
      path.join(fixture.projectRoot, ".author-toolkit", "project.json"),
      "utf8",
    ));
    assert.deepEqual(manifest.current_scope.files.map((file) => file.path), expectedOrder);
    assert.equal(manifest.current_scope.scope_fingerprint, publication.targetScope.scope_fingerprint);
  });
}


test("ordinary creation commit connects its starting scope to later external reconciliation", async (t) => {
  const fixture = await prepareOrdinaryExternalImport(t);
  assert.equal(fixture.reconciliationResult.reconciliation.required_strategy, "revise-increment");
  const reviewed = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: fixture.cycle.cycle_id,
    expected_revision: 3,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The ordinary creation commit and external change have full-target evidence.",
    },
    requested_pass: fixture.evidence.passReference,
    related_artifacts: {
      review_groups: [fixture.evidence.reviewGroupReference],
      reviews: fixture.evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [fixture.evidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    fixture.evidence.evaluationInput("evaluation-ordinary-import-960", 4, fixture.cycle.cycle_id),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
  assert.deepEqual(JSON.parse(evaluated.stdout).cycle.change_set.from_scope, fixture.startingScope);
});


test("removing a creation commit event prevents an external chain from closing", async (t) => {
  const fixture = await prepareOrdinaryExternalImport(t);
  const activePath = path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  active.related_artifacts.creation_commits = [];
  await writeJson(activePath, active);
  const reviewed = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: fixture.cycle.cycle_id,
    expected_revision: 3,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "A missing commit must not be replaced by batch or current scope evidence.",
    },
    requested_pass: fixture.evidence.passReference,
    related_artifacts: {
      review_groups: [fixture.evidence.reviewGroupReference],
      reviews: fixture.evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [fixture.evidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    fixture.evidence.evaluationInput("evaluation-missing-creation-commit", 4, fixture.cycle.cycle_id),
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "reconciliation-chain-mismatch" ||
      blocker.code === "creation-commit-evidence-missing"
  ));
});

async function prepareOrdinaryExternalImport(t) {
  const fixture = await establishSatisfiedBase(t);
  const cycle = await startOrdinaryCreation(fixture);
  const publication = await publishMultiChapterBatch(fixture);
  const linked = await linkPublication(fixture, cycle, publication);
  assert.equal(linked.status, 0, `${linked.stdout}\n${linked.stderr}`);
  const modified = "The ferry leaves after the external edit.\nMara watches it go.";
  await writeFile(path.join(fixture.projectRoot, "manuscript", "chapter-001.md"), modified, "utf8");
  const targetFiles = publication.targetFiles.map((file) => file.path === "manuscript/chapter-001.md"
    ? { path: file.path, sha256: sha256(modified) }
    : file);
  const targetScope = await confirmScope(
    fixture.projectRoot,
    publication.targetScope.scope_id,
    targetFiles,
    "IMPORT-960",
  );
  const storyState = await writeOrdinaryStoryState(fixture.projectRoot, targetScope);
  const inventory = JSON.parse(await readFile(
    path.join(fixture.projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(fixture.projectRoot, {
    id: "IMPORT-960",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: targetFiles.map((file) => file.path),
    reason: `Author approved the external change after ordinary creation. reconciliation_id=reconciliation-ordinary-960 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
  const reconciled = await runInput(fixture.projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-ordinary-960",
    cycle_id: cycle.cycle_id,
    expected_revision: 2,
    author_decision_id: "IMPORT-960",
    target_scope: targetScope,
    story_state: storyState,
  });
  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  assert.deepEqual(JSON.parse(reconciled.stdout).reconciliation.previous_scope, publication.targetScope);
  const evidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-ordinary-import-960",
    baselinePass: fixture.baseEvidence.passReference,
    noEditDecisionId: "NOEDIT-960",
  });
  return {
    ...fixture,
    cycle,
    publication,
    targetScope,
    evidence,
    reconciliationResult: JSON.parse(reconciled.stdout),
  };
}

async function writeOrdinaryStoryState(projectRoot, targetScope) {
  const snapshot = JSON.parse(await readFile(path.join(projectRoot, targetScope.snapshot_path), "utf8"));
  const references = [];
  const children = [];
  for (const [index, file] of snapshot.files.entries()) {
    const relative = `.author-toolkit/creation/state/chapters/ordinary-${index + 1}.md`;
    const value = {
      schema_version: "1.0.0",
      state_id: `ordinary-${index + 1}`,
      level: "chapter",
      scope_id: targetScope.scope_id,
      updated_at: timestamp,
      sources: [{ path: file.path, sha256: file.sha256 }],
      summary: `Observed facts for ${file.path}.`,
      records: [],
      children: [],
    };
    const absolute = path.join(projectRoot, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(
      absolute,
      `# Reconciled chapter\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`,
      "utf8",
    );
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
    summary: "Current story state after ordinary creation and external reconciliation.",
    records: [],
    children,
  };
  const relative = ".author-toolkit/creation/state/current.md";
  await writeFile(
    path.join(projectRoot, relative),
    `# Current state\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\`\n`,
    "utf8",
  );
  references.push({ path: relative, sha256: sha256(await readFile(path.join(projectRoot, relative))) });
  return references;
}
