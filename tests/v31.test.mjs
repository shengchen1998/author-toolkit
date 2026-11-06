import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  validateManifest,
  validateProjectFiles,
  validateScopeCurrency,
  validateTracker,
} from "../scripts/lib/index.mjs";
import { migrateProjectToV3 } from "../scripts/lib/migration.mjs";
import { root } from "./helpers.mjs";

const timestamp = "2026-11-04T00:00:00Z";
const creationOperations = [
  "creation-baseline",
  "writing-plan",
  "chapter-creation",
  "chapter-review",
  "creation-commit",
  "creation-import",
  "milestone-review",
];

function manifestV31() {
  return {
    schema_version: "3.1.0",
    project_type: "fiction",
    language: "zh-CN",
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
    created_at: timestamp,
    updated_at: timestamp,
  };
}

test("v3.1 accepts creation operations without changing the v3.0 contract", () => {
  for (const operation of creationOperations) {
    const manifest = manifestV31();
    manifest.pending_action = {
      operation,
      status: "awaiting_author",
      reason: "Confirm the creation batch before resuming.",
      artifacts: [".author-toolkit/creation/batches/batch-001.json"],
      updated_at: timestamp,
    };
    assert.equal(validateManifest(manifest).valid, true, operation);

    const legacy = structuredClone(manifest);
    legacy.schema_version = "3.0.0";
    delete legacy.paths.creation;
    assert.equal(validateManifest(legacy).valid, false, operation);
  }

  const missingCreation = manifestV31();
  delete missingCreation.paths.creation;
  assert.equal(validateManifest(missingCreation).valid, false);
});

test("v3.1 keeps creation paths, scope currency, and approvals under validation", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "v31-files-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));

  const manifest = manifestV31();
  const manifestPath = path.join(temporary, ".author-toolkit", "project.json");
  const manuscript = path.join(temporary, "manuscript", "chapter-001.md");
  const creation = path.join(temporary, ".author-toolkit", "creation");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await mkdir(path.dirname(manuscript), { recursive: true });
  await mkdir(creation, { recursive: true });
  for (const directory of ["reports", "sessions", ".author-toolkit/backups", ".author-toolkit/handoffs"]) {
    await mkdir(path.join(temporary, directory), { recursive: true });
  }
  await writeFile(manuscript, "Chapter one", "utf8");
  await writeFile(path.join(temporary, "story-bible.md"), "Story", "utf8");
  const tracker = await readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
  await writeFile(path.join(temporary, "audit-tracker.md"), tracker, "utf8");
  const batch = path.join(creation, "batches", "batch-001.json");
  await mkdir(path.dirname(batch), { recursive: true });
  await writeFile(batch, "{}\n", "utf8");
  manifest.current_scope = {
    scope_id: "scope-1",
    description: "First accepted chapter.",
    status: "confirmed",
    files: [
      {
        path: "manuscript/chapter-001.md",
        sha256: createHash("sha256").update("Chapter one").digest("hex"),
      },
    ],
    excluded_files: [],
    created_at: timestamp,
  };
  manifest.pending_action = {
    operation: "chapter-review",
    status: "awaiting_author",
    scope_id: "scope-1",
    reason: "Accept the staged chapter.",
    artifacts: [".author-toolkit/creation/batches/batch-001.json"],
    updated_at: timestamp,
  };

  assert.equal((await validateProjectFiles(manifest, manifestPath)).valid, true);
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, true);
  assert.equal((await validateTracker(manifest, manifestPath)).valid, true);

  await writeFile(manuscript, "Changed outside the batch", "utf8");
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, false);
  await writeFile(manuscript, "Chapter one", "utf8");

  await rm(creation, { recursive: true, force: true });
  const missingCreation = await validateProjectFiles(manifest, manifestPath);
  assert.equal(missingCreation.valid, false);
  assert.ok(missingCreation.errors.some((error) => error.instancePath === "/paths/creation"));
  await mkdir(path.dirname(batch), { recursive: true });
  await writeFile(batch, "{}\n", "utf8");

  await writeFile(
    path.join(temporary, "audit-tracker.md"),
    tracker.replace(/## Approvals[\s\S]*?(?=## Open questions)/, ""),
    "utf8",
  );
  assert.equal((await validateTracker(manifest, manifestPath)).valid, false);
});

