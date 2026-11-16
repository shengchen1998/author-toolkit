import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import { createEvidenceFixture } from "./evidence-fixture.mjs";
import { exampleRoot, root } from "./helpers.mjs";

const createdAt = "2026-11-17T01:00:00Z";
const confirmedAt = "2026-11-17T02:00:00Z";

function run(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "record-scope.mjs"), ...args], { encoding: "utf8" });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "record-scope-cli-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const created = await createEvidenceFixture(
    exampleRoot("en"),
    path.join(root, "skills/setup-author-toolkit/assets"),
    path.join(temporary, "project"),
  );
  return { ...created, manifestPath: path.join(created.projectRoot, ".author-toolkit/project.json") };
}

function proposalArgs(manifestPath, manifest, overrides = {}) {
  const values = {
    scopeId: "scope-recorded",
    description: "Author-selected manuscript scope.",
    files: manifest.current_scope.files.map((file) => file.path),
    excludedFiles: [],
    createdAt,
    ...overrides,
  };
  return [
    "--manifest", manifestPath,
    "--scope-id", values.scopeId,
    "--description", values.description,
    "--status", "proposed",
    "--created-at", values.createdAt,
    ...values.files.flatMap((file) => ["--file", file]),
    ...values.excludedFiles.flatMap((file) => ["--exclude", file]),
  ];
}

async function sha256(projectRoot, relativePath) {
  return createHash("sha256").update(await readFile(path.join(projectRoot, relativePath))).digest("hex");
}

test("record-scope records ordered current hashes and confirms the exact proposed scope", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const files = manifest.current_scope.files.map((file) => file.path).reverse();
  await writeFile(path.join(projectRoot, "manuscript/cover.png"), "cover");
  const result = run(proposalArgs(manifestPath, manifest, {
    files,
    excludedFiles: ["manuscript/cover.png"],
  }));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true);
  assert.equal(output.current_scope.scope_id, "scope-recorded");
  assert.equal(output.current_scope.status, "proposed");
  assert.equal(output.current_scope.created_at, createdAt);
  assert.deepEqual(output.current_scope.files.map((file) => file.path), files);
  for (const file of output.current_scope.files) {
    assert.equal(file.sha256, await sha256(projectRoot, file.path));
  }
  assert.deepEqual(output.current_scope.excluded_files, ["manuscript/cover.png"]);

  const proposed = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(proposed.current_scope, output.current_scope);
  assert.equal(proposed.updated_at, createdAt);
  assert.equal(proposed.created_at, manifest.created_at);
  assert.deepEqual(proposed.pending_action, manifest.pending_action);

  const confirmation = run(["--manifest", manifestPath, "--confirm", "--scope-id", "scope-recorded", "--updated-at", confirmedAt]);
  assert.equal(confirmation.status, 0, confirmation.stderr);
  const confirmed = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(confirmed.current_scope, { ...proposed.current_scope, status: "confirmed" });
  assert.equal(confirmed.current_scope.created_at, createdAt);
  assert.equal(confirmed.updated_at, confirmedAt);
  assert.deepEqual(JSON.parse(confirmation.stdout).current_scope, confirmed.current_scope);
});

test("record-scope confirmation rejects changed inputs instead of refreshing approved hashes", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  assert.equal(run(proposalArgs(manifestPath, manifest)).status, 0);
  await writeFile(path.join(projectRoot, manifest.current_scope.files[0].path), "Changed after the author saw the scope.\n");
  const before = await readFile(manifestPath, "utf8");

  const result = run(["--manifest", manifestPath, "--confirm", "--scope-id", "scope-recorded", "--updated-at", confirmedAt]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /changed since the scope was recorded/);
  assert.equal(await readFile(manifestPath, "utf8"), before);
  assert.equal(JSON.parse(before).current_scope.status, "proposed");
});

test("record-scope permits text-only updates with the same ID", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const changedPath = manifest.current_scope.files[0].path;
  await writeFile(path.join(projectRoot, changedPath), "Text-only scope refresh.\n");
  const result = run(proposalArgs(manifestPath, manifest, {
    scopeId: manifest.current_scope.scope_id,
    createdAt,
  }));
  assert.equal(result.status, 0, result.stderr);
  const proposed = JSON.parse(result.stdout).current_scope;
  assert.equal(proposed.scope_id, manifest.current_scope.scope_id);
  assert.equal(proposed.files[0].sha256, await sha256(projectRoot, changedPath));
  assert.notEqual(proposed.files[0].sha256, manifest.current_scope.files[0].sha256);
  assert.equal(run(["--manifest", manifestPath, "--confirm", "--scope-id", proposed.scope_id]).status, 0);
});

