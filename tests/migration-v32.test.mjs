import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { migrateProjectToV3, recordScope } from "../scripts/lib/index.mjs";
import {
  createNoEditEvidence,
  currentScopeReference,
} from "./convergence-helpers.mjs";
import { exampleRoot, root } from "./helpers.mjs";

const migrationCli = path.join(root, "scripts", "migrate-v32.mjs");
const legacyMigrationCli = path.join(root, "scripts", "migrate-v3.mjs");
const authorProjectCli = path.join(root, "scripts", "author-project.mjs");

function runMigration(projectRoot, cli = migrationCli) {
  return spawnSync(process.execPath, [cli, "--project-root", projectRoot], {
    cwd: root,
    encoding: "utf8",
  });
}

async function copyExample(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "migration-v32-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, "project");
  await cp(exampleRoot("en"), projectRoot, { recursive: true });
  return projectRoot;
}

async function digestPaths(projectRoot, relatives) {
  const hash = createHash("sha256");
  async function visit(relative) {
    const entries = await readdir(path.join(projectRoot, relative), { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visit(child);
      else hash.update(child).update(await readFile(path.join(projectRoot, child)));
    }
  }
  for (const relative of relatives) await visit(relative);
  return hash.digest("hex");
}

const convergenceDirectories = [
  "cycles",
  "scopes",
  "inventories",
  "reconciliations",
  "passes",
  "executions",
  "no-edit-skips",
  "review-groups",
  "attestations",
  "evaluations",
];

test("v2 migrates directly to v3.2 with preserved evidence and no inferred convergence", async (t) => {
  const projectRoot = await copyExample(t);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const legacyText = await readFile(manifestPath, "utf8");
  const legacy = JSON.parse(legacyText);
  await mkdir(path.join(projectRoot, ".author-toolkit", "creation", "staging", "batch-legacy"), {
    recursive: true,
  });
  await mkdir(path.join(projectRoot, ".author-toolkit", "creation", "batches"), {
    recursive: true,
  });
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "creation", "staging", "batch-legacy", "chapter-004.md"),
    "Legacy staged text\n",
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "creation", "batches", "batch-legacy.json"),
    "{\"historical\":true}\n",
    "utf8",
  );
  await writeJson(
    path.join(projectRoot, ".author-toolkit", "creation", "batches", "commit-committed.json"),
    { commit_id: "commit-committed", status: "committed", historical: true },
  );
  await writeJson(path.join(projectRoot, "reports", "coverage-unit.json"), {
    historical_coverage_unit: true,
  });
  const preserved = [
    "manuscript",
    "reports",
    "backups",
    "sessions",
    ".author-toolkit/creation",
  ];
  const beforeDigest = await digestPaths(projectRoot, preserved);

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(migrated.schema_version, "3.2.0");
  assert.match(migrated.$schema, /project-schema-v3\.2\.json$/);
  assert.equal(migrated.created_at, legacy.created_at);
  assert.deepEqual(migrated.paths, {
    ...legacy.paths,
    creation: ".author-toolkit/creation/",
    convergence: ".author-toolkit/convergence/",
  });
  assert.equal(migrated.current_scope.status, "proposed");
  assert.match(migrated.current_scope.scope_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal("snapshot_path" in migrated.current_scope, false);
  assert.equal("snapshot_sha256" in migrated.current_scope, false);
  assert.equal("workflow" in migrated, false);
  assert.equal(summary.target_schema_version, "3.2.0");
  assert.equal(summary.source_schema_version, "2.0.0");
  assert.equal(summary.scope_id, "scope-v3-migration");
  assert.match(summary.snapshot, /-v2-v3_2[\\/]project\.json$/);
  assert.equal(await readFile(summary.snapshot, "utf8"), legacyText);
  assert.equal(await digestPaths(projectRoot, preserved), beforeDigest);

  const migrationRecord = JSON.parse(
    await readFile(path.join(path.dirname(summary.snapshot), "migration.json"), "utf8"),
  );
  assert.equal(migrationRecord.source_schema_version, "2.0.0");
  assert.equal(migrationRecord.target_schema_version, "3.2.0");
  assert.deepEqual(migrationRecord.legacy_current_scope, null);
  assert.deepEqual(migrationRecord.pending_action, migrated.pending_action);

  for (const directory of convergenceDirectories) {
    assert.equal(
      (await stat(path.join(projectRoot, ".author-toolkit", "convergence", directory))).isDirectory(),
      true,
      directory,
    );
  }
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "convergence", "scopes")),
    [],
  );
  const inventories = await readdir(
    path.join(projectRoot, ".author-toolkit", "convergence", "inventories"),
  );
  assert.equal(inventories.length, 1);
  const inventory = JSON.parse(
    await readFile(
      path.join(projectRoot, ".author-toolkit", "convergence", "inventories", inventories[0]),
      "utf8",
    ),
  );
  assert.equal(inventory.inventory_fingerprint, inventories[0].replace(/\.json$/, ""));
  assert.equal(inventory.files.length, 3);
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "convergence", "evaluations")),
    [],
  );
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"), "utf8"),
    { code: "ENOENT" },
  );
});


