import { readFile, rename } from "node:fs/promises";
import path from "node:path";

import { validateCreationCommit } from "./artifacts.mjs";
import { commandError, failure, requiredAction } from "./command-result.mjs";
import { runCheckpoint } from "./cycle-coordination.mjs";
import { readProject } from "./evaluation-artifacts.mjs";
import { isOperationalManuscriptPath } from "./manuscript.mjs";
import {
  validateBackupIndexSchema,
  validateBackupManifestSchema,
  validateRecordBackupCommand,
  validateRecordRestoreCommand,
} from "./schemas.mjs";
import {
  collectVersionedInventory,
  computeScopeFingerprint,
  validateFullManuscriptScope,
  validateScopeSnapshot,
} from "./scope.mjs";
import { validateDeployedReferences } from "./shared-references.mjs";
import {
  acquireDirectoryLock,
  createNoClobberVerified,
  releaseDirectoryLock,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";
import { utcTimestamp } from "./time.mjs";
import { parseTrackerState } from "./tracker.mjs";

function backupError(instancePath, message, code = "backup-contract-invalid") {
  return { instancePath, code, keyword: code, message, params: {} };
}

function formatErrors(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function validateFileActions(files) {
  const errors = [];
  const paths = new Set();
  for (const [index, file] of (files ?? []).entries()) {
    if (paths.has(file.path)) {
      errors.push(backupError(`/files/${index}/path`, `duplicate backup path: ${file.path}`));
    }
    paths.add(file.path);
    if (file.action === "create" && file.input_sha256 !== null) {
      errors.push(backupError(`/files/${index}/input_sha256`, "create requires a null input hash"));
    }
    if (file.action !== "create" && file.input_sha256 === null) {
      errors.push(backupError(`/files/${index}/input_sha256`, `${file.action} requires an input hash`));
    }
    if (file.action === "delete" && file.output_sha256 !== null) {
      errors.push(backupError(`/files/${index}/output_sha256`, "delete requires a null output hash"));
    }
    if (file.action !== "delete" && file.output_sha256 === null) {
      errors.push(backupError(`/files/${index}/output_sha256`, `${file.action} requires an output hash`));
    }
    if (file.action === "modify" && file.input_sha256 === file.output_sha256) {
      errors.push(backupError(`/files/${index}/output_sha256`, "modify must change manuscript content"));
    }
    if (Object.hasOwn(file, "backup_path")) {
      if (file.action === "create" && file.backup_path !== null) {
        errors.push(backupError(`/files/${index}/backup_path`, "create has no original backup path"));
      }
      if (file.action !== "create" && file.backup_path === null) {
        errors.push(backupError(`/files/${index}/backup_path`, `${file.action} requires original backup bytes`));
      }
    }
  }
  return errors;
}

const MANUSCRIPT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

function manuscriptActionErrors(manifest, files, inputScope, code, checkScope = true) {
  const errors = [];
  const manuscriptRoot = manifest.manuscript_root.replace(/\/$/, "");
  const singleFileRoot = MANUSCRIPT_EXTENSIONS.has(path.posix.extname(manuscriptRoot).toLowerCase());
  const scopeFiles = new Map((inputScope?.files ?? []).map((file) => [file.path, file]));
  for (const [index, file] of (files ?? []).entries()) {
    const withinRoot = singleFileRoot
      ? file.path === manuscriptRoot
      : manuscriptRoot === "." || file.path.startsWith(`${manuscriptRoot}/`);
    if (
      !withinRoot ||
      !MANUSCRIPT_EXTENSIONS.has(path.posix.extname(file.path).toLowerCase()) ||
      isOperationalManuscriptPath(file.path, manifest.paths)
    ) {
      errors.push(backupError(
        `/files/${index}/path`,
        `backup and restore actions require a manuscript path beneath ${manifest.manuscript_root}: ${file.path}`,
        code,
      ));
      continue;
    }
    if (!checkScope) continue;
    const scoped = scopeFiles.get(file.path);
    if (file.action === "create" && scoped) {
      errors.push(backupError(
        `/files/${index}/path`,
        `create target already belongs to the input scope: ${file.path}`,
        code,
      ));
    } else if (file.action !== "create" && (!scoped || scoped.sha256 !== file.input_sha256)) {
      errors.push(backupError(
        `/files/${index}/input_sha256`,
        `${file.action} input must belong to the applicable input scope with its exact hash: ${file.path}`,
        code,
      ));
    }
  }
  return errors;
}

function requireManuscriptActions(project, files, inputScope, code) {
  const errors = manuscriptActionErrors(project.manifest, files, inputScope, code);
  if (errors.length > 0) {
    throw commandError(code, "Backup and restore actions are limited to exact manuscript-scope paths.", {
      validation_errors: errors,
    });
  }
}

async function readRestoreSourceScope(project, sourceManifest, options) {
  if (sourceManifest.files.every((file) => file.action === "create")) return null;
  const code = "restore-source-scope-mismatch";
  if (!sourceManifest.scope_id || !sourceManifest.scope_fingerprint) {
    throw commandError(code, "Restoring original bytes requires the source backup's confirmed input scope.");
  }
  const relative = path.posix.join(
    project.manifest.paths.convergence,
    "scopes",
    `${sourceManifest.scope_id}-${sourceManifest.scope_fingerprint}.json`,
  );
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(path.resolve(project.root, relative), "utf8"));
  } catch (error) {
    throw commandError(code, `Cannot read the source backup input scope: ${error.message}`, {
      path: relative,
    });
  }
  const validation = validateScopeSnapshot(snapshot, options);
  if (
    !validation.valid ||
    snapshot.scope_id !== sourceManifest.scope_id ||
    snapshot.scope_fingerprint !== sourceManifest.scope_fingerprint ||
    computeScopeFingerprint(snapshot) !== sourceManifest.scope_fingerprint
  ) {
    throw commandError(code, "The source backup input scope is not valid confirmed scope evidence.", {
      path: relative,
      validation_errors: validation.errors,
    });
  }
  return snapshot;
}

