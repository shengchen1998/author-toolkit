#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-installed-smoke-"));

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

try {
  const source = path.join(temporary, "source");
  const installation = path.join(temporary, "installation");
  const home = path.join(temporary, "home");
  await Promise.all([
    cp(path.join(root, "skills"), path.join(source, "skills"), { recursive: true }),
    mkdir(installation, { recursive: true }),
    mkdir(home, { recursive: true }),
  ]);

  const installed = run(
    "npx",
    [
      "--yes",
      "skills@latest",
      "add",
      source,
      "--agent",
      "claude-code",
      "--skill",
      "setup-author-toolkit",
      "--yes",
      "--copy",
      "--json",
    ],
    {
      cwd: installation,
      env: { ...process.env, HOME: home, npm_config_update_notifier: "false" },
      timeout: 90000,
    },
  );
  assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);

  const installedSkill = path.join(
    installation,
    ".claude",
    "skills",
    "setup-author-toolkit",
  );
  const installedAssets = path.join(installedSkill, "assets");
  const runtime = path.join(installedAssets, "runtime");
  const projectRoot = path.join(temporary, "writing-project");
  await cp(path.join(root, "examples", "fiction-revision-en"), projectRoot, {
    recursive: true,
  });
  await cp(
    path.join(installedAssets, "references"),
    path.join(projectRoot, ".author-toolkit", "references"),
    { recursive: true },
  );
  await rm(source, { recursive: true, force: true });

  function runInstalled(entryPoint, args = []) {
    return run(process.execPath, [path.join(runtime, entryPoint), ...args], {
      cwd: installation,
      env: { HOME: home, PATH: "", NODE_PATH: "" },
    });
  }

  for (const entryPoint of ["validate.mjs", "author-project.mjs"]) {
    const help = runInstalled(entryPoint);
    assert.equal(help.status, 0, `${entryPoint}: ${help.stderr}`);
    assert.match(help.stdout, /Usage:/);
    assert.doesNotMatch(help.stdout, /checks, [0-9]+ failures/);
    const artifact = await readFile(path.join(runtime, entryPoint), "utf8");
    assert.ok(!artifact.includes(root), `${entryPoint} contains no development-root path`);
  }

  const valid = runInstalled("validate.mjs", ["--project-root", projectRoot]);
  assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
  assert.match(valid.stdout, /4 checks, 0 failures/);
  assert.doesNotMatch(valid.stdout, /manual-checks-only/);
  assert.doesNotMatch(valid.stdout, /fiction-revision-zh/);

  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.paths.reports = "../outside";
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const invalid = runInstalled("validate.mjs", ["--project-root", projectRoot]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /\/paths\/reports/);

  const usage = runInstalled("validate.mjs", ["--project-root"]);
  assert.equal(usage.status, 2);
  assert.match(usage.stdout, /Usage:/);

  const terminology = path.join(
    projectRoot,
    ".author-toolkit",
    "references",
    "terminology.md",
  );
  await writeFile(terminology, "locally changed reference\n", "utf8");
  const conflict = runInstalled("validate.mjs", ["--project-root", projectRoot]);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /reference-version-conflict/);
  assert.match(conflict.stderr, /expected_sha256=[a-f0-9]{64}/);
  assert.match(conflict.stderr, /actual_sha256=[a-f0-9]{64}/);

  await rm(terminology);
  const missing = runInstalled("validate.mjs", ["--project-root", projectRoot]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing shared reference/i);
  assert.match(missing.stderr, /terminology\.md/);

  console.log(
    "Installed runtime smoke passed: generic installer, isolated help, real schema validation, exit codes, and shared-reference diagnostics.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