async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

const legacyTimestamp = "2026-01-01T00:00:00.000Z";

async function createLegacyV3Project(t, version = "3.1.0") {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, `migration-v${version.replaceAll(".", "")}-`));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  for (const directory of [
    ".author-toolkit/backups",
    ".author-toolkit/handoffs",
    ".author-toolkit/creation/state/chapters",
    ".author-toolkit/creation/state/volumes",
    ".author-toolkit/creation/batches",
    ".author-toolkit/creation/staging/batch-legacy",
    "manuscript",
    "reports",
    "sessions",
  ]) {
    await mkdir(path.join(projectRoot, directory), { recursive: true });
  }
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), "Chapter one\n", "utf8");
  await writeFile(path.join(projectRoot, "story-bible.md"), "Story\n", "utf8");
  await writeFile(path.join(projectRoot, "reports", "legacy-report.md"), "Legacy report\n", "utf8");
  await writeFile(path.join(projectRoot, "sessions", "legacy-session.md"), "Legacy session\n", "utf8");
  await writeFile(path.join(projectRoot, ".author-toolkit", "backups", "chapter-001.md"), "Before\n", "utf8");
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "creation", "staging", "batch-legacy", "chapter-002.md"),
    "Legacy staged text\n",
    "utf8",
  );
  await writeJson(
    path.join(projectRoot, ".author-toolkit", "creation", "batches", "batch-legacy.json"),
    { historical: true },
  );
  await writeJson(
    path.join(projectRoot, ".author-toolkit", "creation", "batches", "commit-committed.json"),
    {
      schema_version: "1.0.0",
      batch_id: "batch-committed",
      commit_id: "commit-committed",
      status: "committed",
      scope_before_id: "scope-legacy",
      scope_after_id: "scope-legacy",
      files: [{
        path: "manuscript/chapter-001.md",
        action: "modify",
        input_sha256: createHash("sha256").update("Before\n").digest("hex"),
        output_sha256: createHash("sha256").update("Chapter one\n").digest("hex"),
        backup_id: "BACKUP-001",
        status: "verified",
      }],
      created_at: legacyTimestamp,
      updated_at: legacyTimestamp,
    },
  );
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "creation", "state", "current.md"),
    "Legacy story state\n",
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "handoffs", "legacy.md"),
    "Legacy handoff\n",
    "utf8",
  );
  await writeJson(path.join(projectRoot, "reports", "coverage-unit.json"), {
    historical_coverage_unit: true,
  });
  await writeJson(path.join(projectRoot, "reports", "coverage-index.json"), {
    historical_coverage_index: true,
  });
  const tracker = await readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
  await writeFile(path.join(projectRoot, "audit-tracker.md"), tracker, "utf8");
  const manifest = {
    $schema: "../references/project-schema-v3.1.json",
    schema_version: version,
    project_type: "fiction",
    language: "en",
    manuscript_root: "manuscript",
    paths: {
      story_bible: "story-bible.md",
      audit_tracker: "audit-tracker.md",
      reports: "reports",
      sessions: "sessions",
      backups: ".author-toolkit/backups",
      handoffs: ".author-toolkit/handoffs",
      creation: ".author-toolkit/creation",
    },
    current_scope: {
      scope_id: "scope-legacy",
      description: "The legacy manifest records this scope as confirmed.",
      status: "confirmed",
      files: [{
        path: "manuscript/chapter-001.md",
        sha256: createHash("sha256").update("Chapter one\n").digest("hex"),
      }],
      excluded_files: [],
      created_at: legacyTimestamp,
    },
    pending_action: {
      operation: "chapter-review",
      status: "awaiting_author",
      scope_id: "scope-legacy",
      reason: "Review the legacy staged batch.",
      artifacts: [".author-toolkit/creation/batches/batch-legacy.json"],
      updated_at: legacyTimestamp,
    },
    created_at: legacyTimestamp,
    updated_at: legacyTimestamp,
  };
  if (version === "3.0.0") {
    delete manifest.paths.creation;
    manifest.$schema = "../references/project-schema-v3.0.json";
    manifest.pending_action.operation = "structure";
    manifest.pending_action.reason = "Review the legacy structural work.";
    manifest.pending_action.artifacts = ["reports/legacy-report.md"];
  }
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  await writeJson(manifestPath, manifest);
  return { projectRoot, manifestPath, manifest, tracker };
}

