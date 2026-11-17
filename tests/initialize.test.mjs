import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { exampleRoot, root } from "./helpers.mjs";

function run(args, installedTool = path.join(root, "scripts", "initialize.mjs")) {
  return spawnSync(process.execPath, [installedTool, ...args], { cwd: root, encoding: "utf8" });
}

async function fixture(t, { fresh = false } = {}) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "initialize-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  if (fresh) {
    const scaffolded = run([
      "--project-root",
      projectRoot,
      "--author-project-root",
      path.join(root, "skills", "author-project"),
    ], path.join(root, "scripts", "scaffold-project.mjs"));
    assert.equal(scaffolded.status, 0, scaffolded.stderr);
  } else {
    await cp(exampleRoot("en"), projectRoot, { recursive: true });
  }
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return { projectRoot, manifestPath, manifest };
}

test("initialize restores empty registered directories lost in a git checkout", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t, { fresh: true });
  const originalManifest = await readFile(manifestPath, "utf8");
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  const originalIndex = await readFile(indexPath, "utf8");
  const directories = [
    manifest.manuscript_root,
    manifest.paths.reports,
    manifest.paths.sessions,
    manifest.paths.handoffs,
    manifest.paths.creation,
  ];
  for (const directory of directories) {
    await rm(path.join(projectRoot, directory), { recursive: true });
  }

  const initialized = run(["--project-root", projectRoot, "--json"]);
  assert.equal(initialized.status, 0, initialized.stdout + initialized.stderr);
  const result = JSON.parse(initialized.stdout);
  assert.equal(result.valid, true);
  assert.equal(result.backup_index.status, "preserved");
  for (const directory of directories) {
    assert.equal((await stat(path.join(projectRoot, directory))).isDirectory(), true);
  }
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);
  assert.equal(await readFile(indexPath, "utf8"), originalIndex);

  const validated = run(["--project-root", projectRoot], path.join(root, "scripts", "validate.mjs"));
  assert.equal(validated.status, 0, validated.stdout + validated.stderr);
});

test("initialize preserves files at registered directory paths and reports them", async (t) => {
  const { projectRoot, manifest } = await fixture(t, { fresh: true });
  const reports = path.resolve(projectRoot, manifest.paths.reports);
  const sessions = path.resolve(projectRoot, manifest.paths.sessions);
  await rm(reports, { recursive: true });
  await writeFile(reports, "Preserve this conflict.\n", "utf8");
  await rm(sessions, { recursive: true });

  const initialized = run(["--project-root", projectRoot, "--json"]);
  assert.equal(initialized.status, 3, initialized.stdout + initialized.stderr);
  const result = JSON.parse(initialized.stdout);
  assert.equal(result.valid, false);
  const files = result.validation.checks.find((check) => check.path === "files");
  assert.ok(files.errors.some((error) =>
    error.instancePath === "/paths/reports" && /not a directory/.test(error.message)));
  assert.equal(await readFile(reports, "utf8"), "Preserve this conflict.\n");
  assert.equal((await stat(sessions)).isDirectory(), true);
});

test("initialize creates a missing backup index and is idempotent", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const originalManifest = await readFile(manifestPath, "utf8");
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  await rm(indexPath);

  const created = run(["--project-root", projectRoot]);
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Manifest schema: valid v3\.1/);
  assert.match(created.stdout, /Backup index: created/);
  assert.match(created.stdout, /Blocking project validation: 5 checks, 0 failures/);
  assert.match(created.stdout, /Manifest projection: validated/);
  assert.match(created.stdout, /Initialize: passed/);
  assert.doesNotMatch(created.stdout, /"paths"/);
  assert.deepEqual(JSON.parse(await readFile(indexPath, "utf8")), {
    schema_version: "1.0",
    backups: [],
    restorations: [],
    executions: [],
  });
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);

  const preserved = run(["--project-root", projectRoot, "--json"]);
  assert.equal(preserved.status, 0, preserved.stderr);
  const parsed = JSON.parse(preserved.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.schema_valid, true);
  assert.equal(parsed.backup_index.status, "preserved");
  assert.equal(parsed.projection.verification, "validated");
  assert.equal(parsed.projection.current_scope.scope_id, "scope-example-revision");
  assert.deepEqual(parsed.projection.paths, manifest.paths);
  assert.equal(parsed.diagnosis, undefined);
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);
});

