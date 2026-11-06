import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  completeCycle,
  evaluateCycle,
  evaluateDraft,
  prepareRevisionExecution,
  reconcileManuscript,
  recordScope,
  startCycle,
  transitionCycle,
  verifyRevisionExecution,
} from "../scripts/lib/index.mjs";
import {
  artifactAt,
  createConvergenceProject,
  createFirstPublicationArtifacts,
  createNoEditEvidence,
  currentScopeReference,
  runAuthorProject,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

async function exitedProcess() {
  const child = spawn(process.execPath, ["-e", ""]);
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return child.pid;
}

async function injectAbandonedLock(projectRoot) {
  const pid = await exitedProcess();
  const directory = path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "active-cycle.lock",
  );
  await mkdir(directory);
  const owner = {
    pid,
    token: "owner-from-interrupted-process",
    acquired_at: timestamp,
  };
  await writeFile(
    path.join(directory, "owner.json"),
    `${JSON.stringify(owner, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return { directory, owner };
}

test("reconcile-cycle diagnoses an abandoned lock without writes and releases only its verified owner", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const activeBefore = await readFile(started.cycle_path, "utf8");
  const manifestBefore = await readFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    "utf8",
  );
  const { directory, owner } = await injectAbandonedLock(projectRoot);

  const diagnostic = runAuthorProject(["reconcile-cycle", "--project-root", projectRoot]);
  assert.equal(diagnostic.status, 1, `${diagnostic.stdout}\n${diagnostic.stderr}`);
  const diagnosis = JSON.parse(diagnostic.stdout);
  assert.equal(diagnosis.diagnostic_only, true);
  assert.equal(diagnosis.state_written, false);
  assert.ok(diagnosis.blockers.some((blocker) =>
    blocker.code === "cycle-lock-owner-not-running" &&
    blocker.lock?.pid === owner.pid &&
    blocker.lock?.token === owner.token
  ));
  assert.equal(await readFile(started.cycle_path, "utf8"), activeBefore);
  assert.equal(
    await readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"),
    manifestBefore,
  );
  assert.equal(
    JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")).token,
    owner.token,
  );

  const input = await writeJson(path.join(projectRoot, "reconcile-lock.json"), {
    direction: "release-stale-lock",
    lock_owner: { pid: owner.pid, token: owner.token },
  });
  const recovered = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    projectRoot,
    "--input",
    input,
  ]);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  assert.equal(JSON.parse(recovered.stdout).valid, true);
  await assert.rejects(readFile(path.join(directory, "owner.json")), { code: "ENOENT" });
  assert.equal(await readFile(started.cycle_path, "utf8"), activeBefore);
});


async function establishEvaluatedCycle(t, { evaluate = true } = {}) {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  }, { now: new Date(timestamp) });
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
  const publication = await createFirstPublicationArtifacts(projectRoot);
  const evidence = await createNoEditEvidence(projectRoot);
  const transitioned = await transitionCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The complete evidence awaits convergence evaluation.",
    },
    target_scope: evidence.scopeReference,
    requested_pass: evidence.passReference,
    related_artifacts: {
      ...publication.relatedArtifacts,
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  }, { now: new Date(timestamp) });
  assert.equal(transitioned.valid, true, JSON.stringify(transitioned.blockers));
  const fixture = {
    projectRoot,
    manifestPath,
    activePath: started.cycle_path,
    completedPath: path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "cycles",
      "cycle-bootstrap-001.json",
    ),
    trackerPath: path.join(projectRoot, "audit-tracker.md"),
    completionEvaluationPath: path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "evaluations",
      "evaluation-001-completion.json",
    ),
    evidence,
  };
  if (!evaluate) return fixture;
  const evaluationInput = evidence.evaluationInput("evaluation-001", 2);
  const evaluationInputPath = await writeJson(
    path.join(projectRoot, "evaluate-cycle.json"),
    evaluationInput,
  );
  const evaluated = runAuthorProject([
    "evaluate-cycle",
    "--project-root",
    projectRoot,
    "--input",
    evaluationInputPath,
  ]);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  return fixture;
}

for (const phase of ["after-completed-history", "after-manifest"]) {
  test(`reconcile-cycle finishes the ${phase} completion window without rewriting history`, async (t) => {
    const fixture = await establishEvaluatedCycle(t);
    const activeBefore = await readFile(fixture.activePath, "utf8");
    const manifestBefore = await readFile(fixture.manifestPath, "utf8");
    const completed = await completeCycle(fixture.projectRoot, {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 3,
      evaluation_id: "evaluation-001-completion",
      decision_id: "COMPLETE-001",
      author_confirmed: true,
    }, { now: new Date("2026-11-06T00:00:00Z") });
    assert.equal(completed.valid, true, JSON.stringify(completed.blockers));
    const finalManifest = await readFile(fixture.manifestPath, "utf8");

    await writeFile(fixture.activePath, activeBefore, { encoding: "utf8", flag: "wx" });
    if (phase === "after-completed-history") {
      await writeFile(fixture.manifestPath, manifestBefore, "utf8");
    } else {
      assert.equal(await readFile(fixture.manifestPath, "utf8"), finalManifest);
      assert.ok(JSON.parse(finalManifest).last_completed_cycle);
    }
    const completedBefore = await readFile(fixture.completedPath, "utf8");
    const evaluationBefore = await readFile(fixture.completionEvaluationPath, "utf8");
    const trackerBefore = await readFile(fixture.trackerPath, "utf8");

    const diagnostic = runAuthorProject(["reconcile-cycle", "--project-root", fixture.projectRoot]);
    assert.equal(diagnostic.status, 1, `${diagnostic.stdout}\n${diagnostic.stderr}`);
    const diagnosis = JSON.parse(diagnostic.stdout);
    assert.equal(diagnosis.diagnostic_only, true);
    assert.equal(diagnosis.state_written, false);
    assert.ok(diagnosis.blockers.some((blocker) =>
      blocker.code === "cycle-completion-reconcile-required"
    ));
    assert.equal(await readFile(fixture.activePath, "utf8"), activeBefore);

    const direction = await writeJson(path.join(fixture.projectRoot, "finish-completion.json"), {
      cycle_id: "cycle-bootstrap-001",
      direction: "finish-completion",
    });
    const recovered = runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      fixture.projectRoot,
      "--input",
      direction,
    ]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    assert.equal(JSON.parse(recovered.stdout).state_written, true);
    await assert.rejects(readFile(fixture.activePath), { code: "ENOENT" });
    assert.equal(await readFile(fixture.completedPath, "utf8"), completedBefore);
    assert.equal(await readFile(fixture.completionEvaluationPath, "utf8"), evaluationBefore);
    assert.equal(await readFile(fixture.trackerPath, "utf8"), trackerBefore);
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    assert.equal(manifest.last_completed_cycle.cycle_id, "cycle-bootstrap-001");
    assert.equal(manifest.last_completed_cycle.path,
      ".author-toolkit/convergence/cycles/cycle-bootstrap-001.json");
    assert.equal(manifest.last_completed_cycle.sha256,
      createHash("sha256").update(completedBefore).digest("hex"));
  });
}


for (const phase of ["after-operation-manifest", "after-cycle"]) {
  test(`transition crash ${phase} blocks continuation until explicit identity-bound reconciliation`, async (t) => {
    const { projectRoot, manifestPath } = await createConvergenceProject(t);
    const started = await startCycle(projectRoot, {
      cycle_id: "cycle-bootstrap-001",
      initiating_strategy: "write-fiction",
      bootstrap: true,
      starting_scope: null,
    }, { now: new Date(timestamp) });
    const pending = {
      operation: "creation-baseline",
      status: "in_progress",
      reason: "The same operation is being coordinated across manifest and cycle state.",
      artifacts: [],
      updated_at: timestamp,
      cycle_id: "cycle-bootstrap-001",
      cycle_revision: 1,
      operation_id: "start-cycle-bootstrap-001",
    };
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeJson(manifestPath, { ...manifest, pending_action: pending });
    const request = {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 1,
      operation_id: "transition-publication-002",
      current_strategy: "revise-draft",
      recovery_position: {
        operation: "diagnostics",
        reason: "The interrupted transition must retain this exact intended work.",
      },
    };
    const interruption = new Error(`Injected crash ${phase}`);
    const stopAt = phase === "after-operation-manifest" ? "manifest-written" : "cycle-written";
    await assert.rejects(transitionCycle(projectRoot, request, {
      now: new Date("2026-11-06T01:00:00Z"),
      checkpoint: async (point) => {
        if (point === stopAt) throw interruption;
      },
    }), new RegExp(phase));
    const activeAtCrash = await readFile(started.cycle_path, "utf8");
    const manifestAtCrash = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifestAtCrash.cycle_operation.operation_id, "transition-publication-002");
    assert.equal(manifestAtCrash.cycle_operation.expected_revision, 1);
    assert.equal(manifestAtCrash.cycle_operation.intended_revision, 2);
    const active = JSON.parse(activeAtCrash);
    assert.equal(active.revision, phase === "after-cycle" ? 2 : 1);

    const blocked = await transitionCycle(projectRoot, {
      ...request,
      expected_revision: active.revision,
      operation_id: "another-operation",
    });
    assert.equal(blocked.valid, false);
    assert.equal(blocked.blockers[0].code, "cycle-reconciliation-required");
    assert.equal(await readFile(started.cycle_path, "utf8"), activeAtCrash);
    const status = runAuthorProject(["cycle-status", "--project-root", projectRoot]);
    assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
    const statusResult = JSON.parse(status.stdout);
    assert.equal(statusResult.query_valid, true);
    assert.equal(statusResult.outcome, "indeterminate");
    assert.equal(statusResult.current, false);
    assert.ok(statusResult.blockers.some((blocker) =>
      blocker.code === "cycle-reconciliation-required"
    ));

    const diagnostic = runAuthorProject(["reconcile-cycle", "--project-root", projectRoot]);
    assert.equal(diagnostic.status, 1, `${diagnostic.stdout}\n${diagnostic.stderr}`);
    const diagnosis = JSON.parse(diagnostic.stdout);
    assert.ok(diagnosis.blockers.some((blocker) =>
      blocker.code === "cycle-reconciliation-required" &&
      blocker.operation_id === "transition-publication-002"
    ));
    assert.equal(await readFile(manifestPath, "utf8"), `${JSON.stringify(manifestAtCrash, null, 2)}\n`);

    const direction = phase === "after-cycle" ? "accept-active-cycle" : "discard-interrupted-operation";
    const input = await writeJson(path.join(projectRoot, "reconcile-transition.json"), {
      cycle_id: "cycle-bootstrap-001",
      operation_id: "transition-publication-002",
      direction,
    });
    const recovered = runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      projectRoot,
      "--input",
      input,
    ]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    const reconciledManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(Object.hasOwn(reconciledManifest, "cycle_operation"), false);
    assert.equal(JSON.parse(await readFile(started.cycle_path, "utf8")).revision, active.revision);
    assert.equal(reconciledManifest.pending_action.cycle_revision, active.revision);
    assert.equal(reconciledManifest.pending_action.operation,
      phase === "after-cycle" ? "diagnostics" : "creation-baseline");
    assert.equal(reconciledManifest.pending_action.operation_id,
      phase === "after-cycle" ? "transition-publication-002" : "start-cycle-bootstrap-001");
    if (phase === "after-operation-manifest") {
      assert.equal(await readFile(started.cycle_path, "utf8"), activeAtCrash);
      const retried = await transitionCycle(projectRoot, request);
      assert.equal(retried.valid, true, JSON.stringify(retried.blockers));
      assert.equal(retried.cycle.revision, 2);
    }
  });
}


for (const phase of ["after-evaluation", "after-cycle"]) {
  test(`evaluation crash ${phase} preserves the immutable evaluation and recovers its exact cycle link`, async (t) => {
    const fixture = await establishEvaluatedCycle(t, { evaluate: false });
    const input = fixture.evidence.evaluationInput("evaluation-001", 2);
    const stopAt = phase === "after-evaluation" ? "evaluation-published" : "cycle-written";
    await assert.rejects(evaluateCycle(fixture.projectRoot, input, {
      now: new Date("2026-11-06T02:00:00Z"),
      checkpoint: async (point) => {
        if (point === stopAt) throw new Error(`Injected crash ${phase}`);
      },
    }), new RegExp(phase));
    const evaluationPath = path.join(
      fixture.projectRoot,
      ".author-toolkit",
      "convergence",
      "evaluations",
      "evaluation-001.json",
    );
    const evaluationBefore = await readFile(evaluationPath, "utf8");
    const activeAtCrash = await readFile(fixture.activePath, "utf8");
    const active = JSON.parse(activeAtCrash);
    assert.equal(active.revision, phase === "after-cycle" ? 3 : 2);
    const manifestAtCrash = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    assert.equal(manifestAtCrash.cycle_operation.kind, "evaluation");
    assert.equal(manifestAtCrash.cycle_operation.operation_id, "evaluation-001");

    const diagnosis = JSON.parse(runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      fixture.projectRoot,
    ]).stdout);
    assert.ok(diagnosis.blockers.some((blocker) =>
      blocker.code === "cycle-reconciliation-required" && blocker.kind === "evaluation"
    ));
    const direction = phase === "after-cycle" ? "accept-active-cycle" : "attach-interrupted-evaluation";
    const inputPath = await writeJson(path.join(fixture.projectRoot, "recover-evaluation.json"), {
      cycle_id: "cycle-bootstrap-001",
      operation_id: "evaluation-001",
      direction,
    });
    const recovered = runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      fixture.projectRoot,
      "--input",
      inputPath,
    ]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    assert.equal(await readFile(evaluationPath, "utf8"), evaluationBefore);
    const recoveredActive = JSON.parse(await readFile(fixture.activePath, "utf8"));
    assert.equal(recoveredActive.revision, 3);
    assert.equal(recoveredActive.target_evaluation.evaluation_id, "evaluation-001");
    assert.equal(recoveredActive.recovery_position.operation_id, "evaluation-001");
    assert.equal(Object.hasOwn(JSON.parse(await readFile(fixture.manifestPath, "utf8")), "cycle_operation"), false);
  });
}


for (const phase of ["after-operation-manifest", "after-evaluation", "after-completed-history"]) {
  test(`completion crash ${phase} resumes the same author decision without duplicating history`, async (t) => {
    const fixture = await establishEvaluatedCycle(t);
    const completion = {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 3,
      evaluation_id: "evaluation-001-completion",
      decision_id: "COMPLETE-001",
      author_confirmed: true,
    };
    const stopAt = {
      "after-operation-manifest": "manifest-written",
      "after-evaluation": "evaluation-published",
      "after-completed-history": "completed-cycle-published",
    }[phase];
    await assert.rejects(completeCycle(fixture.projectRoot, completion, {
      now: new Date("2026-11-06T03:00:00Z"),
      checkpoint: async (point) => {
        if (point === stopAt) throw new Error(`Injected crash ${phase}`);
      },
    }), new RegExp(phase));
    const manifestAtCrash = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    assert.equal(manifestAtCrash.cycle_operation.kind, "completion");
    assert.equal(manifestAtCrash.cycle_operation.operation_id, "COMPLETE-001");
    assert.equal(manifestAtCrash.cycle_operation.artifact_id, "evaluation-001-completion");
    assert.equal(JSON.parse(await readFile(fixture.activePath, "utf8")).revision, 3);
    const evaluationBefore = phase === "after-operation-manifest"
      ? null
      : await readFile(fixture.completionEvaluationPath, "utf8");

    const input = await writeJson(path.join(fixture.projectRoot, "resume-completion.json"), {
      cycle_id: "cycle-bootstrap-001",
      operation_id: "COMPLETE-001",
      direction: phase === "after-completed-history" ? "finish-completion" : "resume-completion",
    });
    const recovered = runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      fixture.projectRoot,
      "--input",
      input,
    ]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    await assert.rejects(readFile(fixture.activePath), { code: "ENOENT" });
    const completed = JSON.parse(await readFile(fixture.completedPath, "utf8"));
    assert.equal(completed.completion.decision_id, "COMPLETE-001");
    assert.equal(completed.target_evaluation.evaluation_id, "evaluation-001-completion");
    if (evaluationBefore !== null) {
      assert.equal(await readFile(fixture.completionEvaluationPath, "utf8"), evaluationBefore);
    }
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    assert.equal(Object.hasOwn(manifest, "cycle_operation"), false);
    assert.equal(manifest.last_completed_cycle.cycle_id, "cycle-bootstrap-001");
  });
}


async function appendRecoveryApproval(projectRoot, approval) {
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|---|---|\n";
  const index = tracker.indexOf(separator, tracker.indexOf("## Approvals"));
  const insertAt = index + separator.length;
  const paths = approval.paths.map((value) => `\`${value}\``).join(", ");
  const row = `| ${approval.id} | ${approval.type} | ${approval.operation} | ${approval.scopeId} | ${paths} | approved | ${approval.reason} | ${timestamp} |\n`;
  await writeFile(trackerPath, tracker.slice(0, insertAt) + row + tracker.slice(insertAt), "utf8");
}

