#!/usr/bin/env node

import path from "node:path";

import { initializeExistingProject } from "./lib/index.mjs";
import { concise } from "./lib/read-projection.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  throw error;
}

function usage() {
  console.log(`Usage:
  node scripts/initialize.mjs --project-root DIR [--json]

Initialize an existing v3.1 manifest without resetting its registration or
history. Create only a missing backup index. Return its bounded projection,
registered paths, current scope, pending action, and validation result. A
schema-valid manifest with later validation errors returns a recorded_unverified
projection and bounded backup-index diagnosis. Unsupported or schema-invalid
manifests create nothing. Argument errors exit 2; other failures exit 1.`);
}

function options(args) {
  const result = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root" && args[index + 1]) {
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--json") {
      result.json = true;
    } else {
      argumentError(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  if (!result.projectRoot) argumentError("--project-root DIR is required");
  return result;
}

function errorDetails(errors) {
  return concise(errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
}

function outputText(result) {
  console.log(`Manifest schema: ${result.schema_valid ? "valid v3.1" : "invalid or unsupported"}`);
  if (result.backup_index) {
    console.log(`Backup index: ${result.backup_index.status}; ${result.backup_index.valid ? "valid" : "invalid"} (${result.backup_index.path})`);
  }
  if (result.projection) {
    const projection = result.projection;
    console.log(`Manifest projection: ${projection.verification}; use --json for registered paths and complete recorded scope hashes`);
    console.log(`Recorded scope: ${projection.current_scope ? `${projection.current_scope.scope_id} (${projection.current_scope.status}); ${projection.current_scope.files.length} recorded file hashes` : "none recorded"}`);
    const pending = projection.pending_action;
    console.log(`Recorded pending action: ${pending ? `${pending.operation} (${pending.status}; ${pending.scope_id})` : "none recorded"}`);
  }
  if (result.validation) {
    const failures = result.validation.checks.filter((check) => !check.valid);
    console.log(`Project validation: ${result.validation.checks.length} checks, ${failures.length} failures`);
    for (const check of failures) {
      console.log(`- ${check.path}: ${errorDetails(check.errors)}`);
      if (check.omitted_error_count) console.log(`  ... ${check.omitted_error_count} more errors; use --json for bounded structured diagnostics`);
    }
  }
  console.log(`Initialize: ${result.valid ? "passed" : "failed"}`);
}

const args = process.argv.slice(2);
try {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const manifestPath = path.join(selection.projectRoot, ".author-toolkit", "project.json");
    const result = await initializeExistingProject(manifestPath);
    if (selection.json) console.log(JSON.stringify(result, null, 2));
    else outputText(result);
    if (!result.valid) process.exitCode = 1;
  }
} catch (error) {
  if (error.result) {
    console.log(JSON.stringify(error.result, null, 2));
  } else {
    console.error(JSON.stringify({ valid: false, error: concise(error.message, 500) }));
    if (error.code === "ERR_ARGUMENT") usage();
  }
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
