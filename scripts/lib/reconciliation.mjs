import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateStoryStateMarkdown } from "./artifacts.mjs";
import { findHistoricalSatisfiedEvaluation } from "./convergence.mjs";
import { validateManifest } from "./manifest.mjs";
import {
  validateManuscriptReconciliationSchema,
  validateConvergenceCycleSchema,
  validateRelativePath,
} from "./schemas.mjs";
import {
  collectVersionedInventory,
  diffManuscriptInventories,
  recordInventorySnapshot,
  validateFullManuscriptScope,
  validateScopeSnapshot,
} from "./scope.mjs";
import {
  acquireDirectoryLock,
  createNoClobberVerified,
  releaseDirectoryLock,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";
import { parseTrackerState } from "./tracker.mjs";

const RECOVERY_OPERATIONS = [
  "intake",
  "draft-baseline",
  "diagnostics",
  "characters",
  "prose",
  "ai-cleanup",
  "current-scope-review",
];

function action(strategy, operation) {
  return { strategy, operation, command: strategy };
}

function failure(code, message, cycle = null, details = {}) {
  const requiredAction = cycle?.recovery_position
    ? action(cycle.recovery_position.required_strategy, cycle.recovery_position.operation)
    : action("write-fiction", "creation-import");
  return {
    valid: false,
    cycle,
    reconciliation: null,
    state_written: false,
    required_action: requiredAction,
    blockers: [{ code, message, required_action: requiredAction }],
    ...details,
  };
}

async function readProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const validation = validateManifest(manifest);
  if (!validation.valid || manifest.schema_version !== "3.2.0") {
    throw new Error("External manuscript reconciliation requires a valid v3.2 project");
  }
  return { root, manifestPath, manifest };
}

async function readActiveCycle(project) {
  const file = path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.json");
  const value = JSON.parse(await readFile(file, "utf8"));
  const validation = validateConvergenceCycleSchema(value);
  if (!validation.valid || value.status !== "active") {
    throw new Error(`Living cycle is invalid: ${file}`);
  }
  return { value, file };
}

function assertReference(reference, fields) {
  const pathField = fields.includes("snapshot_path") ? "snapshot_path" : "path";
  if (
    !reference ||
    typeof reference !== "object" ||
    Object.keys(reference).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(reference, field)) ||
    !validateRelativePath(reference[pathField]).valid ||
    !fields.filter((field) => field === "sha256" || field.endsWith("_sha256") || field.endsWith("_fingerprint")).every((field) =>
      /^[0-9a-f]{64}$/.test(reference[field])
    )
  ) {
    throw new Error("reconcile-manuscript requires safe project-relative artifact paths and SHA-256 hashes");
  }
}

async function readArtifact(project, reference) {
  if (!validateRelativePath(reference.path).valid || !/^[0-9a-f]{64}$/.test(reference.sha256)) {
    throw new Error("reconcile-manuscript requires safe project-relative artifact paths and SHA-256 hashes");
  }
  const contents = await readFile(path.resolve(project.root, reference.path));
  if (sha256Bytes(contents) !== reference.sha256) {
    throw new Error(`Referenced artifact hash does not match: ${reference.path}`);
  }
  return contents;
}

async function readScope(project, reference) {
  const contents = await readArtifact(project, {
    path: reference.snapshot_path,
    sha256: reference.snapshot_sha256,
  });
  const snapshot = JSON.parse(contents.toString("utf8"));
  const validation = validateScopeSnapshot(snapshot);
  if (!validation.valid) throw new Error(`Scope snapshot is invalid: ${reference.snapshot_path}`);
  if (
    snapshot.scope_id !== reference.scope_id ||
    snapshot.scope_fingerprint !== reference.scope_fingerprint
  ) {
    throw new Error("Scope snapshot identity differs from its reference");
  }
  return snapshot;
}