async function establishChapterRevision(t, { strategy = null } = {}) {
  let fixture;
  let cycleId = "cycle-bootstrap-001";
  let expectedRevision = 3;
  if (strategy) {
    fixture = await establishEvaluatedCycle(t);
    const startingScope = await currentScopeReference(fixture.projectRoot);
    const completed = await completeCycle(fixture.projectRoot, {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 3,
      evaluation_id: "evaluation-001-completion",
      decision_id: "COMPLETE-001",
      author_confirmed: true,
    });
    assert.equal(completed.valid, true, JSON.stringify(completed.blockers));
    cycleId = `cycle-${strategy}-002`;
    const started = await startCycle(fixture.projectRoot, {
      cycle_id: cycleId,
      initiating_strategy: strategy,
      bootstrap: false,
      starting_scope: startingScope,
    });
    assert.equal(started.valid, true, JSON.stringify(started.blockers));
    const evidence = await createNoEditEvidence(fixture.projectRoot, {
      passId: "pass-002",
      baselinePass: fixture.evidence.passReference,
      noEditDecisionId: "NOEDIT-002",
    });
    fixture = { ...fixture, evidence, activePath: started.cycle_path };
    expectedRevision = 2;
  } else {
    fixture = await establishEvaluatedCycle(t, { evaluate: false });
  }
  const transitioned = await transitionCycle(fixture.projectRoot, {
    cycle_id: cycleId,
    expected_revision: strategy ? 1 : 2,
    operation_id: "revision-plan-003",
    recovery_position: {
      operation: "chapter-revision",
      reason: "An exact approved batch awaits preparation.",
    },
    target_scope: fixture.evidence.scopeReference,
    requested_pass: fixture.evidence.passReference,
  });
  assert.equal(transitioned.valid, true, JSON.stringify(transitioned.blockers));
  const scope = fixture.evidence.scopeReference;
  for (const approval of [{
    id: "PLAN-001",
    type: "revision-plan",
    operation: "revision-plan",
    reason: "Author confirmed the exact revision plan.",
  }, {
    id: "EDIT-001",
    type: "edit",
    operation: "chapter-revision",
    reason: "Author approved the exact input and planned output versions.",
  }]) {
    await appendRecoveryApproval(fixture.projectRoot, {
      ...approval,
      scopeId: scope.scope_id,
      paths: ["manuscript/chapter-001.md"],
    });
  }
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const output = "The ferry leaves at dusk.\nMara watches it go.";
  const planRelative = "sessions/request-plan-001.md";
  const batchRelative = "sessions/request-batch-001.json";
  await writeFile(path.join(fixture.projectRoot, planRelative), "# Request plan\n", "utf8");
  await writeJson(path.join(fixture.projectRoot, batchRelative), {
    batch_id: "request-batch-001",
    action: "Change dawn to dusk.",
  });
  const backupRelative = ".author-toolkit/backups/backup-001/manuscript/chapter-001.md";
  await mkdir(path.dirname(path.join(fixture.projectRoot, backupRelative)), { recursive: true });
  await writeFile(path.join(fixture.projectRoot, backupRelative), original, "utf8");
  const backupManifestRelative = ".author-toolkit/backups/backup-001/manifest.json";
  await writeJson(path.join(fixture.projectRoot, backupManifestRelative), {
    backup_id: "backup-001",
    approval_id: "EDIT-001",
    scope_id: scope.scope_id,
  });
  const execution = {
    cycle_id: cycleId,
    expected_revision: expectedRevision,
    execution_id: "execution-001",
    plan: { plan_id: "request-plan-001", ...(await artifactAt(fixture.projectRoot, planRelative)) },
    batch: { batch_id: "request-batch-001", ...(await artifactAt(fixture.projectRoot, batchRelative)) },
    requested_pass: fixture.evidence.passReference,
    input_scope: scope,
    finding_dispositions: [],
    author_decision_ids: ["PLAN-001"],
    approval_ids: ["EDIT-001"],
    backups: [{
      backup_id: "backup-001",
      approval_id: "EDIT-001",
      manifest: await artifactAt(fixture.projectRoot, backupManifestRelative),
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
  return { ...fixture, execution, original, output, backupRelative };
}

test("revision preparation crash relinks the existing prepared record without rewriting it", async (t) => {
  const fixture = await establishChapterRevision(t);
  await assert.rejects(prepareRevisionExecution(fixture.projectRoot, fixture.execution, {
    now: new Date("2026-11-06T04:00:00Z"),
    checkpoint: async (point) => {
      if (point === "execution-written") throw new Error("Injected crash after preparation");
    },
  }), /after preparation/);
  const executionPath = path.join(
    fixture.projectRoot,
    ".author-toolkit",
    "convergence",
    "executions",
    "execution-001.json",
  );
  const preparedBefore = await readFile(executionPath, "utf8");
  assert.equal(JSON.parse(preparedBefore).status, "prepared");
  assert.equal(JSON.parse(await readFile(fixture.activePath, "utf8")).revision, 3);
  const input = await writeJson(path.join(fixture.projectRoot, "resume-preparation.json"), {
    cycle_id: "cycle-bootstrap-001",
    operation_id: "execution-001",
    direction: "resume-revision-execution",
  });
  const recovered = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
    "--input",
    input,
  ]);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  assert.equal(await readFile(executionPath, "utf8"), preparedBefore);
  const active = JSON.parse(await readFile(fixture.activePath, "utf8"));
  assert.equal(active.revision, 4);
  assert.equal(active.related_artifacts.revision_executions[0].sha256,
    createHash("sha256").update(preparedBefore).digest("hex"));
});

for (const phase of ["after-execution", "after-cycle"]) {
  test(`revision verification crash ${phase} recovers actual outputs and preserves verified bytes`, async (t) => {
    const fixture = await establishChapterRevision(t);
    const prepared = await prepareRevisionExecution(fixture.projectRoot, fixture.execution);
    assert.equal(prepared.valid, true, JSON.stringify(prepared.blockers));
    const executionPath = prepared.execution_path;
    await writeFile(path.join(fixture.projectRoot, "manuscript", "chapter-001.md"), fixture.output, "utf8");
    await recordScope(fixture.projectRoot, {
      scope_id: fixture.evidence.scopeReference.scope_id,
      description: "The complete manuscript after the approved edit.",
      status: "confirmed",
      files: [{
        path: "manuscript/chapter-001.md",
        sha256: createHash("sha256").update(fixture.output).digest("hex"),
      }],
      excluded_files: [],
      created_at: timestamp,
    }, {
      authorConfirmation: {
        decision_id: "SCOPE-002",
        confirmed_at: timestamp,
        reading_order_confirmed: true,
      },
      now: new Date(timestamp),
    });
    const target = await createNoEditEvidence(fixture.projectRoot, {
      passId: "pass-002",
      baselinePass: fixture.evidence.passReference,
      noEditDecisionId: "NOEDIT-002",
    });
    const verification = {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 4,
      execution_id: "execution-001",
      requested_pass: target.passReference,
      target_scope: target.scopeReference,
    };
    const stopAt = phase === "after-execution" ? "execution-written" : "cycle-written";
    await assert.rejects(verifyRevisionExecution(fixture.projectRoot, verification, {
      now: new Date("2026-11-06T05:00:00Z"),
      checkpoint: async (point) => {
        if (point === stopAt) throw new Error(`Injected crash ${phase}`);
      },
    }), new RegExp(phase));
    const verifiedBefore = await readFile(executionPath, "utf8");
    assert.equal(JSON.parse(verifiedBefore).status, "verified");
    const activeAtCrash = JSON.parse(await readFile(fixture.activePath, "utf8"));
    assert.equal(activeAtCrash.revision, phase === "after-cycle" ? 5 : 4);
    const backupBefore = await readFile(path.join(fixture.projectRoot, fixture.backupRelative), "utf8");
    const input = await writeJson(path.join(fixture.projectRoot, "recover-verification.json"), {
      cycle_id: "cycle-bootstrap-001",
      operation_id: "execution-001",
      direction: phase === "after-cycle" ? "accept-active-cycle" : "resume-revision-execution",
    });
    const recovered = runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      fixture.projectRoot,
      "--input",
      input,
    ]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    assert.equal(await readFile(executionPath, "utf8"), verifiedBefore);
    assert.equal(await readFile(path.join(fixture.projectRoot, fixture.backupRelative), "utf8"), backupBefore);
    const active = JSON.parse(await readFile(fixture.activePath, "utf8"));
    assert.equal(active.revision, 5);
    assert.deepEqual(active.target_scope, target.scopeReference);
    assert.equal(active.related_artifacts.revision_executions[0].sha256,
      createHash("sha256").update(verifiedBefore).digest("hex"));
  });
}


