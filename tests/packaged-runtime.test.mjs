import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

const setupAssets = path.join(root, "skills", "setup-author-toolkit", "assets");

test("installed runtime entry points run outside the development repository", async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-runtime-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const assets = path.join(temporary, "assets");
  await cp(setupAssets, assets, { recursive: true });

  for (const entryPoint of ["validate.mjs", "author-project.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(assets, "runtime", entryPoint)], {
      cwd: temporary,
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
    });
    assert.equal(result.status, 0, `${entryPoint}: ${result.stderr}`);
    assert.match(result.stdout, /Usage:/);
    assert.ok(result.stdout.includes(path.join(assets, "runtime", entryPoint)));
    assert.doesNotMatch(result.stdout, /checks, [0-9]+ failures/);
  }
});

test("no-argument help does not read schemas or project state", async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-help-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const runtime = path.join(temporary, "runtime");
  await cp(path.join(setupAssets, "runtime"), runtime, { recursive: true });

  for (const entryPoint of ["validate.mjs", "author-project.mjs"]) {
    const result = spawnSync(process.execPath, [path.join(runtime, entryPoint)], {
      cwd: temporary,
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
    });
    assert.equal(result.status, 0, `${entryPoint}: ${result.stderr}`);
    assert.match(result.stdout, /Usage:/);
  }
});

test("generated runtime consistency checks detect stale and incomplete artifacts", async (t) => {
  const build = path.join(root, "scripts", "build-runtime.mjs");
  const current = spawnSync(process.execPath, [build, "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(current.status, 0, current.stderr);

  const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-runtime-check-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const generated = path.join(temporary, "runtime");
  await cp(path.join(setupAssets, "runtime"), generated, { recursive: true });
  await appendFile(path.join(generated, "validate.mjs"), "\n// stale artifact\n", "utf8");

  const stale = spawnSync(process.execPath, [build, "--check", generated], {
    cwd: temporary,
    encoding: "utf8",
  });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale|differs/i);

  await rm(path.join(generated, "author-project.mjs"));
  const incomplete = spawnSync(process.execPath, [build, "--check", generated], {
    cwd: temporary,
    encoding: "utf8",
  });
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stderr, /missing/i);
});
