#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { projectRootFromManifest, updateCoverageIndex, validateManifest } from "./lib/index.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/coverage-index.mjs --manifest FILE --entry FILE
    [--updated-at TIMESTAMP] [--json]

Register one complete operation entry in <paths.reports>/coverage-index.json.
The entry supplies operation, full local coverage unit references, synthesis_report, and
synthesis_coverage. Existing entries for other operations are preserved. Every
referenced unit and report, the complete index, and the confirmed current scope
are validated before a verified atomic replacement under the shared write lock.
This records declared evidence; it does not infer semantic coverage or currency.
Argument errors exit 2; validation and filesystem failures exit 1.`);
}

function options(args) {
  const result = { json: false };
  const names = {
    "--manifest": "manifest",
    "--entry": "entryFile",
    "--updated-at": "updatedAt",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") result.json = true;
    else if (names[argument] && args[index + 1] && !args[index + 1].startsWith("-")) {
      result[names[argument]] = args[++index];
    } else {
      throw argumentError(`unknown or incomplete argument: ${argument}`);
    }
  }
  if (!result.manifest || !result.entryFile) throw argumentError("--manifest and --entry are required");
  result.manifest = path.resolve(result.manifest);
  if (result.updatedAt && !Number.isFinite(Date.parse(result.updatedAt))) {
    throw argumentError("--updated-at must be a valid timestamp");
  }
  return result;
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const manifest = JSON.parse(await readFile(selection.manifest, "utf8"));
    if (!validateManifest(manifest).valid) {
      throw new Error("coverage index registration requires a valid v3.1 project manifest");
    }
    const result = await updateCoverageIndex({
      projectRoot: projectRootFromManifest(selection.manifest),
      manifestPath: selection.manifest,
      manifest,
      entryFile: selection.entryFile,
      updatedAt: selection.updatedAt,
    });
    if (selection.json) {
      console.log(JSON.stringify({ valid: true, ...result }, null, 2));
    } else {
      console.log(`ok - ${result.path}`);
      console.log(`operation: ${result.operation}; units: ${result.unit_count}; synthesis: ${result.synthesis_coverage}`);
    }
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