test("v3.1 preserves pending work but requires reconfirmation without exact scope evidence", async (t) => {
  const { projectRoot, manifestPath, manifest, tracker } = await createLegacyV3Project(t);
  const preserved = [
    "manuscript",
    "reports",
    "sessions",
    ".author-toolkit/backups",
    ".author-toolkit/handoffs",
    ".author-toolkit/creation",
  ];
  const beforeDigest = await digestPaths(projectRoot, preserved);

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(migrated.schema_version, "3.2.0");
  assert.equal(migrated.paths.creation, ".author-toolkit/creation");
  assert.equal(migrated.paths.convergence, ".author-toolkit/convergence/");
  assert.equal(migrated.current_scope.status, "proposed");
  assert.equal(migrated.current_scope.description, manifest.current_scope.description);
  assert.match(migrated.current_scope.scope_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal("snapshot_path" in migrated.current_scope, false);
  assert.deepEqual(migrated.pending_action, manifest.pending_action);
  assert.equal(await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8"), tracker);
  assert.equal(await digestPaths(projectRoot, preserved), beforeDigest);
  assert.match(summary.snapshot, /-v3_1-v3_2[\\/]project\.json$/);
  assert.deepEqual(JSON.parse(await readFile(summary.snapshot, "utf8")), manifest);
  assert.equal(summary.source_schema_version, "3.1.0");
  assert.equal(summary.target_schema_version, "3.2.0");
  assert.equal(summary.created_snapshots.scopes.length, 0);
  assert.equal(summary.created_snapshots.inventories.length, 1);
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "convergence", "evaluations")),
    [],
  );
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"), "utf8"),
    { code: "ENOENT" },
  );
  const record = JSON.parse(
    await readFile(path.join(path.dirname(summary.snapshot), "migration.json"), "utf8"),
  );
  assert.deepEqual(record.legacy_current_scope, manifest.current_scope);
  assert.equal(record.scope_disposition, "reconfirmation-required");
  assert.equal(record.scope_confirmation, null);
});


