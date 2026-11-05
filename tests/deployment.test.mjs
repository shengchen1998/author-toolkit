import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const canonicalReferences = path.join(root, "references");
const setupReferences = path.join(
  root,
  "skills",
  "setup-author-toolkit",
  "assets",
  "references",
);
const independentSkills = [
  "fiction-workshop",
  "character-archetypes",
  "story-structure",
  "narrative-nonfiction",
  "prose-mechanics",
];

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return filesUnder(path.join(directory, entry.name), `${relative}/`);
      return entry.isFile() ? [relative] : [];
    }),
  );
  return files.flat().sort();
}

async function markdownFiles(directory) {
  const files = await filesUnder(directory);
  return files.filter((file) => file.endsWith(".md"));
}

test("setup carries a byte-identical copy of every shared reference", async () => {
  const [canonicalFiles, setupFiles] = await Promise.all([
    filesUnder(canonicalReferences),
    filesUnder(setupReferences),
  ]);
  assert.deepEqual(setupFiles, canonicalFiles);
  for (const file of canonicalFiles) {
    const [canonical, deployed] = await Promise.all([
      readFile(path.join(canonicalReferences, file), "utf8"),
      readFile(path.join(setupReferences, file), "utf8"),
    ]);
    assert.equal(deployed, canonical, `${file} matches the canonical shared reference`);
  }
});

test("standalone skills carry byte-identical copies of their local contracts", async () => {
  for (const skill of independentSkills) {
    const [canonical, deployed] = await Promise.all([
      readFile(path.join(canonicalReferences, "finding-schema.json"), "utf8"),
      readFile(path.join(root, "skills", skill, "references", "finding-schema.json"), "utf8"),
    ]);
    assert.equal(deployed, canonical, `${skill} carries finding v1`);
  }
  for (const file of ["avoid-ai-writing-adapter.md", "avoid-ai-writing-zh-CN.md"]) {
    const [canonical, deployed] = await Promise.all([
      readFile(path.join(canonicalReferences, file), "utf8"),
      readFile(path.join(root, "skills", "prose-mechanics", "references", file), "utf8"),
    ]);
    assert.equal(deployed, canonical, `prose-mechanics carries ${file}`);
  }
});

test("deployable skills do not depend on repository-root references", async () => {
  const files = await markdownFiles(path.join(root, "skills"));
  for (const file of files) {
    const text = await readFile(path.join(root, "skills", file), "utf8");
    assert.doesNotMatch(text, /\.\.\/\.\.\/references\//, file);
    assert.doesNotMatch(text, /\.\.\/\.\.\/\.\.\/references\//, file);
    assert.doesNotMatch(text, /toolkit root's `references\//, file);
    assert.doesNotMatch(text, /installed toolkit's `references\//, file);
    assert.doesNotMatch(text, /工具包根目录的 `references\//, file);
  }
});

test("every project-local shared reference named by a skill exists in the setup payload", async () => {
  const [files, payload] = await Promise.all([
    markdownFiles(path.join(root, "skills")),
    filesUnder(setupReferences),
  ]);
  const available = new Set(payload);
  const missing = new Set();
  for (const file of files) {
    const text = await readFile(path.join(root, "skills", file), "utf8");
    for (const match of text.matchAll(/\.author-toolkit\/references\/([A-Za-z0-9._-]+)/g)) {
      if (!available.has(match[1])) missing.add(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual([...missing].sort(), []);
});

test("setup deploys references without silently overwriting project state", async () => {
  const [setup, instructions] = await Promise.all([
    readFile(path.join(root, "skills", "setup-author-toolkit", "SKILL.md"), "utf8"),
    readFile(path.join(root, "skills", "setup-author-toolkit", "assets", "AGENTS.md"), "utf8"),
  ]);
  assert.match(setup, /Deploy every file from `assets\/references\/`/);
  assert.match(setup, /`<project-root>\/\.author-toolkit\/references\/`/);
  assert.match(setup, /compare its SHA-256 hash with the packaged file/);
  assert.match(setup, /reference-version-conflict/);
  assert.match(setup, /Leave matching files unchanged/);
  assert.match(setup, /leave the existing file untouched/);
  assert.match(setup, /only after explicit author approval for that exact file/);
  assert.match(setup, /`<paths\.backups>\/reference-updates\/<UTC-stamp>\/`/);
  assert.match(setup, /independent skills do not require setup for standalone use/i);
  assert.match(instructions, /`<project-root>\/\.author-toolkit\/references\/terminology\.md`/);
});

test("existing v3 projects route missing or changed shared references through setup", async () => {
  const callers = [
    "ask-author",
    "author-handoff",
    "author-review",
    "write-fiction",
    "revise-fiction",
    "revise-draft",
    "revise-increment",
    "revise-request",
  ];
  const [operations, ...entries] = await Promise.all([
    readFile(path.join(root, "skills", "author-project", "references", "operations.md"), "utf8"),
    ...callers.map((skill) => readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8")),
  ]);

  assert.match(operations, /Before a shared workflow `read`, `validate`, or `status`/);
  assert.match(operations, /compare every packaged file/);
  assert.match(operations, /valid v3 manifest alone does not prove/);
  assert.match(operations, /missing project-relative paths/);
  assert.match(operations, /reference-version-conflict/);
  assert.match(operations, /Do not continue shared work or write project state/);

  for (const [index, text] of entries.entries()) {
    assert.match(text, /check the deployed shared references/, callers[index]);
    assert.match(text, /missing or mismatched files/, callers[index]);
    assert.match(text, /valid manifest does not prove reference deployment/, callers[index]);
    assert.match(text, /setup-author-toolkit|setup command/, callers[index]);
  }

  const review = entries[callers.indexOf("author-review")];
  const referenceCheck = review.indexOf("check the deployed shared references");
  const contractRead = review.indexOf("Read the controlled workflow terminology");
  assert.ok(
    contractRead > referenceCheck,
    "author-review checks shared references before reading project-local contracts",
  );
});

test("standalone entry points name their deployed skill-local contracts", async () => {
  for (const skill of independentSkills) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, /`references\/finding-schema\.json`/, skill);
  }
  const [prose, languageSupport, chineseRules] = await Promise.all([
    readFile(path.join(root, "skills", "prose-mechanics", "SKILL.md"), "utf8"),
    readFile(path.join(root, "skills", "prose-mechanics", "references", "language-support.md"), "utf8"),
    readFile(path.join(root, "skills", "prose-mechanics", "references", "chinese-rules.md"), "utf8"),
  ]);
  assert.match(prose, /`references\/avoid-ai-writing-adapter\.md`/);
  assert.match(languageSupport, /\(avoid-ai-writing-adapter\.md\)/);
  assert.match(chineseRules, /\[`avoid-ai-writing-adapter\.md`\]\(avoid-ai-writing-adapter\.md\)/);
});
