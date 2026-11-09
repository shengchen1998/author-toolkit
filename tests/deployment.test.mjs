import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

test("setup carries self-contained validation and state CLIs", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "setup-cli-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const mirror = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "sync-setup-runtime.mjs"), "--check"],
    { encoding: "utf8" },
  );
  assert.equal(mirror.status, 0, mirror.stderr);

  const installedSetup = path.join(temporaryRoot, "setup-author-toolkit");
  await cp(path.dirname(path.dirname(setupReferences)), installedSetup, { recursive: true });
  const loader = path.join(temporaryRoot, "block-runtime-packages.mjs");
  await writeFile(
    loader,
    `export async function resolve(specifier, context, nextResolve) {
      if (/^(?:ajv|ajv-formats|fast-deep-equal|fast-uri|json-schema-traverse|require-from-string)(?:\\/|$)/.test(specifier)) {
        throw new Error("Runtime package import blocked: " + specifier);
      }
      return nextResolve(specifier, context);
    }
  `,
  );

  const preload = path.join(temporaryRoot, "block-runtime-packages.cjs");
  await writeFile(
    preload,
    `const Module = require("node:module");
    const load = Module._load;
    Module._load = function (request, ...args) {
      if (/^(?:ajv|ajv-formats|fast-deep-equal|fast-uri|json-schema-traverse|require-from-string)(?:\\/|$)/.test(request)) {
        throw new Error("Runtime package require blocked: " + request);
      }
      return load.call(this, request, ...args);
    };
  `,
  );

  const nodeArgs = ["--no-warnings", "--experimental-loader", loader, "--require", preload];
  for (const script of ["validate.mjs", "status.mjs", "project-digest.mjs", "findings.mjs"]) {
    const result = spawnSync(
      process.execPath,
      [...nodeArgs, path.join(installedSetup, "scripts", script), "--help"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
  }

  const result = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "validate.mjs"),
      "--manifest",
      path.join(root, "examples", "fiction-revision-zh", ".author-toolkit", "project.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5 checks, 0 failures/);

  const project = path.join(temporaryRoot, "writing-project");
  await cp(path.join(root, "examples", "fiction-revision-zh"), project, { recursive: true });

  const allocation = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "findings.mjs"),
      "next-finding-id",
      "STRUCT",
      "--manifest",
      path.join(project, ".author-toolkit", "project.json"),
      "--count",
      "2",
    ],
    { encoding: "utf8" },
  );
  assert.equal(allocation.status, 0, allocation.stderr);
  assert.deepEqual(JSON.parse(allocation.stdout).ids, ["STRUCT-005", "STRUCT-006"]);

  const digest = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "project-digest.mjs"),
      "--project-root",
      project,
    ],
    { encoding: "utf8" },
  );
  assert.equal(digest.status, 0, digest.stderr);
  assert.equal(digest.stdout, "PROJECT_STATE.md\n");
  const cache = await readFile(path.join(project, "PROJECT_STATE.md"), "utf8");
  assert.ok(cache.trimEnd().split("\n").length <= 30);
  assert.match(cache, /Generated navigation cache/);
  assert.match(cache, /Latest session: `sessions\/2026-01-19_resume\.md`/);
  assert.doesNotMatch(cache, /backups\/index\.json/);

  const status = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "status.mjs"),
      "--manifest",
      path.join(project, ".author-toolkit", "project.json"),
      "--scope-id",
      "scope-example-revision",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(status.status, 0, status.stderr);
  const execution = JSON.parse(status.stdout).execution;
  assert.equal(execution.scope_id, "scope-example-revision");
  assert.equal(execution.required, 0);
  assert.equal(execution.unverified_count, 0);
});

