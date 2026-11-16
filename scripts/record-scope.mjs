#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { recordScope, validateManifest } from "./lib/index.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/record-scope.mjs --manifest FILE --scope-id ID
    --description TEXT --status proposed --file PATH [--file PATH ...]
    [--exclude PATH ...] [--created-at TIMESTAMP]
  node scripts/record-scope.mjs --manifest FILE --scope-id ID --confirm
    [--updated-at TIMESTAMP]

Record a proposed current scope with ordered project-relative manuscript paths
and current SHA-256 hashes. Exclusions name current non-manuscript inventory
entries. After the author confirms that exact record, --confirm changes only its
status and the manifest update time; changed manuscript hashes stop confirmation.
Membership, reading order, or exclusion changes require a new scope ID.
The CLI validates the complete candidate project and writes the manifest
atomically under the shared write lock. Argument errors exit 2; validation and
filesystem failures exit 1.`);
}

function options(args) {
  const result = { files: [], excludedFiles: [], confirm: false };
  const names = {
    "--manifest": "manifest",
    "--scope-id": "scopeId",
    "--description": "description",
    "--status": "status",
    "--created-at": "createdAt",
    "--updated-at": "updatedAt",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--confirm") result.confirm = true;
    else if (["--file", "--exclude"].includes(argument) && args[index + 1]) {
      const value = args[++index];
      result[argument === "--file" ? "files" : "excludedFiles"].push(value);
    } else if (names[argument] && args[index + 1] && !args[index + 1].startsWith("-")) {
      result[names[argument]] = args[++index];
    } else {
      throw argumentError(`unknown or incomplete argument: ${argument}`);
    }
  }
  if (!result.manifest || !result.scopeId) throw argumentError("--manifest and --scope-id are required");
  if (result.confirm) {
    if (result.status || result.description || result.files.length || result.excludedFiles.length || result.createdAt) {
      throw argumentError("--confirm accepts only --manifest, --scope-id, and --updated-at");
    }
  } else {
    if (result.status !== "proposed" || !result.description || result.files.length === 0) {
      throw argumentError("a proposal requires --status proposed, nonempty --description, and at least one --file");
    }
    if (result.updatedAt) throw argumentError("--updated-at is only valid with --confirm");
  }
  for (const field of ["createdAt", "updatedAt"]) {
    if (result[field] && !Number.isFinite(Date.parse(result[field]))) {
      throw argumentError(`--${field === "createdAt" ? "created-at" : "updated-at"} must be a valid timestamp`);
    }
  }
  result.manifest = path.resolve(result.manifest);
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
      throw new Error("scope recording requires a valid v3.1 project manifest");
    }
    const result = await recordScope({ ...selection, manifestPath: selection.manifest, manifest });
    console.log(JSON.stringify({
      valid: true,
      current_scope: result.current_scope,
      updated_at: result.manifest.updated_at,
    }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
