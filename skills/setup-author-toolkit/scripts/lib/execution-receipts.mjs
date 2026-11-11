import { readFile } from "node:fs/promises";
import path from "node:path";

import { projectRootFromManifest } from "./project-files.mjs";
import { validateBackupIndexSchema, validateExecutionEvidenceSchema, validateExecutionReceiptSchema } from "./schemas.mjs";
import { sha256 } from "./state-files.mjs";
import { parseApprovalsMarkdown } from "./tracker.mjs";

function executionError(instancePath, message, keyword = "execution-receipt") {
  return { instancePath, keyword, message, params: {} };
}

function objectValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function emptySummary() {
  return {
    required: 0,
    executed: 0,
    unverified_count: 0,
    unverified: [],
    receipts: 0,
    restorations: 0,
  };
}

function validateFileActions(receipt, receiptIndex, errors) {
  const paths = new Set();
  for (const [fileIndex, file] of receipt.files.entries()) {
    const filePath = `/executions/${receiptIndex}/files/${fileIndex}`;
    if (paths.has(file.path)) {
      errors.push(executionError(`${filePath}/path`, `duplicate receipt path: ${file.path}`));
    }
    paths.add(file.path);

    if (file.action === "create" && file.input_sha256 !== null) {
      errors.push(
        executionError(`${filePath}/input_sha256`, "a created path must have a null input hash"),
      );
    }
    if (file.action !== "create" && file.input_sha256 === null) {
      errors.push(
        executionError(`${filePath}/input_sha256`, "an existing path requires its input hash"),
      );
    }
    if (file.action === "delete" && file.output_sha256 !== null) {
      errors.push(
        executionError(`${filePath}/output_sha256`, "a deleted path must have a null output hash"),
      );
    }
    if (file.action !== "delete" && file.output_sha256 === null) {
      errors.push(
        executionError(`${filePath}/output_sha256`, "a non-deleted path requires its output hash"),
      );
    }
  }

  if (receipt.files.some((file) => file.action !== "create") && receipt.backup_ids.length === 0) {
    errors.push(
      executionError(
        `/executions/${receiptIndex}/backup_ids`,
        "a receipt for an existing path must cite at least one backup",
      ),
    );
  }
}

function samePaths(approvalPaths, receiptFiles) {
  const expected = [...approvalPaths].sort();
  const actual = receiptFiles.map((file) => file.path).sort();
  return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
}

function sameEvidenceFiles(evidence, receipt) {
  const normalize = (files) => files.map((file) => [
    file.path,
    file.action,
    file.input_sha256,
    file.output_sha256,
  ]).sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(normalize(evidence.files)) === JSON.stringify(normalize(receipt.files));
}

function backupIdsForApproval(index, approvalId) {
  return (index.backups ?? []).filter((backup) => backup.approval_id === approvalId).map((backup) => backup.backup_id).sort();
}

function backupIdsMatch(index, receipt) {
  const pending = (index.pending_backups ?? []).filter((backup) => backup.approval_id === receipt.approval_id);
  const pendingIds = pending.filter((backup) => backup.files?.some((file) => file.backup_path !== null)).map((backup) => backup.backup_id).sort();
  return JSON.stringify([...backupIdsForApproval(index, receipt.approval_id), ...pendingIds].sort()) === JSON.stringify([...receipt.backup_ids].sort());
}

function validateReceiptInputs(receipt, receiptIndex, backups, errors) {
  for (const [fileIndex, file] of receipt.files.entries()) {
    let foundInput = false;
    for (const backupId of receipt.backup_ids) {
      const backup = backups.get(backupId);
      if (!objectValue(backup?.input_hashes) || !Object.hasOwn(backup.input_hashes, file.path)) {
        continue;
      }
      foundInput = true;
      if (backup.input_hashes[file.path] !== file.input_sha256) {
        errors.push(
          executionError(
            `/executions/${receiptIndex}/files/${fileIndex}/input_sha256`,
            `receipt input hash does not match backup ${backupId} for ${file.path}`,
            "execution-input",
          ),
        );
      }
    }
    if (file.action !== "create" && !foundInput) {
      errors.push(
        executionError(
          `/executions/${receiptIndex}/files/${fileIndex}/input_sha256`,
          `no cited backup contains the input hash for ${file.path}`,
          "execution-input",
        ),
      );
    }
  }
}

