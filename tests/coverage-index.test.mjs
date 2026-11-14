import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createEvidenceFixture, evidenceScopeId } from "./evidence-fixture.mjs";
import { exampleRoot, root } from "./helpers.mjs";

const timestamp = "2026-11-15T04:00:00Z";

function run(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "coverage-index.mjs"), ...args], { encoding: "utf8" });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporary = await mkdtemp(path.join(root, ".test-output", "coverage-index-cli-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const created = await createEvidenceFixture(
    exampleRoot("en"),
    path.join(root, "skills/setup-author-toolkit/assets"),
    path.join(temporary, "project"),
  );
  return { ...created, manifestPath: path.join(created.projectRoot, ".author-toolkit", "project.json") };
}

async function writeJson(projectRoot, relativePath, value) {
  await writeFile(path.join(projectRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function entry(projectRoot, manifest, operation = "prose") {
  const unitId = `unit-${operation}-r3`;
  const reportPath = `reports/${operation}/${operation}-r3.md`;
  const source = await readFile(path.join(projectRoot, "reports/current-scope-review/intent-r2.md"), "utf8");
  const report = source
    .replaceAll("REPORT-INTENT-R2", `REPORT-${operation.toUpperCase()}-R3`)
    .replace('"stage": "current-scope-review"', `"stage": "${operation}"`);
  await mkdir(path.dirname(path.join(projectRoot, reportPath)), { recursive: true });
  await writeFile(path.join(projectRoot, reportPath), report);
  const unitPath = `reports/coverage/${unitId}.json`;
  await writeJson(projectRoot, unitPath, {
    schema_version: "1.0.0",
    unit_id: unitId,
    source_report: reportPath,
    scope_id: evidenceScopeId,
    operation,
    kind: "local",
    paths: [{ path: "manuscript/chapter-01.md", sha256: manifest.current_scope.files[0].sha256 }],
    subchecks: ["sentences"],
    dependencies: [],
    coverage: "full",
    created_at: timestamp,
  });
  const value = {
    operation,
    units: [{ unit_id: unitId, path: unitPath }],
    synthesis_report: reportPath,
    synthesis_coverage: "full",
  };
  await writeJson(projectRoot, `.author-toolkit/${operation}-entry.json`, value);
  return { file: `.author-toolkit/${operation}-entry.json`, value, unitPath, reportPath };
}

test("coverage index CLI registers and replaces complete operation entries atomically", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const prose = await entry(projectRoot, manifest);
  const result = run(["--manifest", manifestPath, "--entry", prose.file, "--updated-at", timestamp, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    valid: true,
    path: "reports/coverage-index.json",
    operation: "prose",
    scope_id: evidenceScopeId,
    unit_count: 1,
    synthesis_report: prose.reportPath,
    synthesis_coverage: "full",
    operation_count: 2,
    updated_at: timestamp,
  });
  const indexPath = path.join(projectRoot, "reports/coverage-index.json");
  const first = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(first.entries[0].operation, "current-scope-review");
  assert.deepEqual(first.entries[1], prose.value);

  const ai = await entry(projectRoot, manifest, "ai-cleanup");
  const second = run(["--manifest", manifestPath, "--entry", ai.file, "--updated-at", "2026-11-15T05:00:00Z"]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /operation: ai-cleanup; units: 1; synthesis: full/);

  const replacement = { ...prose.value, synthesis_coverage: "partial" };
  await writeJson(projectRoot, prose.file, replacement);
  assert.equal(run(["--manifest", manifestPath, "--entry", prose.file, "--updated-at", "2026-11-15T06:00:00Z"]).status, 0);
  const final = JSON.parse(await readFile(indexPath, "utf8"));
  assert.equal(final.entries.length, 3);
  assert.deepEqual(final.entries.filter((item) => item.operation === "prose"), [replacement]);
  assert.deepEqual(final.entries.find((item) => item.operation === "ai-cleanup"), ai.value);
});

test("coverage index CLI rejects an operations field without modifying the index", async (t) => {
  const { projectRoot, manifestPath } = await fixture(t);
  const indexPath = path.join(projectRoot, "reports/coverage-index.json");
  const original = await readFile(indexPath, "utf8");
  await writeJson(projectRoot, ".author-toolkit/invalid-entry.json", {
    operations: [{ operation: "prose", units: [], synthesis_report: null, synthesis_coverage: null }],
  });
  const result = run(["--manifest", manifestPath, "--entry", ".author-toolkit/invalid-entry.json", "--json"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must have required property 'operation'/);
  assert.match(result.stderr, /must NOT have additional properties/);
  assert.equal(await readFile(indexPath, "utf8"), original);
});

test("coverage index CLI rejects mismatched identities, synthesis units, and missing reports", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const prose = await entry(projectRoot, manifest);
  const indexPath = path.join(projectRoot, "reports/coverage-index.json");
  const original = await readFile(indexPath, "utf8");
  const unit = JSON.parse(await readFile(path.join(projectRoot, prose.unitPath), "utf8"));
  for (const [label, mutate] of [
    ["wrong scope", (value) => { value.scope_id = "scope-historical"; }],
    ["wrong operation", (value) => { value.operation = "current-scope-review"; }],
    ["synthesis unit", (value) => { value.kind = "synthesis"; }],
    ["partial unit", (value) => { value.coverage = "partial"; }],
  ]) {
    await writeJson(projectRoot, prose.unitPath, mutate(structuredClone(unit)));
    const result = run(["--manifest", manifestPath, "--entry", prose.file]);
    assert.equal(result.status, 1, `${label}: ${result.stderr}`);
    assert.equal(await readFile(indexPath, "utf8"), original);
  }
  await writeJson(projectRoot, prose.unitPath, unit);
  await rm(path.join(projectRoot, prose.reportPath));
  assert.match(run(["--manifest", manifestPath, "--entry", prose.file]).stderr, /cannot read coverage source report/);
  assert.equal(await readFile(indexPath, "utf8"), original);
});

test("coverage index CLI confines references to reports and honors the shared lock", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const prose = await entry(projectRoot, manifest);
  prose.value.units[0].path = ".author-toolkit/unit.json";
  await writeJson(projectRoot, prose.file, prose.value);
  const outside = run(["--manifest", manifestPath, "--entry", prose.file]);
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /beneath the registered reports path/);

  prose.value.units[0].path = prose.unitPath;
  await writeJson(projectRoot, prose.file, prose.value);
  const lock = path.join(projectRoot, manifest.paths.backups, ".writes.lock");
  await writeFile(lock, "test\n");
  const locked = run(["--manifest", manifestPath, "--entry", prose.file]);
  assert.equal(locked.status, 1);
  assert.match(locked.stderr, /another project write is active/);
  await rm(lock);

  const linked = path.join(projectRoot, "linked-project");
  await symlink(projectRoot, linked);
  assert.equal(run(["--manifest", path.join(linked, ".author-toolkit/project.json"), "--entry", prose.file, "--json"]).status, 0);
});