test("v3.0 migrates directly to v3.2 without an intermediate v3.1 migration", async (t) => {
  const { projectRoot, manifestPath, manifest, tracker } = await createLegacyV3Project(t, "3.0.0");
  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(migrated.schema_version, "3.2.0");
  assert.equal(migrated.paths.creation, ".author-toolkit/creation/");
  assert.equal(migrated.paths.convergence, ".author-toolkit/convergence/");
  assert.equal(migrated.current_scope.status, "proposed");
  assert.deepEqual(migrated.pending_action, manifest.pending_action);
  assert.equal(await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8"), tracker);
  assert.equal(summary.source_schema_version, "3.0.0");
  assert.equal(summary.target_schema_version, "3.2.0");
  assert.match(summary.snapshot, /-v3_0-v3_2[\\/]project\.json$/);
  assert.deepEqual(JSON.parse(await readFile(summary.snapshot, "utf8")), manifest);
  assert.equal(summary.created_snapshots.scopes.length, 0);
  assert.equal(summary.created_snapshots.inventories.length, 1);
  const migrations = await readdir(path.join(projectRoot, ".author-toolkit", "migrations"));
  assert.equal(migrations.length, 1);
  assert.match(migrations[0], /-v3_0-v3_2$/);
  assert.equal(migrations[0].includes("v3_1"), false);
});


test("an exact legacy scope confirmation produces a confirmed v3.2 snapshot without new approval", async (t) => {
  const { projectRoot, manifestPath, manifest } = await createLegacyV3Project(t);
  const scopeFingerprint = "35bed77f7df6975492082ac37a7f6b16bba3dfb0bed939e0a27383ede0facaf4";
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|---|---|\n";
  const insertion = tracker.indexOf(separator, tracker.indexOf("## Approvals")) + separator.length;
  const approval = `| SCOPE-001 | scope-confirmation | intake | scope-legacy | \`manuscript/chapter-001.md\` | approved | scope_fingerprint=${scopeFingerprint} reading_order_confirmed=true Exact legacy scope confirmation. | ${legacyTimestamp} |\n`;
  const trackerWithApproval = tracker.slice(0, insertion) + approval + tracker.slice(insertion);
  await writeFile(trackerPath, trackerWithApproval, "utf8");

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(migrated.schema_version, "3.2.0");
  assert.equal(migrated.current_scope.status, "confirmed");
  assert.equal(migrated.current_scope.scope_fingerprint, scopeFingerprint);
  assert.equal(
    migrated.current_scope.snapshot_path,
    `.author-toolkit/convergence/scopes/scope-legacy-${scopeFingerprint}.json`,
  );
  assert.equal(await readFile(trackerPath, "utf8"), trackerWithApproval);
  assert.equal(summary.approval_count, 1);
  assert.equal(summary.created_snapshots.scopes.length, 1);
  assert.equal(summary.created_snapshots.inventories.length, 1);
  const snapshot = JSON.parse(
    await readFile(path.resolve(projectRoot, migrated.current_scope.snapshot_path), "utf8"),
  );
  assert.deepEqual(snapshot.author_confirmation, {
    decision_id: "SCOPE-001",
    confirmed_at: legacyTimestamp,
    reading_order_confirmed: true,
  });
  assert.equal(snapshot.scope_fingerprint, scopeFingerprint);
  const record = JSON.parse(
    await readFile(path.join(path.dirname(summary.snapshot), "migration.json"), "utf8"),
  );
  assert.equal(record.scope_disposition, "confirmed-with-legacy-evidence");
  assert.equal(record.scope_confirmation.decision_id, "SCOPE-001");
  assert.equal(record.scope_confirmation.confirmed_at, legacyTimestamp);
  assert.deepEqual(record.legacy_current_scope, manifest.current_scope);

  const validated = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "validate.mjs"), "--manifest", manifestPath],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(validated.status, 0, validated.stderr);
  assert.match(validated.stdout, /full_manuscript=true/);
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "convergence", "evaluations")),
    [],
  );
});


test("legacy CLI migrates to v3.2 and a valid v3.2 rerun is byte-for-byte idempotent", async (t) => {
  const { projectRoot, manifestPath } = await createLegacyV3Project(t);
  const first = runMigration(projectRoot, legacyMigrationCli);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).target_schema_version, "3.2.0");
  assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).schema_version, "3.2.0");
  const beforeDigest = await digestPaths(projectRoot, ["."]);
  const migrations = await readdir(path.join(projectRoot, ".author-toolkit", "migrations"));

  const second = runMigration(projectRoot);
  assert.equal(second.status, 0, second.stderr);
  const summary = JSON.parse(second.stdout);
  assert.equal(summary.valid, true);
  assert.equal(summary.source_schema_version, "3.2.0");
  assert.equal(summary.target_schema_version, "3.2.0");
  assert.equal(summary.snapshot, null);
  assert.deepEqual(summary.created_snapshots, { scopes: [], inventories: [] });
  assert.equal(await digestPaths(projectRoot, ["."]), beforeDigest);
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "migrations")),
    migrations,
  );
});


test("the migrateProjectToV3 public wrapper retains its name and targets v3.2", async (t) => {
  const { projectRoot, manifestPath } = await createLegacyV3Project(t, "3.0.0");
  const summary = await migrateProjectToV3(projectRoot, {
    now: new Date("2026-11-06T01:02:03.000Z"),
  });
  assert.equal(summary.target_schema_version, "3.2.0");
  assert.equal(summary.source_schema_version, "3.0.0");
  assert.match(summary.snapshot, /20261106T010203000Z-v3_0-v3_2[\\/]project\.json$/);
  assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).schema_version, "3.2.0");
});