async function writeRecoveryStoryState(projectRoot) {
  const manifest = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    "utf8",
  ));
  const references = [];
  const children = [];
  for (const [index, file] of manifest.current_scope.files.entries()) {
    const relative = `.author-toolkit/creation/state/chapters/reconciled-${index + 1}.md`;
    const value = {
      schema_version: "1.0.0",
      state_id: `reconciled-${index + 1}`,
      level: "chapter",
      scope_id: manifest.current_scope.scope_id,
      updated_at: timestamp,
      sources: [{ path: file.path, sha256: file.sha256 }],
      summary: `Reconciled observed facts for ${file.path}.`,
      records: [],
      children: [],
    };
    const markdown = `# Reconciled chapter\n\n${value.summary}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
    await mkdir(path.dirname(path.join(projectRoot, relative)), { recursive: true });
    await writeFile(path.join(projectRoot, relative), markdown, "utf8");
    const reference = await artifactAt(projectRoot, relative);
    references.push(reference);
    children.push(reference);
  }
  const relative = ".author-toolkit/creation/state/current.md";
  const current = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: manifest.current_scope.scope_id,
    updated_at: timestamp,
    sources: children,
    summary: "The externally changed manuscript has reconciled story state.",
    records: [],
    children,
  };
  const markdown = `# Current story state\n\n${current.summary}\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\`\n`;
  await writeFile(path.join(projectRoot, relative), markdown, "utf8");
  references.push(await artifactAt(projectRoot, relative));
  return references;
}

