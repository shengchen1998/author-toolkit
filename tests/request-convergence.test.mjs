import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  appendRevisionExecutionApprovals,
  appendTrackerApproval as appendApproval,
  artifactAt,
  createConvergenceProject,
  createFirstPublicationArtifacts,
  createNoEditEvidence,
  currentScopeReference,
  runAuthorProjectAsync,
  runInput,
  runValidator,
  timestamp,
  writeBackupEvidence,
  writeJson,
} from "./convergence-helpers.mjs";

async function preparedProject(t, { actions = null, inputOrder = null, inputs = null } = {}) {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const output = "The ferry leaves at dusk.\nMara watches it go.";
  const batchActions = actions ?? [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input: original,
    output,
  }];
  const inputFiles = inputs ?? batchActions
    .filter((action) => action.input !== null)
    .map(({ path: filePath, input }) => ({ path: filePath, input }));
  const inputByPath = new Map(inputFiles.map((file) => [file.path, file.input]));
  const orderedInputPaths = inputOrder ?? inputFiles.map((file) => file.path);
  const { projectRoot } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  for (const file of inputFiles) {
    await mkdir(path.dirname(path.join(projectRoot, file.path)), { recursive: true });
    await writeFile(path.join(projectRoot, file.path), file.input, "utf8");
  }
  await recordScope(projectRoot, {
    scope_id: "scope-request-001",
    description: "The complete manuscript before the approved request edit.",
    status: "confirmed",
    files: orderedInputPaths.map((filePath) => ({
      path: filePath,
      sha256: createHash("sha256").update(inputByPath.get(filePath)).digest("hex"),
    })),
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
  const scope = await currentScopeReference(projectRoot);
  const firstPublication = await createFirstPublicationArtifacts(projectRoot);
  const evidence = await createNoEditEvidence(projectRoot);
  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "chapter-revision",
      reason: "An exact approved revision batch is ready for execution preparation.",
    },
    target_scope: scope,
    requested_pass: evidence.passReference,
    related_artifacts: firstPublication.relatedArtifacts,
  });
  assert.equal(transitioned.status, 0, transitioned.stderr);

  const planRelative = "sessions/request-plan-001.md";
  const batchRelative = "sessions/request-batch-001.json";
  await writeFile(
    path.join(projectRoot, planRelative),
    "# Request plan\n\nChange dawn to dusk in chapter 1.\n",
    "utf8",
  );
  await writeJson(path.join(projectRoot, batchRelative), {
    batch_id: "request-batch-001",
    action: "Change dawn to dusk in chapter 1.",
  });
  const backup = await writeBackupEvidence(projectRoot, {
    backupId: "backup-001",
    approvalId: "EDIT-001",
    scope,
    files: batchActions.map((action) => ({
      path: action.path,
      action: action.action,
      input_sha256: action.input === null ? null : createHash("sha256").update(action.input).digest("hex"),
      output_sha256: action.output === null ? null : createHash("sha256").update(action.output).digest("hex"),
      contents: action.input,
    })),
  });
  const backupFiles = backup.files;
  const backupManifestRelative = ".author-toolkit/backups/backup-001/manifest.json";
  const execution = {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 2,
    execution_id: "execution-001",
    plan: { plan_id: "request-plan-001", ...(await artifactAt(projectRoot, planRelative)) },
    batch: { batch_id: "request-batch-001", ...(await artifactAt(projectRoot, batchRelative)) },
    requested_pass: evidence.passReference,
    input_scope: scope,
    finding_dispositions: [],
    author_decision_ids: ["PLAN-001"],
    approval_ids: ["EDIT-001"],
    backups: backupFiles.length > 0 ? [{
      backup_id: "backup-001",
      approval_id: "EDIT-001",
      manifest: await artifactAt(projectRoot, backupManifestRelative),
      files: backupFiles,
    }] : [],
    files: batchActions.map((action) => ({
      path: action.path,
      action: action.action,
      input_sha256: action.input === null ? null : createHash("sha256").update(action.input).digest("hex"),
      output_sha256: action.output === null ? null : createHash("sha256").update(action.output).digest("hex"),
    })),
  };
  await appendRevisionExecutionApprovals(projectRoot, execution, {
    planReason: "Author confirmed the exact request plan and finding disposition.",
  });
  return { projectRoot, evidence, scope, original, output, execution, actions: batchActions, inputOrder: orderedInputPaths };
}

test("an approved batch remains prepared until current output bytes verify", async (t) => {
  const fixture = await preparedProject(t);
  const outsideBackup = await runInput(fixture.projectRoot, "prepare-revision-execution", {
    ...fixture.execution,
    execution_id: "execution-outside-backup",
    backups: [{
      ...fixture.execution.backups[0],
      files: [{
        ...fixture.execution.backups[0].files[0],
        backup_path: "manuscript/chapter-001.md",
      }],
    }],
  });
  assert.equal(outsideBackup.status, 1, `${outsideBackup.stdout}\n${outsideBackup.stderr}`);
  assert.equal(
    JSON.parse(outsideBackup.stdout).blockers[0].code,
    "revision-execution-preparation-invalid",
  );
  const manuscriptBefore = await readFile(
    path.join(fixture.projectRoot, "manuscript", "chapter-001.md"),
    "utf8",
  );
  const prepared = await runInput(
    fixture.projectRoot,
    "prepare-revision-execution",
    fixture.execution,
  );
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  const preparedResult = JSON.parse(prepared.stdout);
  assert.equal(preparedResult.execution.status, "prepared");
  assert.equal(preparedResult.execution.verified_at, null);
  assert.equal(preparedResult.cycle.revision, 3);
  assert.equal(
    await readFile(path.join(fixture.projectRoot, "manuscript", "chapter-001.md"), "utf8"),
    manuscriptBefore,
  );
  const artifact = runValidator([
    "--revision-execution",
    preparedResult.execution_path,
  ]);
  assert.equal(artifact.status, 0, `${artifact.stdout}\n${artifact.stderr}`);

  const verified = await runInput(fixture.projectRoot, "verify-revision-execution", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    execution_id: "execution-001",
    requested_pass: fixture.evidence.passReference,
    target_scope: fixture.scope,
  });
  assert.equal(verified.status, 1, `${verified.stdout}\n${verified.stderr}`);
  const failed = JSON.parse(verified.stdout);
  assert.equal(failed.blockers[0].code, "revision-output-mismatch");
  assert.equal(failed.state_written, false);
  const active = JSON.parse(await readFile(
    path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 3);
  assert.equal(active.related_artifacts.revision_executions.length, 1);
  const stored = JSON.parse(await readFile(preparedResult.execution_path, "utf8"));
  assert.equal(stored.status, "prepared");
  for (const [name, invalid] of [
    ["additional-property", { ...stored, unexpected: true }],
    ["invalid-status", { ...stored, status: "approved" }],
    ["missing-output", {
      ...stored,
      files: [{ ...stored.files[0], output_sha256: null }],
    }],
  ]) {
    const invalidPath = await writeJson(path.join(fixture.projectRoot, `${name}.json`), invalid);
    assert.equal(
      runValidator(["--revision-execution", invalidPath]).status,
      1,
      name,
    );
  }
});


