#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateProjectDigest } from "./lib/digest.mjs";
import { outputUnverifiedOperationGroups } from "./lib/execution-summary.mjs";
import {
  inspectProjectManifest,
  inspectProjectStatus,
} from "./lib/project-inspection.mjs";
import { inspectSetupPayload } from "./lib/setup-payload.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/preflight.mjs --project-root DIR [--scope-id ID]
                             [--require-execution] [--digest] [--json]

Check the installed payload, project entry files, registered paths, current
manuscript hashes, tracker, execution receipts, and recorded blockers. Without
--scope-id, use the manifest's current scope ID when present. Ordinary status
reports unverified approvals without failing. --require-execution turns those
approvals into a failed execution gate and requires an explicit --scope-id.
--digest also refreshes PROJECT_STATE.md after the read-only checks pass.
The text output is a bounded summary; --json returns the complete results.`);
}

function options(args) {
  const result = { digest: false, json: false, requireExecution: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root" && args[index + 1]) {
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--scope-id" && args[index + 1]) {
      result.scopeId = args[++index];
    } else if (args[index] === "--require-execution") {
      result.requireExecution = true;
    } else if (args[index] === "--digest") {
      result.digest = true;
    } else if (args[index] === "--json") {
      result.json = true;
    } else {
      throw argumentError(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  if (!result.projectRoot) throw argumentError("--project-root DIR is required");
  if (result.requireExecution && !result.scopeId) {
    throw argumentError("--require-execution requires --scope-id ID");
  }
  return result;
}

function errorDetails(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function setupRoot() {
  const scriptRoot = fileURLToPath(new URL("../", import.meta.url));
  return existsSync(path.join(scriptRoot, "assets", "payload-manifest.json"))
    ? scriptRoot
    : path.join(scriptRoot, "skills", "setup-author-toolkit");
}

async function preflight(selection) {
  const payload = await inspectSetupPayload(setupRoot(), { projectRoot: selection.projectRoot });
  const manifestPath = path.join(selection.projectRoot, ".author-toolkit", "project.json");
  const result = {
    valid: false,
    payload,
    validation: null,
    status: null,
    execution_gate: null,
    digest: null,
  };
  if (payload.failures.some((failure) => !failure.path.startsWith("project:"))) return result;

  const validation = await inspectProjectManifest(manifestPath);
  result.validation = {
    valid: validation.valid,
    checks: validation.checks.map((check) => ({
      path: check.path,
      valid: check.valid,
      errors: check.errors,
      ...(check.unsupported ? { unsupported: true } : {}),
    })),
  };
  if (!validation.valid) return result;

  const scopeId = selection.scopeId ?? validation.manifest.current_scope?.scope_id;
  result.status = await inspectProjectStatus(validation.manifest, manifestPath, { scopeId });
  if (selection.requireExecution) {
    result.execution_gate = {
      scope_id: scopeId,
      unverified_count: result.status.execution.unverified_count,
      valid: result.status.execution.unverified_count === 0,
    };
  }

  if (selection.digest && result.execution_gate?.valid !== false) {
    const digest = await generateProjectDigest(selection.projectRoot);
    result.digest = { path: path.basename(digest.path), refreshed: true };
  }
  result.valid = result.execution_gate?.valid !== false;
  return result;
}

function outputText(result, selection) {
  const { payload } = result;
  console.log(
    `Setup payload: ${payload.files} files (${payload.references} references, ${payload.clis} CLIs); project entry files included`,
  );
  console.log(`Payload failures: ${payload.failures.length}`);
  for (const failure of payload.failures) console.log(`- ${failure.path}: ${failure.reason}`);

  if (result.validation) {
    const failures = result.validation.checks.filter((check) => !check.valid);
    console.log(
      `Project validation: ${result.validation.checks.length} checks, ${failures.length} failures`,
    );
    for (const check of failures) console.log(`- ${check.path}: ${errorDetails(check.errors)}`);
  }

  if (result.status) {
    const { status } = result;
    const pending = status.pending_action;
    console.log(
      `Scope: ${status.scope ? `${status.scope.scope_id} (${status.scope.status})` : "none recorded"}`,
    );
    console.log(
      `Pending action: ${pending ? `${pending.operation} (${pending.status}; ${pending.scope_id})` : "none recorded"}`,
    );
    console.log(
      `Execution evidence: ${status.execution.executed}/${status.execution.required} verified; ${status.execution.unverified_count} unverified`,
    );
    outputUnverifiedOperationGroups(status.execution.unverified);
    console.log(`Recorded stale findings (all scopes): ${status.recorded_blockers.stale_finding_count}`);
    console.log(
      `Blocked pending action: ${status.recorded_blockers.blocked_pending_action ? "recorded in selected scope" : "none recorded"}`,
    );
    console.log("Operation-specific evidence: not evaluated");
  }
  if (result.execution_gate) {
    console.log(`Execution gate: ${result.execution_gate.valid ? "passed" : "failed"}`);
  }
  const navigation = result.digest
    ? "refreshed PROJECT_STATE.md"
    : selection.digest
      ? "not refreshed; earlier checks failed"
      : "not requested";
  console.log(`Navigation cache: ${navigation}`);
  console.log(`Preflight: ${result.valid ? "passed" : "failed"}`);
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const result = await preflight(selection);
    if (selection.json) console.log(JSON.stringify(result, null, 2));
    else outputText(result, selection);
    if (!result.valid) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
