import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

const validator = path.join(root, "scripts", "validate.mjs");
const timestamp = "2026-11-04T00:00:00Z";
const hash = "a".repeat(64);

function runValidator(args) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function artifacts() {
  const source = { path: "manuscript/chapter-001.md", sha256: hash };
  return {
    batch: {
      schema_version: "1.0.0",
      batch_id: "batch-001",
      operation: "chapter-creation",
      source_mode: "ai",
      status: "proposed",
      scope_id: "scope-1",
      plan: {
        summary: "Draft the chapter.",
        context: [],
        dependency_fingerprint: hash,
      },
      files: [
        {
          path: source.path,
          action: "create",
          input_sha256: null,
          output_sha256: null,
          status: "pending",
        },
      ],
      story_state: [],
      approvals: [],
      commit: null,
      next_action: "Approve the plan.",
      created_at: timestamp,
      updated_at: timestamp,
    },
    commit: {
      schema_version: "1.0.0",
      batch_id: "batch-001",
      commit_id: "commit-001",
      status: "prepared",
      scope_before_id: "scope-1",
      scope_after_id: "scope-1",
      files: [
        {
          path: source.path,
          action: "create",
          input_sha256: null,
          output_sha256: null,
          backup_id: null,
          status: "pending",
        },
      ],
      created_at: timestamp,
      updated_at: timestamp,
    },
    unit: {
      schema_version: "1.0.0",
      unit_id: "unit-001",
      source_report: "reports/diagnostics/chapter-001.md",
      source_report_sha256: hash,
      scope_id: "scope-1",
      operation: "diagnostics",
      kind: "local",
      paths: [source],
      subchecks: ["scene-causality"],
      dependencies: [],
      dependency_exception: null,
      coverage: "full",
      created_at: timestamp,
    },
    index: {
      schema_version: "1.0.0",
      scope_id: "scope-1",
      scope_fingerprint: hash,
      requested_pass: {
        pass_id: "pass-001",
        pass_fingerprint: hash,
        path: ".author-toolkit/convergence/passes/pass-001.json",
        sha256: hash,
      },
      entries: [],
      updated_at: timestamp,
    },
    job: {
      schema_version: "1.0.0",
      job_id: "review-001",
      mode: "current-scope",
      perspective: "intent",
      scope_id: "scope-1",
      status: "prepared",
      coverage: "partial",
      files: [{ ...source, line_count: 1 }],
      chunks: [
        {
          chunk_id: "chunk-001",
          sequence: 1,
          status: "pending",
          sources: [{ ...source, line_start: 1, line_end: 1 }],
          report: null,
        },
      ],
      volumes: [
        {
          volume_id: "volume-001",
          chunk_ids: ["chunk-001"],
          status: "pending",
          report: null,
        },
      ],
      book: { volume_ids: ["volume-001"], status: "pending", report: null },
      context_budget: { profile: "standard", estimate_tokens: 1000 },
      next_chunk_id: "chunk-001",
      reviewer_state_path: ".author-toolkit/sessions/review-001-reader.md",
      created_at: timestamp,
      updated_at: timestamp,
    },
    reader: {
      schema_version: "1.0.0",
      state_id: "reader-001",
      job_id: "review-001",
      scope_id: "scope-1",
      perspective: "intent",
      status: "in_progress",
      next_sequence: 1,
      chunks: [],
      summary: "",
      open_questions: [],
      updated_at: timestamp,
    },
    story: {
      schema_version: "1.0.0",
      state_id: "chapter-001",
      level: "chapter",
      scope_id: "scope-1",
      updated_at: timestamp,
      sources: [source],
      summary: "Ning enters the city.",
      records: [],
      children: [],
    },
  };
}

async function temporaryDirectory(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(path.join(output, "cli-artifacts-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function writeJson(directory, name, value) {
  const file = path.join(directory, name);
  await writeFile(file, JSON.stringify(value), "utf8");
  return file;
}

test("the public CLI accepts repeated options for every new artifact", async (t) => {
  const directory = await temporaryDirectory(t);
  const values = artifacts();
  const files = {};
  for (const name of ["batch", "commit", "unit", "index", "job", "story"]) {
    files[name] = await writeJson(directory, `${name}.json`, values[name]);
  }
  files.reader = path.join(directory, "reader.md");
  await writeFile(
    files.reader,
    `# Reader state\n\n\`\`\`json\n${JSON.stringify(values.reader, null, 2)}\n\`\`\`\n`,
    "utf8",
  );

  const result = runValidator([
    "--creation-batch",
    files.batch,
    "--creation-batch",
    files.batch,
    "--creation-commit",
    files.commit,
    "--coverage-unit",
    files.unit,
    "--coverage-index",
    files.index,
    "--review-job",
    files.job,
    "--reader-state",
    files.reader,
    "--story-state",
    files.story,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /8 checks, 0 failures/);
});

test("artifact validation failures exit 1 and argument errors exit 2", async (t) => {
  const directory = await temporaryDirectory(t);
  const commit = artifacts().commit;
  commit.status = "committed";
  commit.files[0].status = "written";
  commit.files[0].output_sha256 = "b".repeat(64);
  const file = await writeJson(directory, "commit.json", commit);

  const invalid = runValidator(["--creation-commit", file]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /every file to be verified/);
  assert.equal(runValidator(["--coverage-unit"]).status, 2);
  assert.equal(runValidator(["--unknown", file]).status, 2);
});
