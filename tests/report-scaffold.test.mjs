import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  extractReportEnvelope,
  validateEvidenceReport,
  validateMarkdownReport,
} from "../scripts/lib/index.mjs";
import { scaffoldReport } from "../scripts/lib/report-scaffold.mjs";
import { clone, readReport, root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "scaffold-report.mjs");

async function fixture(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(path.join(output, "report-scaffold-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = path.join(directory, "project");
  const example = path.join(root, "examples", "fiction-revision-en");
  await mkdir(project, { recursive: true });
  await Promise.all([
    mkdir(path.join(project, ".author-toolkit"), { recursive: true }),
    mkdir(path.join(project, "reports"), { recursive: true }),
    writeFile(
      path.join(project, ".author-toolkit", "project.json"),
      await readFile(path.join(example, ".author-toolkit", "project.json"), "utf8"),
    ),
  ]);
  const source = extractReportEnvelope(await readReport());
  source.stage = "current-scope-review";
  source.audit = "author-review-standards";
  source.report_id = "REVIEW-SCAFFOLD-001";
  source.created_at = "2026-11-15T00:00:00Z";
  source.findings = [];
  source.engine.notes = "scope_id=scope-example-revision; review_mode=current-scope; operation_coverage=full; subchecks=standards; Language coverage: full (en); unit=chapter-01; parent=none.";
  const body = "# Current-scope review\n\n## Language coverage\n\nfull\n\n## Review coverage\n\nfull: manuscript/chapter-01.md\n";
  const bodyPath = path.join(directory, "body.md");
  const envelopePath = path.join(directory, "envelope.json");
  await Promise.all([
    writeFile(bodyPath, body, "utf8"),
    writeFile(envelopePath, JSON.stringify(source, null, 2), "utf8"),
  ]);
  return { directory, project, source, body, bodyPath, envelopePath };
}

function run(args) {
  return spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: "utf8" });
}

function argumentsFor(fixtureValues, output = "reports/current-scope-review/scaffold.md") {
  return [
    "--manifest",
    path.join(fixtureValues.project, ".author-toolkit", "project.json"),
    "--output",
    output,
    "--body",
    fixtureValues.bodyPath,
    "--envelope",
    fixtureValues.envelopePath,
    "--created-at",
    "2026-11-15T00:00:00Z",
    "--json",
  ];
}

test("scaffold defaults omitted findings and preserves supplied finding v2 objects", async () => {
  const source = extractReportEnvelope(await readReport());
  delete source.created_at;
  delete source.findings;
  const clean = scaffoldReport({ body: "# Report\n\n## Language coverage\n\nfull", envelope: source, createdAt: "2026-11-15T00:00:00Z" });
  assert.deepEqual(clean.envelope.findings, []);
  assert.equal(clean.envelope.created_at, "2026-11-15T00:00:00Z");
  assert.equal(validateMarkdownReport(clean.markdown).valid, true);

  const finding = extractReportEnvelope(await readReport()).findings[0];
  const populated = scaffoldReport({
    body: "# Report\n\n## Language coverage\n\nfull",
    envelope: { ...source, findings: [finding] },
  });
  assert.deepEqual(populated.envelope.findings, [finding]);
  assert.equal(validateMarkdownReport(populated.markdown).valid, true);
  assert.throws(
    () => scaffoldReport({ body: "# Report\n\n## Language coverage\n\nfull", envelope: { ...source, findings: "none" } }),
    /findings must be an array/,
  );
});

test("scaffold CLI preserves valid nonempty findings", async (t) => {
  const values = await fixture(t);
  const finding = extractReportEnvelope(await readReport()).findings[0];
  await writeFile(values.envelopePath, JSON.stringify({ ...values.source, findings: [finding] }), "utf8");
  const result = run(argumentsFor(values).filter((argument) => argument !== "--json"));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /findings: 1/);
  const markdown = await readFile(path.join(values.project, "reports/current-scope-review/scaffold.md"), "utf8");
  assert.deepEqual(extractReportEnvelope(markdown).findings, [finding]);
});

