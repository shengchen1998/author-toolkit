#!/usr/bin/env node

import path from "node:path";

import { completeWrite, explainBackupIndex, reconcileExecutions, recordBackup, recordExecution } from "./lib/index.mjs";
import { readJson } from "./lib/state-files.mjs";
import { withProjectWriteLock } from "./lib/write-lock.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/writes.mjs record-backup --manifest FILE --operation ID
    --scope-id ID --approval-id ID --batch FILE [--backup-id ID]
    [--recorded-at TIMESTAMP]
  node scripts/writes.mjs complete-write --manifest FILE --operation ID
    --scope-id ID --approval-id ID --batch FILE [--commit FILE]
    [--recorded-at TIMESTAMP]
  node scripts/writes.mjs record-execution --manifest FILE --evidence FILE
    [--recorded-at TIMESTAMP]
  node scripts/writes.mjs check-index --manifest FILE --explain
  node scripts/writes.mjs reconcile-executions --manifest FILE --evidence FILE...
    [--write] [--recorded-at TIMESTAMP]

The backup batch JSON contains only a files array of path, action, and input_sha256.
complete-write additionally requires output_sha256 and UTF-8 content for every
non-delete action; delete requires null output_sha256 and content. It publishes
each file through a verified temporary sibling, preserves execution evidence,
and appends its receipt in one invocation. An optional creation commit journal
records written and verified transitions and remains in_progress for story-state
and scope publication. Multiple files are coordinated, not one filesystem transaction.
Evidence follows execution-evidence-schema.json. Backup refuses every new edit
batch while any unverified approval remains. Reconciliation is a dry run unless
--write is present; rejected evidence never creates a receipt. check-index
--explain is read-only and explains backup and approval identity differences
without selecting a historical repair or changing project state.`);
}

function options(args) {
  const result = { evidence: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write") result.write = true;
    else if (argument === "--explain") result.explain = true;
    else if (["--manifest", "--operation", "--scope-id", "--approval-id", "--batch", "--backup-id", "--evidence", "--recorded-at", "--commit"].includes(argument) && args[index + 1]) {
      const value = args[++index];
      if (argument === "--evidence") result.evidence.push(value);
      else result[{ "--manifest": "manifest", "--operation": "operation", "--scope-id": "scopeId", "--approval-id": "approvalId", "--batch": "batch", "--backup-id": "backupId", "--recorded-at": "recordedAt", "--commit": "commit" }[argument]] = value;
    } else throw argumentError(`Unknown or incomplete argument: ${argument}`);
  }
  return result;
}

async function execute(operation, selection) {
  if (operation === "check-index") {
    if (!selection.explain || Object.keys(selection).some((key) => !["manifest", "explain", "recordedAt", "evidence"].includes(key)) || selection.evidence.length > 0) {
      throw argumentError("check-index requires --explain and no write or batch-selection arguments");
    }
    const manifest = await readJson(selection.manifest);
    return explainBackupIndex(manifest, selection.manifest);
  }
  if (selection.explain) throw argumentError(`${operation} does not accept --explain`);
  if (operation === "record-backup") {
    if (!selection.operation || !selection.scopeId || !selection.approvalId || !selection.batch || selection.evidence.length > 0 || selection.write || selection.commit) {
      throw argumentError("record-backup requires operation, scope, approval, and one batch, without evidence or --write");
    }
    const batch = await readJson(path.resolve(selection.batch));
    if (!batch || !Array.isArray(batch.files) || batch.files.length === 0 || Object.keys(batch).some((key) => key !== "files")) {
      throw argumentError("batch JSON must contain only a nonempty files array");
    }
    return recordBackup(selection.manifest, { ...selection, files: batch.files });
  }
  if (operation === "complete-write") {
    if (!selection.operation || !selection.scopeId || !selection.approvalId || !selection.batch || selection.evidence.length > 0 || selection.write || selection.backupId) {
      throw argumentError("complete-write requires operation, scope, approval, and one publication batch");
    }
    const batch = await readJson(path.resolve(selection.batch));
    if (!batch || !Array.isArray(batch.files) || batch.files.length === 0 || Object.keys(batch).some((key) => key !== "files")) {
      throw argumentError("batch JSON must contain only a nonempty files array");
    }
    return completeWrite(selection.manifest, { ...selection, files: batch.files });
  }
  if (selection.evidence.length === 0 || selection.operation || selection.scopeId || selection.approvalId || selection.batch || selection.backupId) {
    throw argumentError(`${operation} requires evidence and no batch-selection arguments`);
  }
  if (operation === "record-execution") {
    if (selection.evidence.length !== 1 || selection.write) throw argumentError("record-execution requires exactly one evidence file and no --write");
    return recordExecution(selection.manifest, { ...selection, evidence: selection.evidence[0] });
  }
  return reconcileExecutions(selection.manifest, selection);
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const operation = args.shift();
    const selection = options(args);
    if (!selection.manifest || !["record-backup", "complete-write", "record-execution", "check-index", "reconcile-executions"].includes(operation)) {
      throw argumentError("expected record-backup, complete-write, record-execution, check-index, or reconcile-executions, plus --manifest FILE");
    }
    selection.manifest = path.resolve(selection.manifest);
    selection.recordedAt ??= new Date().toISOString();
    if (!Number.isFinite(Date.parse(selection.recordedAt))) throw argumentError("--recorded-at must be a valid timestamp");
    const result = operation === "check-index"
      ? await execute(operation, selection)
      : await withProjectWriteLock(selection.manifest, await readJson(selection.manifest), () => execute(operation, selection));
    console.log(JSON.stringify(result, null, 2));
    if (operation === "check-index" && !result.valid) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
