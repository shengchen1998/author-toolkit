import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "install-entry-files.mjs");
const installedSource = path.join(root, "skills", "setup-author-toolkit");

function run(args, options = {}) {
  return spawnSync(process.execPath, [options.tool ?? tool, ...args], {
    cwd: options.cwd ?? root,
    encoding: "utf8",
  });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "entry-files-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const setupRoot = path.join(temporary, "setup-author-toolkit");
  await cp(installedSource, setupRoot, { recursive: true });
  const projectRoot = path.join(temporary, "writing project");
  await mkdir(projectRoot);
  return { temporary, setupRoot, projectRoot };
}

async function validEntries(setupRoot, projectRoot) {
  assert.equal(
    await readFile(path.join(projectRoot, "AGENTS.md"), "utf8"),
    await readFile(path.join(setupRoot, "assets", "AGENTS.md"), "utf8"),
  );
  assert.equal((await lstat(path.join(projectRoot, "AGENTS.md"))).isFile(), true);
  assert.equal(await readlink(path.join(projectRoot, "CLAUDE.md")), "AGENTS.md");
  assert.deepEqual((await readdir(projectRoot)).sort(), ["AGENTS.md", "CLAUDE.md"]);
}

test("install-entry-files creates both entries from an unrelated cwd and is idempotent", async (t) => {
  const { setupRoot, projectRoot } = await fixture(t);
  const created = run(["--project-root", projectRoot, "--json"], { cwd: setupRoot });
  assert.equal(created.status, 0, created.stderr);
  assert.equal(created.stderr, "");
  assert.deepEqual(JSON.parse(created.stdout), {
    valid: true,
    project_root: projectRoot,
    agents: { path: "AGENTS.md", status: "created" },
    claude: { path: "CLAUDE.md", target: "AGENTS.md", status: "missing" },
  });
  await validEntries(setupRoot, projectRoot);
  const agentsStats = await lstat(path.join(projectRoot, "AGENTS.md"));
  const claudeStats = await lstat(path.join(projectRoot, "CLAUDE.md"));

  const unchanged = run(["--project-root", projectRoot], { cwd: setupRoot });
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.equal(
    unchanged.stdout,
    "AGENTS.md: unchanged\nCLAUDE.md -> AGENTS.md: unchanged\nEntry files: unchanged\n",
  );
  assert.equal((await lstat(path.join(projectRoot, "AGENTS.md"))).ino, agentsStats.ino);
  assert.equal((await lstat(path.join(projectRoot, "CLAUDE.md"))).ino, claudeStats.ino);
});

test("install-entry-files replaces regular files, symlinks, and dangling links", async (t) => {
  const { setupRoot, projectRoot } = await fixture(t);
  const sentinel = path.join(projectRoot, "sentinel.txt");
  await writeFile(sentinel, "preserve\n");
  await writeFile(path.join(projectRoot, "AGENTS.md"), "custom agents\n");
  await symlink("other.md", path.join(projectRoot, "CLAUDE.md"));

  const replaced = run(["--project-root", projectRoot]);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.equal(
    replaced.stdout,
    "AGENTS.md: replaced\nCLAUDE.md -> AGENTS.md: replaced\nEntry files: updated\n",
  );
  assert.equal(await readFile(sentinel, "utf8"), "preserve\n");
  await writeFile(path.join(projectRoot, "AGENTS.md"), "custom again\n");
  await rm(path.join(projectRoot, "CLAUDE.md"));
  await symlink("missing-target", path.join(projectRoot, "CLAUDE.md"));
  const dangling = run(["--project-root", projectRoot, "--json"]);
  assert.equal(dangling.status, 0, dangling.stderr);
  assert.equal(JSON.parse(dangling.stdout).agents.status, "replaced");
  assert.equal(JSON.parse(dangling.stdout).claude.status, "replaced");
  assert.equal(await readFile(sentinel, "utf8"), "preserve\n");
  const files = await readdir(projectRoot);
  assert.deepEqual(files.filter((file) => file.endsWith(".tmp")), []);
});

test("install-entry-files rejects a directory before changing either target", async (t) => {
  const { setupRoot, projectRoot } = await fixture(t);
  await writeFile(path.join(projectRoot, "AGENTS.md"), "preserve\n");
  await mkdir(path.join(projectRoot, "CLAUDE.md"));
  const blocked = run(["--project-root", projectRoot, "--json"]);
  assert.equal(blocked.status, 1);
  assert.equal(blocked.stdout, "");
  assert.match(blocked.stderr, /CLAUDE\.md: is a directory/);
  assert.equal(await readFile(path.join(projectRoot, "AGENTS.md"), "utf8"), "preserve\n");
  assert.equal((await lstat(path.join(projectRoot, "CLAUDE.md"))).isDirectory(), true);
  assert.deepEqual((await readdir(projectRoot)).sort(), ["AGENTS.md", "CLAUDE.md"]);

  await rm(path.join(projectRoot, "CLAUDE.md"), { recursive: true });
  await writeFile(path.join(projectRoot, "CLAUDE.md"), "preserve link\n");
  await rm(path.join(projectRoot, "AGENTS.md"));
  await mkdir(path.join(projectRoot, "AGENTS.md"));
  const agentsBlocked = run(["--project-root", projectRoot]);
  assert.equal(agentsBlocked.status, 1);
  assert.match(agentsBlocked.stderr, /AGENTS\.md: is a directory/);
  assert.equal(await readFile(path.join(projectRoot, "CLAUDE.md"), "utf8"), "preserve link\n");
  assert.equal((await lstat(path.join(projectRoot, "AGENTS.md"))).isDirectory(), true);
});

test("install-entry-files verifies the installed copy and reports argument errors", async (t) => {
  const { setupRoot, projectRoot } = await fixture(t);
  const installedTool = path.join(setupRoot, "scripts", "install-entry-files.mjs");
  const installed = run(["--project-root", projectRoot, "--json"], { tool: installedTool });
  assert.equal(installed.status, 0, installed.stderr);
  await validEntries(setupRoot, projectRoot);

  const help = run(["--help"], { tool: installedTool });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /check\.mjs --project-root DIR --diagnose/);
  assert.doesNotMatch(help.stdout, /Run doctor\.mjs/);
  for (const args of [[], ["--project-root"], ["--unknown"], ["--project-root", projectRoot, "extra"]]) {
    const invalid = run(args);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stdout, /Usage:/);
  }

  await writeFile(path.join(setupRoot, "assets", "references", "terminology.md"), "drift\n");
  await writeFile(path.join(projectRoot, "AGENTS.md"), "preserve\n");
  const payloadFailure = run(["--project-root", projectRoot], { tool: installedTool });
  assert.equal(payloadFailure.status, 1);
  assert.match(payloadFailure.stderr, /payload is incomplete/);
  assert.equal(await readFile(path.join(projectRoot, "AGENTS.md"), "utf8"), "preserve\n");

  const missingRoot = run(["--project-root", path.join(projectRoot, "missing")]);
  assert.equal(missingRoot.status, 1);
  assert.match(missingRoot.stderr, /ENOENT/);
});
