#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSetupRoot } from "./lib/setup-payload.mjs";
import { readTerminology } from "./lib/terminology.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const setupRoot = resolveSetupRoot(path.join(scriptRoot, ".."));
const terminologyPath = path.join(setupRoot, "assets", "references", "terminology.md");

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/terminology.mjs --section NAME [--section NAME]...
  node scripts/terminology.mjs --preset setup
  node scripts/terminology.mjs --preset setup-report

Print selected level-two sections from the installed controlled workflow
terminology, in document order, or select preset rows from Core terms and
Contract values. The setup preset covers setup procedures; setup-report keeps
only reporting and entry-routing rows. Each section includes its heading and
ends before the next level-two heading. This helper writes nothing and does not
inspect project state.`);
}

function options(args) {
  const sections = [];
  let preset;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--preset") {
      if (preset || sections.length > 0) {
        throw argumentError("--preset cannot be repeated or combined with --section");
      }
      const name = args[++index];
      if (!name || name.startsWith("--")) {
        throw argumentError("--preset requires a name");
      }
      if (!["setup", "setup-report"].includes(name)) {
        throw argumentError(`unknown terminology preset: ${name}`);
      }
      preset = name;
      continue;
    }
    if (args[index] !== "--section") {
      throw argumentError(`unknown argument: ${args[index]}`);
    }
    if (preset) throw argumentError("--section cannot be combined with --preset");
    const name = args[++index];
    if (!name || name.startsWith("--")) {
      throw argumentError("--section requires a name");
    }
    if (!sections.includes(name)) sections.push(name);
  }
  if (!preset && sections.length === 0) {
    throw argumentError("one --preset or at least one --section is required");
  }
  return { preset, sections };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
    return;
  }
  const { preset, sections } = options(args);
  console.log(await readTerminology({ terminologyPath, preset, sections }));
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
