import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createEvidenceFixture } from "./evidence-fixture.mjs";
import { exampleRoot, readReport, root } from "./helpers.mjs";
import { extractReportEnvelope } from "../scripts/lib/index.mjs";

function run(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts/evidence-retention.mjs"), ...args], { encoding: "utf8" });
}

async function fixture(t) {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const directory = await mkdtemp(path.join(root, ".test-output", "evidence-retention-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const created = await createEvidenceFixture(exampleRoot("en"), path.join(root, "skills/setup-author-toolkit/assets"), path.join(directory, "project"));
  return { ...created, projectRoot: created.projectRoot, manifestPath: path.join(created.projectRoot, ".author-toolkit/project.json") };
}

test("bounded migration previews without writes and deletes only unreferenced audit evidence", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const oldReport = "reports/current-scope-review/intent-r1.md";
  const oldJob = ".author-toolkit/reviews/review-intent-r1.json";
  const originalManifest = await readFile(manifestPath, "utf8");
  const preview = run(["--project-root", projectRoot]);
  assert.equal(preview.status, 0, preview.stderr);
  const planned = JSON.parse(preview.stdout);
  assert.equal(planned.mode, "preserved");
  assert.ok(planned.candidates.includes(oldReport));
  assert.ok(planned.candidates.includes(oldJob));
  assert.equal(await readFile(manifestPath, "utf8"), originalManifest);
  await access(path.join(projectRoot, oldReport));
  assert.equal(run(["--project-root", projectRoot, "--apply"]).status, 1);

  const result = run(["--project-root", projectRoot, "--enable", "--apply"]);
  assert.equal(result.status, 0, result.stderr);
  const applied = JSON.parse(result.stdout);
  assert.equal(applied.valid, true, result.stdout);
  assert.equal(applied.migrated, true);
  assert.ok(applied.deleted.includes(oldReport));
  assert.ok(applied.deleted.includes(oldJob));
  await assert.rejects(access(path.join(projectRoot, oldReport)));
  await assert.rejects(access(path.join(projectRoot, oldJob)));
  await access(path.join(projectRoot, "reports/current-scope-review/intent-r2.md"));
  await access(path.join(projectRoot, ".author-toolkit/reviews/review-intent-r2.json"));
  const retainedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(retainedManifest.evidence_retention, { mode: "bounded" });
  const tracker = await readFile(path.join(projectRoot, manifest.paths.audit_tracker), "utf8");
  assert.match(tracker, /## Finding history/);
  assert.match(tracker, /STRUCT-004/);
  const full = spawnSync(process.execPath, [path.join(root, "scripts/check.mjs"), "--project-root", projectRoot, "--full", "--json"], { encoding: "utf8" });
  assert.equal(full.status, 0, full.stderr || full.stdout);
});

test("bounded cleanup preserves reused reports, other operations, recovery and unknown files", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  assert.equal(run(["--project-root", projectRoot, "--enable", "--apply"]).status, 0);
  const source = await readFile(path.join(projectRoot, "reports/current-scope-review/intent-r2.md"), "utf8");
  const envelope = extractReportEnvelope(source);
  envelope.report_id = "PROSE-REPLACED";
  envelope.stage = "prose";
  envelope.audit = "prose-replaced";
  envelope.findings = [];
  const replaced = source.replace(/```json\n[\s\S]*?\n```/, `\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\``);
  await mkdir(path.join(projectRoot, "reports/prose"), { recursive: true });
  await writeFile(path.join(projectRoot, "reports/prose/replaced.md"), replaced);
  await writeFile(path.join(projectRoot, "reports/prose/unknown.md"), "unrecognized\n");
  const unknown = run(["--project-root", projectRoot, "--operation", "prose"]);
  assert.equal(unknown.status, 0);
  assert.deepEqual(JSON.parse(unknown.stdout).candidates, []);
  assert.ok(JSON.parse(unknown.stdout).blocked.some((item) => item.includes("unknown.md")));
  await rm(path.join(projectRoot, "reports/prose/unknown.md"));
  const selected = JSON.parse(run(["--project-root", projectRoot, "--operation", "prose"]).stdout);
  assert.ok(selected.candidates.includes("reports/prose/replaced.md"));
  const result = run(["--project-root", projectRoot, "--apply", "--operation", "prose"]);
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(access(path.join(projectRoot, "reports/prose/replaced.md")));
  await access(path.join(projectRoot, "reports/current-scope-review/intent-r2.md"));
  await access(path.join(projectRoot, "reports/current-scope-review/standards-r2.md"));
  await access(manifestPath);
});

test("bounded cleanup protects tracker reports, pending recovery, and preserves finding IDs", async (t) => {
  const { projectRoot, manifestPath, manifest } = await fixture(t);
  const trackerReport = "reports/structure/2026-01-17_structure.md";
  const pending = JSON.parse(await readFile(manifestPath, "utf8"));
  pending.pending_action.status = "in_progress";
  await writeFile(manifestPath, JSON.stringify(pending));
  const protectedPlan = JSON.parse(run(["--project-root", projectRoot]).stdout);
  assert.ok(!protectedPlan.candidates.includes(trackerReport));
  const applied = run(["--project-root", projectRoot, "--enable", "--apply"]);
  assert.equal(applied.status, 0, applied.stderr);
  await access(path.join(projectRoot, trackerReport));
  const ids = spawnSync(process.execPath, [path.join(root, "scripts/findings.mjs"), "next-finding-id", "STRUCT", "--manifest", manifestPath], { encoding: "utf8" });
  assert.equal(ids.status, 0, ids.stderr);
  assert.deepEqual(JSON.parse(ids.stdout).ids, ["STRUCT-005"]);
  const second = run(["--project-root", projectRoot, "--apply"]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).deleted_count, 0);
  await access(path.join(projectRoot, manifest.paths.backups, "index.json"));
});
