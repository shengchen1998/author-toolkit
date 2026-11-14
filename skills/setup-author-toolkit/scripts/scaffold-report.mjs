#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  projectRootFromManifest,
  validateManifest,
} from "./lib/index.mjs";
import { writeScaffoldedReport } from "./lib/report-scaffold.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/scaffold-report.mjs --manifest FILE --output PATH
    --body FILE --envelope FILE [--created-at TIMESTAMP] [--json]

Create one report v2 beneath the manifest's registered reports path.
The body supplies the human-readable report and Language coverage section;
the envelope supplies the actual findings, or the CLI defaults a missing
findings field to []. created_at is optional. The CLI validates the complete
report before publication and refuses to overwrite any existing destination.
It does not infer findings, source hashes, parent-child links, or coverage.
Argument errors exit 2; validation and filesystem failures exit 1.`);
}

function options(args) {
  const result = { json: false };
  const names = {
    "--manifest": "manifest",
    "--output": "output",
    "--body": "body",
    "--envelope": "envelope",
    "--created-at": "createdAt",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      result.json = true;
    } else if (names[argument] && args[index + 1] && !args[index + 1].startsWith("-")) {
      result[names[argument]] = args[++index];
    } else {
      throw argumentError(`unknown or incomplete argument: ${argument}`);
    }
  }
  for (const field of ["manifest", "output", "body", "envelope"]) {
    if (!result[field]) throw argumentError(`${field} is required`);
  }
  for (const field of ["manifest", "body", "envelope"]) {
    result[field] = path.resolve(result[field]);
  }
  if (result.createdAt && !Number.isFinite(Date.parse(result.createdAt))) {
    throw argumentError("--created-at must be a valid timestamp");
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
      throw new Error("report scaffolding requires a valid v3.1 project manifest");
    }
    const result = await writeScaffoldedReport({
      projectRoot: projectRootFromManifest(selection.manifest),
      manifest,
      destination: selection.output,
      bodyFile: selection.body,
      envelopeFile: selection.envelope,
      createdAt: selection.createdAt,
    });
    if (selection.json) {
      console.log(JSON.stringify({ valid: true, ...result }, null, 2));
    } else {
      console.log(`ok - ${result.path}`);
      console.log(`findings: ${result.finding_count}`);
    }
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