export function validateBackupManifest(value, options = {}) {
  const schema = validateBackupManifestSchema(value, options);
  const errors = [...schema.errors, ...validateFileActions(value?.files)];
  return { valid: errors.length === 0, errors };
}

async function readProjectManifest(projectRoot, candidate = null) {
  if (candidate !== null) return candidate;
  return JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    "utf8",
  ));
}

export async function validateBackupIndex(projectRoot, value, options = {}) {
  const root = path.resolve(projectRoot);
  const schema = validateBackupIndexSchema(value, options);
  if (!schema.valid) return schema;
  const errors = [];
  const manifest = await readProjectManifest(root, options.manifest ?? null);
  const backupRoot = manifest.paths.backups;
  const backupIds = new Set();
  const backupEntries = new Map();
  const manifests = new Map();

  for (const [index, entry] of value.backups.entries()) {
    const entryPath = `/backups/${index}`;
    if (backupIds.has(entry.backup_id)) {
      errors.push(backupError(`${entryPath}/backup_id`, `duplicate backup ID: ${entry.backup_id}`, "duplicate-backup-id"));
    }
    backupIds.add(entry.backup_id);
    backupEntries.set(entry.backup_id, entry);
    const expectedManifestPath = path.posix.join(backupRoot, entry.backup_id, "manifest.json");
    if (entry.manifest.path !== expectedManifestPath) {
      errors.push(backupError(
        `${entryPath}/manifest/path`,
        `backup manifest path must be ${expectedManifestPath}`,
        "backup-index-path-mismatch",
      ));
      continue;
    }
    let text;
    try {
      const contents = await readFile(path.resolve(root, entry.manifest.path));
      if (sha256Bytes(contents) !== entry.manifest.sha256) {
        errors.push(backupError(
          `${entryPath}/manifest/sha256`,
          `backup manifest hash differs for ${entry.backup_id}`,
          "backup-manifest-hash-mismatch",
        ));
        continue;
      }
      text = contents.toString("utf8");
    } catch (error) {
      errors.push(backupError(
        `${entryPath}/manifest/path`,
        `cannot read backup manifest: ${error.message}`,
        "backup-manifest-unavailable",
      ));
      continue;
    }
    let backupManifest;
    try {
      backupManifest = JSON.parse(text);
    } catch (error) {
      errors.push(backupError(
        `${entryPath}/manifest/path`,
        `backup manifest is not valid JSON: ${error.message}`,
        "backup-manifest-invalid",
      ));
      continue;
    }
    const manifestValidation = validateBackupManifest(backupManifest, options);
    errors.push(...manifestValidation.errors.map((error) => ({
      ...error,
      instancePath: `${entryPath}/manifest${error.instancePath}`,
    })));
    if (!manifestValidation.valid) continue;
    errors.push(...manuscriptActionErrors(
      manifest,
      backupManifest.files,
      undefined,
      "backup-manuscript-path-invalid",
      false,
    ).map((error) => ({
      ...error,
      instancePath: `${entryPath}/manifest${error.instancePath}`,
    })));
    manifests.set(entry.backup_id, backupManifest);
    for (const field of [
      "backup_id",
      "operation",
      "approval_id",
      "scope_id",
      "scope_fingerprint",
      "created_at",
    ]) {
      if (entry[field] !== backupManifest[field]) {
        errors.push(backupError(
          `${entryPath}/${field}`,
          `backup index ${field} differs from its manifest`,
          "backup-index-identity-mismatch",
        ));
      }
    }
    for (const [fileIndex, file] of backupManifest.files.entries()) {
      const expectedBackupPath = file.action === "create"
        ? null
        : path.posix.join(backupRoot, entry.backup_id, file.path);
      if (file.backup_path !== expectedBackupPath) {
        errors.push(backupError(
          `${entryPath}/manifest/files/${fileIndex}/backup_path`,
          `backup path must be ${expectedBackupPath}`,
          "backup-index-path-mismatch",
        ));
        continue;
      }
      if (file.action === "create") continue;
      try {
        const contents = await readFile(path.resolve(root, file.backup_path));
        if (sha256Bytes(contents) !== file.input_sha256) {
          errors.push(backupError(
            `${entryPath}/manifest/files/${fileIndex}/input_sha256`,
            `backup bytes do not match the recorded input hash for ${file.path}`,
            "backup-bytes-hash-mismatch",
          ));
        }
      } catch (error) {
        errors.push(backupError(
          `${entryPath}/manifest/files/${fileIndex}/backup_path`,
          `cannot read backup bytes: ${error.message}`,
          "backup-bytes-unavailable",
        ));
      }
    }
  }

  const restorationIds = new Set();
  for (const [index, restoration] of value.restorations.entries()) {
    if (restorationIds.has(restoration.restoration_id)) {
      errors.push(backupError(
        `/restorations/${index}/restoration_id`,
        `duplicate restoration ID: ${restoration.restoration_id}`,
        "duplicate-restoration-id",
      ));
    }
    restorationIds.add(restoration.restoration_id);
    errors.push(...validateFileActions(restoration.files).map((error) => ({
      ...error,
      instancePath: `/restorations/${index}${error.instancePath}`,
    })));
    errors.push(...manuscriptActionErrors(
      manifest,
      restoration.files,
      undefined,
      "restore-manuscript-path-invalid",
      false,
    ).map((error) => ({
      ...error,
      instancePath: `/restorations/${index}${error.instancePath}`,
    })));
    const safetyEntry = backupEntries.get(restoration.safety_backup_id);
    if (!safetyEntry) {
      errors.push(backupError(
        `/restorations/${index}/safety_backup_id`,
        `safety backup is not indexed: ${restoration.safety_backup_id}`,
        "restoration-safety-backup-missing",
      ));
    }
    const safetyManifest = manifests.get(restoration.safety_backup_id);
    if (safetyManifest && JSON.stringify(safetyManifest.files) !== JSON.stringify(restoration.files)) {
      errors.push(backupError(
        `/restorations/${index}/files`,
        "restoration files differ from the safety backup manifest",
        "restoration-safety-identity-mismatch",
      ));
    }
    if (safetyEntry && ["operation", "approval_id", "scope_id", "scope_fingerprint"].some((field) =>
      safetyEntry[field] !== restoration[field]
    )) {
      errors.push(backupError(
        `/restorations/${index}`,
        "restoration identity differs from its safety backup index entry",
        "restoration-safety-identity-mismatch",
      ));
    }
    if (restoration.source.type === "backup") {
      const sourceEntry = backupEntries.get(restoration.source.backup_id);
      if (!sourceEntry) {
        errors.push(backupError(
          `/restorations/${index}/source/backup_id`,
          `source backup is not indexed: ${restoration.source.backup_id}`,
          "restoration-source-backup-missing",
        ));
      } else if (JSON.stringify(sourceEntry.manifest) !== JSON.stringify(restoration.source.manifest)) {
        errors.push(backupError(
          `/restorations/${index}/source/manifest`,
          "restoration source manifest differs from the indexed source backup",
          "restoration-source-identity-mismatch",
        ));
      }
      const sourceManifest = manifests.get(restoration.source.backup_id);
      if (sourceManifest) {
        if (sourceManifest.operation !== restoration.operation) {
          errors.push(backupError(
            `/restorations/${index}/operation`,
            "restoration operation differs from its source backup",
            "restoration-source-identity-mismatch",
          ));
        }
        const actualInverse = inverseFiles(sourceManifest.files);
        const recordedInverse = restoration.files.map(({ backup_path: ignored, ...file }) => file);
        if (JSON.stringify(actualInverse) !== JSON.stringify(recordedInverse)) {
          errors.push(backupError(
            `/restorations/${index}/files`,
            "restoration files are not the exact ordered inverse of the source backup",
            "restoration-source-identity-mismatch",
          ));
        }
      }
    }
    if (restoration.source.type === "commit") {
      try {
        const sourceManifest = await readCommitSource(
          { root, manifest },
          {
            commit_id: restoration.source.commit_id,
            path: restoration.source.manifest.path,
            sha256: restoration.source.manifest.sha256,
          },
          value,
          options,
        );
        if (sourceManifest.operation !== restoration.operation) {
          errors.push(backupError(
            `/restorations/${index}/operation`,
            "restoration operation differs from its source commit",
            "restoration-source-identity-mismatch",
          ));
        }
        const actualInverse = inverseFiles(sourceManifest.files);
        const recordedInverse = restoration.files.map(({ backup_path: ignored, ...file }) => file);
        if (JSON.stringify(actualInverse) !== JSON.stringify(recordedInverse)) {
          errors.push(backupError(
            `/restorations/${index}/files`,
            "restoration files are not the exact ordered inverse of the source commit",
            "restoration-source-identity-mismatch",
          ));
        }
      } catch (error) {
        errors.push(backupError(
          `/restorations/${index}/source`,
          error.message,
          "restoration-source-identity-mismatch",
        ));
      }
    }
    if (restoration.source.type === "backup" && restoration.source.backup_id === restoration.safety_backup_id) {
      errors.push(backupError(
        `/restorations/${index}/safety_backup_id`,
        "safety backup must differ from the source backup",
        "restoration-safety-identity-mismatch",
      ));
    }
  }
  return { valid: errors.length === 0, errors };
}

