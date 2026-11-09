#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  inspectExecutionReceipts,
  validateManifest,
  validateTracker,
} from "./lib/index.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/status.mjs --manifest FILE [--scope-id ID] [--json]

Report current scope, pending action, and execution-receipt coverage without
reading manuscript content or comparing historical output hashes. --scope-id
limits the execution summary to one target scope. Missing receipts are valid
intermediate state and do not set a nonzero exit status.`);
}

function options(args) {
  const result = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest" && args[index + 1]) result.manifest = path.resolve(args[++index]);
    else if (args[index] === "--scope-id" && args[index + 1]) result.scopeId = args[++index];
    else if (args[index] === "--json") result.json = true;
    else throw argumentError(`Unknown or incomplete argument: ${args[index]}`);
  }
  if (!result.manifest) throw argumentError("--manifest FILE is required");
  return result;
}

function validationMessage(result) {
  return result.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
    return;
  }
  const selection = options(args);
  const manifest = JSON.parse(await readFile(selection.manifest, "utf8"));
  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    throw new Error(`invalid v3.1 manifest: ${validationMessage(manifestValidation)}`);
  }
  const trackerValidation = await validateTracker(manifest, selection.manifest);
  if (!trackerValidation.valid) {
    throw new Error(`invalid tracker: ${validationMessage(trackerValidation)}`);
  }
  const inspection = await inspectExecutionReceipts(manifest, selection.manifest, {
    scopeId: selection.scopeId,
  });
  if (!inspection.valid) {
    throw new Error(`invalid execution receipts: ${validationMessage(inspection)}`);
  }

  const result = {
    scope: manifest.current_scope
      ? {
          scope_id: manifest.current_scope.scope_id,
          status: manifest.current_scope.status,
        }
      : null,
    pending_action: manifest.pending_action
      ? {
          operation: manifest.pending_action.operation,
          status: manifest.pending_action.status,
          scope_id: manifest.pending_action.scope_id,
        }
      : null,
    execution: {
      scope_id: selection.scopeId ?? null,
      ...inspection.summary,
    },
  };
  if (selection.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Scope: ${result.scope ? `${result.scope.scope_id} (${result.scope.status})` : "none recorded"}`);
  console.log(
    `Pending action: ${result.pending_action ? `${result.pending_action.operation} (${result.pending_action.status}; ${result.pending_action.scope_id})` : "none recorded"}`,
  );
  const execution = result.execution;
  console.log(
    `Execution evidence: ${execution.executed}/${execution.required} approved edit or restore batches verified`,
  );
  console.log(`Unverified approvals: ${execution.unverified_count}`);
  for (const approval of execution.unverified.slice(0, 8)) {
    console.log(`- ${approval.approval_id} (${approval.type}; ${approval.operation}; ${approval.scope_id})`);
  }
  if (execution.unverified_count > 8) {
    console.log(`- ... ${execution.unverified_count - 8} more; use --json for the complete list`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