test("workflow commands resolve the installed setup CLIs", async () => {
  const files = await markdownFiles(path.join(root, "skills"));
  for (const file of files) {
    const text = await readFile(path.join(root, "skills", file), "utf8");
    assert.doesNotMatch(text, /<toolkit-root>|manual-checks-only/, file);
  }

  const operations = await readFile(
    path.join(root, "skills", "author-project", "references", "operations.md"),
    "utf8",
  );
  assert.match(operations, /node <setup-skill-root>\/scripts\/validate\.mjs --manifest/);
  assert.doesNotMatch(operations, /migrate-v3\.mjs/);
});

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
  for (const file of ["context-fit.md"]) {
    const canonical = await readFile(path.join(canonicalReferences, file), "utf8");
    for (const skill of ["fiction-workshop", "prose-mechanics"]) {
      const deployed = await readFile(
        path.join(root, "skills", skill, "references", file),
        "utf8",
      );
      assert.equal(deployed, canonical, `${skill} carries ${file}`);
    }
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

test("every installed shared reference named by a skill exists in the setup payload", async () => {
  const [files, payload] = await Promise.all([
    markdownFiles(path.join(root, "skills")),
    filesUnder(setupReferences),
  ]);
  const available = new Set(payload);
  const missing = new Set();
  for (const file of files) {
    const text = await readFile(path.join(root, "skills", file), "utf8");
    assert.doesNotMatch(text, /\.author-toolkit\/references\//, file);
    for (const match of text.matchAll(/<setup-skill-root>\/assets\/references\/([A-Za-z0-9._-]+)/g)) {
      if (!available.has(match[1])) missing.add(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual([...missing].sort(), []);
});

test("setup overwrites AGENTS.md and links CLAUDE.md to it", async () => {
  const setup = await readFile(
    path.join(root, "skills", "setup-author-toolkit", "SKILL.md"),
    "utf8",
  );

  assert.match(setup, /On every setup, replace `<project-root>\/AGENTS\.md` with a regular file containing `assets\/AGENTS\.md`/);
  assert.match(setup, /replace any existing `CLAUDE\.md` file or symlink/);
  assert.match(setup, /remove any existing regular files or symlinks with `rm -f AGENTS\.md CLAUDE\.md`/);
  assert.match(setup, /run `ln -s AGENTS\.md CLAUDE\.md`/);
  assert.match(setup, /If either target is a directory, or any operation fails, stop/);
  assert.match(setup, /applies to new projects and existing v3\.1 projects/);
  assert.match(setup, /Except for the two project-root agent entry files described above/);
});

test("setup reads shared references without deploying them into project state", async () => {
  const [setup, instructions] = await Promise.all([
    readFile(path.join(root, "skills", "setup-author-toolkit", "SKILL.md"), "utf8"),
    readFile(path.join(root, "skills", "setup-author-toolkit", "assets", "AGENTS.md"), "utf8"),
  ]);
  assert.match(setup, /Keep every shared runtime contract in this installed skill's `assets\/references\/` payload/);
  assert.match(setup, /Do not copy shared contracts into the writing project/);
  assert.match(setup, /incomplete toolkit installation/);
  assert.doesNotMatch(setup, /Deploy every file|reference-version-conflict|reference-updates/);
  assert.match(setup, /independent skills do not require setup for standalone use/i);
  assert.match(instructions, /`<setup-skill-root>\/assets\/references\/terminology\.md`/);
  assert.match(instructions, /rather than copying contracts into the writing project/);
});

test("shared workflows resolve installed setup references without project deployment", async () => {
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

  assert.match(operations, /read shared runtime contracts directly from its `assets\/references\/` payload/);
  assert.match(operations, /Before a shared workflow `read`, `validate`, or `status`/);
  assert.match(operations, /Read shared runtime contracts directly from `<setup-skill-root>\/assets\/references\/`/);
  assert.match(operations, /incomplete toolkit installation/);
  assert.doesNotMatch(operations, /compare every packaged file|missing project-relative paths|reference-version-conflict/);

  for (const [index, text] of entries.entries()) {
    assert.match(text, /resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>`/i, callers[index]);
    assert.match(text, /incomplete toolkit installation/, callers[index]);
    assert.doesNotMatch(text, /check the deployed shared references|valid manifest does not prove reference deployment/, callers[index]);
  }

  for (const skill of ["revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = entries[callers.indexOf(skill)];
    assert.match(text, /tracker path, and resolved `<setup-skill-root>`/, skill);
  }
  assert.match(
    entries[callers.indexOf("write-fiction")],
    /Include the resolved `<setup-skill-root>` in shared workflow context/,
  );

  const review = entries[callers.indexOf("author-review")];
  const rootResolution = review.indexOf("Resolve the installed `setup-author-toolkit`");
  const contractRead = review.indexOf("Read the controlled workflow terminology");
  assert.ok(
    contractRead > rootResolution,
    "author-review resolves the setup skill before reading its installed contracts",
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
  assert.match(prose, /`references\/context-fit\.md`/);
  assert.match(languageSupport, /\(avoid-ai-writing-adapter\.md\)/);
  assert.match(chineseRules, /\[`avoid-ai-writing-adapter\.md`\]\(avoid-ai-writing-adapter\.md\)/);
});
