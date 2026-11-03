import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  validateProjectFiles,
  validateTracker,
  validateTrackerMarkdown,
} from "../scripts/lib/index.mjs";
import {
  exampleRoot,
  manifestPath,
  readManifest,
  readTracker,
  root,
} from "./helpers.mjs";

async function copyExample(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "project-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const projectRoot = path.join(temporary, "project");
  await cp(exampleRoot("en"), projectRoot, { recursive: true });
  return projectRoot;
}

test("example manifests resolve their project roots and validate all on-disk state", async () => {
  for (const language of ["en", "zh"]) {
    const manifest = await readManifest(language);
    const files = await validateProjectFiles(manifest, manifestPath(language));
    assert.deepEqual(files.errors, []);
    assert.equal(files.valid, true);
    assert.equal(files.projectRoot, exampleRoot(language));

    const tracker = await validateTracker(manifest, manifestPath(language));
    assert.deepEqual(tracker.errors, []);
    assert.equal(tracker.valid, true);
  }
});

test("manifest file validation reports missing operational paths and stage artifacts", async (t) => {
  const missingDirectoryRoot = await copyExample(t);
  await rm(path.join(missingDirectoryRoot, "handoffs"), { recursive: true });
  const missingDirectoryManifest = await readManifest();
  const missingDirectory = await validateProjectFiles(
    missingDirectoryManifest,
    path.join(missingDirectoryRoot, ".author-toolkit", "project.json"),
  );
  assert.equal(missingDirectory.valid, false);
  assert.ok(missingDirectory.errors.some((error) => error.instancePath === "/paths/handoffs"));

  const missingArtifactRoot = await copyExample(t);
  await rm(
    path.join(missingArtifactRoot, "reports", "structure", "2026-01-17_structure.md"),
  );
  const missingArtifact = await validateProjectFiles(
    missingDirectoryManifest,
    path.join(missingArtifactRoot, ".author-toolkit", "project.json"),
  );
  assert.equal(missingArtifact.valid, false);
  assert.ok(
    missingArtifact.errors.some((error) =>
      error.instancePath.startsWith("/workflow/stages/2/artifacts/"),
    ),
  );
});

test("tracker parsing rejects missing sections, duplicate IDs, pending rows, and missing reports", async () => {
  const projectRoot = exampleRoot("en");
  const tracker = await readTracker("en");
  assert.equal((await validateTrackerMarkdown(tracker, projectRoot)).valid, true);

  const noSection = await validateTrackerMarkdown(
    tracker.replace("## Findings", "## Notes"),
    projectRoot,
  );
  assert.equal(noSection.valid, false);
  assert.match(noSection.errors[0].message, /exactly one ## Findings/);

  const duplicate = await validateTrackerMarkdown(
    tracker.replace("| STRUCT-002 |", "| STRUCT-001 |"),
    projectRoot,
  );
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((error) => error.message.includes("duplicate finding ID")));

  const pendingStatus = await validateTrackerMarkdown(
    tracker.replace("| open |", "| Pending |"),
    projectRoot,
  );
  assert.equal(pendingStatus.valid, false);
  assert.ok(pendingStatus.errors.some((error) => error.instancePath.endsWith("/status")));

  const pendingReason = await validateTrackerMarkdown(
    tracker.replace("No author decision recorded.", "Pending"),
    projectRoot,
  );
  assert.equal(pendingReason.valid, false);
  assert.ok(pendingReason.errors.some((error) => error.instancePath.endsWith("/reason")));

  const missingReport = await validateTrackerMarkdown(
    tracker.replace(
      "`reports/structure/2026-01-17_structure.md`",
      "`reports/structure/missing.md`",
    ),
    projectRoot,
  );
  assert.equal(missingReport.valid, false);
  assert.ok(
    missingReport.errors.some(
      (error) => error.instancePath.endsWith("/report") && error.message.includes("does not exist"),
    ),
  );
});

test("only the uninitialized template skips on-disk project checks", async () => {
  const templatePath = path.join(
    root,
    "skills",
    "author-project",
    "assets",
    "project-template.json",
  );
  const template = JSON.parse(await readFile(templatePath, "utf8"));

  assert.equal((await validateProjectFiles(template, templatePath)).valid, true);
  assert.equal((await validateTracker(template, templatePath)).valid, true);

  const initialized = {
    ...template,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  assert.equal((await validateProjectFiles(initialized, templatePath)).valid, false);
  assert.equal((await validateTracker(initialized, templatePath)).valid, false);
});