export async function inspectExecutionReceipts(manifest, manifestPath, { scopeId } = {}) {
  const projectRoot = projectRootFromManifest(manifestPath);
  const trackerPath = path.resolve(projectRoot, manifest.paths.audit_tracker);
  const indexPath = path.resolve(projectRoot, manifest.paths.backups, "index.json");
  const errors = [];
  let tracker;
  let index;

  try {
    tracker = parseApprovalsMarkdown(await readFile(trackerPath, "utf8"));
    errors.push(...tracker.errors);
  } catch (error) {
    errors.push(executionError("/paths/audit_tracker", `cannot read audit tracker: ${error.message}`));
  }
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    errors.push(executionError("/paths/backups", `cannot read backup index: ${error.message}`));
  }
  if (errors.length > 0) return { valid: false, errors, summary: emptySummary() };

  const indexSchema = validateBackupIndexSchema(index);
  if (!indexSchema.valid) errors.push(...indexSchema.errors);
  if (!objectValue(index) || index.schema_version !== "1.0") {
    errors.push(executionError("/schema_version", "backup index schema_version must be 1.0"));
  }
  for (const field of ["backups", "restorations"]) {
    if (!Array.isArray(index?.[field])) {
      errors.push(executionError(`/${field}`, `${field} must be an array`));
    }
  }
  if (index?.executions !== undefined && !Array.isArray(index.executions)) {
    errors.push(executionError("/executions", "executions must be an array"));
  }
  if (index?.pending_backups !== undefined) {
    const pending = validateBackupIndexSchema({ schema_version: index.schema_version, backups: [], restorations: [], pending_backups: index.pending_backups });
    errors.push(...pending.errors.map((error) => ({ ...error, instancePath: `/pending_backups${error.instancePath.replace(/^\/pending_backups/, "")}` })));
  }
  if (errors.length > 0) return { valid: false, errors, summary: emptySummary() };

  const approvals = new Map(tracker.approvals.map((approval) => [approval.id, approval]));
  const backups = new Map();
  for (const [recordIndex, record] of index.backups.entries()) {
    const recordPath = `/backups/${recordIndex}`;
    if (!objectValue(record)) {
      errors.push(executionError(recordPath, "backup record must be an object"));
      continue;
    }
    if (typeof record.backup_id !== "string" || !record.backup_id) {
      errors.push(executionError(`${recordPath}/backup_id`, "backup_id is required"));
      continue;
    }
    if (backups.has(record.backup_id)) {
      errors.push(executionError(`${recordPath}/backup_id`, `duplicate backup ID: ${record.backup_id}`));
    }
    if (typeof record.approval_id !== "string" || !record.approval_id) {
      errors.push(executionError(`${recordPath}/approval_id`, "approval_id is required"));
    }
    backups.set(record.backup_id, record);
    const approval = approvals.get(record.approval_id);
    if (approval && record.operation !== undefined && record.scope_id !== undefined && (record.operation !== approval.operation || record.scope_id !== approval.scopeId)) {
      errors.push(executionError(`${recordPath}/scope_id`, "backup operation and scope must match its approval"));
    }
    if (record.manifest_path && record.input_hashes) {
      try {
        const manifest = JSON.parse(await readFile(path.resolve(projectRoot, record.manifest_path), "utf8"));
        if (manifest.backup_id !== record.backup_id || manifest.approval_id !== record.approval_id || JSON.stringify(manifest.input_hashes) !== JSON.stringify(record.input_hashes)) {
          errors.push(executionError(`${recordPath}/manifest_path`, "backup manifest identity does not match its index record"));
        }
        for (const [fileIndex, file] of (record.files ?? []).entries()) {
          if (file.backup_path === null) continue;
          const expected = record.input_hashes[file.source_path];
          const actual = sha256(await readFile(path.resolve(projectRoot, file.backup_path)));
          if (actual !== expected) errors.push(executionError(`${recordPath}/files/${fileIndex}/backup_path`, "backup content hash does not match its recorded input"));
        }
      } catch (error) {
        errors.push(executionError(`${recordPath}/manifest_path`, `cannot verify backup preservation: ${error.message}`));
      }
    }
    if (record.operation !== undefined && record.scope_id !== undefined && record.manifest_path && !approval) {
      errors.push(executionError(`${recordPath}/approval_id`, `unknown approval ID: ${record.approval_id}`));
    }
  }
  for (const [recordIndex, record] of (index.pending_backups ?? []).entries()) {
    if (backups.has(record.backup_id)) {
      errors.push(executionError(`/pending_backups/${recordIndex}/backup_id`, `duplicate backup ID: ${record.backup_id}`));
      continue;
    }
    backups.set(record.backup_id, record);
    const approval = approvals.get(record.approval_id);
    if (approval && (record.operation !== approval.operation || record.scope_id !== approval.scopeId)) {
      errors.push(executionError(`/pending_backups/${recordIndex}/scope_id`, "backup operation and scope must match its approval"));
    }
    if (index.backups.some((backup) => backup.approval_id === record.approval_id)) {
      errors.push(executionError(`/pending_backups/${recordIndex}/approval_id`, "an approval cannot have both a backup and a pending backup"));
    }
    try {
      const preserved = JSON.parse(await readFile(path.resolve(projectRoot, record.manifest_path), "utf8"));
      if (JSON.stringify({ ...preserved, manifest_path: record.manifest_path }) !== JSON.stringify(record)) {
        errors.push(executionError(`/pending_backups/${recordIndex}/manifest_path`, "pending backup manifest does not match its index record"));
      }
      for (const file of record.files ?? []) {
        if (file.backup_path !== null && sha256(await readFile(path.resolve(projectRoot, file.backup_path))) !== record.input_hashes[file.source_path]) {
          errors.push(executionError(`/pending_backups/${recordIndex}/files`, "pending backup content hash does not match its recorded input"));
        }
      }
    } catch (error) {
      errors.push(executionError(`/pending_backups/${recordIndex}/manifest_path`, `cannot verify pending backup: ${error.message}`));
    }
  }

  const restorations = new Map();
  for (const [recordIndex, record] of (index.restorations ?? []).entries()) {
    const recordPath = `/restorations/${recordIndex}`;
    if (!objectValue(record) || typeof record.approval_id !== "string" || !record.approval_id) {
      errors.push(executionError(`${recordPath}/approval_id`, "restoration approval_id is required"));
      continue;
    }
    if (restorations.has(record.approval_id)) {
      errors.push(
        executionError(
          `${recordPath}/approval_id`,
          `duplicate restoration for approval: ${record.approval_id}`,
        ),
      );
    }
    restorations.set(record.approval_id, record);
    const approval = approvals.get(record.approval_id);
    if (!approval) {
      errors.push(
        executionError(`${recordPath}/approval_id`, `unknown approval ID: ${record.approval_id}`),
      );
    } else {
      if (approval.type !== "restore") {
        errors.push(
          executionError(`${recordPath}/approval_id`, "a restoration must cite a restore approval"),
        );
      }
      if (record.scope_id !== undefined && record.scope_id !== approval.scopeId) {
        errors.push(executionError(`${recordPath}/scope_id`, "restoration scope does not match approval"));
      }
    }
  }

  const executions = new Map();
  for (const [receiptIndex, receipt] of (index.executions ?? []).entries()) {
    const receiptPath = `/executions/${receiptIndex}`;
    const schemaResult = validateExecutionReceiptSchema(receipt);
    if (!schemaResult.valid) {
      for (const error of schemaResult.errors) {
        errors.push({ ...error, instancePath: `${receiptPath}${error.instancePath}` });
      }
      continue;
    }
    if (executions.has(receipt.approval_id)) {
      errors.push(
        executionError(
          `${receiptPath}/approval_id`,
          `duplicate execution receipt for approval: ${receipt.approval_id}`,
        ),
      );
    }
    executions.set(receipt.approval_id, receipt);

    const approval = approvals.get(receipt.approval_id);
    if (!approval) {
      errors.push(
        executionError(`${receiptPath}/approval_id`, `unknown approval ID: ${receipt.approval_id}`),
      );
    } else {
      if (approval.type !== "edit") {
        errors.push(
          executionError(`${receiptPath}/approval_id`, "an execution receipt must cite an edit approval"),
        );
      }
      if (receipt.operation !== approval.operation) {
        errors.push(
          executionError(`${receiptPath}/operation`, "execution operation does not match approval"),
        );
      }
      if (receipt.scope_id !== approval.scopeId) {
        errors.push(executionError(`${receiptPath}/scope_id`, "execution scope does not match approval"));
      }
      if (!samePaths(approval.paths, receipt.files)) {
        errors.push(
          executionError(`${receiptPath}/files`, "execution paths do not exactly match approval paths"),
        );
      }
    }

    validateFileActions(receipt, receiptIndex, errors);
    for (const [backupIndex, backupId] of receipt.backup_ids.entries()) {
      const backup = backups.get(backupId);
      if (!backup) {
        errors.push(
          executionError(`${receiptPath}/backup_ids/${backupIndex}`, `unknown backup ID: ${backupId}`),
        );
      } else if (backup.approval_id !== receipt.approval_id) {
        errors.push(
          executionError(
            `${receiptPath}/backup_ids/${backupIndex}`,
            "backup approval does not match execution approval",
          ),
        );
      }
    }
    validateReceiptInputs(receipt, receiptIndex, backups, errors);
    if (!backupIdsMatch(index, receipt)) {
      errors.push(executionError(`${receiptPath}/backup_ids`, "receipt must cite every backup belonging to its approval"));
    }
    if (receipt.evidence) {
      const evidencePath = path.resolve(projectRoot, receipt.evidence.path);
      try {
        const contents = await readFile(evidencePath);
        if (sha256(contents) !== receipt.evidence.sha256) {
          errors.push(executionError(`${receiptPath}/evidence/sha256`, "execution evidence hash does not match its preserved file"));
        } else {
          const evidence = JSON.parse(contents.toString("utf8"));
          const evidenceValidation = validateExecutionEvidenceSchema(evidence);
          if (!evidenceValidation.valid) {
            errors.push(executionError(`${receiptPath}/evidence/path`, "preserved execution evidence is invalid"));
          } else if (
            evidence.approval_id !== receipt.approval_id ||
            evidence.operation !== receipt.operation ||
            evidence.scope_id !== receipt.scope_id ||
            JSON.stringify(evidence.backup_ids) !== JSON.stringify(receipt.backup_ids) ||
            !sameEvidenceFiles(evidence, receipt)
          ) {
            errors.push(executionError(`${receiptPath}/evidence`, "preserved execution evidence does not match the receipt"));
          }
        }
      } catch (error) {
        errors.push(executionError(`${receiptPath}/evidence/path`, `cannot read preserved execution evidence: ${error.message}`));
      }
    }
  }

  const required = tracker.approvals.filter(
    (approval) =>
      approval.status === "approved" &&
      ["edit", "restore"].includes(approval.type) &&
      (!scopeId || approval.scopeId === scopeId),
  );
  const unverified = required
    .filter((approval) => {
      const receipt = approval.type === "edit" ? executions.get(approval.id) : restorations.get(approval.id);
      return !receipt;
    })
    .map((approval) => ({
      approval_id: approval.id,
      type: approval.type,
      operation: approval.operation,
      scope_id: approval.scopeId,
      paths: approval.paths,
    }));
  const summary = {
    required: required.length,
    executed: required.length - unverified.length,
    unverified_count: unverified.length,
    unverified,
    receipts: executions.size,
    restorations: restorations.size,
  };
  return { valid: errors.length === 0, errors, summary };
}