test("record-scope requires a new ID for membership, order, or exclusion changes", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const original = await readFile(manifestPath, "utf8");
  const paths = manifest.current_scope.files.map((file) => file.path);
  for (const files of [paths.slice(1), [...paths].reverse()]) {
    const result = run(proposalArgs(manifestPath, manifest, { scopeId: manifest.current_scope.scope_id, files }));
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /new scope ID/);
    assert.equal(await readFile(manifestPath, "utf8"), original);
  }
  const excluded = run(proposalArgs(manifestPath, manifest, {
    scopeId: manifest.current_scope.scope_id,
    excludedFiles: ["manuscript/cover.png"],
  }));
  assert.equal(excluded.status, 1);
  assert.match(excluded.stderr, /new scope ID|not a non-manuscript inventory exclusion/);
  assert.equal(await readFile(manifestPath, "utf8"), original);
});

test("record-scope rejects invalid paths, duplicates, incomplete inventory, and manuscript exclusions without writes", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const original = await readFile(manifestPath, "utf8");
  const paths = manifest.current_scope.files.map((file) => file.path);
  for (const overrides of [
    { files: ["../outside.md", ...paths.slice(1)] },
    { files: [path.join(projectRoot, paths[0]), ...paths.slice(1)] },
    { files: [paths[0], paths[0], ...paths.slice(1)] },
    { files: ["manuscript/missing.md", ...paths.slice(1)] },
    { files: paths.slice(1) },
    { excludedFiles: [paths[0]] },
    { excludedFiles: ["manuscript/missing.png"] },
    { excludedFiles: ["manuscript/cover.png", "manuscript/cover.png"] },
  ]) {
    const result = run(proposalArgs(manifestPath, manifest, overrides));
    assert.equal(result.status, 1, `${JSON.stringify(overrides)}: ${result.stderr}`);
    assert.equal(await readFile(manifestPath, "utf8"), original);
  }
});

test("record-scope honors the shared lock and detects a concurrent manifest change", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const original = await readFile(manifestPath, "utf8");
  const lock = path.join(projectRoot, manifest.paths.backups, ".writes.lock");
  await writeFile(lock, "test\n");
  const locked = run(proposalArgs(manifestPath, manifest));
  assert.equal(locked.status, 1);
  assert.match(locked.stderr, /another project write is active/);
  assert.equal(await readFile(manifestPath, "utf8"), original);
  await rm(lock);

  const latest = structuredClone(manifest);
  latest.pending_action.reason = "A concurrent operation changed the manifest.";
  await writeFile(manifestPath, `${JSON.stringify(latest, null, 2)}\n`);
  const latestText = await readFile(manifestPath, "utf8");
  await assert.rejects(recordScope({
    manifestPath,
    manifest,
    scopeId: "scope-recorded",
    description: "Stale proposal.",
    files: manifest.current_scope.files.map((file) => file.path),
    excludedFiles: [],
    createdAt,
  }), /manifest changed before scope recording/);
  assert.equal(await readFile(manifestPath, "utf8"), latestText);
});

test("record-scope validates the complete candidate project before writing", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  await writeFile(path.join(projectRoot, manifest.paths.audit_tracker), "Invalid tracker\n");
  const original = await readFile(manifestPath, "utf8");
  const result = run(proposalArgs(manifestPath, manifest));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tracker/);
  assert.equal(await readFile(manifestPath, "utf8"), original);
});

test("record-scope reports argument errors with exit 2", async (t) => {
  const { manifestPath, manifest } = await fixture(t);
  assert.equal(run(["--help"]).status, 0);
  for (const args of [
    [],
    ["--manifest", manifestPath],
    proposalArgs(manifestPath, manifest).filter((argument) => argument !== "--file" && !manifest.current_scope.files.some((file) => file.path === argument)),
    [...proposalArgs(manifestPath, manifest, { createdAt: "bad" })],
    proposalArgs(manifestPath, manifest).map((argument) => argument === "proposed" ? "confirmed" : argument),
    ["--manifest", manifestPath, "--confirm"],
    ["--manifest", manifestPath, "--confirm", "--scope-id", "scope-recorded", "--file", manifest.current_scope.files[0].path],
    ["--manifest", manifestPath, "--confirm", "--scope-id", "scope-recorded", "--updated-at", "bad"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stderr}`);
  }
});