test("revision preparation rejects stale approvals for changed batches, actions, outputs, scope fingerprints, and plan operations", async (t) => {
  for (const change of ["batch", "action", "output", "scope-fingerprint", "plan-operation"]) {
    const fixture = await preparedProject(t);
    const execution = {
      ...fixture.execution,
      execution_id: `execution-stale-${change}`,
      files: structuredClone(fixture.execution.files),
    };
    const trackerPath = path.join(fixture.projectRoot, "audit-tracker.md");
    if (change === "batch") {
      const batchPath = path.join(fixture.projectRoot, execution.batch.path);
      await writeJson(batchPath, {
        batch_id: execution.batch.batch_id,
        action: "Replace the approved batch with different content under the same scope ID.",
      });
      execution.batch = await artifactAt(fixture.projectRoot, execution.batch.path);
    }
    if (change === "action") execution.files[0].action = "reorder";
    if (change === "output") {
      execution.files[0].output_sha256 = createHash("sha256")
        .update("This output was not covered by the original approval.")
        .digest("hex");
    }
    if (change === "scope-fingerprint") {
      const tracker = await readFile(trackerPath, "utf8");
      await writeFile(
        trackerPath,
        tracker.replaceAll(execution.input_scope.scope_fingerprint, "0".repeat(64)),
        "utf8",
      );
    }
    if (change === "plan-operation") {
      const tracker = await readFile(trackerPath, "utf8");
      await writeFile(
        trackerPath,
        tracker.replace(
          "| PLAN-001 | revision-plan | revision-plan |",
          "| PLAN-001 | revision-plan | chapter-revision |",
        ),
        "utf8",
      );
    }

    const prepared = await runInput(fixture.projectRoot, "prepare-revision-execution", execution);
    assert.equal(prepared.status, 1, `${change}: ${prepared.stdout}\n${prepared.stderr}`);
    assert.equal(
      JSON.parse(prepared.stdout).blockers[0].code,
      "revision-execution-preparation-invalid",
      change,
    );
    await assert.rejects(
      readFile(path.join(
        fixture.projectRoot,
        ".author-toolkit",
        "convergence",
        "executions",
        `${execution.execution_id}.json`,
      )),
      { code: "ENOENT" },
    );
  }
});


test("verification preserves prepared requested subchecks and rejects a reduced final pass", async (t) => {
  const fixture = await preparedProject(t);
  const expanded = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-prepared-expanded-002",
    baselinePass: fixture.evidence.passReference,
    noEditDecisionId: "NOEDIT-202",
    requestedSubchecks: [{
      operation: "diagnostics",
      subcheck: "information-release",
      author_decision_id: "REQUEST-202",
    }],
  });
  const transition = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "chapter-revision",
      reason: "Prepare the approved edit with one additional required check.",
    },
    requested_pass: expanded.passReference,
  });
  assert.equal(transition.status, 0, `${transition.stdout}\n${transition.stderr}`);
  const prepared = await runInput(fixture.projectRoot, "prepare-revision-execution", {
    ...fixture.execution,
    expected_revision: 3,
    requested_pass: expanded.passReference,
  });
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  const preparedResult = JSON.parse(prepared.stdout);

  await writeFile(
    path.join(fixture.projectRoot, "manuscript", "chapter-001.md"),
    fixture.output,
    "utf8",
  );
  await recordScope(fixture.projectRoot, {
    scope_id: fixture.scope.scope_id,
    description: "The complete manuscript after the approved request edit.",
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
  const targetScope = await currentScopeReference(fixture.projectRoot);
  const reduced = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-final-reduced-003",
    baselinePass: fixture.evidence.passReference,
    noEditDecisionId: "NOEDIT-203",
  });
  assert.ok(
    expanded.pass.required_operations
      .find((requirement) => requirement.operation === "diagnostics")
      .subchecks.includes("information-release"),
  );
  assert.ok(
    !reduced.pass.required_operations
      .find((requirement) => requirement.operation === "diagnostics")
      .subchecks.includes("information-release"),
  );

  const verified = await runInput(fixture.projectRoot, "verify-revision-execution", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 4,
    execution_id: "execution-001",
    requested_pass: reduced.passReference,
    target_scope: targetScope,
  });
  assert.equal(verified.status, 1, `${verified.stdout}\n${verified.stderr}`);
  const failed = JSON.parse(verified.stdout);
  assert.equal(failed.blockers[0].code, "revision-pass-requirements-reduced");
  assert.equal(failed.state_written, false);
  assert.equal(
    JSON.parse(await readFile(preparedResult.execution_path, "utf8")).status,
    "prepared",
  );
  const active = JSON.parse(await readFile(
    path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 4);
  assert.equal(active.requested_pass.pass_id, expanded.pass.pass_id);
  assert.equal(active.target_scope.scope_fingerprint, fixture.scope.scope_fingerprint);

  const lawfulFinal = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-final-expanded-004",
    baselinePass: expanded.passReference,
    noEditDecisionId: "NOEDIT-204",
  });
  const lawfulVerification = await runInput(fixture.projectRoot, "verify-revision-execution", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 4,
    execution_id: "execution-001",
    requested_pass: lawfulFinal.passReference,
    target_scope: targetScope,
  });
  assert.equal(lawfulVerification.status, 0, `${lawfulVerification.stdout}\n${lawfulVerification.stderr}`);
  const lawfulResult = JSON.parse(lawfulVerification.stdout);
  assert.equal(lawfulResult.execution.status, "verified");
  assert.ok(
    lawfulResult.cycle.requested_pass.pass_fingerprint === lawfulFinal.passReference.pass_fingerprint &&
    lawfulFinal.pass.required_operations
      .find((requirement) => requirement.operation === "diagnostics")
      .subchecks.includes("information-release"),
  );
});


