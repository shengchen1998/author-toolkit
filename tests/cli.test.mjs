import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

test("the CLI prints help without implicit state and validates the repository only in explicit mode", () => {
  const help = runValidator();
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);
  assert.doesNotMatch(help.stdout, /checks, [0-9]+ failures/);

  const result = runValidator(["--repository"]);
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.valid, true);
  assert.equal(response.result.checks, 11);
  assert.deepEqual(response.errors, []);
  assert.match(result.stdout, /fiction-revision-en\/reports\/structure/);
  assert.match(result.stdout, /fiction-revision-zh\/reports\/structure/);
});

test("the CLI rejects ambiguous validation-mode combinations as usage errors", () => {
  for (const args of [
    ["--repository", "--project-root", root],
    ["--repository", "--manifest", path.join(root, "package.json")],
    ["--project-root", root, "--manifest", path.join(root, "package.json")],
  ]) {
    const result = runValidator(args);
    assert.equal(result.status, 2, args.join(" "));
    const response = JSON.parse(result.stdout);
    assert.equal(response.valid, false);
    assert.equal(response.result, null);
    assert.equal(response.errors[0].code, "usage-error");
  }
});

test("project-root mode validates only the selected project", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "project-cli-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });

  const projectRoot = path.join(temporary, "project");
  await cp(path.join(root, "examples", "fiction-revision-en"), projectRoot, {
    recursive: true,
  });
  await cp(
    path.join(root, "skills", "setup-author-toolkit", "assets", "references"),
    path.join(projectRoot, ".author-toolkit", "references"),
    { recursive: true },
  );
  const result = runValidator(["--project-root", projectRoot]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.author-toolkit\/project\.json#files/);
  assert.doesNotMatch(result.stdout, /fiction-revision-zh/);
});

test("project-root mode reports missing deployed shared references", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "references-cli-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });

  const projectRoot = path.join(temporary, "project");
  await cp(path.join(root, "examples", "fiction-revision-en"), projectRoot, {
    recursive: true,
  });
  const result = runValidator(["--project-root", projectRoot]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /missing shared reference/i);
  assert.match(result.stdout, /terminology\.md/);
  assert.match(result.stdout, /setup-author-toolkit/);
});

test("project-root mode reports shared-reference hash conflicts with both hashes", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "reference-conflict-cli-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });

  const projectRoot = path.join(temporary, "project");
  const packagedReferences = path.join(
    root,
    "skills",
    "setup-author-toolkit",
    "assets",
    "references",
  );
  await cp(path.join(root, "examples", "fiction-revision-en"), projectRoot, {
    recursive: true,
  });
  await cp(packagedReferences, path.join(projectRoot, ".author-toolkit", "references"), {
    recursive: true,
  });
  const changed = "locally changed reference\n";
  await writeFile(
    path.join(projectRoot, ".author-toolkit", "references", "terminology.md"),
    changed,
    "utf8",
  );

  const result = runValidator(["--project-root", projectRoot]);
  const expected = createHash("sha256")
    .update(await readFile(path.join(packagedReferences, "terminology.md")))
    .digest("hex");
  const actual = createHash("sha256").update(changed).digest("hex");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /reference-version-conflict/);
  assert.ok(result.stdout.includes(expected), "diagnostic includes the packaged hash");
  assert.ok(result.stdout.includes(actual), "diagnostic includes the deployed hash");
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
  assert.match(badManifest.stdout, /"valid": false/);
  assert.match(badManifest.stdout, /\/paths\/reports/);

  const reportPath = path.join(temporary, "report.md");
  await writeFile(reportPath, "# A report without an envelope\n", "utf8");
  const badReport = runValidator(["--report", reportPath]);
  assert.equal(badReport.status, 1);
  assert.match(badReport.stdout, /found none/);

  const standalonePath = path.join(temporary, "standalone.json");
  await writeFile(
    standalonePath,
    JSON.stringify({ schema_version: "1.0", project_type: "narrative-nonfiction" }),
    "utf8",
  );
  const standalone = runValidator(["--manifest", standalonePath]);
  assert.equal(standalone.status, 1);
  assert.match(standalone.stdout, /greenfield-initialization-required/);
  assert.match(standalone.stdout, /manuscript-only/);
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
  assert.match(invalid.stdout, /scope_id/);

  envelope.engine.notes +=
    " scope_id=scope-current operation_coverage=full subchecks=scene-causality,chapter-transitions";
  await writeFile(reportPath, render(), "utf8");
  const valid = runValidator(["--report", reportPath]);
  assert.equal(valid.status, 0, valid.stderr);
  const response = JSON.parse(valid.stdout);
  assert.equal(response.valid, true);
  assert.equal(response.result.checks, 1);
  assert.deepEqual(response.errors, []);
});