async function projectRootForBackupIndex(indexPath) {
  let directory = path.dirname(path.resolve(indexPath));
  while (true) {
    try {
      await readFile(path.join(directory, ".author-toolkit", "project.json"), "utf8");
      return directory;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Cannot locate .author-toolkit/project.json for the backup index");
    }
    directory = parent;
  }
}

export async function validateBackupIndexFile(indexPath, options = {}) {
  try {
    const projectRoot = options.projectRoot ?? await projectRootForBackupIndex(indexPath);
    const manifest = await readProjectManifest(projectRoot, options.manifest ?? null);
    const expected = path.resolve(projectRoot, manifest.paths.backups, "index.json");
    if (path.resolve(indexPath) !== expected) {
      return {
        valid: false,
        errors: [backupError("", `backup index must be the registered ${manifest.paths.backups}/index.json`, "backup-index-path-mismatch")],
      };
    }
    const value = JSON.parse(await readFile(indexPath, "utf8"));
    return await validateBackupIndex(projectRoot, value, options);
  } catch (error) {
    return { valid: false, errors: [backupError("", error.message, "backup-index-unavailable")] };
  }
}

function approvalFilesFingerprint(request) {
  return sha256Bytes(JSON.stringify({
    operation: request.operation,
    scope_id: request.scope_id,
    files: request.files,
  }));
}

function validateApproval(approval, request) {
  const tokens = String(approval?.reason ?? "").split(/\s+/).filter(Boolean);
  const exactToken = (name, value) =>
    tokens.filter((candidate) => candidate.startsWith(`${name}=`)).length === 1 &&
    tokens.includes(`${name}=${value}`);
  const revision = request.operation === "chapter-revision";
  const bootstrap = !revision && request.scope_id === null && request.scope_fingerprint === null;
  const approvalOperation = revision ? "chapter-revision" : "chapter-review";
  if (
    !approval ||
    approval.status !== "approved" ||
    approval.type !== (revision ? "edit" : "creation-manuscript") ||
    approval.operation !== approvalOperation ||
    (!bootstrap && approval.scopeId !== request.scope_id) ||
    JSON.stringify(approval.paths) !== JSON.stringify(request.files.map((file) => file.path)) ||
    !exactToken("approval_files", approvalFilesFingerprint({
      ...request,
      operation: approvalOperation,
      scope_id: bootstrap ? approval.scopeId : request.scope_id,
    })) ||
    (revision && !exactToken("scope_fingerprint", request.scope_fingerprint))
  ) {
    throw commandError(
      "backup-approval-mismatch",
      "The backup requires one current approval for the exact operation, scope, ordered actions, and input and output versions.",
      { approval_id: request.approval_id },
    );
  }
}

