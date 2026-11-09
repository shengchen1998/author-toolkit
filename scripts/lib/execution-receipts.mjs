import { readFile } from "node:fs/promises";
import path from "node:path";

import { projectRootFromManifest } from "./project-files.mjs";
import { validateExecutionReceiptSchema } from "./schemas.mjs";
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

export async function validateExecutionReceipts(manifest, manifestPath) {
  const { valid, errors } = await inspectExecutionReceipts(manifest, manifestPath);
  return { valid, errors };
}
