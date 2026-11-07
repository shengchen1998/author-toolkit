import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateManifest } from "./manifest.mjs";
import { sha256Bytes, writeAtomicVerified } from "./state-io.mjs";
import { utcTimestamp } from "./time.mjs";

function action() {
  return {
    strategy: "author-project",
    operation: "reconcile-cycle",
    command: "author-project reconcile-cycle",
  };
}

function blocker(code, message, operation = null) {
  return {
    code,
    message,
    ...(operation ? {
      operation_id: operation.operation_id,
      cycle_id: operation.cycle_id,
      expected_revision: operation.expected_revision,
      intended_revision: operation.intended_revision,
      kind: operation.kind,
    } : {}),
    required_action: action(),
  };
}

function pendingBlockers(manifest, active) {
  const pending = manifest.pending_action;
  if (!pending?.cycle_id) return [];
  const cycle = active?.value;
  if (!cycle) {
    if (manifest.last_completed_cycle?.cycle_id === pending.cycle_id) return [];
    return [blocker(
      "pending-cycle-unavailable",
      `Pending action ${pending.operation_id ?? pending.operation} names unavailable cycle ${pending.cycle_id}; it cannot authorize continuation.`,
    )];
  }
  if (pending.cycle_id !== cycle.cycle_id) {
    return [blocker(
      "pending-cycle-id-mismatch",
      `Pending action names cycle ${pending.cycle_id}, but active cycle is ${cycle.cycle_id}.`,
    )];
  }
  if (pending.cycle_revision !== cycle.revision) {
    return [blocker(
      "cycle-pending-revision-mismatch",
      `Pending action revision ${pending.cycle_revision} does not match active cycle revision ${cycle.revision}.`,
    )];
  }
  const position = cycle.recovery_position;
  if (pending.operation_id && position?.operation_id && pending.operation_id !== position.operation_id) {
    return [blocker(
      "cycle-operation-id-mismatch",
      `Pending operation ID ${pending.operation_id} does not match cycle operation ID ${position.operation_id}.`,
    )];
  }
  if (position?.operation && pending.operation !== position.operation) {
    return [blocker(
      "cycle-operation-mismatch",
      `Pending operation ${pending.operation} does not match cycle recovery operation ${position.operation}.`,
    )];
  }
  if (
    cycle.target_scope?.scope_id &&
    (pending.scope_id !== cycle.target_scope.scope_id ||
      (pending.scope_fingerprint && pending.scope_fingerprint !== cycle.target_scope.scope_fingerprint))
  ) {
    return [blocker(
      "cycle-pending-scope-mismatch",
      `Pending scope ${pending.scope_id ?? "null"}@${pending.scope_fingerprint ?? "unrecorded"} does not match active target ${cycle.target_scope.scope_id}@${cycle.target_scope.scope_fingerprint}.`,
    )];
  }
  return [];
}