test("v3.0 upgrades directly to v3.2 once without rewriting creative evidence", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "v31-migration-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));

  const legacy = manifestV31();
  legacy.schema_version = "3.0.0";
  delete legacy.paths.creation;
  legacy.current_scope = {
    scope_id: "scope-1",
    description: "Existing confirmed chapter.",
    status: "confirmed",
    files: [
      {
        path: "manuscript/chapter-001.md",
        sha256: createHash("sha256").update("Chapter one").digest("hex"),
      },
    ],
    excluded_files: [],
    created_at: timestamp,
  };
  legacy.pending_action = {
    operation: "structure",
    status: "awaiting_author",
    scope_id: "scope-1",
    reason: "Retain the existing author decision.",
    artifacts: ["reports/structure.md"],
    updated_at: timestamp,
  };
  const manifestPath = path.join(temporary, ".author-toolkit", "project.json");
  const trackerPath = path.join(temporary, "audit-tracker.md");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await mkdir(path.join(temporary, "manuscript"), { recursive: true });
  for (const directory of ["reports", "sessions", ".author-toolkit/backups", ".author-toolkit/handoffs"]) {
    await mkdir(path.join(temporary, directory), { recursive: true });
  }
  const originalManifest = `${JSON.stringify(legacy, null, 2)}\n`;
  const tracker = await readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
  await writeFile(manifestPath, originalManifest, "utf8");
  await writeFile(trackerPath, tracker, "utf8");
  await writeFile(path.join(temporary, "manuscript", "chapter-001.md"), "Chapter one", "utf8");
  await writeFile(path.join(temporary, "story-bible.md"), "Story", "utf8");
  await writeFile(path.join(temporary, "reports", "structure.md"), "Report", "utf8");

  const cli = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "migrate-v3.mjs"), "--project-root", temporary],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  const summary = JSON.parse(cli.stdout);
  const migratedText = await readFile(manifestPath, "utf8");
  const migrated = JSON.parse(migratedText);
  assert.equal(migrated.schema_version, "3.2.0");
  assert.equal(migrated.paths.creation, ".author-toolkit/creation/");
  assert.equal(migrated.paths.convergence, ".author-toolkit/convergence/");
  assert.equal(migrated.current_scope.status, "proposed");
  assert.equal(migrated.current_scope.description, legacy.current_scope.description);
  assert.match(migrated.current_scope.scope_fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(migrated.pending_action, legacy.pending_action);
  assert.equal(await readFile(trackerPath, "utf8"), tracker);
  assert.equal(await readFile(path.join(temporary, "manuscript", "chapter-001.md"), "utf8"), "Chapter one");
  assert.equal(await readFile(summary.snapshot, "utf8"), originalManifest);
  const record = JSON.parse(
    await readFile(path.join(path.dirname(summary.snapshot), "migration.json"), "utf8"),
  );
  assert.equal(record.source_schema_version, "3.0.0");
  assert.equal(record.target_schema_version, "3.2.0");
  assert.deepEqual(record.legacy_current_scope, legacy.current_scope);
  assert.equal(record.scope_disposition, "reconfirmation-required");
  assert.equal((await validateScopeCurrency(migrated, manifestPath)).valid, true);

  const second = await migrateProjectToV3(temporary, {
    now: new Date("2026-11-04T02:00:00Z"),
  });
  assert.equal(second.snapshot, null);
  assert.equal(await readFile(manifestPath, "utf8"), migratedText);
});
