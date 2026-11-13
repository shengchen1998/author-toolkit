#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateProjectDigest } from "./lib/digest.mjs";
import { outputUnverifiedOperationGroups, summarizeExecution } from "./lib/execution-summary.mjs";
import { auditExecutionRecovery } from "./lib/execution-recovery.mjs";
import { explainBackupIndex } from "./lib/backup-index-diagnostics.mjs";
import { inspectNavigationCache, markNavigationCacheStale } from "./lib/navigation-cache.mjs";
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
                             [--require-execution] [--digest] [--diagnose]
                             [--json] [--details]

Check the installed payload, project entry files, registered paths, current
manuscript hashes, tracker, execution receipts, and recorded blockers. Without
--scope-id, use the manifest's current scope ID when present. Ordinary status
reports unverified approvals without failing. --require-execution turns those
approvals into a failed execution gate and requires an explicit --scope-id.
Project entry failures do not stop project inspection, but fail preflight and
prevent digest generation.
--diagnose adds a read-only execution-recovery audit and, when validation fails,
a bounded recorded-unverified projection and backup-index explanation. It
previews evidence reconciliation without changing validation results or state.
--digest also refreshes PROJECT_STATE.md after the read-only checks pass.
The cache check recognizes the current format and marks older or failed-state
caches stale without displaying their recorded next action or changing files.
The text output is a bounded summary. --json also groups unverified approvals
by operation and bounds failed-check diagnostics. --details restores complete
failed checks and every unverified approval in JSON without changing text output.
Text output labels project-validation errors as blocking. Unverified approvals
are non-blocking during ordinary status and fail only an explicit strict gate.
Four independent setup statuses distinguish installation, project state, the
requested strategy gate, and author-confirmed host visibility. The CLI cannot
confirm host visibility and always reports it as unverified.`);
}

function options(args) {
  const result = { details: false, digest: false, diagnose: false, json: false, requireExecution: false };
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
    } else if (args[index] === "--details") {
      result.details = true;
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
    setup: {
      installation: "failed",
      project_state: "not_checked",
      strategy_gate: selection.requireExecution ? "blocked_by_project_state" : "not_requested",
      host_visibility: "unverified",
    },
    validation: null,
    status: null,
    diagnosis: null,
    execution_gate: null,
    digest: null,
    navigation_cache: null,
  };
  if (payload.payload_failures.length > 0) return result;
  result.setup.installation = payload.entry_failures.length === 0 ? "passed" : "failed";

  result.navigation_cache = await inspectNavigationCache(selection.projectRoot);
  const validation = await inspectProjectManifest(manifestPath);
  const displayedChecks = selection.json && selection.details
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
  result.setup.project_state = validation.valid ? "passed" : "failed";
  if (!validation.valid) {
    markNavigationCacheStale(result.navigation_cache, "current project validation failed");
    if (selection.diagnose && validation.manifest) {
      const diagnosisScopeId = selection.scopeId ?? validation.manifest.current_scope?.scope_id;
      const projection = await manifestProjection(validation.manifest, selection.projectRoot, { diagnostic: true });
      projection.verification = "recorded_unverified";
      const scopeCheck = validation.checks.find((check) => check.path === "scope");
      const currentHashes = scopeCheck?.valid && validation.manifest.current_scope
        ? {
            verified: true,
            matched: validation.manifest.current_scope.files.length,
            total: validation.manifest.current_scope.files.length,
          }
        : { verified: false };
      const backupIndex = await explainBackupIndex(validation.manifest, manifestPath);
      result.diagnosis = {
        read_only: true,
        execution_recovery: await auditExecutionRecovery(validation.manifest, manifestPath, { scopeId: diagnosisScopeId }),
        projection,
        current_hashes: currentHashes,
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
    const scopeId = selection.scopeId ?? validation.manifest.current_scope?.scope_id;
    result.diagnosis = {
      read_only: true,
      execution_recovery: await auditExecutionRecovery(validation.manifest, manifestPath, { scopeId }),
      backup_index: await explainBackupIndex(validation.manifest, manifestPath),
    };
  }

  const scopeId = selection.scopeId ?? validation.manifest.current_scope?.scope_id;
  result.status = await inspectProjectStatus(validation.manifest, manifestPath, { scopeId });
  if (selection.json && !selection.details) {
    result.status.execution = summarizeExecution(result.status.execution);
  }
  if (selection.requireExecution) {
    result.execution_gate = {
      scope_id: scopeId,
      unverified_count: result.status.execution.unverified_count,
      valid: result.status.execution.unverified_count === 0,
    };
    result.setup.strategy_gate = result.execution_gate.valid ? "passed" : "failed";
    if (!result.execution_gate.valid) {
      markNavigationCacheStale(result.navigation_cache, "strict execution gate failed");
    }
  }

  if (selection.digest && payload.entry_failures.length === 0 && result.execution_gate?.valid !== false) {
    const digest = await generateProjectDigest(selection.projectRoot);
    result.digest = { path: path.basename(digest.path), refreshed: true };
    result.navigation_cache = await inspectNavigationCache(selection.projectRoot);
  }
  result.valid = payload.entry_failures.length === 0 && result.execution_gate?.valid !== false;
  return result;
}

function outputText(result, selection) {
  const { payload } = result;
  console.log(
    `Setup payload: ${payload.files} files (${payload.references} references, ${payload.clis} CLIs); project entry files included`,
  );
  console.log(`Payload failures: ${payload.payload_failures.length}`);
  for (const failure of payload.payload_failures) console.log(`Blocking payload error: ${failure.path}: ${failure.reason}`);
  console.log(`Entry files: ${payload.entry_failures.length === 0 ? "pass" : "fail"}`);
  for (const failure of payload.entry_failures) console.log(`Blocking entry-file error: ${failure.path}: ${failure.reason}`);
  console.log(`Installation: ${result.setup.installation}`);
  console.log(`Project state: ${result.setup.project_state.replaceAll("_", " ")}`);
  console.log(`Strategy gate: ${result.setup.strategy_gate.replaceAll("_", " ")}`);
  console.log(`Host visibility: ${result.setup.host_visibility}`);
  if (result.setup.installation === "passed" && result.setup.project_state === "failed") {
    console.log("Setup diagnosis: toolkit installed; project-state evidence requires attention");
  } else if (result.setup.installation === "passed" && result.setup.strategy_gate === "failed") {
    console.log("Setup diagnosis: toolkit installed; evidence-dependent operations are blocked");
  }

  if (result.validation) {
    const checks = result.validation.checks;
    const failures = checks.filter((check) => !check.valid);
    console.log(`Blocking project validation: ${checks.length} checks, ${failures.length} failures`);
    for (const check of failures) {
      console.log(`Blocking error: ${check.path}: ${errorDetails(check.errors)}`);
      if (check.omitted_error_count) console.log(`  ... ${check.omitted_error_count} more errors; use --json for bounded structured diagnostics`);
      if (check.summary) {
        console.log(`  Non-blocking unverified approvals: ${check.summary.unverified_count}; ${check.summary.executed}/${check.summary.required} execution receipts verified`);
        if (check.summary.unverified_count > 0) console.log("  Ordinary status: non-blocking; strict execution gate: failed");
        const groups = check.summary.unverified_by_operation;
        for (const group of groups.slice(0, 8)) {
          console.log(`  - ${group.operation}: ${group.count} (${group.first} … ${group.last})`);
        }
        if (groups.length > 8) console.log(`  - ... ${groups.length - 8} more operation groups; use --json for complete grouped counts`);
      }
    }
  }

  if (result.diagnosis?.projection) {
    const { projection, current_hashes: currentHashes, backup_index: backupIndex } = result.diagnosis;
    const scope = projection.current_scope;
    const pending = projection.pending_action;
    console.log("Recorded projection: recorded only; overall project validation failed");
    console.log(`Recorded scope: ${scope ? `${scope.scope_id} (${scope.status}); ${scope.files.length} recorded file hashes` : "none recorded"}`);
    if (currentHashes.verified) {
      console.log(`Current hashes: independently verified; ${currentHashes.matched}/${currentHashes.total} current files match the recorded hashes`);
    }
    if (scope) {
      for (const file of scope.files.slice(0, diagnosticLimit)) {
        console.log(`- ${file.path}: ${file.sha256}`);
      }
      if (scope.files.length > diagnosticLimit) console.log(`- ... ${scope.files.length - diagnosticLimit} more recorded file hashes; use --json for the bounded structured projection`);
    }
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
    console.log(`Diagnosis: ${currentHashes.verified ? "current hashes verified; remaining projection recorded only" : "recorded state only"}; no repairs or writes performed`);
  }

  if (result.diagnosis?.execution_recovery) {
    const recovery = result.diagnosis.execution_recovery;
    if (recovery.status === "available") {
      console.log(
        `Execution recovery: ${recovery.reconcilable_count} reconcilable; ${recovery.unsupported_count} of ${recovery.unverified_count} unverified approvals lack usable evidence`,
      );
      console.log(
        `Recovery audit: ${recovery.evidence_file_count} valid evidence files in ${recovery.scanned_file_count} JSON files; ${recovery.candidate_file_count} candidates for the selected scope`,
      );
      for (const candidate of recovery.candidates) {
        console.log(`- ${candidate.path}: ${candidate.approval_id} (${candidate.status})${candidate.reason ? `: ${concise(candidate.reason)}` : ""}`);
      }
      if (recovery.omitted_candidate_count) console.log(`- ... ${recovery.omitted_candidate_count} more evidence candidates; use --json for bounded structured diagnostics`);
      console.log("Current-draft revision convergence: not established by this execution-only audit");
      console.log(
        recovery.reconcilable_count > 0
          ? "Next action: preview and reconcile usable evidence, then rerun the strict gate and remaining strategy checks"
          : "Next action: stop repeating reconciliation; ask the author to locate new evidence or end recovery without establishing current-draft revision convergence",
      );
    } else if (recovery.status === "unavailable") {
      console.log(`Execution recovery: unavailable; ${recovery.errors.join("; ")}`);
    }
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
    console.log(`Non-blocking unverified approvals: ${status.execution.unverified_count}; ${status.execution.executed}/${status.execution.required} execution receipts verified`);
    if (status.execution.unverified_count > 0) console.log("Ordinary status: non-blocking; strict execution gate: not requested");
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
  if (result.digest) {
    console.log("Navigation cache: refreshed PROJECT_STATE.md; snapshot only");
  } else if (!result.navigation_cache) {
    console.log("Navigation cache: not checked; installed payload failed");
  } else if (result.navigation_cache.state === "absent") {
    console.log(`Navigation cache: absent${selection.digest ? "; not refreshed; earlier checks failed" : ""}`);
  } else if (result.navigation_cache.reusable) {
    console.log("Navigation cache: reusable snapshot only; recorded next action remains unevaluated");
  } else {
    console.log(`Navigation cache: stale (${result.navigation_cache.issues.join("; ")}); recorded next action withheld`);
    if (selection.digest) console.log("Navigation cache refresh: not refreshed; earlier checks failed");
  }
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
