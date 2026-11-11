import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validatePendingArtifactIndex, validateProjectSchema } from "../scripts/lib/index.mjs";
import { exampleRoot, root } from "./helpers.mjs";

const timestamp = "2026-11-11T00:00:00Z";

function run(script, args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8" });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "navigation-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  await cp(exampleRoot("en"), projectRoot, { recursive: true });
  return projectRoot;
}

test("read returns a bounded validated projection and leaves legacy artifacts unchanged", async (t) => {
  const projectRoot = await fixture(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const original = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(original);
  manifest.pending_action.reason = "Confirm this decision. ".repeat(100);
  manifest.pending_action.artifacts = Array.from({ length: 115 }, (_, index) => `reports/structure/2026-01-17_structure.md#${index}`);
  for (const artifact of manifest.pending_action.artifacts) {
    await writeFile(path.join(projectRoot, artifact), "Historical pointer\n");
  }
  await writeFile(manifestPath, JSON.stringify(manifest));
  const legacy = await readFile(manifestPath, "utf8");

  const result = run("read.mjs", ["--manifest", manifestPath]);
  assert.equal(result.status, 0, result.stderr);
  const projected = JSON.parse(result.stdout);
  assert.equal(projected.pending_action.artifacts.length, 2);
  assert.equal(projected.pending_action.artifact_count, 115);
  assert.equal(projected.pending_action.artifact_index, null);
  assert.ok(projected.pending_action.reason.length <= 240);
  assert.equal(projected.current_scope.files[0].sha256, manifest.current_scope.files[0].sha256);
  assert.equal(await readFile(manifestPath, "utf8"), legacy);
});

test("set-pending indexes long lists and validates index identity and existence", async (t) => {
  const projectRoot = await fixture(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const uniqueArtifacts = await Promise.all(Array.from({ length: 9 }, async (_, index) => {
    const artifact = `reports/structure/pending-${index}.md`;
    await writeFile(path.join(projectRoot, artifact), "Current evidence\n");
    return artifact;
  }));
  const artifacts = Array.from({ length: 115 }, (_, index) => uniqueArtifacts[index % uniqueArtifacts.length]);
  const result = run("set-pending.mjs", [
    "--project-root", projectRoot,
    "--operation", manifest.pending_action.operation,
    "--status", manifest.pending_action.status,
    "--scope-id", manifest.pending_action.scope_id,
    "--reason", "Await the current author decision.",
    "--updated-at", timestamp,
    ...artifacts.flatMap((artifact) => ["--artifact", artifact]),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const updated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(updated.pending_action.artifacts.length, 8);
  assert.equal(updated.pending_action.artifact_index, ".author-toolkit/pending-artifacts.json");
  assert.equal((await validatePendingArtifactIndex(updated, manifestPath)).valid, true);

  const index = JSON.parse(await readFile(path.join(projectRoot, updated.pending_action.artifact_index), "utf8"));
  assert.equal(index.artifacts.length, 9);
  index.operation = "diagnostics";
  await writeFile(path.join(projectRoot, updated.pending_action.artifact_index), JSON.stringify(index));
  const mismatched = await validatePendingArtifactIndex(updated, manifestPath);
  assert.equal(mismatched.valid, false);
  assert.ok(mismatched.errors.some((error) => error.instancePath === "/pending_action/artifact_index/operation"));

  const missing = run("set-pending.mjs", [
    "--project-root", projectRoot,
    "--operation", "diagnostics",
    "--status", "blocked",
    "--reason", "Missing input.",
    "--artifact", "reports/missing.md",
  ]);
  assert.equal(missing.status, 1, `${missing.stderr}${missing.stdout}`);
  assert.match(missing.stderr, /required project path does not exist/);
  assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).pending_action.updated_at, timestamp);

  await writeFile(path.join(projectRoot, ".author-toolkit", "pending-artifacts.json"), JSON.stringify({
    schema_version: "1.0.0",
    operation: "diagnostics",
    artifacts: ["reports/missing.md"],
    updated_at: "2026-11-11T01:00:00Z",
  }));
  const missingShort = run("set-pending.mjs", [
    "--project-root", projectRoot,
    "--operation", "diagnostics",
    "--status", "blocked",
    "--reason", "Missing input.",
    "--updated-at", "2026-11-11T01:00:00Z",
    "--artifact", "reports/missing.md",
  ]);
  assert.equal(missingShort.status, 1);
  assert.match(missingShort.stderr, /required project path does not exist/);
  assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).pending_action.updated_at, timestamp);
});

test("indexed pending actions cap inline artifacts without invalidating legacy lists", async () => {
  const manifest = {
    schema_version: "3.1.0",
    project_type: "fiction",
    language: "en",
    manuscript_root: "manuscript",
    paths: {
      story_bible: "story-bible.md",
      audit_tracker: "audit-tracker.md",
      reports: "reports",
      sessions: "sessions",
      backups: "backups",
      handoffs: "handoffs",
      creation: "creation",
    },
    pending_action: {
      operation: "diagnostics",
      status: "awaiting_author",
      reason: "Await author.",
      artifacts: Array.from({ length: 9 }, (_, index) => `reports/${index}.md`),
      artifact_index: ".author-toolkit/pending-artifacts.json",
      updated_at: timestamp,
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
  assert.equal(validateProjectSchema(manifest).valid, false);
  delete manifest.pending_action.artifact_index;
  assert.equal(validateProjectSchema(manifest).valid, true);
});

test("read and set-pending expose bounded help and argument errors", async (t) => {
  const projectRoot = await fixture(t);
  for (const script of ["read.mjs", "set-pending.mjs"]) {
    assert.equal(run(script, ["--help"]).status, 0);
    assert.equal(run(script, []).status, 2);
  }
  assert.equal(run("read.mjs", ["--project-root", projectRoot, "--manifest", path.join(projectRoot, ".author-toolkit/project.json")]).status, 2);
});
