#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSetupRoot } from "./lib/setup-payload.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const setupRoot = resolveSetupRoot(path.join(scriptRoot, ".."));
const terminologyPath = path.join(setupRoot, "assets", "references", "terminology.md");
const setupContractValues = [
  "Setup `setup.installation`",
  "Setup `setup.project_state`",
  "Setup `setup.strategy_gate`",
  "Setup `setup.host_visibility`",
  "Scope `status`",
  "Pending action `status`",
  "Approval `Status`",
];
const presetDefinitions = {
  setup: {
    coreTerms: [
      "strategy",
      "user entry",
      "host command visibility",
      "installation status",
      "project-state status",
      "strategy-gate status",
      "operation",
      "shared project state",
      "manuscript",
      "manuscript inventory",
      "scope",
      "current scope",
      "previous scope",
      "base scope",
      "current evidence",
      "stale evidence",
      "approval",
      "execution receipt",
      "execution recovery audit",
      "backup index inspection",
      "unverified approval",
      "recorded blocker",
      "current-draft revision convergence",
      "navigation cache",
      "pending artifact index",
      "pending action",
      "input version",
      "operation completion",
    ],
    contractValues: setupContractValues,
  },
  "setup-report": {
    coreTerms: [
      "host command visibility",
      "current scope",
      "previous scope",
      "base scope",
      "stale evidence",
      "approval",
      "execution receipt",
      "unverified approval",
      "recorded blocker",
      "current-draft revision convergence",
      "navigation cache",
      "pending action",
      "operation completion",
    ],
    contractValues: setupContractValues,
  },
};

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
      if (!Object.hasOwn(presetDefinitions, name)) {
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

function selectedPreset(text, name) {
  const preset = presetDefinitions[name];
  return [
    ["Core terms", preset.coreTerms.map((term) => `\`${term}\``)],
    ["Contract values", preset.contractValues],
  ].map(([sectionName, keys]) => {
    const section = selectedSections(text, [sectionName])[0];
    const lines = section.split("\n");
    const separator = lines.findIndex((line) => line.startsWith("| ---"));
    const requested = new Set(keys);
    const found = new Set();
    const selected = lines.filter((line, index) => {
      if (!line.startsWith("|")) return true;
      if (index === separator - 1 || index === separator) return true;
      const key = line.split("|")[1].trim();
      if (!requested.has(key)) return false;
      found.add(key);
      return true;
    });
    const missing = keys.filter((key) => !found.has(key));
    if (missing.length > 0) {
      throw new Error(`${name} terminology preset is missing: ${missing.join(", ")}`);
    }
    return selected.join("\n").replace(/\n{3,}/g, "\n\n");
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
    return;
  }
  const { preset, sections } = options(args);
  let text;
  try {
    text = await readFile(terminologyPath, "utf8");
  } catch (error) {
    throw new Error(`cannot read installed terminology: ${error.message}`);
  }
  if (preset) {
    console.log(selectedPreset(text, preset).join("\n\n"));
    return;
  }
  const selected = selectedSections(text, sections);
  if (selected.length !== sections.length) {
    const present = new Set([...text.matchAll(/^## ([^\n]+)$/gm)].map((match) => match[1]));
    const missing = sections.filter((name) => !present.has(name));
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
