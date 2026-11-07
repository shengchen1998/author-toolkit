import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  extractReportEnvelope,
  recordScope,
  timestampResult,
  validateEvidenceReport,
  validateManifest,
  validateMarkdownReport,
  validateProjectFiles,
  validateProjectV4Schema,
  validateScopeCurrency,
  validateTracker,
  validateTrackerV3Markdown,
} from "../scripts/lib/index.mjs";
import { readReport, root } from "./helpers.mjs";

const timestamp = "2026-11-03T00:00:00Z";
const approvalTable =
  "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n" +
  "|---|---|---|---|---|---|---|---|";

function currentManifest() {
  return {
    schema_version: "4.0.0",
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
      convergence: ".author-toolkit/convergence",
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

async function trackerTemplate() {
  return readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
}

async function createProject(t, { manuscriptRoot = "manuscript", chapterCount = 3 } = {}) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "current-contract-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const manifest = currentManifest();
  manifest.manuscript_root = manuscriptRoot;
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  for (const directory of [
    ".author-toolkit/backups",
    ".author-toolkit/handoffs",
    ".author-toolkit/creation",
    ".author-toolkit/convergence",
    "manuscript",
    "reports/structure",
    "sessions",
  ]) {
    await mkdir(path.join(projectRoot, directory), { recursive: true });
  }
  await cp(
    path.join(root, "skills", "setup-author-toolkit", "assets", "references"),
    path.join(projectRoot, ".author-toolkit", "references"),
    { recursive: true },
  );
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeJson(path.join(projectRoot, ".author-toolkit", "backups", "index.json"), {
    schema_version: "1.0.0",
    backups: [],
    restorations: [],
  });
  await writeFile(path.join(projectRoot, "story-bible.md"), "Story\n", "utf8");
  await writeFile(path.join(projectRoot, "audit-tracker.md"), await trackerTemplate(), "utf8");
  for (let index = 1; index <= chapterCount; index += 1) {
    await writeFile(
      path.join(projectRoot, "manuscript", `chapter-0${index}.md`),
      `Chapter ${index}\n`,
      "utf8",
    );
  }
  await writeFile(path.join(projectRoot, "reports", "structure", "current.md"), "Report\n", "utf8");
  return { projectRoot, manifestPath, manifest };
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function proposedScope(files) {
  return {
    scope_id: "scope-current",
    description: "The author reviews the current manuscript reading order.",
    status: "proposed",
    files,
    created_at: timestamp,
  };
}

function approvalRow(id = "DECISION-001") {
  return `| ${id} | gate-override | structure | scope-current | \`manuscript/chapter-01.md\`, \`manuscript/chapter-02.md\` | deferred | Author deferred resumption. | ${timestamp} |`;
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

test("current scope and pending action use one closed manifest contract", () => {
  const manifest = currentManifest();
  manifest.current_scope = {
    scope_id: "scope-current",
    description: "Current manuscript.",
    status: "proposed",
    files: [{ path: "manuscript/chapter-01.md", sha256: "a".repeat(64) }],
    excluded_files: ["manuscript/cover.png"],
    created_at: timestamp,
    scope_fingerprint: "b".repeat(64),
  };
  assert.equal(validateProjectV4Schema(manifest).valid, true);

  const uppercaseHash = structuredClone(manifest);
  uppercaseHash.current_scope.files[0].sha256 = "A".repeat(64);
  assert.equal(validateProjectV4Schema(uppercaseHash).valid, false);
  const emptyFiles = structuredClone(manifest);
  emptyFiles.current_scope.files = [];
  assert.equal(validateProjectV4Schema(emptyFiles).valid, false);
  const escapingPath = structuredClone(manifest);
  escapingPath.current_scope.excluded_files = ["../outside.png"];
  assert.equal(validateProjectV4Schema(escapingPath).valid, false);
  const additional = structuredClone(manifest);
  additional.current_scope.files[0].size = 12;
  assert.equal(validateProjectV4Schema(additional).valid, false);

  for (const operation of [
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
    "creation-baseline",
    "writing-plan",
    "chapter-creation",
    "chapter-review",
    "creation-commit",
    "creation-import",
    "milestone-review",
  ]) {
    const candidate = currentManifest();
    candidate.pending_action = {
      operation,
      status: "awaiting_author",
      scope_id: "scope-current",
      reason: "Confirm before resuming.",
      artifacts: ["reports/structure/current.md"],
      updated_at: timestamp,
    };
    assert.equal(validateManifest(candidate).valid, true, operation);
  }

  const invalid = currentManifest();
  invalid.pending_action = {
    operation: "diagnostics",
    status: "complete",
    updated_at: timestamp,
  };
  const result = validateManifest(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.params.missingProperty === "reason"));
  assert.ok(result.errors.some((error) => error.instancePath === "/pending_action/status"));
});

test("current file checks cover scope and pending artifacts", async (t) => {
  const { projectRoot, manifestPath } = await createProject(t, { chapterCount: 1 });
  await recordScope(projectRoot, proposedScope(["manuscript/chapter-01.md"]), {
    now: new Date(timestamp),
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.pending_action = {
    operation: "structure",
    status: "blocked",
    reason: "Waiting for the author.",
    artifacts: ["reports/structure/current.md"],
    updated_at: timestamp,
  };

  assert.equal((await validateProjectFiles(manifest, manifestPath)).valid, true);
  assert.equal((await validateTracker(manifest, manifestPath)).valid, true);
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, true);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-01.md"), "Changed elsewhere", "utf8");
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, false);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-01.md"), "Chapter 1\n", "utf8");
  await writeFile(path.join(projectRoot, "manuscript", "chapter-02.md"), "New chapter", "utf8");
  const added = await validateScopeCurrency(manifest, manifestPath);
  assert.equal(added.valid, false);
  assert.ok(added.errors.some((error) => error.message.includes("manuscript/chapter-02.md")));
  await rm(path.join(projectRoot, "manuscript", "chapter-02.md"));

  await rm(path.join(projectRoot, "manuscript", "chapter-01.md"));
  const missing = await validateProjectFiles(manifest, manifestPath);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.instancePath === "/current_scope/files/0/path"));
  await writeFile(path.join(projectRoot, "manuscript", "chapter-01.md"), "Chapter 1\n", "utf8");
  await rm(path.join(projectRoot, "reports", "structure", "current.md"));
  const missingArtifact = await validateProjectFiles(manifest, manifestPath);
  assert.equal(missingArtifact.valid, false);
  assert.ok(missingArtifact.errors.some((error) => error.instancePath === "/pending_action/artifacts/0"));
});

