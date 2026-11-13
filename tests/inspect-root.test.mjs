import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "scripts", "inspect-root.mjs");

function inspect(projectRoot, args = []) {
  return spawnSync(process.execPath, [script, "--project-root", projectRoot, "--json", ...args], {
    encoding: "utf8",
  });
}

test("root inspection returns bounded candidates and historical counts without artifact paths", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "inspect-root-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const project = path.join(temporaryRoot, "project");
  await mkdir(path.join(project, "manuscript"), { recursive: true });
  await mkdir(path.join(project, "chapters"), { recursive: true });
  await mkdir(path.join(project, "sessions"), { recursive: true });
  await mkdir(path.join(project, ".author-toolkit", "backups", "nested"), { recursive: true });
  await writeFile(path.join(project, "AGENTS.md"), "agents\n");
  await symlink("AGENTS.md", path.join(project, "CLAUDE.md"));
  await writeFile(path.join(project, "story-bible.md"), "story\n");
  await writeFile(path.join(project, "manuscript", "1.md"), "one\n");
  await writeFile(path.join(project, "chapters", "2.txt"), "two\n");
  for (let index = 0; index < 40; index += 1) {
    await writeFile(path.join(project, "sessions", `historical-${index}.md`), "history\n");
  }
  await writeFile(path.join(project, ".author-toolkit", "backups", "nested", "backup.md"), "backup\n");

  const result = inspect(project);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.entries, {
    "AGENTS.md": "file",
    "CLAUDE.md": "symlink",
    "START_HERE.md": "missing",
  });
  assert.deepEqual(output.manuscript_candidates, [
    { path: "chapters/", type: "directory", direct_manuscript_files: 1 },
    { path: "manuscript/", type: "directory", direct_manuscript_files: 1 },
  ]);
  assert.equal(output.components.manifest.type, "missing");
  assert.equal(output.components.story_bible.type, "file");
  assert.equal(output.historical_file_counts["sessions/"], 40);
  assert.equal(output.historical_file_counts[".author-toolkit/backups/"], 1);
  assert.equal(output.historical_file_counts["reports/"], null);
  assert.doesNotMatch(result.stdout, /historical-\d+\.md|backup\.md/);
});

test("root inspection caps manuscript candidates and reports the omitted count", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "inspect-root-limit-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  for (let index = 0; index < 15; index += 1) {
    await writeFile(path.join(temporaryRoot, `candidate-${String(index).padStart(2, "0")}.md`), "text\n");
  }

  const result = inspect(temporaryRoot);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.manuscript_candidates.length, 12);
  assert.equal(output.omitted_manuscript_candidates, 3);
  assert.doesNotMatch(result.stdout, /candidate-12\.md|candidate-13\.md|candidate-14\.md/);
});

test("root inspection rejects argument errors and non-directory roots", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "inspect-root-errors-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const file = path.join(temporaryRoot, "file.txt");
  await writeFile(file, "text\n");

  const unknown = spawnSync(process.execPath, [script, "--unknown"], { encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown or incomplete argument/);
  const invalidRoot = inspect(file);
  assert.equal(invalidRoot.status, 1);
  assert.match(invalidRoot.stderr, /must name an accessible directory/);
});
