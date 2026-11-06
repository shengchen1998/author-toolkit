import { readFile } from "node:fs/promises";
import path from "node:path";

import { sha256Bytes } from "./state-io.mjs";
import { parseTrackerState } from "./tracker.mjs";
import { readEvaluationReference } from "./evaluation-artifacts.mjs";
import { computeEvaluation } from "./evaluation-evaluator.mjs";
import {
  DEFAULT_ACTION,
  samePassReference,
  sameReference,
  sameScopeReference,
} from "./evaluation-contracts.mjs";

function sameEvidenceGraph(left, right) {
  return JSON.stringify(left?.artifacts ?? []) === JSON.stringify(right?.artifacts ?? []);
}

function targetEvaluationIdentityBlockers(cycle, stored, reference) {
  if (
    cycle?.status !== "active" ||
    !cycle.target_evaluation ||
    !sameReference(reference, cycle.target_evaluation)
  ) return [];
  const action = cycle.recovery_position ? {
    strategy: cycle.recovery_position.required_strategy,
    operation: cycle.recovery_position.operation,
    command: cycle.recovery_position.required_strategy,
  } : DEFAULT_ACTION;
  const blockers = [];
  if (!samePassReference(stored.requested_pass, cycle.requested_pass)) {
    blockers.push({
      code: "requested-pass-evaluation-mismatch",
      message: "The stored target evaluation names a different requested pass than the active cycle; evaluate the current pass before dependent work.",
      required_action: action,
    });
  }
  if (!sameScopeReference(stored.target_scope, cycle.target_scope)) {
    blockers.push({
      code: "target-scope-evaluation-mismatch",
      message: "The stored target evaluation names a different target scope than the active cycle; evaluate the current target before dependent work.",
      required_action: action,
    });
  }
  return blockers;
}

export async function recomputeStoredEvaluation(project, cycle, reference) {
  const { value: stored } = await readEvaluationReference(project, reference);
  const identityBlockers = targetEvaluationIdentityBlockers(cycle, stored, reference);
  if (identityBlockers.length > 0) {
    return {
      stored,
      recomputed: {
        ...stored,
        outcome: "indeterminate",
        blockers: [...stored.blockers, ...identityBlockers],
      },
      current: false,
      identity_current: false,
    };
  }
  const independentNoEditSkips = stored.cycle_id === null
    ? stored.evidence_graph.artifacts
      .filter((artifact) => artifact.role === "no-edit-skip")
      .map((artifact) => ({
        skip_id: artifact.artifact_id,
        path: artifact.path,
        sha256: artifact.sha256,
      }))
    : null;
  const independentRevisionExecutions = stored.cycle_id === null
    ? stored.evidence_graph.artifacts
      .filter((artifact) => artifact.role === "revision-execution")
      .map((artifact) => ({
        execution_id: artifact.artifact_id,
        path: artifact.path,
        sha256: artifact.sha256,
      }))
    : null;
  const recomputed = await computeEvaluation(
    project,
    cycle,
    {
      cycle_id: stored.cycle_id,
      requested_pass: stored.requested_pass,
      target_scope: stored.target_scope,
      coverage_index: stored.coverage_index,
      reports: stored.reports,
      review_group: stored.review_group,
      semantic_attestations: stored.semantic_attestations,
      ...(independentNoEditSkips ? { no_edit_skips: independentNoEditSkips } : {}),
      ...(independentRevisionExecutions ? { revision_executions: independentRevisionExecutions } : {}),
    },
    stored.evaluation_id,
    stored.created_at,
  );
  return {
    stored,
    recomputed,
    current: stored.outcome === recomputed.outcome &&
      sameEvidenceGraph(stored.evidence_graph, recomputed.evidence_graph),
  };
}

export async function recomputeCompletedCycleForRecovery(project, completed) {
  if (completed?.status !== "completed" || !completed.target_evaluation) {
    throw new Error("A completed cycle and target evaluation are required for recovery");
  }
  const result = await recomputeStoredEvaluation(
    project,
    completed,
    completed.target_evaluation,
  );
  const trackerText = await readFile(
    path.resolve(project.root, project.manifest.paths.audit_tracker),
    "utf8",
  );
  const tracker = await parseTrackerState(trackerText, project.root);
  const decision = tracker.completion_decisions.find(
    (candidate) => candidate.id === completed.completion?.decision_id,
  );
  if (
    !tracker.valid || !decision || decision.status !== "approved" ||
    decision.cycleId !== completed.cycle_id ||
    decision.scopeFingerprint !== completed.target_scope?.scope_fingerprint
  ) {
    throw new Error(`Completion decision ${completed.completion?.decision_id} is not current for the completed cycle`);
  }
  return result;
}

export async function recomputeCycleEvaluationForRecovery(project, cycle, reference) {
  const result = await recomputeStoredEvaluation(project, cycle, reference);
  if (
    result.stored.cycle_id !== cycle.cycle_id ||
    !sameScopeReference(result.stored.target_scope, cycle.target_scope) ||
    !samePassReference(result.stored.requested_pass, cycle.requested_pass)
  ) {
    throw new Error("Published evaluation cycle, pass, or target scope does not match the interrupted cycle");
  }
  if (!result.current) {
    throw new Error("Published evaluation is not current against its immutable evidence graph");
  }
  return result;
}