export function coordinationBlockers(project, active, { allowOperationId = null } = {}) {
  const operation = project.manifest.cycle_operation;
  if (operation && operation.operation_id !== allowOperationId) {
    if (operation.cycle_id !== active?.value.cycle_id) {
      return [blocker(
        "cycle-operation-cycle-id-mismatch",
        `Interrupted operation ${operation.operation_id} names cycle ${operation.cycle_id}, which does not match active cycle ${active?.value.cycle_id ?? "null"}.`,
        operation,
      )];
    }
    if (![operation.expected_revision, operation.intended_revision].includes(active?.value.revision)) {
      return [blocker(
        "cycle-operation-revision-mismatch",
        `Interrupted operation ${operation.operation_id} allows revisions ${operation.expected_revision} or ${operation.intended_revision}, but active revision is ${active?.value.revision ?? "null"}.`,
        operation,
      )];
    }
    if (
      active?.value.revision === operation.intended_revision &&
      active.value.recovery_position?.operation_id &&
      active.value.recovery_position.operation_id !== operation.operation_id
    ) {
      return [blocker(
        "cycle-operation-id-mismatch",
        `Active operation ID ${active.value.recovery_position.operation_id} does not match interrupted operation ${operation.operation_id}.`,
        operation,
      )];
    }
    return [blocker(
      "cycle-reconciliation-required",
      `Interrupted ${operation.kind} ${operation.operation_id} stopped at cycle revision ${active?.value.revision ?? "null"}; diagnose and choose an explicit reconciliation direction.`,
      operation,
    )];
  }
  if (operation) return [];
  const recoveryPending = allowOperationId &&
    project.manifest.pending_action?.cycle_id === active?.value.cycle_id &&
    project.manifest.pending_action.operation_id === allowOperationId;
  const pending = recoveryPending ? [] : pendingBlockers(project.manifest, active);
  if (pending.length > 0) return pending;
  const reconciliation = active?.value.related_artifacts?.reconciliations?.at(-1) ?? null;
  const manifestReconciliation = project.manifest.manuscript_reconciliation ?? null;
  if (
    reconciliation &&
    (reconciliation.path !== manifestReconciliation?.path ||
      reconciliation.sha256 !== manifestReconciliation?.sha256 ||
      reconciliation.reconciliation_id !== manifestReconciliation?.reconciliation_id)
  ) {
    return [blocker(
      "cycle-manifest-reconciliation-mismatch",
      `Active reconciliation ${reconciliation.reconciliation_id} at ${reconciliation.path}@${reconciliation.sha256} does not match manifest ${manifestReconciliation?.reconciliation_id ?? "null"} at ${manifestReconciliation?.path ?? "null"}@${manifestReconciliation?.sha256 ?? "null"}.`,
      {
        operation_id: reconciliation.reconciliation_id,
        cycle_id: active.value.cycle_id,
        expected_revision: active.value.revision - 1,
        intended_revision: active.value.revision,
        kind: "manuscript-reconciliation",
      },
    )];
  }
  return [];
}

export async function runCheckpoint(options, point) {
  if (typeof options.checkpoint === "function") await options.checkpoint(point);
}

function timestamp(options) {
  return utcTimestamp(options);
}

