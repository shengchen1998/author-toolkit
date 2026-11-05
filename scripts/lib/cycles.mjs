import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { collectManuscriptInventory } from "./manuscript.mjs";
import { validateManifest } from "./manifest.mjs";
import { validateConvergenceCycleSchema } from "./schemas.mjs";
import {
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

const STRATEGIES = new Set([
  "write-fiction",
  "revise-fiction",
  "revise-draft",
  "revise-increment",
  "revise-request",
]);

const INITIAL_OPERATIONS = {
  "write-fiction": "creation-baseline",
  "revise-fiction": "intake",
  "revise-draft": "intake",
  "revise-increment": "intake",
  "revise-request": "revision-plan",
};

function cycleError(instancePath, message, keyword = "cycle-identity") {
  return { instancePath, keyword, message, params: {} };
}

export function validateConvergenceCycle(value) {
  const schema = validateConvergenceCycleSchema(value);
  const errors = [...schema.errors];
  if (
    value?.completion &&
    value?.target_evaluation &&
    value.completion.target_evaluation_id !== value.target_evaluation.evaluation_id
  ) {
    errors.push(
      cycleError(
        "/completion/target_evaluation_id",
        "completion decision must name the cycle target evaluation",
        "cycle-completion",
      ),
    );
  }
  if (
    value?.recovery_position &&
    value.recovery_position.required_strategy !== value.current_strategy
  ) {
    errors.push(
      cycleError(
        "/recovery_position/required_strategy",
        "recovery position must name the current strategy",
        "cycle-recovery",
      ),
    );
  }
  return { valid: errors.length === 0, errors };
}

function validationError(result) {
  return new Error(
    `Convergence cycle validation failed:\n${result.errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("\n")}`,
  );
}

async function readProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const validation = validateManifest(manifest);
  if (!validation.valid) throw validationError(validation);
  if (manifest.schema_version !== "3.2.0") {
    throw new Error("Convergence cycles require a v3.2 project");
  }
  return { root, manifestPath, manifest };
}

function activeCyclePath(root, manifest) {
  return path.resolve(root, manifest.paths.convergence, "active-cycle.json");
}

async function readActiveCycle(root, manifest) {
  const file = activeCyclePath(root, manifest);
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const validation = validateConvergenceCycle(value);
  if (!validation.valid) throw validationError(validation);
  if (value.status !== "active") {
    throw new Error(`The living cycle record must be active: ${file}`);
  }
  return { value, file };
}

function requiredAction(cycle) {
  const position = cycle?.recovery_position;
  if (!position) return null;
  return {
    strategy: position.required_strategy,
    operation: position.operation,
    command: position.required_strategy,
  };
}

function blocked(code, message, cycle) {
  const action = requiredAction(cycle);
  return {
    valid: false,
    cycle: cycle ?? null,
    required_action: action,
    blockers: [{ code, message, required_action: action }],
  };
}

function emptyRelatedArtifacts() {
  return {
    plans: [],
    creation_batches: [],
    creation_commits: [],
    revision_executions: [],
    review_groups: [],
    reviews: [],
    no_edit_skips: [],
  };
}

function emptyChangeSet() {
  return {
    from_scope: null,
    to_scope: null,
    created: [],
    modified: [],
    deleted: [],
    reordered: [],
    evidence_affected: [],
    dependency_affected: [],
  };
}

function operationTime(options) {
  const now = options.now instanceof Date ? options.now : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Invalid cycle operation time");
  return now.toISOString();
}

function validateStartRequest(request) {
  const allowed = new Set(["cycle_id", "initiating_strategy", "bootstrap", "starting_scope"]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown start-cycle input field: ${key}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.cycle_id ?? "")) {
    throw new Error("start-cycle requires a valid cycle_id");
  }
  if (!STRATEGIES.has(request.initiating_strategy)) {
    throw new Error("start-cycle requires a valid initiating_strategy");
  }
  if (typeof request.bootstrap !== "boolean") {
    throw new Error("start-cycle requires an explicit bootstrap boolean");
  }
  if (!Object.hasOwn(request, "starting_scope")) {
    throw new Error("start-cycle requires starting_scope, which may be null only for bootstrap");
  }
}

async function completedBootstrapExists(root, manifest) {
  const directory = path.resolve(root, manifest.paths.convergence, "cycles");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const value = JSON.parse(await readFile(path.join(directory, entry.name), "utf8"));
    const validation = validateConvergenceCycle(value);
    if (!validation.valid) throw validationError(validation);
    if (value.status === "completed" && value.bootstrap) return true;
  }
  return false;
}

