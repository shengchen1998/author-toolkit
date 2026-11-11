#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { inspectProjectStatus } from "./lib/index.mjs";
import { validateManifest } from "./lib/manifest.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/status.mjs --manifest FILE [--scope-id ID] [--require-execution] [--json]

Report current scope, pending action, recorded stale or blocked state, and
execution-receipt coverage without reading manuscript content or comparing
historical output hashes. --scope-id limits blocked-pending and execution results
to one target scope; stale findings remain project-wide because tracker finding rows
have no scope ID. Missing receipts are valid intermediate state and do not set a
nonzero exit status unless --require-execution is present with --scope-id. The strict
check exits 1 for unverified approvals in the selected scope. Operation-specific
evidence completeness is not evaluated.`);
}

function concise(value, limit = 240) {
  const characters = [...String(value).replace(/\s+/g, " ").trim()];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

function options(args) {
  const result = { json: false, requireExecution: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest" && args[index + 1]) result.manifest = path.resolve(args[++index]);
    else if (args[index] === "--scope-id" && args[index + 1]) result.scopeId = args[++index];
    else if (args[index] === "--require-execution") result.requireExecution = true;
    else if (args[index] === "--json") result.json = true;
    else throw argumentError(`Unknown or incomplete argument: ${args[index]}`);
  }
  if (!result.manifest) throw argumentError("--manifest FILE is required");
  if (result.requireExecution && !result.scopeId) {
    throw argumentError("--require-execution requires --scope-id ID");
  }
  return result;
}

function outputText(result) {
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
  const blockers = result.recorded_blockers;
  console.log(`Recorded stale findings (all scopes): ${blockers.stale_finding_count}`);
  for (const finding of blockers.stale_findings.slice(0, 8)) {
    console.log(
      `- ${finding.finding_id} (${finding.operation}; ${concise(finding.location, 120)}): ${concise(finding.reason, 160)}`,
    );
  }
  if (blockers.stale_findings.length > 8) {
    console.log(`- ... ${blockers.stale_findings.length - 8} more; use --json for the complete list`);
  }
  const blocked = blockers.blocked_pending_action;
  console.log(
    `Blocked pending action: ${blocked ? `${blocked.operation} (${blocked.scope_id}): ${concise(blocked.reason)}` : result.execution.scope_id ? "none recorded in selected scope" : "none recorded"}`,
  );
  console.log("Operation-specific evidence: not evaluated; use validate and the active strategy's operation gates");
  console.log("Navigation: use author-project status --digest and PROJECT_STATE.md");
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
  const result = await inspectProjectStatus(manifest, selection.manifest, selection);
  if (selection.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    outputText(result);
  }
  if (selection.requireExecution && result.execution.unverified_count > 0) {
    console.error(
      `Execution gate failed: ${result.execution.unverified_count} unverified approvals in scope ${selection.scopeId}`,
    );
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
