import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "scaffold-project.mjs");
const authorProjectRoot = path.join(root, "skills", "author-project");
const timestamp = "2026-11-16T01:02:03.000Z";

function run(args, installedTool = tool) {
  return spawnSync(process.execPath, [installedTool, ...args], { cwd: root, encoding: "utf8" });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "scaffold-project-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  return path.join(temporary, "project");
}

function argumentsFor(projectRoot, ...extra) {
  return [
    "--project-root",
    projectRoot,
    "--author-project-root",
    authorProjectRoot,
    "--created-at",
    timestamp,
    ...extra,
  ];
}

test("scaffold-project creates a complete default project with one timestamp", async (t) => {
  const projectRoot = await fixture(t);
  const result = run(argumentsFor(projectRoot, "--language", "zh-CN", "--title", "示例 $& 书名", "--json"));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true);
  assert.equal(output.validation.valid, true);
  assert.equal(output.validation.checks.length, 4);
  assert.equal(output.language, "zh-CN");
  assert.equal(output.created_at, timestamp);
  assert.deepEqual(output.created, [
    "story-bible.md",
    "audit-tracker.md",
    ".author-toolkit/backups/index.json",
    ".author-toolkit/project.json",
  ]);
  assert.deepEqual(output.preserved, []);

  const manifest = JSON.parse(await readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"));
  assert.equal(manifest.schema_version, "3.1.0");
  assert.equal(manifest.project_type, "fiction");
  assert.equal(manifest.language, "zh-CN");
  assert.equal(manifest.manuscript_root, "manuscript/");
  assert.equal(manifest.created_at, timestamp);
  assert.equal(manifest.updated_at, timestamp);
  assert.equal(manifest.current_scope, undefined);
  assert.equal(manifest.pending_action, undefined);
  assert.deepEqual(manifest.paths, output.paths);

  const storyBible = await readFile(path.join(projectRoot, "story-bible.md"), "utf8");
  assert.match(storyBible, /^# Story Bible\n/);
  assert.match(storyBible, /^- Title: 示例 \$& 书名$/m);
  const tracker = await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8");
  assert.match(tracker, new RegExp(`^- Project root: ${projectRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.match(tracker, new RegExp(`^- Manifest created at: ${timestamp}$`, "m"));
  const index = JSON.parse(await readFile(path.join(projectRoot, ".author-toolkit", "backups", "index.json"), "utf8"));
  assert.deepEqual(index, { schema_version: "1.0", backups: [], restorations: [], executions: [] });
  for (const directory of ["manuscript", "reports", "sessions", ".author-toolkit/backups", ".author-toolkit/handoffs", ".author-toolkit/creation"]) {
    assert.equal((await stat(path.join(projectRoot, directory))).isDirectory(), true);
  }
});

test("scaffold-project registers custom paths and preserves partial existing state", async (t) => {
  const projectRoot = await fixture(t);
  const manuscript = path.join(projectRoot, "draft", "chapter.md");
  const storyBible = path.join(projectRoot, "notes", "story.md");
  const indexPath = path.join(projectRoot, "state", "backups", "index.json");
  await mkdir(path.dirname(manuscript), { recursive: true });
  await mkdir(path.dirname(storyBible), { recursive: true });
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(manuscript, "Existing manuscript\n", "utf8");
  await writeFile(storyBible, "# Existing Story Bible\n", "utf8");
  const index = `${JSON.stringify({ schema_version: "1.0", backups: [], restorations: [], executions: [] }, null, 2)}\n`;
  await writeFile(indexPath, index, "utf8");

  const result = run(argumentsFor(
    projectRoot,
    "--language", "en-US",
    "--manuscript-root", "draft/chapter.md",
    "--story-bible", "notes/story.md",
    "--audit-tracker", "notes/tracker.md",
    "--reports", "reviews/",
    "--sessions", "state/sessions/",
    "--backups", "state/backups/",
    "--handoffs", "state/handoffs/",
    "--creation", "state/creation/",
    "--json",
  ));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true);
  assert.equal(output.manuscript_root, "draft/chapter.md");
  assert.deepEqual(output.paths, {
    story_bible: "notes/story.md",
    audit_tracker: "notes/tracker.md",
    reports: "reviews/",
    sessions: "state/sessions/",
    backups: "state/backups/",
    handoffs: "state/handoffs/",
    creation: "state/creation/",
  });
  assert.deepEqual(output.preserved, ["notes/story.md", "state/backups/index.json"]);
  assert.equal(await readFile(manuscript, "utf8"), "Existing manuscript\n");
  assert.equal(await readFile(storyBible, "utf8"), "# Existing Story Bible\n");
  assert.equal(await readFile(indexPath, "utf8"), index);
  assert.match(await readFile(path.join(projectRoot, "notes", "tracker.md"), "utf8"), /Manifest created at:/);
});

test("scaffold-project refuses an existing manifest without changing project files", async (t) => {
  const projectRoot = await fixture(t);
  const first = run(argumentsFor(projectRoot, "--language", "en"));
  assert.equal(first.status, 0, first.stderr);
  const files = [
    ".author-toolkit/project.json",
    ".author-toolkit/backups/index.json",
    "story-bible.md",
    "audit-tracker.md",
  ];
  const original = await Promise.all(files.map((file) => readFile(path.join(projectRoot, file), "utf8")));
  assert.match(original[2], /^- Title:$/m);

  const repeated = run(argumentsFor(projectRoot, "--language", "zh", "--title", "Replacement"));
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /project manifest already exists/);
  assert.deepEqual(
    await Promise.all(files.map((file) => readFile(path.join(projectRoot, file), "utf8"))),
    original,
  );
});

test("scaffold-project rejects unsafe paths and invalid metadata before writing", async (t) => {
  const temporaryRoot = await fixture(t);
  const pathOptions = [
    "--manuscript-root",
    "--story-bible",
    "--audit-tracker",
    "--reports",
    "--sessions",
    "--backups",
    "--handoffs",
    "--creation",
  ];
  const invalidPaths = [
    "../outside",
    "/tmp/outside",
    "~/outside",
    "C:/outside",
    "https://outside",
    "draft\\chapter.md",
    "draft/../chapter.md",
  ];
  for (const [optionIndex, option] of pathOptions.entries()) {
    for (const [pathIndex, value] of invalidPaths.entries()) {
      const projectRoot = path.join(temporaryRoot, `unsafe-${optionIndex}-${pathIndex}`);
      const result = run(argumentsFor(projectRoot, option, value));
      const label = `${option} ${value}`;
      assert.equal(result.status, 2, label);
      assert.ok(
        result.stderr.startsWith(`${option} must be a portable project-relative path, e.g. manuscript`),
        label,
      );
      assert.doesNotMatch(result.stderr, /new project manifest is invalid/, label);
      assert.match(result.stdout, /Usage:/, label);
      await assert.rejects(
        readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"),
        { code: "ENOENT" },
        label,
      );
    }
  }
  for (const [index, extra] of [["--language", "not-a-language"], ["--created-at", "yesterday"], ["--title", "two\nlines"]].entries()) {
    const projectRoot = path.join(temporaryRoot, `invalid-${index}`);
    const result = run(argumentsFor(projectRoot, ...extra));
    assert.equal(result.status, 1);
    await assert.rejects(readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"), { code: "ENOENT" });
  }
});

test("scaffold-project reports validation failures and respects the shared write lock", async (t) => {
  const projectRoot = await fixture(t);
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, "audit-tracker.md"), "Invalid existing tracker\n", "utf8");
  const invalid = run(argumentsFor(projectRoot, "--json"));
  assert.equal(invalid.status, 1);
  const output = JSON.parse(invalid.stdout);
  assert.equal(output.valid, false);
  assert.equal(output.validation.valid, false);
  assert.equal(await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8"), "Invalid existing tracker\n");

  const lockedRoot = path.join(path.dirname(projectRoot), "locked");
  const backupRoot = path.join(lockedRoot, ".author-toolkit", "backups");
  await mkdir(backupRoot, { recursive: true });
  const lockPath = path.join(backupRoot, ".writes.lock");
  await writeFile(lockPath, "other process\n", "utf8");
  const locked = run(argumentsFor(lockedRoot));
  assert.equal(locked.status, 1);
  assert.match(locked.stderr, /another project write is active or left a lock/);
  assert.equal(await readFile(lockPath, "utf8"), "other process\n");
  await assert.rejects(readFile(path.join(lockedRoot, ".author-toolkit", "project.json"), "utf8"), { code: "ENOENT" });
});

test("scaffold-project help and argument errors define the CLI contract", async () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--author-project-root DIR/);
  assert.match(help.stdout, /--project-root and use forward slashes\./);
  assert.match(help.stdout, /creates only missing directories and skeleton files/);
  for (const args of [[], ["--project-root"], ["--unknown"], ["--project-root", "/tmp/project"]]) {
    const invalid = run(args);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stdout, /Usage:/);
  }
});
