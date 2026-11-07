#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const commands = new Set([
  "set-pending",
  "record-scope",
  "record-finding",
  "record-finding-decision",
  "record-approval",
  "record-backup",
  "record-restore",
  "start-cycle",
  "transition-cycle",
  "evaluate-cycle",
  "evaluate-draft",
  "complete-cycle",
  "cycle-status",
  "cycle-gate",
  "convergence-status",
  "convergence-gate",
  "check-operation",
  "prepare-draft-revision-execution",
  "prepare-revision-execution",
  "verify-draft-revision-execution",
  "verify-revision-execution",
  "reconcile-manuscript",
  "reconcile-cycle",
]);

function usage() {
  console.log(`Usage:
  node ${process.argv[1] ?? "author-project.mjs"} timestamp [--now ISO_TIMESTAMP]
  node ${process.argv[1] ?? "author-project.mjs"} init --project-root ROOT [--input FILE]
  node ${process.argv[1] ?? "author-project.mjs"} init --project-root ROOT [--language TAG] [--manuscript-root PATH]
  node ${process.argv[1] ?? "author-project.mjs"} read --project-root ROOT [--full]
  node ${process.argv[1] ?? "author-project.mjs"} status --project-root ROOT [--full]
  node ${process.argv[1] ?? "author-project.mjs"} set-pending --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} record-scope --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} record-finding --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} record-finding-decision --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} record-approval --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} record-backup --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} record-restore --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} start-cycle --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} transition-cycle --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} reconcile-cycle --project-root ROOT [--input FILE]
  node ${process.argv[1] ?? "author-project.mjs"} reconcile-manuscript --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} prepare-draft-revision-execution --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} prepare-revision-execution --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} verify-draft-revision-execution --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} verify-revision-execution --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} evaluate-cycle --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} evaluate-draft --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} complete-cycle --project-root ROOT --input FILE
  node ${process.argv[1] ?? "author-project.mjs"} cycle-status --project-root ROOT
  node ${process.argv[1] ?? "author-project.mjs"} cycle-gate --project-root ROOT
  node ${process.argv[1] ?? "author-project.mjs"} convergence-status --project-root ROOT
  node ${process.argv[1] ?? "author-project.mjs"} convergence-gate --project-root ROOT
  node ${process.argv[1] ?? "author-project.mjs"} check-operation --project-root ROOT --input FILE

Use --manifest FILE instead of --project-root ROOT when addressing the manifest directly.
init accepts either --input or the direct language and manuscript-root options. It creates fresh operational evidence and preserves an existing valid project.
Every command response is JSON with response_contract_version=1.0, command, valid, result, and errors.
Success exits 0; project or operation validation failure exits 1; argument, input-file, or input-shape usage error exits 2.
A valid status query exits 0 for satisfied, not_satisfied, and indeterminate outcomes. Gates exit 1 unless evidence is current and satisfied.
Default read and status responses are compact. Explicit --full and dedicated cycle queries retain complete manifests, ordered hashes, evaluations, evidence graphs, and history.
set-pending preserves current scope and active-cycle coordination and never infers approval; optional expected_manifest_sha256 and cycle revision inputs are rechecked under the shared lock.
record-scope recomputes current manuscript hashes and exclusions for proposed or confirmed input; confirmation requires reading-order evidence and publishes immutable snapshots before coordinated manifest state.
record-finding validates an exact report finding and records open; record-finding-decision requires status-specific current evidence and an approved author decision.
record-approval binds exact operation, scope, ordered paths, actions, versions, status, reason, and applicable revision fingerprints.
record-backup preserves exact approved inputs and create absence in the validated backup index; record-restore requires independent approval and current safety backups.
Pending-action, scope, tracker writes, backup and restore operations, transitions, reconciliation, revision execution, evaluations, and completions serialize independent processes with active-cycle.lock and recheck expected_revision in the lock.
reconcile-cycle without --input only diagnoses; a direction requires exact cycle and operation identities and never rewrites historical artifacts or infers approval from pending action.
Manuscript reconciliation verifies an existing creation-import decision, current inventory, scope, and story state; it never writes manuscript or accepts a confirmation boolean as replacement evidence.
Independent evaluate-draft uses the same evaluator without creating an active cycle; an active cycle requires evaluate-cycle instead.
Independent draft preparation and verification use cycle_id=null and the same lock; an active cycle requires the cycle-bound operations.
Preparation checks existing approvals, backups, and inputs without writing manuscript or creating author approval. Verification rereads actual output hashes.
Completion records the author decision, reevaluates the changed tracker evidence, publishes completed history and the completed-cycle pointer before verified active removal, and completes only a still-satisfied cycle.
These are author-project operations; they do not invoke a writing strategy.`);
}

