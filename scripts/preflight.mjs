#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateProjectDigest } from "./lib/digest.mjs";
import { outputUnverifiedOperationGroups } from "./lib/execution-summary.mjs";
import { explainBackupIndex } from "./lib/backup-index-diagnostics.mjs";
import {
  inspectProjectManifest,
  inspectProjectStatus,
} from "./lib/project-inspection.mjs";
import { concise, failedCheck, manifestProjection } from "./lib/read-projection.mjs";
import { inspectSetupPayload } from "./lib/setup-payload.mjs";

const diagnosticLimit = 12;

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/preflight.mjs --project-root DIR [--scope-id ID]
                             [--require-execution] [--digest] [--diagnose] [--json]

Check the installed payload, project entry files, registered paths, current
manuscript hashes, tracker, execution receipts, and recorded blockers. Without
--scope-id, use the manifest's current scope ID when present. Ordinary status
reports unverified approvals without failing. --require-execution turns those
approvals into a failed execution gate and requires an explicit --scope-id.
--diagnose adds a bounded recorded-unverified projection and backup-index
explanation when validation fails. It changes no validation result or state.
--digest also refreshes PROJECT_STATE.md after the read-only checks pass.
The text output is a bounded summary. --json preserves ordinary complete results;
with --diagnose and failed validation, its displayed failure diagnostics are bounded.`);
}

function options(args) {
  const result = { digest: false, diagnose: false, json: false, requireExecution: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root" && args[index + 1]) {
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--scope-id" && args[index + 1]) {
      result.scopeId = args[++index];
    } else if (args[index] === "--require-execution") {
      result.requireExecution = true;
    } else if (args[index] === "--digest") {
      result.digest = true;
    } else if (args[index] === "--diagnose") {
      result.diagnose = true;
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
  if (result.diagnose && result.digest) {
    throw argumentError("--diagnose cannot be combined with --digest");
  }
  return result;
}

function errorDetails(errors) {
  return concise(errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
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
    diagnosis: null,
    execution_gate: null,
    digest: null,
  };
  if (payload.payload_failures.length > 0) return result;

  const validation = await inspectProjectManifest(manifestPath);
  const displayedChecks = selection.json && !selection.diagnose
    ? validation.checks
    : validation.checks.map((check) => check.valid ? { path: check.path, valid: true, errors: [] } : failedCheck(check, false));
  result.validation = {
    valid: validation.valid,
    checks: displayedChecks.map((check) => ({
      path: check.path,
      valid: check.valid,
      errors: check.errors,
      ...(check.summary ? { summary: check.summary } : {}),
      ...(check.omitted_error_count ? { omitted_error_count: check.omitted_error_count } : {}),
      ...(check.unsupported ? { unsupported: true } : {}),
    })),
  };
  if (!validation.valid) {
    if (selection.diagnose && validation.manifest) {
      const projection = await manifestProjection(validation.manifest, selection.projectRoot, { diagnostic: true });
      projection.verification = "recorded_unverified";
      const backupIndex = await explainBackupIndex(validation.manifest, manifestPath);
      result.diagnosis = {
        read_only: true,
        projection,
        backup_index: {
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
        },
      };
    }
    return result;
  }

  if (selection.diagnose) {
    result.diagnosis = {
      read_only: true,
      backup_index: await explainBackupIndex(validation.manifest, manifestPath),
    };
  }

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
    const checks = result.validation.checks;
    const failures = checks.filter((check) => !check.valid);
    console.log(
      `Project validation: ${checks.length} checks, ${failures.length} failures`,
    );
    for (const check of failures) {
      console.log(`- ${check.path}: ${errorDetails(check.errors)}`);
      if (check.omitted_error_count) console.log(`  ... ${check.omitted_error_count} more errors; use --json for bounded structured diagnostics`);
      if (check.summary) {
        console.log(`  Execution evidence: ${check.summary.executed}/${check.summary.required} verified; ${check.summary.unverified_count} unverified`);
        const groups = check.summary.unverified_by_operation;
        for (const group of groups.slice(0, 8)) {
          console.log(`  - ${group.operation}: ${group.count} (${group.first} … ${group.last})`);
        }
        if (groups.length > 8) console.log(`  - ... ${groups.length - 8} more operation groups; use --json for complete grouped counts`);
      }
    }
  }

  if (result.diagnosis?.projection) {
    const { projection, backup_index: backupIndex } = result.diagnosis;
    const scope = projection.current_scope;
    const pending = projection.pending_action;
    console.log("Recorded projection: unverified; displayed hashes are recorded values, not current-file verification");
    console.log(`Recorded scope: ${scope ? `${scope.scope_id} (${scope.status}); ${scope.files.length} recorded file hashes` : "none recorded"}`);
    console.log(`Recorded pending action: ${pending ? `${pending.operation} (${pending.status}; ${pending.scope_id})` : "none recorded"}`);
    if (pending) {
      console.log(`Pending artifacts: ${pending.artifact_count ?? "unavailable"}; ${pending.artifacts.length} bounded pointers shown in --json`);
      if (pending.artifact_count_error) console.log(`Pending artifact count error: ${pending.artifact_count_error}`);
    }
    console.log(`Backup index: ${backupIndex.valid ? "valid" : "invalid"}; ${backupIndex.records.length} conflicting records shown; read-only`);
    for (const record of backupIndex.records) {
      const differences = record.differences.map((difference) => `${difference.field}: backup=${difference.backup}, approval=${difference.approval}`).join("; ");
      console.log(`- ${record.collection}[${record.index}] ${record.backup_id ?? "unknown backup"} / ${record.approval_id ?? "unknown approval"}${differences ? `: ${concise(differences)}` : ""}`);
    }
    for (const error of backupIndex.errors) console.log(`- backup index: ${concise(`${error.instancePath || "/"} ${error.message}`)}`);
    if (backupIndex.omitted_record_count) console.log(`- ... ${backupIndex.omitted_record_count} more conflicting records; use --json for bounded structured diagnostics`);
    if (backupIndex.omitted_error_count) console.log(`- ... ${backupIndex.omitted_error_count} more backup-index errors; use --json for bounded structured diagnostics`);
    console.log("Diagnosis: recorded state only; no repairs or writes performed");
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
