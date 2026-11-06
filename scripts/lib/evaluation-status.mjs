import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  completedPointerBlocker,
  coordinationBlockers,
} from "./cycle-coordination.mjs";
import { collectManuscriptInventory } from "./manuscript.mjs";
import { getRequestCompletion } from "./revision-execution.mjs";
import { validateInventorySnapshot, validateScopeSnapshot } from "./scope.mjs";
import { sha256Bytes } from "./state-io.mjs";
import {
  evaluationSources,
  readActiveCycle,
  readEvaluationReference,
  readProject,
} from "./evaluation-artifacts.mjs";
import { DEFAULT_ACTION, sameScopeReference } from "./evaluation-contracts.mjs";
import { recomputeStoredEvaluation } from "./evaluation-recompute.mjs";

function missingEvaluationStatus(cycle, pendingAction = null, requestCompletion = null) {
  const requiredAction = cycle?.recovery_position ? {
    strategy: cycle.recovery_position.required_strategy,
    operation: cycle.recovery_position.operation,
    command: cycle.recovery_position.required_strategy,
  } : DEFAULT_ACTION;
  return {
    query_valid: true,
    outcome: "indeterminate",
    current: false,
    evaluation: null,
    cycle: cycle ?? null,
    pending_action: pendingAction,
    request_completion: requestCompletion,
    required_action: requiredAction,
    blockers: [{
      code: "current-evaluation-unavailable",
      message: "No current satisfied full-manuscript evaluation is available.",
      required_action: requiredAction,
    }],
  };
}

