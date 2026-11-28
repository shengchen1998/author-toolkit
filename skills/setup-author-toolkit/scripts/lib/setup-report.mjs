import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeJsonAtomic } from "./atomic-json.mjs";
import { unverifiedOperationGroups } from "./execution-summary.mjs";
import { concise } from "./read-projection.mjs";
import { readTerminology } from "./terminology.mjs";

const storePrefix = "author-toolkit-setup-report-";
const storeName = "report.json";
const captureKinds = new Map([
  ["doctor", ["doctor", "doctor.mjs"]],
  ["initialize", ["initialize", "initialize.mjs"]],
  ["scaffold", ["scaffold", "scaffold-project.mjs"]],
  ["entry-files", ["entry_files", "install-entry-files.mjs"]],
  ["check", ["check", "check.mjs"]],
]);

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function result(store, name) {
  return object(store.results[name], `missing or invalid captured ${name} result`);
}

function displayedStatus(value) {
  return String(value).replaceAll("_", " ");
}

function failureDetails(lines, failures) {
  for (const failure of failures ?? []) {
    lines.push(`  - ${failure.path}: ${concise(failure.reason)}`);
  }
}

function validationErrors(lines, check) {
  for (const error of check?.errors ?? []) {
    lines.push(`  - ${error.instancePath || "/"} ${concise(error.message)}`);
  }
}

function payloadSummary(payload) {
  return `${payload.files} files (${payload.references} references, ${payload.clis} CLIs); payload failures: ${payload.payload_failures.length}`;
}

function projectResult(store) {
  const initialize = store.results.initialize;
  const scaffold = store.results.scaffold;
  if (initialize && scaffold) throw new Error("setup report cannot contain both initialize and scaffold results");
  if (initialize) {
    const value = object(initialize, "captured initialize result");
    return {
      manifestPath: value.manifest_path,
      language: value.projection?.language,
      manuscriptRoot: value.projection?.manuscript_root,
      paths: value.projection?.paths,
      scope: value.projection?.current_scope ?? null,
      pending: value.projection?.pending_action ?? null,
    };
  }
  const value = object(scaffold, "missing captured initialize or scaffold result");
  return {
    manifestPath: value.manifest_path,
    language: value.language,
    manuscriptRoot: value.manuscript_root,
    paths: value.paths,
    scope: null,
    pending: null,
  };
}

function cacheLines(lines, cache) {
  if (cache?.reusable) return;
  if (!cache) {
    lines.push("- Navigation cache: not checked");
  } else if (cache.state === "absent") {
    lines.push("- Navigation cache: absent; expected before the first successful --digest refresh; installation and preflight do not fail");
  } else {
    lines.push(`- Navigation cache: ${cache.state} (${cache.issues.join("; ")}); recorded next action withheld`);
    if (cache.state === "stale") {
      lines.push("  - Recovery: run `check --digest` at the next strategy start; the cache refreshes only after validation passes");
    }
  }
}

function scopeLines(lines, scope, check) {
  if (!scope) {
    lines.push("- Current scope hashes: not applicable");
    return;
  }
  const scopeCheck = check.validation?.checks?.find((candidate) => candidate.path === "scope");
  const status = scopeCheck ? (scopeCheck.valid ? "passed" : "failed") : "not checked";
  lines.push(`- Current scope hashes: recorded; validation: ${status}`);
  validationErrors(lines, scopeCheck);
  const currentHashes = check.diagnosis?.current_hashes;
  if (currentHashes?.verified) {
    lines.push(`- Current hash verification: independently verified; ${currentHashes.matched}/${currentHashes.total} current files match`);
  } else if (check.validation && !check.validation.valid) {
    lines.push("- Current hash verification: not independently verified");
  }
  for (const file of scope.files) lines.push(`  - ${file.path}: ${file.sha256}`);
}

function backupIndexLines(lines, check) {
  const backup = check.diagnosis?.backup_index;
  if (!backup || (backup.valid && backup.records.length === 0 && backup.errors.length === 0)) return;
  lines.push(`- Backup index diagnosis: ${backup.valid ? "valid" : "invalid"}; read-only`);
  for (const record of backup.records) {
    const differences = record.differences
      .map((difference) => `${difference.field}: backup=${difference.backup}, approval=${difference.approval}`)
      .join("; ");
    lines.push(`  - ${record.collection}[${record.index}] ${record.backup_id ?? "unknown backup"} / ${record.approval_id ?? "unknown approval"}${differences ? `: ${concise(differences)}` : ""}`);
  }
  for (const error of backup.errors) lines.push(`  - ${concise(`${error.instancePath || "/"} ${error.message}`)}`);
}

