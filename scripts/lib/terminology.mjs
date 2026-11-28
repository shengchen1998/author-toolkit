import { readFile } from "node:fs/promises";

const setupContractValues = [
  "Setup `setup.installation`",
  "Setup `setup.project_state`",
  "Setup `setup.strategy_gate`",
  "Scope `status`",
  "Pending action `status`",
  "Approval `Status`",
];
const presetDefinitions = {
  setup: {
    coreTerms: [
      "strategy",
      "user entry",
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

export async function readTerminology({ terminologyPath, preset, sections = [] }) {
  let text;
  try {
    text = await readFile(terminologyPath, "utf8");
  } catch (error) {
    throw new Error(`cannot read installed terminology: ${error.message}`);
  }
  if (preset) return selectedPreset(text, preset).join("\n\n");
  const selected = selectedSections(text, sections);
  if (selected.length !== sections.length) {
    const present = new Set([...text.matchAll(/^## ([^\n]+)$/gm)].map((match) => match[1]));
    const missing = sections.filter((section) => !present.has(section));
    throw new Error(`unknown terminology section: ${missing.join(", ")}`);
  }
  return selected.join("\n\n");
}
