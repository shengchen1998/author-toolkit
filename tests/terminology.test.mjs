import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const terminologyPath = path.join(root, "references", "terminology.md");
const sharedSkills = [
  "ask-author",
  "setup-author-toolkit",
  "write-fiction",
  "revise-fiction",
  "revise-draft",
  "revise-increment",
  "revise-request",
  "author-project",
  "author-handoff",
  "author-review",
];

function section(text, start, end) {
  const body = text.split(`${start}\n`)[1];
  assert.ok(body, `${start} section exists`);
  return end ? body.split(`\n${end}\n`)[0] : body;
}

function cells(line) {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function codeValues(line) {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function coreTerms(text) {
  const rows = section(text, "## Core terms", "## Operation identifiers")
    .split("\n")
    .filter((line) => line.startsWith("| `"));
  return rows.map((line) => {
    const columns = cells(line);
    assert.equal(columns.length, 5, `core term has five columns: ${line}`);
    const approved = codeValues(columns[0]);
    assert.equal(approved.length, 1, `one approved English term: ${line}`);
    assert.ok(columns[1] && columns[1] !== "—", `fixed Chinese term: ${line}`);
    assert.ok(columns[2], `part of speech: ${line}`);
    assert.ok(columns[3], `definition and boundary: ${line}`);
    return {
      approved: approved[0],
      chinese: columns[1].replaceAll("`", ""),
      excluded: codeValues(columns[4]),
      line,
    };
  });
}

function flexiblePattern(value) {
  const escaped = value
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const left = /^[A-Za-z0-9]/.test(value) ? "\\b" : "";
  const right = /[A-Za-z0-9]$/.test(value) ? "\\b" : "";
  return new RegExp(`${left}${escaped}${right}`, "giu");
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(target);
      return entry.isFile() && entry.name.endsWith(".md") ? [target] : [];
    }),
  );
  return files.flat();
}

function enumValues(value, values = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) enumValues(item, values);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "enum" && Array.isArray(item)) {
        for (const enumValue of item) values.add(String(enumValue));
      } else {
        enumValues(item, values);
      }
    }
  }
  return values;
}

test("controlled terms have unique bilingual names and explicit definitions", async () => {
  const terms = coreTerms(await readFile(terminologyPath, "utf8"));
  assert.ok(terms.length >= 50);
  assert.equal(new Set(terms.map((term) => term.approved.toLowerCase())).size, terms.length);
  assert.equal(new Set(terms.map((term) => term.chinese)).size, terms.length);
  for (const term of terms) {
    assert.ok(!term.excluded.includes(term.approved), `${term.approved} does not exclude itself`);
  }
});

test("shared workflow documentation contains no excluded terminology", async () => {
  const [terminology, sharedFiles] = await Promise.all([
    readFile(terminologyPath, "utf8"),
    Promise.all(sharedSkills.map((skill) => markdownFiles(path.join(root, "skills", skill)))),
  ]);
  const terms = coreTerms(terminology);
  const fixedPaths = [
    "AGENTS.md",
    "README.md",
    "README.zh-CN.md",
    "docs/five-entry-flows.mmd",
    "docs/VALIDATION.md",
    "examples/REVIEW-CHECKLIST.md",
    "references/workflow-reporting.md",
  ].map((file) => path.join(root, file));
  const files = [...fixedPaths, ...sharedFiles.flat()];
  const approvedForms = terms.flatMap(({ approved, chinese }) => {
    const plural = approved.endsWith("synthesis")
      ? `${approved.slice(0, -2)}es`
      : approved.endsWith("y")
        ? `${approved.slice(0, -1)}ies`
        : `${approved}s`;
    return [approved, plural, approved.replaceAll(" ", "-"), chinese];
  });
  approvedForms.sort((left, right) => right.length - left.length);
  const failures = [];

  for (const file of files) {
    if (file.endsWith(`${path.sep}references${path.sep}terminology.md`)) continue;
    let text = await readFile(file, "utf8");
    for (const approved of approvedForms) {
      text = text.replace(flexiblePattern(approved), "");
    }
    for (const term of terms) {
      for (const excluded of term.excluded) {
        if (flexiblePattern(excluded).test(text)) {
          failures.push(`${path.relative(root, file)}: use ${term.approved}, not ${excluded}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("operation definitions exactly cover the shared operation identifiers", async () => {
  const [terminology, projectText, reportText, creationText] = await Promise.all([
    readFile(terminologyPath, "utf8"),
    readFile(path.join(root, "references", "project-schema-v3.1.json"), "utf8"),
    readFile(path.join(root, "references", "report-schema-v2.json"), "utf8"),
    readFile(path.join(root, "references", "creation-batch-schema.json"), "utf8"),
  ]);
  const project = JSON.parse(projectText);
  const report = JSON.parse(reportText);
  const creation = JSON.parse(creationText);
  const expected = project.properties.pending_action.properties.operation.enum;
  const documented = section(terminology, "## Operation identifiers", "## Contract values")
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => codeValues(cells(line)[0])[0]);

  assert.deepEqual([...documented].sort(), [...expected].sort());
  for (const operation of [
    ...report.properties.stage.enum,
    ...creation.properties.operation.enum,
  ]) {
    assert.ok(documented.includes(operation), `${operation} has one operation definition`);
  }
});

test("controlled terminology covers every current shared schema enum", async () => {
  const schemaNames = [
    "project-schema-v3.1.json",
    "report-schema-v2.json",
    "finding-schema-v2.json",
    "coverage-unit-schema.json",
    "coverage-index-schema.json",
    "creation-batch-schema.json",
    "creation-commit-schema.json",
    "review-job-schema.json",
    "reader-state-schema.json",
    "story-state-schema.json",
  ];
  const [terminology, schemas] = await Promise.all([
    readFile(terminologyPath, "utf8"),
    Promise.all(
      schemaNames.map(async (name) =>
        JSON.parse(await readFile(path.join(root, "references", name), "utf8")),
      ),
    ),
  ]);
  const documented = new Set(codeValues(terminology));
  const expected = schemas.reduce((values, schema) => enumValues(schema, values), new Set());
  const missing = [...expected].filter((value) => !documented.has(value)).sort();
  assert.deepEqual(missing, []);
});

test("shared workflow entry points and rule files point to the controlled terminology", async () => {
  const files = [
    "AGENTS.md",
    "references/workflow-reporting.md",
    "skills/revise-fiction/references/state-and-findings.md",
    "skills/revise-fiction/references/stage-gates.md",
    "skills/revise-draft/references/stage-gates.md",
    "skills/write-fiction/references/stage-gates.md",
    ...sharedSkills.map((skill) => `skills/${skill}/SKILL.md`),
  ];
  for (const file of files) {
    const text = await readFile(path.join(root, file), "utf8");
    assert.match(text, /terminology\.md/, `${file} points to controlled terminology`);
  }
});