for (const phase of ["after-reconciliation", "after-cycle"]) {
  test(`external reconciliation crash ${phase} preserves the event chain and manifest pointer`, async (t) => {
    const fixture = await establishEvaluatedCycle(t);
    const startingScope = await currentScopeReference(fixture.projectRoot);
    const startingSnapshotBefore = await readFile(
      path.join(fixture.projectRoot, startingScope.snapshot_path),
      "utf8",
    );
    const completed = await completeCycle(fixture.projectRoot, {
      cycle_id: "cycle-bootstrap-001",
      expected_revision: 3,
      evaluation_id: "evaluation-001-completion",
      decision_id: "COMPLETE-001",
      author_confirmed: true,
    });
    assert.equal(completed.valid, true, JSON.stringify(completed.blockers));
    const started = await startCycle(fixture.projectRoot, {
      cycle_id: "cycle-increment-002",
      initiating_strategy: "revise-increment",
      bootstrap: false,
      starting_scope: startingScope,
    });
    assert.equal(started.valid, true, JSON.stringify(started.blockers));
    const modified = "The ferry leaves at dawn.\nMara watches it go.\nAn external paragraph.";
    await writeFile(path.join(fixture.projectRoot, "manuscript", "chapter-001.md"), modified, "utf8");
    await recordScope(fixture.projectRoot, {
      scope_id: startingScope.scope_id,
      description: "The externally changed manuscript confirmed through creation-import.",
      status: "confirmed",
      files: [{
        path: "manuscript/chapter-001.md",
        sha256: createHash("sha256").update(modified).digest("hex"),
      }],
      excluded_files: [],
      created_at: timestamp,
    }, {
      authorConfirmation: {
        decision_id: "IMPORT-001",
        confirmed_at: timestamp,
        reading_order_confirmed: true,
      },
      now: new Date(timestamp),
    });
    const targetScope = await currentScopeReference(fixture.projectRoot);
    const storyState = await writeRecoveryStoryState(fixture.projectRoot);
    const inventory = JSON.parse(await readFile(
      path.join(fixture.projectRoot, targetScope.snapshot_path),
      "utf8",
    )).inventory;
    await appendRecoveryApproval(fixture.projectRoot, {
      id: "IMPORT-001",
      type: "creation-import",
      operation: "creation-import",
      scopeId: targetScope.scope_id,
      paths: ["manuscript/chapter-001.md"],
      reason: `Author confirmed the external text and story state. reconciliation_id=reconciliation-001 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
    });
    const reconciliation = {
      reconciliation_id: "reconciliation-001",
      cycle_id: "cycle-increment-002",
      expected_revision: 1,
      author_decision_id: "IMPORT-001",
      target_scope: targetScope,
      story_state: storyState,
    };
    const stopAt = phase === "after-reconciliation" ? "reconciliation-published" : "cycle-written";
    await assert.rejects(reconcileManuscript(fixture.projectRoot, reconciliation, {
      now: new Date("2026-11-06T06:00:00Z"),
      checkpoint: async (point) => {
        if (point === stopAt) throw new Error(`Injected crash ${phase}`);
      },
    }), new RegExp(phase));
    const recordPath = path.join(
      fixture.projectRoot,
      ".author-toolkit",
      "convergence",
      "reconciliations",
      "reconciliation-001.json",
    );
    const recordBefore = await readFile(recordPath, "utf8");
    const activeAtCrash = JSON.parse(await readFile(started.cycle_path, "utf8"));
    assert.equal(activeAtCrash.revision, phase === "after-cycle" ? 2 : 1);
    const input = await writeJson(path.join(fixture.projectRoot, "recover-reconciliation.json"), {
      cycle_id: "cycle-increment-002",
      operation_id: "reconciliation-001",
      direction: phase === "after-cycle" ? "accept-active-cycle" : "resume-manuscript-reconciliation",
    });
    const recovered = runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      fixture.projectRoot,
      "--input",
      input,
    ]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    assert.equal(await readFile(recordPath, "utf8"), recordBefore);
    assert.equal(await readFile(path.join(fixture.projectRoot, startingScope.snapshot_path), "utf8"),
      startingSnapshotBefore);
    const active = JSON.parse(await readFile(started.cycle_path, "utf8"));
    assert.equal(active.revision, 2);
    assert.deepEqual(active.starting_scope, startingScope);
    assert.deepEqual(active.target_scope, targetScope);
    assert.equal(active.recovery_position.operation_id, "reconciliation-001");
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
    assert.equal(manifest.manuscript_reconciliation.reconciliation_id, "reconciliation-001");
    assert.equal(manifest.manuscript_reconciliation.sha256,
      createHash("sha256").update(recordBefore).digest("hex"));
    assert.equal(Object.hasOwn(manifest, "cycle_operation"), false);
  });
}


test("bootstrap publication crash relinks the real first batch and journal", async (t) => {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
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
  const publication = await createFirstPublicationArtifacts(projectRoot);
  const request = {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    operation_id: publication.commitReference.commit_id,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "intake",
      reason: "The first publication requires its initial full-manuscript recovery.",
    },
    target_scope: publication.targetScope,
    related_artifacts: publication.relatedArtifacts,
  };
  await assert.rejects(transitionCycle(projectRoot, request, {
    checkpoint: async (point) => {
      if (point === "manifest-written") throw new Error("Injected crash before bootstrap cycle link");
    },
  }), /before bootstrap cycle link/);
  const batchBefore = await readFile(path.join(projectRoot, publication.batchReference.path), "utf8");
  const commitBefore = await readFile(path.join(projectRoot, publication.commitReference.path), "utf8");
  const manuscriptBefore = await readFile(path.join(projectRoot, "manuscript", "chapter-001.md"), "utf8");
  const input = await writeJson(path.join(projectRoot, "resume-publication.json"), {
    cycle_id: "cycle-bootstrap-001",
    operation_id: publication.commitReference.commit_id,
    direction: "resume-creation-publication",
  });
  const recovered = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    projectRoot,
    "--input",
    input,
  ]);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const active = JSON.parse(await readFile(started.cycle_path, "utf8"));
  assert.equal(active.revision, 2);
  assert.equal(active.current_strategy, "revise-draft");
  assert.equal(active.related_artifacts.creation_commits[0].commit_id,
    publication.commitReference.commit_id);
  assert.equal(await readFile(path.join(projectRoot, publication.batchReference.path), "utf8"), batchBefore);
  assert.equal(await readFile(path.join(projectRoot, publication.commitReference.path), "utf8"), commitBefore);
  assert.equal(await readFile(path.join(projectRoot, "manuscript", "chapter-001.md"), "utf8"), manuscriptBefore);
  assert.equal(Object.hasOwn(JSON.parse(await readFile(manifestPath, "utf8")), "cycle_operation"), false);
});

test("ordinary publication before cycle linking recovers from verified artifacts rather than pending approval", async (t) => {
  const fixture = await establishEvaluatedCycle(t);
  const startingScope = await currentScopeReference(fixture.projectRoot);
  const completed = await completeCycle(fixture.projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-001-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  });
  assert.equal(completed.valid, true, JSON.stringify(completed.blockers));
  const started = await startCycle(fixture.projectRoot, {
    cycle_id: "cycle-creation-002",
    initiating_strategy: "write-fiction",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.valid, true, JSON.stringify(started.blockers));
  const newChapter = "The next ferry arrives at noon.\nMara finds the missing letter.";
  const newPath = "manuscript/chapter-002.md";
  await writeFile(path.join(fixture.projectRoot, newPath), newChapter, "utf8");
  const startingSnapshot = JSON.parse(await readFile(
    path.join(fixture.projectRoot, startingScope.snapshot_path),
    "utf8",
  ));
  const files = [
    ...startingSnapshot.files,
    { path: newPath, sha256: createHash("sha256").update(newChapter).digest("hex") },
  ];
  await recordScope(fixture.projectRoot, {
    scope_id: "scope-creation-002",
    description: "The expanded manuscript after one accepted ordinary creation batch.",
    status: "confirmed",
    files,
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  const targetScope = await currentScopeReference(fixture.projectRoot);
  const batchId = "batch-creation-002";
  const commitId = "commit-creation-002";
  const storyBible = await artifactAt(fixture.projectRoot, "story-bible.md");
  const context = [{ path: storyBible.path, version: storyBible.sha256, version_type: "sha256" }];
  const planSummary = "Publish one accepted ordinary creation chapter.";
  const batchFiles = [{
    path: newPath,
    action: "create",
    input_sha256: null,
    output_sha256: createHash("sha256").update(newChapter).digest("hex"),
  }];
  const dependencyFingerprint = createHash("sha256").update(JSON.stringify({
    plan: planSummary,
    context,
    files: batchFiles.map(({ path: filePath, action, input_sha256 }) => ({
      path: filePath,
      action,
      input_sha256,
    })),
  })).digest("hex");
  for (const approval of [{
    id: "MANUSCRIPT-002",
    type: "creation-manuscript",
    paths: [newPath],
    reason: "Author accepted the exact ordinary manuscript batch.",
  }, {
    id: "SCOPE-002",
    type: "creation-scope",
    paths: files.map((file) => file.path),
    reason: "Author accepted the complete ordinary publication scope.",
  }]) {
    await appendRecoveryApproval(fixture.projectRoot, {
      ...approval,
      operation: "chapter-review",
      scopeId: targetScope.scope_id,
      reason: `${approval.reason} batch_id=${batchId} dependency_fingerprint=${dependencyFingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
    });
  }
  const currentStateRelative = ".author-toolkit/creation/state/current.md";
  const currentState = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: targetScope.scope_id,
    updated_at: timestamp,
    sources: files,
    summary: "The accepted ordinary batch establishes current story state.",
    records: [],
    children: [],
  };
  await writeFile(
    path.join(fixture.projectRoot, currentStateRelative),
    `# Current story state\n\n${currentState.summary}\n\n\`\`\`json\n${JSON.stringify(currentState, null, 2)}\n\`\`\`\n`,
    "utf8",
  );
  const currentStateReference = await artifactAt(fixture.projectRoot, currentStateRelative);
  const commitRelative = `.author-toolkit/creation/batches/${commitId}.json`;
  await writeJson(path.join(fixture.projectRoot, commitRelative), {
    schema_version: "1.0.0",
    batch_id: batchId,
    commit_id: commitId,
    status: "committed",
    scope_before_id: startingScope.scope_id,
    scope_after_id: targetScope.scope_id,
    files: batchFiles.map((file) => ({ ...file, backup_id: null, status: "verified" })),
    created_at: timestamp,
    updated_at: timestamp,
  });
  const batchRelative = `.author-toolkit/creation/batches/${batchId}.json`;
  await writeJson(path.join(fixture.projectRoot, batchRelative), {
    schema_version: "1.0.0",
    batch_id: batchId,
    operation: "chapter-creation",
    source_mode: "author",
    status: "committed",
    scope_id: targetScope.scope_id,
    plan: { summary: planSummary, context, dependency_fingerprint: dependencyFingerprint },
    files: batchFiles.map((file) => ({ ...file, status: "verified" })),
    story_state: [currentStateReference],
    approvals: ["MANUSCRIPT-002", "SCOPE-002"],
    commit: commitRelative,
    next_action: "Run revise-increment for the complete expanded manuscript.",
    created_at: timestamp,
    updated_at: timestamp,
  });
  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  await writeJson(fixture.manifestPath, {
    ...manifest,
    pending_action: {
      operation: "creation-commit",
      status: "in_progress",
      scope_id: targetScope.scope_id,
      scope_fingerprint: targetScope.scope_fingerprint,
      cycle_id: "cycle-creation-002",
      cycle_revision: 1,
      operation_id: commitId,
      reason: "Publication finished but its cycle link was interrupted.",
      artifacts: [commitRelative],
      updated_at: timestamp,
    },
  });
  const batchBefore = await readFile(path.join(fixture.projectRoot, batchRelative), "utf8");
  const commitBefore = await readFile(path.join(fixture.projectRoot, commitRelative), "utf8");
  const manuscriptBefore = await readFile(path.join(fixture.projectRoot, newPath), "utf8");
  const diagnosis = JSON.parse(runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
  ]).stdout);
  assert.equal(diagnosis.state_written, false);
  assert.ok(diagnosis.blockers.some((blocker) => blocker.code === "cycle-operation-id-mismatch"));
  const input = await writeJson(path.join(fixture.projectRoot, "resume-ordinary-publication.json"), {
    cycle_id: "cycle-creation-002",
    operation_id: commitId,
    direction: "resume-creation-publication",
  });
  const recovered = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
    "--input",
    input,
  ]);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const active = JSON.parse(await readFile(started.cycle_path, "utf8"));
  assert.equal(active.revision, 2);
  assert.equal(active.current_strategy, "revise-increment");
  assert.deepEqual(active.starting_scope, startingScope);
  assert.deepEqual(active.target_scope, targetScope);
  assert.equal(active.related_artifacts.creation_commits[0].commit_id, commitId);
  assert.equal(await readFile(path.join(fixture.projectRoot, batchRelative), "utf8"), batchBefore);
  assert.equal(await readFile(path.join(fixture.projectRoot, commitRelative), "utf8"), commitBefore);
  assert.equal(await readFile(path.join(fixture.projectRoot, newPath), "utf8"), manuscriptBefore);
});


