import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  beginCycleOperation,
  completedPointerBlocker,
  coordinationBlockers,
  finishCycleOperation,
  runCheckpoint,
} from "./cycle-coordination.mjs";
import {
  validateConvergenceCycleSchema,
  validateRelativePath,
} from "./schemas.mjs";
import {
  acquireDirectoryLock,
  releaseDirectoryLock,
  removeVerified,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";
import { appendCycleCompletionDecision, parseTrackerState } from "./tracker.mjs";
import {
  evaluationReference,
  formatErrors,
  operationTime,
  publishImmutable,
  readActiveCycle,
  readProject,
} from "./evaluation-artifacts.mjs";
import { DEFAULT_ACTION } from "./evaluation-contracts.mjs";
import { computeEvaluation } from "./evaluation-evaluator.mjs";
import {
  recomputeCycleEvaluationForRecovery,
  recomputeStoredEvaluation,
} from "./evaluation-recompute.mjs";

function publicFailure(code, message, cycle = null, details = {}) {
  return {
    valid: false,
    cycle,
    evaluation: null,
    state_written: false,
    blockers: [{ code, message, required_action: cycle?.recovery_position ? {
      strategy: cycle.recovery_position.required_strategy,
      operation: cycle.recovery_position.operation,
      command: cycle.recovery_position.required_strategy,
    } : DEFAULT_ACTION }],
    ...details,
  };
}

function coordinationFailure(project, active, options = {}) {
  const blockers = coordinationBlockers(project, active, options);
  if (blockers.length === 0) return null;
  return {
    valid: false,
    cycle: active?.value ?? null,
    evaluation: null,
    state_written: false,
    blockers,
    required_action: blockers[0].required_action,
  };
}

function validateEvaluationRequest(request, { independent = false } = {}) {
  const operation = independent ? "evaluate-draft" : "evaluate-cycle";
  const revisionExecutions = independent ? request.revision_executions ?? [] : [];
  const allowed = new Set([
    "evaluation_id",
    "coverage_index",
    "reports",
    "review_group",
    "semantic_attestations",
    ...(independent
      ? ["requested_pass", "target_scope", "no_edit_skips", "revision_executions"]
      : ["cycle_id", "expected_revision"]),
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${operation} input field: ${key}`);
  }
  const identityValid = independent
    ? request.requested_pass && request.target_scope &&
      Array.isArray(request.no_edit_skips) && Array.isArray(revisionExecutions)
    : /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.cycle_id ?? "") &&
      Number.isInteger(request.expected_revision);
  if (
    !identityValid ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.evaluation_id ?? "") ||
    !request.coverage_index ||
    !Array.isArray(request.reports) ||
    !request.review_group ||
    !Array.isArray(request.semantic_attestations)
  ) {
    throw new Error(`${operation} requires ${independent ? "pass, target, no-edit," : "cycle, revision,"} evaluation, and evidence root identities`);
  }
  const references = [
    [request.coverage_index, ["path", "sha256"]],
    ...request.reports.map((reference) => [reference, ["report_id", "path", "sha256"]]),
    [request.review_group, ["review_group_id", "path", "sha256"]],
    ...request.semantic_attestations.map((reference) => [
      reference,
      ["attestation_id", "path", "sha256"],
    ]),
    ...(independent
      ? [
          [request.requested_pass, ["pass_id", "pass_fingerprint", "path", "sha256"]],
          [request.target_scope, ["scope_id", "scope_fingerprint", "snapshot_path", "snapshot_sha256"]],
          ...request.no_edit_skips.map((reference) => [reference, ["skip_id", "path", "sha256"]]),
          ...revisionExecutions.map((reference) => [reference, ["execution_id", "path", "sha256"]]),
        ]
      : []),
  ];
  for (const [reference, fields] of references) {
    if (
      !reference ||
      Object.keys(reference).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(reference, field)) ||
      !validateRelativePath(reference.path ?? reference.snapshot_path).valid ||
      !fields.filter((field) => field.endsWith("_id")).every((field) =>
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reference[field])
      ) ||
      !fields.filter((field) => field === "sha256" || field.endsWith("_sha256") || field.endsWith("_fingerprint")).every((field) =>
        /^[0-9a-f]{64}$/.test(reference[field])
      )
    ) {
      throw new Error(`${operation} evidence roots require closed identities, safe paths, and SHA-256 hashes`);
    }
  }
}

async function lockProjectCycle(project, options, operation) {
  const lock = await acquireDirectoryLock(
    path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
    },
  );
  if (!lock.acquired) {
    return {
      lockFailure: publicFailure(
        lock.code === "timeout" ? "cycle-transition-lock-timeout" : "cycle-transition-lock-error",
        `Cannot coordinate convergence state at ${lock.directory}: ${lock.error.message}`,
        null,
        { lock_path: lock.directory },
      ),
    };
  }
  let value;
  let operationError;
  try {
    const pointer = await completedPointerBlocker(project);
    value = pointer
      ? {
          ...publicFailure(pointer.code, pointer.message, null),
          blockers: [pointer],
          required_action: pointer.required_action,
        }
      : await operation();
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      lockFailure: publicFailure(
        "cycle-transition-lock-release-error",
        `Cannot release convergence lock ${lock.directory}: ${released.error.message}.${operationError ? ` Operation also failed: ${operationError.message}` : ""}`,
        value?.cycle ?? null,
        { state_written: value?.state_written ?? null, lock_path: lock.directory },
      ),
    };
  }
  if (operationError) throw operationError;
  return { value };
}

export async function evaluateCycle(projectRoot, request, options = {}) {
  validateEvaluationRequest(request);
  const project = await readProject(projectRoot);
  const initial = await readActiveCycle(project);
  if (!initial) return publicFailure("active-cycle-required", "An active cycle is required for evaluation.");
  const locked = await lockProjectCycle(project, options, async () => {
    const active = await readActiveCycle(project);
    if (!active) return publicFailure("active-cycle-required", "An active cycle is required for evaluation.");
    const cycle = active.value;
    if (cycle.cycle_id !== request.cycle_id) {
      return publicFailure("cycle-id-mismatch", `The requested cycle does not match active cycle ${cycle.cycle_id}.`, cycle);
    }
    if (cycle.revision !== request.expected_revision) {
      return publicFailure(
        "cycle-revision-conflict",
        `Expected cycle revision ${request.expected_revision}, but the active revision is ${cycle.revision}.`,
        cycle,
      );
    }
    if (!cycle.target_scope || !cycle.requested_pass) {
      return publicFailure("evaluation-input-unavailable", "The active cycle requires target scope and requested-pass references before evaluation.", cycle);
    }
    const coordination = coordinationFailure(project, active, {
      allowOperationId: options.recoveryOperationId ?? null,
    });
    if (coordination) return coordination;
    await beginCycleOperation(project, active, {
      kind: "evaluation",
      operationId: request.evaluation_id,
      artifactId: request.evaluation_id,
    }, options);
    const roots = {
      cycle_id: cycle.cycle_id,
      requested_pass: cycle.requested_pass,
      target_scope: cycle.target_scope,
      coverage_index: request.coverage_index,
      reports: request.reports,
      review_group: request.review_group,
      semantic_attestations: request.semantic_attestations,
    };
    const evaluation = await computeEvaluation(
      project,
      cycle,
      roots,
      request.evaluation_id,
      operationTime(options),
    );
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "evaluations",
      `${evaluation.evaluation_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    const text = `${JSON.stringify(evaluation, null, 2)}\n`;
    await publishImmutable(absolute, text);
    await runCheckpoint(options, "evaluation-published");
    const reference = evaluationReference(evaluation, relative, text);
    const updated = {
      ...cycle,
      revision: cycle.revision + 1,
      target_evaluation: reference,
      recovery_position: evaluation.outcome === "satisfied"
        ? {
            operation: null,
            reason: "The current satisfied target evaluation awaits an explicit author completion decision.",
            required_strategy: cycle.current_strategy,
            operation_id: request.evaluation_id,
          }
        : {
            ...cycle.recovery_position,
            operation_id: request.evaluation_id,
          },
      updated_at: operationTime(options),
    };
    await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
    await runCheckpoint(options, "cycle-written");
    await finishCycleOperation(project, updated, request.evaluation_id, options);
    return {
      valid: evaluation.outcome === "satisfied",
      cycle: updated,
      evaluation,
      evaluation_path: absolute,
      evaluation_reference: reference,
      state_written: true,
      blockers: evaluation.blockers,
    };
  });
  return locked.lockFailure ?? locked.value;
}

export async function evaluateDraft(projectRoot, request, options = {}) {
  validateEvaluationRequest(request, { independent: true });
  const project = await readProject(projectRoot);
  const initial = await readActiveCycle(project);
  if (initial) {
    return publicFailure(
      "active-cycle-exists",
      `Cycle ${initial.value.cycle_id} is active; link revise-draft recovery through evaluate-cycle instead of an independent evaluation.`,
      initial.value,
    );
  }
  const locked = await lockProjectCycle(project, options, async () => {
    const active = await readActiveCycle(project);
    if (active) {
      return publicFailure(
        "active-cycle-exists",
        `Cycle ${active.value.cycle_id} is active; link revise-draft recovery through evaluate-cycle instead of an independent evaluation.`,
        active.value,
      );
    }
    const roots = {
      cycle_id: null,
      requested_pass: request.requested_pass,
      target_scope: request.target_scope,
      coverage_index: request.coverage_index,
      reports: request.reports,
      review_group: request.review_group,
      no_edit_skips: request.no_edit_skips,
      revision_executions: request.revision_executions ?? [],
      semantic_attestations: request.semantic_attestations,
    };
    const evaluation = await computeEvaluation(
      project,
      null,
      roots,
      request.evaluation_id,
      operationTime(options),
    );
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "evaluations",
      `${evaluation.evaluation_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    const text = `${JSON.stringify(evaluation, null, 2)}\n`;
    await publishImmutable(absolute, text);
    await runCheckpoint(options, "evaluation-published");
    return {
      valid: evaluation.outcome === "satisfied",
      cycle: null,
      evaluation,
      evaluation_path: absolute,
      evaluation_reference: evaluationReference(evaluation, relative, text),
      state_written: true,
      blockers: evaluation.blockers,
    };
  });
  return locked.lockFailure ?? locked.value;
}

function validateCompletionRequest(request) {
  const allowed = new Set([
    "cycle_id",
    "expected_revision",
    "evaluation_id",
    "decision_id",
    "author_confirmed",
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown complete-cycle input field: ${key}`);
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.cycle_id ?? "") ||
    !Number.isInteger(request.expected_revision) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.evaluation_id ?? "") ||
    !/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(request.decision_id ?? "") ||
    request.author_confirmed !== true
  ) {
    throw new Error("complete-cycle requires exact cycle, revision, new evaluation, decision ID, and explicit author confirmation");
  }
}

