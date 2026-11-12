#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { installEntryFiles } from "./lib/setup-entry-files.mjs";
import { resolveSetupRoot } from "./lib/setup-payload.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/install-entry-files.mjs --project-root DIR [--json]

Install AGENTS.md from the verified setup payload and link CLAUDE.md to the
relative target AGENTS.md. Both targets are checked before writing. Correct
entries remain unchanged; other regular files and symlinks are atomically
replaced. Directories and special files are rejected without writing.
START_HERE.md is created only when absent; every existing path with that name
is preserved without inspection or replacement. Project manifests, manuscript,
history, and Git state are not inspected or changed. During setup,
check.mjs --project-root DIR --diagnose verifies the payload, both agent entry
files, and project state afterward without another doctor call; it does not
require START_HERE.md. Argument errors exit 2; other failures exit 1.`);
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
  if (!result.projectRoot) throw argumentError("--project-root DIR is required");
  return result;
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const scriptRoot = fileURLToPath(new URL("../", import.meta.url));
    const result = await installEntryFiles(resolveSetupRoot(scriptRoot), selection.projectRoot);
    if (selection.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`AGENTS.md: ${result.agents.status}`);
      console.log(`CLAUDE.md -> AGENTS.md: ${result.claude.status}`);
      console.log(`START_HERE.md: ${result.start_here.status}`);
      const statuses = [result.agents.status, result.claude.status];
      console.log(`Entry files: ${statuses.every((status) => status === "unchanged") ? "unchanged" : "updated"}`);
    }
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
