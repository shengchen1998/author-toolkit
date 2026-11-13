import { readFile } from "node:fs/promises";
import path from "node:path";

import { inspectExecutionReceipts } from "./execution-receipts.mjs";
import { validateManifest } from "./manifest.mjs";
import { projectRootFromManifest } from "./project-files.mjs";
import { parseApprovalsMarkdown } from "./tracker.mjs";

function diagnosticError(instancePath, message) {
  return { instancePath, message };
}

function recordsByError(index, errors) {
  const records = new Map();
  for (const error of errors) {
    const match = /^\/(backups|pending_backups)\/(\d+)(?:\/|$)/.exec(error.instancePath);
    if (!match) continue;
    const key = `${match[1]}/${match[2]}`;
    if (!records.has(key)) {
      const collection = match[1] === "backups" ? "backups" : "pending_backups";
      records.set(key, {
        collection,
        index: Number(match[2]),
        record: index?.[collection]?.[Number(match[2])] ?? null,
        errors: [],
      });
    }
    records.get(key).errors.push(error);
  }
  return records;
}

function approvalExplanation(approval) {
  if (!approval) return null;
  return {
    type: approval.type,
    operation: approval.operation,
    scope_id: approval.scopeId,
    paths: approval.paths,
    status: approval.status,
  };
}

function nonWriteApprovalExplanation(approval) {
  if (!approval || ["edit", "restore"].includes(approval.type)) return null;
  return {
    code: "non_write_approval",
    approval_type: approval.type,
    message: `A ${approval.type} approval records a decision and cannot authorize a write or supply a write backup identity; check whether the actual write lacked its own edit approval.`,
  };
}

export async function explainBackupIndex(manifest, manifestPath) {
  const result = {
    valid: false,
    read_only: true,
    index_path: null,
    tracker_path: null,
    errors: [],
    records: [],
    next_actions: [],
  };
  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    result.errors.push(...manifestValidation.errors);
    return result;
  }

  const projectRoot = projectRootFromManifest(manifestPath);
  const indexPath = path.resolve(projectRoot, manifest.paths.backups, "index.json");
  const trackerPath = path.resolve(projectRoot, manifest.paths.audit_tracker);
  result.index_path = path.relative(projectRoot, indexPath).replaceAll(path.sep, "/");
  result.tracker_path = path.relative(projectRoot, trackerPath).replaceAll(path.sep, "/");

  let index;
  let tracker;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    result.errors.push(diagnosticError("/paths/backups", `cannot read backup index: ${error.message}`));
  }
  try {
    tracker = parseApprovalsMarkdown(await readFile(trackerPath, "utf8"));
    result.errors.push(...tracker.errors);
  } catch (error) {
    result.errors.push(diagnosticError("/paths/audit_tracker", `cannot read audit tracker: ${error.message}`));
  }
  if (result.errors.length > 0) return result;

  const inspection = await inspectExecutionReceipts(manifest, manifestPath);
  const approvals = new Map(tracker.approvals.map((approval) => [approval.id, approval]));
  for (const record of recordsByError(index, inspection.errors).values()) {
    const backup = record.record;
    const approval = approvals.get(backup?.approval_id);
    const differences = [];
    if (approval && backup?.operation !== undefined && backup.operation !== approval.operation) {
      differences.push({ field: "operation", backup: backup.operation, approval: approval.operation });
    }
    if (approval && backup?.scope_id !== undefined && backup.scope_id !== approval.scopeId) {
      differences.push({ field: "scope_id", backup: backup.scope_id, approval: approval.scopeId });
    }
    result.records.push({
      collection: record.collection,
      index: record.index,
      backup_id: backup?.backup_id ?? null,
      approval_id: backup?.approval_id ?? null,
      manifest_path: backup?.manifest_path ?? null,
      backup: backup
        ? { operation: backup.operation ?? null, scope_id: backup.scope_id ?? null }
        : null,
      approval: approvalExplanation(approval),
      diagnosis: nonWriteApprovalExplanation(approval),
      differences,
      errors: record.errors,
    });
  }
  result.errors.push(...inspection.errors.filter((error) => !/^\/(?:backups|pending_backups)\/\d+(?:\/|$)/.test(error.instancePath)));
  result.valid = result.errors.length === 0 && result.records.length === 0;
  if (!result.valid) {
    result.next_actions.push("Preserve the backup index, tracker, backup manifests, and preserved execution evidence; this command does not modify them.");
    result.next_actions.push("Reconcile the cited backup and approval identity with the author before any historical-index migration; do not infer which recorded operation or scope is correct from a field mismatch alone.");
    if (result.records.some((record) => record.diagnosis?.code === "non_write_approval")) {
      result.next_actions.push("For a cited plan or other non-write approval, check the plan, session, and tracker for a separately recorded edit approval for the actual operation, exact paths, actions, and input versions; its absence does not establish which historical value to change.");
    }
    result.next_actions.push("Use writes.mjs reconcile-executions only with preserved post-write evidence for missing execution receipts; it does not repair backup identity mismatches.");
  }
  return result;
}