test("current tracker requires approvals and stable unique typed rows", async () => {
  const template = await trackerTemplate();
  assert.equal((await validateTrackerV3Markdown(template, root)).valid, true);
  const withoutApprovals = template.replace(/## Approvals[\s\S]*?(?=## Cycle completions)/, "");
  assert.equal((await validateTrackerV3Markdown(withoutApprovals, root)).valid, false);

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
    "`manuscript/chapter-01.md`, `manuscript/chapter-02.md`",
    "`manuscript/chapter-01.md`, ../outside.txt",
  );
  assert.equal((await validateTrackerV3Markdown(badPaths, root)).valid, false);
  assert.equal((await validateTrackerV3Markdown(valid.replace("| deferred |", "| Approved |"), root)).valid, false);
  assert.equal((await validateTrackerV3Markdown(`${valid}\n## Approvals\n\n${approvalTable}\n`, root)).valid, false);
});

test("report stages keep report v2 and explicit evidence semantics", async () => {
  for (const stage of ["draft-baseline", "diagnostics", "current-scope-review"]) {
    const markdown = await reportWith(stage);
    assert.equal(validateMarkdownReport(markdown).valid, true, stage);
    const evidence = validateEvidenceReport(markdown);
    assert.equal(evidence.valid, false, stage);
    assert.ok(evidence.errors.some((error) => error.message.includes("operation_coverage")));
  }

  const structure = await reportWith(
    "structure",
    "Coverage: full. scope_id=scope-current operation_coverage=partial",
  );
  assert.equal(validateEvidenceReport(structure).valid, true);

  for (const stage of ["characters", "diagnostics", "current-scope-review"]) {
    const missingSubchecks = await reportWith(
      stage,
      "Coverage: full. scope_id=scope-current operation_coverage=full",
    );
    const result = validateEvidenceReport(missingSubchecks);
    assert.equal(result.valid, false, stage);
    assert.ok(result.errors.some((error) => error.message.includes("subchecks")));

    const complete = await reportWith(
      stage,
      "Coverage: full. scope_id=scope-current operation_coverage=full subchecks=arc,continuity",
    );
    assert.equal(validateEvidenceReport(complete).valid, true, stage);
  }

  const baseline = await reportWith(
    "draft-baseline",
    "Coverage: full. scope_id=scope-current operation_coverage=skipped",
  );
  assert.equal(validateEvidenceReport(baseline).valid, true);
  const badScope = await reportWith(
    "structure",
    "Coverage: full. scope_id=../bad operation_coverage=full",
  );
  assert.equal(validateEvidenceReport(badScope).valid, false);
});

