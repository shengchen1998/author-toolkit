import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  artifactAt,
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
  const inputPath = await writeJson(
    path.join(projectRoot, `${command}-${input.evaluation_id ?? input.execution_id ?? input.cycle_id}.json`),
    input,
  );
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

async function establishSatisfiedBase(t) {
  const { projectRoot } = await createConvergenceProject(t);
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), original, "utf8");
  const startingScope = await confirmScope(projectRoot, "scope-base-001", [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(original),
  }], "SCOPE-001");
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
  return { projectRoot, startingScope, baseEvidence: evidence, original };
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
  const chapters = [
    {
      path: "manuscript/chapter-002.md",
      contents: "The next ferry arrives at noon.\nMara finds the missing letter.",
    },
    {
      path: "manuscript/chapter-003.md",
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
  const targetFiles = [
    { path: "manuscript/chapter-001.md", sha256: sha256(fixture.original) },
    ...chapters.map((chapter) => ({ path: chapter.path, sha256: sha256(chapter.contents) })),
  ];
  if (fixture.reorderWithoutJournal) targetFiles.push(targetFiles.shift());
  const targetScopeId = "scope-creation-002";
  for (const approval of [{
    id: "MANUSCRIPT-002",
    type: "creation-manuscript",
    operation: "chapter-review",
    reason: "Author accepted the exact two-chapter manuscript batch.",
  }, {
    id: "SCOPE-002",
    type: "creation-scope",
    operation: "chapter-review",
    reason: "Author accepted the complete expanded publication scope and reading order.",
  }]) {
    if (!fixture.skipApprovals) {
      await appendApproval(projectRoot, {
        ...approval,
        scopeId: targetScopeId,
        paths: targetFiles.map((file) => file.path),
      });
    }
  }
  const targetScope = await confirmScope(
    projectRoot,
    targetScopeId,
    targetFiles,
    "SCOPE-002",
  );
  const files = chapters.map((chapter) => ({
    path: chapter.path,
    action: "create",
    input_sha256: null,
    output_sha256: sha256(chapter.contents),
  }));
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
  const storyBibleHash = sha256(await readFile(path.join(projectRoot, "story-bible.md")));
  const batchRelative = ".author-toolkit/creation/batches/batch-002.json";
  await writeJson(path.join(projectRoot, batchRelative), {
    schema_version: "1.0.0",
    batch_id: "batch-002",
    operation: "chapter-creation",
    source_mode: "mixed",
    status: "committed",
    scope_id: targetScope.scope_id,
    plan: {
      summary: "Publish two coherent chapters in one explicitly approved batch.",
      context: [{ path: "story-bible.md", version: storyBibleHash, version_type: "sha256" }],
      dependency_fingerprint: storyBibleHash,
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
  const batchRelative = ".author-toolkit/creation/batches/batch-rejected-002.json";
  await writeJson(path.join(projectRoot, batchRelative), {
    schema_version: "1.0.0",
    batch_id: "batch-rejected-002",
    operation: "chapter-review",
    source_mode: "ai",
    status: "rejected",
    scope_id: startingScope.scope_id,
    plan: {
      summary: "Reject the staged chapter without publishing any manuscript bytes.",
      context: [{ path: "story-bible.md", version: storyBibleHash, version_type: "sha256" }],
      dependency_fingerprint: storyBibleHash,
    },
    files: [{
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: sha256(stagedContents),
      status: "staged",
    }],
    story_state: [],
    approvals: ["REJECT-002"],
    commit: null,
    next_action: "Revalidate the unchanged starting scope and complete the no-change cycle.",
    created_at: timestamp,
    updated_at: timestamp,
  });
  return {
    stagedPath,
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
    reason: "Author rejected the exact staged batch and preserved it outside the manuscript.",
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

  for (const approval of [{
    id: "PLAN-102",
    type: "revision-plan",
    operation: "revision-plan",
    reason: "Author accepted the continuity finding and its exact rework plan.",
  }, {
    id: "EDIT-102",
    type: "edit",
    operation: "chapter-revision",
    reason: "Author approved the exact continuity-fix input and output versions.",
  }, {
    id: "RESOLVE-102",
    type: "finding-decision",
    operation: "current-scope-review",
    reason: "Author accepted the review finding for verified revision execution.",
  }]) {
    await appendApproval(fixture.projectRoot, {
      ...approval,
      scopeId: publication.targetScope.scope_id,
      paths: ["manuscript/chapter-002.md"],
    });
  }
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
  await mkdir(path.dirname(path.join(fixture.projectRoot, backupRelative)), { recursive: true });
  await writeFile(path.join(fixture.projectRoot, backupRelative), originalChapter, "utf8");
  const backupManifestRelative = ".author-toolkit/backups/backup-102/manifest.json";
  await writeJson(path.join(fixture.projectRoot, backupManifestRelative), {
    backup_id: "backup-102",
    approval_id: "EDIT-102",
    scope_id: publication.targetScope.scope_id,
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
  const prepared = await runInput(fixture.projectRoot, "prepare-revision-execution", {
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
  });
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
        status: "resolved",
        reason: "The accepted continuity fix is preserved in verified execution-102.",
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
  const verifiedCycle = JSON.parse(verified.stdout).cycle;
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
  const fixture = await establishSatisfiedBase(t);
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