export async function startCycle(projectRoot, request, options = {}) {
  validateStartRequest(request);
  const project = await readProject(projectRoot);
  const { root, manifest } = project;
  const active = await readActiveCycle(root, manifest);
  if (active) {
    return blocked(
      "active-cycle-exists",
      `Cycle ${active.value.cycle_id} is active; finish its required recovery action before starting another manuscript-changing cycle.`,
      active.value,
    );
  }

  let startingEvaluation = null;
  if (!request.bootstrap) {
    try {
      if (!request.starting_scope) throw new Error("A starting scope snapshot is required");
      await verifyScopeReference(project, request.starting_scope);
    } catch (error) {
      return blocked(
        "starting-scope-indeterminate",
        `The starting scope cannot prove a current full-manuscript starting point: ${error.message}`,
        {
          recovery_position: {
            operation: "intake",
            required_strategy: "revise-draft",
          },
        },
      );
    }
    const { findSatisfiedStartingEvaluation } = await import("./convergence.mjs");
    const starting = await findSatisfiedStartingEvaluation(project, request.starting_scope);
    if (!starting) {
      return blocked(
        "starting-evaluation-indeterminate",
        "A current satisfied starting evaluation is unavailable; run a full-manuscript revise-draft recovery before starting this cycle.",
        {
          recovery_position: {
            operation: "intake",
            required_strategy: "revise-draft",
          },
        },
      );
    }
    startingEvaluation = starting.evaluation_reference;
  }

  if (request.bootstrap) {
    if (request.initiating_strategy !== "write-fiction" || request.starting_scope !== null) {
      throw new Error("Bootstrap requires write-fiction and a null starting_scope");
    }
    if (manifest.current_scope) {
      return blocked(
        "bootstrap-requires-empty-project",
        "Bootstrap cannot replace an existing scope; reconcile the project through revise-draft.",
        {
          recovery_position: { operation: "intake", required_strategy: "revise-draft" },
        },
      );
    }
    const inventory = await collectManuscriptInventory(
      root,
      manifest.manuscript_root,
      manifest.paths,
    );
    if (inventory.files.length > 0 || (await completedBootstrapExists(root, manifest))) {
      return blocked(
        "bootstrap-requires-empty-project",
        "Bootstrap is available only for the first empty manuscript; use the full-manuscript recovery path instead.",
        {
          recovery_position: { operation: "intake", required_strategy: "revise-draft" },
        },
      );
    }
  }

  const timestamp = operationTime(options);
  const cycle = {
    schema_version: "1.0.0",
    cycle_id: request.cycle_id,
    revision: 1,
    status: "active",
    initiating_strategy: request.initiating_strategy,
    current_strategy: request.initiating_strategy,
    bootstrap: request.bootstrap,
    starting_scope: request.starting_scope,
    target_scope: request.bootstrap ? null : request.starting_scope,
    requested_pass: null,
    recovery_position: {
      operation: INITIAL_OPERATIONS[request.initiating_strategy],
      reason: request.bootstrap
        ? "First-time bootstrap must establish a nonempty manuscript and its initial convergence evaluation."
        : "The verified starting evaluation begins this cycle; its target must restore current-draft revision convergence.",
      required_strategy: request.initiating_strategy,
    },
    related_artifacts: emptyRelatedArtifacts(),
    change_set: emptyChangeSet(),
    work_set: { entries: [] },
    starting_evaluation: startingEvaluation,
    target_evaluation: null,
    completion: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const validation = validateConvergenceCycle(cycle);
  if (!validation.valid) throw validationError(validation);
  const file = activeCyclePath(root, manifest);
  try {
    await createNoClobberVerified(file, `${JSON.stringify(cycle, null, 2)}\n`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const concurrent = await readActiveCycle(root, manifest);
    return blocked(
      "active-cycle-exists",
      `Cycle ${concurrent.value.cycle_id} is active; finish its required recovery action before starting another manuscript-changing cycle.`,
      concurrent.value,
    );
  }
  return {
    valid: true,
    cycle,
    cycle_path: file,
    required_action: requiredAction(cycle),
    blockers: [],
  };
}


function recoveryActionOrDefault(cycle) {
  return (
    requiredAction(cycle) ?? {
      strategy: "revise-draft",
      operation: "intake",
      command: "revise-draft",
    }
  );
}

export async function getCycleStatus(projectRoot) {
  const { getConvergenceStatus } = await import("./convergence.mjs");
  return getConvergenceStatus(projectRoot);
}

export async function checkConvergenceGate(projectRoot) {
  const status = await getCycleStatus(projectRoot);
  return {
    valid: status.query_valid && status.outcome === "satisfied" && status.current,
    ...status,
  };
}

export async function assertCycleAllowsOperation(projectRoot, request) {
  if (!STRATEGIES.has(request.strategy)) throw new Error("A valid strategy is required");
  if (typeof request.operation !== "string" || request.operation.length === 0) {
    throw new Error("An operation is required");
  }
  if (typeof request.manuscript_change !== "boolean") {
    throw new Error("manuscript_change must be explicit");
  }
  const { root, manifest } = await readProject(projectRoot);
  const active = await readActiveCycle(root, manifest);
  if (!active || !request.manuscript_change) {
    return {
      valid: true,
      read_only: !request.manuscript_change,
      cycle: active?.value ?? null,
      required_action: recoveryActionOrDefault(active?.value),
      blockers: [],
    };
  }

  const cycle = active.value;
  const resumesActive =
    request.cycle_id === cycle.cycle_id &&
    request.strategy === cycle.current_strategy &&
    request.operation === cycle.recovery_position.operation;
  if (resumesActive) {
    return {
      valid: true,
      read_only: false,
      cycle,
      required_action: requiredAction(cycle),
      blockers: [],
    };
  }

  const code = request.cycle_id === cycle.cycle_id
    ? "cycle-operation-mismatch"
    : "active-cycle-exists";
  return {
    ...blocked(
      code,
      `Cycle ${cycle.cycle_id} requires ${cycle.recovery_position.required_strategy} ${cycle.recovery_position.operation ?? "completion"} before other manuscript-changing work.`,
      cycle,
    ),
    read_only: false,
  };
}


function validateTransitionRequest(request) {
  const allowed = new Set([
    "cycle_id",
    "expected_revision",
    "current_strategy",
    "recovery_position",
    "target_scope",
    "requested_pass",
    "related_artifacts",
    "change_set",
    "work_set",
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown transition-cycle input field: ${key}`);
  }
  if (typeof request.cycle_id !== "string" || !Number.isInteger(request.expected_revision)) {
    throw new Error("transition-cycle requires cycle_id and integer expected_revision");
  }
  if (request.current_strategy !== undefined && !STRATEGIES.has(request.current_strategy)) {
    throw new Error("transition-cycle current_strategy is invalid");
  }
  if (request.recovery_position !== undefined) {
    const keys = Object.keys(request.recovery_position).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["operation", "reason"])) {
      throw new Error("recovery_position input requires only operation and reason");
    }
  }
}

function mergeRelatedArtifacts(current, requested) {
  if (requested === undefined) return current;
  const merged = { ...current };
  for (const [role, references] of Object.entries(requested)) {
    if (!Object.hasOwn(current, role) || !Array.isArray(references)) {
      throw new Error(`Unknown related_artifacts role: ${role}`);
    }
    merged[role] = [...current[role], ...references];
  }
  return merged;
}

async function verifyArtifactReference(root, reference) {
  const contents = await readFile(path.resolve(root, reference.path));
  if (sha256Bytes(contents) !== reference.sha256) {
    throw new Error(`Referenced artifact hash does not match: ${reference.path}`);
  }
}

async function verifyScopeReference(project, reference, { requireCurrent = true } = {}) {
  const { root, manifestPath, manifest } = project;
  await verifyArtifactReference(root, {
    path: reference.snapshot_path,
    sha256: reference.snapshot_sha256,
  });
  const snapshot = JSON.parse(await readFile(path.resolve(root, reference.snapshot_path), "utf8"));
  const validation = validateScopeSnapshot(snapshot);
  if (!validation.valid) throw validationError(validation);
  const expectedPath = path.posix.join(
    manifest.paths.convergence,
    "scopes",
    `${reference.scope_id}-${reference.scope_fingerprint}.json`,
  );
  if (
    reference.snapshot_path !== expectedPath ||
    snapshot.scope_id !== reference.scope_id ||
    snapshot.scope_fingerprint !== reference.scope_fingerprint
  ) {
    throw new Error(`Scope snapshot identity does not match its reference: ${expectedPath}`);
  }
  if (!requireCurrent) return;

  const current = manifest.current_scope;
  if (
    current?.scope_id !== reference.scope_id ||
    current?.scope_fingerprint !== reference.scope_fingerprint ||
    current?.snapshot_path !== reference.snapshot_path ||
    current?.snapshot_sha256 !== reference.snapshot_sha256
  ) {
    throw new Error("Target scope is not the manifest current_scope");
  }
  const full = await validateFullManuscriptScope(manifest, manifestPath);
  if (!full.valid) {
    throw new Error(
      `Target scope is not a current full-manuscript scope: ${full.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
}

async function transitionCycleLocked(project, request, options) {
  const active = await readActiveCycle(project.root, project.manifest);
  if (!active) {
    return {
      stateWritten: false,
      result: blocked(
        "active-cycle-required",
        "No active cycle can be resumed; start an eligible cycle or run revise-draft recovery.",
        {
          recovery_position: { operation: "intake", required_strategy: "revise-draft" },
        },
      ),
    };
  }
  const cycle = active.value;
  if (request.cycle_id !== cycle.cycle_id) {
    return {
      stateWritten: false,
      result: blocked(
        "cycle-id-mismatch",
        `The requested cycle does not match active cycle ${cycle.cycle_id}.`,
        cycle,
      ),
    };
  }
  if (request.expected_revision !== cycle.revision) {
    return {
      stateWritten: false,
      result: blocked(
        "cycle-revision-conflict",
        `Expected cycle revision ${request.expected_revision}, but the active revision is ${cycle.revision}.`,
        cycle,
      ),
    };
  }

  const currentStrategy = request.current_strategy ?? cycle.current_strategy;
  const candidate = {
    ...cycle,
    revision: cycle.revision + 1,
    current_strategy: currentStrategy,
    recovery_position: request.recovery_position
      ? {
          ...request.recovery_position,
          required_strategy: currentStrategy,
        }
      : cycle.recovery_position,
    target_scope: Object.hasOwn(request, "target_scope")
      ? request.target_scope
      : cycle.target_scope,
    requested_pass: Object.hasOwn(request, "requested_pass")
      ? request.requested_pass
      : cycle.requested_pass,
    related_artifacts: mergeRelatedArtifacts(cycle.related_artifacts, request.related_artifacts),
    change_set: request.change_set ?? cycle.change_set,
    work_set: request.work_set ?? cycle.work_set,
    updated_at: operationTime(options),
  };
  const validation = validateConvergenceCycle(candidate);
  if (!validation.valid) throw validationError(validation);

  try {
    if (candidate.target_scope) {
      await verifyScopeReference(project, candidate.target_scope, {
        requireCurrent: Object.hasOwn(request, "target_scope"),
      });
    }
    if (candidate.change_set.from_scope) {
      await verifyScopeReference(project, candidate.change_set.from_scope, { requireCurrent: false });
    }
    if (candidate.change_set.to_scope) {
      await verifyScopeReference(project, candidate.change_set.to_scope, { requireCurrent: false });
    }
    if (candidate.requested_pass) {
      await verifyArtifactReference(project.root, candidate.requested_pass);
    }
    for (const references of Object.values(candidate.related_artifacts)) {
      for (const reference of references) {
        await verifyArtifactReference(project.root, reference);
      }
    }
  } catch (error) {
    return {
      stateWritten: false,
      result: blocked("artifact-reference-mismatch", error.message, cycle),
    };
  }

  await writeAtomicVerified(active.file, `${JSON.stringify(candidate, null, 2)}\n`);
  return {
    stateWritten: true,
    result: {
      valid: true,
      cycle: candidate,
      cycle_path: active.file,
      required_action: requiredAction(candidate),
      blockers: [],
    },
  };
}

export async function transitionCycle(projectRoot, request, options = {}) {
  validateTransitionRequest(request);
  const project = await readProject(projectRoot);
  const initial = await readActiveCycle(project.root, project.manifest);
  if (!initial) {
    return {
      ...blocked(
        "active-cycle-required",
        "No active cycle can be resumed; start an eligible cycle or run revise-draft recovery.",
        {
          recovery_position: { operation: "intake", required_strategy: "revise-draft" },
        },
      ),
      state_written: false,
    };
  }

  const lock = await acquireDirectoryLock(
    path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
    },
  );
  if (!lock.acquired) {
    const code = lock.code === "timeout"
      ? "cycle-transition-lock-timeout"
      : "cycle-transition-lock-error";
    return {
      ...blocked(
        code,
        `Cannot coordinate the cycle transition at ${lock.directory}: ${lock.error.message}`,
        initial.value,
      ),
      state_written: false,
      lock_path: lock.directory,
    };
  }

  let outcome;
  let operationError;
  try {
    outcome = await transitionCycleLocked(project, request, options);
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    const operationMessage = operationError ? ` Operation also failed: ${operationError.message}` : "";
    return {
      ...blocked(
        "cycle-transition-lock-release-error",
        `Cannot release transition lock ${lock.directory}: ${released.error.message}.${operationMessage}`,
        outcome?.result.cycle ?? initial.value,
      ),
      state_written: outcome?.stateWritten ?? null,
      lock_path: lock.directory,
    };
  }
  if (operationError) throw operationError;
  return {
    ...outcome.result,
    state_written: outcome.stateWritten,
  };
}
