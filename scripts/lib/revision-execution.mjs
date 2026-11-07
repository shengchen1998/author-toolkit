import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateBackupIndex } from "./backup.mjs";
import { externalReconciliationBlock } from "./cycles.mjs";
import {
  beginCycleOperation,
  completedPointerBlocker,
  coordinationBlockers,
  finishCycleOperation,
  runCheckpoint,
} from "./cycle-coordination.mjs";
import { validateManifest } from "./manifest.mjs";
import {
  validateConvergenceCycleSchema,
  validateNoEditSkipSchema,
  validateRequestedPassSchema,
  validateRevisionExecutionSchema,
  validateScopeSnapshotSchema,
} from "./schemas.mjs";
import { diffManuscriptInventories, validateFullManuscriptScope } from "./scope.mjs";
import {
  acquireDirectoryLock,
  createNoClobberVerified,
  releaseDirectoryLock,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";
import { parseTrackerState } from "./tracker.mjs";
import { utcTimestamp } from "./time.mjs";

function executionError(instancePath, message, keyword = "revision-execution") {
  return { instancePath, keyword, message, params: {} };
}

function sameReference(left, right) {
  return left?.path === right?.path && left?.sha256 === right?.sha256;
}

function samePassReference(left, right) {
  return sameReference(left, right) &&
    left?.pass_id === right?.pass_id &&
    left?.pass_fingerprint === right?.pass_fingerprint;
}

function sameScopeReference(left, right) {
  return left?.scope_id === right?.scope_id &&
    left?.scope_fingerprint === right?.scope_fingerprint &&
    left?.snapshot_path === right?.snapshot_path &&
    left?.snapshot_sha256 === right?.snapshot_sha256;
}

function scopeArtifact(reference) {
  return { path: reference.snapshot_path, sha256: reference.snapshot_sha256 };
}

function pathWithin(root, candidate) {
  const base = root.replace(/\/+$/, "");
  return base === "." || candidate === base || candidate.startsWith(`${base}/`);
}

function formatErrors(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

export function validateRevisionExecution(value, options = {}) {
  const schema = validateRevisionExecutionSchema(value, options);
  const errors = [...schema.errors];
  const files = new Set();
  for (const [index, file] of (value?.files ?? []).entries()) {
    if (files.has(file.path)) {
      errors.push(executionError(`/files/${index}/path`, `duplicate execution path: ${file.path}`));
    }
    files.add(file.path);
    if (file.action === "create" && file.input_sha256 !== null) {
      errors.push(executionError(`/files/${index}/input_sha256`, "create requires a null input hash"));
    }
    if (file.action !== "create" && file.input_sha256 === null) {
      errors.push(executionError(`/files/${index}/input_sha256`, `${file.action} requires an input hash`));
    }
    if (file.action === "delete" && file.output_sha256 !== null) {
      errors.push(executionError(`/files/${index}/output_sha256`, "delete requires a null output hash"));
    }
    if (file.action !== "delete" && file.output_sha256 === null) {
      errors.push(executionError(`/files/${index}/output_sha256`, `${file.action} requires an output hash`));
    }
    if (file.action === "modify" && file.input_sha256 === file.output_sha256) {
      errors.push(executionError(`/files/${index}/output_sha256`, "modify must change manuscript content"));
    }
  }
  const findingIds = new Set();
  for (const [index, finding] of (value?.finding_dispositions ?? []).entries()) {
    if (findingIds.has(finding.finding_id)) {
      errors.push(executionError(
        `/finding_dispositions/${index}/finding_id`,
        `duplicate finding disposition: ${finding.finding_id}`,
      ));
    }
    findingIds.add(finding.finding_id);
  }
  const backupIds = new Set();
  for (const [index, backup] of (value?.backups ?? []).entries()) {
    if (backupIds.has(backup.backup_id)) {
      errors.push(executionError(`/backups/${index}/backup_id`, `duplicate backup: ${backup.backup_id}`));
    }
    backupIds.add(backup.backup_id);
  }
  for (const file of value?.files ?? []) {
    if (file.action === "create") continue;
    const covered = (value?.backups ?? []).some((backup) =>
      backup.files.some((candidate) => candidate.path === file.path)
    );
    if (!covered) {
      errors.push(executionError("/backups", `${file.action} requires a backup for ${file.path}`));
    }
  }
  return { valid: errors.length === 0, errors };
}

async function readProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const validation = validateManifest(manifest);
  if (!validation.valid) throw new Error(formatErrors(validation.errors));
  if (manifest.schema_version !== "3.2.0") {
    throw new Error("Revision execution requires a v3.2 project");
  }
  return { root, manifestPath, manifest };
}

async function readActiveCycle(project) {
  const file = path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.json");
  const value = JSON.parse(await readFile(file, "utf8"));
  const validation = validateConvergenceCycleSchema(value);
  if (!validation.valid || value.status !== "active") {
    throw new Error(`Living cycle is invalid: ${formatErrors(validation.errors)}`);
  }
  return { value, file };
}

async function readVerifiedArtifact(project, reference) {
  const contents = await readFile(path.resolve(project.root, reference.path));
  if (sha256Bytes(contents) !== reference.sha256) {
    throw new Error(`Referenced artifact hash does not match: ${reference.path}`);
  }
  return contents;
}

async function readCurrentScope(project, reference) {
  const contents = await readVerifiedArtifact(project, scopeArtifact(reference));
  const snapshot = JSON.parse(contents.toString("utf8"));
  const validation = validateScopeSnapshotSchema(snapshot);
  if (!validation.valid) throw new Error(formatErrors(validation.errors));
  if (
    snapshot.scope_id !== reference.scope_id ||
    snapshot.scope_fingerprint !== reference.scope_fingerprint
  ) {
    throw new Error("Scope snapshot identity differs from its reference");
  }
  return snapshot;
}

async function readCurrentPass(project, reference) {
  const contents = await readVerifiedArtifact(project, reference);
  const pass = JSON.parse(contents.toString("utf8"));
  const validation = validateRequestedPassSchema(pass);
  if (!validation.valid) throw new Error(formatErrors(validation.errors));
  if (
    pass.pass_id !== reference.pass_id ||
    pass.pass_fingerprint !== reference.pass_fingerprint
  ) {
    throw new Error("Requested-pass identity differs from its reference");
  }
  return pass;
}

function contextError(code, message, pathValue = null, artifactId = null) {
  return {
    code,
    message,
    ...(pathValue ? { path: pathValue } : {}),
    ...(artifactId ? { artifact_id: artifactId } : {}),
  };
}

export function revisionApprovalFingerprint(execution, operation) {
  return sha256Bytes(JSON.stringify({
    operation,
    plan: {
      plan_id: execution.plan.plan_id,
      path: execution.plan.path,
      sha256: execution.plan.sha256,
    },
    batch: {
      batch_id: execution.batch.batch_id,
      path: execution.batch.path,
      sha256: execution.batch.sha256,
    },
    input_scope: {
      scope_id: execution.input_scope.scope_id,
      scope_fingerprint: execution.input_scope.scope_fingerprint,
    },
    files: execution.files.map(({ path: filePath, action, input_sha256, output_sha256 }) => ({
      path: filePath,
      action,
      input_sha256,
      output_sha256,
    })),
  }));
}

function revisionApprovalBindingMatches(approval, execution, operation) {
  const expected = new Map([
    ["plan_id", execution.plan.plan_id],
    ["plan_sha256", execution.plan.sha256],
    ["batch_id", execution.batch.batch_id],
    ["batch_sha256", execution.batch.sha256],
    ["scope_fingerprint", execution.input_scope.scope_fingerprint],
    ["revision_approval", revisionApprovalFingerprint(execution, operation)],
  ]);
  const tokens = String(approval.reason ?? "").split(/\s+/).filter(Boolean);
  return [...expected].every(([token, value]) =>
    tokens.filter((candidate) => candidate.startsWith(`${token}=`)).length === 1 &&
    tokens.includes(`${token}=${value}`)
  );
}

async function validateExecutionContext(project, execution, options = {}) {
  const errors = [];
  const structural = validateRevisionExecution(execution);
  if (!structural.valid) return { valid: false, errors: structural.errors.map((error) =>
    contextError("revision-execution-contract-invalid", error.message)
  ) };
  try {
    await readVerifiedArtifact(project, execution.plan);
    await readVerifiedArtifact(project, execution.batch);
    const pass = await readCurrentPass(project, execution.requested_pass);
    const inputScope = await readCurrentScope(project, execution.input_scope);
    const targetScope = await readCurrentScope(project, execution.target_scope);
    if (!sameScopeReference(pass.target_scope, execution.target_scope)) {
      errors.push(contextError(
        "revision-pass-target-mismatch",
        "The execution requested pass must name its target scope.",
      ));
    }
    if (options.expectedPass && !samePassReference(execution.requested_pass, options.expectedPass)) {
      errors.push(contextError("revision-pass-mismatch", "The execution pass differs from the active requested pass."));
    }
    if (options.expectedScope && !sameScopeReference(execution.target_scope, options.expectedScope)) {
      errors.push(contextError("revision-target-mismatch", "The execution target differs from the active target scope."));
    }
    if (options.requireCurrentTarget) {
      if (!sameScopeReference(execution.target_scope, project.manifest.current_scope)) {
        errors.push(contextError(
          "revision-target-mismatch",
          "The verified execution target is not manifest current_scope.",
        ));
      }
      const full = await validateFullManuscriptScope(project.manifest, project.manifestPath);
      if (!full.valid) {
        errors.push(contextError(
          "revision-target-not-current",
          `The execution target is not a current full-manuscript scope: ${formatErrors(full.errors)}`,
        ));
      }
    }

    if (options.requireCurrentDecisions !== false) {
      const trackerText = await readFile(path.resolve(project.root, project.manifest.paths.audit_tracker), "utf8");
      const tracker = await parseTrackerState(trackerText, project.root);
      if (!tracker.valid) {
        errors.push(contextError("revision-tracker-invalid", formatErrors(tracker.errors)));
      }
      const approvalById = new Map(tracker.approvals.map((approval) => [approval.id, approval]));
      const allPaths = execution.files.map((file) => file.path);
      for (const approvalId of execution.approval_ids) {
        const approval = approvalById.get(approvalId);
        if (
          !approval ||
          approval.status !== "approved" ||
          approval.type !== "edit" ||
          approval.operation !== "chapter-revision" ||
          approval.scopeId !== execution.input_scope.scope_id ||
          JSON.stringify(approval.paths) !== JSON.stringify(allPaths) ||
          !revisionApprovalBindingMatches(approval, execution, "chapter-revision")
        ) {
          errors.push(contextError(
            "revision-approval-mismatch",
            `Edit approval ${approvalId} does not authorize the exact plan, batch, input scope fingerprint, ordered paths, actions, input hashes, and approved outputs.`,
            null,
            approvalId,
          ));
        }
      }
      const planDecisions = execution.author_decision_ids
        .map((decisionId) => approvalById.get(decisionId))
        .filter((decision) => decision?.type === "revision-plan");
      if (planDecisions.length !== 1) {
        errors.push(contextError(
          "revision-author-decision-missing",
          "The execution requires exactly one revision-plan author decision.",
        ));
      } else {
        const decision = planDecisions[0];
        if (
          decision.status !== "approved" ||
          decision.operation !== "revision-plan" ||
          decision.scopeId !== execution.input_scope.scope_id ||
          JSON.stringify(decision.paths) !== JSON.stringify(allPaths) ||
          !revisionApprovalBindingMatches(decision, execution, "revision-plan")
        ) {
          errors.push(contextError(
            "revision-author-decision-missing",
            `Plan decision ${decision.id} does not authorize the exact plan, batch, operation, input scope fingerprint, ordered paths, actions, input hashes, and approved outputs.`,
            null,
            decision.id,
          ));
        }
      }
      const decisionIds = new Set([
        ...execution.author_decision_ids,
        ...execution.finding_dispositions.map((finding) => finding.author_decision_id),
      ]);
      for (const decisionId of decisionIds) {
        const decision = approvalById.get(decisionId);
        if (decision?.type === "revision-plan") continue;
        if (
          !decision ||
          decision.status !== "approved" ||
          ![execution.input_scope.scope_id, execution.target_scope.scope_id].includes(decision.scopeId) ||
          !allPaths.every((filePath) => decision.paths.includes(filePath))
        ) {
          errors.push(contextError(
            "revision-author-decision-missing",
            `Author decision ${decisionId} is not approved for the exact execution scope and paths.`,
            null,
            decisionId,
          ));
        }
      }
      for (const finding of execution.finding_dispositions) {
        const tracked = tracker.findings.find((candidate) => candidate.id === finding.finding_id);
        const expectedStatus = {
          execute: "resolved",
          defer: "deferred",
          dismiss: "dismissed",
        }[finding.disposition];
        const pendingDecision = options.pendingFindingDecision?.findingId === finding.finding_id &&
          options.pendingFindingDecision.status === expectedStatus &&
          tracked?.status === "open";
        if (tracked && finding.disposition !== "execute" && tracked.status !== expectedStatus && !pendingDecision) {
          errors.push(contextError(
            "revision-finding-disposition-mismatch",
            `Finding ${finding.finding_id} is ${tracked.status}, not ${expectedStatus}.`,
            null,
            finding.finding_id,
          ));
        }
        if (tracked && finding.disposition === "execute" && !["open", "resolved"].includes(tracked.status)) {
          errors.push(contextError(
            "revision-finding-disposition-mismatch",
            `Finding ${finding.finding_id} cannot use verified execution while ${tracked.status}.`,
            null,
            finding.finding_id,
          ));
        }
      }
    }

    const backupIndexPath = path.resolve(project.root, project.manifest.paths.backups, "index.json");
    let backupIndex = null;
    try {
      backupIndex = JSON.parse(await readFile(backupIndexPath, "utf8"));
      const indexValidation = await validateBackupIndex(project.root, backupIndex);
      if (!indexValidation.valid) {
        errors.push(contextError(
          "revision-backup-invalid",
          `Backup index is invalid: ${formatErrors(indexValidation.errors)}`,
          backupIndexPath,
        ));
      }
    } catch (error) {
      errors.push(contextError("revision-backup-invalid", `Cannot read backup index: ${error.message}`, backupIndexPath));
    }

    const backupsByPath = new Map();
    for (const backup of execution.backups) {
      const indexedBackup = backupIndex?.backups.find((entry) => entry.backup_id === backup.backup_id);
      if (
        !indexedBackup ||
        indexedBackup.approval_id !== backup.approval_id ||
        indexedBackup.operation !== "chapter-revision" ||
        indexedBackup.scope_id !== execution.input_scope.scope_id ||
        indexedBackup.scope_fingerprint !== execution.input_scope.scope_fingerprint ||
        !sameReference(indexedBackup.manifest, backup.manifest)
      ) {
        errors.push(contextError(
          "revision-backup-invalid",
          `Backup ${backup.backup_id} is not the same indexed backup evidence required by this execution.`,
          backup.manifest.path,
          backup.backup_id,
        ));
      }
      if (!execution.approval_ids.includes(backup.approval_id)) {
        errors.push(contextError(
          "revision-backup-approval-mismatch",
          `Backup ${backup.backup_id} does not name an edit approval for this execution.`,
          null,
          backup.backup_id,
        ));
      }
      if (!pathWithin(project.manifest.paths.backups, backup.manifest.path)) {
        errors.push(contextError(
          "revision-backup-invalid",
          `Backup manifest is outside registered paths.backups: ${backup.manifest.path}.`,
          backup.manifest.path,
          backup.backup_id,
        ));
      }
      try {
        const contents = await readVerifiedArtifact(project, backup.manifest);
        const manifest = JSON.parse(contents.toString("utf8"));
        if (
          manifest.backup_id !== backup.backup_id ||
          manifest.operation !== "chapter-revision" ||
          manifest.approval_id !== backup.approval_id ||
          manifest.scope_id !== execution.input_scope.scope_id ||
          manifest.scope_fingerprint !== execution.input_scope.scope_fingerprint
        ) {
          errors.push(contextError(
            "revision-backup-invalid",
            `Backup manifest ${backup.manifest.path} does not bind the recorded backup, operation, approval, and input scope.`,
            backup.manifest.path,
            backup.backup_id,
          ));
        }
        const manifestBackupFiles = (manifest.files ?? [])
          .filter((file) => file.action !== "create")
          .map((file) => ({
            path: file.path,
            backup_path: file.backup_path,
            sha256: file.input_sha256,
          }));
        if (JSON.stringify(manifestBackupFiles) !== JSON.stringify(backup.files)) {
          errors.push(contextError(
            "revision-backup-invalid",
            `Execution backup files differ from the indexed manifest for ${backup.backup_id}.`,
            backup.manifest.path,
            backup.backup_id,
          ));
        }
        for (const manifestFile of manifest.files ?? []) {
          const executionFile = execution.files.find((file) => file.path === manifestFile.path);
          if (
            !executionFile ||
            executionFile.action !== manifestFile.action ||
            executionFile.input_sha256 !== manifestFile.input_sha256 ||
            executionFile.output_sha256 !== manifestFile.output_sha256
          ) {
            errors.push(contextError(
              "revision-backup-invalid",
              `Indexed backup action ${manifestFile.path} is not part of the exact approved execution.`,
              manifestFile.path,
              backup.backup_id,
            ));
          }
        }
      } catch (error) {
        errors.push(contextError("revision-backup-invalid", error.message, backup.manifest.path, backup.backup_id));
      }
      for (const file of backup.files) {
        if (backupsByPath.has(file.path)) {
          errors.push(contextError("revision-backup-invalid", `Duplicate backup content for ${file.path}.`, file.path));
        }
        backupsByPath.set(file.path, file);
        if (!pathWithin(project.manifest.paths.backups, file.backup_path)) {
          errors.push(contextError(
            "revision-backup-invalid",
            `Backup content is outside registered paths.backups: ${file.backup_path}.`,
            file.backup_path,
          ));
        }
        try {
          const contents = await readFile(path.resolve(project.root, file.backup_path));
          if (sha256Bytes(contents) !== file.sha256) {
            errors.push(contextError("revision-backup-invalid", `Backup content hash differs for ${file.path}.`, file.backup_path));
          }
        } catch (error) {
          errors.push(contextError("revision-backup-invalid", error.message, file.backup_path));
        }
      }
    }

    const outputByPath = new Map(targetScope.files.map((file) => [file.path, file.sha256]));
    for (const file of execution.files) {
      const input = inputScope.files.find((candidate) => candidate.path === file.path);
      if (file.action === "create") {
        if (input) errors.push(contextError("revision-input-mismatch", `Create target already exists in the input scope: ${file.path}.`, file.path));
      } else if (input?.sha256 !== file.input_sha256) {
        errors.push(contextError("revision-input-mismatch", `Input scope hash differs for ${file.path}.`, file.path));
      }
      if (file.action !== "create") {
        const backup = backupsByPath.get(file.path);
        if (backup?.sha256 !== file.input_sha256) {
          errors.push(contextError("revision-backup-invalid", `Backup does not preserve input ${file.path}@${file.input_sha256}.`, file.path));
        }
      }
      if (execution.status === "verified") {
        if (file.action === "delete") {
          if (outputByPath.has(file.path)) {
            errors.push(contextError("revision-target-diff-mismatch", `Deleted path remains in the target scope: ${file.path}.`, file.path));
          }
        } else if (outputByPath.get(file.path) !== file.output_sha256) {
          errors.push(contextError("revision-target-diff-mismatch", `Target scope does not contain approved output ${file.path}@${file.output_sha256}.`, file.path));
        }
      }

      try {
        const contents = await readFile(path.resolve(project.root, file.path));
        const currentHash = sha256Bytes(contents);
        if (options.requireInputs && file.action !== "create" && currentHash !== file.input_sha256) {
          errors.push(contextError("revision-input-mismatch", `Current manuscript input changed for ${file.path}.`, file.path));
        }
        if (options.requireInputs && file.action === "create") {
          errors.push(contextError("revision-input-mismatch", `Create target is not absent: ${file.path}.`, file.path));
        }
        if (options.requireOutputs) {
          if (file.action === "delete") {
            errors.push(contextError("revision-output-mismatch", `Deleted output still exists: ${file.path}.`, file.path));
          } else if (currentHash !== file.output_sha256) {
            errors.push(contextError("revision-output-mismatch", `Current output hash differs for ${file.path}.`, file.path));
          }
        }
      } catch (error) {
        if (error.code === "ENOENT") {
          if (options.requireInputs && file.action !== "create") {
            errors.push(contextError("revision-input-mismatch", `Input manuscript is unavailable: ${file.path}.`, file.path));
          }
          if (options.requireOutputs && file.action !== "delete") {
            errors.push(contextError("revision-output-mismatch", `Output manuscript is unavailable: ${file.path}.`, file.path));
          }
        } else {
          errors.push(contextError("revision-manuscript-unreadable", error.message, file.path));
        }
      }
    }

    if (execution.status === "verified") {
      const expectedActions = new Map();
      const targetChanges = diffManuscriptInventories(inputScope, targetScope);
      for (const file of targetChanges.created) expectedActions.set(file.path, "create");
      for (const file of targetChanges.modified) expectedActions.set(file.path, "modify");
      for (const file of targetChanges.deleted) expectedActions.set(file.path, "delete");
      for (const file of targetChanges.reordered) {
        if (!expectedActions.has(file.path)) expectedActions.set(file.path, "reorder");
      }
      for (const [filePath, action] of expectedActions) {
        const actual = execution.files.find((file) => file.path === filePath);
        if (!actual || actual.action !== action) {
          errors.push(contextError(
            "revision-target-diff-mismatch",
            `Target change ${filePath} (${action}) is not the recorded approved action.`,
            filePath,
          ));
        }
      }
      for (const file of execution.files) {
        if (!expectedActions.has(file.path) && file.action !== "reorder") {
          errors.push(contextError(
            "revision-target-diff-mismatch",
            `Execution records a change absent from the verified target: ${file.path}.`,
            file.path,
          ));
        }
      }
    }
  } catch (error) {
    errors.push(contextError("revision-artifact-mismatch", error.message));
  }
  return { valid: errors.length === 0, errors };
}

export async function validateRevisionExecutionAgainstDisk(projectRoot, execution, options = {}) {
  const project = await readProject(projectRoot);
  return validateExecutionContext(project, execution, {
    requireOutputs: execution.status === "verified",
    requireCurrentTarget: execution.status === "verified",
    ...options,
  });
}

function operationTime(options) {
  return utcTimestamp(options);
}

function executionReference(execution, relativePath, text) {
  return {
    execution_id: execution.execution_id,
    path: relativePath,
    sha256: sha256Bytes(text),
  };
}

function requiredAction(cycle) {
  const position = cycle?.recovery_position;
  return position ? {
    strategy: position.required_strategy,
    operation: position.operation,
    command: position.required_strategy,
  } : null;
}

function failure(code, message, cycle, errors = []) {
  return {
    valid: false,
    cycle,
    execution: null,
    state_written: false,
    blockers: [{
      code,
      message: errors.length > 0 ? `${message} ${errors.map((error) => error.message).join(" ")}` : message,
      required_action: requiredAction(cycle),
    }],
  };
}

function coordinationFailure(project, active, options = {}) {
  const blockers = coordinationBlockers(project, active, options);
  if (blockers.length === 0) return null;
  return {
    valid: false,
    cycle: active?.value ?? null,
    execution: null,
    state_written: false,
    blockers,
    required_action: blockers[0].required_action,
  };
}

function checkCycleRequest(cycle, request) {
  if (cycle.cycle_id !== request.cycle_id) {
    return failure("cycle-id-mismatch", `The requested cycle does not match active cycle ${cycle.cycle_id}.`, cycle);
  }
  if (cycle.revision !== request.expected_revision) {
    return failure(
      "cycle-revision-conflict",
      `Expected cycle revision ${request.expected_revision}, but the active revision is ${cycle.revision}.`,
      cycle,
    );
  }
  return null;
}

async function withCycleLock(project, options, operation) {
  const lock = await acquireDirectoryLock(
    path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
      now: options.now,
    },
  );
  if (!lock.acquired) {
    return failure(
      lock.code === "timeout" ? "cycle-transition-lock-timeout" : "cycle-transition-lock-error",
      `Cannot coordinate revision execution at ${lock.directory}: ${lock.error.message}`,
      null,
    );
  }
  let value;
  let operationError;
  try {
    const pointer = await completedPointerBlocker(project);
    value = pointer
      ? {
          ...failure(pointer.code, pointer.message, null),
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
      ...failure(
        "cycle-transition-lock-release-error",
        `Cannot release revision execution lock ${lock.directory}: ${released.error.message}.${operationError ? ` Operation also failed: ${operationError.message}` : ""}`,
        value?.cycle ?? null,
      ),
      state_written: value?.state_written ?? null,
    };
  }
  if (operationError) throw operationError;
  return value;
}