export async function getConvergenceStatus(projectRoot) {
  let project;
  let active;
  try {
    project = await readProject(projectRoot);
    active = await readActiveCycle(project);
  } catch (error) {
    return {
      query_valid: false,
      outcome: "indeterminate",
      current: false,
      evaluation: null,
      cycle: null,
      pending_action: null,
      request_completion: null,
      required_action: null,
      blockers: [{ code: "cycle-state-invalid", message: error.message, required_action: null }],
    };
  }
  const coordination = coordinationBlockers(project, active);
  if (coordination.length > 0) {
    return {
      query_valid: true,
      outcome: "indeterminate",
      current: false,
      evaluation: null,
      cycle: active?.value ?? null,
      pending_action: project.manifest.pending_action ?? null,
      request_completion: null,
      required_action: coordination[0].required_action,
      blockers: coordination,
    };
  }
  const completedPointer = await completedPointerBlocker(project);
  if (completedPointer) {
    return {
      query_valid: true,
      outcome: "indeterminate",
      current: false,
      evaluation: null,
      cycle: active?.value ?? null,
      pending_action: project.manifest.pending_action ?? null,
      request_completion: null,
      required_action: completedPointer.required_action,
      blockers: [completedPointer],
    };
  }
  if (active) {
    const completedPath = path.resolve(
      project.root,
      project.manifest.paths.convergence,
      "cycles",
      `${active.value.cycle_id}.json`,
    );
    let completed = null;
    try {
      completed = JSON.parse(await readFile(completedPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (completed?.status === "completed") {
      const action = {
        strategy: "author-project",
        operation: "reconcile-cycle",
        command: "author-project reconcile-cycle",
      };
      return {
        query_valid: true,
        outcome: "indeterminate",
        current: false,
        evaluation: null,
        cycle: active.value,
        pending_action: project.manifest.pending_action ?? null,
        request_completion: null,
        required_action: action,
        blockers: [{
          code: "cycle-completion-reconcile-required",
          message: `Completed cycle ${completed.cycle_id} and its active record coexist; run reconcile-cycle before dependent work.`,
          required_action: action,
        }],
      };
    }
  }
  let cycle = active?.value ?? null;
  let reference = cycle?.target_evaluation ?? null;
  if (!reference && !cycle) {
    const source = (await evaluationSources(project)).at(-1) ?? null;
    cycle = source?.cycle ?? null;
    reference = source?.evaluationReference ?? null;
  }
  const requestCompletion = await getRequestCompletion(project.root, cycle);
  const observedInventory = await collectManuscriptInventory(
    project.root,
    project.manifest.manuscript_root,
    project.manifest.paths,
  );
  if (
    observedInventory.files.length === 0 &&
    (reference || (active?.value.related_artifacts.reconciliations ?? []).length > 0)
  ) {
    const requiredAction = active?.value.recovery_position ? {
      strategy: active.value.recovery_position.required_strategy,
      operation: active.value.recovery_position.operation,
      command: active.value.recovery_position.required_strategy,
    } : {
      strategy: "write-fiction",
      operation: "creation-import",
      command: "write-fiction",
    };
    return {
      query_valid: true,
      outcome: "not_satisfied",
      current: false,
      evaluation: null,
      evaluation_reference: reference,
      cycle: active?.value ?? null,
      pending_action: project.manifest.pending_action ?? null,
      request_completion: requestCompletion,
      required_action: requiredAction,
      blockers: [{
        code: "empty-manuscript",
        message: "An empty manuscript cannot satisfy current-draft revision convergence; restore or import nonempty manuscript before full-manuscript revise-draft recovery.",
        required_action: requiredAction,
      }],
    };
  }
  if (!reference) {
    const missing = missingEvaluationStatus(
      active?.value ?? null,
      project.manifest.pending_action ?? null,
      requestCompletion,
    );
    if (active?.value.starting_scope) {
      const historicalReferences = [{
        path: active.value.starting_scope.snapshot_path,
        sha256: active.value.starting_scope.snapshot_sha256,
      }];
      if (active.value.starting_evaluation) historicalReferences.push(active.value.starting_evaluation);
      try {
        for (const historical of historicalReferences) {
          const contents = await readFile(path.resolve(project.root, historical.path));
          if (sha256Bytes(contents) !== historical.sha256) {
            throw new Error(`Historical artifact hash changed: ${historical.path}`);
          }
        }
      } catch (error) {
        return {
          ...missing,
          required_action: DEFAULT_ACTION,
          blockers: [{
            code: "starting-scope-unproven",
            message: `The preserved starting scope or evaluation cannot be proven: ${error.message}`,
            required_action: DEFAULT_ACTION,
          }, ...missing.blockers],
        };
      }
    }
    const reconciliations = active?.value.related_artifacts.reconciliations ?? [];
    if (reconciliations.length === 0) return missing;
    const reconciliationReference = reconciliations.at(-1);
    try {
      const contents = await readFile(path.resolve(project.root, reconciliationReference.path), "utf8");
      if (sha256Bytes(contents) !== reconciliationReference.sha256) {
        throw new Error("Reconciliation content hash changed");
      }
      const reconciliation = JSON.parse(contents);
      return {
        ...missing,
        blockers: [
          ...(reconciliation.proof_blockers ?? []).map((blocker) => ({
            ...blocker,
            required_action: missing.required_action,
          })),
          ...missing.blockers,
        ],
      };
    } catch (error) {
      return {
        ...missing,
        blockers: [{
          code: "reconciliation-artifact-unavailable",
          message: `The latest reconciliation cannot be trusted: ${error.message}`,
          required_action: missing.required_action,
        }, ...missing.blockers],
      };
    }
  }

  try {
    const result = await recomputeStoredEvaluation(project, cycle, reference);
    const requiredAction = active?.value?.recovery_position ? {
      strategy: active.value.recovery_position.required_strategy,
      operation: active.value.recovery_position.operation,
      command: active.value.recovery_position.required_strategy,
    } : result.recomputed.outcome === "satisfied" && result.current
      ? null
      : result.recomputed.blockers[0]?.required_action ?? DEFAULT_ACTION;
    return {
      query_valid: true,
      outcome: result.recomputed.outcome,
      current: result.current,
      evaluation: result.stored,
      evaluation_reference: reference,
      current_evaluation: result.recomputed,
      cycle: active?.value ?? null,
      pending_action: project.manifest.pending_action ?? null,
      request_completion: requestCompletion,
      required_action: requiredAction,
      blockers: result.recomputed.blockers,
    };
  } catch (error) {
    return {
      query_valid: true,
      outcome: "indeterminate",
      current: false,
      evaluation: null,
      evaluation_reference: reference,
      cycle: active?.value ?? null,
      pending_action: project.manifest.pending_action ?? null,
      request_completion: requestCompletion,
      required_action: DEFAULT_ACTION,
      blockers: [{
        code: "current-evaluation-unavailable",
        message: `The stored evaluation cannot be trusted: ${error.message}`,
        required_action: DEFAULT_ACTION,
      }],
    };
  }
}

export async function findSatisfiedStartingEvaluation(project, scopeReference) {
  const source = (await evaluationSources(project)).at(-1);
  if (!source) return null;
  try {
    const result = await recomputeStoredEvaluation(
      project,
      source.cycle,
      source.evaluationReference,
    );
    if (
      sameScopeReference(result.stored.target_scope, scopeReference) &&
      result.stored.outcome === "satisfied" &&
      result.current &&
      result.recomputed.outcome === "satisfied"
    ) {
      return {
        cycle: source.cycle,
        evaluation: result.stored,
        evaluation_reference: source.evaluationReference,
        current_evaluation: result.recomputed,
      };
    }
  } catch {
    return null;
  }
  return null;
}


export async function findHistoricalSatisfiedEvaluation(project, scopeReference, preferredReference = null) {
  for (const source of (await evaluationSources(project)).reverse()) {
    if (
      preferredReference &&
      (source.evaluationReference.evaluation_id !== preferredReference.evaluation_id ||
        source.evaluationReference.path !== preferredReference.path ||
        source.evaluationReference.sha256 !== preferredReference.sha256)
    ) continue;
    try {
      const { value: evaluation } = await readEvaluationReference(project, source.evaluationReference);
      if (evaluation.outcome !== "satisfied" || !sameScopeReference(evaluation.target_scope, scopeReference)) {
        continue;
      }
      for (const artifact of evaluation.evidence_graph.artifacts) {
        if (["manuscript", "tracker", "story-state"].includes(artifact.role)) continue;
        const contents = await readFile(path.resolve(project.root, artifact.path));
        if (sha256Bytes(contents) !== artifact.sha256) throw new Error("Historical evidence changed");
      }
      const scopeText = await readFile(path.resolve(project.root, scopeReference.snapshot_path), "utf8");
      if (sha256Bytes(scopeText) !== scopeReference.snapshot_sha256) continue;
      const scope = JSON.parse(scopeText);
      if (!validateScopeSnapshot(scope).valid) continue;
      const inventoryText = await readFile(path.resolve(project.root, scope.inventory.path), "utf8");
      if (sha256Bytes(inventoryText) !== scope.inventory.sha256) continue;
      const inventory = JSON.parse(inventoryText);
      if (!validateInventorySnapshot(inventory).valid) continue;
      const scopeFiles = scope.files.map((file) => `${file.path}\0${file.sha256}`).sort();
      const inventoryFiles = inventory.files.map((file) => `${file.path}\0${file.sha256}`).sort();
      if (JSON.stringify(scopeFiles) !== JSON.stringify(inventoryFiles)) continue;
      return {
        cycle: source.cycle,
        evaluation,
        evaluation_reference: source.evaluationReference,
      };
    } catch {
      continue;
    }
  }
  return null;
}