export function validateExecutionReceiptBatch(index, approvals) {
  const errors = [];
  const receipts = new Map();
  const backupApprovals = new Map();
  const allBackups = [...(index.backups ?? []), ...(index.pending_backups ?? [])];
  for (const [backupIndex, backup] of allBackups.entries()) {
    if (backupApprovals.has(backup.backup_id)) {
      errors.push(executionError(`/backups/${backupIndex}/backup_id`, `duplicate backup ID: ${backup.backup_id}`));
    }
    backupApprovals.set(backup.backup_id, backup.approval_id);
  }
  for (const [receiptIndex, receipt] of (index.executions ?? []).entries()) {
    const receiptPath = `/executions/${receiptIndex}`;
    const schema = validateExecutionReceiptSchema(receipt);
    if (!schema.valid) {
      errors.push(...schema.errors.map((error) => ({ ...error, instancePath: `${receiptPath}${error.instancePath}` })));
      continue;
    }
    if (receipts.has(receipt.approval_id)) {
      errors.push(executionError(`${receiptPath}/approval_id`, `duplicate execution receipt for approval: ${receipt.approval_id}`));
      continue;
    }
    receipts.set(receipt.approval_id, receipt);
    const approval = approvals.find((candidate) => candidate.id === receipt.approval_id);
    if (!approval || approval.type !== "edit") {
      errors.push(executionError(`${receiptPath}/approval_id`, "an execution receipt must cite an edit approval"));
      continue;
    }
    if (receipt.operation !== approval.operation || receipt.scope_id !== approval.scopeId || !samePaths(approval.paths, receipt.files)) {
      errors.push(executionError(receiptPath, "execution identity does not match its approval"));
    }
    validateFileActions(receipt, receiptIndex, errors);
    const backups = new Map(allBackups.map((backup) => [backup.backup_id, backup]));
    for (const [backupIndex, backupId] of receipt.backup_ids.entries()) {
      if (!backups.has(backupId)) {
        errors.push(executionError(`${receiptPath}/backup_ids/${backupIndex}`, `unknown backup ID: ${backupId}`));
      } else if (backups.get(backupId).approval_id !== receipt.approval_id) {
        errors.push(executionError(`${receiptPath}/backup_ids/${backupIndex}`, "backup approval does not match execution approval"));
      }
    }
    validateReceiptInputs(receipt, receiptIndex, backups, errors);
    if (!backupIdsMatch(index, receipt)) {
      errors.push(executionError(`${receiptPath}/backup_ids`, "receipt must cite every backup belonging to its approval"));
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function validateExecutionReceipts(manifest, manifestPath) {
  const { valid, errors } = await inspectExecutionReceipts(manifest, manifestPath);
  return { valid, errors };
}