function validatePrepareRequest(request, { independent = false } = {}) {
  const operation = independent ? "prepare-draft-revision-execution" : "prepare-revision-execution";
  const allowed = new Set([
    "execution_id",
    "plan",
    "batch",
    "requested_pass",
    "input_scope",
    "finding_dispositions",
    "author_decision_ids",
    "approval_ids",
    "backups",
    "files",
    ...(independent ? [] : ["cycle_id", "expected_revision"]),
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${operation} input field: ${key}`);
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.execution_id ?? "") ||
    (!independent && !Number.isInteger(request.expected_revision)) ||
    !Array.isArray(request.files)
  ) {
    throw new Error(`${operation} requires exact ${independent ? "independent" : "cycle"}, execution, and file batch identities`);
  }
}

async function readOptionalActiveCycle(project) {
  try {
    return await readActiveCycle(project);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function independentCycleFailure(active) {
  return active
    ? failure(
        "active-cycle-exists",
        `Cycle ${active.value.cycle_id} is active; use its cycle-bound revision execution operations instead of the independent draft path.`,
        active.value,
      )
    : null;
}

export async function prepareDraftRevisionExecution(projectRoot, request, options = {}) {
  validatePrepareRequest(request, { independent: true });
  const project = await readProject(projectRoot);
  return withCycleLock(project, options, async () => {
    const initial = await readOptionalActiveCycle(project);
    const activeFailure = independentCycleFailure(initial);
    if (activeFailure) return activeFailure;
    const currentScope = project.manifest.current_scope;
    const external = await externalReconciliationBlock(
      project,
      currentScope ? {
        scope_id: currentScope.scope_id,
        scope_fingerprint: currentScope.scope_fingerprint,
        snapshot_path: currentScope.snapshot_path,
        snapshot_sha256: currentScope.snapshot_sha256,
      } : null,
    );
    if (external) return external;
    const createdAt = operationTime(options);
    const execution = {
      schema_version: "1.0.0",
      execution_id: request.execution_id,
      cycle_id: null,
      plan: request.plan,
      batch: request.batch,
      requested_pass: request.requested_pass,
      input_scope: request.input_scope,
      target_scope: request.input_scope,
      finding_dispositions: request.finding_dispositions,
      author_decision_ids: request.author_decision_ids,
      approval_ids: request.approval_ids,
      backups: request.backups,
      files: request.files,
      status: "prepared",
      created_at: createdAt,
      verified_at: null,
    };
    const validation = await validateExecutionContext(project, execution, {
      requireInputs: true,
      requireCurrentTarget: true,
      expectedPass: request.requested_pass,
      expectedScope: request.input_scope,
    });
    if (!validation.valid) {
      return failure("revision-execution-preparation-invalid", "The approved independent batch, backups, decisions, or current inputs do not validate.", null, validation.errors);
    }
    const concurrent = await readOptionalActiveCycle(project);
    const concurrentFailure = independentCycleFailure(concurrent);
    if (concurrentFailure) return concurrentFailure;
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "executions",
      `${execution.execution_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    const text = `${JSON.stringify(execution, null, 2)}\n`;
    try {
      await createNoClobberVerified(absolute, text);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      return failure("revision-execution-already-exists", `Independent revision execution ${execution.execution_id} already exists; prepare a new execution ID instead of replacing it.`, null);
    }
    await runCheckpoint(options, "execution-written");
    return {
      valid: true,
      cycle: null,
      execution,
      execution_path: absolute,
      execution_reference: executionReference(execution, relative, text),
      state_written: true,
      blockers: [],
    };
  });
}

export async function prepareRevisionExecution(projectRoot, request, options = {}) {
  validatePrepareRequest(request);
  const project = await readProject(projectRoot);
  return withCycleLock(project, options, async () => {
    const active = await readActiveCycle(project);
    const cycle = active.value;
    const cycleFailure = checkCycleRequest(cycle, request);
    if (cycleFailure) return cycleFailure;
    const coordination = coordinationFailure(project, active, {
      allowOperationId: options.recoveryOperationId ?? null,
    });
    if (coordination) return coordination;
    const external = await externalReconciliationBlock(
      project,
      cycle.target_scope ?? cycle.starting_scope,
      cycle,
    );
    if (external) return external;
    if (cycle.recovery_position.operation !== "chapter-revision") {
      return failure("cycle-operation-mismatch", "Revision preparation requires the active chapter-revision recovery position.", cycle);
    }
    if (!sameScopeReference(cycle.target_scope, request.input_scope)) {
      return failure("revision-input-scope-mismatch", "The execution input must be the active full-manuscript target before editing.", cycle);
    }
    if (!samePassReference(cycle.requested_pass, request.requested_pass)) {
      return failure("revision-pass-mismatch", "The execution must name the active requested pass.", cycle);
    }
    const createdAt = operationTime(options);
    let execution = {
      schema_version: "1.0.0",
      execution_id: request.execution_id,
      cycle_id: request.cycle_id,
      plan: request.plan,
      batch: request.batch,
      requested_pass: request.requested_pass,
      input_scope: request.input_scope,
      target_scope: request.input_scope,
      finding_dispositions: request.finding_dispositions,
      author_decision_ids: request.author_decision_ids,
      approval_ids: request.approval_ids,
      backups: request.backups,
      files: request.files,
      status: "prepared",
      created_at: createdAt,
      verified_at: null,
    };
    const validation = await validateExecutionContext(project, execution, {
      requireInputs: true,
      requireCurrentTarget: true,
      expectedPass: cycle.requested_pass,
      expectedScope: cycle.target_scope,
    });
    if (!validation.valid) {
      return failure("revision-execution-preparation-invalid", "The approved batch, backups, decisions, or current inputs do not validate.", cycle, validation.errors);
    }
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "executions",
      `${execution.execution_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    if (options.recoveryOperationId !== execution.execution_id) {
      try {
        await readFile(absolute, "utf8");
        return failure("revision-execution-already-exists", `Revision execution ${execution.execution_id} already exists; reconcile it explicitly instead of replacing it.`, cycle);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await beginCycleOperation(project, active, {
      kind: "revision-preparation",
      operationId: execution.execution_id,
      artifactId: execution.execution_id,
    }, options);
    let text = `${JSON.stringify(execution, null, 2)}\n`;
    try {
      await createNoClobberVerified(absolute, text);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (options.recoveryOperationId !== execution.execution_id) {
        return failure("revision-execution-already-exists", `Revision execution ${execution.execution_id} already exists; reconcile it explicitly instead of replacing it.`, cycle);
      }
      const existingText = await readFile(absolute, "utf8");
      const existing = JSON.parse(existingText);
      const expected = { ...execution, created_at: existing.created_at };
      if (JSON.stringify(expected) !== JSON.stringify(existing)) {
        return failure("revision-execution-identity-mismatch", "The stored prepared execution differs from the interrupted operation.", cycle);
      }
      execution = existing;
      text = existingText;
    }
    await runCheckpoint(options, "execution-written");
    const reference = executionReference(execution, relative, text);
    const updated = {
      ...cycle,
      revision: cycle.revision + 1,
      related_artifacts: {
        ...cycle.related_artifacts,
        plans: cycle.related_artifacts.plans.some((plan) => plan.plan_id === execution.plan.plan_id)
          ? cycle.related_artifacts.plans
          : [...cycle.related_artifacts.plans, execution.plan],
        revision_executions: [...cycle.related_artifacts.revision_executions, reference],
      },
      recovery_position: {
        operation: "chapter-revision",
        reason: "The prepared approved batch awaits verified manuscript outputs; approval alone does not establish execution.",
        required_strategy: cycle.current_strategy,
        operation_id: execution.execution_id,
      },
      updated_at: createdAt,
    };
    await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
    await runCheckpoint(options, "cycle-written");
    await finishCycleOperation(project, updated, execution.execution_id, options);
    return {
      valid: true,
      cycle: updated,
      execution,
      execution_path: absolute,
      execution_reference: reference,
      state_written: true,
      blockers: [],
    };
  });
}

function validateVerifyRequest(request, { independent = false } = {}) {
  const operation = independent ? "verify-draft-revision-execution" : "verify-revision-execution";
  const allowed = new Set([
    "execution_id",
    "requested_pass",
    "target_scope",
    ...(independent ? [] : ["cycle_id", "expected_revision"]),
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${operation} input field: ${key}`);
  }
  if ((!independent && !Number.isInteger(request.expected_revision)) || !request.requested_pass || !request.target_scope) {
    throw new Error(`${operation} requires exact ${independent ? "independent" : "cycle"}, execution, pass, and target identities`);
  }
}

async function validateFinalPassExtension(project, preparedReference, finalReference) {
  if (samePassReference(preparedReference, finalReference)) return [];
  const prepared = await readCurrentPass(project, preparedReference);
  const final = await readCurrentPass(project, finalReference);
  const errors = [];
  for (const requirement of prepared.required_operations) {
    const finalRequirement = final.required_operations.find(
      (candidate) => candidate.operation === requirement.operation
    );
    if (!finalRequirement) {
      errors.push(contextError(
        "revision-pass-requirements-reduced",
        `Final pass removed prepared operation ${requirement.operation}.`,
      ));
      continue;
    }
    const missingSubchecks = requirement.subchecks.filter(
      (subcheck) => !finalRequirement.subchecks.includes(subcheck)
    );
    if (missingSubchecks.length > 0) {
      errors.push(contextError(
        "revision-pass-requirements-reduced",
        `Final pass reduced prepared ${requirement.operation} subchecks: ${missingSubchecks.join(", ")}.`,
      ));
    }
  }
  for (const request of prepared.requested_subchecks) {
    const finalRequirement = final.required_operations.find(
      (candidate) => candidate.operation === request.operation
    );
    if (!finalRequirement?.subchecks.includes(request.subcheck)) {
      errors.push(contextError(
        "revision-pass-requirements-reduced",
        `Final pass removed prepared requested subcheck ${request.operation}/${request.subcheck}.`,
        null,
        request.author_decision_id,
      ));
    }
  }
  return errors;
}

function buildChangeSet(inputScope, targetScope) {
  return diffManuscriptInventories(inputScope, targetScope);
}

export async function verifyRevisionExecution(projectRoot, request, options = {}) {
  validateVerifyRequest(request);
  const project = await readProject(projectRoot);
  return withCycleLock(project, options, async () => {
    const active = await readActiveCycle(project);
    const cycle = active.value;
    const cycleFailure = checkCycleRequest(cycle, request);
    if (cycleFailure) return cycleFailure;
    const coordination = coordinationFailure(project, active, {
      allowOperationId: options.recoveryOperationId ?? null,
    });
    if (coordination) return coordination;
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "executions",
      `${request.execution_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    const prepared = JSON.parse(await readFile(absolute, "utf8"));
    if (
      prepared.execution_id !== request.execution_id ||
      prepared.cycle_id !== request.cycle_id ||
      !["prepared", ...(options.recoveryOperationId === request.execution_id ? ["verified"] : [])].includes(prepared.status) ||
      !cycle.related_artifacts.revision_executions.some((reference) => reference.execution_id === request.execution_id)
    ) {
      return failure("revision-execution-identity-mismatch", "The prepared execution is not linked to this active cycle.", cycle);
    }
    let passReductions;
    try {
      passReductions = await validateFinalPassExtension(
        project,
        prepared.requested_pass,
        request.requested_pass,
      );
    } catch (error) {
      return failure("revision-execution-verification-invalid", "The prepared or final requested pass cannot be trusted.", cycle, [contextError("revision-artifact-mismatch", error.message)]);
    }
    if (passReductions.length > 0) {
      return failure("revision-pass-requirements-reduced", "The final pass must preserve every prepared operation and subcheck; it may only add requirements.", cycle, passReductions);
    }
    const verifiedAt = prepared.status === "verified" ? prepared.verified_at : operationTime(options);
    const execution = {
      ...prepared,
      requested_pass: request.requested_pass,
      target_scope: request.target_scope,
      status: "verified",
      verified_at: verifiedAt,
    };
    const validation = await validateExecutionContext(project, execution, {
      requireOutputs: true,
      requireCurrentTarget: true,
      expectedPass: request.requested_pass,
      expectedScope: request.target_scope,
    });
    if (!validation.valid) {
      const code = validation.errors.some((error) => error.code === "revision-output-mismatch")
        ? "revision-output-mismatch"
        : "revision-execution-verification-invalid";
      return failure(code, "The prepared batch cannot be verified against current manuscript and target evidence.", cycle, validation.errors);
    }
    await beginCycleOperation(project, active, {
      kind: "revision-verification",
      operationId: execution.execution_id,
      artifactId: execution.execution_id,
    }, options);
    const text = `${JSON.stringify(execution, null, 2)}\n`;
    if (prepared.status === "prepared") await writeAtomicVerified(absolute, text);
    await runCheckpoint(options, "execution-written");
    const reference = executionReference(execution, relative, text);
    const changeFromReference = cycle.bootstrap
      ? null
      : cycle.starting_scope ?? execution.input_scope;
    const changeFromScope = cycle.bootstrap
      ? { files: [] }
      : await readCurrentScope(project, changeFromReference);
    const targetScope = await readCurrentScope(project, execution.target_scope);
    const changes = buildChangeSet(changeFromScope, targetScope);
    const updated = {
      ...cycle,
      revision: cycle.revision + 1,
      target_scope: request.target_scope,
      requested_pass: request.requested_pass,
      related_artifacts: {
        ...cycle.related_artifacts,
        revision_executions: cycle.related_artifacts.revision_executions.map((candidate) =>
          candidate.execution_id === request.execution_id ? reference : candidate
        ),
      },
      change_set: {
        from_scope: changeFromReference,
        to_scope: execution.target_scope,
        ...changes,
      },
      recovery_position: {
        operation: "current-scope-review",
        reason: "Verified revision outputs require current affected coverage and another full-target current-scope review.",
        required_strategy: cycle.current_strategy,
        operation_id: execution.execution_id,
      },
      updated_at: verifiedAt,
    };
    const cycleValidation = validateConvergenceCycleSchema(updated);
    if (!cycleValidation.valid) throw new Error(formatErrors(cycleValidation.errors));
    await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
    await runCheckpoint(options, "cycle-written");
    await finishCycleOperation(project, updated, execution.execution_id, options);
    return {
      valid: true,
      cycle: updated,
      execution,
      execution_path: absolute,
      execution_reference: reference,
      state_written: true,
      blockers: [],
    };
  });
}

export async function verifyDraftRevisionExecution(projectRoot, request, options = {}) {
  validateVerifyRequest(request, { independent: true });
  const project = await readProject(projectRoot);
  return withCycleLock(project, options, async () => {
    const initial = await readOptionalActiveCycle(project);
    const activeFailure = independentCycleFailure(initial);
    if (activeFailure) return activeFailure;
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "executions",
      `${request.execution_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    let prepared;
    try {
      prepared = JSON.parse(await readFile(absolute, "utf8"));
    } catch (error) {
      return failure("revision-execution-unavailable", `Cannot read independent prepared execution ${request.execution_id}: ${error.message}`, null);
    }
    if (
      prepared.execution_id !== request.execution_id ||
      prepared.cycle_id !== null ||
      prepared.status !== "prepared"
    ) {
      return failure("revision-execution-identity-mismatch", "The independent execution is missing, already verified, or bound to a cycle.", null);
    }
    let passReductions;
    try {
      passReductions = await validateFinalPassExtension(
        project,
        prepared.requested_pass,
        request.requested_pass,
      );
    } catch (error) {
      return failure("revision-execution-verification-invalid", "The prepared or final requested pass cannot be trusted.", null, [contextError("revision-artifact-mismatch", error.message)]);
    }
    if (passReductions.length > 0) {
      return failure("revision-pass-requirements-reduced", "The final pass must preserve every prepared operation and subcheck; it may only add requirements.", null, passReductions);
    }
    const verifiedAt = operationTime(options);
    const execution = {
      ...prepared,
      requested_pass: request.requested_pass,
      target_scope: request.target_scope,
      status: "verified",
      verified_at: verifiedAt,
    };
    const validation = await validateExecutionContext(project, execution, {
      requireOutputs: true,
      requireCurrentTarget: true,
      expectedPass: request.requested_pass,
      expectedScope: request.target_scope,
    });
    if (!validation.valid) {
      const code = validation.errors.some((error) => error.code === "revision-output-mismatch")
        ? "revision-output-mismatch"
        : "revision-execution-verification-invalid";
      return failure(code, "The independent prepared batch cannot be verified against current manuscript and target evidence.", null, validation.errors);
    }
    const concurrent = await readOptionalActiveCycle(project);
    const concurrentFailure = independentCycleFailure(concurrent);
    if (concurrentFailure) return concurrentFailure;
    const text = `${JSON.stringify(execution, null, 2)}\n`;
    await writeAtomicVerified(absolute, text);
    await runCheckpoint(options, "execution-written");
    return {
      valid: true,
      cycle: null,
      execution,
      execution_path: absolute,
      execution_reference: executionReference(execution, relative, text),
      state_written: true,
      blockers: [],
    };
  });
}


export async function getRequestCompletion(projectRoot, cycle) {
  if (!cycle || cycle.initiating_strategy !== "revise-request") return null;
  const project = await readProject(projectRoot);
  const blockers = [];
  const action = requiredAction(cycle);
  function block(code, message) {
    if (!blockers.some((blocker) => blocker.code === code && blocker.message === message)) {
      blockers.push({ code, message, required_action: action });
    }
  }

  let tracker = { findings: [], approvals: [], valid: false, errors: [] };
  try {
    const trackerText = await readFile(
      path.resolve(project.root, project.manifest.paths.audit_tracker),
      "utf8",
    );
    tracker = await parseTrackerState(trackerText, project.root);
    if (!tracker.valid) block("request-tracker-invalid", formatErrors(tracker.errors));
  } catch (error) {
    block("request-tracker-invalid", error.message);
  }

  const executions = [];
  for (const reference of cycle.related_artifacts?.revision_executions ?? []) {
    try {
      const contents = await readVerifiedArtifact(project, reference);
      const execution = JSON.parse(contents.toString("utf8"));
      if (
        execution.execution_id !== reference.execution_id ||
        execution.cycle_id !== cycle.cycle_id ||
        !validateRevisionExecution(execution).valid
      ) {
        block("revision-execution-identity-mismatch", `Revision execution ${reference.execution_id} is invalid or belongs to another cycle.`);
        continue;
      }
      const currentExecution = samePassReference(execution.requested_pass, cycle.requested_pass) &&
        sameScopeReference(execution.target_scope, cycle.target_scope);
      executions.push({ execution, currentExecution });
      if (execution.status !== "verified") {
        block("approved-edit-unexecuted", `Approved revision execution ${execution.execution_id} is not verified.`);
        continue;
      }
      const disk = await validateExecutionContext(project, execution, {
        requireOutputs: currentExecution,
        requireCurrentTarget: currentExecution,
        requireCurrentDecisions: currentExecution,
        expectedPass: currentExecution ? cycle.requested_pass : execution.requested_pass,
        expectedScope: currentExecution ? cycle.target_scope : execution.target_scope,
      });
      for (const error of disk.errors) block(error.code, error.message);
    } catch (error) {
      block("revision-execution-unavailable", error.message);
    }
  }
  const verifiedExecutions = executions
    .filter(({ execution, currentExecution }) => execution.status === "verified" && currentExecution)
    .map(({ execution }) => execution);

  const skips = [];
  for (const reference of cycle.related_artifacts?.no_edit_skips ?? []) {
    try {
      const contents = await readVerifiedArtifact(project, reference);
      const skip = JSON.parse(contents.toString("utf8"));
      if (
        skip.skip_id !== reference.skip_id ||
        !validateNoEditSkipSchema(skip).valid ||
        !samePassReference(skip.requested_pass, cycle.requested_pass) ||
        skip.scope_fingerprint !== cycle.target_scope?.scope_fingerprint
      ) {
        block("no-edit-identity-mismatch", `No-edit skip ${reference.skip_id} is not bound to the active request.`);
        continue;
      }
      skips.push(skip);
      const decision = tracker.approvals.find((approval) => approval.id === skip.author_decision_id);
      if (
        !decision ||
        decision.status !== "approved" ||
        decision.scopeId !== cycle.target_scope?.scope_id ||
        !skip.operations.includes(decision.operation)
      ) {
        block("no-edit-author-decision-missing", `No-edit skip ${skip.skip_id} lacks its current author decision.`);
      }
    } catch (error) {
      block("no-edit-evidence-missing", error.message);
    }
  }
  if (verifiedExecutions.length === 0) {
    for (const operation of ["revision-plan", "chapter-revision"]) {
      if (!skips.some((skip) => skip.operations.includes(operation))) {
        block("request-decision-incomplete", `The request has no verified execution or no-edit decision for ${operation}.`);
      }
    }
  }

  try {
    const pass = await readCurrentPass(project, cycle.requested_pass);
    for (const request of pass.requested_subchecks) {
      const decision = tracker.approvals.find((approval) => approval.id === request.author_decision_id);
      if (
        !decision ||
        decision.status !== "approved" ||
        decision.operation !== request.operation ||
        decision.scopeId !== cycle.target_scope?.scope_id
      ) {
        block("requested-subcheck-author-decision-missing", `Newly requested ${request.operation}/${request.subcheck} lacks its current author decision.`);
      }
    }
  } catch (error) {
    block("requested-pass-unavailable", error.message);
  }

  const coveredFindings = new Set(skips.flatMap((skip) => skip.covered_findings));
  for (const finding of tracker.findings) {
    if (finding.status === "stale") continue;
    if (finding.status === "open") {
      block("open-findings", `Request finding ${finding.id} still awaits an author decision or verified resolution.`);
      continue;
    }
    if (finding.status === "resolved") {
      const executed = verifiedExecutions.some((execution) =>
        execution.finding_dispositions.some((disposition) =>
          disposition.finding_id === finding.id && disposition.disposition === "execute"
        )
      );
      if (!executed) {
        block("verified-execution-required", `Resolved request finding ${finding.id} lacks verified execution.`);
      }
    } else {
      const requiredDisposition = finding.status === "deferred" ? "defer" : "dismiss";
      const decidedByExecution = verifiedExecutions.some((execution) =>
        execution.finding_dispositions.some((disposition) =>
          disposition.finding_id === finding.id && disposition.disposition === requiredDisposition
        )
      );
      if (!decidedByExecution && !coveredFindings.has(finding.id)) {
        block(
          "finding-author-decision-missing",
          `Current ${finding.status} finding ${finding.id} lacks a matching execution disposition or an authorized no-edit skip.`,
        );
      }
    }
  }

  return {
    status: blockers.length === 0 ? "complete" : "incomplete",
    verified_execution_ids: verifiedExecutions.map((execution) => execution.execution_id),
    no_edit_skip_ids: skips.map((skip) => skip.skip_id),
    blockers,
  };
}
