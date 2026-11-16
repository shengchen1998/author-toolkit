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
  assert.equal(Object.hasOwn(output, "language_sample"), false);
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

test("opt-in language sampling reads the first direct file of one directory candidate", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "inspect-root-sample-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await mkdir(path.join(temporaryRoot, "manuscript"));
  await writeFile(path.join(temporaryRoot, "manuscript", "1.md"), `${"汉".repeat(299)}😀tail`, "utf8");
  await writeFile(path.join(temporaryRoot, "manuscript", "2.md"), "second\n", "utf8");

  const result = inspect(temporaryRoot, ["--language-sample"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.language_sample, {
    status: "sampled",
    path: "manuscript/1.md",
    text: `${"汉".repeat(299)}😀`,
  });
  assert.equal([...output.language_sample.text].length, 300);
  assert.doesNotMatch(output.language_sample.text, /tail/);
});

test("opt-in language sampling rejects invalid UTF-8 with its file path", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "inspect-root-invalid-utf8-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await mkdir(path.join(temporaryRoot, "manuscript"));
  await writeFile(path.join(temporaryRoot, "manuscript", "1.md"), Buffer.from([0xf0, 0x28, 0x8c, 0x28]));

  const result = inspect(temporaryRoot, ["--language-sample"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Language sample is not valid UTF-8: manuscript/1.md\n");
});

test("language sampling stops without a unique unomitted manuscript file", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "inspect-root-ambiguous-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await mkdir(path.join(temporaryRoot, "empty"));
  await mkdir(path.join(temporaryRoot, "first"));
  await mkdir(path.join(temporaryRoot, "second"));
  await writeFile(path.join(temporaryRoot, "first", "1.md"), "first\n");
  await writeFile(path.join(temporaryRoot, "second", "2.md"), "second\n");

  const ambiguous = inspect(temporaryRoot, ["--language-sample"]);
  assert.equal(ambiguous.status, 0, ambiguous.stderr);
  assert.deepEqual(JSON.parse(ambiguous.stdout).language_sample, { status: "not_unique" });
  assert.doesNotMatch(ambiguous.stdout, /first\\n|second\\n/);

  const omittedProject = path.join(temporaryRoot, "omitted");
  await mkdir(omittedProject);
  for (let index = 0; index < 13; index += 1) {
    await writeFile(path.join(omittedProject, `candidate-${String(index).padStart(2, "0")}.md`), "text\n");
  }
  const omitted = inspect(omittedProject, ["--language-sample"]);
  assert.equal(omitted.status, 0, omitted.stderr);
  assert.deepEqual(JSON.parse(omitted.stdout).language_sample, { status: "not_unique" });
  assert.doesNotMatch(omitted.stdout, /text\\n/);

  const empty = inspect(path.join(temporaryRoot, "empty"), ["--language-sample"]);
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout).language_sample, { status: "no_manuscript_file" });
});