test("scope identity and artifact hash mismatches block automatic continuation with concrete paths", async (t) => {
  const fixture = await establishEvaluatedCycle(t);
  const activeBefore = await readFile(fixture.activePath, "utf8");
  const active = JSON.parse(activeBefore);
  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  await writeJson(fixture.manifestPath, {
    ...manifest,
    pending_action: {
      operation: "current-scope-review",
      status: "in_progress",
      scope_id: active.target_scope.scope_id,
      scope_fingerprint: "0".repeat(64),
      cycle_id: active.cycle_id,
      cycle_revision: active.revision,
      operation_id: active.recovery_position.operation_id,
      reason: "An interrupted manifest names the wrong target fingerprint.",
      artifacts: [],
      updated_at: timestamp,
    },
  });
  const diagnosis = JSON.parse(runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
  ]).stdout);
  assert.ok(diagnosis.blockers.some((blocker) =>
    blocker.code === "cycle-pending-scope-mismatch" &&
    blocker.message.includes("0".repeat(64))
  ));
  const direction = await writeJson(path.join(fixture.projectRoot, "accept-active.json"), {
    cycle_id: "cycle-bootstrap-001",
    operation_id: "evaluation-001",
    direction: "accept-active-cycle",
  });
  const accepted = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
    "--input",
    direction,
  ]);
  assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
  const synchronized = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  assert.equal(synchronized.pending_action.scope_fingerprint,
    active.target_scope.scope_fingerprint);
  assert.equal(await readFile(fixture.activePath, "utf8"), activeBefore);

  const snapshotPath = path.join(fixture.projectRoot, active.target_scope.snapshot_path);
  const snapshotBefore = await readFile(snapshotPath, "utf8");
  await writeFile(snapshotPath, `${snapshotBefore}\n`, "utf8");
  const manifestBeforeRejectedRecovery = await readFile(fixture.manifestPath, "utf8");
  const damaged = JSON.parse(runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
  ]).stdout);
  assert.ok(damaged.blockers.some((blocker) =>
    blocker.code === "cycle-artifact-hash-mismatch" &&
    blocker.path === active.target_scope.snapshot_path
  ));
  const rejected = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
    "--input",
    direction,
  ]);
  assert.equal(rejected.status, 1, `${rejected.stdout}\n${rejected.stderr}`);
  assert.ok(JSON.parse(rejected.stdout).blockers.some((blocker) =>
    blocker.code === "cycle-artifact-hash-mismatch"
  ));
  assert.equal(await readFile(fixture.manifestPath, "utf8"), manifestBeforeRejectedRecovery);
  assert.equal(await readFile(snapshotPath, "utf8"), `${snapshotBefore}\n`);
});


