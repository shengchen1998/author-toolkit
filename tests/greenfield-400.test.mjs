import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { extractReportEnvelope } from "../scripts/lib/index.mjs";
import { readReport, root } from "./helpers.mjs";

const sourceProjectCli = path.join(root, "scripts", "author-project.mjs");

async function snapshotTree(directory) {
  const snapshot = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relativePath = path.relative(directory, file);
    snapshot[relativePath] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  return snapshot;
}

test("init rejects every old manifest without changing old project state", async (t) => {
  for (const schemaVersion of ["2.0.0", "3.0.0", "3.1.0", "3.2.0"]) {
    await t.test(schemaVersion, async (t) => {
      const output = path.join(root, ".test-output");
      await mkdir(output, { recursive: true });
      const projectRoot = await mkdtemp(path.join(output, "greenfield-init-"));
      t.after(() => rm(projectRoot, { recursive: true, force: true }));
      await mkdir(path.join(projectRoot, "manuscript"), { recursive: true });
      await mkdir(path.join(projectRoot, ".author-toolkit", "references"), { recursive: true });
      await writeFile(
        path.join(projectRoot, ".author-toolkit", "project.json"),
        `${JSON.stringify({ schema_version: schemaVersion }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        path.join(projectRoot, ".author-toolkit", "references", "terminology.md"),
        "old deployed reference\n",
        "utf8",
      );
      await writeFile(path.join(projectRoot, "manuscript", "chapter.md"), "# Chapter\n", "utf8");
      const before = await snapshotTree(projectRoot);

      const result = spawnSync(process.execPath, [
        sourceProjectCli,
        "init",
        "--project-root",
        projectRoot,
        "--language",
        "en",
      ], { cwd: root, encoding: "utf8" });

      assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
      const response = JSON.parse(result.stdout);
      assert.equal(response.valid, false);
      assert.equal(response.result.initialized, false);
      assert.equal(response.errors[0].code, "greenfield-initialization-required");
      assert.match(response.errors[0].message, /4\.0\.0/);
      assert.match(response.errors[0].message, /manuscript-only/i);
      assert.match(response.errors[0].message, /new project/i);
      assert.match(response.errors[0].message, /shared state/i);
      assert.deepEqual(await snapshotTree(projectRoot), before);
    });
  }
});

test("read, status, and project validation diagnose old state before missing references", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "greenfield-read-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, ".author-toolkit"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    `${JSON.stringify({ schema_version: "3.2.0" }, null, 2)}\n`,
    "utf8",
  );
  const before = await snapshotTree(projectRoot);

  for (const command of ["read", "status"]) {
    const result = spawnSync(process.execPath, [
      sourceProjectCli,
      command,
      "--project-root",
      projectRoot,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1, `${command}: ${result.stdout}\n${result.stderr}`);
    const response = JSON.parse(result.stdout);
    assert.equal(response.valid, false, command);
    assert.equal(response.errors[0].code, "greenfield-initialization-required", command);
    assert.match(response.errors[0].message, /manuscript-only/i, command);
  }

  const validation = spawnSync(process.execPath, [
    path.join(root, "scripts", "validate.mjs"),
    "--project-root",
    projectRoot,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(validation.status, 1, `${validation.stdout}\n${validation.stderr}`);
  assert.match(`${validation.stdout}\n${validation.stderr}`, /greenfield-initialization-required/);
  assert.match(`${validation.stdout}\n${validation.stderr}`, /manuscript-only/i);
  assert.deepEqual(await snapshotTree(projectRoot), before);
});

test("report v2 rejects legacy schema-only evidence but accepts current identities", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "greenfield-report-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const original = await readReport("en");
  const legacyEnvelope = extractReportEnvelope(original);
  delete legacyEnvelope.scope_id;
  delete legacyEnvelope.scope_fingerprint;
  delete legacyEnvelope.requested_pass;
  const legacyPath = path.join(temporary, "legacy-report.md");
  await writeFile(
    legacyPath,
    original.replace(
      /```json\n[\s\S]*?\n```/,
      `\`\`\`json\n${JSON.stringify(legacyEnvelope, null, 2)}\n\`\`\``,
    ),
    "utf8",
  );
  const validator = path.join(root, "scripts", "validate.mjs");

  const legacy = spawnSync(process.execPath, [validator, "--report", legacyPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(legacy.status, 1, `${legacy.stdout}\n${legacy.stderr}`);
  assert.match(`${legacy.stdout}\n${legacy.stderr}`, /greenfield-initialization-required/);
  assert.match(`${legacy.stdout}\n${legacy.stderr}`, /manuscript-only/i);

  const envelope = extractReportEnvelope(original);
  envelope.scope_id = "fixture-scope-en";
  envelope.scope_fingerprint = "a".repeat(64);
  envelope.requested_pass = {
    pass_id: "fixture-pass-en",
    pass_fingerprint: "b".repeat(64),
    path: ".author-toolkit/convergence/passes/fixture-pass-en.json",
    sha256: "c".repeat(64),
  };
  const currentPath = path.join(temporary, "current-report.md");
  await writeFile(
    currentPath,
    original.replace(
      /```json\n[\s\S]*?\n```/,
      `\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\``,
    ),
    "utf8",
  );
  const current = spawnSync(process.execPath, [validator, "--report", currentPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(current.status, 0, `${current.stdout}\n${current.stderr}`);
});

test("coverage artifacts require current hashes and preserve null synthesis", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "greenfield-coverage-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const validator = path.join(root, "scripts", "validate.mjs");
  const requestedPass = {
    pass_id: "fixture-pass-en",
    pass_fingerprint: "b".repeat(64),
    path: ".author-toolkit/convergence/passes/fixture-pass-en.json",
    sha256: "c".repeat(64),
  };
  const unit = {
    schema_version: "1.0.0",
    unit_id: "unit-current",
    source_report: "reports/diagnostics/current.md",
    source_report_sha256: "d".repeat(64),
    scope_id: "scope-current",
    operation: "diagnostics",
    kind: "local",
    paths: [{ path: "manuscript/chapter.md", sha256: "e".repeat(64) }],
    subchecks: ["causality"],
    dependencies: [],
    dependency_exception: null,
    coverage: "full",
    created_at: "2026-11-05T00:00:00Z",
  };
  const index = {
    schema_version: "1.0.0",
    scope_id: "scope-current",
    scope_fingerprint: "a".repeat(64),
    requested_pass: requestedPass,
    entries: [{
      operation: "diagnostics",
      units: [{ unit_id: "unit-current", path: "reports/coverage/current.json", sha256: "f".repeat(64) }],
      synthesis_report: null,
      synthesis_coverage: null,
    }],
    updated_at: "2026-11-05T00:00:00Z",
  };

  async function validateJson(name, option, value) {
    const file = path.join(temporary, `${name}.json`);
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return spawnSync(process.execPath, [validator, option, file], {
      cwd: root,
      encoding: "utf8",
    });
  }

  for (const [name, option, value] of [
    ["current-unit", "--coverage-unit", unit],
    ["current-index", "--coverage-index", index],
  ]) {
    const current = await validateJson(name, option, value);
    assert.equal(current.status, 0, `${name}: ${current.stdout}\n${current.stderr}`);
  }

  const legacyUnit = structuredClone(unit);
  delete legacyUnit.source_report_sha256;
  const oldUnit = await validateJson("legacy-unit", "--coverage-unit", legacyUnit);
  assert.equal(oldUnit.status, 1);
  assert.match(`${oldUnit.stdout}\n${oldUnit.stderr}`, /greenfield-initialization-required/);
  assert.match(`${oldUnit.stdout}\n${oldUnit.stderr}`, /manuscript-only/i);

  const legacyIndexes = [];
  const missingPass = structuredClone(index);
  delete missingPass.requested_pass;
  legacyIndexes.push(missingPass);
  const missingUnitHash = structuredClone(index);
  delete missingUnitHash.entries[0].units[0].sha256;
  legacyIndexes.push(missingUnitHash);
  const missingSynthesisHash = structuredClone(index);
  missingSynthesisHash.entries[0].synthesis_report = "reports/diagnostics/synthesis.md";
  missingSynthesisHash.entries[0].synthesis_coverage = "full";
  legacyIndexes.push(missingSynthesisHash);
  for (const [position, value] of legacyIndexes.entries()) {
    const result = await validateJson(`legacy-index-${position}`, "--coverage-index", value);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /greenfield-initialization-required/);
  }
});

test("isolated installed init rejects every old manifest without writes", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "greenfield-installed-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const assets = path.join(temporary, "installed-skill", "assets");
  await cp(path.join(root, "skills", "setup-author-toolkit", "assets"), assets, {
    recursive: true,
  });
  const cli = path.join(assets, "runtime", "author-project.mjs");

  for (const schemaVersion of ["2.0.0", "3.0.0", "3.1.0", "3.2.0"]) {
    const projectRoot = path.join(temporary, `project-${schemaVersion}`);
    await mkdir(path.join(projectRoot, ".author-toolkit"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".author-toolkit", "project.json"),
      `${JSON.stringify({ schema_version: schemaVersion }, null, 2)}\n`,
      "utf8",
    );
    const before = await snapshotTree(projectRoot);
    const result = spawnSync(process.execPath, [
      cli,
      "init",
      "--project-root",
      projectRoot,
      "--language",
      "en",
    ], { cwd: temporary, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
    assert.equal(result.status, 1, `${schemaVersion}: ${result.stdout}\n${result.stderr}`);
    const response = JSON.parse(result.stdout);
    assert.equal(response.errors[0].code, "greenfield-initialization-required", schemaVersion);
    assert.match(response.errors[0].message, /manuscript-only/i, schemaVersion);
    assert.deepEqual(await snapshotTree(projectRoot), before, schemaVersion);
  }
});
