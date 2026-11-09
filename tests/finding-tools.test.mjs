import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  extractReportEnvelope,
  upsertTrackerFindings,
  validateFindingIdentity,
} from "../scripts/lib/index.mjs";
import { readReport, readTracker, root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "findings.mjs");

async function fixture(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(path.join(output, "finding-tools-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const projectRoot = path.join(directory, "project");
  await mkdir(path.join(projectRoot, ".author-toolkit"), { recursive: true });
  await mkdir(path.join(projectRoot, "evidence"), { recursive: true });
  const report = path.join(projectRoot, "evidence", "report.md");
  const original = extractReportEnvelope(await readReport());
  original.engine.notes += " scope_id=scope-fixture operation_coverage=full";
  const source = `# Structure\n\n## Language coverage\n\nfull\n\n\`\`\`json\n${JSON.stringify(original, null, 2)}\n\`\`\`\n`;
  await writeFile(report, source, "utf8");
  await mkdir(path.join(projectRoot, "evidence", "structure"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "evidence", "structure", "old.md"),
    source,
    "utf8",
  );
  const manifest = JSON.parse(await readFile(path.join(root, "skills", "author-project", "assets", "project-template.json"), "utf8"));
  manifest.created_at = "2026-11-09T00:00:00Z";
  manifest.updated_at = manifest.created_at;
  manifest.language = "en";
  manifest.paths.audit_tracker = "state/custom-tracker.md";
  manifest.paths.reports = "evidence";
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await mkdir(path.join(projectRoot, "state"), { recursive: true });
  const tracker = (await readTracker()).replaceAll("`reports/structure/2026-01-17_structure.md`", "`evidence/structure/old.md`");
  const approvals = "## Approvals\n\n| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|\n\n";
  await writeFile(path.join(projectRoot, "state", "custom-tracker.md"), tracker.replace(/(?=## Open questions)/, approvals), "utf8");
  return { directory: projectRoot, manifest, manifestPath, report };
}

function run(args) {
  return spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: "utf8" });
}

function markdown(envelope) {
  return `# Report\n\n## Language coverage\n\nfull\n\n\`\`\`json\n${JSON.stringify(envelope)}\n\`\`\`\n`;
}

test("finding ID allocation skips every occupied number and reserves a whole batch", async (t) => {
  const { directory, manifest, manifestPath, report } = await fixture(t);
  const tracker = await readTracker();
  const rows = Array.from({ length: 9 }, (_, index) =>
    `| STANDARD-${String(index + 1).padStart(3, "0")} | current-scope-review | standards | manuscript/chapter-01.md | open | \`evidence/standard.md\` | 2026-01-17T18:00:00Z | No author decision recorded. |`,
  );
  const withStandards = tracker.replace("\n\n## Audit runs", `\n${rows.join("\n")}\n\n## Audit runs`);
  await writeFile(
    path.join(directory, manifest.paths.audit_tracker),
    withStandards,
    "utf8",
  );

  const result = run([
    "next-finding-id",
    "STANDARD",
    "--manifest",
    manifestPath,
    "--count",
    "35",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const ids = JSON.parse(result.stdout).ids;
  assert.equal(ids.length, 35);
  assert.equal(ids[0], "STANDARD-010");
  assert.equal(ids.at(-1), "STANDARD-044");
  assert.equal(new Set(ids).size, 35);
  const historyOnly = extractReportEnvelope(await readFile(report, "utf8"));
  historyOnly.findings = [{ ...historyOnly.findings[0], id: "STANDARD-100" }];
  await writeFile(path.join(directory, "evidence", "history-only.md"), markdown(historyOnly), "utf8");
  const afterHistory = run(["next-finding-id", "STANDARD", "--manifest", manifestPath, "--count", "2"]);
  assert.equal(afterHistory.status, 0, afterHistory.stderr);
  assert.deepEqual(JSON.parse(afterHistory.stdout).ids, ["STANDARD-101", "STANDARD-102"]);
  const duplicateTracker = (await readFile(path.join(directory, manifest.paths.audit_tracker), "utf8"))
    .replace("| STANDARD-009 |", "| STANDARD-001 |");
  await writeFile(path.join(directory, manifest.paths.audit_tracker), duplicateTracker, "utf8");
  const duplicate = run(["next-finding-id", "STANDARD", "--manifest", manifestPath]);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /duplicate finding ID: STANDARD-001/);
  await writeFile(path.join(directory, manifest.paths.audit_tracker), withStandards, "utf8");
  assert.equal(run(["next-finding-id", "standard", "--manifest", path.join(directory, ".author-toolkit", "project.json")]).status, 2);
  assert.equal(run(["next-finding-id", "STANDARD", "--manifest", path.join(directory, ".author-toolkit", "project.json"), "--count", "0"]).status, 2);
});

test("report validation rejects duplicate IDs and conflicting cross-report identities", async (t) => {
  const { directory, report } = await fixture(t);
  const envelope = extractReportEnvelope(await readFile(report, "utf8"));
  const [first, second] = envelope.findings;
  envelope.findings = [
    { ...first, id: "TELL-002" },
    { ...second, id: "TELL-002" },
  ];
  const duplicate = validateFindingIdentity(envelope);
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.errors[0].message, /duplicate finding ID: TELL-002/);

  const current = { ...envelope, findings: [first] };
  const sameIdentity = {
    ...current,
    report_id: "same-identity",
    findings: [{ ...first, recommendation: "A revised recommendation." }],
  };
  assert.equal(validateFindingIdentity(sameIdentity, [current]).valid, true);

  const conflict = {
    ...current,
    report_id: "different-issue",
    findings: [{ ...first, issue: "A different issue.", technique: "different-technique" }],
  };
  const crossReport = validateFindingIdentity(conflict, [current]);
  assert.equal(crossReport.valid, false);
  assert.match(crossReport.errors[0].message, /conflicting finding identity/);

  const trackerConflict = validateFindingIdentity(current, [current], [
    { id: "STRUCT-001", stage: "structure", audit: "other-audit" },
  ]);
  assert.equal(trackerConflict.valid, false);
  assert.match(trackerConflict.errors[0].message, /conflicts with tracker/);
});

test("CLI cross-report validation rejects conflicting identities without changing reports", async (t) => {
  const { directory, report } = await fixture(t);
  const envelope = extractReportEnvelope(await readFile(report, "utf8"));
  const other = path.join(directory, "evidence", "other.md");
  await writeFile(other, markdown({ ...envelope, findings: [{ ...envelope.findings[0], issue: "A different issue." }] }), "utf8");
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "validate.mjs"), "--report", report, "--report", other], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /conflicting finding identity/);
});