function parseArguments(args) {
  if (
    args.length === 0 ||
    (args.length === 1 && (args[0] === "--help" || args[0] === "-h"))
  ) {
    return { help: true };
  }
  const [command, ...rest] = args;
  if (!commands.has(command)) throw new Error(`Unknown or missing command: ${command ?? ""}`);
  const selection = { command, projectRoot: null, manifest: null, input: null };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!["--project-root", "--manifest", "--input"].includes(argument) || !rest[index + 1]) {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    const key = argument === "--project-root" ? "projectRoot" : argument.slice(2);
    if (selection[key] !== null) throw new Error(`Repeated argument: ${argument}`);
    selection[key] = path.resolve(rest[index + 1]);
    index += 1;
  }
  if (Boolean(selection.projectRoot) === Boolean(selection.manifest)) {
    throw new Error("Select exactly one of --project-root or --manifest");
  }
  if (["set-pending", "record-scope", "record-finding", "record-finding-decision", "record-approval", "record-backup", "record-restore", "start-cycle", "transition-cycle", "evaluate-cycle", "evaluate-draft", "complete-cycle", "check-operation", "prepare-draft-revision-execution", "prepare-revision-execution", "verify-draft-revision-execution", "verify-revision-execution", "reconcile-manuscript"].includes(command) && !selection.input) {
    throw new Error(`${command} requires --input`);
  }
  if (["cycle-status", "cycle-gate", "convergence-status", "convergence-gate"].includes(command) && selection.input) {
    throw new Error(`${command} is read-only and does not accept --input`);
  }
  return selection;
}

async function runInitialization(args) {
  const selection = {
    projectRoot: null,
    manifest: null,
    input: null,
    language: null,
    manuscriptRoot: null,
  };
  const options = {
    "--project-root": "projectRoot",
    "--manifest": "manifest",
    "--input": "input",
    "--language": "language",
    "--manuscript-root": "manuscriptRoot",
  };
  for (let index = 0; index < args.length; index += 1) {
    const key = options[args[index]];
    if (!key || !args[index + 1]) throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    if (selection[key] !== null) throw new Error(`Repeated argument: ${args[index]}`);
    selection[key] = args[index + 1];
    index += 1;
  }
  if (Boolean(selection.projectRoot) === Boolean(selection.manifest)) {
    throw new Error("Select exactly one of --project-root or --manifest");
  }
  if (selection.input && (selection.language || selection.manuscriptRoot)) {
    throw new Error("--input cannot be combined with --language or --manuscript-root");
  }
  const input = selection.input
    ? JSON.parse(await readFile(path.resolve(selection.input), "utf8"))
    : {};
  if (selection.language) input.language = selection.language;
  if (selection.manuscriptRoot) input.manuscript_root = selection.manuscriptRoot;
  const { projectRootFromManifest } = await import("./lib/project-files.mjs");
  const { initializeProject } = await import("./lib/project-state.mjs");
  const projectRoot = selection.manifest
    ? projectRootFromManifest(path.resolve(selection.manifest))
    : path.resolve(selection.projectRoot);
  const result = await initializeProject(projectRoot, input);
  console.log(JSON.stringify({
    response_contract_version: "1.0",
    command: "init",
    valid: result.valid,
    result,
    errors: result.errors,
  }, null, 2));
  if (!result.valid) process.exitCode = 1;
}

async function runStateCommand(command, args) {
  const selection = { projectRoot: null, manifest: null, full: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--full") {
      if (selection.full) throw new Error("Repeated argument: --full");
      selection.full = true;
      continue;
    }
    if (!["--project-root", "--manifest"].includes(argument) || !args[index + 1]) {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    const key = argument === "--project-root" ? "projectRoot" : "manifest";
    if (selection[key] !== null) throw new Error(`Repeated argument: ${argument}`);
    selection[key] = path.resolve(args[index + 1]);
    index += 1;
  }
  if (Boolean(selection.projectRoot) === Boolean(selection.manifest)) {
    throw new Error("Select exactly one of --project-root or --manifest");
  }
  const { projectRootFromManifest } = await import("./lib/project-files.mjs");
  const { getCompactProjectStatus, getFullProjectStatus } = await import("./lib/project-state.mjs");
  const projectRoot = selection.manifest
    ? projectRootFromManifest(selection.manifest)
    : selection.projectRoot;
  const status = selection.full
    ? await getFullProjectStatus(projectRoot)
    : await getCompactProjectStatus(projectRoot);
  console.log(JSON.stringify({
    response_contract_version: "1.0",
    command,
    valid: status.valid,
    result: status.result,
    errors: status.errors,
  }, null, 2));
  if (!status.valid) process.exitCode = 1;
}

