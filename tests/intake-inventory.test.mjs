import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { clone, readManifest, root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "intake-inventory.mjs");

function run(args) {
  return spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: "utf8" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fixture(t, files) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "intake-inventory-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const manifest = clone(await readManifest("en"));
  delete manifest.current_scope;
  delete manifest.pending_action;
  manifest.paths.reports = "manuscript/reports";
  await mkdir(path.join(projectRoot, ".author-toolkit"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return { projectRoot, manifestPath: path.join(projectRoot, ".author-toolkit", "project.json") };
}

test("intake inventory returns Unicode counts, raw-byte hashes, and exclusions without writing state", async (t) => {
  const bomText = `${String.fromCodePoint(0xfeff)}# 标题\n`;
  const emojiText = "A😀\r\n";
  const values = await fixture(t, {
    "manuscript/1.md": bomText,
    "manuscript/2.txt": emojiText,
    "manuscript/cover.png": "cover",
    "manuscript/nested/3.markdown": "third",
    "manuscript/reports/hidden.md": "operational",
  });
  const before = await readFile(values.manifestPath, "utf8");

  const result = run(["--project-root", values.projectRoot]);
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.valid, true);
  assert.equal(inventory.manuscript_root, "manuscript");
  assert.deepEqual(inventory.files, [
    { path: "manuscript/1.md", characters: 6, sha256: sha256(Buffer.from(bomText)) },
    { path: "manuscript/2.txt", characters: 4, sha256: sha256(Buffer.from(emojiText)) },
    { path: "manuscript/nested/3.markdown", characters: 5, sha256: sha256(Buffer.from("third")) },
  ]);
  assert.deepEqual(inventory.excluded_files, ["manuscript/cover.png", "manuscript/reports/hidden.md"]);
  assert.equal(await readFile(values.manifestPath, "utf8"), before);

  const byManifest = run(["--manifest", values.manifestPath]);
  assert.equal(byManifest.status, 0, byManifest.stderr);
  assert.deepEqual(JSON.parse(byManifest.stdout), inventory);
});

test("intake inventory rejects invalid UTF-8 instead of counting replacement characters", async (t) => {
  const values = await fixture(t, { "manuscript/bad.md": Buffer.from([0xff]) });
  const result = run(["--project-root", values.projectRoot]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manuscript is not valid UTF-8: manuscript\/bad\.md/);
});

test("intake inventory validates arguments and exposes help", async (t) => {
  const values = await fixture(t, { "manuscript/1.md": "one" });
  for (const args of [
    [],
    ["--project-root", values.projectRoot, "--manifest", values.manifestPath],
    ["--project-root"],
    ["--unknown"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stderr}`);
  }
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Unicode code-point count/);
  assert.match(help.stdout, /inventory order, not author-/);
  assert.match(help.stdout, /writes nothing/);
});
