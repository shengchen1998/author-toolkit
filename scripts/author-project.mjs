#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  assertCycleAllowsOperation,
  checkConvergenceGate,
  completeCycle,
  evaluateCycle,
  evaluateDraft,
  getCycleStatus,
  prepareRevisionExecution,
  projectRootFromManifest,
  startCycle,
  transitionCycle,
  verifyRevisionExecution,
} from "./lib/index.mjs";

const commands = new Set([
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
  "prepare-revision-execution",
  "verify-revision-execution",
]);

function usage() {
  console.log(`Usage:
  node scripts/author-project.mjs start-cycle --project-root ROOT --input FILE
  node scripts/author-project.mjs transition-cycle --project-root ROOT --input FILE
  node scripts/author-project.mjs prepare-revision-execution --project-root ROOT --input FILE
  node scripts/author-project.mjs verify-revision-execution --project-root ROOT --input FILE
  node scripts/author-project.mjs evaluate-cycle --project-root ROOT --input FILE
  node scripts/author-project.mjs evaluate-draft --project-root ROOT --input FILE
  node scripts/author-project.mjs complete-cycle --project-root ROOT --input FILE
  node scripts/author-project.mjs cycle-status --project-root ROOT
  node scripts/author-project.mjs cycle-gate --project-root ROOT
  node scripts/author-project.mjs convergence-status --project-root ROOT
  node scripts/author-project.mjs convergence-gate --project-root ROOT
  node scripts/author-project.mjs check-operation --project-root ROOT --input FILE

Use --manifest FILE instead of --project-root ROOT when addressing the manifest directly.
Transitions, revision execution, evaluations, and completions serialize independent processes with active-cycle.lock and recheck expected_revision in the lock.
Independent evaluate-draft uses the same evaluator without creating an active cycle; an active cycle requires evaluate-cycle instead.
Preparation checks existing approvals, backups, and inputs without writing manuscript or creating author approval. Verification rereads actual output hashes.
Completion records the author decision, reevaluates the changed tracker evidence, and completes only a still-satisfied cycle.
These are author-project operations; they do not invoke a writing strategy.`);
}

function parseArguments(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
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
  if (["start-cycle", "transition-cycle", "evaluate-cycle", "evaluate-draft", "complete-cycle", "check-operation", "prepare-revision-execution", "verify-revision-execution"].includes(command) && !selection.input) {
    throw new Error(`${command} requires --input`);
  }
  if (["cycle-status", "cycle-gate", "convergence-status", "convergence-gate"].includes(command) && selection.input) {
    throw new Error(`${command} is read-only and does not accept --input`);
  }
  return selection;
}

async function main() {
  const selection = parseArguments(process.argv.slice(2));
  if (selection.help) {
    usage();
    return;
  }
  const projectRoot = selection.manifest
    ? projectRootFromManifest(selection.manifest)
    : selection.projectRoot;
  let result;
  if (["cycle-status", "convergence-status"].includes(selection.command)) {
    result = await getCycleStatus(projectRoot);
  } else if (["cycle-gate", "convergence-gate"].includes(selection.command)) {
    result = await checkConvergenceGate(projectRoot);
  } else {
    const input = JSON.parse(await readFile(selection.input, "utf8"));
    if (selection.command === "start-cycle") result = await startCycle(projectRoot, input);
    if (selection.command === "transition-cycle") {
      result = await transitionCycle(projectRoot, input);
    }
    if (selection.command === "prepare-revision-execution") {
      result = await prepareRevisionExecution(projectRoot, input);
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
  console.log(JSON.stringify(result, null, 2));
  const succeeded = ["cycle-status", "convergence-status"].includes(selection.command)
    ? result.query_valid
    : result.valid;
  if (!succeeded) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  usage();
  process.exitCode = 2;
}