test("initialize returns registered paths despite invalid execution evidence", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const trackerPath = path.join(projectRoot, manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(
    trackerPath,
    tracker.replace(
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|",
      `| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|\n| PLAN-001 | plan | revision-plan | ${manifest.current_scope.scope_id} | \`manuscript/chapter-01.md\` | approved | Exact test batch. | 2026-11-09T00:00:00Z |`,
    ),
  );
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  index.backups.push({
    backup_id: "backup-plan-001",
    approval_id: "PLAN-001",
    operation: "draft-baseline",
    scope_id: manifest.current_scope.scope_id,
    input_hashes: {},
    manifest_path: "backups/backup-plan-001/manifest.json",
  });
  await writeFile(indexPath, JSON.stringify(index));
  const originalManifest = await readFile(manifestPath, "utf8");
  const originalIndex = await readFile(indexPath, "utf8");

  const text = run(["--project-root", projectRoot]);
  assert.equal(text.status, 3, text.stderr);
  assert.match(text.stdout, /Manifest schema: valid v3\.1/);
  assert.match(text.stdout, /Blocking project validation: 5 checks, 1 failures/);
  assert.match(text.stdout, /- executions: \/backups\/0\/operation backup operation does not match its approval/);
  assert.match(text.stdout, /Initialize: failed/);

  const result = run(["--project-root", projectRoot, "--json"]);
  assert.equal(result.status, 3, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, false);
  assert.equal(parsed.schema_valid, true);
  assert.equal(parsed.backup_index.status, "preserved");
  assert.equal(parsed.projection.verification, "recorded_unverified");
  assert.deepEqual(parsed.projection.paths, manifest.paths);
  assert.equal(parsed.projection.current_scope.scope_id, manifest.current_scope.scope_id);
  assert.equal(parsed.projection.pending_action.operation, manifest.pending_action.operation);
  assert.deepEqual(parsed.diagnosis.backup_index.records[0].differences, [
    { field: "operation", backup: "draft-baseline", approval: "revision-plan" },
  ]);
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);
  assert.equal(await readFile(indexPath, "utf8"), originalIndex);
});

test("initialize rejects missing, invalid, and unsupported manifests without creating state", async (t) => {
  const { projectRoot, manifestPath } = await fixture(t);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  const reports = path.resolve(projectRoot, manifest.paths.reports);
  await rm(indexPath);
  await rm(reports, { recursive: true });
  manifest.schema_version = "3.0.0";
  await writeFile(manifestPath, JSON.stringify(manifest));
  const originalManifest = await readFile(manifestPath, "utf8");

  const unsupported = run(["--project-root", projectRoot, "--json"]);
  assert.equal(unsupported.status, 1, unsupported.stderr);
  const parsed = JSON.parse(unsupported.stdout);
  assert.equal(parsed.valid, false);
  assert.equal(parsed.schema_valid, false);
  assert.equal(parsed.backup_index, null);
  assert.equal(parsed.projection, null);
  assert.equal(parsed.validation.checks[0].unsupported, true);
  await assert.rejects(readFile(indexPath, "utf8"), { code: "ENOENT" });
  await assert.rejects(stat(reports), { code: "ENOENT" });
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);

  await rm(manifestPath);
  const missing = run(["--project-root", projectRoot]);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).schema_valid, false);
  await assert.rejects(readFile(indexPath, "utf8"), { code: "ENOENT" });
});

test("initialize respects the shared backup write lock and argument errors", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const indexPath = path.join(projectRoot, manifest.paths.backups, "index.json");
  await rm(indexPath);
  const lockPath = path.join(projectRoot, manifest.paths.backups, ".writes.lock");
  await writeFile(lockPath, "other process\n");
  const locked = run(["--project-root", projectRoot]);
  assert.equal(locked.status, 1);
  assert.match(locked.stderr, /another project write is active or left a lock/);
  assert.equal(await readFile(lockPath, "utf8"), "other process\n");
  await assert.rejects(readFile(indexPath, "utf8"), { code: "ENOENT" });

  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /existing v3\.1 manifest/);
  for (const args of [[], ["--project-root"], ["--unknown"], ["--project-root", projectRoot, "extra"]]) {
    const invalid = run(args);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stdout, /Usage:/);
  }
});
