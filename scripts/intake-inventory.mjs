#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  projectRootFromManifest,
  readIntakeInventory,
  validateManifest,
} from "./lib/index.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/intake-inventory.mjs --project-root DIR
  node scripts/intake-inventory.mjs --manifest FILE

Return every current manuscript path, Unicode code-point count, SHA-256 hash,
and non-manuscript inventory exclusion as JSON. Hashes cover the exact file
bytes; counts cover the decoded text, including whitespace and Markdown markup.
Files must contain valid UTF-8. The result uses inventory order, not author-
confirmed reading order. The command reads no shared-state artifacts beyond the
manifest and writes nothing. Argument errors exit 2; validation and filesystem
failures exit 1.`);
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (["--project-root", "--manifest"].includes(args[index]) && args[index + 1] && !args[index + 1].startsWith("-")) {
      const field = args[index] === "--project-root" ? "projectRoot" : "manifest";
      result[field] = path.resolve(args[++index]);
    } else {
      throw argumentError(`unknown or incomplete argument: ${args[index]}`);
    }
  }
  if (Boolean(result.projectRoot) === Boolean(result.manifest)) {
    throw argumentError("provide exactly one of --project-root DIR or --manifest FILE");
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
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!validateManifest(manifest).valid) {
      throw new Error("intake inventory requires a valid v3.1 project manifest");
    }
    const inventory = await readIntakeInventory({ projectRoot, manifest });
    console.log(JSON.stringify({
      valid: true,
      manuscript_root: manifest.manuscript_root,
      ...inventory,
    }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
