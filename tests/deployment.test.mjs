import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createEvidenceFixture } from "./evidence-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..");
const canonicalReferences = path.join(root, "references");
const setupReferences = path.join(
  root,
  "skills",
  "setup-author-toolkit",
  "assets",
  "references",
);
const independentSkills = [
  "fiction-workshop",
  "character-archetypes",
  "story-structure",
  "narrative-nonfiction",
  "prose-mechanics",
];

async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return filesUnder(path.join(directory, entry.name), `${relative}/`);
      return entry.isFile() ? [relative] : [];
    }),
  );
  return files.flat().sort();
}

async function markdownFiles(directory) {
  const files = await filesUnder(directory);
  return files.filter((file) => file.endsWith(".md"));
}

test("setup carries self-contained preflight, validation, state, range, and installation CLIs", async (t) => {
  await mkdir(path.join(root, ".test-output"), { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(root, ".test-output", "setup-cli-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const mirror = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "sync-setup-runtime.mjs"), "--check"],
    { encoding: "utf8" },
  );
  assert.equal(mirror.status, 0, mirror.stderr);

  const installedSetup = path.join(temporaryRoot, "setup-author-toolkit");
  await cp(path.dirname(path.dirname(setupReferences)), installedSetup, { recursive: true });
  await cp(
    path.join(root, "skills", "author-project"),
    path.join(temporaryRoot, "author-project"),
    { recursive: true },
  );
  const loader = path.join(temporaryRoot, "block-runtime-packages.mjs");
  await writeFile(
    loader,
    `export async function resolve(specifier, context, nextResolve) {
      if (/^(?:ajv|ajv-formats|fast-deep-equal|fast-uri|json-schema-traverse|require-from-string)(?:\\/|$)/.test(specifier)) {
        throw new Error("Runtime package import blocked: " + specifier);
      }
      return nextResolve(specifier, context);
    }
  `,
  );

  const preload = path.join(temporaryRoot, "block-runtime-packages.cjs");
  await writeFile(
    preload,
    `const Module = require("node:module");
    const load = Module._load;
    Module._load = function (request, ...args) {
      if (/^(?:ajv|ajv-formats|fast-deep-equal|fast-uri|json-schema-traverse|require-from-string)(?:\\/|$)/.test(request)) {
        throw new Error("Runtime package require blocked: " + request);
      }
      return load.call(this, request, ...args);
    };
  `,
  );

  const nodeArgs = ["--no-warnings", "--experimental-loader", loader, "--require", preload];
  for (const script of ["inspect-root.mjs", "initialize.mjs", "install-entry-files.mjs", "preflight.mjs", "check.mjs", "read.mjs", "set-pending.mjs", "validate.mjs", "status.mjs", "project-digest.mjs", "findings.mjs", "range.mjs", "doctor.mjs", "writes.mjs", "terminology.mjs", "scaffold-report.mjs", "review-brief.mjs", "coverage-index.mjs"]) {
    const result = spawnSync(
      process.execPath,
      [...nodeArgs, path.join(installedSetup, "scripts", script), "--help"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
  }

  const result = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "validate.mjs"),
      "--manifest",
      path.join(root, "examples", "fiction-revision-zh", ".author-toolkit", "project.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5 checks, 0 failures/);

  const rootValidation = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "validate.mjs"),
      "--project-root",
      path.join(root, "examples", "fiction-revision-zh"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(rootValidation.status, 0, rootValidation.stderr);
  assert.match(rootValidation.stdout, /5 checks, 0 failures/);

  const projection = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "read.mjs"),
      "--project-root",
      path.join(root, "examples", "fiction-revision-zh"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(projection.status, 0, projection.stderr);
  assert.equal(JSON.parse(projection.stdout).pending_action.artifact_count, 1);

  const indexInspection = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "writes.mjs"),
      "check-index",
      "--manifest",
      path.join(root, "examples", "fiction-revision-zh", ".author-toolkit", "project.json"),
      "--explain",
    ],
    { encoding: "utf8" },
  );
  assert.equal(indexInspection.status, 0, indexInspection.stderr);
  assert.equal(JSON.parse(indexInspection.stdout).valid, true);

  const doctor = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "doctor.mjs"),
      "--require-sibling",
      "author-project",
    ],
    { encoding: "utf8" },
  );
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /Payload failures: 0\nSibling author-project: 5 required files\nSibling author-project failures: 0\nProject entry check: skipped \(no --project-root\)/);
  assert.doesNotMatch(doctor.stdout, /Project entry failures:/);
  assert.doesNotMatch(doctor.stdout, /AGENTS\.md/);

  const project = path.join(temporaryRoot, "writing-project");
  await cp(path.join(root, "examples", "fiction-revision-zh"), project, { recursive: true });
  await cp(path.join(installedSetup, "assets", "AGENTS.md"), path.join(project, "AGENTS.md"));
  await rm(path.join(project, "CLAUDE.md"), { force: true });
  await symlink("AGENTS.md", path.join(project, "CLAUDE.md"));

  const initialization = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "initialize.mjs"),
      "--project-root",
      project,
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(initialization.status, 0, initialization.stderr);
  const initialized = JSON.parse(initialization.stdout);
  assert.equal(initialized.schema_valid, true);
  assert.equal(initialized.projection.verification, "validated");
  assert.equal(initialized.backup_index.status, "preserved");

  const preflight = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "preflight.mjs"),
      "--project-root",
      project,
      "--digest",
    ],
    { encoding: "utf8" },
  );
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.match(preflight.stdout, /Payload failures: 0\nEntry files: pass/);
  assert.match(preflight.stdout, /Blocking project validation: 5 checks, 0 failures/);
  assert.match(preflight.stdout, /Navigation cache: refreshed PROJECT_STATE.md; snapshot only/);
  assert.match(preflight.stdout, /Preflight: passed/);

  const check = spawnSync(
    process.execPath,
    [...nodeArgs, path.join(installedSetup, "scripts", "check.mjs"), "--project-root", project],
    { encoding: "utf8" },
  );
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stdout, preflight.stdout.replace("Navigation cache: refreshed PROJECT_STATE.md; snapshot only", "Navigation cache: reusable snapshot only; recorded next action remains unevaluated"));

  const fullProject = path.join(temporaryRoot, "full-project");
  await createEvidenceFixture(
    path.join(root, "examples", "fiction-revision-en"),
    path.join(installedSetup, "assets"),
    fullProject,
  );
  const full = spawnSync(
    process.execPath,
    [...nodeArgs, path.join(installedSetup, "scripts", "check.mjs"), "--project-root", fullProject, "--full", "--json"],
    { encoding: "utf8" },
  );
  assert.equal(full.status, 0, full.stderr);
  const fullResult = JSON.parse(full.stdout);
  assert.equal(fullResult.valid, true);
  assert.equal(fullResult.execution_gate.valid, true);
  assert.equal(fullResult.evidence.valid, true);
  assert.equal(fullResult.evidence.selection.review_jobs, 3);
  assert.equal(fullResult.evidence.checks.length, 15);

  const coverageEntry = path.join(fullProject, ".author-toolkit", "coverage-entry.json");
  await writeFile(coverageEntry, JSON.stringify({
    operation: "current-scope-review",
    units: ["intent", "standards", "fresh"].map((perspective) => ({
      unit_id: `unit-${perspective}-r2`,
      path: `reports/coverage/unit-${perspective}-r2.json`,
    })),
    synthesis_report: "reports/current-scope-review/fresh-r2.md",
    synthesis_coverage: "full",
  }));
  const coverage = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "coverage-index.mjs"),
      "--manifest",
      path.join(fullProject, ".author-toolkit", "project.json"),
      "--entry",
      ".author-toolkit/coverage-entry.json",
      "--updated-at",
      "2026-11-15T04:00:00Z",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.equal(JSON.parse(coverage.stdout).unit_count, 3);

  const evidenceDigest = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "project-digest.mjs"),
      "--project-root",
      fullProject,
    ],
    { encoding: "utf8" },
  );
  assert.equal(evidenceDigest.status, 0, evidenceDigest.stderr);
  const evidenceCache = await readFile(path.join(fullProject, "PROJECT_STATE.md"), "utf8");
  assert.match(evidenceCache, /Synthesis \(`current-scope-review`\): `reports\/current-scope-review\/fresh-r2.md` \(full\)/);
  assert.match(evidenceCache, /`current-scope`\/`intent` `\.author-toolkit\/reviews\/review-intent-r2.json`/);

  const diagnosisProject = path.join(temporaryRoot, "diagnosis-project");
  await cp(project, diagnosisProject, { recursive: true });
  const projectManifestPath = path.join(diagnosisProject, ".author-toolkit", "project.json");
  const projectManifest = JSON.parse(await readFile(projectManifestPath, "utf8"));
  const projectTrackerPath = path.join(diagnosisProject, projectManifest.paths.audit_tracker);
  await writeFile(
    projectTrackerPath,
    (await readFile(projectTrackerPath, "utf8")).replace(
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|",
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|\n| PLAN-001 | plan | revision-plan | scope-example-revision | `manuscript/chapter-01.md` | approved | Exact test batch. | 2026-11-11T00:00:00Z |",
    ),
  );
  const projectIndexPath = path.join(diagnosisProject, projectManifest.paths.backups, "index.json");
  const projectIndex = JSON.parse(await readFile(projectIndexPath, "utf8"));
  projectIndex.backups.push({
    backup_id: "backup-plan-001",
    approval_id: "PLAN-001",
    operation: "draft-baseline",
    scope_id: "scope-example-revision",
    input_hashes: {},
  });
  await writeFile(projectIndexPath, JSON.stringify(projectIndex));
  const diagnosisInitialization = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "initialize.mjs"),
      "--project-root",
      diagnosisProject,
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(diagnosisInitialization.status, 3, diagnosisInitialization.stderr);
  const diagnosisInitialized = JSON.parse(diagnosisInitialization.stdout);
  assert.equal(diagnosisInitialized.valid, false);
  assert.equal(diagnosisInitialized.schema_valid, true);
  assert.equal(diagnosisInitialized.projection.verification, "recorded_unverified");

  const diagnosis = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "preflight.mjs"),
      "--project-root",
      diagnosisProject,
      "--diagnose",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(diagnosis.status, 1, diagnosis.stderr);
  const diagnosed = JSON.parse(diagnosis.stdout);
  assert.equal(diagnosed.diagnosis.projection.verification, "recorded_unverified");
  assert.deepEqual(diagnosed.diagnosis.current_hashes, {
    verified: true,
    matched: projectManifest.current_scope.files.length,
    total: projectManifest.current_scope.files.length,
  });
  assert.deepEqual(diagnosed.diagnosis.backup_index.records[0].differences, [
    { field: "operation", backup: "draft-baseline", approval: "revision-plan" },
  ]);
  assert.equal(diagnosed.diagnosis.backup_index.records[0].approval.type, "plan");
  assert.equal(diagnosed.diagnosis.backup_index.records[0].diagnosis.code, "non_write_approval");
  assert.equal(diagnosed.diagnosis.execution_recovery.read_only, true);
  assert.equal(diagnosed.diagnosis.execution_recovery.status, "unavailable");
  assert.equal(diagnosed.diagnosis.execution_recovery.current_draft_revision_convergence, "not_established");

  const diagnosisText = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "preflight.mjs"),
      "--project-root",
      diagnosisProject,
      "--diagnose",
    ],
    { encoding: "utf8" },
  );
  assert.equal(diagnosisText.status, 1, diagnosisText.stderr);
  assert.match(diagnosisText.stdout, /Blocking error: executions:/);
  assert.match(diagnosisText.stdout, /Non-blocking unverified approvals: 0; 0\/0 execution receipts verified/);

  const rangeProject = path.join(temporaryRoot, "range-project");
  await mkdir(path.join(rangeProject, "manuscript"), { recursive: true });
  await writeFile(path.join(rangeProject, "manuscript", "1.md"), "温暖与热带\n", "utf8");
  const range = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "range.mjs"),
      "--project-root",
      rangeProject,
      "manuscript/1.md:1:3-4",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(range.status, 0, range.stderr);
  assert.equal(JSON.parse(range.stdout).text, "与热");

  const scaffoldProject = path.join(temporaryRoot, "scaffold-project");
  await mkdir(path.join(scaffoldProject, ".author-toolkit"), { recursive: true });
  await mkdir(path.join(scaffoldProject, "reports"), { recursive: true });
  await writeFile(
    path.join(scaffoldProject, ".author-toolkit", "project.json"),
    await readFile(path.join(root, "examples", "fiction-revision-en", ".author-toolkit", "project.json"), "utf8"),
  );
  await cp(
    path.join(root, "examples", "fiction-revision-en", "audit-tracker.md"),
    path.join(scaffoldProject, "audit-tracker.md"),
  );
  const scaffoldBody = path.join(temporaryRoot, "scaffold-body.md");
  const scaffoldEnvelope = path.join(temporaryRoot, "scaffold-envelope.json");
  await writeFile(scaffoldBody, "# Report\n\n## Language coverage\n\nfull\n", "utf8");
  await writeFile(scaffoldEnvelope, JSON.stringify({
    schema_version: "2.0.0",
    report_id: "SCAFFOLD-DEPLOYMENT-001",
    audit: "scaffold-deployment",
    stage: "current-scope-review",
    created_at: "2026-11-15T00:00:00Z",
    language: "en",
    skill: { name: "author-review", version: "unversioned" },
    inputs: [{ path: "manuscript/chapter-01.md", version: "a".repeat(64), version_type: "sha256" }],
    engine: {
      name: "conversational",
      version: "unknown",
      degraded: false,
      notes: "scope_id=scope-example-revision; review_mode=current-scope; operation_coverage=full; subchecks=standards; Language coverage: full (en); unit=chapter-01.",
    },
  }), "utf8");
  const scaffold = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "scaffold-report.mjs"),
      "--manifest",
      path.join(scaffoldProject, ".author-toolkit", "project.json"),
      "--output",
      "reports/current-scope-review/scaffold.md",
      "--body",
      scaffoldBody,
      "--envelope",
      scaffoldEnvelope,
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(scaffold.status, 0, scaffold.stderr);
  assert.equal(JSON.parse(scaffold.stdout).finding_count, 0);
  const scaffoldedReport = await readFile(path.join(scaffoldProject, "reports/current-scope-review/scaffold.md"), "utf8");
  assert.match(scaffoldedReport, /"findings": \[\]/);
  const scaffoldValidation = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "validate.mjs"),
      "--report",
      path.join(scaffoldProject, "reports/current-scope-review/scaffold.md"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(scaffoldValidation.status, 0, scaffoldValidation.stderr);

  const briefTracker = (await readFile(path.join(scaffoldProject, "audit-tracker.md"), "utf8"))
    .replaceAll("reports/structure/2026-01-17_structure.md", "reports/current-scope-review/scaffold.md")
    .replace("| STRUCT-004 | structure | story-structure-audit | `manuscript/chapter-01.md`, chapter 1 | open |", "| STRUCT-004 | current-scope-review | author-review-standards | `manuscript/chapter-01.md`, chapter 1 | resolved |")
    .replace("| STRUCT-004 | current-scope-review | author-review-standards | `manuscript/chapter-01.md`, chapter 1 | resolved | reports/current-scope-review/scaffold.md | 2026-01-17T18:00:00Z | No author decision recorded. |", "| STRUCT-004 | current-scope-review | author-review-standards | `manuscript/chapter-01.md`, chapter 1 | resolved | reports/current-scope-review/scaffold.md | 2026-11-15T00:00:00Z | Author retained the structural choice. |");
  await writeFile(path.join(scaffoldProject, "audit-tracker.md"), briefTracker, "utf8");
  const brief = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "review-brief.mjs"),
      "--project-root",
      scaffoldProject,
      "--updated-at",
      "2026-11-15T00:00:00Z",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(brief.status, 0, brief.stderr);
  assert.equal(JSON.parse(brief.stdout).resolved, 1);
  const briefValidation = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "validate.mjs"),
      "--review-brief",
      path.join(scaffoldProject, "reports/review_brief.md"),
      "--tracker",
      path.join(scaffoldProject, "audit-tracker.md"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(briefValidation.status, 0, briefValidation.stderr);

  const terminology = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "terminology.mjs"),
      "--section",
      "Contract values",
    ],
    { encoding: "utf8" },
  );
  assert.equal(terminology.status, 0, terminology.stderr);
  assert.match(terminology.stdout, /^## Contract values\n/);
  assert.doesNotMatch(terminology.stdout, /## Core terms|## Operation identifiers/);

  const setupTerminology = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "terminology.mjs"),
      "--preset",
      "setup",
    ],
    { encoding: "utf8" },
  );
  assert.equal(setupTerminology.status, 0, setupTerminology.stderr);
  assert.match(setupTerminology.stdout, /^## Core terms\n/);
  assert.match(setupTerminology.stdout, /`host command visibility`/);
  assert.match(setupTerminology.stdout, /Setup `setup\.installation`/);
  assert.doesNotMatch(setupTerminology.stdout, /`review coverage`|Coverage `coverage`/);
  assert.doesNotMatch(setupTerminology.stdout, /## Writing rules|## Operation identifiers/);

  const allocation = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "findings.mjs"),
      "next-finding-id",
      "STRUCT",
      "--manifest",
      path.join(project, ".author-toolkit", "project.json"),
      "--count",
      "2",
    ],
    { encoding: "utf8" },
  );
  assert.equal(allocation.status, 0, allocation.stderr);
  assert.deepEqual(JSON.parse(allocation.stdout).ids, ["STRUCT-005", "STRUCT-006"]);

  const digest = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "project-digest.mjs"),
      "--project-root",
      project,
    ],
    { encoding: "utf8" },
  );
  assert.equal(digest.status, 0, digest.stderr);
  assert.equal(digest.stdout, "PROJECT_STATE.md\n");
  const cache = await readFile(path.join(project, "PROJECT_STATE.md"), "utf8");
  assert.ok(cache.trimEnd().split("\n").length <= 50);
  assert.match(cache, /Generated navigation cache/);
  assert.match(cache, /Generated at: `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z`/);
  assert.match(cache, /Validation at generation: passed/);
  assert.match(cache, /rerun preflight before reuse/);
  assert.match(cache, /Latest session: `sessions\/2026-01-19_resume\.md`/);
  assert.match(cache, /Execution evidence: 0\/0 verified; 0 unverified in scope `scope-example-revision`/);
  assert.match(cache, /Next action: .* \(recorded; strategy gates not evaluated\)/);
  assert.match(cache, /Status: use `author-project status` for recorded blockers and execution evidence\./);
  assert.match(cache, /Validation: use `author-project validate` for current hashes and missing paths\./);
  assert.doesNotMatch(cache, /backups\/index\.json/);

  const status = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "status.mjs"),
      "--manifest",
      path.join(project, ".author-toolkit", "project.json"),
      "--scope-id",
      "scope-example-revision",
      "--require-execution",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(status.status, 0, status.stderr);
  const statusResult = JSON.parse(status.stdout);
  const execution = statusResult.execution;
  assert.equal(execution.scope_id, "scope-example-revision");
  assert.equal(execution.required, 0);
  assert.equal(execution.unverified_count, 0);
  assert.equal(statusResult.recorded_blockers.stale_finding_count, 0);
  assert.equal(statusResult.recorded_blockers.blocked_pending_action, null);
  assert.equal(statusResult.evidence.operation_specific, "not_evaluated");

  await writeFile(
    path.join(project, projectManifest.paths.audit_tracker),
    (await readFile(path.join(project, projectManifest.paths.audit_tracker), "utf8")).replace(
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|",
      "| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |\n|---|---|---|---|---|---|---|---|\n| EDIT-001 | edit | chapter-revision | scope-example-revision | `manuscript/chapter-01.md` | approved | Exact test batch. | 2026-11-11T00:00:00Z |",
    ),
  );
  const strictArguments = [
    "--scope-id",
    "scope-example-revision",
    "--require-execution",
    "--json",
  ];
  const strictStatus = spawnSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(installedSetup, "scripts", "status.mjs"),
      "--manifest",
      path.join(project, ".author-toolkit", "project.json"),
      ...strictArguments,
    ],
    { encoding: "utf8" },
  );
  assert.equal(strictStatus.status, 1);
  assert.equal(JSON.parse(strictStatus.stdout).execution.unverified_count, 1);
  assert.match(strictStatus.stderr, /Execution gate failed: 1 unverified approvals/);

  const ordinaryCheck = spawnSync(
    process.execPath,
    [...nodeArgs, path.join(installedSetup, "scripts", "check.mjs"), "--project-root", project, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(ordinaryCheck.status, 0, ordinaryCheck.stderr);
  assert.equal(JSON.parse(ordinaryCheck.stdout).status.execution.unverified_count, 1);

  const strictCheck = spawnSync(
    process.execPath,
    [...nodeArgs, path.join(installedSetup, "scripts", "check.mjs"), "--project-root", project, ...strictArguments],
    { encoding: "utf8" },
  );
  assert.equal(strictCheck.status, 1, strictCheck.stderr);
  const strictCheckResult = JSON.parse(strictCheck.stdout);
  assert.equal(strictCheckResult.status.execution.unverified, undefined);
  assert.deepEqual(strictCheckResult.status.execution.unverified_by_operation, [
    { operation: "chapter-revision", count: 1, first: "EDIT-001", last: "EDIT-001" },
  ]);
  assert.deepEqual(strictCheckResult.execution_gate, {
    scope_id: "scope-example-revision",
    unverified_count: 1,
    valid: false,
  });
  assert.equal(strictCheckResult.navigation_cache.state, "stale");
  assert.equal(strictCheckResult.navigation_cache.next_action, "withheld");
});