function executionSummary(check) {
  return check.status?.execution ?? check.validation?.checks?.find(
    (candidate) => candidate.path === "executions" && candidate.summary,
  )?.summary ?? null;
}

function executionLines(lines, check, pending) {
  const execution = executionSummary(check);
  if (execution) {
    lines.push(`- Approval verification: ${execution.executed}/${execution.required} execution receipts verified; ${execution.unverified_count} unverified approvals`);
    const groups = execution.unverified_by_operation ?? unverifiedOperationGroups(execution.unverified ?? []);
    lines.push(`- Unverified approvals: ${execution.unverified_count === 0 ? "none" : "grouped by operation; first/last IDs are not contiguous ranges"}`);
    for (const group of groups) {
      lines.push(`  - ${group.operation}: ${group.count} (${group.first} … ${group.last})`);
    }
  } else {
    lines.push("- Approval verification: unavailable because project inspection did not reach execution status");
    lines.push("- Unverified approvals: unavailable");
  }

  const blockers = check.status?.recorded_blockers;
  if (blockers) {
    lines.push(`- Shared stale evidence: ${blockers.stale_finding_count} stale findings`);
    for (const finding of blockers.stale_findings) {
      lines.push(`  - ${finding.finding_id}: ${finding.operation}; ${finding.location}; ${finding.current_report}; ${concise(finding.reason)}`);
    }
    const blocked = blockers.blocked_pending_action;
    lines.push(`- Blocked pending action: ${blocked ? `${blocked.operation} (${blocked.scope_id}): ${concise(blocked.reason)}` : "none recorded in selected scope"}`);
  } else {
    lines.push("- Shared stale evidence: unavailable because project validation failed or was not checked");
    const blocked = pending?.status === "blocked" ? pending : null;
    lines.push(`- Blocked pending action: ${blocked ? `${blocked.operation} (${blocked.scope_id}): ${concise(blocked.reason)}; recorded only` : "none available from verified status"}`);
  }

  const recovery = check.diagnosis?.execution_recovery;
  if (recovery?.status === "available") {
    lines.push(`- Execution recovery audit: ${recovery.reconcilable_count} reconcilable; ${recovery.unsupported_count} unsupported; read-only preview`);
  } else if (recovery?.status === "unavailable") {
    lines.push(`- Execution recovery audit: unavailable; ${concise(recovery.errors.join("; "))}`);
  }
  lines.push("- Operation-specific evidence: not evaluated; mechanical execution evidence does not establish operation completion");
  lines.push("- Current-draft revision convergence: not established by this setup report; selected-branch routing rules still apply");
}

async function setupBranch(projectRoot) {
  try {
    await lstat(path.join(projectRoot, ".author-toolkit", "project.json"));
    return "existing";
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return "new";
    throw error;
  }
}

export async function beginSetupReport({ projectRoot, terminologyPath }) {
  const projectBranch = await setupBranch(projectRoot);
  const terminology = await readTerminology({ terminologyPath, preset: "setup-report" });
  const directory = await mkdtemp(path.join(os.tmpdir(), storePrefix));
  const reportStore = path.join(directory, storeName);
  const value = { schema_version: "1.0", report_id: randomUUID(), results: {} };
  try {
    await writeJsonAtomic(reportStore, value);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    valid: true,
    report_store: reportStore,
    project_branch: projectBranch,
    terminology,
  };
}

async function readSetupReport(reportStore) {
  const stats = await lstat(reportStore);
  if (!stats.isFile()) throw new Error("setup report store must be a regular file");
  const value = object(JSON.parse(await readFile(reportStore, "utf8")), "setup report store");
  if (value.schema_version !== "1.0" || typeof value.report_id !== "string") {
    throw new Error("unsupported setup report store");
  }
  object(value.results, "setup report store results");
  return value;
}