export async function completeCycle(projectRoot, request, options = {}) {
  validateCompletionRequest(request);
  const project = await readProject(projectRoot);
  const initial = await readActiveCycle(project);
  if (!initial) return publicFailure("active-cycle-required", "An active cycle is required for completion.");
  const locked = await lockProjectCycle(project, options, async () => {
    const active = await readActiveCycle(project);
    if (!active) return publicFailure("active-cycle-required", "An active cycle is required for completion.");
    const cycle = active.value;
    if (cycle.cycle_id !== request.cycle_id) {
      return publicFailure("cycle-id-mismatch", `The requested cycle does not match active cycle ${cycle.cycle_id}.`, cycle);
    }
    if (cycle.revision !== request.expected_revision) {
      return publicFailure(
        "cycle-revision-conflict",
        `Expected cycle revision ${request.expected_revision}, but the active revision is ${cycle.revision}.`,
        cycle,
      );
    }
    if (!cycle.target_evaluation || !cycle.target_scope) {
      return publicFailure("completion-evaluation-not-satisfied", "A current satisfied target evaluation is required before completion.", cycle);
    }
    const coordination = coordinationFailure(project, active, {
      allowOperationId: options.recoveryOperationId ?? null,
    });
    if (coordination) return coordination;
    let current;
    try {
      current = await recomputeStoredEvaluation(project, cycle, cycle.target_evaluation);
    } catch (error) {
      return publicFailure("completion-evaluation-not-satisfied", `Target evaluation cannot be trusted: ${error.message}`, cycle);
    }
    if (current.identity_current === false) {
      return {
        ...publicFailure(
          "completion-evaluation-not-satisfied",
          "The target evaluation does not match the active cycle pass and target scope; finish the new work before completion.",
          cycle,
        ),
        evaluation: current.recomputed,
      };
    }
    const trackerPath = path.resolve(project.root, project.manifest.paths.audit_tracker);
    const trackerBefore = await readFile(trackerPath, "utf8");
    const trackerState = await parseTrackerState(trackerBefore, project.root);
    const existingDecision = trackerState.completion_decisions.find(
      (decision) => decision.id === request.decision_id,
    );
    if (existingDecision && (
      existingDecision.cycleId !== cycle.cycle_id ||
      existingDecision.scopeFingerprint !== cycle.target_scope.scope_fingerprint ||
      existingDecision.status !== "approved"
    )) {
      return publicFailure("completion-decision-mismatch", `Completion decision ${request.decision_id} names different state.`, cycle);
    }
    if (!existingDecision && (!current.current || current.recomputed.outcome !== "satisfied")) {
      return {
        ...publicFailure(
          "completion-evaluation-not-satisfied",
          "Author confirmation cannot override a stale, not_satisfied, or indeterminate target evaluation.",
          cycle,
        ),
        evaluation: current.recomputed,
      };
    }

    await beginCycleOperation(project, active, {
      kind: "completion",
      operationId: request.decision_id,
      artifactId: request.evaluation_id,
    }, options);
    const completedAt = operationTime(options);
    if (!existingDecision) {
      const trackerAfter = appendCycleCompletionDecision(trackerBefore, {
        decision_id: request.decision_id,
        cycle_id: cycle.cycle_id,
        scope_fingerprint: cycle.target_scope.scope_fingerprint,
        reason: `Author confirmed completion after satisfied evaluation ${cycle.target_evaluation.evaluation_id}.`,
        updated_at: completedAt,
      });
      await writeAtomicVerified(trackerPath, trackerAfter);
    }
    await runCheckpoint(options, "completion-decision-written");
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "evaluations",
      `${request.evaluation_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    let text;
    try {
      text = await readFile(absolute, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      text = null;
    }
    let evaluation;
    let reference;
    if (text !== null) {
      reference = {
        evaluation_id: request.evaluation_id,
        path: relative,
        sha256: sha256Bytes(text),
      };
      const recovered = await recomputeCycleEvaluationForRecovery(project, cycle, reference);
      evaluation = recovered.stored;
      reference = evaluationReference(evaluation, relative, text);
    } else {
      const previous = current.stored;
      evaluation = await computeEvaluation(
        project,
        cycle,
        {
          cycle_id: cycle.cycle_id,
          requested_pass: previous.requested_pass,
          target_scope: previous.target_scope,
          coverage_index: previous.coverage_index,
          reports: previous.reports,
          review_group: previous.review_group,
          semantic_attestations: previous.semantic_attestations,
        },
        request.evaluation_id,
        completedAt,
      );
      text = `${JSON.stringify(evaluation, null, 2)}\n`;
      await publishImmutable(absolute, text);
      reference = evaluationReference(evaluation, relative, text);
    }
    await runCheckpoint(options, "evaluation-published");
    if (evaluation.outcome !== "satisfied") {
      const updated = {
        ...cycle,
        revision: cycle.revision + 1,
        target_evaluation: reference,
        recovery_position: {
          ...cycle.recovery_position,
          operation_id: request.decision_id,
        },
        updated_at: completedAt,
      };
      await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
      await runCheckpoint(options, "cycle-written");
      await finishCycleOperation(project, updated, request.decision_id, options);
      return {
        valid: false,
        cycle: updated,
        evaluation,
        evaluation_path: absolute,
        evaluation_reference: reference,
        state_written: true,
        blockers: evaluation.blockers,
      };
    }

    const completed = {
      ...cycle,
      revision: cycle.revision + 1,
      status: "completed",
      target_evaluation: reference,
      recovery_position: null,
      completion: {
        decision_id: request.decision_id,
        target_evaluation_id: evaluation.evaluation_id,
        completed_at: completedAt,
      },
      updated_at: completedAt,
    };
    const completedValidation = validateConvergenceCycleSchema(completed);
    if (
      !completedValidation.valid ||
      completed.completion.target_evaluation_id !== completed.target_evaluation.evaluation_id
    ) {
      throw new Error(`Generated completed cycle is invalid: ${formatErrors(completedValidation.errors)}`);
    }
    const completedRelative = path.posix.join(
      project.manifest.paths.convergence,
      "cycles",
      `${cycle.cycle_id}.json`,
    );
    const completedText = `${JSON.stringify(completed, null, 2)}\n`;
    await publishImmutable(
      path.resolve(project.root, completedRelative),
      completedText,
    );
    await runCheckpoint(options, "completed-cycle-published");
    await finishCycleOperation(project, completed, request.decision_id, {
      ...options,
      complete: true,
      completedAt,
      manifestChanges: {
        last_completed_cycle: {
          cycle_id: completed.cycle_id,
          revision: completed.revision,
          path: completedRelative,
          sha256: sha256Bytes(completedText),
        },
      },
    });
    await removeVerified(active.file, sha256Bytes(active.text));
    await runCheckpoint(options, "active-cycle-removed");
    return {
      valid: true,
      cycle: completed,
      cycle_path: path.resolve(project.root, completedRelative),
      evaluation,
      evaluation_path: absolute,
      evaluation_reference: reference,
      state_written: true,
      blockers: [],
    };
  });
  return locked.lockFailure ?? locked.value;
}