for (const strategy of ["revise-request", "revise-draft", "revise-fiction"]) {
  test(`${strategy} verification crash resumes the same cycle and verified execution`, async (t) => {
    const fixture = await establishChapterRevision(t, { strategy });
    const prepared = await prepareRevisionExecution(fixture.projectRoot, fixture.execution);
    assert.equal(prepared.valid, true, JSON.stringify(prepared.blockers));
    await writeFile(path.join(fixture.projectRoot, "manuscript", "chapter-001.md"), fixture.output, "utf8");
    await recordScope(fixture.projectRoot, {
      scope_id: fixture.evidence.scopeReference.scope_id,
      description: `The full manuscript after the approved ${strategy} edit.`,
      status: "confirmed",
      files: [{
        path: "manuscript/chapter-001.md",
        sha256: createHash("sha256").update(fixture.output).digest("hex"),
      }],
      excluded_files: [],
      created_at: timestamp,
    }, {
      authorConfirmation: {
        decision_id: "SCOPE-003",
        confirmed_at: timestamp,
        reading_order_confirmed: true,
      },
      now: new Date(timestamp),
    });
    const target = await createNoEditEvidence(fixture.projectRoot, {
      passId: "pass-003",
      baselinePass: fixture.evidence.passReference,
      noEditDecisionId: "NOEDIT-003",
    });
    const verification = {
      cycle_id: fixture.execution.cycle_id,
      expected_revision: fixture.execution.expected_revision + 1,
      execution_id: fixture.execution.execution_id,
      requested_pass: target.passReference,
      target_scope: target.scopeReference,
    };
    await assert.rejects(verifyRevisionExecution(fixture.projectRoot, verification, {
      checkpoint: async (point) => {
        if (point === "execution-written") throw new Error(`Injected ${strategy} crash`);
      },
    }), new RegExp(strategy));
    const verifiedBefore = await readFile(prepared.execution_path, "utf8");
    const input = await writeJson(path.join(fixture.projectRoot, "recover-strategy-execution.json"), {
      cycle_id: fixture.execution.cycle_id,
      operation_id: fixture.execution.execution_id,
      direction: "resume-revision-execution",
    });
    const recovered = runAuthorProject([
      "reconcile-cycle",
      "--project-root",
      fixture.projectRoot,
      "--input",
      input,
    ]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    const active = JSON.parse(await readFile(fixture.activePath, "utf8"));
    assert.equal(active.initiating_strategy, strategy);
    assert.equal(active.revision, fixture.execution.expected_revision + 2);
    assert.deepEqual(active.target_scope, target.scopeReference);
    assert.equal(await readFile(prepared.execution_path, "utf8"), verifiedBefore);
    assert.equal(Object.hasOwn(JSON.parse(await readFile(fixture.manifestPath, "utf8")), "cycle_operation"), false);
  });
}


test("independent draft evaluation is idempotent after a post-publication crash and creates no cycle state", async (t) => {
  const manuscript = "The ferry leaves at dawn.\nMara watches it go.";
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await recordScope(projectRoot, {
    scope_id: "scope-independent-001",
    description: "The complete independent draft manuscript.",
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
  const request = {
    evaluation_id: "evaluation-independent-001",
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: [],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  };
  await assert.rejects(evaluateDraft(projectRoot, request, {
    now: new Date("2026-11-06T07:00:00Z"),
    checkpoint: async (point) => {
      if (point === "evaluation-published") throw new Error("Injected independent publication crash");
    },
  }), /independent publication crash/);
  const evaluationPath = path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "evaluations",
    "evaluation-independent-001.json",
  );
  const evaluationBefore = await readFile(evaluationPath, "utf8");
  const gate = runAuthorProject(["convergence-gate", "--project-root", projectRoot]);
  assert.equal(gate.status, 0, `${gate.stdout}\n${gate.stderr}`);
  const retried = await evaluateDraft(projectRoot, request, {
    now: new Date("2026-11-06T07:00:00Z"),
  });
  assert.equal(retried.valid, true, JSON.stringify(retried.blockers));
  assert.equal(await readFile(evaluationPath, "utf8"), evaluationBefore);
  await assert.rejects(readFile(path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "active-cycle.json",
  )), { code: "ENOENT" });
  assert.equal(Object.hasOwn(JSON.parse(await readFile(manifestPath, "utf8")), "cycle_operation"), false);
});


test("lock recovery refuses a running owner or a mismatched abandoned-owner token", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const activeBefore = await readFile(started.cycle_path, "utf8");
  const directory = path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "active-cycle.lock",
  );
  await mkdir(directory);
  const runningOwner = {
    pid: process.pid,
    token: "running-owner-token",
    acquired_at: timestamp,
  };
  await writeJson(path.join(directory, "owner.json"), runningOwner);
  const runningInput = await writeJson(path.join(projectRoot, "reject-running-lock.json"), {
    direction: "release-stale-lock",
    lock_owner: { pid: runningOwner.pid, token: runningOwner.token },
  });
  const running = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    projectRoot,
    "--input",
    runningInput,
  ]);
  assert.equal(running.status, 1);
  assert.equal(JSON.parse(running.stdout).blockers[0].code, "cycle-lock-owner-active");
  assert.equal(JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")).token,
    runningOwner.token);

  const abandonedOwner = {
    pid: await exitedProcess(),
    token: "actual-abandoned-token",
    acquired_at: timestamp,
  };
  await writeJson(path.join(directory, "owner.json"), abandonedOwner);
  const wrongInput = await writeJson(path.join(projectRoot, "reject-wrong-lock-token.json"), {
    direction: "release-stale-lock",
    lock_owner: { pid: abandonedOwner.pid, token: "wrong-token" },
  });
  const wrong = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    projectRoot,
    "--input",
    wrongInput,
  ]);
  assert.equal(wrong.status, 1);
  assert.equal(JSON.parse(wrong.stdout).blockers[0].code, "cycle-lock-owner-mismatch");
  assert.equal(JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8")).token,
    abandonedOwner.token);
  assert.equal(await readFile(started.cycle_path, "utf8"), activeBefore);
});


