#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSetupRoot } from "./lib/setup-payload.mjs";

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

Print selected level-two sections from the installed controlled workflow
terminology, in document order. Each section includes its heading and ends
before the next level-two heading. This helper writes nothing and does not
inspect project state.`);
}

function options(args) {
  const sections = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--section") {
      throw argumentError(`unknown argument: ${args[index]}`);
    }
    const name = args[++index];
    if (!name || name.startsWith("--")) {
      throw argumentError("--section requires a name");
    }
    if (!sections.includes(name)) sections.push(name);
  }
  if (sections.length === 0) throw argumentError("at least one --section is required");
  return sections;
}

function selectedSections(text, requested) {
  const headings = [...text.matchAll(/^## ([^\n]+)$/gm)];
  return headings
    .filter((heading) => requested.includes(heading[1]))
    .map((heading) => {
      const start = heading.index;
      const next = headings.find((candidate) => candidate.index > start);
      const end = next ? next.index : text.length;
      return text.slice(start, end).trimEnd();
    });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
    return;
  }
  const requested = options(args);
  let text;
  try {
    text = await readFile(terminologyPath, "utf8");
  } catch (error) {
    throw new Error(`cannot read installed terminology: ${error.message}`);
  }
  const selected = selectedSections(text, requested);
  if (selected.length !== requested.length) {
    const present = new Set([...text.matchAll(/^## ([^\n]+)$/gm)].map((match) => match[1]));
    const missing = requested.filter((name) => !present.has(name));
    throw new Error(`unknown terminology section: ${missing.join(", ")}`);
  }
  console.log(selected.join("\n\n"));
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