test("batch upsert inserts escaped rows and preserves an existing author decision", async (t) => {
  const { directory, manifest, report } = await fixture(t);
  const envelope = extractReportEnvelope(await readFile(report, "utf8"));
  const [first, second] = envelope.findings;
  envelope.findings = [
    {
      ...first,
      location: { ...first.location, scope: "passage", quote: "中文引用 | `code`" },
      recommendation: "保留 | 管道与中文。",
    },
    second,
  ];
  await writeFile(report, markdown(envelope), "utf8");
  const trackerFile = path.join(directory, manifest.paths.audit_tracker);
  await writeFile(
    trackerFile,
    (await readFile(trackerFile, "utf8")).replace(
      /\| STRUCT-001 \|[^\n]+/,
      "| STRUCT-001 | structure | story-structure-audit | `manuscript/chapter-02.md`, chapter 2 | dismissed | `evidence/structure/old.md` | 2026-01-17T18:00:00Z | Author intentionally kept the scene. |",
    ),
    "utf8",
  );

  const result = run([
    "record-findings",
    "--manifest",
    path.join(directory, ".author-toolkit", "project.json"),
    "--report",
    report,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).updated, envelope.findings.map((finding) => finding.id));
  assert.deepEqual(JSON.parse(result.stdout).inserted, []);
  const tracker = await readFile(trackerFile, "utf8");
  assert.match(tracker, /\| dismissed \| `evidence\/report\.md` \| 2026-01-17T18:00:00Z \| Author intentionally kept the scene\. \|/);
  assert.match(tracker, /中文引用 \| `code`/);
  assert.match(tracker, /evidence\/report\.md/);
  const rerun = run(["record-findings", "--manifest", path.join(directory, ".author-toolkit", "project.json"), "--report", report]);
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.deepEqual(JSON.parse(rerun.stdout).inserted, []);
});

