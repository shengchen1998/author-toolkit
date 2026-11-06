import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  validateManifest,
  validateProjectFiles,
  validateScopeCurrency,
  validateTracker,
} from "../scripts/lib/index.mjs";
import { clone, exampleRoot, readManifest, root } from "./helpers.mjs";

const migrationCli = path.join(root, "scripts", "migrate-v3.mjs");
const validatorCli = path.join(root, "scripts", "validate.mjs");

async function copyExample(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "migration-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  await cp(exampleRoot("en"), projectRoot, { recursive: true });
  return projectRoot;
}

function runMigration(projectRoot) {
  return spawnSync(process.execPath, [migrationCli, "--project-root", projectRoot], {
    cwd: root,
    encoding: "utf8",
  });
}

async function protectedDigest(projectRoot) {
  const hash = createHash("sha256");
  async function visit(relative) {
    const entries = await readdir(path.join(projectRoot, relative), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else hash.update(child).update(await readFile(path.join(projectRoot, child)));
    }
  }
  for (const directory of ["manuscript", "reports", "backups"]) await visit(directory);
  return hash.digest("hex");
}

test("migration inventories manuscripts and converts pending work and overrides", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const legacy = clone(await readManifest());
  legacy.workflow.stages[2].override_reason = "The structural gate was consciously deferred.";
  legacy.workflow.stages[6].override_reason = "The author retained the earlier prose audit.";
  const legacyText = `${JSON.stringify(legacy, null, 2)}\n`;
  await writeFile(manifestPath, legacyText, "utf8");
  await mkdir(path.join(projectRoot, "manuscript", "notes"), { recursive: true });
  await writeFile(path.join(projectRoot, "manuscript", "notes", "extra.txt"), "Extra chapter", "utf8");
  await writeFile(path.join(projectRoot, "manuscript", "notes", "cover.png"), "not an image", "utf8");
  const beforeDigest = await protectedDigest(projectRoot);

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.valid, true);
  assert.equal(summary.scope_id, "scope-v3-migration");
  assert.equal(summary.approval_count, 2);
  assert.equal(summary.manifest, manifestPath);

  const snapshot = await readFile(summary.snapshot, "utf8");
  assert.equal(snapshot, legacyText);
  assert.deepEqual(JSON.parse(snapshot).workflow, legacy.workflow);

  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(migrated.schema_version, "3.2.0");
  assert.equal("workflow" in migrated, false);
  assert.match(migrated.$schema, /project-schema-v3\.2\.json$/);
  assert.equal(migrated.created_at, legacy.created_at);
  assert.deepEqual(migrated.paths, {
    ...legacy.paths,
    creation: ".author-toolkit/creation/",
    convergence: ".author-toolkit/convergence/",
  });
  assert.match(migrated.current_scope.scope_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(migrated.current_scope.status, "proposed");
  assert.match(migrated.current_scope.description, /author confirmation/i);
  assert.equal(migrated.current_scope.files.length, 4);
  assert.deepEqual(migrated.current_scope.excluded_files, ["manuscript/notes/cover.png"]);
  const extra = migrated.current_scope.files.find((file) => file.path === "manuscript/notes/extra.txt");
  assert.equal(extra.sha256, createHash("sha256").update("Extra chapter").digest("hex"));

  assert.deepEqual(migrated.pending_action, {
    operation: "structure",
    status: "awaiting_author",
    scope_id: "scope-v3-migration",
    reason: migrated.pending_action.reason,
    artifacts: legacy.workflow.stages[2].artifacts,
    updated_at: migrated.updated_at,
  });
  assert.match(migrated.pending_action.reason, /in_progress/);
  assert.match(migrated.pending_action.reason, /author confirmation/i);
  assert.match(migrated.pending_action.reason, /author requested rework/i);

  const migrationRecord = JSON.parse(
    await readFile(path.join(path.dirname(summary.snapshot), "migration.json"), "utf8"),
  );
  assert.equal(migrationRecord.source_schema_version, "2.0.0");
  assert.equal(migrationRecord.target_schema_version, "3.2.0");
  assert.deepEqual(migrationRecord.pending_action, migrated.pending_action);
  assert.equal(migrationRecord.overrides.length, 2);
  assert.deepEqual(
    migrationRecord.overrides.map((approval) => approval.type),
    ["gate-override", "prose-override"],
  );

  const tracker = await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8");
  assert.equal((tracker.match(/## Approvals/g) ?? []).length, 1);
  assert.match(tracker, /LEGACY-001/);
  assert.match(tracker, /LEGACY-002/);
  assert.match(tracker, /The structural gate was consciously deferred\./);
  assert.match(tracker, /first resume after migration/);

  assert.equal(validateManifest(migrated).valid, true);
  assert.equal((await validateProjectFiles(migrated, manifestPath)).valid, true);
  assert.equal((await validateTracker(migrated, manifestPath)).valid, true);
  assert.equal(await protectedDigest(projectRoot), beforeDigest);

  const cli = spawnSync(process.execPath, [validatorCli, "--manifest", manifestPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stdout, /4 checks, 1 failure/);
  assert.match(cli.stdout, /#files/);
  assert.match(cli.stderr, /#scope/);
  assert.match(cli.stdout, /#tracker/);
  assert.match(cli.stdout, /full_manuscript=false/);
  assert.match(cli.stderr, /full-manuscript validation requires a confirmed scope/);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-01.md"), "Changed outside migration", "utf8");
  const staleScope = await validateScopeCurrency(migrated, manifestPath);
  assert.equal(staleScope.valid, false);
  assert.ok(staleScope.errors.some((error) =>
    error.message.includes("manuscript content changed since the scope was recorded")
  ));
  const stale = spawnSync(process.execPath, [validatorCli, "--manifest", manifestPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(stale.status, 1);
});

test("migration is idempotent and leaves an existing v3 manifest and tracker untouched", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const first = runMigration(projectRoot);
  assert.equal(first.status, 0, first.stderr);
  const manifest = await readFile(manifestPath, "utf8");
  const tracker = await readFile(trackerPath, "utf8");
  const migrations = await readdir(path.join(projectRoot, ".author-toolkit", "migrations"));

  const second = runMigration(projectRoot);
  assert.equal(second.status, 0, second.stderr);
  const summary = JSON.parse(second.stdout);
  assert.equal(summary.valid, true);
  assert.equal(summary.snapshot, null);
  assert.equal(summary.scope_id, "scope-v3-migration");
  assert.equal(summary.approval_count, 0);
  assert.equal(await readFile(manifestPath, "utf8"), manifest);
  assert.equal(await readFile(trackerPath, "utf8"), tracker);
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "migrations")),
    migrations,
  );
});

test("a complete v2 workflow migrates without pending_action", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const legacy = clone(await readManifest());
  legacy.workflow.current_stage = "complete";
  for (const stage of legacy.workflow.stages) stage.status = "complete";
  await writeFile(manifestPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal("pending_action" in migrated, false);
  assert.equal(validateManifest(migrated).valid, true);
});

test("migration with no manuscript files fails without modifying project state", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const originalManifest = await readFile(manifestPath, "utf8");
  const originalTracker = await readFile(trackerPath, "utf8");
  for (const entry of await readdir(path.join(projectRoot, "manuscript"))) {
    if (/\.(?:md|markdown|txt)$/i.test(entry)) {
      await rm(path.join(projectRoot, "manuscript", entry));
    }
  }
  await writeFile(path.join(projectRoot, "manuscript", "cover.png"), "not an image", "utf8");
  const beforeDigest = await protectedDigest(projectRoot);

  const result = runMigration(projectRoot);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No \.md, \.markdown, or \.txt manuscript files found/);
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);
  assert.equal(await readFile(trackerPath, "utf8"), originalTracker);
  assert.equal(await protectedDigest(projectRoot), beforeDigest);
  const toolkitEntries = await readdir(path.join(projectRoot, ".author-toolkit"));
  assert.equal(toolkitEntries.includes("migrations"), false);
});

test("migration appends to an existing Approvals table without duplicate IDs", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const legacy = clone(await readManifest());
  legacy.workflow.stages[2].override_reason = "Retain the structural decision.";
  legacy.workflow.stages[6].override_reason = "Retain the prose decision.";
  await writeFile(manifestPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  const existingApprovals = [
    "## Approvals",
    "",
    "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |",
    "|---|---|---|---|---|---|---|---|",
    "| LEGACY-001 | gate-override | structure | legacy-scope | `manuscript/chapter-01.md` | deferred | Existing migration record. | 2026-01-01T00:00:00Z |",
    "",
    "",
  ].join("\n");
  const tracker = await readFile(trackerPath, "utf8");
  await writeFile(
    trackerPath,
    tracker.replace("## Open questions", `${existingApprovals}## Open questions`),
    "utf8",
  );

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.approval_count, 3);
  const migratedTracker = await readFile(trackerPath, "utf8");
  for (const id of ["LEGACY-001", "LEGACY-002", "LEGACY-003"]) {
    assert.equal((migratedTracker.match(new RegExp(id, "g")) ?? []).length, 1);
  }
  assert.match(migratedTracker, /Existing migration record\./);
  assert.match(migratedTracker, /Retain the structural decision\./);
  assert.match(migratedTracker, /Retain the prose decision\./);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal((await validateTracker(migrated, manifestPath)).valid, true);
});

