import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { inspectSetupPayload } from "../scripts/lib/setup-payload.mjs";
import { root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "doctor.mjs");
const installedSource = path.join(root, "skills", "setup-author-toolkit");

function run(args = [], options = {}) {
  return spawnSync(process.execPath, [options.tool ?? tool, ...args], {
    cwd: options.cwd ?? root,
    encoding: "utf8",
  });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "doctor-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const setupRoot = path.join(temporary, "setup-author-toolkit");
  await cp(installedSource, setupRoot, { recursive: true });
  const projectRoot = path.join(temporary, "writing-project");
  await mkdir(projectRoot);
  await cp(path.join(setupRoot, "assets", "AGENTS.md"), path.join(projectRoot, "AGENTS.md"));
  await symlink("AGENTS.md", path.join(projectRoot, "CLAUDE.md"));
  return { temporary, setupRoot, projectRoot };
}

test("doctor reports a bounded summary for a complete installed payload", async (t) => {
  const { setupRoot, projectRoot } = await fixture(t);
  const result = run(["--project-root", projectRoot], {
    tool: path.join(setupRoot, "scripts", "doctor.mjs"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /^Setup payload: \d+ files \(\d+ references, 6 CLIs\); project entry files included\nFailures: 0\n$/,
  );
  assert.equal(result.stderr, "");

  const json = run(["--project-root", projectRoot, "--json"], {
    tool: path.join(setupRoot, "scripts", "doctor.mjs"),
  });
  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.payload_manifest, "payload-manifest.json");
  assert.equal(parsed.clis, 6);
  assert.equal(parsed.project.agents, "ok");
  assert.equal(parsed.project.claude, "ok");
  assert.deepEqual(parsed.failures, []);
});

test("source doctor resolves the checked-in setup skill", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Setup payload: \d+ files \(\d+ references, 6 CLIs\)\nFailures: 0/);
});

test("doctor reports only failed payload paths, including missing internal modules and drift", async (t) => {
  const { setupRoot } = await fixture(t);
  await rm(path.join(setupRoot, "scripts", "lib", "digest.mjs"));
  await writeFile(path.join(setupRoot, "assets", "references", "terminology.md"), "drift\n");
  await rm(path.join(setupRoot, "assets", "references", "state-and-findings.md"), { force: true });

  const result = run([], { tool: path.join(setupRoot, "scripts", "doctor.mjs") });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^Setup payload: \d+ files \(\d+ references, 6 CLIs\)\nFailures: 2\n$/);
  assert.match(result.stderr, /scripts\/lib\/digest\.mjs: missing or unreadable/);
  assert.match(result.stderr, /assets\/references\/terminology\.md: SHA-256 differs/);
  assert.doesNotMatch(result.stderr, /state-and-findings/);
  assert.doesNotMatch(result.stdout, /AGENTS\.md|project entry files/);
});

test("doctor checks project entry files without reading project state", async (t) => {
  const { setupRoot, projectRoot } = await fixture(t);
  await writeFile(path.join(projectRoot, "AGENTS.md"), "custom\n");
  await rm(path.join(projectRoot, "CLAUDE.md"));
  await writeFile(path.join(projectRoot, "CLAUDE.md"), "custom\n");
  await mkdir(path.join(projectRoot, ".author-toolkit"));
  await writeFile(path.join(projectRoot, ".author-toolkit", "project.json"), "{ invalid\n");
  const result = run(["--project-root", projectRoot, "--json"], {
    tool: path.join(setupRoot, "scripts", "doctor.mjs"),
  });
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.files > 0, true);
  assert.equal(parsed.project.agents, "different from installed template");
  assert.equal(parsed.project.claude, "not a symbolic link");
  assert.deepEqual(parsed.failures.map((failure) => failure.path), [
    "project:AGENTS.md",
    "project:CLAUDE.md",
  ]);
});

test("doctor does not guess required files from a missing or invalid manifest", async (t) => {
  const { setupRoot } = await fixture(t);
  const installedTool = path.join(setupRoot, "scripts", "doctor.mjs");
  const manifestPath = path.join(setupRoot, "assets", "payload-manifest.json");
  const original = await readFile(manifestPath, "utf8");
  await rm(manifestPath);
  const missing = run([], { tool: installedTool });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /Setup payload: 0 files \(0 references, 0 CLIs\)\nFailures: 1/);
  assert.match(missing.stderr, /payload-manifest\.json: missing or unreadable/);
  assert.doesNotMatch(missing.stderr, /validate\.mjs|terminology\.md/);

  await writeFile(manifestPath, "{ invalid\n");
  const invalid = run([], { tool: installedTool });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /payload-manifest\.json: invalid JSON/);
  await writeFile(manifestPath, original);
});

test("doctor rejects unsupported manifest shapes and unsafe paths", async () => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "doctor-manifest-"));
  try {
    await mkdir(path.join(temporary, "assets"));
    for (const files of [
      [{ path: "../outside", sha256: "a".repeat(64) }],
      [{ path: "assets/payload-manifest.json", sha256: "a".repeat(64) }],
      [{ path: "assets/AGENTS.md", sha256: "a".repeat(64), extra: true }],
      [{ path: "assets/AGENTS.md", sha256: "invalid" }],
      [
        { path: "assets/AGENTS.md", sha256: "a".repeat(64) },
        { path: "assets/AGENTS.md", sha256: "a".repeat(64) },
      ],
      null,
    ]) {
      await writeFile(
        path.join(temporary, "assets", "payload-manifest.json"),
        JSON.stringify({ schema_version: "1.0", files }),
      );
      const result = await inspectSetupPayload(temporary);
      assert.equal(result.valid, false);
      assert.equal(result.files, 0);
      assert.ok(result.failures.every((failure) => failure.path === "assets/payload-manifest.json"));
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("doctor exposes help and argument errors", async (t) => {
  const { setupRoot } = await fixture(t);
  const installedTool = path.join(setupRoot, "scripts", "doctor.mjs");
  const help = run(["--help"], { tool: installedTool });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /payload-manifest\.json/);
  assert.match(help.stdout, /writes nothing/);
  for (const args of [["--project-root"], ["--unknown"], ["extra"]]) {
    const result = run(args, { tool: installedTool });
    assert.equal(result.status, 2);
    assert.match(result.stdout, /Usage:/);
  }
});
