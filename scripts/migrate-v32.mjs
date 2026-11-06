#!/usr/bin/env node

import path from "node:path";

import { migrateProjectToV32 } from "./lib/migration.mjs";

function usage() {
  console.log(`Usage:
  node scripts/migrate-v32.mjs --project-root <root>
  node scripts/migrate-v3.mjs --project-root <root> (compatibility wrapper)

Migrates v2, v3.0, and v3.1 directly to v3.2. A valid v3.2 rerun is idempotent and creates no snapshot.`);
}

function parseArguments(args) {
  let projectRoot = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--help" || args[index] === "-h") return { help: true };
    if (args[index] !== "--project-root" || !args[index + 1] || projectRoot) {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
    projectRoot = path.resolve(args[index + 1]);
    index += 1;
  }
  if (!projectRoot) throw new Error("--project-root is required");
  return { projectRoot };
}

try {
  const selection = parseArguments(process.argv.slice(2));
  if (selection.help) {
    usage();
  } else {
    const summary = await migrateProjectToV32(selection.projectRoot);
    console.log(JSON.stringify(summary, null, 2));
  }
} catch (error) {
  console.error(error.message);
  usage();
  process.exitCode = 1;
}
