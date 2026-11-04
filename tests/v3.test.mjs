import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  extractReportEnvelope,
  validateEvidenceReport,
  validateManifest,
  validateMarkdownReport,
  validateProjectFiles,
  validateProjectSchema,
  validateProjectV3Schema,
  validateScopeCurrency,
  validateTracker,
  validateTrackerMarkdown,
  validateTrackerV3Markdown,
} from "../scripts/lib/index.mjs";
import { clone, readManifest, readReport, root } from "./helpers.mjs";

const timestamp = "2026-11-03T00:00:00Z";
const approvalTable =
  "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n" +
  "|---|---|---|---|---|---|---|---|";

function manifestV3() {
  return {
    schema_version: "3.0.0",
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
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function addScope(manifest) {
  manifest.current_scope = {
    scope_id: "scope-v3-migration",
    description: "Author confirmation is required.",
    status: "proposed",
    files: [{ path: "manuscript/chapter.md", sha256: "a".repeat(64) }],
    excluded_files: ["manuscript/cover.png"],
    created_at: timestamp,
  };
  return manifest;
}

async function trackerTemplate() {
  return readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
}

function approvalRow(id = "LEGACY-001") {
  return `| ${id} | gate-override | structure | scope-v3-migration | \`manuscript/chapter.md\`, \`manuscript/other.txt\` | deferred | Legacy decision; confirm before resume. | ${timestamp} |`;
}

function reportWith(stage, notes) {
  return readReport().then((markdown) => {
    const envelope = extractReportEnvelope(markdown);
    envelope.stage = stage;
    if (notes) envelope.engine.notes = notes;
    return markdown.replace(
      /```json\n[\s\S]*?\n```/,
      `\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\``,
    );
  });
}

test("v3 uses its own schema while v2 retains schema and workflow invariants", async () => {
  const v3 = manifestV3();
  assert.equal(validateProjectV3Schema(v3).valid, true);
  assert.equal(validateManifest(v3).valid, true);
  assert.equal(validateProjectSchema(v3).valid, false);

  const withWorkflow = clone(v3);
  withWorkflow.workflow = { name: "revise-fiction" };
  assert.equal(validateManifest(withWorkflow).valid, false);

  const v2 = await readManifest();
  assert.equal(validateManifest(v2).valid, true);
  assert.equal(validateProjectV3Schema(v2).valid, false);

  const unknown = { ...v3, schema_version: "4.0.0" };
  const result = validateManifest(unknown);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "schema-version"));
});

test("v3 current_scope enforces portable paths, hashes, and closed nested objects", () => {
  const valid = addScope(manifestV3());
  assert.equal(validateProjectV3Schema(valid).valid, true);

  const uppercaseHash = clone(valid);
  uppercaseHash.current_scope.files[0].sha256 = "A".repeat(64);
  assert.equal(validateProjectV3Schema(uppercaseHash).valid, false);

  const emptyFiles = clone(valid);
  emptyFiles.current_scope.files = [];
  assert.equal(validateProjectV3Schema(emptyFiles).valid, false);

  const escapingPath = clone(valid);
  escapingPath.current_scope.excluded_files = ["../outside.png"];
  assert.equal(validateProjectV3Schema(escapingPath).valid, false);

  const additional = clone(valid);
  additional.current_scope.files[0].size = 12;
  const result = validateProjectV3Schema(additional);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "additionalProperties"));
});

test("v3 pending_action accepts every neutral operation and requires recovery metadata", () => {
  const operations = [
    "intake",
    "story-bible",
    "draft-baseline",
    "structure",
    "characters",
    "diagnostics",
    "revision-plan",
    "chapter-revision",
    "prose",
    "ai-cleanup",
    "current-scope-review",
    "final-review",
  ];
  for (const operation of operations) {
    const manifest = manifestV3();
    manifest.pending_action = {
      operation,
      status: "awaiting_author",
      scope_id: "scope-1",
      reason: "Confirm before resuming.",
      artifacts: ["reports/report.md"],
      updated_at: timestamp,
    };
    assert.equal(validateProjectV3Schema(manifest).valid, true, operation);
  }

  const invalid = manifestV3();
  invalid.pending_action = {
    operation: "diagnostics",
    status: "complete",
    updated_at: timestamp,
  };
  const result = validateProjectV3Schema(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.params.missingProperty === "reason"));
  assert.ok(result.errors.some((error) => error.instancePath === "/pending_action/status"));
});

