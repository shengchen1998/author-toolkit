import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  completeCycle,
  recomputeCompletedCycleForRecovery,
  recomputeCycleEvaluationForRecovery,
} from "./convergence.mjs";
import {
  completedPointerBlocker,
  coordinationBlockers,
  discardCycleOperation,
  finishCycleOperation,
} from "./cycle-coordination.mjs";
import { transitionCycle } from "./cycles.mjs";
import { validateManifest } from "./manifest.mjs";
import {
  prepareRevisionExecution,
  verifyRevisionExecution,
} from "./revision-execution.mjs";
import { reconcileManuscript } from "./reconciliation.mjs";
import { validateConvergenceCycleSchema } from "./schemas.mjs";
import {
  acquireDirectoryLock,
  inspectDirectoryLock,
  releaseAbandonedDirectoryLock,
  releaseDirectoryLock,
  removeVerified,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";

async function readProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const validation = validateManifest(manifest);
  if (!validation.valid || manifest.schema_version !== "3.2.0") {
    throw new Error("Cycle reconciliation requires a valid v3.2 project");
  }
  return { root, manifestPath, manifest };
}

function recoveryAction() {
  return {
    strategy: "author-project",
    operation: "reconcile-cycle",
    command: "author-project reconcile-cycle",
  };
}

function lockBlocker(inspected) {
  if (!inspected.present) return null;
  if (!inspected.owner) {
    return {
      code: "cycle-lock-owner-invalid",
      message: `Cannot verify the owner of ${inspected.directory}: ${inspected.error.message}. Do not remove the lock automatically.`,
      lock: { path: inspected.directory, entries: inspected.entries },
      required_action: recoveryAction(),
    };
  }
  return {
    code: inspected.running ? "cycle-lock-owner-active" : "cycle-lock-owner-not-running",
    message: inspected.running
      ? `Lock owner PID ${inspected.owner.pid} is still running; do not steal ${inspected.directory}.`
      : `Lock owner PID ${inspected.owner.pid} is not running. Releasing ${inspected.directory} requires its exact PID and token as explicit author direction.`,
    lock: {
      path: inspected.directory,
      ...inspected.owner,
      running: inspected.running,
      entries: inspected.entries,
    },
    required_action: recoveryAction(),
  };
}