test("workflow commands resolve the installed setup CLIs", async () => {
  const files = await markdownFiles(path.join(root, "skills"));
  for (const file of files) {
    const text = await readFile(path.join(root, "skills", file), "utf8");
    assert.doesNotMatch(text, /<toolkit-root>|manual-checks-only/, file);
  }

  const operations = await readFile(
    path.join(root, "skills", "author-project", "references", "read-operations.md"),
    "utf8",
  );
  assert.match(operations, /node <setup-skill-root>\/scripts\/validate\.mjs --manifest/);
  assert.doesNotMatch(operations, /migrate-v3\.mjs/);
});

test("setup carries a byte-identical copy of every shared reference", async () => {
  const [canonicalFiles, setupFiles] = await Promise.all([
    filesUnder(canonicalReferences),
    filesUnder(setupReferences),
  ]);
  assert.deepEqual(setupFiles, canonicalFiles);
  for (const file of canonicalFiles) {
    const [canonical, deployed] = await Promise.all([
      readFile(path.join(canonicalReferences, file), "utf8"),
      readFile(path.join(setupReferences, file), "utf8"),
    ]);
    assert.equal(deployed, canonical, `${file} matches the canonical shared reference`);
  }
});

test("standalone skills carry byte-identical copies of their local contracts", async () => {
  for (const skill of independentSkills) {
    const [canonical, deployed] = await Promise.all([
      readFile(path.join(canonicalReferences, "finding-schema.json"), "utf8"),
      readFile(path.join(root, "skills", skill, "references", "finding-schema.json"), "utf8"),
    ]);
    assert.equal(deployed, canonical, `${skill} carries finding v1`);
  }
  for (const file of ["context-fit.md"]) {
    const canonical = await readFile(path.join(canonicalReferences, file), "utf8");
    for (const skill of ["fiction-workshop", "prose-mechanics"]) {
      const deployed = await readFile(
        path.join(root, "skills", skill, "references", file),
        "utf8",
      );
      assert.equal(deployed, canonical, `${skill} carries ${file}`);
    }
  }
  for (const file of ["avoid-ai-writing-adapter.md", "avoid-ai-writing-zh-CN.md"]) {
    const [canonical, deployed] = await Promise.all([
      readFile(path.join(canonicalReferences, file), "utf8"),
      readFile(path.join(root, "skills", "prose-mechanics", "references", file), "utf8"),
    ]);
    assert.equal(deployed, canonical, `prose-mechanics carries ${file}`);
  }
});