function validateRequest(request) {
  const allowed = new Set([
    "reconciliation_id",
    "cycle_id",
    "expected_revision",
    "author_decision_id",
    "previous_scope",
    "target_scope",
    "story_state",
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown reconcile-manuscript input field: ${key}`);
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.reconciliation_id ?? "") ||
    !/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(request.author_decision_id ?? "") ||
    !Object.hasOwn(request, "target_scope") ||
    !Array.isArray(request.story_state) ||
    request.story_state.length === 0
  ) {
    throw new Error("reconcile-manuscript requires exact reconciliation, decision, target, and story-state identities");
  }
  if (request.previous_scope) {
    assertReference(request.previous_scope, ["scope_id", "scope_fingerprint", "snapshot_path", "snapshot_sha256"]);
  }
  if (request.target_scope) {
    assertReference(request.target_scope, ["scope_id", "scope_fingerprint", "snapshot_path", "snapshot_sha256"]);
  }
  for (const reference of request.story_state) assertReference(reference, ["path", "sha256"]);
  if (
    (request.cycle_id === undefined) !== (request.expected_revision === undefined) ||
    (request.cycle_id !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.cycle_id)) ||
    (request.expected_revision !== undefined && !Number.isInteger(request.expected_revision))
  ) {
    throw new Error("reconcile-manuscript cycle identity requires both cycle_id and integer expected_revision");
  }
}

async function validateStoryState(project, references, target) {
  const states = [];
  for (const reference of references) {
    const contents = await readArtifact(project, reference);
    const validation = validateStoryStateMarkdown(contents.toString("utf8"));
    if (!validation.valid || !validation.envelope) {
      throw new Error(`Reconciled story state is invalid: ${reference.path}`);
    }
    states.push({ reference, value: validation.envelope });
  }
  const current = states.filter((state) => state.value.level === "current");
  if (current.length !== 1 || current[0].value.scope_id !== (target?.scope_id ?? null)) {
    throw new Error("Reconciled current story state must name the imported target scope or null empty state");
  }
  if (!target) {
    if (states.length !== 1 || current[0].value.children.length !== 0) {
      throw new Error("Empty manuscript reconciliation requires one current story state with no chapter children");
    }
    for (const source of current[0].value.sources) await readArtifact(project, source);
    return;
  }
  const targetPaths = new Set(target.files.map((file) => file.path));
  const chapterStates = states.filter((state) => state.value.level === "chapter");
  const sources = new Map();
  for (const state of chapterStates) {
    if (state.value.scope_id !== target.scope_id) {
      throw new Error(`Chapter story state has the wrong scope: ${state.reference.path}`);
    }
    for (const source of state.value.sources) {
      if (!targetPaths.has(source.path)) {
        throw new Error(`Story state retains deleted or out-of-target manuscript ${source.path}`);
      }
      sources.set(source.path, source.sha256);
    }
  }
  for (const file of target.files) {
    if (sources.get(file.path) !== file.sha256) {
      throw new Error(`Chapter story state does not bind current manuscript ${file.path}@${file.sha256}`);
    }
  }
  if (sources.size !== target.files.length) {
    throw new Error("Chapter story-state sources do not exactly match target manuscript membership");
  }
  const provided = new Map(states.map((state) => [state.reference.path, state.reference.sha256]));
  if (provided.size !== references.length) {
    throw new Error("Story-state references contain duplicate artifact paths");
  }
  const referenced = new Set();
  for (const state of states) {
    if (["chapter", "volume"].includes(state.value.level) && state.value.scope_id !== target.scope_id) {
      throw new Error(`Story state has the wrong target scope: ${state.reference.path}`);
    }
    for (const child of state.value.children) {
      if (provided.get(child.path) !== child.sha256) {
        throw new Error(`Story-state child is missing or has the wrong hash: ${child.path}`);
      }
      referenced.add(child.path);
    }
  }
  for (const state of states) {
    if (state.value.level !== "current" && !referenced.has(state.reference.path)) {
      throw new Error(`Story-state artifact is not reachable from current state: ${state.reference.path}`);
    }
  }
}

async function validateImportDecision(project, request, previous, target, inventory) {
  const trackerText = await readFile(
    path.resolve(project.root, project.manifest.paths.audit_tracker),
    "utf8",
  );
  const tracker = await parseTrackerState(trackerText, project.root);
  const decisions = tracker.approvals.filter((approval) => approval.id === request.author_decision_id);
  const decision = decisions.length === 1 ? decisions[0] : null;
  const tokens = new Set(decision?.reason.split(/\s+/) ?? []);
  const expectedPaths = (target ?? previous).files.map((file) => file.path);
  if (
    !tracker.valid ||
    !decision ||
    decision.status !== "approved" ||
    decision.type !== "creation-import" ||
    decision.operation !== "creation-import" ||
    decision.scopeId !== (target?.scope_id ?? previous.scope_id) ||
    JSON.stringify(decision.paths) !== JSON.stringify(expectedPaths) ||
    (target && (
      target.author_confirmation?.decision_id !== request.author_decision_id ||
      target.author_confirmation?.reading_order_confirmed !== true
    )) ||
    !tokens.has(`reconciliation_id=${request.reconciliation_id}`) ||
    !tokens.has(`inventory_fingerprint=${inventory.inventory_fingerprint}`) ||
    !tokens.has(`scope_fingerprint=${target?.scope_fingerprint ?? "null"}`)
  ) {
    const error = new Error("The tracker has no exact approved creation-import decision for this inventory, scope, reading order, and reconciliation");
    error.reconciliationCode = "creation-import-approval-missing";
    throw error;
  }
}

async function invalidatedHistory(project, evaluationReference, changes) {
  if (!evaluationReference) return { evaluations: [], coverage: [] };
  const evaluations = [evaluationReference];
  const coverage = [];
  try {
    const contents = await readArtifact(project, evaluationReference);
    const evaluation = JSON.parse(contents.toString("utf8"));
    const affected = new Set([
      ...changes.created.map((file) => file.path),
      ...changes.modified.map((file) => file.path),
      ...changes.deleted.map((file) => file.path),
    ]);
    for (const artifact of evaluation.evidence_graph.artifacts) {
      if (artifact.role === "coverage-index" && changes.evidence_affected.length > 0) {
        coverage.push({ path: artifact.path, sha256: artifact.sha256 });
      }
      if (artifact.role !== "coverage-unit" || affected.size === 0) continue;
      try {
        const unit = JSON.parse(await readFile(path.resolve(project.root, artifact.path), "utf8"));
        if (unit.paths.some((file) => affected.has(file.path))) {
          coverage.push({ path: artifact.path, sha256: artifact.sha256 });
        }
      } catch {
        coverage.push({ path: artifact.path, sha256: artifact.sha256 });
      }
    }
  } catch {
    return { evaluations, coverage };
  }
  return { evaluations, coverage };
}

function workSetForChanges(target, changes) {
  const affected = new Set(changes.evidence_affected);
  return {
    entries: target.files.filter((file) => affected.has(file.path)).map((file) => ({
      path: file.path,
      operations: RECOVERY_OPERATIONS,
      reason: "Externally changed text requires new affected evidence and full-target synthesis and review.",
    })),
  };
}

export async function reconcileManuscript(projectRoot, request, options = {}) {
  validateRequest(request);
  const project = await readProject(projectRoot);
  const lock = await acquireDirectoryLock(
    path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
    },
  );
  if (!lock.acquired) {
    return failure("cycle-transition-lock-timeout", `Cannot coordinate reconciliation: ${lock.error.message}`);
  }
  let outcome;
  let operationError;
  let cycle = null;
  try {
    let active = null;
    try {
      active = await readActiveCycle(project);
      cycle = active.value;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (cycle && (cycle.cycle_id !== request.cycle_id || cycle.revision !== request.expected_revision)) {
      outcome = failure("cycle-revision-conflict", "The reconciliation cycle ID or expected revision is not current.", cycle);
    } else if (!cycle && request.cycle_id) {
      outcome = failure("active-cycle-required", "The named active cycle is unavailable; do not open a parallel recovery cycle.");
    } else {
      let previousEmptyReconciliation = false;
      if (project.manifest.manuscript_reconciliation) {
        const previousReconciliation = JSON.parse((await readArtifact(
          project,
          project.manifest.manuscript_reconciliation,
        )).toString("utf8"));
        previousEmptyReconciliation = previousReconciliation.target_scope === null;
      }
      const previousReference = cycle
        ? previousEmptyReconciliation && !cycle.target_scope
          ? null
          : cycle.target_scope ?? cycle.starting_scope
        : request.previous_scope ?? null;
      if (!previousReference && !cycle?.bootstrap && !previousEmptyReconciliation) {
        throw new Error("An explicit previous_scope is required for reconciliation without an active cycle");
      }
      let previous = { files: [], excluded_files: [] };
      if (previousReference) {
        try {
          previous = await readScope(project, previousReference);
        } catch (error) {
          error.reconciliationCode = "starting-scope-indeterminate";
          error.reconciliationAction = action("revise-draft", "intake");
          throw error;
        }
      }
      const targetReference = request.target_scope;
      const target = targetReference ? await readScope(project, targetReference) : null;
      const createdAt = options.now instanceof Date ? options.now.toISOString() : new Date().toISOString();
      let inventoryEvidence;
      let observedInventory = null;
      if (target) {
        const current = project.manifest.current_scope;
        if (
          current?.scope_id !== targetReference.scope_id ||
          current?.scope_fingerprint !== targetReference.scope_fingerprint ||
          current?.snapshot_path !== targetReference.snapshot_path ||
          current?.snapshot_sha256 !== targetReference.snapshot_sha256
        ) {
          throw new Error("The imported target must be manifest current_scope");
        }
        const full = await validateFullManuscriptScope(project.manifest, project.manifestPath);
        if (!full.valid) throw new Error("The imported target is not a current full-manuscript scope");
        inventoryEvidence = target.inventory;
      } else {
        observedInventory = await collectVersionedInventory(project.root, project.manifest);
        if (observedInventory.files.length > 0) {
          throw new Error("A null reconciliation target requires an actually empty manuscript inventory");
        }
        inventoryEvidence = (await recordInventorySnapshot(project.root, project.manifest, {
          now: new Date(createdAt),
        })).reference;
      }
      try {
        await validateStoryState(project, request.story_state, target);
      } catch (error) {
        error.reconciliationCode = "story-state-reconciliation-required";
        error.reconciliationAction = action("write-fiction", "creation-import");
        throw error;
      }
      await validateImportDecision(project, request, previous, target, inventoryEvidence);

      const bootstrapRecovery = Boolean(cycle?.bootstrap);
      const preferredEvaluation = cycle?.target_evaluation ?? cycle?.starting_evaluation ?? null;
      const previousEvaluation = bootstrapRecovery ? null : await findHistoricalSatisfiedEvaluation(
        project,
        previousReference,
        preferredEvaluation,
      );
      const recoveringFromEmpty = previousEmptyReconciliation || Boolean(
        cycle &&
        !cycle.target_scope &&
        (cycle.related_artifacts.reconciliations ?? []).length > 0
      );
      const requiredStrategy = !target
        ? "write-fiction"
        : bootstrapRecovery || recoveringFromEmpty
          ? "revise-draft"
          : previousEvaluation ? "revise-increment" : "revise-draft";
      const recoveryOperation = target ? "intake" : "creation-import";
      const cumulativeReference = bootstrapRecovery
        ? null
        : cycle?.starting_scope ?? previousReference;
      const cumulative = bootstrapRecovery
        ? { files: [], excluded_files: [] }
        : cumulativeReference ? await readScope(project, cumulativeReference) : previous;
      const changes = diffManuscriptInventories(cumulative, target ?? observedInventory);
      const workSet = !target
        ? { entries: [] }
        : previousEvaluation && !recoveringFromEmpty
          ? workSetForChanges(target, changes)
          : {
              entries: target.files.map((file) => ({
                path: file.path,
                operations: RECOVERY_OPERATIONS,
                reason: bootstrapRecovery
                  ? "Bootstrap's first nonempty import requires initial full-manuscript revise-draft evidence."
                  : "No satisfied previous full-manuscript scope remains provable; the complete target requires revise-draft recovery.",
              })),
            };
      const invalidated = await invalidatedHistory(
        project,
        preferredEvaluation ?? previousEvaluation?.evaluation_reference ?? null,
        changes,
      );
      const proofBlockers = bootstrapRecovery || previousEvaluation || recoveringFromEmpty ? [] : [{
        code: "previous-evaluation-unproven",
        message: "The previous full-manuscript scope or its required satisfied evidence can no longer be proven; revise-draft is required.",
      }];
      const reconciliation = {
        schema_version: "1.0.0",
        reconciliation_id: request.reconciliation_id,
        cycle_id: cycle?.cycle_id ?? null,
        previous_scope: previousReference,
        previous_evaluation: previousEvaluation?.evaluation_reference ?? null,
        proof_blockers: proofBlockers,
        invalidated_evaluations: invalidated.evaluations,
        invalidated_coverage: invalidated.coverage,
        target_scope: targetReference,
        inventory: inventoryEvidence,
        change_set: {
          from_scope: cumulativeReference,
          to_scope: targetReference,
          ...changes,
        },
        work_set: workSet,
        story_state: request.story_state,
        author_decision_id: request.author_decision_id,
        recovery_from_empty: recoveringFromEmpty,
        required_strategy: requiredStrategy,
        recovery_operation: recoveryOperation,
        created_at: createdAt,
      };
      const recordValidation = validateManuscriptReconciliationSchema(reconciliation);
      if (!recordValidation.valid) {
        throw new Error(`Generated reconciliation is invalid: ${recordValidation.errors.map((error) => error.message).join("; ")}`);
      }
      const relative = path.posix.join(
        project.manifest.paths.convergence,
        "reconciliations",
        `${reconciliation.reconciliation_id}.json`,
      );
      const absolute = path.resolve(project.root, relative);
      const text = `${JSON.stringify(reconciliation, null, 2)}\n`;
      await createNoClobberVerified(absolute, text);
      const reference = {
        reconciliation_id: reconciliation.reconciliation_id,
        path: relative,
        sha256: sha256Bytes(text),
      };
      let updated = null;
      if (cycle) {
        updated = {
          ...cycle,
          revision: cycle.revision + 1,
          current_strategy: requiredStrategy,
          target_scope: targetReference,
          requested_pass: null,
          target_evaluation: null,
          recovery_position: {
            operation: recoveryOperation,
            reason: !target
              ? "The manuscript is empty; an approved nonempty restore or import is required before full-manuscript revise-draft recovery."
              : bootstrapRecovery
                ? "The first approved nonempty bootstrap import requires its initial full-manuscript revise-draft evaluation."
                : recoveringFromEmpty
                  ? "The approved nonempty recovery import requires a complete full-manuscript revise-draft pass."
                  : previousEvaluation
                    ? "The author-confirmed external manuscript and story state require affected evidence and full-target review."
                    : "The previous satisfied full-manuscript proof is unavailable; the complete target requires revise-draft recovery.",
            required_strategy: requiredStrategy,
          },
          related_artifacts: {
            ...cycle.related_artifacts,
            reconciliations: [...(cycle.related_artifacts.reconciliations ?? []), reference],
          },
          change_set: reconciliation.change_set,
          work_set: reconciliation.work_set,
          updated_at: createdAt,
        };
        const cycleValidation = validateConvergenceCycleSchema(updated);
        if (!cycleValidation.valid) {
          throw new Error(`Generated reconciled cycle is invalid: ${cycleValidation.errors.map((error) => error.message).join("; ")}`);
        }
        await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
      }
      const updatedManifest = {
        ...project.manifest,
        manuscript_reconciliation: reference,
        updated_at: createdAt,
      };
      if (!target) delete updatedManifest.current_scope;
      await writeAtomicVerified(project.manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);
      outcome = {
        valid: true,
        cycle: updated,
        reconciliation,
        reconciliation_path: absolute,
        reconciliation_reference: reference,
        state_written: true,
        required_action: action(requiredStrategy, recoveryOperation),
        blockers: [],
      };
    }
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return failure("cycle-transition-lock-release-error", released.error.message, outcome?.cycle ?? null);
  }
  if (operationError?.reconciliationCode) {
    const result = failure(operationError.reconciliationCode, operationError.message, cycle);
    if (operationError.reconciliationAction) {
      result.required_action = operationError.reconciliationAction;
      result.blockers[0].required_action = operationError.reconciliationAction;
    }
    return result;
  }
  if (operationError) throw operationError;
  return outcome;
}