function runAuthorProject(args) {
  return spawnSync(process.execPath, [authorProjectCli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("an interrupted legacy commit requires public recovery before a dependent cycle", async (t) => {
  const { projectRoot, manifestPath, manifest } = await createLegacyV3Project(t);
  delete manifest.current_scope;
  delete manifest.pending_action;
  await writeJson(manifestPath, manifest);
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  await rm(path.join(projectRoot, ".author-toolkit", "creation", "staging", "batch-legacy"), {
    recursive: true,
  });
  const commitRelative = ".author-toolkit/creation/batches/commit-legacy.json";
  const commitPath = path.join(projectRoot, commitRelative);
  const commit = {
    schema_version: "1.0.0",
    batch_id: "batch-legacy",
    commit_id: "commit-legacy",
    status: "interrupted",
    scope_before_id: null,
    scope_after_id: null,
    files: [{
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: createHash("sha256").update("Legacy staged text\n").digest("hex"),
      backup_id: null,
      status: "pending",
    }],
    created_at: legacyTimestamp,
    updated_at: legacyTimestamp,
  };
  await writeJson(commitPath, commit);

  const migratedResult = runMigration(projectRoot);
  assert.equal(migratedResult.status, 0, migratedResult.stderr);
  const summary = JSON.parse(migratedResult.stdout);
  assert.equal(summary.recovery.recovery_required, true);
  assert.equal(summary.recovery.interrupted_commits.length, 1);
  assert.equal(summary.recovery.interrupted_commits[0].commit_id, "commit-legacy");
  assert.equal(summary.recovery.interrupted_commits[0].path, commitRelative);
  assert.equal(summary.recovery.blockers[0].code, "legacy-commit-recovery-required");
  assert.equal(await readFile(commitPath, "utf8"), `${JSON.stringify(commit, null, 2)}\n`);

  const diagnosisResult = runAuthorProject(["reconcile-cycle", "--project-root", projectRoot]);
  assert.equal(diagnosisResult.status, 1, diagnosisResult.stderr);
  const diagnosis = JSON.parse(diagnosisResult.stdout);
  assert.equal(diagnosis.diagnostic_only, true);
  assert.equal(diagnosis.state_written, false);
  assert.equal(diagnosis.cycle, null);
  assert.ok(diagnosis.blockers.some((blocker) =>
    blocker.code === "legacy-commit-recovery-required" && blocker.commit_id === "commit-legacy"
  ));
  assert.equal(await readFile(commitPath, "utf8"), `${JSON.stringify(commit, null, 2)}\n`);

  const startInput = await writeJson(path.join(projectRoot, "start-cycle.json"), {
    cycle_id: "cycle-after-legacy-recovery",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const blocked = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    startInput,
  ]);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.ok(JSON.parse(blocked.stdout).blockers.some((blocker) =>
    blocker.code === "legacy-commit-recovery-required"
  ));
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"), "utf8"),
    { code: "ENOENT" },
  );

  await writeJson(commitPath, {
    ...commit,
    status: "restored",
    files: [{ ...commit.files[0], status: "restored" }],
    updated_at: "2026-11-06T02:00:00.000Z",
  });
  const recovered = runAuthorProject(["reconcile-cycle", "--project-root", projectRoot]);
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const started = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    startInput,
  ]);
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.equal(JSON.parse(started.stdout).cycle.status, "active");
});


test("legacy staging remains unpublished until explicit rejection permits bootstrap recovery", async (t) => {
  const { projectRoot, manifestPath, manifest, tracker } = await createLegacyV3Project(t);
  delete manifest.current_scope;
  delete manifest.pending_action;
  await writeJson(manifestPath, manifest);
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const stagingPath = path.join(
    projectRoot,
    ".author-toolkit",
    "creation",
    "staging",
    "batch-legacy",
    "chapter-002.md",
  );
  const stagingBefore = await readFile(stagingPath, "utf8");

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.approval_count, 0);
  assert.equal(summary.recovery.legacy_staging.length, 1);
  assert.equal(summary.recovery.legacy_staging[0].batch_id, "batch-legacy");
  assert.equal(summary.recovery.blockers[0].code, "legacy-staging-decision-required");
  assert.equal(await readFile(stagingPath, "utf8"), stagingBefore);
  assert.equal(await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8"), tracker);
  await assert.rejects(readFile(path.join(projectRoot, "manuscript", "chapter-002.md"), "utf8"), {
    code: "ENOENT",
  });

  const startInput = await writeJson(path.join(projectRoot, "start-cycle.json"), {
    cycle_id: "cycle-after-staging-rejection",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const blocked = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    startInput,
  ]);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.ok(JSON.parse(blocked.stdout).blockers.some((blocker) =>
    blocker.code === "legacy-staging-decision-required"
  ));

  const batchPath = path.join(
    projectRoot,
    ".author-toolkit",
    "creation",
    "batches",
    "batch-legacy.json",
  );
  const batch = JSON.parse(await readFile(batchPath, "utf8"));
  await writeJson(batchPath, { ...batch, status: "rejected" });
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const separator = "|---|---|---|---|---|---|---|---|\n";
  const insertion = tracker.indexOf(separator, tracker.indexOf("## Approvals")) + separator.length;
  const rejection = `| REJECT-001 | creation-rejection | chapter-review | scope-legacy | \`.author-toolkit/creation/staging/batch-legacy/chapter-002.md\` | approved | batch_id=batch-legacy Explicitly reject the migrated staging without publication. | 2026-11-06T02:00:00.000Z |\n`;
  await writeFile(trackerPath, tracker.slice(0, insertion) + rejection + tracker.slice(insertion), "utf8");

  const diagnosis = runAuthorProject(["reconcile-cycle", "--project-root", projectRoot]);
  assert.equal(diagnosis.status, 0, `${diagnosis.stdout}\n${diagnosis.stderr}`);
  const started = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    startInput,
  ]);
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.equal(await readFile(stagingPath, "utf8"), stagingBefore);
  await assert.rejects(readFile(path.join(projectRoot, "manuscript", "chapter-002.md"), "utf8"), {
    code: "ENOENT",
  });
});