test("approval without verified execution blocks convergence as not_satisfied", async (t) => {
  const fixture = await preparedProject(t);
  const prepared = await runInput(
    fixture.projectRoot,
    "prepare-revision-execution",
    fixture.execution,
  );
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  const transitioned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Evaluate the prepared but unexecuted approval without treating it as an edit.",
    },
    related_artifacts: {
      review_groups: [fixture.evidence.reviewGroupReference],
      reviews: fixture.evidence.reviewJobs.map(({ reference }) => reference),
    },
  });
  assert.equal(transitioned.status, 0, transitioned.stderr);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    fixture.evidence.evaluationInput("evaluation-approved-unexecuted", 4),
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "not_satisfied");
  assert.ok(result.evaluation.blockers.some(
    (blocker) => blocker.code === "approved-edit-unexecuted"
  ), JSON.stringify(result.evaluation.blockers, null, 2));
});


async function completeBootstrapBase(fixture) {
  const transitioned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 2,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Establish the satisfied full-manuscript request base.",
    },
    related_artifacts: {
      review_groups: [fixture.evidence.reviewGroupReference],
      reviews: fixture.evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [fixture.evidence.noEditReference],
    },
  });
  assert.equal(transitioned.status, 0, transitioned.stderr);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    fixture.evidence.evaluationInput("evaluation-base-001", 3),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const completed = await runInput(fixture.projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 4,
    evaluation_id: "evaluation-base-001-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
}

