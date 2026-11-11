#!/usr/bin/env node

import path from "node:path";

import { setPendingAction } from "./lib/pending-artifacts.mjs";

const STATUSES = new Set(["in_progress", "awaiting_author", "blocked"]);

function usage() {
  console.log(`Usage:
  node scripts/set-pending.mjs --project-root DIR --operation ID
    --status in_progress|awaiting_author|blocked --reason TEXT
    [--scope-id ID] [--artifact PATH]... [--updated-at TIMESTAMP]

Store at most eight artifacts inline. Longer lists use
.author-toolkit/pending-artifacts.json; its complete unique list is validated
and linked from the manifest. Existing legacy manifests are not migrated.`);
}

function options(args) {
  const result = { artifacts: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--project-root", "--operation", "--status", "--reason", "--scope-id", "--artifact", "--updated-at"].includes(argument) && args[index + 1]) {
      const value = args[++index];
      if (argument === "--artifact") result.artifacts.push(value);
      else result[{ "--project-root": "projectRoot", "--operation": "operation", "--status": "status", "--reason": "reason", "--scope-id": "scope_id", "--updated-at": "updatedAt" }[argument]] = value;
    } else {
      const error = new Error(`Unknown or incomplete argument: ${argument}`);
      error.code = "ERR_ARGUMENT";
      throw error;
    }
  }
  if (!result.projectRoot || !result.operation || !STATUSES.has(result.status) || !result.reason) {
    const error = new Error("project root, operation, valid status, and nonempty reason are required");
    error.code = "ERR_ARGUMENT";
    throw error;
  }
  result.projectRoot = path.resolve(result.projectRoot);
  if (result.updatedAt && !Number.isFinite(Date.parse(result.updatedAt))) {
    const error = new Error("--updated-at must be a valid timestamp");
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
    const result = await setPendingAction(selection.projectRoot, selection, selection.updatedAt);
    console.log(JSON.stringify({ valid: true, pending_action: result.manifest.pending_action, artifact_count: result.index?.artifacts.length ?? result.manifest.pending_action.artifacts.length }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
