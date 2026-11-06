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

  function projectResponse(processResult, command) {
    const response = JSON.parse(processResult.stdout);
    assert.equal(response.response_contract_version, "1.0");
    assert.equal(response.command, command);
    assert.equal(typeof response.valid, "boolean");
    assert.ok(Object.hasOwn(response, "result"));
    assert.ok(Array.isArray(response.errors));
    return response;
  }

  const freshProject = path.join(temporary, "manuscript-only-project");
  await mkdir(path.join(freshProject, "manuscript"), { recursive: true });
  await writeFile(
    path.join(freshProject, "manuscript", "chapter-001.md"),
    "# Chapter One\n\nThe ferry leaves at dusk.\n",
    "utf8",
  );
  const initialized = runInstalled("author-project.mjs", [
    "init",
    "--project-root",
    freshProject,
    "--language",
    "en",
  ]);
  assert.equal(initialized.status, 0, `${initialized.stdout}\n${initialized.stderr}`);
  const initializationResponse = projectResponse(initialized, "init");
  assert.equal(initializationResponse.valid, true);
  assert.equal(initializationResponse.result.initialized, true);

  const compact = runInstalled("author-project.mjs", ["status", "--project-root", freshProject]);
  assert.equal(compact.status, 0, compact.stdout);
  const compactResponse = projectResponse(compact, "status");
  assert.equal(compactResponse.valid, true);
  assert.equal(compactResponse.result.view, "compact");
  assert.equal(compactResponse.result.project.valid, true);
  assert.equal(compactResponse.result.references.valid, true);
  assert.equal(compactResponse.result.scope, null);
  assert.equal(compactResponse.result.evaluation.outcome, "indeterminate");
  assert.equal(compactResponse.result.decisions.findings.total, 0);
  assert.equal(compactResponse.result.next_action.command, "revise-draft");
  assert.equal(Object.hasOwn(compactResponse.result, "manifest"), false);

  const full = runInstalled("author-project.mjs", ["read", "--project-root", freshProject, "--full"]);
  assert.equal(full.status, 0, full.stdout);
  const fullResponse = projectResponse(full, "read");
  assert.equal(fullResponse.result.view, "full");
  assert.equal(fullResponse.result.manifest.schema_version, "3.2.0");
  assert.equal(fullResponse.result.status.query_valid, true);

  const projectUsage = runInstalled("author-project.mjs", ["unknown-command"]);
  assert.equal(projectUsage.status, 2);
  assert.equal(projectUsage.stderr, "");
  assert.equal(projectResponse(projectUsage, "unknown-command").errors[0].code, "usage-error");

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
    "Installed runtime smoke passed: generic installer, isolated help, manuscript-only init, compact and full project views, unified responses, real schema validation, exit codes, and shared-reference diagnostics.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