async function readCurrentInput(project, file) {
  try {
    const contents = await readFile(path.resolve(project.root, file.path));
    if (file.action === "create") {
      throw commandError("backup-input-mismatch", `Create target is not absent: ${file.path}`, { path: file.path });
    }
    if (sha256Bytes(contents) !== file.input_sha256) {
      throw commandError("backup-input-mismatch", `Current manuscript input changed for ${file.path}.`, { path: file.path });
    }
    return contents;
  } catch (error) {
    if (error.code === "ENOENT") {
      if (file.action === "create") return null;
      throw commandError("backup-input-mismatch", `Input manuscript is unavailable: ${file.path}`, { path: file.path });
    }
    throw error;
  }
}

async function publishPreservedBytes(file, contents) {
  try {
    await createNoClobberVerified(file, contents);
    return false;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(file);
    if (!existing.equals(contents)) {
      throw commandError("backup-content-conflict", `Existing backup bytes differ: ${file}`);
    }
    return true;
  }
}

async function publishManifest(file, text) {
  try {
    await createNoClobberVerified(file, text);
    return false;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(file, "utf8");
    if (existing !== text) {
      throw commandError("backup-manifest-conflict", `Existing backup manifest differs: ${file}`);
    }
    return true;
  }
}

async function publishOriginalInputs(project, files, backupId, checkpoint, options, progress) {
  const inputs = [];
  for (const file of files) inputs.push(await readCurrentInput(project, file));
  const manifestFiles = [];
  for (const [index, file] of files.entries()) {
    const backupPath = file.action === "create"
      ? null
      : path.posix.join(project.manifest.paths.backups, backupId, file.path);
    if (backupPath !== null) {
      await publishPreservedBytes(path.resolve(project.root, backupPath), inputs[index]);
      progress.bytesPublished = true;
    }
    manifestFiles.push({ ...file, backup_path: backupPath });
  }
  for (const file of files) await readCurrentInput(project, file);
  await runCheckpoint(options, checkpoint);
  return manifestFiles;
}

async function publishValidatedManifest(
  project,
  request,
  files,
  createdAt,
  relativeManifest,
  invalidMessage,
  options,
  progress,
) {
  const manifest = {
    schema_version: "1.0.0",
    backup_id: request.backup_id,
    operation: request.operation,
    approval_id: request.approval_id,
    scope_id: request.scope_id,
    scope_fingerprint: request.scope_fingerprint,
    files,
    created_at: createdAt,
  };
  const validation = validateBackupManifest(manifest, options);
  if (!validation.valid) {
    throw commandError("backup-manifest-invalid", invalidMessage, {
      validation_errors: validation.errors,
    });
  }
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  await publishManifest(path.resolve(project.root, relativeManifest), text);
  progress.manifestPublished = true;
  await runCheckpoint(options, "manifest-published");
  return {
    manifest,
    text,
    reference: { path: relativeManifest, sha256: sha256Bytes(text) },
  };
}

async function writeValidatedIndex(
  project,
  index,
  indexPath,
  entry,
  invalidMessage,
  options,
  progress,
  restoration = null,
) {
  const updated = {
    ...index,
    backups: [...index.backups, entry],
    ...(restoration ? { restorations: [...index.restorations, restoration] } : {}),
  };
  const validation = await validateBackupIndex(project.root, updated, options);
  if (!validation.valid) {
    throw commandError("backup-index-invalid", invalidMessage, {
      validation_errors: validation.errors,
    });
  }
  const text = `${JSON.stringify(updated, null, 2)}\n`;
  await writeAtomicVerified(indexPath, text);
  progress.indexUpdated = true;
  await runCheckpoint(options, "index-written");
  return text;
}

function manifestRequestMatches(manifest, request) {
  return manifest && ["backup_id", "operation", "approval_id", "scope_id", "scope_fingerprint"]
    .every((field) => manifest[field] === request[field]) &&
    JSON.stringify(manifest.files?.map(({ backup_path: ignored, ...file }) => file)) ===
      JSON.stringify(request.files);
}

async function recoveryState(project, operation, progress) {
  const indexPath = path.resolve(project.root, project.manifest.paths.backups, "index.json");
  let indexSha256 = null;
  try {
    indexSha256 = sha256Bytes(await readFile(indexPath));
  } catch {
  }
  return {
    required_action: requiredAction(operation),
    backup_id: progress.backupId,
    backup_manifest_path: progress.manifestPath ?? null,
    backup_index_path: indexPath,
    backup_index_sha256: indexSha256,
    bytes_published: progress.bytesPublished === true,
    manifest_published: progress.manifestPublished === true,
    index_updated: progress.indexUpdated === true,
  };
}