test("completed-cycle pointer mismatches block dependent work without rehashing altered history", async (t) => {
  const fixture = await establishEvaluatedCycle(t);
  const startingScope = await currentScopeReference(fixture.projectRoot);
  const completed = await completeCycle(fixture.projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-001-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  });
  assert.equal(completed.valid, true, JSON.stringify(completed.blockers));
  const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8"));
  const completedBefore = await readFile(fixture.completedPath, "utf8");
  await writeJson(fixture.manifestPath, {
    ...manifest,
    last_completed_cycle: {
      ...manifest.last_completed_cycle,
      path: ".author-toolkit/convergence/cycles/wrong-location.json",
    },
  });
  const blocked = await startCycle(fixture.projectRoot, {
    cycle_id: "cycle-request-002",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(blocked.valid, false);
  assert.equal(blocked.blockers[0].code, "cycle-completed-pointer-path-mismatch");
  const input = await writeJson(path.join(fixture.projectRoot, "repair-completed-pointer.json"), {
    cycle_id: "cycle-bootstrap-001",
    operation_id: "evaluation-001-completion",
    direction: "repair-completed-pointer",
  });
  const repaired = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
    "--input",
    input,
  ]);
  assert.equal(repaired.status, 0, `${repaired.stdout}\n${repaired.stderr}`);
  assert.equal(await readFile(fixture.completedPath, "utf8"), completedBefore);
  assert.equal(JSON.parse(await readFile(fixture.manifestPath, "utf8")).last_completed_cycle.path,
    ".author-toolkit/convergence/cycles/cycle-bootstrap-001.json");

  await writeFile(fixture.completedPath, `${completedBefore}\n`, "utf8");
  const manifestBeforeRejectedRepair = await readFile(fixture.manifestPath, "utf8");
  const rejected = runAuthorProject([
    "reconcile-cycle",
    "--project-root",
    fixture.projectRoot,
    "--input",
    input,
  ]);
  assert.equal(rejected.status, 1, `${rejected.stdout}\n${rejected.stderr}`);
  assert.ok(JSON.parse(rejected.stdout).blockers.some((blocker) =>
    blocker.code === "cycle-completed-pointer-hash-mismatch"
  ));
  assert.equal(await readFile(fixture.manifestPath, "utf8"), manifestBeforeRejectedRepair);
  assert.equal(await readFile(fixture.completedPath, "utf8"), `${completedBefore}\n`);
  const gate = runAuthorProject(["convergence-gate", "--project-root", fixture.projectRoot]);
  assert.equal(gate.status, 1);
  assert.equal(JSON.parse(gate.stdout).blockers[0].code,
    "cycle-completed-pointer-hash-mismatch");
});
