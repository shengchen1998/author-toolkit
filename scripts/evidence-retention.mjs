#!/usr/bin/env node

import path from "node:path";

import { applyEvidenceRetention, previewEvidenceRetention } from "./lib/evidence-retention.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/evidence-retention.mjs --project-root DIR [--operation ID]
  node scripts/evidence-retention.mjs --project-root DIR --enable --apply [--operation ID]

Preview bounded audit-evidence retention or explicitly enable and apply it.
The first --enable --apply migrates finding identities into the tracker before
deleting unreferenced audit artifacts. Backups, write batches, creation records,
and manuscript are never candidates. Without --apply the command is read-only.`);
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const options = { enable: false, apply: false };
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === "--project-root" && args[index + 1]) options.projectRoot = path.resolve(args[++index]);
      else if (args[index] === "--operation" && args[index + 1]) options.operation = args[++index];
      else if (args[index] === "--enable") options.enable = true;
      else if (args[index] === "--apply") options.apply = true;
      else throw argumentError(`unknown or incomplete argument: ${args[index]}`);
    }
    if (!options.projectRoot || (options.enable && !options.apply)) {
      throw argumentError("--project-root is required; --enable requires --apply");
    }
    const result = options.apply
      ? await applyEvidenceRetention(options)
      : await previewEvidenceRetention(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.valid === false) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
