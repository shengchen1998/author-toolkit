import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  validateManifest,
  validateProjectFiles,
  validateScopeCurrency,
  validateTracker,
} from "../scripts/lib/index.mjs";
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

test("v3.1 accepts creation operations and rejects older manifest versions", () => {
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
  }

  for (const schemaVersion of ["2.0.0", "3.0.0"]) {
    const manifest = manifestV31();
    manifest.schema_version = schemaVersion;
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors[0].params.supported, ["3.1.0"]);
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
