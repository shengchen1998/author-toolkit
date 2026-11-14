import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createEvidenceFixture } from "./evidence-fixture.mjs";
import { exampleRoot, root } from "./helpers.mjs";

const scopeId = "scope-example-revision";
const timestamp = "2026-11-15T00:00:00Z";

function run(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "check.mjs"), ...args], { cwd: root, encoding: "utf8" });
}

async function writeJson(projectRoot, relativePath, value) {
  await writeFile(path.join(projectRoot, relativePath), JSON.stringify(value));
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "evidence-inspection-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  return createEvidenceFixture(exampleRoot("en"), path.join(root, "skills/setup-author-toolkit/assets"), path.join(temporary, "project"));
}

test("full check combines current evidence, reader state, and strict execution without writes", async (t) => {
  const { projectRoot, manifest } = await fixture(t);
  const cache = path.join(projectRoot, "PROJECT_STATE.md");
  const ordinary = run(["--project-root", projectRoot]);
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.match(ordinary.stdout, /Operation-specific evidence: not evaluated/);
  assert.doesNotMatch(ordinary.stdout, /Evidence validation:/);
  await assert.rejects(readFile(cache), { code: "ENOENT" });

  const result = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.setup.strategy_gate, "passed");
  assert.deepEqual(parsed.execution_gate, { scope_id: scopeId, unverified_count: 0, valid: true });
  assert.equal(parsed.evidence.scope_id, scopeId);
  assert.equal(parsed.evidence.selection.latest_reports_by_stage_and_audit, 3);
  assert.equal(parsed.evidence.selection.review_jobs, 3);
  assert.equal(parsed.evidence.selection.linked_reports, 3);
  assert.equal(parsed.evidence.valid, true);
  assert.equal(parsed.evidence.checks.length, 15);
  assert.ok(parsed.evidence.checks.some((check) => check.path === ".author-toolkit/reviews/reader-fresh-r2.json"));
  assert.ok(parsed.evidence.checks.every((check) => !check.path.includes("-r1.md")));
  await assert.rejects(readFile(cache), { code: "ENOENT" });

  const text = run(["--project-root", projectRoot, "--full"]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Execution gate: passed/);
  assert.match(text.stdout, /Evidence validation: 15 checks, 0 failures/);
  assert.match(text.stdout, /currency and operation gates not evaluated/);
  assert.match(text.stdout, /Preflight: passed/);

  const tracker = await readFile(path.join(projectRoot, manifest.paths.audit_tracker), "utf8");
  const table = "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|";
  await writeFile(path.join(projectRoot, manifest.paths.audit_tracker), tracker.replace(table, `${table}\n| EDIT-001 | edit | chapter-revision | ${scopeId} | \`manuscript/chapter-01.md\` | approved | Exact test batch. | ${timestamp} |`));
  const strict = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(strict.status, 1);
  assert.equal(JSON.parse(strict.stdout).evidence.valid, true, strict.stdout || strict.stderr);
  assert.equal(JSON.parse(strict.stdout).execution_gate.valid, false);
  assert.match(run(["--project-root", projectRoot, "--full"]).stdout, /Preflight: failed/);
});

