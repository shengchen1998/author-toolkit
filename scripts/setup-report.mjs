#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSetupRoot } from "./lib/setup-payload.mjs";
import {
  beginSetupReport,
  captureSetupReport,
  cleanupSetupReport,
  renderSetupReport,
} from "./lib/setup-report.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const setupRoot = resolveSetupRoot(path.join(scriptRoot, ".."));
const terminologyPath = path.join(setupRoot, "assets", "references", "terminology.md");

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

const optionNames = {
  "--report-store": "reportStore",
  "--kind": "kind",
  "--project-root": "projectRoot",
};

function usage() {
  console.log(`Usage:
  node scripts/setup-report.mjs begin --project-root DIR [--json]
  node scripts/setup-report.mjs capture --report-store FILE --kind KIND -- [ARG...]
  node scripts/setup-report.mjs render --report-store FILE
  node scripts/setup-report.mjs cleanup --report-store FILE

Begin checks only whether DIR/.author-toolkit/project.json exists, returns the
new/existing project branch and setup-report terminology preset, and creates a
private temporary store. Capture runs only the sibling CLI selected by KIND,
appends --json, relays its output and exit status, and stores the structured
result. Use kinds doctor, initialize, scaffold, entry-files, and check. Render
requires doctor, entry-files, check, and exactly one of initialize or scaffold;
it prints the deterministic four-section report and removes the temporary store.
Cleanup removes only a store created by begin. Strategy commands and
current-draft revision convergence routing remain semantic setup decisions.
Argument errors exit 2; capture preserves the child exit status; other failures
exit 1.`);
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (Object.hasOwn(optionNames, args[index]) && args[index + 1]) {
      const key = optionNames[args[index]];
      result[key] = args[++index];
    } else if (args[index] === "--json") {
      result.json = true;
    } else {
      throw argumentError(`unknown or incomplete argument: ${args[index]}`);
    }
  }
  return result;
}

function requiredOptions(args, names) {
  const result = options(args);
  if (result.json || result.projectRoot) {
    throw argumentError("--json and --project-root are only available with begin");
  }
  for (const name of names) {
    if (!result[name]) throw argumentError(`${name === "reportStore" ? "--report-store" : "--kind"} is required`);
  }
  return result;
}

const args = process.argv.slice(2);
try {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else if (args[0] === "begin") {
    const selection = options(args.slice(1));
    if (selection.reportStore || selection.kind) {
      throw argumentError("--report-store and --kind are not available with begin");
    }
    if (!selection.projectRoot) throw argumentError("--project-root is required for begin");
    const result = await beginSetupReport({
      projectRoot: selection.projectRoot,
      terminologyPath,
    });
    if (selection.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.report_store);
  } else if (args[0] === "capture") {
    const separator = args.indexOf("--");
    if (separator < 0) throw argumentError("capture requires -- before the child CLI arguments");
    const selection = requiredOptions(args.slice(1, separator), ["reportStore", "kind"]);
    if (!["doctor", "initialize", "scaffold", "entry-files", "check"].includes(selection.kind)) {
      throw argumentError(`unknown capture kind: ${selection.kind}`);
    }
    process.exitCode = await captureSetupReport({
      ...selection,
      args: args.slice(separator + 1),
      scriptRoot,
    });
  } else if (args[0] === "render") {
    const selection = requiredOptions(args.slice(1), ["reportStore"]);
    const report = await renderSetupReport(selection.reportStore);
    await cleanupSetupReport(selection.reportStore);
    process.stdout.write(report);
  } else if (args[0] === "cleanup") {
    const selection = requiredOptions(args.slice(1), ["reportStore"]);
    await cleanupSetupReport(selection.reportStore);
  } else {
    throw argumentError("a subcommand is required: begin, capture, render, or cleanup");
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