test("revision verification compares retained paths by relative order for insertion, deletion, and reorder", async (t) => {
  const first = "Chapter one remains unchanged.\n";
  const second = "Chapter two remains unchanged.\n";
  const inserted = "The inserted chapter has approved content.\n";
  const firstPath = "manuscript/chapter-001.md";
  const secondPath = "manuscript/chapter-002.md";
  const insertedPath = "manuscript/chapter-inserted.md";
  const scenarios = [{
    name: "insertion",
    inputs: [{ path: firstPath, input: first }, { path: secondPath, input: second }],
    actions: [{ path: insertedPath, action: "create", input: null, output: inserted }],
    target: [
      { path: firstPath, contents: first },
      { path: insertedPath, contents: inserted },
      { path: secondPath, contents: second },
    ],
    created: [insertedPath],
    deleted: [],
    reordered: [],
  }, {
    name: "deletion",
    inputs: [{ path: firstPath, input: first }, { path: secondPath, input: second }],
    actions: [{ path: firstPath, action: "delete", input: first, output: null }],
    target: [{ path: secondPath, contents: second }],
    created: [],
    deleted: [firstPath],
    reordered: [],
  }, {
    name: "reorder",
    inputs: [{ path: firstPath, input: first }, { path: secondPath, input: second }],
    actions: [
      { path: firstPath, action: "reorder", input: first, output: first },
      { path: secondPath, action: "reorder", input: second, output: second },
    ],
    target: [
      { path: secondPath, contents: second },
      { path: firstPath, contents: first },
    ],
    created: [],
    deleted: [],
    reordered: [firstPath, secondPath],
  }, {
    name: "modify-reorder",
    inputs: [{ path: firstPath, input: first }, { path: secondPath, input: second }],
    actions: [
      { path: firstPath, action: "modify", input: first, output: "Chapter one is revised and moved.\n" },
      { path: secondPath, action: "reorder", input: second, output: second },
    ],
    target: [
      { path: secondPath, contents: second },
      { path: firstPath, contents: "Chapter one is revised and moved.\n" },
    ],
    created: [],
    deleted: [],
    reordered: [firstPath, secondPath],
  }];

  for (const [index, scenario] of scenarios.entries()) {
    const suffix = index + 1;
    const fixture = await preparedProject(t, {
      inputs: scenario.inputs,
      actions: scenario.actions,
    });
    await completeBootstrapBase(fixture);
    const cycleId = `cycle-retained-${scenario.name}`;
    const started = await runInput(fixture.projectRoot, "start-cycle", {
      cycle_id: cycleId,
      initiating_strategy: "revise-request",
      bootstrap: false,
      starting_scope: fixture.scope,
    });
    assert.equal(started.status, 0, `${scenario.name}: ${started.stdout}\n${started.stderr}`);
    const beforeEdit = await createNoEditEvidence(fixture.projectRoot, {
      passId: `pass-${scenario.name}-plan`,
      baselinePass: fixture.evidence.passReference,
      noEditDecisionId: `NOEDIT-30${suffix}`,
    });
    const planned = await runInput(fixture.projectRoot, "transition-cycle", {
      cycle_id: cycleId,
      expected_revision: 1,
      current_strategy: "revise-request",
      recovery_position: {
        operation: "chapter-revision",
        reason: `Verify the approved ${scenario.name} against retained relative order.`,
      },
      target_scope: fixture.scope,
      requested_pass: beforeEdit.passReference,
    });
    assert.equal(planned.status, 0, `${scenario.name}: ${planned.stdout}\n${planned.stderr}`);
    const prepared = await runInput(fixture.projectRoot, "prepare-revision-execution", {
      ...fixture.execution,
      cycle_id: cycleId,
      expected_revision: 2,
      requested_pass: beforeEdit.passReference,
    });
    assert.equal(prepared.status, 0, `${scenario.name}: ${prepared.stdout}\n${prepared.stderr}`);

    const targetPaths = new Set(scenario.target.map((file) => file.path));
    for (const input of scenario.inputs) {
      if (!targetPaths.has(input.path)) await rm(path.join(fixture.projectRoot, input.path));
    }
    for (const file of scenario.target) {
      await writeFile(path.join(fixture.projectRoot, file.path), file.contents, "utf8");
    }
    await recordScope(fixture.projectRoot, {
      scope_id: fixture.scope.scope_id,
      description: `The complete manuscript after approved ${scenario.name}.`,
      status: "confirmed",
      files: scenario.target.map((file) => ({
        path: file.path,
        sha256: createHash("sha256").update(file.contents).digest("hex"),
      })),
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
    const finalEvidence = await createNoEditEvidence(fixture.projectRoot, {
      passId: `pass-${scenario.name}-final`,
      baselinePass: fixture.evidence.passReference,
      noEditDecisionId: `NOEDIT-40${suffix}`,
    });
    const verified = await runInput(fixture.projectRoot, "verify-revision-execution", {
      cycle_id: cycleId,
      expected_revision: 3,
      execution_id: fixture.execution.execution_id,
      requested_pass: finalEvidence.passReference,
      target_scope: targetScope,
    });
    assert.equal(verified.status, 0, `${scenario.name}: ${verified.stdout}\n${verified.stderr}`);
    const changeSet = JSON.parse(verified.stdout).cycle.change_set;
    assert.deepEqual(changeSet.created.map((file) => file.path), scenario.created, scenario.name);
    assert.deepEqual(changeSet.deleted.map((file) => file.path), scenario.deleted, scenario.name);
    assert.deepEqual(changeSet.reordered.map((file) => file.path), scenario.reordered, scenario.name);
  }
});

test("an edited request preserves its base and completes only after full-target convergence", async (t) => {
  const fixture = await preparedProject(t);
  await completeBootstrapBase(fixture);
  const baseSnapshotBefore = await readFile(
    path.join(fixture.projectRoot, fixture.scope.snapshot_path),
    "utf8",
  );
  const started = await runInput(fixture.projectRoot, "start-cycle", {
    cycle_id: "cycle-request-002",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: fixture.scope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const beforeEdit = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-request-002",
    baselinePass: fixture.evidence.passReference,
    noEditDecisionId: "NOEDIT-002",
  });
  const planned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 1,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "chapter-revision",
      reason: "The narrow approved request batch awaits execution.",
    },
    target_scope: fixture.scope,
    requested_pass: beforeEdit.passReference,
    work_set: {
      entries: [{
        path: "manuscript/chapter-001.md",
        operations: ["chapter-revision"],
        reason: "Only the author-requested passage needs a manuscript edit.",
      }],
    },
  });
  assert.equal(planned.status, 0, planned.stderr);
  const executionInput = {
    ...fixture.execution,
    cycle_id: "cycle-request-002",
    expected_revision: 2,
    requested_pass: beforeEdit.passReference,
  };
  const prepared = await runInput(
    fixture.projectRoot,
    "prepare-revision-execution",
    executionInput,
  );
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);

  await writeFile(
    path.join(fixture.projectRoot, "manuscript", "chapter-001.md"),
    fixture.output,
    "utf8",
  );
  await recordScope(fixture.projectRoot, {
    scope_id: fixture.scope.scope_id,
    description: "The complete manuscript after the approved request edit.",
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
    now: new Date("2026-11-05T01:00:00Z"),
  });
  const target = await currentScopeReference(fixture.projectRoot);
  assert.notEqual(target.scope_fingerprint, fixture.scope.scope_fingerprint);
  const finalEvidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-request-final-002",
    baselinePass: fixture.evidence.passReference,
    noEditDecisionId: "NOEDITFINAL-002",
  });
  const verified = await runInput(fixture.projectRoot, "verify-revision-execution", {
    cycle_id: "cycle-request-002",
    expected_revision: 3,
    execution_id: "execution-001",
    requested_pass: finalEvidence.passReference,
    target_scope: target,
  });
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  const verifiedResult = JSON.parse(verified.stdout);
  assert.equal(verifiedResult.execution.status, "verified");
  assert.equal(verifiedResult.cycle.starting_scope.scope_fingerprint, fixture.scope.scope_fingerprint);
  assert.equal(verifiedResult.cycle.target_scope.scope_fingerprint, target.scope_fingerprint);
  assert.deepEqual(verifiedResult.cycle.change_set.modified, [{
    path: "manuscript/chapter-001.md",
    input_sha256: createHash("sha256").update(fixture.original).digest("hex"),
    output_sha256: createHash("sha256").update(fixture.output).digest("hex"),
  }]);
  assert.equal(
    await readFile(path.join(fixture.projectRoot, fixture.scope.snapshot_path), "utf8"),
    baseSnapshotBefore,
  );
  const requestStatus = runValidator([
    "--convergence-status",
    path.join(fixture.projectRoot, ".author-toolkit", "project.json"),
  ]);
  assert.equal(requestStatus.status, 0, requestStatus.stderr);
  const independentStatus = JSON.parse(requestStatus.stdout);
  assert.equal(independentStatus.outcome, "indeterminate");
  assert.equal(independentStatus.request_completion.status, "complete");

  const finding = reviewFinding();
  await injectOpenReviewFinding(fixture.projectRoot, finalEvidence, finding);
  const reviewLinked = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 4,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The verified edit has new full-target review evidence.",
    },
    related_artifacts: {
      review_groups: [finalEvidence.reviewGroupReference],
      reviews: finalEvidence.reviewJobs.map(({ reference }) => reference),
    },
  });
  assert.equal(reviewLinked.status, 0, reviewLinked.stderr);
  const manuscriptPath = path.join(fixture.projectRoot, "manuscript", "chapter-001.md");
  await writeFile(manuscriptPath, `${fixture.output}\nUnrecorded tampering.`, "utf8");
  const tampered = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    finalEvidence.evaluationInput("evaluation-request-tampered", 5, "cycle-request-002"),
  );
  assert.equal(tampered.status, 1, `${tampered.stdout}\n${tampered.stderr}`);
  const tamperedResult = JSON.parse(tampered.stdout);
  assert.equal(tamperedResult.evaluation.outcome, "not_satisfied");
  assert.ok(tamperedResult.evaluation.blockers.some(
    (blocker) => blocker.code === "revision-output-mismatch"
  ), JSON.stringify(tamperedResult.evaluation.blockers, null, 2));
  await writeFile(manuscriptPath, fixture.output, "utf8");

  const openEvaluation = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    finalEvidence.evaluationInput("evaluation-request-open-finding", 6, "cycle-request-002"),
  );
  assert.equal(openEvaluation.status, 1, `${openEvaluation.stdout}\n${openEvaluation.stderr}`);
  const openResult = JSON.parse(openEvaluation.stdout);
  assert.equal(openResult.evaluation.outcome, "not_satisfied");
  assert.ok(openResult.evaluation.blockers.some((blocker) => blocker.code === "open-findings"));

  const reworkOutput = "The ferry leaves at night.\nMara watches it go.";
  await appendApproval(fixture.projectRoot, {
    id: "RESOLVE-101",
    type: "finding-decision",
    operation: "current-scope-review",
    scopeId: target.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: "Author accepted the review finding for verified execution.",
  });
  const reworkPlan = "sessions/request-plan-101.md";
  const reworkBatch = "sessions/request-batch-101.json";
  await writeFile(
    path.join(fixture.projectRoot, reworkPlan),
    "# Review finding rework\n\nClarify the departure transition.\n",
    "utf8",
  );
  await writeJson(path.join(fixture.projectRoot, reworkBatch), {
    batch_id: "request-batch-101",
    finding_id: finding.id,
  });
  const reworkBackup = ".author-toolkit/backups/backup-101/manuscript/chapter-001.md";
  const reworkBackupManifest = ".author-toolkit/backups/backup-101/manifest.json";
  await writeBackupEvidence(fixture.projectRoot, {
    backupId: "backup-101",
    approvalId: "EDIT-101",
    scope: target,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: createHash("sha256").update(fixture.output).digest("hex"),
      output_sha256: createHash("sha256").update(reworkOutput).digest("hex"),
      contents: fixture.output,
    }],
  });
  const reworkPlanned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 7,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "chapter-revision",
      reason: "The accepted review finding returns to revision planning and execution.",
    },
  });
  assert.equal(reworkPlanned.status, 0, reworkPlanned.stderr);
  const reworkExecution = {
    cycle_id: "cycle-request-002",
    expected_revision: 8,
    execution_id: "execution-101",
    plan: { plan_id: "request-plan-101", ...(await artifactAt(fixture.projectRoot, reworkPlan)) },
    batch: { batch_id: "request-batch-101", ...(await artifactAt(fixture.projectRoot, reworkBatch)) },
    requested_pass: finalEvidence.passReference,
    input_scope: target,
    finding_dispositions: [{
      finding_id: finding.id,
      disposition: "execute",
      author_decision_id: "RESOLVE-101",
    }],
    author_decision_ids: ["PLAN-101", "RESOLVE-101"],
    approval_ids: ["EDIT-101"],
    backups: [{
      backup_id: "backup-101",
      approval_id: "EDIT-101",
      manifest: await artifactAt(fixture.projectRoot, reworkBackupManifest),
      files: [{
        path: "manuscript/chapter-001.md",
        backup_path: reworkBackup,
        sha256: createHash("sha256").update(fixture.output).digest("hex"),
      }],
    }],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: createHash("sha256").update(fixture.output).digest("hex"),
      output_sha256: createHash("sha256").update(reworkOutput).digest("hex"),
    }],
  };
  await appendRevisionExecutionApprovals(fixture.projectRoot, reworkExecution, {
    planReason: "Author accepted the review finding and confirmed its exact rework plan.",
    editReason: "Author approved the review-finding rework input and output versions.",
  });
  const reworkPrepared = await runInput(
    fixture.projectRoot,
    "prepare-revision-execution",
    reworkExecution,
  );
  assert.equal(reworkPrepared.status, 0, `${reworkPrepared.stdout}\n${reworkPrepared.stderr}`);
  await writeFile(manuscriptPath, reworkOutput, "utf8");
  await recordScope(fixture.projectRoot, {
    scope_id: target.scope_id,
    description: "The complete manuscript after accepted review-finding rework.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(reworkOutput).digest("hex"),
    }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-101",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date("2026-11-05T02:00:00Z"),
  });
  const reworkTarget = await currentScopeReference(fixture.projectRoot);
  const reworkEvidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-request-rework-002",
    baselinePass: fixture.evidence.passReference,
    noEditDecisionId: "NOEDITREWORK-002",
    findings: [finding],
    findingStatuses: {
      [finding.id]: {
        status: "open",
        reason: "Author will accept the finding after execution-101 verifies the approved fix.",
      },
    },
  });
  const reworkVerified = await runInput(fixture.projectRoot, "verify-revision-execution", {
    cycle_id: "cycle-request-002",
    expected_revision: 9,
    execution_id: "execution-101",
    requested_pass: reworkEvidence.passReference,
    target_scope: reworkTarget,
  });
  assert.equal(reworkVerified.status, 0, `${reworkVerified.stdout}\n${reworkVerified.stderr}`);
  const decided = await runInput(fixture.projectRoot, "record-finding-decision", {
    finding_id: finding.id,
    status: "resolved",
    report: "reports/diagnostics/pass-request-rework-002-local.md",
    reason: "Author accepted the finding and execution-101 verified the approved fix.",
    author_decision_id: "RESOLVE-101",
    revision_execution: JSON.parse(reworkVerified.stdout).execution_reference,
  });
  assert.equal(decided.status, 0, `${decided.stdout}\n${decided.stderr}`);
  const cumulative = JSON.parse(reworkVerified.stdout).cycle.change_set;
  assert.equal(cumulative.from_scope.scope_fingerprint, fixture.scope.scope_fingerprint);
  assert.deepEqual(cumulative.modified, [{
    path: "manuscript/chapter-001.md",
    input_sha256: createHash("sha256").update(fixture.original).digest("hex"),
    output_sha256: createHash("sha256").update(reworkOutput).digest("hex"),
  }]);
  const reworkReviewLinked = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 10,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Accepted review fixes have new affected coverage and another full-target review.",
    },
    related_artifacts: {
      review_groups: [reworkEvidence.reviewGroupReference],
      reviews: reworkEvidence.reviewJobs.map(({ reference }) => reference),
    },
  });
  assert.equal(reworkReviewLinked.status, 0, reworkReviewLinked.stderr);
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    reworkEvidence.evaluationInput("evaluation-request-002", 11, "cycle-request-002"),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluation = JSON.parse(evaluated.stdout);
  assert.equal(evaluation.evaluation.outcome, "satisfied");
  assert.equal(
    evaluation.evaluation.review_group.review_group_id,
    reworkEvidence.reviewGroup.review_group_id,
  );
  assert.ok(evaluation.evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "revision-execution" && artifact.artifact_id === "execution-001"
  ));
  assert.ok(evaluation.evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "revision-execution" && artifact.artifact_id === "execution-101"
  ));
  assert.ok(evaluation.evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "execution-input-scope"
  ));

  const trackerBeforeInvalidation = await readFile(
    path.join(fixture.projectRoot, "audit-tracker.md"),
    "utf8",
  );
  await writeFile(manuscriptPath, `${reworkOutput}\nPost-evaluation tampering.`, "utf8");
  const invalidated = runValidator([
    "--convergence-status",
    path.join(fixture.projectRoot, ".author-toolkit", "project.json"),
  ]);
  assert.equal(invalidated.status, 0, invalidated.stderr);
  const invalidatedStatus = JSON.parse(invalidated.stdout);
  assert.equal(invalidatedStatus.outcome, "indeterminate");
  assert.equal(invalidatedStatus.current, false);
  assert.ok(invalidatedStatus.blockers.some((blocker) => blocker.code === "target-scope-not-current"));
  assert.ok(invalidatedStatus.blockers.some((blocker) => blocker.code === "revision-output-mismatch"));
  const rejectedCompletion = await runInput(fixture.projectRoot, "complete-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 12,
    evaluation_id: "evaluation-request-002-invalid-completion",
    decision_id: "COMPLETE-900",
    author_confirmed: true,
  });
  assert.equal(rejectedCompletion.status, 1, `${rejectedCompletion.stdout}\n${rejectedCompletion.stderr}`);
  assert.equal(
    JSON.parse(rejectedCompletion.stdout).blockers[0].code,
    "completion-evaluation-not-satisfied",
  );
  assert.equal(
    await readFile(path.join(fixture.projectRoot, "audit-tracker.md"), "utf8"),
    trackerBeforeInvalidation,
  );
  await writeFile(manuscriptPath, reworkOutput, "utf8");
  const restoredGate = runValidator([
    "--convergence-gate",
    path.join(fixture.projectRoot, ".author-toolkit", "project.json"),
  ]);
  assert.equal(restoredGate.status, 0, `${restoredGate.stdout}\n${restoredGate.stderr}`);

  const completed = await runInput(fixture.projectRoot, "complete-cycle", {
    cycle_id: "cycle-request-002",
    expected_revision: 12,
    evaluation_id: "evaluation-request-002-completion",
    decision_id: "COMPLETE-002",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  const completedResult = JSON.parse(completed.stdout);
  assert.equal(completedResult.cycle.status, "completed");
  assert.equal(completedResult.cycle.starting_scope.scope_fingerprint, fixture.scope.scope_fingerprint);
  assert.equal(completedResult.cycle.target_scope.scope_fingerprint, reworkTarget.scope_fingerprint);
});