test("batch upsert inserts new IDs with escaped Chinese paths", async (t) => {
  const { directory, report } = await fixture(t);
  const envelope = extractReportEnvelope(await readFile(report, "utf8"));
  envelope.findings = [{
    ...envelope.findings[0],
    id: "STANDARD-010",
    location: { file: "稿件/第`一`章.md", scope: "passage", quote: "引用 | 内容" },
    issue: "中文问题",
    technique: "中文技术",
  }];
  await writeFile(report, markdown(envelope), "utf8");
  const result = run(["record-findings", "--manifest", path.join(directory, ".author-toolkit", "project.json"), "--report", report]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).inserted, ["STANDARD-010"]);
  const tracker = await readFile(path.join(directory, "state", "custom-tracker.md"), "utf8");
  assert.match(tracker, /``稿件\/第`一`章\.md``/);
  assert.match(tracker, /`passage 引用 \| 内容`/);
});

test("manifest validation and upsert reject a conflicting historical report ID", async (t) => {
  const { directory, manifestPath, report } = await fixture(t);
  const envelope = extractReportEnvelope(await readFile(report, "utf8"));
  envelope.findings = [{
    ...envelope.findings[0],
    id: "STANDARD-099",
    issue: "A different issue from the historical finding.",
  }];
  const historical = path.join(directory, "evidence", "historical.md");
  await writeFile(historical, markdown({
    ...envelope,
    report_id: "historical-standard",
    findings: [{ ...envelope.findings[0], issue: "The original historical issue." }],
  }), "utf8");
  await writeFile(report, markdown(envelope), "utf8");
  const validated = spawnSync(process.execPath, [path.join(root, "scripts", "validate.mjs"), "--manifest", manifestPath, "--report", report], { encoding: "utf8" });
  assert.equal(validated.status, 1);
  assert.match(validated.stderr, /conflicting finding identity/);
  const recorded = run(["record-findings", "--manifest", manifestPath, "--report", report]);
  assert.equal(recorded.status, 1);
  assert.match(recorded.stderr, /conflicting finding identity/);
});

test("failed validation leaves the tracker byte-identical", async (t) => {
  const { directory, manifest, report } = await fixture(t);
  const envelope = extractReportEnvelope(await readFile(report, "utf8"));
  envelope.findings[1].id = envelope.findings[0].id;
  await writeFile(report, markdown(envelope), "utf8");
  const trackerFile = path.join(directory, manifest.paths.audit_tracker);
  const before = await readFile(trackerFile, "utf8");
  const result = run(["record-findings", "--manifest", path.join(directory, ".author-toolkit", "project.json"), "--report", report]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate finding ID/);
  assert.equal(await readFile(trackerFile, "utf8"), before);
  assert.equal(run(["record-findings", "--manifest", path.join(directory, ".author-toolkit", "project.json")]).status, 2);
  assert.equal(run(["unknown"]).status, 2);
});

test("library updates only existing rows with the same finding identity", async () => {
  const envelope = extractReportEnvelope(await readReport());
  const [first] = envelope.findings;
  const different = { ...first, issue: "A different issue." };
  assert.throws(
    () => upsertTrackerFindings(readTrackerPlaceholder(), [{ path: "reports/new.md", envelope: { ...envelope, findings: [different] } }], [
      { path: "reports/old.md", envelope: { ...envelope, findings: [first] } },
    ]),
    /conflicting finding identity/,
  );
});

function readTrackerPlaceholder() {
  return `## Findings\n\n| Finding ID | Stage | Audit | Location | Status | Current report | Updated | Decision or stale reason |\n|---|---|---|---|---|---|---|---|\n| STRUCT-001 | structure | story-structure-audit | chapter.md | open | reports/old.md | 2026-01-17T18:00:00Z | No author decision recorded. |\n\n## Audit runs\n`;
}