test("scaffold CLI creates a validated clean report with every required field", async (t) => {
  const values = await fixture(t);
  const source = clone(values.source);
  delete source.created_at;
  delete source.findings;
  await writeFile(values.envelopePath, JSON.stringify(source), "utf8");

  const result = run(argumentsFor(values));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true);
  assert.equal(output.finding_count, 0);
  const reportPath = path.join(values.project, output.path);
  const markdown = await readFile(reportPath, "utf8");
  assert.equal(validateEvidenceReport(markdown).valid, true);
  const envelope = extractReportEnvelope(markdown);
  assert.deepEqual(envelope.findings, []);
  assert.equal(envelope.created_at, "2026-11-15T00:00:00Z");
  assert.ok(envelope.inputs.length > 0);
  assert.ok(envelope.engine.notes.includes("subchecks=standards"));
  assert.match(markdown, /## Review coverage/);
});

test("scaffold CLI fails before creating reports with missing evidence fields", async (t) => {
  const values = await fixture(t);
  const source = clone(values.source);
  delete source.findings;
  delete source.inputs;
  source.engine.notes = "identification full";
  await writeFile(values.envelopePath, JSON.stringify(source), "utf8");

  const result = run(argumentsFor(values));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /required property 'inputs'/);
  assert.match(result.stderr, /scope_id/);
  assert.match(result.stderr, /"Language coverage: full"/);
  assert.match(result.stderr, /"coverage=full"/);
  await assert.rejects(readFile(path.join(values.project, "reports/current-scope-review/scaffold.md"), "utf8"), { code: "ENOENT" });
});

test("scaffold CLI rejects invalid supplied findings and preserves an existing destination", async (t) => {
  const values = await fixture(t);
  const destination = path.join(values.project, "reports/current-scope-review/scaffold.md");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, "immutable historical report\n", "utf8");

  const result = run(argumentsFor(values));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /already exists/);
  assert.equal(await readFile(destination, "utf8"), "immutable historical report\n");

  await rm(destination);
  await writeFile(values.envelopePath, JSON.stringify({ ...values.source, findings: [{ id: "STANDARD-001" }] }), "utf8");
  const supplied = run(argumentsFor(values));
  assert.equal(supplied.status, 1, supplied.stdout);
  assert.match(supplied.stderr, /\/findings\/0/);
  await assert.rejects(readFile(destination, "utf8"), { code: "ENOENT" });
});

test("scaffold CLI rejects a conflicting explicit creation timestamp", async (t) => {
  const values = await fixture(t);
  const result = run([
    ...argumentsFor(values).flatMap((argument, index, arguments_) =>
      arguments_[index - 1] === "--created-at" ? ["2026-11-15T01:00:00Z"] : [argument],
    ),
  ]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /conflicts with envelope\.created_at/);
  await assert.rejects(readFile(path.join(values.project, "reports/current-scope-review/scaffold.md"), "utf8"), { code: "ENOENT" });
});

test("scaffold CLI confines reports to the registered path and rejects special files", async (t) => {
  const values = await fixture(t);
  const outside = run(argumentsFor(values, "outside/report.md"));
  assert.equal(outside.status, 1, outside.stdout);
  assert.match(outside.stderr, /registered reports path/);

  const linkedBody = path.join(values.directory, "linked-body.md");
  await symlink(values.bodyPath, linkedBody);
  const result = run([
    ...argumentsFor(values).flatMap((argument) => argument === values.bodyPath ? [linkedBody] : [argument]),
  ]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /regular file/);
});

test("scaffold CLI uses exit 2 for argument errors", async (t) => {
  const values = await fixture(t);
  const result = run([...argumentsFor(values), "--created-at"]);
  assert.equal(result.status, 2, result.stdout);
  assert.match(result.stderr, /unknown or incomplete argument/);
  assert.equal(run(["--help"]).status, 0);
});