async function writeManifest(project, manifest) {
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Coordinated manifest is invalid: ${validation.errors.map((error) => error.message).join("; ")}`);
  }
  await writeAtomicVerified(project.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  project.manifest = manifest;
}

export async function beginCycleOperation(project, active, definition, options = {}) {
  const existing = project.manifest.cycle_operation;
  if (existing) {
    if (
      options.recoveryOperationId === definition.operationId &&
      existing.operation_id === definition.operationId &&
      existing.kind === definition.kind &&
      existing.cycle_id === active.value.cycle_id &&
      existing.expected_revision === active.value.revision &&
      existing.intended_revision === active.value.revision + 1 &&
      (existing.artifact_id ?? null) === (definition.artifactId ?? null)
    ) {
      return existing;
    }
    throw new Error(`Cannot begin ${definition.operationId} while ${existing.operation_id} awaits reconciliation`);
  }
  const operation = {
    kind: definition.kind,
    operation_id: definition.operationId,
    cycle_id: active.value.cycle_id,
    expected_revision: active.value.revision,
    intended_revision: active.value.revision + 1,
    ...(definition.artifactId ? { artifact_id: definition.artifactId } : {}),
    created_at: timestamp(options),
  };
  await writeManifest(project, {
    ...project.manifest,
    cycle_operation: operation,
    updated_at: operation.created_at,
  });
  await runCheckpoint(options, "manifest-written");
  return operation;
}

export async function finishCycleOperation(project, cycle, operationId, options = {}) {
  const operation = project.manifest.cycle_operation;
  if (
    (!operation && !options.allowMissingOperation) ||
    (operation && (
      operation.operation_id !== operationId ||
      operation.cycle_id !== cycle.cycle_id ||
      operation.intended_revision !== cycle.revision
    ))
  ) {
    throw new Error(`Cannot finish unrecorded cycle operation ${operationId} at revision ${cycle.revision}`);
  }
  const { cycle_operation: removed, ...withoutOperation } = project.manifest;
  let pending = project.manifest.pending_action;
  if (pending?.cycle_id === cycle.cycle_id) {
    if (options.complete) {
      pending = null;
    } else {
      pending = {
        ...pending,
        operation: cycle.recovery_position?.operation ?? pending.operation,
        cycle_revision: cycle.revision,
        operation_id: cycle.recovery_position?.operation_id ?? operationId,
        updated_at: timestamp(options),
      };
      if (cycle.target_scope) {
        pending.scope_id = cycle.target_scope.scope_id;
        pending.scope_fingerprint = cycle.target_scope.scope_fingerprint;
      } else {
        delete pending.scope_id;
        delete pending.scope_fingerprint;
      }
    }
  }
  const manifest = {
    ...withoutOperation,
    ...(options.manifestChanges ?? {}),
    ...(pending ? { pending_action: pending } : {}),
    updated_at: options.completedAt ?? cycle.updated_at ?? timestamp(options),
  };
  if (!pending) delete manifest.pending_action;
  for (const field of options.removeManifestFields ?? []) delete manifest[field];
  await writeManifest(project, manifest);
  await runCheckpoint(options, "manifest-updated");
  return manifest;
}

export async function discardCycleOperation(project, operationId, options = {}) {
  const operation = project.manifest.cycle_operation;
  if (!operation || operation.operation_id !== operationId) {
    throw new Error(`Cannot discard unrecorded cycle operation ${operationId}`);
  }
  const { cycle_operation: removed, ...manifest } = project.manifest;
  manifest.updated_at = timestamp(options);
  await writeManifest(project, manifest);
  return manifest;
}


export async function completedPointerBlocker(project) {
  const pointer = project.manifest.last_completed_cycle;
  if (!pointer) return null;
  const expectedPath = path.posix.join(
    project.manifest.paths.convergence,
    "cycles",
    `${pointer.cycle_id}.json`,
  );
  if (pointer.path !== expectedPath) {
    return {
      ...blocker(
        "cycle-completed-pointer-path-mismatch",
        `Completed-cycle pointer path ${pointer.path} must be ${expectedPath}.`,
        {
          kind: "completion",
          operation_id: pointer.cycle_id,
          cycle_id: pointer.cycle_id,
          expected_revision: pointer.revision - 1,
          intended_revision: pointer.revision,
        },
      ),
      path: pointer.path,
      expected_path: expectedPath,
    };
  }
  let text;
  try {
    text = await readFile(path.resolve(project.root, pointer.path), "utf8");
  } catch (error) {
    return {
      ...blocker(
        "cycle-completed-pointer-unavailable",
        `Cannot read completed cycle ${pointer.cycle_id} at ${pointer.path}: ${error.message}`,
        {
          kind: "completion",
          operation_id: pointer.cycle_id,
          cycle_id: pointer.cycle_id,
          expected_revision: pointer.revision - 1,
          intended_revision: pointer.revision,
        },
      ),
      path: pointer.path,
    };
  }
  const actualHash = sha256Bytes(text);
  if (actualHash !== pointer.sha256) {
    return {
      ...blocker(
        "cycle-completed-pointer-hash-mismatch",
        `Completed cycle at ${pointer.path} has SHA-256 ${actualHash}, expected ${pointer.sha256}.`,
        {
          kind: "completion",
          operation_id: pointer.cycle_id,
          cycle_id: pointer.cycle_id,
          expected_revision: pointer.revision - 1,
          intended_revision: pointer.revision,
        },
      ),
      path: pointer.path,
      expected_sha256: pointer.sha256,
      actual_sha256: actualHash,
    };
  }
  const completed = JSON.parse(text);
  if (
    completed.status !== "completed" ||
    completed.cycle_id !== pointer.cycle_id ||
    completed.revision !== pointer.revision
  ) {
    return {
      ...blocker(
        "cycle-completed-pointer-identity-mismatch",
        `Completed cycle at ${pointer.path} does not match ${pointer.cycle_id} revision ${pointer.revision}.`,
        {
          kind: "completion",
          operation_id: pointer.cycle_id,
          cycle_id: pointer.cycle_id,
          expected_revision: pointer.revision - 1,
          intended_revision: pointer.revision,
        },
      ),
      path: pointer.path,
    };
  }
  return null;
}