test("full check fails on selected evidence and ignores superseded report damage", async (t) => {
  const { projectRoot } = await fixture(t);
  const oldReport = path.join(projectRoot, "reports/current-scope-review/intent-r1.md");
  await writeFile(oldReport, "historical report with no envelope\n");
  const valid = run(["--project-root", projectRoot, "--full"]);
  assert.equal(valid.status, 0, valid.stderr);

  const currentReport = path.join(projectRoot, "reports/current-scope-review/intent-r2.md");
  const original = await readFile(currentReport, "utf8");
  await writeFile(currentReport, original.replace('"findings": []', '"engine_notes_removed": true'));
  const invalid = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(invalid.status, 1);
  const parsed = JSON.parse(invalid.stdout);
  assert.equal(parsed.valid, false);
  assert.equal(parsed.validation.valid, true);
  assert.equal(parsed.execution_gate.valid, true);
  assert.equal(parsed.evidence.valid, false);
  assert.ok(parsed.evidence.checks.some((check) => check.path === "reports/current-scope-review/intent-r2.md" && !check.valid));
  await writeFile(currentReport, original);

  const reader = path.join(projectRoot, ".author-toolkit/reviews/reader-fresh-r2.json");
  await rm(reader);
  const noReader = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(noReader.status, 1);
  assert.ok(JSON.parse(noReader.stdout).evidence.checks.some((check) => check.path === ".author-toolkit/reviews/reader-fresh-r2.json" && !check.valid));
  const freshJob = JSON.parse(await readFile(path.join(projectRoot, ".author-toolkit/reviews/review-fresh-r2.json"), "utf8"));
  await writeJson(projectRoot, ".author-toolkit/reviews/reader-fresh-r2.json", {
    schema_version: "1.0.0",
    state_id: "reader-fresh-r2",
    job_id: freshJob.job_id,
    scope_id: scopeId,
    perspective: "fresh",
    status: "complete",
    next_sequence: 2,
    chunks: [{ chunk_id: freshJob.chunks[0].chunk_id, sequence: 1, sources: freshJob.chunks[0].sources, report: freshJob.chunks[0].report }],
    summary: "Read the complete chapter.",
    open_questions: [],
    updated_at: freshJob.updated_at,
  });

  const unit = path.join(projectRoot, "reports/coverage/unit-intent-r2.json");
  const originalUnit = JSON.parse(await readFile(unit, "utf8"));
  await writeJson(projectRoot, "reports/coverage/unit-intent-r2.json", { ...originalUnit, scope_id: "scope-old" });
  const wrongScope = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(wrongScope.status, 1);
  assert.ok(JSON.parse(wrongScope.stdout).evidence.checks.some((check) => check.path === "reports/coverage/unit-intent-r2.json#identity" && !check.valid));
  await writeJson(projectRoot, "reports/coverage/unit-intent-r2.json", originalUnit);

  const duplicate = JSON.parse(await readFile(path.join(projectRoot, "reports/coverage-index.json"), "utf8"));
  duplicate.entries[0].units[1].unit_id = duplicate.entries[0].units[0].unit_id;
  await writeJson(projectRoot, "reports/coverage-index.json", duplicate);
  const duplicateUnit = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(duplicateUnit.status, 1);
  assert.ok(JSON.parse(duplicateUnit.stdout).evidence.checks.some((check) => check.path === "reports/coverage-index.json#unit-0-1" && !check.valid));
  duplicate.entries[0].units[1].unit_id = "unit-standards-r2";
  await writeJson(projectRoot, "reports/coverage-index.json", duplicate);

  const jobPath = path.join(projectRoot, ".author-toolkit/reviews/review-intent-r2.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.chunks[0].report = "reports/current-scope-review/intent-r2.md";
  job.volumes[0].report = "reports/current-scope-review/intent-r2.md";
  job.book.report = "reports/current-scope-review/intent-r2.md";
  await writeJson(projectRoot, ".author-toolkit/reviews/review-intent-r2.json", { ...job, updated_at: "2026-11-15T03:00:00Z" });
  const newJob = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(newJob.status, 0, newJob.stderr);
  assert.ok(JSON.parse(newJob.stdout).evidence.checks.some((check) => check.path === ".author-toolkit/reviews/review-intent-r2.json" && check.valid));
  assert.ok(JSON.parse(newJob.stdout).evidence.checks.every((check) => check.path !== ".author-toolkit/reviews/review-intent-r1.json"));

  const brief = path.join(projectRoot, "reports/review_brief.md");
  await writeFile(brief, (await readFile(brief, "utf8")).replace("Author retained the structural choice.", "Different reason."));
  assert.equal(run(["--project-root", projectRoot, "--full"]).status, 1);
});

test("full check discovers reader state in registered sessions and rejects invalid options", async (t) => {
  const { projectRoot, manifest } = await fixture(t);
  const jobPath = path.join(projectRoot, ".author-toolkit/reviews/review-fresh-r2.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const oldReader = await readFile(path.join(projectRoot, job.reviewer_state_path), "utf8");
  job.reviewer_state_path = `${manifest.paths.sessions}reader-fresh-r2.md`;
  await writeJson(projectRoot, ".author-toolkit/reviews/review-fresh-r2.json", job);
  await writeFile(path.join(projectRoot, job.reviewer_state_path), `# Reader state\n\n\`\`\`json\n${oldReader.trim()}\n\`\`\`\n`);
  const result = run(["--project-root", projectRoot, "--full"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Evidence validation: 15 checks, 0 failures/);

  for (const args of [
    ["--project-root", projectRoot, "--full", "--digest"],
    ["--project-root", projectRoot, "--full", "--require-execution"],
  ]) {
    const invalid = run(args);
    if (args.includes("--digest")) {
      assert.equal(invalid.status, 2);
      assert.match(invalid.stderr, /--full cannot be combined with --digest/);
    } else {
      assert.equal(invalid.status, 0, invalid.stderr);
    }
  }
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--full/);

  const noScope = structuredClone(manifest);
  delete noScope.current_scope;
  await writeJson(projectRoot, ".author-toolkit/project.json", noScope);
  const missing = run(["--project-root", projectRoot, "--full", "--json"]);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).evidence.checks[0].path, "evidence/scope");
});