test("legacy staging can enter a new cycle only after real satisfied starting evidence", async (t) => {
  const { projectRoot, manifestPath, tracker } = await createLegacyV3Project(t);
  const stagingPath = path.join(
    projectRoot,
    ".author-toolkit",
    "creation",
    "staging",
    "batch-legacy",
    "chapter-002.md",
  );
  const stagingBefore = await readFile(stagingPath, "utf8");
  const migratedResult = runMigration(projectRoot);
  assert.equal(migratedResult.status, 0, migratedResult.stderr);
  assert.equal(JSON.parse(migratedResult.stdout).approval_count, 0);
  assert.equal(await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8"), tracker);

  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  await recordScope(projectRoot, { ...migrated.current_scope, status: "confirmed" }, {
    authorConfirmation: {
      decision_id: "SCOPE-100",
      confirmed_at: "2026-11-06T02:00:00.000Z",
      reading_order_confirmed: true,
    },
    now: new Date("2026-11-06T02:00:00.000Z"),
  });
  const startingScope = await currentScopeReference(projectRoot);
  const startInput = await writeJson(path.join(projectRoot, "start-cycle.json"), {
    cycle_id: "cycle-legacy-staging-reapproval",
    initiating_strategy: "write-fiction",
    bootstrap: false,
    starting_scope: startingScope,
  });
  const blocked = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    startInput,
  ]);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.ok(JSON.parse(blocked.stdout).blockers.some((blocker) =>
    blocker.code === "starting-evaluation-indeterminate"
  ));

  const evidence = await createNoEditEvidence(projectRoot);
  const evaluationInput = await writeJson(path.join(projectRoot, "evaluate-draft.json"), {
    evaluation_id: "evaluation-legacy-recovery",
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
  const evaluated = runAuthorProject([
    "evaluate-draft",
    "--project-root",
    projectRoot,
    "--input",
    evaluationInput,
  ]);
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
  assert.equal(JSON.parse(evaluated.stdout).evaluation.cycle_id, null);

  const started = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    startInput,
  ]);
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const cycle = JSON.parse(started.stdout).cycle;
  assert.equal(cycle.initiating_strategy, "write-fiction");
  assert.equal(cycle.starting_evaluation.evaluation_id, "evaluation-legacy-recovery");
  assert.equal(await readFile(stagingPath, "utf8"), stagingBefore);
  await assert.rejects(readFile(path.join(projectRoot, "manuscript", "chapter-002.md"), "utf8"), {
    code: "ENOENT",
  });
});


