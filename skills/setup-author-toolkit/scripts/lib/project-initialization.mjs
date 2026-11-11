import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { explainBackupIndex } from "./backup-index-diagnostics.mjs";
import { validateManifest } from "./manifest.mjs";
import { projectRootFromManifest } from "./project-files.mjs";
import { inspectProjectManifest } from "./project-inspection.mjs";
import { failedCheck, manifestProjection } from "./read-projection.mjs";
import { writeJsonAtomic } from "./state-files.mjs";
import { withProjectWriteLock } from "./write-lock.mjs";

const diagnosticLimit = 12;

function initializationFailure(result) {
  const error = new Error("existing-project initialization requires a valid v3.1 manifest schema");
  error.code = "ERR_VALIDATION";
  error.result = result;
  return error;
}

function displayedChecks(checks) {
  return checks.map((check) => check.valid
    ? { path: check.path, valid: true, errors: [] }
    : failedCheck(check, false));
}

async function backupIndexDiagnosis(manifest, manifestPath) {
  const backupIndex = await explainBackupIndex(manifest, manifestPath);
  return {
    valid: backupIndex.valid,
    read_only: backupIndex.read_only,
    index_path: backupIndex.index_path,
    tracker_path: backupIndex.tracker_path,
    errors: backupIndex.errors.slice(0, diagnosticLimit),
    ...(backupIndex.errors.length > diagnosticLimit
      ? { omitted_error_count: backupIndex.errors.length - diagnosticLimit }
      : {}),
    records: backupIndex.records.slice(0, diagnosticLimit),
    ...(backupIndex.records.length > diagnosticLimit
      ? { omitted_record_count: backupIndex.records.length - diagnosticLimit }
      : {}),
    next_actions: backupIndex.next_actions,
  };
}

export async function initializeExistingProject(manifestPath) {
  let inspection = await inspectProjectManifest(manifestPath);
  if (!inspection.manifest || !validateManifest(inspection.manifest).valid) {
    throw initializationFailure({
      valid: false,
      schema_valid: false,
      manifest_path: manifestPath,
      backup_index: null,
      projection: null,
      validation: { valid: false, checks: displayedChecks(inspection.checks) },
    });
  }

  const projectRoot = projectRootFromManifest(manifestPath);
  const manifest = inspection.manifest;
  const indexPath = path.resolve(projectRoot, manifest.paths.backups, "index.json");
  let index;
  try {
    index = await readFile(indexPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let created = false;
  const createIndex = async () => {
    if (index !== undefined) return;
    await mkdir(path.dirname(indexPath), { recursive: true });
    await writeJsonAtomic(indexPath, {
      schema_version: "1.0",
      backups: [],
      restorations: [],
      executions: [],
    });
    created = true;
  };
  if (index === undefined) {
    await withProjectWriteLock(manifestPath, manifest, createIndex);
  }
  if (created) inspection = await inspectProjectManifest(manifestPath);

  const backupIndex = await backupIndexDiagnosis(manifest, manifestPath);
  const projection = await manifestProjection(manifest, projectRoot, { diagnostic: true });
  projection.verification = inspection.valid ? "validated" : "recorded_unverified";
  return {
    valid: inspection.valid,
    schema_valid: true,
    manifest_path: manifestPath,
    backup_index: {
      path: path.relative(projectRoot, indexPath).replaceAll(path.sep, "/"),
      status: created ? "created" : "preserved",
      valid: backupIndex.valid,
    },
    projection,
    validation: { valid: inspection.valid, checks: displayedChecks(inspection.checks) },
    ...(inspection.valid ? {} : { diagnosis: { read_only: true, backup_index: backupIndex } }),
  };
}