test("v3 file checks cover scope and pending artifacts without recomputing hashes", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "v3-files-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));

  const manifest = addScope(manifestV3());
  manifest.pending_action = {
    operation: "structure",
    status: "blocked",
    reason: "Waiting for the author.",
    artifacts: ["reports/structure.md"],
    updated_at: timestamp,
  };
  const manifestPath = path.join(temporary, ".author-toolkit", "project.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  for (const directory of ["manuscript", "reports", "sessions", "backups", "handoffs"]) {
    await mkdir(path.join(temporary, directory), { recursive: true });
  }
  await writeFile(path.join(temporary, "story-bible.md"), "Story", "utf8");
  await writeFile(path.join(temporary, "audit-tracker.md"), await trackerTemplate(), "utf8");
  await writeFile(path.join(temporary, "manuscript", "chapter.md"), "Actual contents", "utf8");
  await writeFile(path.join(temporary, "reports", "structure.md"), "Report", "utf8");

  const files = await validateProjectFiles(manifest, manifestPath);
  assert.deepEqual(files.errors, []);
  assert.equal(files.valid, true);
  assert.equal((await validateTracker(manifest, manifestPath)).valid, true);

  manifest.current_scope.files[0].sha256 = createHash("sha256")
    .update("Actual contents")
    .digest("hex");
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, true);
  await writeFile(path.join(temporary, "manuscript", "chapter.md"), "Changed elsewhere", "utf8");
  const changed = await validateScopeCurrency(manifest, manifestPath);
  assert.equal(changed.valid, false);
  assert.ok(
    changed.errors.some(
      (error) =>
        error.instancePath === "/current_scope/files/0/sha256" &&
        error.keyword === "scope-currency",
    ),
  );

  await writeFile(path.join(temporary, "manuscript", "chapter.md"), "Actual contents", "utf8");
  await writeFile(path.join(temporary, "manuscript", "chapter-02.md"), "New chapter", "utf8");
  const added = await validateScopeCurrency(manifest, manifestPath);
  assert.equal(added.valid, false);
  assert.ok(
    added.errors.some(
      (error) =>
        error.instancePath === "/current_scope/files" &&
        error.message.includes("manuscript/chapter-02.md"),
    ),
  );
  await rm(path.join(temporary, "manuscript", "chapter-02.md"));

  await rm(path.join(temporary, "manuscript", "chapter.md"));
  const missing = await validateProjectFiles(manifest, manifestPath);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.instancePath === "/current_scope/files/0/path"));

  await writeFile(path.join(temporary, "manuscript", "chapter.md"), "Actual contents", "utf8");
  await rm(path.join(temporary, "reports", "structure.md"));
  const missingArtifact = await validateProjectFiles(manifest, manifestPath);
  assert.equal(missingArtifact.valid, false);
  assert.ok(
    missingArtifact.errors.some((error) => error.instancePath === "/pending_action/artifacts/0"),
  );
});