export async function recordBackup(projectRoot, request, options = {}) {
  const operation = "record-backup";
  const references = await validateDeployedReferences(projectRoot);
  if (!references.valid) {
    return {
      ...failure(
        "reference-version-conflict",
        "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
        operation,
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
    return failure(
      lock.code === "timeout" ? "project-lock-timeout" : "project-lock-error",
      `Cannot coordinate backup recording at ${lock.directory}: ${lock.error.message}`,
      operation,
      { lock_path: lock.directory },
    );
  }

  let project = initial;
  let outcome;
  let operationError;
  const progress = { backupId: request.backup_id };
  try {
    await runCheckpoint(options, "lock-acquired");
    project = await readProject(projectRoot);
    const validation = validateRecordBackupCommand(request, options);
    if (!validation.valid) {
      throw commandError("backup-command-invalid", "The backup command does not satisfy its typed input contract.", {
        validation_errors: validation.errors,
      });
    }
    const actionErrors = validateFileActions(request.files);
    if (actionErrors.length > 0) {
      throw commandError("backup-command-invalid", "The backup actions are inconsistent.", {
        validation_errors: actionErrors,
      });
    }
    const currentScope = project.manifest.current_scope;
    const bootstrap = request.operation === "creation-commit" &&
      request.scope_id === null && request.scope_fingerprint === null;
    if (bootstrap) {
      if (currentScope || request.files.some((file) => file.action !== "create")) {
        throw commandError(
          "backup-scope-mismatch",
          "A null-scope creation backup requires an empty manuscript and only create actions.",
        );
      }
      const inventory = await collectVersionedInventory(project.root, project.manifest);
      if (inventory.files.length > 0) {
        throw commandError(
          "backup-scope-mismatch",
          "A null-scope creation backup cannot use a nonempty unregistered manuscript.",
        );
      }
    } else {
      if (
        !currentScope ||
        currentScope.status !== "confirmed" ||
        currentScope.scope_id !== request.scope_id ||
        currentScope.scope_fingerprint !== request.scope_fingerprint
      ) {
        throw commandError("backup-scope-mismatch", "The backup must name the current confirmed input scope and fingerprint.");
      }
      const fullScope = await validateFullManuscriptScope(project.manifest, project.manifestPath);
      if (!fullScope.valid) {
        throw commandError("backup-scope-not-current", "The backup input scope is not a current full-manuscript scope.", {
          validation_errors: fullScope.errors,
        });
      }
    }
    requireManuscriptActions(
      project,
      request.files,
      bootstrap ? null : currentScope,
      "backup-manuscript-path-invalid",
    );
    const tracker = await parseTrackerState(
      await readFile(path.resolve(project.root, project.manifest.paths.audit_tracker), "utf8"),
      project.root,
    );
    if (!tracker.valid) {
      throw commandError("backup-tracker-invalid", "The existing tracker is invalid.", {
        validation_errors: tracker.errors,
      });
    }
    validateApproval(tracker.approvals.find((approval) => approval.id === request.approval_id), request);

    const indexPath = path.resolve(project.root, project.manifest.paths.backups, "index.json");
    const indexText = await readFile(indexPath, "utf8");
    const index = JSON.parse(indexText);
    const indexValidation = await validateBackupIndex(project.root, index, options);
    if (!indexValidation.valid) {
      throw commandError("backup-index-invalid", "The existing backup index is invalid.", {
        validation_errors: indexValidation.errors,
      });
    }
    const existingEntry = index.backups.find((entry) => entry.backup_id === request.backup_id);
    if (existingEntry) {
      const existingManifest = JSON.parse(await readFile(path.resolve(project.root, existingEntry.manifest.path), "utf8"));
      if (!manifestRequestMatches(existingManifest, request)) {
        throw commandError("backup-already-exists", `Backup ID already exists: ${request.backup_id}`);
      }
      outcome = {
        valid: true,
        state_written: false,
        recovered: true,
        backup: {
          backup_id: existingEntry.backup_id,
          approval_id: existingEntry.approval_id,
          manifest: existingEntry.manifest,
          files: existingManifest.files.filter((file) => file.action !== "create").map((file) => ({
            path: file.path,
            backup_path: file.backup_path,
            sha256: file.input_sha256,
          })),
        },
        index_sha256: sha256Bytes(indexText),
        required_action: requiredAction(operation),
        blockers: [],
      };
    } else {
      if (request.expected_index_sha256 !== undefined && sha256Bytes(indexText) !== request.expected_index_sha256) {
        throw commandError("backup-index-hash-conflict", "The backup index changed after the command input was prepared.", {
          expected_sha256: request.expected_index_sha256,
          actual_sha256: sha256Bytes(indexText),
        });
      }
      const manifestFiles = await publishOriginalInputs(
        project,
        request.files,
        request.backup_id,
        "backup-bytes-written",
        options,
        progress,
      );

      const relativeManifest = path.posix.join(
        project.manifest.paths.backups,
        request.backup_id,
        "manifest.json",
      );
      progress.manifestPath = relativeManifest;
      let createdAt = utcTimestamp(options);
      try {
        const orphan = JSON.parse(await readFile(path.resolve(project.root, relativeManifest), "utf8"));
        if (!manifestRequestMatches(orphan, request)) {
          throw commandError("backup-manifest-conflict", `Existing backup manifest differs: ${relativeManifest}`);
        }
        createdAt = orphan.created_at;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const { manifest: backupManifest, reference: manifestReference } =
        await publishValidatedManifest(
          project,
          request,
          manifestFiles,
          createdAt,
          relativeManifest,
          "The candidate backup manifest is invalid.",
          options,
          progress,
        );
      const entry = {
        backup_id: request.backup_id,
        operation: request.operation,
        approval_id: request.approval_id,
        scope_id: request.scope_id,
        scope_fingerprint: request.scope_fingerprint,
        manifest: manifestReference,
        created_at: createdAt,
      };
      const updatedText = await writeValidatedIndex(
        project,
        index,
        indexPath,
        entry,
        "The candidate backup index is invalid.",
        options,
        progress,
      );
      outcome = {
        valid: true,
        state_written: true,
        recovered: false,
        backup: {
          backup_id: request.backup_id,
          approval_id: request.approval_id,
          manifest: manifestReference,
          files: backupManifest.files.filter((file) => file.action !== "create").map((file) => ({
            path: file.path,
            backup_path: file.backup_path,
            sha256: file.input_sha256,
          })),
        },
        index_sha256: sha256Bytes(updatedText),
        required_action: requiredAction(operation),
        blockers: [],
      };
    }
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      ...failure(
        "project-lock-release-error",
        `Cannot release backup lock ${lock.directory}: ${released.error.message}`,
        operation,
        { lock_path: lock.directory },
      ),
      state_written: Boolean(progress.bytesPublished || progress.manifestPublished || progress.indexUpdated),
      recovery: await recoveryState(project, operation, progress),
    };
  }
  if (operationError) {
    return {
      ...failure(
        operationError.projectCode ?? "backup-write-interrupted",
        operationError.message,
        operation,
        operationError.projectDetails,
      ),
      state_written: Boolean(progress.bytesPublished || progress.manifestPublished || progress.indexUpdated),
      recovery: await recoveryState(project, operation, progress),
    };
  }
  return outcome;
}


function inverseAction(action) {
  return {
    create: "delete",
    delete: "create",
    modify: "modify",
    reorder: "reorder",
  }[action];
}

function inverseFiles(sourceFiles) {
  return sourceFiles.map((file) => ({
    path: file.path,
    action: inverseAction(file.action),
    input_sha256: file.output_sha256,
    output_sha256: file.input_sha256,
  }));
}

function exactReasonToken(approval, name, value) {
  const tokens = String(approval?.reason ?? "").split(/\s+/).filter(Boolean);
  return tokens.filter((candidate) => candidate.startsWith(`${name}=`)).length === 1 &&
    tokens.includes(`${name}=${value}`);
}

function validateRestoreApproval(approval, request) {
  if (
    !approval ||
    approval.status !== "approved" ||
    approval.type !== "restore" ||
    approval.operation !== request.operation ||
    approval.scopeId !== request.scope_id ||
    JSON.stringify(approval.paths) !== JSON.stringify(request.files.map((file) => file.path)) ||
    !exactReasonToken(approval, "approval_files", approvalFilesFingerprint(request)) ||
    !exactReasonToken(approval, "restore_source", restoreSourceId(request))
  ) {
    throw commandError(
      "restore-approval-mismatch",
      "Restoration requires a separate current restore approval for the exact source, operation, scope, ordered inverse actions, and input and output versions.",
      { approval_id: request.approval_id },
    );
  }
}

async function verifyRestoredOutput(project, file) {
  try {
    const contents = await readFile(path.resolve(project.root, file.path));
    if (file.action === "delete") {
      throw commandError("restore-output-mismatch", `Removed output still exists: ${file.path}`, { path: file.path });
    }
    if (sha256Bytes(contents) !== file.output_sha256) {
      throw commandError("restore-output-mismatch", `Restored output hash differs for ${file.path}.`, { path: file.path });
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      if (file.action === "delete") return;
      throw commandError("restore-output-mismatch", `Restored output is unavailable: ${file.path}`, { path: file.path });
    }
    throw error;
  }
}

function restoreRecoveryState(project, progress, indexPath) {
  return {
    required_action: requiredAction("record-restore"),
    restoration_id: progress.restorationId,
    safety_backup_id: progress.safetyBackupId,
    safety_manifest_path: progress.manifestPath ?? null,
    backup_index_path: indexPath,
    safety_bytes_published: progress.bytesPublished === true,
    safety_manifest_published: progress.manifestPublished === true,
    manuscript_restored: progress.manuscriptRestored === true,
    index_updated: progress.indexUpdated === true,
  };
}

export async function recordRestore(projectRoot, request, options = {}) {
  const operation = "record-restore";
  const references = await validateDeployedReferences(projectRoot);
  if (!references.valid) {
    return {
      ...failure(
        "reference-version-conflict",
        "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
        operation,
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
    return failure(
      lock.code === "timeout" ? "project-lock-timeout" : "project-lock-error",
      `Cannot coordinate restoration at ${lock.directory}: ${lock.error.message}`,
      operation,
      { lock_path: lock.directory },
    );
  }

  let project = initial;
  let outcome;
  let operationError;
  const progress = {
    restorationId: request.restoration_id,
    safetyBackupId: request.safety_backup_id,
  };
  const indexPath = path.resolve(initial.root, initial.manifest.paths.backups, "index.json");
  try {
    await runCheckpoint(options, "lock-acquired");
    project = await readProject(projectRoot);
    const validation = validateRecordRestoreCommand(request, options);
    if (!validation.valid) {
      throw commandError("restore-command-invalid", "The restore command does not satisfy its typed input contract.", {
        validation_errors: validation.errors,
      });
    }
    const actionErrors = validateFileActions(request.files);
    if (actionErrors.length > 0) {
      throw commandError("restore-command-invalid", "The restore actions are inconsistent.", {
        validation_errors: actionErrors,
      });
    }
    if (request.source_backup_id === request.safety_backup_id) {
      throw commandError("restore-safety-backup-invalid", "The safety backup ID must differ from the source backup ID.");
    }
    const safetyManifestRelative = path.posix.join(
      project.manifest.paths.backups,
      request.safety_backup_id,
      "manifest.json",
    );
    progress.manifestPath = safetyManifestRelative;
    let recovering = false;
    let recoveryManifest = null;
    let recoveryManifestText = null;
    try {
      recoveryManifestText = await readFile(path.resolve(project.root, safetyManifestRelative), "utf8");
      const candidate = JSON.parse(recoveryManifestText);
      if (manifestRequestMatches(candidate, {
        ...request,
        backup_id: request.safety_backup_id,
      }) && validateBackupManifest(candidate, options).valid) {
        let outputsReady = true;
        for (const file of request.files) {
          try {
            await verifyRestoredOutput(project, file);
          } catch {
            outputsReady = false;
            break;
          }
        }
        if (outputsReady) {
          recovering = true;
          recoveryManifest = candidate;
          progress.bytesPublished = true;
          progress.manifestPublished = true;
          progress.manuscriptRestored = true;
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const currentScope = project.manifest.current_scope;
    if (
      !currentScope ||
      currentScope.status !== "confirmed" ||
      currentScope.scope_id !== request.scope_id ||
      currentScope.scope_fingerprint !== request.scope_fingerprint
    ) {
      throw commandError("restore-scope-mismatch", "Restoration must name the current confirmed input scope and fingerprint.");
    }
    if (!recovering) {
      const fullScope = await validateFullManuscriptScope(project.manifest, project.manifestPath);
      if (!fullScope.valid) {
        throw commandError("restore-scope-not-current", "The restore input scope is not a current full-manuscript scope.", {
          validation_errors: fullScope.errors,
        });
      }
    }
    requireManuscriptActions(
      project,
      request.files,
      currentScope,
      "restore-manuscript-path-invalid",
    );
    const tracker = await parseTrackerState(
      await readFile(path.resolve(project.root, project.manifest.paths.audit_tracker), "utf8"),
      project.root,
    );
    if (!tracker.valid) {
      throw commandError("restore-tracker-invalid", "The existing tracker is invalid.", {
        validation_errors: tracker.errors,
      });
    }
    validateRestoreApproval(
      tracker.approvals.find((approval) => approval.id === request.approval_id),
      request,
    );

    const indexText = await readFile(indexPath, "utf8");
    const index = JSON.parse(indexText);
    const indexValidation = await validateBackupIndex(project.root, index, options);
    if (!indexValidation.valid) {
      throw commandError("backup-index-invalid", "The existing backup index is invalid.", {
        validation_errors: indexValidation.errors,
      });
    }
    if (index.restorations.some((entry) => entry.restoration_id === request.restoration_id)) {
      throw commandError("restoration-already-exists", `Restoration ID already exists: ${request.restoration_id}`);
    }
    if (index.backups.some((entry) => entry.backup_id === request.safety_backup_id)) {
      throw commandError("backup-already-exists", `Safety backup ID already exists: ${request.safety_backup_id}`);
    }
    if (request.expected_index_sha256 !== undefined && sha256Bytes(indexText) !== request.expected_index_sha256) {
      throw commandError("backup-index-hash-conflict", "The backup index changed after the restore input was prepared.", {
        expected_sha256: request.expected_index_sha256,
        actual_sha256: sha256Bytes(indexText),
      });
    }
    let sourceEntry;
    let sourceManifest;
    if (request.source_backup_id !== undefined) {
      sourceEntry = index.backups.find((entry) => entry.backup_id === request.source_backup_id);
      if (!sourceEntry) {
        throw commandError("restore-source-missing", `Source backup is not indexed: ${request.source_backup_id}`);
      }
      sourceManifest = JSON.parse(await readFile(path.resolve(project.root, sourceEntry.manifest.path), "utf8"));
    } else {
      sourceEntry = {
        manifest: { path: request.source_commit.path, sha256: request.source_commit.sha256 },
      };
      sourceManifest = await readCommitSource(project, request.source_commit, index, options);
    }
    if (
      sourceManifest.operation !== request.operation ||
      JSON.stringify(inverseFiles(sourceManifest.files)) !== JSON.stringify(request.files)
    ) {
      throw commandError(
        "restore-source-mismatch",
        "The requested restore files must be the complete ordered inverse of the source backup manifest.",
      );
    }
    const sourceScope = await readRestoreSourceScope(project, sourceManifest, options);
    if (sourceScope) {
      requireManuscriptActions(
        project,
        sourceManifest.files,
        sourceScope,
        "restore-source-scope-mismatch",
      );
    }

    let safetyFiles;
    let createdAt;
    let safetyManifest;
    let safetyManifestText;
    if (recovering) {
      safetyFiles = recoveryManifest.files;
      createdAt = recoveryManifest.created_at;
      safetyManifest = recoveryManifest;
      safetyManifestText = recoveryManifestText;
    } else {
      safetyFiles = await publishOriginalInputs(
        project,
        request.files,
        request.safety_backup_id,
        "safety-backup-written",
        options,
        progress,
      );

      createdAt = utcTimestamp(options);
      const publication = await publishValidatedManifest(
        project,
        { ...request, backup_id: request.safety_backup_id },
        safetyFiles,
        createdAt,
        safetyManifestRelative,
        "The safety backup manifest is invalid.",
        options,
        progress,
      );
      safetyManifest = publication.manifest;
      safetyManifestText = publication.text;

      for (const [index, file] of request.files.entries()) {
        const currentPath = path.resolve(project.root, file.path);
        const sourceFile = sourceManifest.files[index];
        const originalBytes = sourceFile.action === "create"
          ? null
          : await readFile(path.resolve(project.root, sourceFile.backup_path));
        await readCurrentInput(project, file);
        if (file.action === "delete") {
          const safetyPath = path.resolve(project.root, safetyFiles[index].backup_path);
          if (sha256Bytes(await readFile(safetyPath)) !== file.input_sha256) {
            throw commandError("restore-safety-backup-mismatch", `Safety backup changed before removal: ${file.path}`);
          }
          await rename(currentPath, safetyPath);
          if (sha256Bytes(await readFile(safetyPath)) !== file.input_sha256) {
            throw commandError("restore-output-mismatch", `Safety move verification failed: ${file.path}`);
          }
        } else if (file.action === "create") {
          await createNoClobberVerified(currentPath, originalBytes);
        } else {
          await writeAtomicVerified(currentPath, originalBytes);
        }
        await verifyRestoredOutput(project, file);
      }
      progress.manuscriptRestored = true;
      await runCheckpoint(options, "manuscript-restored");
    }

    const safetyManifestReference = {
      path: safetyManifestRelative,
      sha256: sha256Bytes(safetyManifestText),
    };
    const safetyEntry = {
      backup_id: request.safety_backup_id,
      operation: request.operation,
      approval_id: request.approval_id,
      scope_id: request.scope_id,
      scope_fingerprint: request.scope_fingerprint,
      manifest: safetyManifestReference,
      created_at: createdAt,
    };
    const restoration = {
      restoration_id: request.restoration_id,
      source: request.source_commit
        ? {
            type: "commit",
            commit_id: request.source_commit.commit_id,
            manifest: sourceEntry.manifest,
          }
        : {
            type: "backup",
            backup_id: request.source_backup_id,
            manifest: sourceEntry.manifest,
          },
      operation: request.operation,
      approval_id: request.approval_id,
      scope_id: request.scope_id,
      scope_fingerprint: request.scope_fingerprint,
      safety_backup_id: request.safety_backup_id,
      files: safetyFiles,
      created_at: createdAt,
    };
    const updatedText = await writeValidatedIndex(
      project,
      index,
      indexPath,
      safetyEntry,
      "The candidate restoration index is invalid.",
      options,
      progress,
      restoration,
    );

    const scopeValidation = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    outcome = {
      valid: true,
      state_written: true,
      recovered: recovering,
      restoration,
      safety_backup: {
        backup_id: request.safety_backup_id,
        approval_id: request.approval_id,
        manifest: safetyManifestReference,
        files: safetyManifest.files.filter((file) => file.action !== "create").map((file) => ({
          path: file.path,
          backup_path: file.backup_path,
          sha256: file.input_sha256,
        })),
      },
      index_sha256: sha256Bytes(updatedText),
      evidence_invalidated: true,
      validation: {
        valid: scopeValidation.valid,
        full_manuscript: scopeValidation.full_manuscript,
        blockers: scopeValidation.errors,
      },
      required_action: requiredAction("record-scope"),
      blockers: [],
    };
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      ...failure(
        "project-lock-release-error",
        `Cannot release restore lock ${lock.directory}: ${released.error.message}`,
        operation,
        { lock_path: lock.directory },
      ),
      state_written: Boolean(
        progress.bytesPublished || progress.manifestPublished ||
        progress.manuscriptRestored || progress.indexUpdated
      ),
      recovery: restoreRecoveryState(project, progress, indexPath),
    };
  }
  if (operationError) {
    return {
      ...failure(
        operationError.projectCode ?? "restore-write-interrupted",
        operationError.message,
        operation,
        operationError.projectDetails,
      ),
      state_written: Boolean(
        progress.bytesPublished || progress.manifestPublished ||
        progress.manuscriptRestored || progress.indexUpdated
      ),
      recovery: restoreRecoveryState(project, progress, indexPath),
    };
  }
  return outcome;
}


function restoreSourceId(request) {
  return request.source_backup_id ?? request.source_commit?.commit_id;
}

async function readCommitSource(project, reference, backupIndex, options = {}) {
  const expectedPath = path.posix.join(
    project.manifest.paths.creation,
    "batches",
    `${reference.commit_id}.json`,
  );
  if (reference.path !== expectedPath) {
    throw commandError(
      "restore-source-mismatch",
      `Creation commit path must be ${expectedPath}.`,
      { commit_id: reference.commit_id },
    );
  }
  const contents = await readFile(path.resolve(project.root, reference.path));
  if (sha256Bytes(contents) !== reference.sha256) {
    throw commandError(
      "restore-source-mismatch",
      `Creation commit hash differs: ${reference.path}`,
      { commit_id: reference.commit_id },
    );
  }
  const commit = JSON.parse(contents.toString("utf8"));
  const validation = validateCreationCommit(commit, options);
  if (!validation.valid || commit.commit_id !== reference.commit_id || commit.status !== "committed") {
    throw commandError(
      "restore-source-mismatch",
      `Creation commit is not a valid committed journal: ${formatErrors(validation.errors)}`,
      { commit_id: reference.commit_id, validation_errors: validation.errors },
    );
  }
  const files = [];
  let sourceScope = null;
  for (const file of commit.files) {
    if (file.action === "create") {
      if (file.backup_id !== null) {
        throw commandError("restore-source-mismatch", `Created path has an original backup: ${file.path}`);
      }
      files.push({
        path: file.path,
        action: file.action,
        input_sha256: file.input_sha256,
        output_sha256: file.output_sha256,
        backup_path: null,
      });
      continue;
    }
    const indexed = backupIndex.backups.find((entry) => entry.backup_id === file.backup_id);
    if (!indexed) {
      throw commandError(
        "restore-source-missing",
        `Creation commit backup is not indexed: ${file.backup_id}`,
        { commit_id: reference.commit_id, backup_id: file.backup_id },
      );
    }
    const originalManifest = JSON.parse(await readFile(path.resolve(project.root, indexed.manifest.path), "utf8"));
    const originalScope = {
      scope_id: originalManifest.scope_id,
      scope_fingerprint: originalManifest.scope_fingerprint,
    };
    if (
      originalManifest.scope_id !== commit.scope_before_id ||
      (sourceScope && JSON.stringify(sourceScope) !== JSON.stringify(originalScope))
    ) {
      throw commandError(
        "restore-source-mismatch",
        `Creation commit backup scope differs from its input scope: ${file.path}`,
        { commit_id: reference.commit_id, backup_id: file.backup_id },
      );
    }
    sourceScope = originalScope;
    const original = originalManifest.files.find((candidate) => candidate.path === file.path);
    if (
      !original ||
      original.action !== file.action ||
      original.input_sha256 !== file.input_sha256 ||
      original.output_sha256 !== file.output_sha256
    ) {
      throw commandError(
        "restore-source-mismatch",
        `Creation commit action differs from its indexed backup: ${file.path}`,
        { commit_id: reference.commit_id, backup_id: file.backup_id },
      );
    }
    files.push({
      path: file.path,
      action: file.action,
      input_sha256: file.input_sha256,
      output_sha256: file.output_sha256,
      backup_path: original.backup_path,
    });
  }
  return { operation: "creation-commit", files, ...sourceScope };
}