export async function captureSetupReport({ reportStore, kind, args, scriptRoot }) {
  const capture = captureKinds.get(kind);
  if (!capture) throw new Error(`unsupported setup report capture kind: ${kind}`);
  const [field, script] = capture;
  const store = await readSetupReport(reportStore);
  if (store.results[field] !== undefined) throw new Error(`setup report already contains a ${kind} result`);
  const child = spawn(process.execPath, [path.join(scriptRoot, script), ...args, "--json"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const status = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  try {
    const captured = object(JSON.parse(output), `captured ${kind} output`);
    store.results[field] = captured;
    await writeJsonAtomic(reportStore, store);
  } catch (error) {
    console.error(`setup report could not capture ${kind}: ${error.message}`);
    if (status === 0) return 1;
  }
  return status;
}

export async function renderSetupReport(reportStore) {
  const store = await readSetupReport(reportStore);
  const doctor = result(store, "doctor");
  const entry = result(store, "entry_files");
  const check = result(store, "check");
  const project = projectResult(store);
  object(project.paths, "captured project paths");
  object(check.setup, "captured check setup states");
  const finalPayload = object(check.payload, "captured check payload");
  const lines = [
    "# Setup report",
    "",
    "## Installation payload",
    `- Initial doctor payload: ${payloadSummary(doctor)}`,
  ];
  failureDetails(lines, doctor.payload_failures);
  for (const sibling of doctor.siblings) {
    const failures = doctor.sibling_failures.filter((failure) => failure.path.startsWith(`sibling:${sibling.name}/`));
    lines.push(`- Initial doctor sibling ${sibling.name}: ${sibling.files} required files; failures: ${failures.length}`);
    failureDetails(lines, failures);
  }
  lines.push(`- Final diagnostic-check payload: ${payloadSummary(finalPayload)}`);
  failureDetails(lines, finalPayload.payload_failures);
  lines.push(`- Installed shared references: ${path.join(doctor.setup_root, "assets", "references")}`);
  lines.push(`- Installation: ${check.setup.installation}`);
  lines.push(`- Project state: ${displayedStatus(check.setup.project_state)}`);
  lines.push(`- Strategy gate: ${displayedStatus(check.setup.strategy_gate)}`);
  if (check.setup.installation === "passed" && check.setup.project_state === "failed") {
    lines.push("- Setup diagnosis: toolkit installed; project-state operations are blocked");
  } else if (check.setup.installation === "passed" && check.setup.strategy_gate === "failed") {
    lines.push("- Setup diagnosis: toolkit installed; evidence-dependent operations are blocked");
  } else if (check.setup.installation === "failed") {
    lines.push("- Setup diagnosis: toolkit installation is incomplete");
  }
  if (check.setup.installation === "passed" && check.setup.project_state === "passed") {
    lines.push("- Setup readiness: ready; installation, project state, and registered paths passed");
  }

  lines.push("", "## Project entry files");
  lines.push(`- Entry files: ${finalPayload.entry_failures.length === 0 ? "pass" : "fail"}`);
  failureDetails(lines, finalPayload.entry_failures);
  lines.push(`- ${entry.agents.path}: ${entry.agents.status}`);
  lines.push(`- ${entry.claude.path} -> ${entry.claude.target}: ${entry.claude.status}`);
  lines.push(`- ${entry.start_here.path}: ${entry.start_here.status}`);
  cacheLines(lines, check.navigation_cache);
  const filesCheck = check.validation?.checks?.find((candidate) => candidate.path === "files");
  lines.push(`- Registered paths validation: ${filesCheck ? (filesCheck.valid ? "passed" : "failed") : "not checked"}`);
  validationErrors(lines, filesCheck);
  backupIndexLines(lines, check);

  lines.push("", "## Manuscript scope");
  lines.push(`- Manifest: ${project.manifestPath}`);
  lines.push(`- Language: ${project.language}`);
  lines.push(`- Registered manuscript root: ${project.manuscriptRoot}`);
  lines.push("- Registered paths:");
  for (const [name, value] of Object.entries(project.paths)) lines.push(`  - ${name}: ${value}`);
  lines.push(`- Current scope: ${project.scope ? `${project.scope.scope_id} (${project.scope.status})` : "none recorded"}`);
  if (project.pending) {
    lines.push(`- Pending action: ${project.pending.operation} (${project.pending.status}; ${project.pending.scope_id}); ${concise(project.pending.reason)}`);
    lines.push(`- Pending artifacts: ${project.pending.artifact_count ?? "unavailable"}${project.pending.artifact_count_error ? `; ${concise(project.pending.artifact_count_error)}` : ""}`);
  } else {
    lines.push("- Pending action: none recorded");
  }
  scopeLines(lines, project.scope, check);

  lines.push("", "## Execution evidence");
  executionLines(lines, check, project.pending);
  return `${lines.join("\n")}\n`;
}

export async function cleanupSetupReport(reportStore) {
  await readSetupReport(reportStore);
  const directory = path.dirname(path.resolve(reportStore));
  if (
    path.basename(reportStore) !== storeName ||
    path.dirname(directory) !== os.tmpdir() ||
    !path.basename(directory).startsWith(storePrefix)
  ) {
    throw new Error("setup report cleanup requires a store created by setup-report begin");
  }
  await rm(directory, { recursive: true, force: true });
}
