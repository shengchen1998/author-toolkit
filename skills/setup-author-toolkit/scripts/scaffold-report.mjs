#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  projectRootFromManifest,
  REPORT_STAGES,
  validateManifest,
} from "./lib/index.mjs";
import { writeScaffoldedReport } from "./lib/report-scaffold.mjs";
import { resolveSetupRoot } from "./lib/setup-payload.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/scaffold-report.mjs --manifest FILE --output PATH
    --body FILE --envelope FILE [--created-at TIMESTAMP]
    [--preset STAGE --scope-id ID [--input PATH ...]] [--json]

Create one report v2 beneath the manifest's registered reports path.
The body supplies the human-readable report and Language coverage section.
The body must not contain fenced code blocks; the CLI appends the single
fenced report v2 \`json\` block. The envelope supplies report fields and findings;
skill.name selects the installed sibling SKILL.md whose declared version fills
skill.version. A conflicting supplied skill.version is rejected. The CLI defaults
a missing findings field to []. created_at is optional. A stage preset supplies
schema_version, stage, project language, current-scope SHA-256 inputs, and
scope_id in engine.notes. Repeat --input to select scope files;
otherwise all are selected. envelope.inputs supplies additional non-scope inputs.
For revise-draft with --preset intake, the body must contain every bullet label
and level-two heading from the installed intake report template, in any order.
The CLI validates the complete report before publication and refuses to overwrite
any existing destination. It does not infer findings, coverage, parent-child links,
or non-scope input versions. Argument errors exit 2; validation and filesystem
failures exit 1.`);
}

function options(args) {
  const result = { json: false, inputPaths: [] };
  const names = {
    "--manifest": "manifest",
    "--output": "output",
    "--body": "body",
    "--envelope": "envelope",
    "--created-at": "createdAt",
    "--preset": "preset",
    "--scope-id": "scopeId",
    "--input": "inputPaths",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      result.json = true;
    } else if (names[argument] && args[index + 1] && !args[index + 1].startsWith("-")) {
      const field = names[argument];
      const value = args[++index];
      if (field === "inputPaths") result.inputPaths.push(value);
      else result[field] = value;
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
  if (result.preset && !REPORT_STAGES.includes(result.preset)) {
    throw argumentError(`--preset must be one of: ${REPORT_STAGES.join(", ")}`);
  }
  if (result.preset && !result.scopeId) {
    throw argumentError("--scope-id is required with --preset");
  }
  if (!result.preset && (result.scopeId || result.inputPaths.length > 0)) {
    throw argumentError("--scope-id and --input require --preset");
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
    const scriptRoot = fileURLToPath(new URL("../", import.meta.url));
    const result = await writeScaffoldedReport({
      projectRoot: projectRootFromManifest(selection.manifest),
      setupRoot: resolveSetupRoot(scriptRoot),
      manifest,
      destination: selection.output,
      bodyFile: selection.body,
      envelopeFile: selection.envelope,
      createdAt: selection.createdAt,
      preset: selection.preset,
      scopeId: selection.scopeId,
      inputPaths: selection.inputPaths,
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
