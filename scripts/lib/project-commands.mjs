import { readFile } from "node:fs/promises";
import path from "node:path";

import { coordinationBlockers, runCheckpoint } from "./cycle-coordination.mjs";
import { readActiveCycle, readProject } from "./evaluation-artifacts.mjs";
import { validateManifest } from "./manifest.mjs";
import { validateProjectFiles } from "./project-files.mjs";
import { recordScope, validateFullManuscriptScope } from "./scope.mjs";
import { validateDeployedReferences } from "./shared-references.mjs";
import {
  acquireDirectoryLock,
  releaseDirectoryLock,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";
import { utcTimestamp } from "./time.mjs";

function requiredAction(operation) {
  return {
    strategy: "author-project",
    operation,
    command: `author-project ${operation}`,
  };
}

function failure(code, message, operation, details = {}) {
  return {
    valid: false,
    state_written: false,
    required_action: requiredAction(operation),
    blockers: [{ code, message, ...details, required_action: requiredAction(operation) }],
    ...details,
  };
}

function stateError(code, message, details = {}) {
  const error = new Error(message);
  error.projectCode = code;
  error.projectDetails = details;
  return error;
}

function operationTime(options) {
  return utcTimestamp(options);
}

function validatePendingRequest(request) {
  const allowed = new Set([
    "operation",
    "status",
    "scope_id",
    "scope_fingerprint",
    "reason",
    "artifacts",
    "operation_id",
    "expected_manifest_sha256",
    "cycle_id",
    "expected_revision",
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown set-pending input field: ${key}`);
  }
  if ((request.cycle_id === undefined) !== (request.expected_revision === undefined)) {
    throw new Error("set-pending cycle identity requires both cycle_id and expected_revision");
  }
  if (
    request.expected_revision !== undefined &&
    !Number.isInteger(request.expected_revision)
  ) {
    throw new Error("set-pending expected_revision must be an integer");
  }
}

async function recoveryState(project, active, operation) {
  let manifest = null;
  let manifestText = null;
  try {
    manifestText = await readFile(project.manifestPath, "utf8");
    manifest = JSON.parse(manifestText);
  } catch {
  }
  return {
    required_action: requiredAction(operation),
    manifest_path: project.manifestPath,
    manifest_sha256: manifestText === null ? null : sha256Bytes(manifestText),
    current_scope: manifest?.current_scope ?? null,
    pending_action: manifest?.pending_action ?? null,
    cycle_operation: manifest?.cycle_operation ?? null,
    cycle_id: active?.value.cycle_id ?? null,
    cycle_revision: active?.value.revision ?? null,
  };
}

export async function setPendingAction(projectRoot, request, options = {}) {
  validatePendingRequest(request);
  const references = await validateDeployedReferences(projectRoot);
  if (!references.valid) {
    return {
      ...failure(
        "reference-version-conflict",
        "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
        "set-pending",
      ),
      reference_errors: references.errors,
    };
  }
  const initial = await readProject(projectRoot);
  const lock = await acquireDirectoryLock(
    path.resolve(initial.root, initial.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
      now: options.now,
    },
  );
  if (!lock.acquired) {
    return {
      ...failure(
        lock.code === "timeout" ? "project-lock-timeout" : "project-lock-error",
        `Cannot coordinate pending-action recording at ${lock.directory}: ${lock.error.message}`,
        "set-pending",
        { lock_path: lock.directory },
      ),
      pending_action: initial.manifest.pending_action ?? null,
    };
  }

  let outcome;
  let operationError;
  let manifestWritten = false;
  let project = initial;
  let active = null;
  try {
    await runCheckpoint(options, "lock-acquired");
    project = await readProject(projectRoot);
    active = await readActiveCycle(project);
    const manifestText = await readFile(project.manifestPath, "utf8");
    if (
      request.expected_manifest_sha256 !== undefined &&
      sha256Bytes(manifestText) !== request.expected_manifest_sha256
    ) {
      throw stateError(
        "manifest-hash-conflict",
        "The project manifest changed after the pending-action input was prepared; reread it before retrying.",
        { expected_sha256: request.expected_manifest_sha256, actual_sha256: sha256Bytes(manifestText) },
      );
    }
    if (active && request.cycle_id !== undefined &&
      (active.value.cycle_id !== request.cycle_id || active.value.revision !== request.expected_revision)) {
      throw stateError(
        "cycle-revision-conflict",
        `Expected cycle ${request.cycle_id} revision ${request.expected_revision}, but the active cycle is ${active.value.cycle_id} revision ${active.value.revision}.`,
      );
    }
    if (!active && request.cycle_id !== undefined) {
      throw stateError("active-cycle-required", "The named active cycle is unavailable.");
    }
    const coordination = coordinationBlockers(project, active);
    if (coordination.length > 0) {
      outcome = {
        ...failure(
          coordination[0].code,
          coordination[0].message,
          "set-pending",
        ),
        pending_action: project.manifest.pending_action ?? null,
        recovery: await recoveryState(project, active, "reconcile-cycle"),
      };
    } else {
      const cycle = active?.value ?? null;
      const trackedScope = cycle?.target_scope ?? project.manifest.current_scope ?? null;
      if (request.scope_id !== undefined && trackedScope &&
        request.scope_id !== trackedScope.scope_id) {
        throw stateError(
          "pending-scope-conflict",
          `Pending scope ${request.scope_id} does not match current scope ${trackedScope.scope_id}.`,
        );
      }
      if (request.scope_fingerprint !== undefined && trackedScope &&
        request.scope_fingerprint !== trackedScope.scope_fingerprint) {
        throw stateError(
          "pending-scope-conflict",
          "The pending scope fingerprint does not match the current scope fingerprint.",
        );
      }
      if (request.operation_id !== undefined && cycle &&
        request.operation_id !== cycle.recovery_position?.operation_id) {
        throw stateError(
          "cycle-operation-id-mismatch",
          "The pending operation ID does not match the active cycle recovery position.",
        );
      }
      if (cycle && request.operation !== cycle.recovery_position?.operation) {
        throw stateError(
          "cycle-operation-mismatch",
          `Pending operation ${request.operation} does not match active recovery operation ${cycle.recovery_position?.operation ?? "null"}.`,
        );
      }
      const scopeId = trackedScope?.scope_id ?? request.scope_id;
      const scopeFingerprint = trackedScope?.scope_fingerprint ?? request.scope_fingerprint;
      const artifacts = [...new Set([
        ...(project.manifest.pending_action?.artifacts ?? []),
        ...(request.artifacts ?? []),
      ])];
      const pending = {
        operation: request.operation,
        status: request.status,
        ...(scopeId ? { scope_id: scopeId } : {}),
        ...(scopeFingerprint ? { scope_fingerprint: scopeFingerprint } : {}),
        ...(cycle ? {
          cycle_id: cycle.cycle_id,
          cycle_revision: cycle.revision,
          ...(cycle.recovery_position?.operation_id ? {
            operation_id: cycle.recovery_position.operation_id,
          } : {}),
        } : request.operation_id ? { operation_id: request.operation_id } : {}),
        reason: request.reason,
        ...(artifacts.length > 0 ? { artifacts } : {}),
        updated_at: operationTime(options),
      };
      const updated = {
        ...project.manifest,
        pending_action: pending,
        updated_at: pending.updated_at,
      };
      const manifestValidation = validateManifest(updated);
      const fileValidation = manifestValidation.valid
        ? await validateProjectFiles(updated, project.manifestPath)
        : { valid: false, errors: [] };
      if (!manifestValidation.valid || !fileValidation.valid) {
        outcome = {
          ...failure(
            "pending-action-invalid",
            "The requested pending action does not satisfy the project contract.",
            "set-pending",
          ),
          pending_action: project.manifest.pending_action ?? null,
          validation_errors: [...manifestValidation.errors, ...fileValidation.errors],
        };
      } else {
        await writeAtomicVerified(project.manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
        manifestWritten = true;
        await runCheckpoint(options, "manifest-updated");
        outcome = {
          valid: true,
          state_written: true,
          pending_action: pending,
          manifest_sha256: sha256Bytes(`${JSON.stringify(updated, null, 2)}\n`),
          required_action: requiredAction("set-pending"),
          blockers: [],
        };
      }
    }
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      ...failure(
        "project-lock-release-error",
        `Cannot release pending-action lock ${lock.directory}: ${released.error.message}`,
        "set-pending",
        { lock_path: lock.directory },
      ),
      state_written: manifestWritten,
      recovery: await recoveryState(project, active, "set-pending"),
    };
  }
  if (operationError) {
    return {
      ...failure(
        operationError.projectCode ?? "pending-action-write-interrupted",
        operationError.message,
        "set-pending",
        operationError.projectDetails,
      ),
      state_written: manifestWritten,
      pending_action: project.manifest.pending_action ?? null,
      recovery: await recoveryState(project, active, "set-pending"),
    };
  }
  return outcome;
}

function validateScopeRequest(request) {
  const allowed = new Set([
    "scope_id",
    "description",
    "status",
    "files",
    "excluded_files",
    "created_at",
    "scope_fingerprint",
    "author_confirmation",
    "expected_manifest_sha256",
    "cycle_id",
    "expected_revision",
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown record-scope input field: ${key}`);
  }
  if ((request.cycle_id === undefined) !== (request.expected_revision === undefined)) {
    throw new Error("record-scope cycle identity requires both cycle_id and expected_revision");
  }
  if (
    request.expected_revision !== undefined &&
    !Number.isInteger(request.expected_revision)
  ) {
    throw new Error("record-scope expected_revision must be an integer");
  }
}

function validationBlockers(errors) {
  return errors.map((error) => ({
    code: error.code ?? error.keyword ?? "scope-validation-failed",
    instancePath: error.instancePath ?? null,
    message: error.message,
  }));
}

export async function recordProjectScope(projectRoot, request, options = {}) {
  validateScopeRequest(request);
  const references = await validateDeployedReferences(projectRoot);
  if (!references.valid) {
    return {
      ...failure(
        "reference-version-conflict",
        "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
        "record-scope",
      ),
      reference_errors: references.errors,
    };
  }
  const initial = await readProject(projectRoot);
  const scope = Object.fromEntries([
    "scope_id",
    "description",
    "status",
    "files",
    "excluded_files",
    "created_at",
    "scope_fingerprint",
  ].filter((key) => request[key] !== undefined).map((key) => [key, request[key]]));
  const progress = {};
  try {
    const recorded = await recordScope(projectRoot, scope, {
      authorConfirmation: request.author_confirmation,
      expectedManifestSha256: request.expected_manifest_sha256,
      cycleId: request.cycle_id,
      expectedRevision: request.expected_revision,
      now: options.now,
      checkpoint: options.checkpoint ? async (point) => {
        try {
          await options.checkpoint(point);
        } catch (error) {
          error.projectCode ??= "scope-write-interrupted";
          error.projectDetails ??= { checkpoint: point };
          throw error;
        }
      } : undefined,
      lockTimeoutMs: options.lockTimeoutMs,
      lockRetryMs: options.lockRetryMs,
      progress,
    });
    const manifestText = await readFile(initial.manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);
    const validation = await validateFullManuscriptScope(manifest, initial.manifestPath);
    return {
      valid: true,
      state_written: true,
      scope_id: recorded.scope_id,
      scope_fingerprint: recorded.scope_fingerprint,
      inventory_fingerprint: recorded.inventory_fingerprint,
      current_scope: recorded.current_scope,
      snapshot: recorded.snapshot_reference,
      inventory: recorded.inventory_reference,
      validation: {
        valid: validation.valid,
        full_manuscript: validation.full_manuscript,
        scope_id: validation.scope_id,
        scope_fingerprint: validation.scope_fingerprint,
        inventory_fingerprint: validation.inventory_fingerprint,
        snapshot_path: validation.snapshot_path,
        blockers: validationBlockers(validation.errors),
      },
      manifest_sha256: sha256Bytes(manifestText),
      required_action: requiredAction("record-scope"),
      blockers: [],
    };
  } catch (error) {
    return {
      ...failure(
        error.projectCode ?? "scope-recording-failed",
        error.message,
        "record-scope",
        error.projectDetails,
      ),
      state_written: Boolean(
        progress.inventoryPublished || progress.snapshotPublished || progress.manifestWritten
      ),
      recovery: {
        ...await recoveryState(initial, progress.active, "record-scope"),
        inventory_published: progress.inventoryPublished === true,
        snapshot_published: progress.snapshotPublished === true,
        manifest_updated: progress.manifestWritten === true,
        inventory_path: progress.inventoryPath ?? null,
        snapshot_path: progress.snapshotPath ?? null,
      },
    };
  }
}
