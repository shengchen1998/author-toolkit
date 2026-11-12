#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectSetupPayload, resolveSetupRoot } from "./lib/setup-payload.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/doctor.mjs [--project-root DIR] [--json]

Verify the installed setup skill's regular files against payload-manifest.json.
With --project-root, also verify that AGENTS.md matches the installed template
and CLAUDE.md is a relative symlink to AGENTS.md. Project manifests, manuscript,
historical evidence, and host command visibility are not checked. This command
writes nothing and reports only a summary and failures.`);
}

function outputFailures(label, failures) {
  console.log(`${label}: ${failures.length}`);
  for (const failure of failures) console.log(`- ${failure.path}: ${failure.reason}`);
}

function options(args) {
  const result = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root" && args[index + 1]) {
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--json") {
      result.json = true;
    } else {
      throw argumentError(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  return result;
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const scriptRoot = fileURLToPath(new URL("../", import.meta.url));
    const result = await inspectSetupPayload(resolveSetupRoot(scriptRoot), selection);
    if (selection.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const project = result.project.checked ? "; project entry files included" : "";
      console.log(
        `Setup payload: ${result.files} files (${result.references} references, ${result.clis} CLIs)${project}`,
      );
      outputFailures("Payload failures", result.payload_failures);
      outputFailures("Project entry failures", result.entry_failures);
      console.log("Project state: not checked");
      if (result.payload_failures.length > 0) {
        console.log("Exit reason: incomplete installed payload; stop shared work");
      } else if (result.entry_failures.length > 0) {
        console.log("Exit reason: project entry files need repair; continue setup entry-file repair");
      }
    }
    process.exitCode = result.valid ? 0 : 1;
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