function reviewFinding(id = "REVIEW-001") {
  return {
    id,
    audit: "intent and consistency review",
    technique: "continuity",
    severity: "suggestion",
    location: { file: "manuscript/chapter-001.md", scope: "file" },
    issue: "The departure time now needs one consistent transition.",
    recommendation: "Clarify the revised departure time in the approved passage.",
    confidence: "judgment",
  };
}

async function injectOpenReviewFinding(projectRoot, evidence, finding) {
  const reportReference = evidence.reviewReports[0];
  const reportPath = path.join(projectRoot, reportReference.path);
  const markdown = await readFile(reportPath, "utf8");
  const match = markdown.match(/```json\n([\s\S]+?)\n```/);
  assert.ok(match);
  const envelope = JSON.parse(match[1]);
  envelope.findings.push(finding);
  await writeFile(
    reportPath,
    markdown.replace(match[1], JSON.stringify(envelope, null, 2)),
    "utf8",
  );
  reportReference.sha256 = createHash("sha256").update(await readFile(reportPath)).digest("hex");

  const groupPath = path.join(projectRoot, evidence.reviewGroupReference.path);
  evidence.reviewGroup.reports.find((report) => report.path === reportReference.path).sha256 =
    reportReference.sha256;
  await writeJson(groupPath, evidence.reviewGroup);
  evidence.reviewGroupReference.sha256 = createHash("sha256").update(await readFile(groupPath)).digest("hex");

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
  evidence.hostAttestationReference.sha256 = createHash("sha256")
    .update(await readFile(attestationPath))
    .digest("hex");

  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|---|---|\n";
  const index = tracker.indexOf(separator, tracker.indexOf("## Findings"));
  const row = `| ${finding.id} | current-scope-review | ${finding.audit} | ${finding.location.file} | open | ${reportReference.path} | ${timestamp} | Author decision is required after full-target review. |\n`;
  await writeFile(
    trackerPath,
    tracker.slice(0, index + separator.length) + row + tracker.slice(index + separator.length),
    "utf8",
  );
}


