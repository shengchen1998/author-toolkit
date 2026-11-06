import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canReuseCoverageUnit,
  validateCoverageIndex,
  validateCoverageUnit,
  validateCreationBatch,
  validateCreationCommit,
  validateStoryStateMarkdown,
} from "../scripts/lib/index.mjs";

const timestamp = "2026-11-04T00:00:00Z";
const hash = "a".repeat(64);

function chapterState() {
  return {
    schema_version: "1.0.0",
    state_id: "chapter-001",
    level: "chapter",
    scope_id: "scope-1",
    updated_at: timestamp,
    sources: [{ path: "manuscript/chapter-001.md", sha256: hash }],
    summary: "Ning enters the city and learns that her sister is missing.",
    records: [
      {
        record_id: "THREAD-001",
        category: "thread",
        status: "open",
        text: "Ning must find her sister before the winter ferry leaves.",
        source_paths: ["manuscript/chapter-001.md"],
      },
    ],
    children: [],
  };
}

function markdown(value) {
  return `# Story state\n\n${value.summary}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

test("story state validates a current chapter through the public artifact interface", () => {
  const state = chapterState();
  assert.equal(validateStoryStateMarkdown(markdown(state)).valid, true);

  const missingSummary = { ...state, summary: "" };
  assert.equal(validateStoryStateMarkdown(markdown(missingSummary)).valid, false);

  const escapingSource = {
    ...state,
    sources: [{ path: "../chapter-001.md", sha256: hash }],
  };
  assert.equal(validateStoryStateMarkdown(markdown(escapingSource)).valid, false);
});

test("pre-manuscript current state can have a null scope while chapters cannot", () => {
  const current = {
    ...chapterState(),
    state_id: "current",
    level: "current",
    scope_id: null,
    sources: [{ path: "story-bible.md", sha256: hash }],
    records: [],
  };
  assert.equal(validateStoryStateMarkdown(markdown(current)).valid, true);

  const chapter = { ...chapterState(), scope_id: null };
  assert.equal(validateStoryStateMarkdown(markdown(chapter)).valid, false);
});

test("shipped creation templates satisfy their public artifact contracts", async () => {
  for (const name of ["current-state-template.md", "story-state-template.md"]) {
    const markdown = await readFile(
      new URL(`../skills/write-fiction/assets/${name}`, import.meta.url),
      "utf8",
    );
    assert.equal(validateStoryStateMarkdown(markdown).valid, true, name);
  }
  const batch = JSON.parse(
    await readFile(
      new URL("../skills/write-fiction/assets/creation-batch-template.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(validateCreationBatch(batch).valid, true);
});

function creationBatch() {
  return {
    schema_version: "1.0.0",
    batch_id: "batch-001",
    operation: "chapter-creation",
    source_mode: "ai",
    status: "proposed",
    scope_id: null,
    plan: {
      summary: "Draft the first chapter and establish the missing-sister thread.",
      context: [
        {
          path: "story-bible.md",
          version: hash,
          version_type: "sha256",
        },
      ],
      dependency_fingerprint: hash,
    },
    files: [
      {
        path: "manuscript/chapter-001.md",
        action: "create",
        input_sha256: null,
        output_sha256: null,
        status: "pending",
      },
    ],
    story_state: [],
    approvals: [],
    commit: null,
    next_action: "Approve the writing plan and target path.",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

test("creation batches preserve absent-file inputs and dependency fingerprints", () => {
  const batch = creationBatch();
  assert.equal(validateCreationBatch(batch).valid, true);

  const existingInput = structuredClone(batch);
  existingInput.files[0].input_sha256 = hash;
  const result = validateCreationBatch(existingInput);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "creation-input"));
});

function creationCommit() {
  return {
    schema_version: "1.0.0",
    batch_id: "batch-001",
    commit_id: "commit-001",
    status: "committed",
    scope_before_id: "scope-1",
    scope_after_id: "scope-2",
    files: [
      {
        path: "manuscript/chapter-001.md",
        action: "modify",
        input_sha256: hash,
        output_sha256: "b".repeat(64),
        backup_id: "backup-001",
        status: "verified",
      },
      {
        path: "manuscript/chapter-002.md",
        action: "create",
        input_sha256: null,
        output_sha256: "c".repeat(64),
        backup_id: null,
        status: "verified",
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

test("creation commits require verified files and retain resumable interrupted state", () => {
  const commit = creationCommit();
  assert.equal(validateCreationCommit(commit).valid, true);

  const incomplete = structuredClone(commit);
  incomplete.files[0].status = "written";
  const result = validateCreationCommit(incomplete);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "commit-status"));

  const interrupted = structuredClone(incomplete);
  interrupted.status = "interrupted";
  interrupted.files[1].status = "pending";
  interrupted.files[1].output_sha256 = null;
  assert.equal(validateCreationCommit(interrupted).valid, true);
});

test("deletion batches move from accepted to committed with null output hashes", () => {
  const batch = creationBatch();
  batch.status = "accepted";
  batch.approvals = ["MANUSCRIPT-001", "SCOPE-001"];
  Object.assign(batch.files[0], {
    action: "delete",
    input_sha256: hash,
    output_sha256: null,
    status: "accepted",
  });
  assert.equal(validateCreationBatch(batch).valid, true);

  const commit = creationCommit();
  commit.files = [
    {
      path: batch.files[0].path,
      action: "delete",
      input_sha256: hash,
      output_sha256: null,
      backup_id: "backup-001",
      status: "verified",
    },
  ];
  assert.equal(validateCreationCommit(commit).valid, true);

  batch.status = "committed";
  batch.files[0].status = "verified";
  batch.commit = ".author-toolkit/creation/batches/batch-001.commit.json";
  assert.equal(validateCreationBatch(batch).valid, true);

  const unexpectedOutput = structuredClone(batch);
  unexpectedOutput.files[0].output_sha256 = "d".repeat(64);
  const result = validateCreationBatch(unexpectedOutput);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "creation-output"));
});

test("accepted, committed, and restored batches require distinct author approvals", () => {
  assert.equal(validateCreationBatch(creationBatch()).valid, true);

  const batch = creationBatch();
  batch.status = "accepted";
  batch.files[0].status = "accepted";
  batch.files[0].output_sha256 = "b".repeat(64);
  batch.approvals = ["MANUSCRIPT-001"];
  let result = validateCreationBatch(batch);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "creation-approvals"));

  batch.approvals = ["MANUSCRIPT-001", "MANUSCRIPT-001"];
  assert.equal(validateCreationBatch(batch).valid, false);

  batch.approvals = ["MANUSCRIPT-001", "SCOPE-001"];
  assert.equal(validateCreationBatch(batch).valid, true);

  batch.status = "committed";
  batch.files[0].status = "verified";
  batch.commit = ".author-toolkit/creation/batches/batch-001.commit.json";
  assert.equal(validateCreationBatch(batch).valid, true);

  batch.status = "restored";
  result = validateCreationBatch(batch);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "creation-approvals"));

  batch.approvals.push("RESTORE-001");
  assert.equal(validateCreationBatch(batch).valid, true);
});

function coverageUnit() {
  return {
    schema_version: "1.0.0",
    unit_id: "unit-001",
    source_report: "reports/diagnostics/2026-11-04_chapter-001.md",
    scope_id: "scope-1",
    operation: "diagnostics",
    kind: "local",
    paths: [{ path: "manuscript/chapter-001.md", sha256: hash }],
    subchecks: ["scene-causality", "chapter-transitions"],
    dependencies: [{ path: "story-bible.md", sha256: "b".repeat(64) }],
    dependency_exception: null,
    coverage: "full",
    created_at: timestamp,
  };
}

test("only full local coverage with identical evidence inputs can be reused", () => {
  const unit = coverageUnit();
  assert.equal(validateCoverageUnit(unit).valid, true);
  const request = {
    source_report: unit.source_report,
    scope_id: unit.scope_id,
    operation: unit.operation,
    paths: unit.paths,
    subchecks: [...unit.subchecks].reverse(),
    dependencies: unit.dependencies,
  };
  assert.equal(canReuseCoverageUnit(unit, request), true);

  const changed = structuredClone(request);
  changed.paths[0].sha256 = "c".repeat(64);
  assert.equal(canReuseCoverageUnit(unit, changed), false);
  assert.equal(canReuseCoverageUnit(unit, { ...request, scope_id: "scope-2" }), true);
  assert.equal(
    canReuseCoverageUnit(unit, { ...request, source_report: "reports/diagnostics/other.md" }),
    false,
  );
  assert.equal(canReuseCoverageUnit(unit, { ...request, subchecks: ["scene-causality"] }), false);
  assert.equal(canReuseCoverageUnit({ ...unit, kind: "synthesis" }, request), false);
  assert.equal(canReuseCoverageUnit({ ...unit, coverage: "partial" }, request), false);
});

test("a living coverage index tracks operation units and honest synthesis coverage", () => {
  const index = {
    schema_version: "1.0.0",
    scope_id: "scope-2",
    entries: [
      {
        operation: "diagnostics",
        units: [{ unit_id: "unit-001", path: "coverage/units/unit-001.json" }],
        synthesis_report: "reports/diagnostics/2026-11-04_synthesis.md",
        synthesis_coverage: "full",
      },
    ],
    updated_at: timestamp,
  };
  assert.equal(validateCoverageIndex(index).valid, true);

  const missingReport = structuredClone(index);
  missingReport.entries[0].synthesis_report = null;
  const result = validateCoverageIndex(missingReport);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "coverage-synthesis"));

  const duplicateOperation = structuredClone(index);
  duplicateOperation.entries.push(structuredClone(index.entries[0]));
  assert.equal(validateCoverageIndex(duplicateOperation).valid, false);
});