test("migration accepts a single-file manuscript_root", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const legacy = clone(await readManifest());
  legacy.manuscript_root = "manuscript/chapter-01.md";
  await writeFile(manifestPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(
    migrated.current_scope.files.map((file) => file.path),
    ["manuscript/chapter-01.md"],
  );
  assert.equal(validateManifest(migrated).valid, true);
  assert.equal((await validateProjectFiles(migrated, manifestPath)).valid, true);
  assert.equal((await validateScopeCurrency(migrated, manifestPath)).valid, true);
  assert.equal((await validateTracker(migrated, manifestPath)).valid, true);
  const second = runMigration(projectRoot);
  assert.equal(second.status, 0, second.stderr);
});

test("migration excludes operational Markdown when manuscript_root is the project root", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const legacy = clone(await readManifest());
  legacy.manuscript_root = ".";
  await writeFile(manifestPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(
    migrated.current_scope.files.map((file) => file.path),
    ["manuscript/chapter-01.md", "manuscript/chapter-02.md", "manuscript/chapter-03.md"],
  );
  assert.ok(migrated.current_scope.excluded_files.includes("audit-tracker.md"));
  assert.ok(migrated.current_scope.excluded_files.includes("story-bible.md"));
  assert.ok(
    migrated.current_scope.excluded_files.includes(
      "reports/structure/2026-01-17_structure.md",
    ),
  );
  assert.equal((await validateScopeCurrency(migrated, manifestPath)).valid, true);

  await writeFile(path.join(projectRoot, "reports", "after.md"), "Operational report", "utf8");
  assert.equal((await validateScopeCurrency(migrated, manifestPath)).valid, true);
  const second = runMigration(projectRoot);
  assert.equal(second.status, 0, second.stderr);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-04.md"), "New chapter", "utf8");
  const added = await validateScopeCurrency(migrated, manifestPath);
  assert.equal(added.valid, false);
  assert.ok(added.errors.some((error) => error.message.includes("manuscript/chapter-04.md")));
});