test("deployable skills do not depend on repository-root references", async () => {
  const files = await markdownFiles(path.join(root, "skills"));
  for (const file of files) {
    const text = await readFile(path.join(root, "skills", file), "utf8");
    assert.doesNotMatch(text, /\.\.\/\.\.\/references\//, file);
    assert.doesNotMatch(text, /\.\.\/\.\.\/\.\.\/references\//, file);
    assert.doesNotMatch(text, /toolkit root's `references\//, file);
    assert.doesNotMatch(text, /installed toolkit's `references\//, file);
    assert.doesNotMatch(text, /工具包根目录的 `references\//, file);
  }
});

test("every installed shared reference named by a skill exists in the setup payload", async () => {
  const [files, payload] = await Promise.all([
    markdownFiles(path.join(root, "skills")),
    filesUnder(setupReferences),
  ]);
  const available = new Set(payload);
  const missing = new Set();
  for (const file of files) {
    const text = await readFile(path.join(root, "skills", file), "utf8");
    assert.doesNotMatch(text, /\.author-toolkit\/references\//, file);
    for (const match of text.matchAll(/<setup-skill-root>\/assets\/references\/([A-Za-z0-9._-]+)/g)) {
      if (!available.has(match[1])) missing.add(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual([...missing].sort(), []);
});

test("setup repairs agent entries and only creates missing navigation", async () => {
  const [setup, existingSetup] = await Promise.all([
    readFile(path.join(root, "skills", "setup-author-toolkit", "SKILL.md"), "utf8"),
    readFile(path.join(root, "skills", "setup-author-toolkit", "assets", "setup", "existing-project.md"), "utf8"),
  ]);

  assert.match(setup, /replaces `<project-root>\/AGENTS\.md` with a regular file containing `assets\/AGENTS\.md`/);
  assert.match(setup, /replaces any existing `CLAUDE\.md` file or symlink/);
  assert.match(setup, /scripts\/install-entry-files\.mjs --project-root <project-root> --json/);
  assert.match(setup, /checks both agent targets before writing/);
  assert.match(setup, /leaves correct entries unchanged/);
  assert.match(setup, /atomically replaces other regular files or symlinks/);
  assert.match(setup, /If either agent target is a directory or special file, or any operation fails, stop/);
  assert.doesNotMatch(setup, /rm -f AGENTS\.md|ln -s AGENTS\.md/);
  assert.match(setup, /applies to new projects and existing v3\.1 projects/);
  assert.match(existingSetup, /perform step 3's entry-file replacement even if later project-state validation fails/);
  assert.match(existingSetup, /Report a validation failure as a project-state blocker and a requested execution-gate failure as a blocker for evidence-dependent operations/);
  assert.match(existingSetup, /without repeating backup index inspection, repairing history, or inferring a migration/);
  assert.match(setup, /except for the two project-root agent entry files described above/);
  assert.match(setup, /creates `<project-root>\/START_HERE\.md` from `assets\/START_HERE\.md` only when that path is absent/);
  assert.match(setup, /preserving every existing file, symlink, or directory with that name/);
  assert.match(setup, /these results do not require `START_HERE\.md` to exist or match the installed template/);
  assert.match(setup, /`START_HERE\.md` is create-only and never replaces existing content/);
  const navigation = await readFile(path.join(root, "skills", "setup-author-toolkit", "assets", "START_HERE.md"), "utf8");
  assert.match(navigation, /`PROJECT_STATE\.md`/);
  assert.match(navigation, /`\.author-toolkit\/project\.json`/);
  assert.match(navigation, /\[`AGENTS\.md`\]\(AGENTS\.md#run-creation-or-revision-from-shared-state\)/);
  assert.doesNotMatch(navigation, /check\.mjs --project-root/);
  assert.ok(navigation.indexOf("- Status check:") < navigation.indexOf("- Current navigation:"));
  assert.match(navigation, /only when that check reports `Navigation cache: reusable snapshot only`/);
  assert.match(navigation, /When the cache is stale or unchecked, use the bounded command results instead/);
  assert.match(navigation, /Start `ask-author` through your host's skill command or skill picker/);
  assert.doesNotMatch(navigation, /\$ask-author\b/);
});

test("setup reads shared references without deploying them into project state", async () => {
  const [setup, instructions] = await Promise.all([
    readFile(path.join(root, "skills", "setup-author-toolkit", "SKILL.md"), "utf8"),
    readFile(path.join(root, "skills", "setup-author-toolkit", "assets", "AGENTS.md"), "utf8"),
  ]);
  assert.match(setup, /Keep every shared runtime contract in this installed skill's `assets\/references\/` payload/);
  assert.match(setup, /copy shared contracts into the writing project/);
  assert.match(setup, /incomplete toolkit installation/);
  assert.doesNotMatch(setup, /Deploy every file|reference-version-conflict|reference-updates/);
  assert.match(setup, /independent skills do not require setup for standalone use/i);
  assert.match(instructions, /`<setup-skill-root>\/assets\/references\/terminology\.md`/);
  assert.match(instructions, /Do not copy contracts into the writing project/);
});

test("setup uses the authoritative payload inventory and bounded doctor", async () => {
  const [setup, existingSetup, operations, instructions, readme, zhReadme] = await Promise.all([
    readFile(path.join(root, "skills", "setup-author-toolkit", "SKILL.md"), "utf8"),
    readFile(path.join(root, "skills", "setup-author-toolkit", "assets", "setup", "existing-project.md"), "utf8"),
    readFile(path.join(root, "skills", "author-project", "references", "read-operations.md"), "utf8"),
    readFile(path.join(root, "skills", "setup-author-toolkit", "assets", "AGENTS.md"), "utf8"),
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "README.zh-CN.md"), "utf8"),
  ]);
  for (const text of [setup, operations, instructions]) {
    assert.match(text, /scripts\/doctor\.mjs/);
  }
  for (const text of [setup, operations]) {
    assert.match(text, /assets\/payload-manifest\.json/);
  }
  assert.match(setup, /Run `node <setup-skill-root>\/scripts\/doctor\.mjs --require-sibling author-project` and report its payload and sibling summary/);
  assert.match(setup, /Defer project-entry installation and verification to step 3/);
  assert.doesNotMatch(setup, /scripts\/doctor\.mjs --project-root <project-root>/);
  assert.match(setup, /If either installation check fails, report an incomplete toolkit installation and stop/);
  assert.match(setup, /final installation and project-state verification/);
  assert.match(instructions, /scripts\/check\.mjs --project-root <project-root>/);
  assert.match(instructions, /rerun it with `--diagnose`/);
  assert.match(instructions, /stop at the active strategy's author gate/);
  assert.match(operations, /at most eight operation groups/);
  assert.match(operations, /Use standalone `validate\.mjs` to diagnose a validation failure/);
  assert.match(operations, /--diagnose/);
  assert.match(operations, /recorded_unverified/);
  assert.match(setup, /check\.mjs --project-root <project-root> --diagnose/);
  assert.match(existingSetup, /without rerunning preflight/);
  assert.match(existingSetup, /add `--scope-id <current-scope-id> --require-execution` to that same final diagnostic call/);
  assert.match(setup, /without repeating doctor or preflight/);
  assert.match(existingSetup, /without repeating backup index inspection/);
  assert.match(existingSetup, /--explain` only when the reported inconsistency was not already diagnosed/);
  assert.match(readme, /--project-root <root>/);
  assert.match(readme, /internal CLI modules/);
  assert.match(zhReadme, /--project-root <root>/);
  assert.match(zhReadme, /CLI 内部模块/);
});

test("setup branch references are included in the authoritative payload manifest", async () => {
  const payload = JSON.parse(await readFile(
    path.join(root, "skills", "setup-author-toolkit", "assets", "payload-manifest.json"),
    "utf8",
  ));
  const paths = new Set(payload.files.map((entry) => entry.path));
  assert.ok(paths.has("assets/setup/existing-project.md"));
  assert.ok(paths.has("assets/setup/new-project.md"));
});

test("setup mechanically prechecks sibling author-project dependencies before either branch", async () => {
  const [setup, newProject] = await Promise.all([
    readFile(path.join(root, "skills", "setup-author-toolkit", "SKILL.md"), "utf8"),
    readFile(
      path.join(root, "skills", "setup-author-toolkit", "assets", "setup", "new-project.md"),
      "utf8",
    ),
  ]);
  assert.match(setup, /scripts\/doctor\.mjs --require-sibling author-project/);
  assert.match(setup, /If either installation check fails/);
  assert.match(setup, /this check creates no project files/);
  assert.doesNotMatch(newProject, /Before step 1, verify|If any file is missing/);
});

test("shared workflows resolve installed setup references without project deployment", async () => {
  const callers = [
    "ask-author",
    "author-handoff",
    "author-review",
    "write-fiction",
    "revise-fiction",
    "revise-draft",
    "revise-increment",
    "revise-request",
  ];
  const [operations, ...entries] = await Promise.all([
    readFile(path.join(root, "skills", "author-project", "references", "read-operations.md"), "utf8"),
    ...callers.map((skill) => readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8")),
  ]);

  assert.match(operations, /read shared runtime contracts directly from its `assets\/references\/` payload/);
  assert.match(operations, /Run the installed doctor before each `read`, `validate`, or `status` operation/);
  assert.match(operations, /incomplete toolkit installation/);
  assert.doesNotMatch(operations, /compare every packaged file|missing project-relative paths|reference-version-conflict/);

  for (const [index, text] of entries.entries()) {
    assert.match(text, /resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>`/i, callers[index]);
    assert.match(text, /incomplete toolkit installation/, callers[index]);
    assert.doesNotMatch(text, /check the deployed shared references|valid manifest does not prove reference deployment/, callers[index]);
  }

  for (const skill of ["revise-fiction", "revise-draft", "revise-increment", "revise-request"]) {
    const text = entries[callers.indexOf(skill)];
    assert.match(text, /tracker path, and resolved `<setup-skill-root>`/, skill);
  }
  assert.match(
    entries[callers.indexOf("write-fiction")],
    /Include the resolved `<setup-skill-root>` in shared workflow context/,
  );

  const review = entries[callers.indexOf("author-review")];
  const rootResolution = review.indexOf("Resolve the installed `setup-author-toolkit`");
  const contractRead = review.indexOf("Read the controlled workflow terminology");
  assert.ok(
    contractRead > rootResolution,
    "author-review resolves the setup skill before reading its installed contracts",
  );
});

test("standalone entry points name their deployed skill-local contracts", async () => {
  for (const skill of independentSkills) {
    const text = await readFile(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    assert.match(text, /`references\/finding-schema\.json`/, skill);
  }
  const [prose, languageSupport, chineseRules] = await Promise.all([
    readFile(path.join(root, "skills", "prose-mechanics", "SKILL.md"), "utf8"),
    readFile(path.join(root, "skills", "prose-mechanics", "references", "language-support.md"), "utf8"),
    readFile(path.join(root, "skills", "prose-mechanics", "references", "chinese-rules.md"), "utf8"),
  ]);
  assert.match(prose, /`references\/avoid-ai-writing-adapter\.md`/);
  assert.match(prose, /`references\/context-fit\.md`/);
  assert.match(languageSupport, /\(avoid-ai-writing-adapter\.md\)/);
  assert.match(chineseRules, /\[`avoid-ai-writing-adapter\.md`\]\(avoid-ai-writing-adapter\.md\)/);
});