test("coverage index CLI reports argument errors and missing scopes without writes", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const prose = await entry(projectRoot, manifest);
  assert.equal(run(["--help"]).status, 0);
  for (const args of [[], ["--manifest", manifestPath], ["--manifest", manifestPath, "--entry", prose.file, "--updated-at", "bad"]]) {
    assert.equal(run(args).status, 2);
  }
  const proposed = structuredClone(manifest);
  proposed.current_scope.status = "proposed";
  await writeJson(projectRoot, ".author-toolkit/project.json", proposed);
  const result = run(["--manifest", manifestPath, "--entry", prose.file]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /confirmed current scope/);
  await assert.rejects(readFile(path.join(projectRoot, "reports/prose-entry.json")), { code: "ENOENT" });
});

test("coverage index CLI preserves reusable original-scope units", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const prose = await entry(projectRoot, manifest);
  const unit = JSON.parse(await readFile(path.join(projectRoot, prose.unitPath), "utf8"));
  unit.scope_id = "scope-original";
  await writeJson(projectRoot, prose.unitPath, unit);
  unit.source_report = "reports/prose/prose-original-r3.md";
  await writeFile(
    path.join(projectRoot, unit.source_report),
    (await readFile(path.join(projectRoot, prose.reportPath), "utf8")).replace(`scope_id=${evidenceScopeId};`, "scope_id=scope-original;"),
  );
  await writeJson(projectRoot, prose.unitPath, unit);
  const result = run(["--manifest", manifestPath, "--entry", prose.file, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const index = JSON.parse(await readFile(path.join(projectRoot, "reports/coverage-index.json"), "utf8"));
  assert.equal(index.scope_id, evidenceScopeId);
  assert.equal(index.entries.find((item) => item.operation === "prose").units[0].unit_id, prose.value.units[0].unit_id);

  prose.value.operation = "ai-cleanup";
  await writeJson(projectRoot, prose.file, prose.value);
  const mismatch = run(["--manifest", manifestPath, "--entry", prose.file]);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /ID and operation must match/);
});

test("coverage index CLI rejects invalid existing indexes and global duplicate unit IDs", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const prose = await entry(projectRoot, manifest);
  const indexPath = path.join(projectRoot, "reports/coverage-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  await writeJson(projectRoot, "reports/coverage-index.json", { ...index, operations: [] });
  assert.match(run(["--manifest", manifestPath, "--entry", prose.file]).stderr, /existing coverage index is invalid/);
  await writeJson(projectRoot, "reports/coverage-index.json", index);
  const unit = JSON.parse(await readFile(path.join(projectRoot, prose.unitPath), "utf8"));
  unit.unit_id = "unit-intent-r2";
  await writeJson(projectRoot, prose.unitPath, unit);
  const duplicate = run(["--manifest", manifestPath, "--entry", prose.file]);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /referenced more than once/);
});
