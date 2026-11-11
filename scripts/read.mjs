#!/usr/bin/env node

import path from "node:path";

import { inspectProjectManifest, projectRootFromManifest } from "./lib/index.mjs";
import { concise, failedCheck, manifestProjection } from "./lib/read-projection.mjs";

function usage() {
  console.log(`Usage:
  node scripts/read.mjs --project-root DIR
  node scripts/read.mjs --manifest FILE
    [--details]

Return validated project registration, resolved paths, current scope, and a
bounded pending-action projection. Artifact counts include the pending artifact
index without returning its complete list. Failed validation returns only failed
checks, bounded errors, and unverified-approval summaries by default. --details
returns the complete failed checks, including every unverified approval. This
command writes nothing.`);
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root" && args[index + 1]) {
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--manifest" && args[index + 1]) {
      result.manifest = path.resolve(args[++index]);
    } else if (args[index] === "--details") {
      result.details = true;
    } else {
      const error = new Error(`Unknown or incomplete argument: ${args[index]}`);
      error.code = "ERR_ARGUMENT";
      throw error;
    }
  }
  if (Boolean(result.projectRoot) === Boolean(result.manifest)) {
    const error = new Error("provide exactly one of --project-root DIR or --manifest FILE");
    error.code = "ERR_ARGUMENT";
    throw error;
  }
  return result;
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const manifestPath = selection.manifest ?? path.join(selection.projectRoot, ".author-toolkit", "project.json");
    const projectRoot = selection.projectRoot ?? projectRootFromManifest(manifestPath);
    const result = await inspectProjectManifest(manifestPath);
    if (!result.valid) {
      const checks = result.checks.filter((check) => !check.valid).map((check) => failedCheck(check, selection.details));
      console.error(JSON.stringify({ valid: false, checks }, null, 2));
      process.exitCode = 1;
    } else {
      const projected = await manifestProjection(result.manifest, projectRoot);
      projected.valid = true;
      console.log(JSON.stringify(projected, null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ valid: false, error: concise(error.message, 500) }));
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