test("the shipped project and tracker templates are neutral uninitialized 4.0 assets", async () => {
  const project = JSON.parse(
    await readFile(
      path.join(root, "skills", "author-project", "assets", "project-template.json"),
      "utf8",
    ),
  );
  assert.equal(validateManifest(project).valid, true);
  assert.equal(project.schema_version, "4.0.0");
  assert.equal(project.paths.creation, ".author-toolkit/creation/");
  assert.equal(project.paths.convergence, ".author-toolkit/convergence/");
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

test("current scope accepts a single-file manuscript_root", async (t) => {
  const { projectRoot, manifestPath } = await createProject(t, {
    manuscriptRoot: "manuscript/chapter-01.md",
    chapterCount: 1,
  });
  await recordScope(projectRoot, proposedScope(["manuscript/chapter-01.md"]), {
    now: new Date(timestamp),
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.current_scope.files.map((file) => file.path), ["manuscript/chapter-01.md"]);
  assert.equal(validateManifest(manifest).valid, true);
  assert.equal((await validateProjectFiles(manifest, manifestPath)).valid, true);
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, true);
  assert.equal((await validateTracker(manifest, manifestPath)).valid, true);
});

test("project-root inventory excludes operational Markdown and detects new manuscript", async (t) => {
  const { projectRoot, manifestPath } = await createProject(t, { manuscriptRoot: "." });
  const files = ["manuscript/chapter-01.md", "manuscript/chapter-02.md", "manuscript/chapter-03.md"];
  await recordScope(projectRoot, proposedScope(files), { now: new Date(timestamp) });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.current_scope.files.map((file) => file.path), files);
  assert.ok(manifest.current_scope.excluded_files.includes("audit-tracker.md"));
  assert.ok(manifest.current_scope.excluded_files.includes("story-bible.md"));
  assert.ok(manifest.current_scope.excluded_files.includes("reports/structure/current.md"));
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, true);

  await writeFile(path.join(projectRoot, "reports", "after.md"), "Operational report", "utf8");
  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, true);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-04.md"), "New chapter", "utf8");
  const added = await validateScopeCurrency(manifest, manifestPath);
  assert.equal(added.valid, false);
  assert.ok(added.errors.some((error) => error.message.includes("manuscript/chapter-04.md")));
});


test("the documented timestamp filename form is a valid report ID while ISO stays in JSON", async () => {
  const timestamp = timestampResult({ now: "2026-11-06T01:02:03.456Z" });
  const envelope = extractReportEnvelope(await readReport("en"));
  envelope.report_id = timestamp.filename;
  envelope.created_at = timestamp.json;
  envelope.engine.degraded = false;
  envelope.engine.notes = "language coverage=full scope_id=fixture-scope-en operation_coverage=full";
  const markdown = `# ${envelope.report_id}\n\n## Language coverage\n\nfull\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;

  assert.equal(timestamp.filename, "20261106T010203456Z");
  assert.equal(timestamp.json, "2026-11-06T01:02:03.456Z");
  assert.match(envelope.report_id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  assert.equal(validateEvidenceReport(markdown).valid, true);
});