function formatErrors(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

async function readJsonIfPresent(file) {
  try {
    return { text: await readFile(file, "utf8"), file };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function parseCycle(record) {
  if (!record) return null;
  const value = JSON.parse(record.text);
  const validation = validateConvergenceCycleSchema(value);
  if (!validation.valid) throw new Error(`Cycle is invalid: ${record.file}: ${formatErrors(validation.errors)}`);
  return { ...record, value };
}

function completedCyclePath(project, cycleId) {
  const relative = path.posix.join(
    project.manifest.paths.convergence,
    "cycles",
    `${cycleId}.json`,
  );
  return { relative, absolute: path.resolve(project.root, relative) };
}

function sameScope(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function activeArtifactReferences(project, cycle) {
  if (!cycle) return [];
  const references = [];
  function scope(reference, role) {
    if (!reference) return;
    references.push({
      role,
      path: reference.snapshot_path,
      sha256: reference.snapshot_sha256,
      expectedPath: path.posix.join(
        project.manifest.paths.convergence,
        "scopes",
        `${reference.scope_id}-${reference.scope_fingerprint}.json`,
      ),
      identity: { scope_id: reference.scope_id, scope_fingerprint: reference.scope_fingerprint },
    });
  }
  scope(cycle.starting_scope, "starting-scope");
  scope(cycle.target_scope, "target-scope");
  scope(cycle.change_set?.from_scope, "change-from-scope");
  scope(cycle.change_set?.to_scope, "change-to-scope");
  if (cycle.requested_pass) {
    references.push({
      role: "requested-pass",
      path: cycle.requested_pass.path,
      sha256: cycle.requested_pass.sha256,
      identity: {
        pass_id: cycle.requested_pass.pass_id,
        pass_fingerprint: cycle.requested_pass.pass_fingerprint,
      },
    });
  }
  for (const [role, reference] of [
    ["starting-evaluation", cycle.starting_evaluation],
    ["target-evaluation", cycle.target_evaluation],
  ]) {
    if (reference) {
      references.push({
        role,
        path: reference.path,
        sha256: reference.sha256,
        identity: { evaluation_id: reference.evaluation_id },
      });
    }
  }
  for (const [role, artifacts] of Object.entries(cycle.related_artifacts ?? {})) {
    for (const reference of artifacts) {
      const identity = {};
      for (const field of [
        "batch_id",
        "commit_id",
        "execution_id",
        "review_group_id",
        "job_id",
        "skip_id",
        "reconciliation_id",
      ]) {
        if (reference[field]) identity[field] = reference[field];
      }
      references.push({ role, path: reference.path, sha256: reference.sha256, identity });
    }
  }
  return references;
}

async function artifactDiagnostics(project, active) {
  const blockers = [];
  for (const reference of activeArtifactReferences(project, active?.value)) {
    let contents;
    try {
      contents = await readFile(path.resolve(project.root, reference.path));
    } catch (error) {
      blockers.push({
        code: "cycle-artifact-unavailable",
        message: `${reference.role} artifact cannot be read at ${reference.path}: ${error.message}`,
        path: reference.path,
        required_action: recoveryAction(),
      });
      continue;
    }
    const actualHash = sha256Bytes(contents);
    if (actualHash !== reference.sha256) {
      blockers.push({
        code: "cycle-artifact-hash-mismatch",
        message: `${reference.role} artifact at ${reference.path} has SHA-256 ${actualHash}, expected ${reference.sha256}.`,
        path: reference.path,
        expected_sha256: reference.sha256,
        actual_sha256: actualHash,
        required_action: recoveryAction(),
      });
      continue;
    }
    if (reference.expectedPath && reference.path !== reference.expectedPath) {
      blockers.push({
        code: "cycle-artifact-path-mismatch",
        message: `${reference.role} artifact path ${reference.path} must be ${reference.expectedPath}.`,
        path: reference.path,
        expected_path: reference.expectedPath,
        required_action: recoveryAction(),
      });
    }
    if (Object.keys(reference.identity).length > 0) {
      try {
        const artifact = JSON.parse(contents.toString("utf8"));
        for (const [field, expected] of Object.entries(reference.identity)) {
          if (artifact[field] !== expected) {
            blockers.push({
              code: "cycle-artifact-identity-mismatch",
              message: `${reference.role} artifact at ${reference.path} has ${field} ${artifact[field] ?? "null"}, expected ${expected}.`,
              path: reference.path,
              field,
              expected,
              actual: artifact[field] ?? null,
              required_action: recoveryAction(),
            });
          }
        }
      } catch (error) {
        blockers.push({
          code: "cycle-artifact-identity-mismatch",
          message: `${reference.role} artifact at ${reference.path} is not readable JSON: ${error.message}`,
          path: reference.path,
          required_action: recoveryAction(),
        });
      }
    }
  }
  return blockers;
}

async function completionDiagnostic(project, active) {
  if (!active || active.value.status !== "active") return { blockers: [], completed: null };
  const completedPath = completedCyclePath(project, active.value.cycle_id);
  const completed = parseCycle(await readJsonIfPresent(completedPath.absolute));
  if (!completed || completed.value.status !== "completed") {
    return { blockers: [], completed: null };
  }
  const completedReference = project.manifest.last_completed_cycle;
  const manifestMatches = completedReference?.cycle_id === completed.value.cycle_id &&
    completedReference.revision === completed.value.revision &&
    completedReference.path === completedPath.relative &&
    completedReference.sha256 === sha256Bytes(completed.text);
  const identitiesMatch = completed.value.revision === active.value.revision + 1 &&
    completed.value.initiating_strategy === active.value.initiating_strategy &&
    completed.value.current_strategy === active.value.current_strategy &&
    completed.value.bootstrap === active.value.bootstrap &&
    sameScope(completed.value.starting_scope, active.value.starting_scope) &&
    sameScope(completed.value.target_scope, active.value.target_scope) &&
    completed.value.completion?.target_evaluation_id === completed.value.target_evaluation?.evaluation_id;
  const code = identitiesMatch
    ? "cycle-completion-reconcile-required"
    : "cycle-completion-identity-mismatch";
  return {
    completed,
    blockers: [{
      code,
      message: identitiesMatch
        ? `Completed cycle ${completed.value.cycle_id} and its active record coexist; ${manifestMatches ? "only verified active removal remains" : "the manifest completed-cycle pointer and active removal remain"}.`
        : `Active and completed records for ${active.value.cycle_id} describe different cycle revisions, strategies, scopes, or completion evidence.`,
      cycle_id: active.value.cycle_id,
      completed_path: completedPath.relative,
      manifest_current: manifestMatches,
      required_action: recoveryAction(),
    }],
  };
}

function failure(code, message, cycle, details = {}) {
  return {
    valid: false,
    diagnostic_only: false,
    state_written: false,
    cycle,
    blockers: [{ code, message, required_action: recoveryAction() }],
    required_action: recoveryAction(),
    ...details,
  };
}

function discardDirections(operation) {
  switch (operation.kind) {
    case "revision-preparation":
    case "revision-verification":
      return ["resume-revision-execution"];
    case "evaluation":
      return ["attach-interrupted-evaluation"];
    case "creation-publication":
      return ["resume-creation-publication"];
    case "manuscript-reconciliation":
      return ["resume-manuscript-reconciliation"];
    case "completion":
      return ["resume-completion"];
    default:
      return [];
  }
}

function directionAction(direction = null) {
  if (!direction) return recoveryAction();
  return {
    strategy: "author-project",
    operation: direction,
    command: "author-project reconcile-cycle",
  };
}

async function unsafeDiscardResult(project, active, operation, artifacts) {
  const manifest = { ...project.manifest };
  delete manifest.cycle_operation;
  const remaining = coordinationBlockers({ ...project, manifest }, active);
  const completedPointer = await completedPointerBlocker(project);
  const blockers = [
    ...artifacts,
    ...remaining,
    ...(completedPointer ? [completedPointer] : []),
  ];
  if (blockers.length === 0) return null;
  const directions = discardDirections(operation);
  const requiredAction = directionAction(directions[0]);
  return {
    valid: false,
    diagnostic_only: false,
    state_written: false,
    cycle: active.value,
    interrupted_operation: operation,
    available_directions: directions,
    blockers: blockers.map((blocker) => ({
      ...blocker,
      required_action: requiredAction,
    })),
    required_action: requiredAction,
  };
}

async function finishCompletion(project, active, completed, request) {
  if (!active || !completed) {
    return failure("cycle-completion-unavailable", "The active and completed records needed for completion recovery are not both present.", active?.value ?? completed?.value ?? null);
  }
  if (request.cycle_id !== active.value.cycle_id) {
    return failure("cycle-id-mismatch", "The reconciliation direction must name the interrupted cycle explicitly.", active.value);
  }
  const diagnostic = await completionDiagnostic(project, active);
  if (diagnostic.blockers[0]?.code !== "cycle-completion-reconcile-required") {
    return failure(
      diagnostic.blockers[0]?.code ?? "cycle-completion-unavailable",
      diagnostic.blockers[0]?.message ?? "The completed cycle cannot be reconciled.",
      active.value,
    );
  }
  let evaluation;
  try {
    evaluation = await recomputeCompletedCycleForRecovery(project, completed.value);
  } catch (error) {
    return failure("completion-evaluation-unavailable", error.message, active.value);
  }
  if (!evaluation.current || evaluation.recomputed.outcome !== "satisfied") {
    return failure(
      "completion-evaluation-not-satisfied",
      "The completed cycle's post-decision evaluation is not current and satisfied; active state was not removed.",
      active.value,
      { evaluation: evaluation.recomputed },
    );
  }
  const completedPath = completedCyclePath(project, completed.value.cycle_id);
  const lastCompleted = {
    cycle_id: completed.value.cycle_id,
    revision: completed.value.revision,
    path: completedPath.relative,
    sha256: sha256Bytes(completed.text),
  };
  const operation = project.manifest.cycle_operation;
  if (operation) {
    if (
      operation.kind !== "completion" ||
      operation.cycle_id !== completed.value.cycle_id ||
      operation.intended_revision !== completed.value.revision ||
      (request.operation_id && request.operation_id !== operation.operation_id)
    ) {
      return failure("cycle-operation-id-mismatch", "The completed history does not match the interrupted completion operation.", active.value);
    }
    await finishCycleOperation(project, completed.value, operation.operation_id, {
      complete: true,
      completedAt: completed.value.updated_at,
      manifestChanges: { last_completed_cycle: lastCompleted },
    });
  } else {
    const manifest = {
      ...project.manifest,
      last_completed_cycle: lastCompleted,
      updated_at: completed.value.updated_at,
    };
    if (manifest.pending_action?.cycle_id === completed.value.cycle_id) {
      delete manifest.pending_action;
    }
    const manifestValidation = validateManifest(manifest);
    if (!manifestValidation.valid) {
      return failure("manifest-update-invalid", formatErrors(manifestValidation.errors), active.value);
    }
    await writeAtomicVerified(project.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  try {
    await removeVerified(active.file, sha256Bytes(active.text));
  } catch (error) {
    return failure(
      "cycle-active-content-changed",
      `The active record changed during reconciliation; active removal was refused after the manifest update: ${error.message}`,
      active.value,
      { state_written: true },
    );
  }
  return {
    valid: true,
    diagnostic_only: false,
    state_written: true,
    cycle: completed.value,
    evaluation: evaluation.stored,
    blockers: [],
    required_action: null,
  };
}

export async function reconcileCycle(projectRoot, request = {}, options = {}) {
  const allowed = new Set(["cycle_id", "operation_id", "direction", "lock_owner"]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown reconcile-cycle input field: ${key}`);
  }
  const project = await readProject(projectRoot);
  const lockPath = path.resolve(
    project.root,
    project.manifest.paths.convergence,
    "active-cycle.lock",
  );
  const inspected = await inspectDirectoryLock(lockPath);
  const active = parseCycle(await readJsonIfPresent(path.resolve(
    project.root,
    project.manifest.paths.convergence,
    "active-cycle.json",
  )));
  if (active && active.value.status !== "active") {
    throw new Error(`The living cycle record must be active: ${active.file}`);
  }
  const completion = await completionDiagnostic(project, active);
  let artifacts = await artifactDiagnostics(project, active);
  const blockers = [
    ...completion.blockers,
    ...coordinationBlockers(project, active),
    ...artifacts,
  ];
  const completedPointer = await completedPointerBlocker(project);
  if (completedPointer) blockers.push(completedPointer);
  const lockDiagnostic = lockBlocker(inspected);
  if (lockDiagnostic) blockers.push(lockDiagnostic);

  if (!request.direction) {
    return {
      valid: blockers.length === 0,
      diagnostic_only: true,
      state_written: false,
      cycle: active?.value ?? completion.completed?.value ?? null,
      completed_cycle: completion.completed?.value ?? null,
      interrupted_operation: project.manifest.cycle_operation ?? null,
      lock: inspected.present ? inspected : null,
      blockers,
      required_action: blockers.length > 0 ? recoveryAction() : null,
    };
  }
  const needsLock = [
    "accept-active-cycle",
    "discard-interrupted-operation",
    "attach-interrupted-evaluation",
    "finish-completion",
    "repair-completed-pointer",
  ].includes(request.direction);
  let recoveryLock = null;
  if (needsLock) {
    recoveryLock = await acquireDirectoryLock(lockPath, {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
    });
    if (!recoveryLock.acquired) {
      return failure(
        recoveryLock.code === "timeout" ? "cycle-transition-lock-timeout" : "cycle-transition-lock-error",
        `Cannot serialize cycle reconciliation at ${lockPath}: ${recoveryLock.error.message}`,
        active?.value ?? null,
      );
    }
    let currentManifest;
    let currentActiveText;
    try {
      currentManifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
      currentActiveText = active ? await readFile(active.file, "utf8") : null;
    } catch (error) {
      await releaseDirectoryLock(recoveryLock);
      return failure(
        "cycle-recovery-state-changed",
        `Cannot reconfirm cycle state after acquiring the recovery lock: ${error.message}`,
        active?.value ?? null,
      );
    }
    if (
      JSON.stringify(currentManifest) !== JSON.stringify(project.manifest) ||
      currentActiveText !== (active?.text ?? null)
    ) {
      await releaseDirectoryLock(recoveryLock);
      return failure(
        "cycle-recovery-state-changed",
        "Manifest or active cycle content changed after diagnosis; rerun reconcile-cycle before choosing a direction.",
        active?.value ?? null,
      );
    }
    artifacts = await artifactDiagnostics(project, active);
  }
  try {
  if (request.direction === "repair-completed-pointer") {
    const pointer = project.manifest.last_completed_cycle;
    if (
      !pointer || pointer.cycle_id !== request.cycle_id ||
      active?.value.cycle_id === pointer.cycle_id
    ) {
      return failure("cycle-completed-pointer-unavailable", "Pointer repair requires the mismatched completed cycle and no active record for that cycle.", active?.value ?? null);
    }
    const completedPath = completedCyclePath(project, pointer.cycle_id);
    const completed = parseCycle(await readJsonIfPresent(completedPath.absolute));
    if (!completed || completed.value.status !== "completed") {
      return failure("cycle-completed-pointer-unavailable", `No valid completed cycle exists at ${completedPath.relative}.`, active?.value ?? null);
    }
    if (sha256Bytes(completed.text) !== pointer.sha256) {
      return failure(
        "cycle-completed-pointer-hash-mismatch",
        "Completed history bytes differ from the manifest pointer; recovery will not rehash or relabel potentially changed history.",
        completed.value,
      );
    }
    if (
      request.operation_id &&
      request.operation_id !== completed.value.target_evaluation?.evaluation_id
    ) {
      return failure("cycle-operation-id-mismatch", "Pointer repair operation ID must name the completed target evaluation when supplied.", completed.value);
    }
    let evaluation;
    try {
      evaluation = await recomputeCompletedCycleForRecovery(project, completed.value);
    } catch (error) {
      return failure("completion-evaluation-unavailable", error.message, completed.value);
    }
    if (!evaluation.current || evaluation.recomputed.outcome !== "satisfied") {
      return failure("completion-evaluation-not-satisfied", "The completed history no longer has a current satisfied post-decision evaluation; its pointer was not changed.", completed.value);
    }
    const manifest = {
      ...project.manifest,
      last_completed_cycle: {
        cycle_id: completed.value.cycle_id,
        revision: completed.value.revision,
        path: completedPath.relative,
        sha256: sha256Bytes(completed.text),
      },
      updated_at: completed.value.updated_at,
    };
    await writeAtomicVerified(project.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return {
      valid: true,
      diagnostic_only: false,
      state_written: true,
      cycle: completed.value,
      evaluation: evaluation.stored,
      blockers: [],
      required_action: null,
    };
  }
  if (request.direction === "resume-creation-publication") {
    const operation = project.manifest.cycle_operation;
    if (
      inspected.present || !active ||
      (operation && (
        operation.kind !== "creation-publication" ||
        operation.operation_id !== request.operation_id ||
        operation.cycle_id !== request.cycle_id ||
        active.value.revision !== operation.expected_revision
      )) ||
      (!operation && active.value.cycle_id !== request.cycle_id)
    ) {
      return failure("creation-publication-identity-mismatch", "Creation recovery requires the exact cycle, commit ID, pre-link active revision, and no leftover lock.", active?.value ?? null);
    }
    try {
      const commitRelative = path.posix.join(
        project.manifest.paths.creation,
        "batches",
        `${request.operation_id}.json`,
      );
      const commitText = await readFile(path.resolve(project.root, commitRelative), "utf8");
      const commit = JSON.parse(commitText);
      const batchRelative = path.posix.join(
        project.manifest.paths.creation,
        "batches",
        `${commit.batch_id}.json`,
      );
      const batchText = await readFile(path.resolve(project.root, batchRelative), "utf8");
      const current = project.manifest.current_scope;
      if (!current?.snapshot_path) throw new Error("The confirmed publication scope is unavailable");
      const targetScope = {
        scope_id: current.scope_id,
        scope_fingerprint: current.scope_fingerprint,
        snapshot_path: current.snapshot_path,
        snapshot_sha256: current.snapshot_sha256,
      };
      return await transitionCycle(projectRoot, {
        cycle_id: active.value.cycle_id,
        expected_revision: operation?.expected_revision ?? active.value.revision,
        operation_id: request.operation_id,
        current_strategy: active.value.bootstrap ? "revise-draft" : "revise-increment",
        recovery_position: {
          operation: "intake",
          reason: "The verified creation publication requires its full-manuscript convergence recovery.",
        },
        target_scope: targetScope,
        related_artifacts: {
          creation_batches: [{
            batch_id: commit.batch_id,
            path: batchRelative,
            sha256: sha256Bytes(batchText),
          }],
          creation_commits: [{
            commit_id: commit.commit_id,
            batch_id: commit.batch_id,
            path: commitRelative,
            sha256: sha256Bytes(commitText),
          }],
        },
      }, { ...options, recoveryOperationId: request.operation_id });
    } catch (error) {
      return failure("creation-publication-evidence-unavailable", error.message, active.value);
    }
  }
  if (request.direction === "resume-manuscript-reconciliation") {
    const operation = project.manifest.cycle_operation;
    if (
      inspected.present || !operation || operation.kind !== "manuscript-reconciliation" ||
      operation.operation_id !== request.operation_id ||
      operation.cycle_id !== request.cycle_id ||
      active?.value.revision !== operation.expected_revision
    ) {
      return failure("reconciliation-identity-mismatch", "Manuscript reconciliation recovery requires the exact interrupted record, active revision, and no leftover lock.", active?.value ?? null);
    }
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "reconciliations",
      `${operation.artifact_id ?? operation.operation_id}.json`,
    );
    let reconciliation;
    try {
      reconciliation = JSON.parse(await readFile(path.resolve(project.root, relative), "utf8"));
    } catch (error) {
      return failure("reconciliation-artifact-unavailable", error.message, active.value);
    }
    return reconcileManuscript(projectRoot, {
      reconciliation_id: reconciliation.reconciliation_id,
      cycle_id: operation.cycle_id,
      expected_revision: operation.expected_revision,
      author_decision_id: reconciliation.author_decision_id,
      target_scope: reconciliation.target_scope,
      story_state: reconciliation.story_state,
    }, { ...options, recoveryOperationId: operation.operation_id });
  }
  if (request.direction === "resume-revision-execution") {
    const operation = project.manifest.cycle_operation;
    if (
      inspected.present || !operation ||
      !["revision-preparation", "revision-verification"].includes(operation.kind) ||
      operation.operation_id !== request.operation_id ||
      operation.cycle_id !== request.cycle_id ||
      active?.value.revision !== operation.expected_revision
    ) {
      return failure("revision-execution-identity-mismatch", "Revision recovery requires the exact interrupted execution, active revision, and no leftover lock.", active?.value ?? null);
    }
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "executions",
      `${operation.artifact_id ?? operation.operation_id}.json`,
    );
    let execution;
    try {
      execution = JSON.parse(await readFile(path.resolve(project.root, relative), "utf8"));
    } catch (error) {
      return failure("revision-execution-unavailable", error.message, active.value);
    }
    const recoveryOptions = { ...options, recoveryOperationId: operation.operation_id };
    if (operation.kind === "revision-verification") {
      return verifyRevisionExecution(projectRoot, {
        cycle_id: operation.cycle_id,
        expected_revision: operation.expected_revision,
        execution_id: execution.execution_id,
        requested_pass: execution.requested_pass,
        target_scope: execution.target_scope,
      }, recoveryOptions);
    }
    return prepareRevisionExecution(projectRoot, {
      cycle_id: operation.cycle_id,
      expected_revision: operation.expected_revision,
      execution_id: execution.execution_id,
      plan: execution.plan,
      batch: execution.batch,
      requested_pass: execution.requested_pass,
      input_scope: execution.input_scope,
      finding_dispositions: execution.finding_dispositions,
      author_decision_ids: execution.author_decision_ids,
      approval_ids: execution.approval_ids,
      backups: execution.backups,
      files: execution.files,
    }, recoveryOptions);
  }
  if (request.direction === "resume-completion") {
    const operation = project.manifest.cycle_operation;
    if (
      inspected.present || !operation || operation.kind !== "completion" ||
      operation.operation_id !== request.operation_id ||
      operation.cycle_id !== request.cycle_id ||
      active?.value.revision !== operation.expected_revision ||
      completion.completed || !operation.artifact_id
    ) {
      return failure(
        "cycle-operation-id-mismatch",
        "Completion recovery requires the exact unfinished completion operation, its evaluation ID, no completed history, and no leftover lock.",
        active?.value ?? null,
      );
    }
    return completeCycle(projectRoot, {
      cycle_id: operation.cycle_id,
      expected_revision: operation.expected_revision,
      evaluation_id: operation.artifact_id,
      decision_id: operation.operation_id,
      author_confirmed: true,
    }, { ...options, recoveryOperationId: operation.operation_id });
  }
  if (request.direction === "attach-interrupted-evaluation") {
    if (inspected.present) {
      return failure("cycle-lock-owner-active", "Resolve the existing lock before linking the published evaluation.", active?.value ?? null);
    }
    const operation = project.manifest.cycle_operation;
    if (
      !operation || operation.kind !== "evaluation" ||
      operation.operation_id !== request.operation_id ||
      operation.cycle_id !== request.cycle_id ||
      active?.value.revision !== operation.expected_revision
    ) {
      return failure("evaluation-identity-mismatch", "The evaluation recovery direction does not match the interrupted evaluation and active revision.", active?.value ?? null);
    }
    try {
      const relative = path.posix.join(
        project.manifest.paths.convergence,
        "evaluations",
        `${operation.artifact_id ?? operation.operation_id}.json`,
      );
      const text = await readFile(path.resolve(project.root, relative), "utf8");
      const reference = {
        evaluation_id: operation.artifact_id ?? operation.operation_id,
        path: relative,
        sha256: sha256Bytes(text),
      };
      const evaluation = await recomputeCycleEvaluationForRecovery(project, active.value, reference);
      const updated = {
        ...active.value,
        revision: active.value.revision + 1,
        target_evaluation: reference,
        recovery_position: evaluation.stored.outcome === "satisfied"
          ? {
              operation: null,
              reason: "The current satisfied target evaluation awaits an explicit author completion decision.",
              required_strategy: active.value.current_strategy,
              operation_id: operation.operation_id,
            }
          : {
              ...active.value.recovery_position,
              operation_id: operation.operation_id,
            },
        updated_at: options.now instanceof Date ? options.now.toISOString() : new Date().toISOString(),
      };
      await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
      await finishCycleOperation(project, updated, operation.operation_id, options);
      return {
        valid: true,
        diagnostic_only: false,
        state_written: true,
        cycle: updated,
        evaluation: evaluation.stored,
        blockers: [],
        required_action: null,
      };
    } catch (error) {
      return failure("evaluation-identity-mismatch", error.message, active.value);
    }
  }
  if (["accept-active-cycle", "discard-interrupted-operation"].includes(request.direction)) {
    if (inspected.present) {
      return failure(
        inspected.running ? "cycle-lock-owner-active" : "cycle-lock-owner-not-running",
        "Resolve the existing lock through its owner-verified recovery before changing cycle state.",
        active?.value ?? null,
      );
    }
    const operation = project.manifest.cycle_operation;
    if (!active || active.value.cycle_id !== request.cycle_id) {
      return failure("cycle-id-mismatch", "The reconciliation direction must name the active cycle explicitly.", active?.value ?? null);
    }
    if (request.direction === "discard-interrupted-operation") {
      if (
        !operation || operation.operation_id !== request.operation_id ||
        operation.cycle_id !== request.cycle_id
      ) {
        return failure("cycle-operation-id-mismatch", "Discard requires the exact interrupted cycle and operation IDs.", active.value);
      }
      if (active.value.revision !== operation.expected_revision || completion.completed) {
        return failure(
          "cycle-operation-already-advanced",
          "The interrupted operation cannot be discarded after its cycle advanced or completed history was published.",
          active.value,
        );
      }
      const unsafe = await unsafeDiscardResult(project, active, operation, artifacts);
      if (unsafe) return unsafe;
      await discardCycleOperation(project, operation.operation_id, options);
    } else {
      if (artifacts.length > 0) {
        return {
          ...failure(artifacts[0].code, artifacts[0].message, active.value),
          blockers: artifacts,
        };
      }
      if (operation) {
        if (
          operation.operation_id !== request.operation_id ||
          operation.cycle_id !== request.cycle_id ||
          active.value.revision !== operation.intended_revision ||
          active.value.recovery_position?.operation_id !== operation.operation_id
        ) {
          return failure(
            "cycle-operation-revision-mismatch",
            "The active cycle has not advanced to the intended revision with the same operation ID; choose discard or another explicit recovery path.",
            active.value,
          );
        }
      } else if (
        completion.completed ||
        active.value.recovery_position?.operation_id !== request.operation_id
      ) {
        return failure(
          "cycle-operation-id-mismatch",
          "Accepting active state without an interrupted operation record requires the current recovery operation ID and no completed history awaiting removal.",
          active.value,
        );
      }
      const reconciliation = active.value.related_artifacts.reconciliations?.at(-1) ?? null;
      const operationKind = operation?.kind ??
        (reconciliation && project.manifest.manuscript_reconciliation?.path !== reconciliation.path
          ? "manuscript-reconciliation"
          : "cycle-transition");
      await finishCycleOperation(project, active.value, request.operation_id, {
        ...options,
        allowMissingOperation: true,
        ...(operationKind === "manuscript-reconciliation" && reconciliation
          ? {
              manifestChanges: { manuscript_reconciliation: reconciliation },
              removeManifestFields: active.value.target_scope ? [] : ["current_scope"],
            }
          : {}),
      });
    }
    return {
      valid: true,
      diagnostic_only: false,
      state_written: true,
      cycle: active.value,
      interrupted_operation: operation ?? null,
      blockers: [],
      required_action: null,
    };
  }
  if (request.direction === "finish-completion") {
    if (inspected.present) {
      return failure(
        inspected.running ? "cycle-lock-owner-active" : "cycle-lock-owner-not-running",
        "Resolve the existing lock through its owner-verified recovery before changing completion state.",
        active?.value ?? null,
      );
    }
    return finishCompletion(project, active, completion.completed, request);
  }
  if (request.direction !== "release-stale-lock") {
    throw new Error(`Unsupported reconcile-cycle direction: ${request.direction}`);
  }
  const released = await releaseAbandonedDirectoryLock(lockPath, request.lock_owner);
  if (!released.released) {
    const current = released.inspected;
    return {
      valid: false,
      diagnostic_only: false,
      state_written: false,
      cycle: active?.value ?? null,
      lock: current,
      blockers: [{
        code: released.code,
        message: "The lock was not released; owner identity, process liveness, and directory contents must match the diagnosed abandoned lock.",
        lock: current.present ? lockBlocker(current)?.lock : null,
        required_action: recoveryAction(),
      }],
      required_action: recoveryAction(),
    };
  }
  const remaining = blockers.filter((blocker) => !blocker.code.startsWith("cycle-lock-"));
  return {
    valid: remaining.length === 0,
    diagnostic_only: false,
    state_written: true,
    cycle: active?.value ?? null,
    completed_cycle: completion.completed?.value ?? null,
    lock: null,
    blockers: remaining,
    required_action: remaining.length > 0 ? recoveryAction() : null,
  };
  } finally {
    if (recoveryLock) {
      const releasedLock = await releaseDirectoryLock(recoveryLock);
      if (!releasedLock.released) {
        throw new Error(`Cannot release cycle reconciliation lock ${lockPath}: ${releasedLock.error.message}`);
      }
    }
  }
}