test("an interrupted legacy revision pending blocks dependent writes without becoming a cycle", async (t) => {
  const { projectRoot, manifestPath, manifest } = await createLegacyV3Project(t);
  manifest.pending_action = {
    operation: "chapter-revision",
    status: "in_progress",
    scope_id: "scope-legacy",
    reason: "The legacy revision write was interrupted.",
    artifacts: ["reports/legacy-report.md"],
    updated_at: legacyTimestamp,
  };
  await writeJson(manifestPath, manifest);
  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const migrated = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(migrated.pending_action, manifest.pending_action);
  assert.equal(summary.recovery.interrupted_pending_actions.length, 1);
  assert.ok(summary.recovery.blockers.some((blocker) =>
    blocker.code === "legacy-pending-recovery-required"
  ));
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "convergence", "evaluations")),
    [],
  );
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"), "utf8"),
    { code: "ENOENT" },
  );

  const checkInput = await writeJson(path.join(projectRoot, "check-operation.json"), {
    strategy: "revise-draft",
    operation: "chapter-revision",
    manuscript_change: true,
  });
  const checked = runAuthorProject([
    "check-operation",
    "--project-root",
    projectRoot,
    "--input",
    checkInput,
  ]);
  assert.equal(checked.status, 1, checked.stderr);
  assert.ok(JSON.parse(checked.stdout).blockers.some((blocker) =>
    blocker.code === "legacy-pending-recovery-required"
  ));
  assert.equal(JSON.parse(checked.stdout).required_action.strategy, "revise-draft");
});


test("legacy revision evidence stays indeterminate and routes through current full-manuscript revise-draft", async (t) => {
  const { projectRoot, manifestPath, manifest } = await createLegacyV3Project(t);
  manifest.pending_action = {
    operation: "revision-plan",
    status: "awaiting_author",
    scope_id: "scope-legacy",
    reason: "The original revision base cannot be revalidated by migration.",
    artifacts: ["reports/legacy-report.md"],
    updated_at: legacyTimestamp,
  };
  await writeJson(manifestPath, manifest);
  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);

  const statusResult = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "validate.mjs"), "--convergence-status", manifestPath],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.stdout);
  assert.equal(status.query_valid, true);
  assert.equal(status.outcome, "indeterminate");
  assert.equal(status.current, false);
  assert.equal(status.cycle, null);
  assert.deepEqual(status.pending_action, manifest.pending_action);
  assert.equal(status.required_action.strategy, "revise-draft");
  assert.equal(status.required_action.operation, "intake");

  const gate = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "validate.mjs"), "--convergence-gate", manifestPath],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(gate.status, 1);
  assert.equal(JSON.parse(gate.stdout).valid, false);
  const checkInput = await writeJson(path.join(projectRoot, "check-request.json"), {
    strategy: "revise-request",
    operation: "revision-plan",
    manuscript_change: true,
  });
  const checked = runAuthorProject([
    "check-operation",
    "--project-root",
    projectRoot,
    "--input",
    checkInput,
  ]);
  assert.equal(checked.status, 1, checked.stderr);
  assert.ok(JSON.parse(checked.stdout).blockers.some((blocker) =>
    blocker.code === "starting-evaluation-indeterminate"
  ));
  assert.equal(JSON.parse(checked.stdout).required_action.strategy, "revise-draft");
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"), "utf8"),
    { code: "ENOENT" },
  );
});


test("legacy findings and deferred approvals remain byte-preserved and create no execution evidence", async (t) => {
  const { projectRoot } = await createLegacyV3Project(t);
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|---|---|---|\n";
  const findingInsertion = tracker.indexOf(
    separator,
    tracker.indexOf("## Findings"),
  ) + separator.length;
  const finding = `| F-001 | diagnostics | Legacy diagnostic | manuscript/chapter-001.md | deferred | reports/legacy-report.md | ${legacyTimestamp} | Author deferred the historical finding. |\n`;
  const withFinding = tracker.slice(0, findingInsertion) + finding + tracker.slice(findingInsertion);
  const approvalSeparator = "|---|---|---|---|---|---|---|---|\n";
  const approvalInsertion = withFinding.indexOf(
    approvalSeparator,
    withFinding.indexOf("## Approvals"),
  ) + approvalSeparator.length;
  const approval = `| DECIDE-001 | gate-override | structure | scope-legacy | \`manuscript/chapter-001.md\` | deferred | Historical author decision; not current write approval. | ${legacyTimestamp} |\n`;
  const withApproval = withFinding.slice(0, approvalInsertion) + approval + withFinding.slice(approvalInsertion);
  await writeFile(trackerPath, withApproval, "utf8");

  const result = runMigration(projectRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).approval_count, 1);
  assert.equal(await readFile(trackerPath, "utf8"), withApproval);
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "convergence", "executions")),
    [],
  );
  assert.deepEqual(
    await readdir(path.join(projectRoot, ".author-toolkit", "convergence", "evaluations")),
    [],
  );
});