async function runTimestamp(args) {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--now" || !args[1])) {
    throw new Error("timestamp accepts only an optional --now ISO timestamp");
  }
  const { timestampResult } = await import("./lib/time.mjs");
  const result = timestampResult({ now: args[1] });
  console.log(JSON.stringify({
    response_contract_version: "1.0",
    command: "timestamp",
    valid: true,
    result,
    errors: [],
  }, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "timestamp") {
    await runTimestamp(args.slice(1));
    return;
  }
  if (args[0] === "init") {
    await runInitialization(args.slice(1));
    return;
  }
  if (["read", "status"].includes(args[0])) {
    await runStateCommand(args[0], args.slice(1));
    return;
  }
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }
  const selection = parseArguments(args);
  const {
    assertCycleAllowsOperation,
    checkConvergenceGate,
    completeCycle,
    evaluateCycle,
    evaluateDraft,
    getCycleStatus,
    prepareDraftRevisionExecution,
    prepareRevisionExecution,
    projectRootFromManifest,
    recordApproval,
    recordBackup,
    recordRestore,
    recordFinding,
    recordFindingDecision,
    recordProjectScope,
    reconcileCycle,
    reconcileManuscript,
    setPendingAction,
    startCycle,
    transitionCycle,
    validateManifest,
    verifyDraftRevisionExecution,
    verifyRevisionExecution,
  } = await import("./lib/index.mjs");
  const projectRoot = selection.manifest
    ? projectRootFromManifest(selection.manifest)
    : selection.projectRoot;
  if (!["cycle-status", "cycle-gate", "convergence-status", "convergence-gate"].includes(selection.command)) {
    let manifest;
    let stateError;
    try {
      manifest = JSON.parse(await readFile(
        path.join(projectRoot, ".author-toolkit", "project.json"),
        "utf8",
      ));
      const validation = validateManifest(manifest);
      if (!validation.valid || manifest.schema_version !== "3.2.0") {
        stateError = {
          code: "project-state-invalid",
          message: manifest.schema_version === "3.2.0"
            ? "The project manifest does not satisfy the current schema."
            : "Current project operations require a valid v3.2 manifest.",
          details: validation.errors,
        };
      }
    } catch (error) {
      stateError = { code: "project-state-invalid", message: error.message, details: [] };
    }
    if (stateError) {
      console.log(JSON.stringify({
        response_contract_version: "1.0",
        command: selection.command,
        valid: false,
        result: null,
        errors: [stateError],
      }, null, 2));
      process.exitCode = 1;
      return;
    }
  }
  let result;
  if (["cycle-status", "convergence-status"].includes(selection.command)) {
    result = await getCycleStatus(projectRoot);
  } else if (["cycle-gate", "convergence-gate"].includes(selection.command)) {
    result = await checkConvergenceGate(projectRoot);
  } else if (selection.command === "reconcile-cycle" && !selection.input) {
    result = await reconcileCycle(projectRoot);
  } else {
    const input = JSON.parse(await readFile(selection.input, "utf8"));
    if (selection.command === "set-pending") result = await setPendingAction(projectRoot, input);
    if (selection.command === "record-scope") result = await recordProjectScope(projectRoot, input);
    if (selection.command === "record-finding") result = await recordFinding(projectRoot, input);
    if (selection.command === "record-finding-decision") {
      result = await recordFindingDecision(projectRoot, input);
    }
    if (selection.command === "record-approval") result = await recordApproval(projectRoot, input);
    if (selection.command === "record-backup") result = await recordBackup(projectRoot, input);
    if (selection.command === "record-restore") result = await recordRestore(projectRoot, input);
    if (selection.command === "start-cycle") result = await startCycle(projectRoot, input);
    if (selection.command === "transition-cycle") {
      result = await transitionCycle(projectRoot, input);
    }
    if (selection.command === "reconcile-cycle") {
      result = await reconcileCycle(projectRoot, input);
    }
    if (selection.command === "reconcile-manuscript") {
      result = await reconcileManuscript(projectRoot, input);
    }
    if (selection.command === "prepare-draft-revision-execution") {
      result = await prepareDraftRevisionExecution(projectRoot, input);
    }
    if (selection.command === "prepare-revision-execution") {
      result = await prepareRevisionExecution(projectRoot, input);
    }
    if (selection.command === "verify-draft-revision-execution") {
      result = await verifyDraftRevisionExecution(projectRoot, input);
    }
    if (selection.command === "verify-revision-execution") {
      result = await verifyRevisionExecution(projectRoot, input);
    }
    if (selection.command === "evaluate-cycle") result = await evaluateCycle(projectRoot, input);
    if (selection.command === "evaluate-draft") result = await evaluateDraft(projectRoot, input);
    if (selection.command === "complete-cycle") result = await completeCycle(projectRoot, input);
    if (selection.command === "check-operation") {
      result = await assertCycleAllowsOperation(projectRoot, input);
    }
  }
  const succeeded = ["cycle-status", "convergence-status"].includes(selection.command)
    ? result.query_valid
    : result.valid;
  const errors = succeeded
    ? []
    : [...(result.errors ?? []), ...(result.blockers ?? [])];
  console.log(JSON.stringify({
    response_contract_version: "1.0",
    command: selection.command,
    valid: succeeded,
    result,
    errors,
  }, null, 2));
  if (!succeeded) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.log(JSON.stringify({
    response_contract_version: "1.0",
    command: process.argv[2] ?? null,
    valid: false,
    result: null,
    errors: [{ code: "usage-error", message: error.message }],
  }, null, 2));
  process.exitCode = 2;
}