test("a narrow no-change request keeps full-target coverage and reuses eligible units", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.status, 0, started.stderr);
  const chapters = [{
    path: "manuscript/chapter-001.md",
    contents: "The ferry leaves at dawn.\nMara watches it go.",
  }, {
    path: "manuscript/chapter-002.md",
    contents: "The harbor bell answers.\nMara turns toward home.",
  }];
  for (const chapter of chapters) {
    await writeFile(path.join(projectRoot, chapter.path), chapter.contents, "utf8");
  }
  await recordScope(projectRoot, {
    scope_id: "scope-request-201",
    description: "Two chapters in author-confirmed reading order.",
    status: "confirmed",
    files: chapters.map((chapter) => ({
      path: chapter.path,
      sha256: createHash("sha256").update(chapter.contents).digest("hex"),
    })),
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-201",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  const baseScope = await currentScopeReference(projectRoot);
  const firstPublication = await createFirstPublicationArtifacts(projectRoot, {
    scopeApprovalId: "SCOPE-201",
  });
  const base = await createNoEditEvidence(projectRoot, { passId: "pass-base-201" });
  const baseLinked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Establish the two-chapter satisfied base.",
    },
    target_scope: baseScope,
    requested_pass: base.passReference,
    related_artifacts: {
      ...firstPublication.relatedArtifacts,
      review_groups: [base.reviewGroupReference],
      reviews: base.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [base.noEditReference],
    },
  });
  assert.equal(baseLinked.status, 0, baseLinked.stderr);
  const baseEvaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    base.evaluationInput("evaluation-base-201", 2),
  );
  assert.equal(baseEvaluated.status, 0, `${baseEvaluated.stdout}\n${baseEvaluated.stderr}`);
  const baseCompleted = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-base-201-completion",
    decision_id: "COMPLETE-201",
    author_confirmed: true,
  });
  assert.equal(baseCompleted.status, 0, `${baseCompleted.stdout}\n${baseCompleted.stderr}`);

  const requestStarted = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-request-202",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: baseScope,
  });
  assert.equal(requestStarted.status, 0, `${requestStarted.stdout}\n${requestStarted.stderr}`);
  const target = await createNoEditEvidence(projectRoot, {
    passId: "pass-request-202",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-202",
    requestedSubchecks: [{
      operation: "diagnostics",
      subcheck: "information-release",
      author_decision_id: "REQUEST-202",
    }],
  });
  const baseIndex = JSON.parse(await readFile(
    path.join(projectRoot, base.coverageIndexReference.path),
    "utf8",
  ));
  const targetIndexPath = path.join(projectRoot, target.coverageIndexReference.path);
  const targetIndex = JSON.parse(await readFile(targetIndexPath, "utf8"));
  for (const operation of ["characters", "prose", "ai-cleanup"]) {
    targetIndex.entries.find((entry) => entry.operation === operation).units =
      structuredClone(baseIndex.entries.find((entry) => entry.operation === operation).units);
  }
  await writeJson(targetIndexPath, targetIndex);
  target.coverageIndexReference.sha256 = createHash("sha256")
    .update(await readFile(targetIndexPath))
    .digest("hex");
  const coverageClaimArtifacts = [target.passReference, target.coverageIndexReference];
  for (const entry of targetIndex.entries) {
    for (const unitReference of entry.units) {
      coverageClaimArtifacts.push(unitReference);
      const unit = JSON.parse(await readFile(path.join(projectRoot, unitReference.path), "utf8"));
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
  target.hostAttestation.claims[0].artifacts = coverageClaimArtifacts.map(
    ({ path: artifactPath, sha256 }) => ({ path: artifactPath, sha256 }),
  );
  const hostPath = path.join(projectRoot, target.hostAttestationReference.path);
  await writeJson(hostPath, target.hostAttestation);
  target.hostAttestationReference.sha256 = createHash("sha256")
    .update(await readFile(hostPath))
    .digest("hex");
  const deferredReviewFinding = reviewFinding("REVIEW-201");
  await injectOpenReviewFinding(projectRoot, target, deferredReviewFinding);
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const approvalRow = tracker.split("\n").find((line) => line.startsWith("| NOEDIT-202 |"));
  assert.ok(approvalRow);
  const boundApprovalRow = approvalRow.replace(
    "Author confirmed that no accepted finding requires a manuscript edit.",
    `Author confirmed that no accepted finding requires a manuscript edit. finding_id=${deferredReviewFinding.id} finding_status=deferred`,
  );
  await writeFile(trackerPath, tracker.replace(approvalRow, boundApprovalRow), "utf8");
  target.noEditSkip.covered_findings.push(deferredReviewFinding.id);
  const skipPath = path.join(projectRoot, target.noEditReference.path);
  await writeJson(skipPath, target.noEditSkip);
  target.noEditReference.sha256 = createHash("sha256").update(await readFile(skipPath)).digest("hex");
  const decided = await runInput(projectRoot, "record-finding-decision", {
    finding_id: deferredReviewFinding.id,
    status: "deferred",
    report: target.reviewReports[0].path,
    reason: "Author deferred the review suggestion with its consequence recorded.",
    author_decision_id: target.noEditSkip.author_decision_id,
    no_edit_skip: target.noEditReference,
  });
  assert.equal(decided.status, 0, `${decided.stdout}\n${decided.stderr}`);

  const linked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-202",
    expected_revision: 1,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The no-change request adds one check and reuses eligible two-chapter evidence.",
    },
    target_scope: baseScope,
    requested_pass: target.passReference,
    related_artifacts: {
      review_groups: [target.reviewGroupReference],
      reviews: target.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [target.noEditReference],
    },
    work_set: {
      entries: [{
        path: "manuscript/chapter-001.md",
        operations: ["diagnostics"],
        reason: "The request set names only the first chapter and one added check.",
      }],
    },
  });
  assert.equal(linked.status, 0, linked.stderr);
  assert.deepEqual(target.pass.paths, chapters.map((chapter) => chapter.path));
  assert.equal(
    targetIndex.entries.find((entry) => entry.operation === "prose").units[0].path,
    baseIndex.entries.find((entry) => entry.operation === "prose").units[0].path,
  );
  assert.deepEqual(
    target.pass.required_operations.find((entry) => entry.operation === "diagnostics").subchecks,
    ["causality", "information-release"],
  );

  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    target.evaluationInput("evaluation-request-202", 2, "cycle-request-202"),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "satisfied");
  assert.deepEqual(result.cycle.work_set.entries.map((entry) => entry.path), [
    "manuscript/chapter-001.md",
  ]);
  assert.equal(result.cycle.target_scope.scope_fingerprint, baseScope.scope_fingerprint);
  const status = runValidator([
    "--convergence-status",
    path.join(projectRoot, ".author-toolkit", "project.json"),
  ]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).request_completion.status, "complete");

  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-request-202",
    expected_revision: 3,
    evaluation_id: "evaluation-request-202-completion",
    decision_id: "COMPLETE-202",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
});


