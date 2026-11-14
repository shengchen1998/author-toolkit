import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  generateReviewBrief,
  validateReviewBrief,
} from "../scripts/lib/index.mjs";
import { exampleRoot, root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "review-brief.mjs");
const timestamp = "2026-11-15T04:00:00Z";

function tracker(rows) {
  return `# Audit Tracker

## Findings

| Finding ID | Stage | Audit | Location | Status | Current report | Updated | Decision or stale reason |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Approvals

| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |
|---|---|---|---|---|---|---|---|
`;
}

function findingRow(id, status, location, reason, report = "reports/structure/2026-01-17_structure.md") {
  return `| ${id} | current-scope-review | author-review-fresh-reader | ${location} | ${status} | ${report} | ${timestamp} | ${reason} |`;
}

async function fixture(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(path.join(output, "review-brief-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = path.join(directory, "project");
  await cp(exampleRoot(), project, { recursive: true });
  return { directory, project };
}

function run(projectRoot, args = [], cwd = projectRoot) {
  return spawnSync(process.execPath, [tool, "--project-root", projectRoot, ...args], { cwd, encoding: "utf8" });
}

test("review brief generation copies complete Chinese decisions and preserves special cells", () => {
  const reason = "作者保留有意重复；“可是我错了”与 `可是我又错了` 的语气不同。";
  const location = "`manuscript/2.md`, passage 如果我能尽快揭开眼罩、去除口塞，那么我就不再害怕了。";
  const markdown = tracker([
    findingRow("READER-026", "dismissed", location, reason),
    findingRow("READER-027", "dismissed", "`` `manuscript/2.md` | passage with | pipe ``", "`` `保留 A|B` ``"),
    findingRow("STANDARD-036", "resolved", "`manuscript/2.md`, chapter 2", "保留“可是我错了”“可是我又错了”等有意重复；输出哈希 `f359eb87`。"),
    findingRow("STANDARD-038", "open", "manuscript/2.md", "No author decision recorded."),
  ]);
  const result = generateReviewBrief(markdown, "audit-tracker.md", timestamp);
  assert.equal(result.resolved, 1);
  assert.equal(result.dismissed, 2);
  assert.equal(validateReviewBrief(result.markdown, markdown).valid, true);
  assert.match(result.markdown, /保留 A\|B/);
  assert.match(result.markdown, /READER-026/);
  assert.doesNotMatch(result.markdown, /STANDARD-038/);
  const rows = result.markdown.split("\n").filter((line) => line.startsWith("| READER-026"));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes(reason));
});

test("review brief generation marks both sections when no decisions exist", () => {
  const result = generateReviewBrief(tracker([]), "audit-tracker.md", timestamp);
  assert.equal(result.markdown.match(/No resolved or dismissed findings\./g).length, 2);
  assert.equal(validateReviewBrief(result.markdown, tracker([])).valid, true);
});

test("review brief CLI regenerates every decision and accepts the requested options", async (t) => {
  const { directory, project } = await fixture(t);
  const rows = [
    findingRow("INTENT-007", "resolved", "`manuscript/chapter-01.md`, chapter 1", "作者批准并验证了精确替换；输出哈希 `f359eb87`。"),
    findingRow("INTENT-008", "dismissed", "`manuscript/chapter-01.md`, chapter 1", "作者决定保留这一叙事选择。"),
    ...Array.from({ length: 26 }, (_, index) => findingRow(
      `READER-${String(index + 1).padStart(3, "0")}`,
      index === 25 ? "dismissed" : "resolved",
      "`manuscript/chapter-02.md`, chapter 2",
      `第 ${index + 1} 项决定的完整原因，不缩写。`,
    )),
  ];
  const trackerPath = path.join(project, "audit-tracker.md");
  await writeFile(trackerPath, tracker(rows), "utf8");
  const result = spawnSync(process.execPath, [tool, "--updated-at", timestamp, "--json"], { cwd: project, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.path, "reports/review_brief.md");
  assert.equal(summary.resolved, 26);
  assert.equal(summary.dismissed, 2);
  const markdown = await readFile(path.join(project, summary.path), "utf8");
  assert.equal(validateReviewBrief(markdown, await readFile(trackerPath, "utf8")).valid, true);
  assert.equal(markdown.match(/^\| READER-\d{3} /gm).length, 26);
  assert.match(markdown, /READER-026/);
  assert.match(markdown, /第 26 项决定的完整原因，不缩写。/);
  assert.match(markdown, /作者批准并验证了精确替换；输出哈希 `f359eb87`。/);

  const custom = run(project, ["--tracker", "audit-tracker.md", "--out", "reports/custom-brief.md", "--updated-at", timestamp]);
  assert.equal(custom.status, 0, custom.stderr);
  assert.match(custom.stdout, /resolved: 26\ndismissed: 2/);
  assert.equal(await readFile(path.join(project, "reports/custom-brief.md"), "utf8"), markdown);
});

test("review brief CLI preserves the previous brief on malformed or incomplete trackers", async (t) => {
  const { project } = await fixture(t);
  const destination = path.join(project, "reports/review_brief.md");
  await writeFile(destination, "previous brief\n", "utf8");
  await writeFile(path.join(project, "audit-tracker.md"), "# Tracker without required tables\n", "utf8");
  const malformed = run(project);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /expected exactly one ## Approvals heading/);
  assert.equal(await readFile(destination, "utf8"), "previous brief\n");

  const trackerPath = path.join(project, "audit-tracker.md");
  await writeFile(trackerPath, tracker([
    findingRow("READER-026", "resolved", "`manuscript/chapter-01.md`, chapter 1", "Verified decision", "reports/missing.md"),
  ]), "utf8");
  const missing = run(project);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /current report does not exist/);
  assert.equal(await readFile(destination, "utf8"), "previous brief\n");
});

test("review brief CLI rejects unsafe paths, tracker replacement, and argument errors", async (t) => {
  const { project } = await fixture(t);
  for (const args of [
    ["--tracker", "../outside.md"],
    ["--out", "../outside.md"],
    ["--out", "audit-tracker.md"],
    ["--updated-at", "not-a-time"],
    ["--out"],
  ]) {
    const result = run(project, args);
    assert.equal(result.status, args[0] === "--updated-at" || args.length === 1 ? 2 : 1, result.stderr);
  }
  assert.equal(spawnSync(process.execPath, [tool, "--help"], { encoding: "utf8" }).status, 0);
});

test("review brief CLI honors the shared write lock and project symlinks", async (t) => {
  const { directory, project } = await fixture(t);
  const manifest = JSON.parse(await readFile(path.join(project, ".author-toolkit/project.json"), "utf8"));
  await mkdir(path.join(project, manifest.paths.backups), { recursive: true });
  await writeFile(path.join(project, manifest.paths.backups, ".writes.lock"), "occupied\n", "utf8");
  const locked = run(project);
  assert.equal(locked.status, 1);
  assert.match(locked.stderr, /another project write is active/);
  await rm(path.join(project, manifest.paths.backups, ".writes.lock"));

  const linkedProject = path.join(directory, "linked-project");
  await symlink(project, linkedProject);
  const linked = run(linkedProject, ["--updated-at", timestamp, "--json"]);
  assert.equal(linked.status, 0, linked.stderr);
  assert.equal(JSON.parse(linked.stdout).valid, true);
  assert.equal(await realpath(path.join(project, "reports/review_brief.md")), await realpath(path.join(linkedProject, "reports/review_brief.md")));
});
