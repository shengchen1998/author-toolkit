import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { extractReportEnvelope } from "../scripts/lib/index.mjs";
import { clone, readManifest, readReport, root } from "./helpers.mjs";

const validator = path.join(root, "scripts", "validate.mjs");

function runValidator(args = []) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("the default CLI validates every shipped schema and example", () => {
  const result = runValidator();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /13 checks, 0 failures/);
  assert.match(result.stdout, /fiction-revision-en\/reports\/structure/);
  assert.match(result.stdout, /fiction-revision-zh\/reports\/structure/);
});

test("the CLI exits nonzero for an invalid manifest and invalid Markdown", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "cli-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });

  const manifest = clone(await readManifest());
  manifest.paths.reports = "../outside";
  const manifestPath = path.join(temporary, "project.json");
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

  const badManifest = runValidator(["--manifest", manifestPath]);
  assert.equal(badManifest.status, 1);
  assert.match(badManifest.stderr, /not ok/);
  assert.match(badManifest.stderr, /\/paths\/reports/);

  const reportPath = path.join(temporary, "report.md");
  await writeFile(reportPath, "# A report without an envelope\n", "utf8");
  const badReport = runValidator(["--report", reportPath]);
  assert.equal(badReport.status, 1);
  assert.match(badReport.stderr, /found none/);

  const standalonePath = path.join(temporary, "standalone.json");
  await writeFile(
    standalonePath,
    JSON.stringify({ schema_version: "1.0", project_type: "narrative-nonfiction" }),
    "utf8",
  );
  const standalone = runValidator(["--manifest", standalonePath]);
  assert.equal(standalone.status, 1);
  assert.match(standalone.stderr, /only v3\.1 fiction manifests are supported/);
});

test("the CLI enforces evidence semantics for current-draft operation reports", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "evidence-cli-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });

  const envelope = extractReportEnvelope(await readReport());
  envelope.stage = "diagnostics";
  envelope.engine.notes = "Coverage: full - fixture text; no fallback";
  const reportPath = path.join(temporary, "diagnostics.md");
  const render = () =>
    `# Diagnostics\n\n## Language coverage\n\nfull - fixture text\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;

  await writeFile(reportPath, render(), "utf8");
  const invalid = runValidator(["--report", reportPath]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /scope_id/);

  envelope.engine.notes +=
    " scope_id=scope-current operation_coverage=full subchecks=scene-causality,chapter-transitions";
  await writeFile(reportPath, render(), "utf8");
  const valid = runValidator(["--report", reportPath]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /1 checks, 0 failures/);
});