test("independent preparation processes serialize on the active cycle revision", async (t) => {
  const fixture = await preparedProject(t);
  const inputs = [];
  for (const executionId of ["execution-race-a", "execution-race-b"]) {
    inputs.push(await writeJson(path.join(fixture.projectRoot, `${executionId}.json`), {
      ...fixture.execution,
      execution_id: executionId,
    }));
  }
  const processes = await Promise.all(inputs.map((input) => runAuthorProjectAsync([
    "prepare-revision-execution",
    "--project-root",
    fixture.projectRoot,
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
  assert.equal(loser.result.state_written, false);
  const active = JSON.parse(await readFile(
    path.join(fixture.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 3);
  assert.equal(active.related_artifacts.revision_executions.length, 1);
  assert.equal(
    active.related_artifacts.revision_executions[0].execution_id,
    winner.result.execution.execution_id,
  );
});


async function evaluateEditedRequestFinding(t, findingStatus, { withNoEditDecision = false } = {}) {
  const fixture = await preparedProject(t);
  await completeBootstrapBase(fixture);
  const started = await runInput(fixture.projectRoot, "start-cycle", {
    cycle_id: "cycle-request-finding-gate",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: fixture.scope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const beforeEdit = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-finding-gate-plan",
    baselinePass: fixture.evidence.passReference,
    noEditDecisionId: "NOEDIT-301",
  });
  const planned = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-finding-gate",
    expected_revision: 1,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "chapter-revision",
      reason: "Prepare one verified edit before testing an independent finding decision.",
    },
    target_scope: fixture.scope,
    requested_pass: beforeEdit.passReference,
    work_set: {
      entries: [{
        path: "manuscript/chapter-001.md",
        operations: ["chapter-revision"],
        reason: "Only this requested passage needs an edit.",
      }],
    },
  });
  assert.equal(planned.status, 0, planned.stderr);
  const prepared = await runInput(fixture.projectRoot, "prepare-revision-execution", {
    ...fixture.execution,
    cycle_id: "cycle-request-finding-gate",
    expected_revision: 2,
    requested_pass: beforeEdit.passReference,
  });
  assert.equal(prepared.status, 0, `${prepared.stdout}\n${prepared.stderr}`);
  const manuscriptPath = path.join(fixture.projectRoot, "manuscript", "chapter-001.md");
  await writeFile(manuscriptPath, fixture.output, "utf8");
  await recordScope(fixture.projectRoot, {
    scope_id: fixture.scope.scope_id,
    description: "The complete edited manuscript for the finding-decision gate.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(fixture.output).digest("hex"),
    }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-301",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date("2026-11-05T03:00:00Z"),
  });
  const target = await currentScopeReference(fixture.projectRoot);
  const evidence = await createNoEditEvidence(fixture.projectRoot, {
    passId: "pass-finding-gate-target",
    baselinePass: fixture.evidence.passReference,
    noEditDecisionId: "NOEDIT-302",
  });
  const finding = reviewFinding("REVIEWGATE-001");
  await injectOpenReviewFinding(fixture.projectRoot, evidence, finding);
  const trackerPath = path.join(fixture.projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  if (withNoEditDecision) {
    evidence.noEditSkip.covered_findings.push(finding.id);
    const skipPath = path.join(fixture.projectRoot, evidence.noEditReference.path);
    await writeJson(skipPath, evidence.noEditSkip);
    evidence.noEditReference.sha256 = createHash("sha256")
      .update(await readFile(skipPath))
      .digest("hex");
    const approvalRow = tracker.split("\n").find((line) => line.startsWith("| NOEDIT-302 |"));
    assert.ok(approvalRow);
    const boundApprovalRow = approvalRow.replace(
      "Author confirmed that no accepted finding requires a manuscript edit.",
      `Author confirmed that no accepted finding requires a manuscript edit. finding_id=${finding.id} finding_status=${findingStatus}`,
    );
    await writeFile(trackerPath, tracker.replace(approvalRow, boundApprovalRow), "utf8");
  } else {
    await writeFile(
      trackerPath,
      tracker.replace(
        `| ${finding.id} | current-scope-review | ${finding.audit} | ${finding.location.file} | open | ${evidence.reviewReports[0].path} | ${timestamp} | Author decision is required after full-target review. |`,
        `| ${finding.id} | current-scope-review | ${finding.audit} | ${finding.location.file} | ${findingStatus} | ${evidence.reviewReports[0].path} | ${timestamp} | Tracker status was edited without a finding-decision record. |`,
      ),
      "utf8",
    );
  }
  const verified = await runInput(fixture.projectRoot, "verify-revision-execution", {
    cycle_id: "cycle-request-finding-gate",
    expected_revision: 3,
    execution_id: "execution-001",
    requested_pass: evidence.passReference,
    target_scope: target,
  });
  assert.equal(verified.status, withNoEditDecision ? 0 : 1, `${verified.stdout}\n${verified.stderr}`);
  if (!withNoEditDecision) {
    const status = runValidator([
      "--convergence-status",
      path.join(fixture.projectRoot, ".author-toolkit", "project.json"),
    ]);
    return {
      finding,
      evaluated: verified,
      evaluationResult: JSON.parse(verified.stdout),
      status,
      requestCompletion: null,
    };
  }
  if (withNoEditDecision) {
    const decided = await runInput(fixture.projectRoot, "record-finding-decision", {
      finding_id: finding.id,
      status: findingStatus,
      report: evidence.reviewReports[0].path,
      reason: `Author recorded the ${findingStatus} no-edit decision after verified output.`,
      author_decision_id: evidence.noEditSkip.author_decision_id,
      no_edit_skip: evidence.noEditReference,
    });
    assert.equal(decided.status, 0, `${decided.stdout}\n${decided.stderr}`);
  }
  const linked = await runInput(fixture.projectRoot, "transition-cycle", {
    cycle_id: "cycle-request-finding-gate",
    expected_revision: 4,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "current-scope-review",
      reason: "Evaluate the independent finding after the verified request edit.",
    },
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      ...(withNoEditDecision ? { no_edit_skips: [evidence.noEditReference] } : {}),
    },
  });
  assert.equal(linked.status, withNoEditDecision ? 0 : 1, linked.stderr);
  const status = runValidator([
    "--convergence-status",
    path.join(fixture.projectRoot, ".author-toolkit", "project.json"),
  ]);
  assert.equal(status.status, withNoEditDecision ? 0 : 1, status.stderr);
  if (!withNoEditDecision) {
    return {
      finding,
      evaluated: linked,
      evaluationResult: JSON.parse(linked.stdout),
      status,
      requestCompletion: null,
    };
  }
  const evaluated = await runInput(
    fixture.projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput(
      `evaluation-finding-${findingStatus}-decided`,
      5,
      "cycle-request-finding-gate",
    ),
  );
  return {
    finding,
    evaluated,
    evaluationResult: JSON.parse(evaluated.stdout),
    status,
    requestCompletion: JSON.parse(status.stdout).request_completion,
  };
}

for (const findingStatus of ["deferred", "dismissed"]) {
  test(`an edited execution does not bypass an undecided ${findingStatus} finding`, async (t) => {
    const result = await evaluateEditedRequestFinding(t, findingStatus);
    assert.equal(result.evaluated.status, 1, `${result.evaluated.stdout}\n${result.evaluated.stderr}`);
    assert.equal(result.evaluationResult.valid, false);
    const blocker = result.evaluationResult.blockers.find(
      (candidate) => candidate.code === "revision-execution-verification-invalid"
    );
    assert.ok(blocker, JSON.stringify(result.evaluationResult.blockers, null, 2));
    assert.match(blocker.message, /author_decision_id|finding_status/);
    assert.equal(result.requestCompletion, null);
  });
}


for (const findingStatus of ["deferred", "dismissed"]) {
  test(`an edited execution preserves a lawful ${findingStatus} no-edit decision`, async (t) => {
    const result = await evaluateEditedRequestFinding(t, findingStatus, {
      withNoEditDecision: true,
    });
    assert.equal(result.evaluated.status, 0, `${result.evaluated.stdout}\n${result.evaluated.stderr}`);
    assert.equal(result.evaluationResult.evaluation.outcome, "satisfied");
    assert.ok(!result.evaluationResult.evaluation.blockers.some(
      (candidate) => candidate.code === "finding-author-decision-missing"
    ));
    assert.equal(result.requestCompletion.status, "complete");
    assert.deepEqual(result.requestCompletion.blockers, []);
  });
}