test("v3 Approvals enforce their table and v2 still does not require the section", async () => {
  const template = await trackerTemplate();
  assert.equal((await validateTrackerV3Markdown(template, root)).valid, true);
  assert.equal((await validateTrackerMarkdown(template, root)).valid, true);

  const withoutApprovals = template.replace(/## Approvals[\s\S]*?(?=## Open questions)/, "");
  assert.equal((await validateTrackerV3Markdown(withoutApprovals, root)).valid, false);
  assert.equal((await validateTrackerMarkdown(withoutApprovals, root)).valid, true);

  const valid = template.replace(approvalTable, `${approvalTable}\n${approvalRow()}`);
  assert.equal((await validateTrackerV3Markdown(valid, root)).valid, true);

  const duplicate = template.replace(
    approvalTable,
    `${approvalTable}\n${approvalRow()}\n${approvalRow()}`,
  );
  const duplicateResult = await validateTrackerV3Markdown(duplicate, root);
  assert.equal(duplicateResult.valid, false);
  assert.ok(duplicateResult.errors.some((error) => error.message.includes("duplicate approval ID")));

  const badPaths = valid.replace(
    "`manuscript/chapter.md`, `manuscript/other.txt`",
    "`manuscript/chapter.md`, ../outside.txt",
  );
  const badPathsResult = await validateTrackerV3Markdown(badPaths, root);
  assert.equal(badPathsResult.valid, false);
  assert.ok(badPathsResult.errors.some((error) => error.instancePath.endsWith("/paths")));

  const badStatus = valid.replace("| deferred |", "| Approved |");
  assert.equal((await validateTrackerV3Markdown(badStatus, root)).valid, false);

  const duplicateSection = `${valid}\n## Approvals\n\n${approvalTable}\n`;
  assert.equal((await validateTrackerV3Markdown(duplicateSection, root)).valid, false);
});

test("new report stages keep the v2 envelope and use opt-in evidence semantics", async () => {
  for (const stage of ["draft-baseline", "diagnostics", "current-scope-review"]) {
    const markdown = await reportWith(stage);
    assert.equal(validateMarkdownReport(markdown).valid, true, stage);
    const evidence = validateEvidenceReport(markdown);
    assert.equal(evidence.valid, false, stage);
    assert.ok(evidence.errors.some((error) => error.message.includes("scope_id")));
    assert.ok(evidence.errors.some((error) => error.message.includes("operation_coverage")));
  }

  const legacyCharacters = await reportWith("characters");
  assert.equal(validateMarkdownReport(legacyCharacters).valid, true);
  assert.equal(validateEvidenceReport(legacyCharacters).valid, false);

  const structure = await reportWith(
    "structure",
    "Coverage: full. scope_id=scope-1 operation_coverage=partial",
  );
  assert.equal(validateEvidenceReport(structure).valid, true);

  for (const stage of ["characters", "diagnostics", "current-scope-review"]) {
    const missingSubchecks = await reportWith(
      stage,
      "Coverage: full. scope_id=scope-1 operation_coverage=full",
    );
    const result = validateEvidenceReport(missingSubchecks);
    assert.equal(result.valid, false, stage);
    assert.ok(result.errors.some((error) => error.message.includes("subchecks")));

    const complete = await reportWith(
      stage,
      "Coverage: full. scope_id=scope-1 operation_coverage=full subchecks=arc,continuity",
    );
    assert.equal(validateEvidenceReport(complete).valid, true, stage);
  }

  const baseline = await reportWith(
    "draft-baseline",
    "Coverage: full. scope_id=scope-1 operation_coverage=skipped",
  );
  assert.equal(validateEvidenceReport(baseline).valid, true);

  const badScope = await reportWith(
    "structure",
    "Coverage: full. scope_id=../bad operation_coverage=full",
  );
  assert.equal(validateEvidenceReport(badScope).valid, false);
});

test("the shipped project and tracker templates are neutral uninitialized v3 assets", async () => {
  const project = JSON.parse(
    await readFile(
      path.join(root, "skills", "author-project", "assets", "project-template.json"),
      "utf8",
    ),
  );
  assert.equal(validateManifest(project).valid, true);
  assert.equal(project.schema_version, "3.1.0");
  assert.equal(project.paths.creation, ".author-toolkit/creation/");
  assert.equal(project.language, "und");
  assert.equal("workflow" in project, false);
  assert.equal("current_scope" in project, false);
  assert.equal("pending_action" in project, false);

  const tracker = await trackerTemplate();
  assert.match(tracker, /## Project/);
  assert.match(tracker, /Current scope:/);
  assert.match(tracker, /Pending action:/);
  assert.doesNotMatch(tracker, /Main workflow|Current stage/);
  for (const section of ["Findings", "Audit runs", "Approvals", "Open questions", "Approved decisions"]) {
    assert.match(tracker, new RegExp(`## ${section}`));
  }
});
