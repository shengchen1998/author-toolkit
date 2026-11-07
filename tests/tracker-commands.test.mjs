import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { completeCycle, recordApproval, recordFinding } from "../scripts/lib/index.mjs";
import {
  artifactAt,
  createFirstPublicationArtifacts,
  createNoEditEvidence,
  writeBackupEvidence,
} from "./convergence-helpers.mjs";
import { root } from "./helpers.mjs";

const packagedAssets = path.join(root, "skills", "setup-author-toolkit", "assets");

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function installedProject(t, { withManuscript = true } = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-tracker-commands-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const assets = path.join(temporary, "installed-skill", "assets");
  await cp(packagedAssets, assets, { recursive: true });
  const projectRoot = path.join(temporary, "writing-project");
  await mkdir(path.join(projectRoot, "manuscript"), { recursive: true });
  if (withManuscript) {
    await writeFile(
      path.join(projectRoot, "manuscript", "chapter-001.md"),
      "# Chapter One\n\nThe ferry leaves at dusk.\n",
      "utf8",
    );
  }
  const cli = path.join(assets, "runtime", "author-project.mjs");
  let commandSequence = 0;
  const project = {
    projectRoot,
    cli,
    run(args) {
      return spawnSync(process.execPath, [cli, ...args], {
        cwd: temporary,
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: "" },
      });
    },
    runAsync(args) {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, ...args], {
          cwd: temporary,
          env: { ...process.env, NODE_PATH: "" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
      });
    },
    async command(command, input) {
      const inputPath = path.join(projectRoot, `${command}-${commandSequence++}-${sha256(JSON.stringify(input)).slice(0, 12)}.json`);
      await writeJson(inputPath, input);
      const processResult = this.run([command, "--project-root", projectRoot, "--input", inputPath]);
      const response = JSON.parse(processResult.stdout);
      assert.equal(response.response_contract_version, "1.0");
      assert.equal(response.command, command);
      assert.equal(typeof response.valid, "boolean");
      assert.ok(Object.hasOwn(response, "result"));
      assert.ok(Array.isArray(response.errors));
      return { processResult, response };
    },
    async commandAsync(command, input) {
      const inputPath = path.join(projectRoot, `${command}-${commandSequence++}-${sha256(JSON.stringify(input)).slice(0, 12)}.json`);
      await writeJson(inputPath, input);
      const processResult = await this.runAsync([command, "--project-root", projectRoot, "--input", inputPath]);
      const response = JSON.parse(processResult.stdout);
      assert.equal(response.response_contract_version, "1.0");
      assert.equal(response.command, command);
      assert.equal(typeof response.valid, "boolean");
      assert.ok(Object.hasOwn(response, "result"));
      assert.ok(Array.isArray(response.errors));
      return { processResult, response };
    },
  };
  assert.equal(project.run(["init", "--project-root", projectRoot, "--language", "en"]).status, 0);
  return project;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finding(id = "DIAG-001") {
  return {
    id,
    audit: "narrative diagnostics",
    technique: "causality",
    severity: "suggestion",
    location: { file: "manuscript/chapter-001.md", scope: "line", line: 3 },
    issue: "The departure lacks a causal connection to the preceding choice.",
    recommendation: "Clarify why the choice causes the departure.",
    confidence: "judgment",
  };
}

async function writeReport(projectRoot, reportPath, envelope) {
  const absolute = path.join(projectRoot, reportPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const markdown = `# ${envelope.report_id}\n\n## Language coverage\n\nfull\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;
  await writeFile(absolute, markdown, "utf8");
  return { markdown, sha256: sha256(markdown) };
}

function reportEnvelope(findings, overrides = {}) {
  return {
    schema_version: "2.0.0",
    report_id: "diagnostics-001",
    audit: "narrative diagnostics",
    stage: "diagnostics",
    created_at: new Date().toISOString(),
    language: "en",
    skill: { name: "story-structure", version: "unversioned" },
    inputs: [{
      path: "manuscript/chapter-001.md",
      version: sha256("# Chapter One\n\nThe ferry leaves at dusk.\n"),
      version_type: "sha256",
    }],
    engine: {
      name: "conversational",
      version: "unknown",
      degraded: false,
      notes: "language coverage=full scope_id=scope-draft-001 operation_coverage=full subchecks=causality",
    },
    findings,
    ...overrides,
  };
}

test("record-finding writes a validated open finding through the installed CLI", async (t) => {
  const project = await installedProject(t);
  const currentFinding = finding();
  const reportPath = "reports/diagnostics/diagnostics-001.md";
  const report = await writeReport(
    project.projectRoot,
    reportPath,
    reportEnvelope([currentFinding]),
  );
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const trackerBefore = await readFile(trackerPath, "utf8");

  const { processResult, response } = await project.command("record-finding", {
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "Author review is required for this new finding.",
    expected_tracker_sha256: sha256(trackerBefore),
  });

  assert.equal(processResult.status, 0, `${processResult.stdout}\n${processResult.stderr}`);
  assert.equal(response.valid, true);
  assert.equal(response.result.state_written, true);
  assert.equal(response.result.finding_id, currentFinding.id);
  assert.equal(response.result.status, "open");
  assert.match(response.result.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const trackerAfter = await readFile(trackerPath, "utf8");
  assert.ok(trackerAfter.includes(
    `| DIAG-001 | diagnostics | narrative diagnostics | manuscript/chapter-001.md:3 | open | ${reportPath} | ${response.result.updated_at} | Author review is required for this new finding. |`,
  ));
  assert.equal(response.result.tracker_sha256, sha256(trackerAfter));
  assert.equal(sha256(await readFile(path.join(project.projectRoot, reportPath), "utf8")), report.sha256);
});

test("record-finding rejects a pending placeholder reason without publishing an invalid row", async (t) => {
  const project = await installedProject(t);
  const currentFinding = finding();
  const reportPath = "reports/diagnostics/diagnostics-001.md";
  await writeReport(project.projectRoot, reportPath, reportEnvelope([currentFinding]));
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const trackerBefore = await readFile(trackerPath, "utf8");

  const { processResult, response } = await project.command("record-finding", {
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "pending",
  });

  assert.equal(processResult.status, 1, processResult.stdout);
  assert.equal(response.valid, false);
  assert.equal(response.result.state_written, false);
  assert.equal(response.errors[0].code, "finding-command-invalid");
  assert.equal(await readFile(trackerPath, "utf8"), trackerBefore);
});

test("record-finding rejects a duplicate ID with the conflicting row and report", async (t) => {
  const project = await installedProject(t);
  const currentFinding = finding();
  const reportPath = "reports/diagnostics/diagnostics-001.md";
  await writeReport(project.projectRoot, reportPath, reportEnvelope([currentFinding]));
  const input = {
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "Author review is required for this new finding.",
  };
  assert.equal((await project.command("record-finding", input)).processResult.status, 0);
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const trackerBefore = await readFile(trackerPath, "utf8");

  const { processResult, response } = await project.command("record-finding", input);

  assert.equal(processResult.status, 1, processResult.stdout);
  assert.equal(response.result.state_written, false);
  assert.equal(response.errors[0].code, "duplicate-finding-id");
  assert.deepEqual(response.result.conflicts, [{
    finding_id: currentFinding.id,
    row: 0,
    report: reportPath,
  }]);
  assert.equal(await readFile(trackerPath, "utf8"), trackerBefore);
});


test("record-finding round-trips special-character report and location paths in real Markdown", async (t) => {
  const project = await installedProject(t);
  const manuscriptPath = "manuscript/chapter, one|draft`final).md";
  await writeFile(path.join(project.projectRoot, manuscriptPath), "# Special path\n\nText.\n", "utf8");
  const currentFinding = {
    ...finding("SPECIAL-001"),
    location: { file: manuscriptPath, scope: "file" },
  };
  const reportPath = "reports/diagnostics/report, one|draft`final).md";
  await writeReport(
    project.projectRoot,
    reportPath,
    reportEnvelope([currentFinding], {
      report_id: "diagnostics-special-001",
      inputs: [{
        path: manuscriptPath,
        version: sha256("# Special path\n\nText.\n"),
        version_type: "sha256",
      }],
    }),
  );

  const { processResult, response } = await project.command("record-finding", {
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "Author review is required for the special-character path.",
  });

  assert.equal(processResult.status, 0, `${processResult.stdout}\n${processResult.stderr}`);
  assert.equal(response.result.finding.report, reportPath);
  assert.equal(response.result.finding.location, manuscriptPath);
  const status = project.run(["status", "--project-root", project.projectRoot]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  const tracker = await readFile(path.join(project.projectRoot, "audit-tracker.md"), "utf8");
  assert.ok(tracker.includes("\\|"));
  assert.ok(tracker.includes("``"));
});


test("record-approval writes exact revision-plan bindings through the installed CLI", async (t) => {
  const project = await installedProject(t);
  const inputSha256 = sha256("# Chapter One\n\nThe ferry leaves at dusk.\n");
  const outputSha256 = sha256("# Chapter One\n\nThe choice sends the ferry away at dusk.\n");
  const plan = { plan_id: "plan-001", path: "sessions/plan-001.json" };
  const batch = { batch_id: "batch-001", path: "sessions/batch-001.json" };
  for (const [artifact, value] of [[plan, { plan_id: plan.plan_id }], [batch, { batch_id: batch.batch_id }]]) {
    const absolute = path.join(project.projectRoot, artifact.path);
    await writeJson(absolute, value);
    artifact.sha256 = sha256(await readFile(absolute));
  }
  const scopeFingerprint = "a".repeat(64);
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: inputSha256,
    output_sha256: outputSha256,
  }];
  const expectedRevisionApproval = sha256(JSON.stringify({
    operation: "revision-plan",
    plan,
    batch,
    input_scope: { scope_id: "scope-draft-001", scope_fingerprint: scopeFingerprint },
    files,
  }));

  const { processResult, response } = await project.command("record-approval", {
    approval_id: "PLAN-001",
    type: "revision-plan",
    operation: "revision-plan",
    scope_id: "scope-draft-001",
    paths: files.map((file) => file.path),
    files,
    status: "approved",
    reason: "Author approved the exact revision plan and batch.",
    revision: {
      plan,
      batch,
      scope_fingerprint: scopeFingerprint,
    },
  });

  assert.equal(processResult.status, 0, `${processResult.stdout}\n${processResult.stderr}`);
  assert.equal(response.valid, true);
  assert.equal(response.result.state_written, true);
  assert.equal(response.result.approval.id, "PLAN-001");
  assert.deepEqual(response.result.approval.paths, files.map((file) => file.path));
  assert.equal(response.result.approval.scopeId, "scope-draft-001");
  const reasonTokens = response.result.approval.reason.split(/\s+/);
  for (const token of [
    `plan_id=${plan.plan_id}`,
    `plan_sha256=${plan.sha256}`,
    `batch_id=${batch.batch_id}`,
    `batch_sha256=${batch.sha256}`,
    `scope_fingerprint=${scopeFingerprint}`,
    `revision_approval=${expectedRevisionApproval}`,
  ]) {
    assert.ok(reasonTokens.includes(token), token);
  }
  assert.match(response.result.approval.reason, /approval_files=[0-9a-f]{64}/);
  const tracker = await readFile(path.join(project.projectRoot, "audit-tracker.md"), "utf8");
  assert.ok(tracker.includes("| PLAN-001 | revision-plan | revision-plan | scope-draft-001 | `manuscript/chapter-001.md` | approved |"));
});


async function confirmScope(project, scopeId = "scope-draft-001") {
  const proposed = await project.command("record-scope", {
    scope_id: scopeId,
    description: "The complete manuscript in author-confirmed reading order.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  assert.equal(proposed.processResult.status, 0, proposed.processResult.stdout);
  const scope = proposed.response.result.current_scope;
  const confirmed = await project.command("record-scope", {
    ...scope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: new Date().toISOString(),
      reading_order_confirmed: true,
    },
  });
  assert.equal(confirmed.processResult.status, 0, confirmed.processResult.stdout);
  return confirmed.response.result.current_scope;
}

test("record-finding-decision records a current deferred no-edit decision that remains eligible", async (t) => {
  const project = await installedProject(t);
  await confirmScope(project);
  const currentFinding = {
    ...finding("DIAG-101"),
    audit: "narrative",
    location: { file: "manuscript/chapter-001.md", scope: "file" },
  };
  const evidence = await createNoEditEvidence(project.projectRoot, {
    findings: [currentFinding],
    findingStatuses: {
      [currentFinding.id]: { status: "open", reason: "Author decision is required." },
    },
  });
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const reportPath = "reports/diagnostics/pass-001-local.md";

  const { processResult, response } = await project.command("record-finding-decision", {
    finding_id: currentFinding.id,
    status: "deferred",
    report: reportPath,
    reason: "Author deferred the transition choice until the next draft; the abrupt transition remains.",
    author_decision_id: evidence.noEditSkip.author_decision_id,
    no_edit_skip: evidence.noEditReference,
    expected_tracker_sha256: sha256(await readFile(trackerPath)),
  });

  assert.equal(processResult.status, 0, `${processResult.stdout}\n${processResult.stderr}`);
  assert.equal(response.valid, true);
  assert.equal(response.result.finding.status, "deferred");
  assert.equal(response.result.finding.report, reportPath);
  assert.match(response.result.finding.reason, /author_decision_id=NOEDIT-001/);
  const evaluated = await project.command("evaluate-draft", {
    evaluation_id: "evaluation-deferred-001",
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: [],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
  assert.equal(evaluated.processResult.status, 0, `${evaluated.processResult.stdout}\n${evaluated.processResult.stderr}`);
  assert.equal(evaluated.response.result.evaluation.outcome, "satisfied");
});


async function evaluateEvidence(project, evidence, evaluationId, revisionExecutions = []) {
  return project.command("evaluate-draft", {
    evaluation_id: evaluationId,
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: revisionExecutions,
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
}

test("record-finding-decision resolves through typed approvals and a verified execution", async (t) => {
  const project = await installedProject(t);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), "utf8");
  const output = "# Chapter One\n\nThe choice sends the ferry away at dusk.\n";
  await confirmScope(project);
  const base = await createNoEditEvidence(project.projectRoot, { passId: "pass-001" });
  const baseEvaluation = await evaluateEvidence(project, base, "evaluation-base-001");
  assert.equal(baseEvaluation.processResult.status, 0, baseEvaluation.processResult.stdout);

  const planRelative = "sessions/typed-plan-001.md";
  const batchRelative = "sessions/typed-batch-001.json";
  await writeFile(path.join(project.projectRoot, planRelative), "# Typed revision plan\n\nChange the departure.\n", "utf8");
  await writeJson(path.join(project.projectRoot, batchRelative), {
    batch_id: "typed-batch-001",
    action: "Change the departure.",
  });
  const backupRelative = ".author-toolkit/backups/backup-typed-001/manuscript/chapter-001.md";
  const backupManifestRelative = ".author-toolkit/backups/backup-typed-001/manifest.json";
  await writeBackupEvidence(project.projectRoot, {
    backupId: "backup-typed-001",
    approvalId: "EDIT-002",
    scope: base.scopeReference,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
      contents: original,
    }],
  });
  const plan = { plan_id: "typed-plan-001", ...(await artifactAt(project.projectRoot, planRelative)) };
  const batch = { batch_id: "typed-batch-001", ...(await artifactAt(project.projectRoot, batchRelative)) };
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(original),
    output_sha256: sha256(output),
  }];
  for (const approval of [
    { approval_id: "PLAN-002", type: "revision-plan", operation: "revision-plan" },
    { approval_id: "EDIT-002", type: "edit", operation: "chapter-revision" },
  ]) {
    const recorded = await project.command("record-approval", {
      ...approval,
      scope_id: base.scopeReference.scope_id,
      paths: files.map((file) => file.path),
      files,
      status: "approved",
      reason: "Author approved the exact typed revision binding.",
      revision: {
        plan,
        batch,
        scope_fingerprint: base.scopeReference.scope_fingerprint,
      },
    });
    assert.equal(recorded.processResult.status, 0, recorded.processResult.stdout);
  }
  const execution = {
    execution_id: "execution-typed-001",
    plan,
    batch,
    requested_pass: base.passReference,
    input_scope: base.scopeReference,
    finding_dispositions: [{
      finding_id: "DIAG-202",
      disposition: "execute",
      author_decision_id: "PLAN-002",
    }],
    author_decision_ids: ["PLAN-002"],
    approval_ids: ["EDIT-002"],
    backups: [{
      backup_id: "backup-typed-001",
      approval_id: "EDIT-002",
      manifest: await artifactAt(project.projectRoot, backupManifestRelative),
      files: [{
        path: "manuscript/chapter-001.md",
        backup_path: backupRelative,
        sha256: sha256(original),
      }],
    }],
    files,
  };
  const prepared = await project.command("prepare-draft-revision-execution", execution);
  assert.equal(prepared.processResult.status, 0, `${prepared.processResult.stdout}\n${prepared.processResult.stderr}`);

  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  await confirmScope(project);
  const currentFinding = {
    ...finding("DIAG-202"),
    audit: "narrative",
    location: { file: "manuscript/chapter-001.md", scope: "file" },
  };
  const target = await createNoEditEvidence(project.projectRoot, {
    passId: "pass-002",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-002",
    findings: [currentFinding],
    findingStatuses: {
      [currentFinding.id]: { status: "open", reason: "Author decision is required after the edit." },
    },
  });
  const verified = await project.command("verify-draft-revision-execution", {
    execution_id: execution.execution_id,
    requested_pass: target.passReference,
    target_scope: target.scopeReference,
  });
  assert.equal(verified.processResult.status, 0, `${verified.processResult.stdout}\n${verified.processResult.stderr}`);

  const decided = await project.command("record-finding-decision", {
    finding_id: currentFinding.id,
    status: "resolved",
    report: "reports/diagnostics/pass-002-local.md",
    reason: "Author accepted the resolution after verifying the revised departure.",
    author_decision_id: "PLAN-002",
    revision_execution: verified.response.result.execution_reference,
  });
  assert.equal(decided.processResult.status, 0, `${decided.processResult.stdout}\n${decided.processResult.stderr}`);
  assert.equal(decided.response.result.finding.status, "resolved");
  const evaluated = await evaluateEvidence(
    project,
    target,
    "evaluation-resolved-001",
    [verified.response.result.execution_reference],
  );
  assert.equal(evaluated.processResult.status, 0, `${evaluated.processResult.stdout}\n${evaluated.processResult.stderr}`);
  assert.equal(evaluated.response.result.evaluation.outcome, "satisfied");
});


test("record-finding-decision marks a finding stale only with a complete rerun and author decision", async (t) => {
  const project = await installedProject(t);
  const scope = await confirmScope(project);
  const currentFinding = {
    ...finding("DIAG-303"),
    location: { file: "manuscript/chapter-001.md", scope: "file" },
  };
  await writeReport(
    project.projectRoot,
    "reports/diagnostics/original-001.md",
    reportEnvelope([currentFinding], { report_id: "original-001" }),
  );
  const recorded = await project.command("record-finding", {
    finding: currentFinding,
    operation: "diagnostics",
    report: "reports/diagnostics/original-001.md",
    status: "open",
    reason: "Author review is required before the equivalent rerun.",
  });
  assert.equal(recorded.processResult.status, 0, recorded.processResult.stdout);
  const evidence = await createNoEditEvidence(project.projectRoot, { passId: "pass-001" });
  const manuscriptHash = sha256(await readFile(
    path.join(project.projectRoot, "manuscript", "chapter-001.md"),
  ));
  const approval = await project.command("record-approval", {
    approval_id: "STALE-001",
    type: "finding-decision",
    operation: "diagnostics",
    scope_id: scope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "review",
      input_sha256: manuscriptHash,
      output_sha256: manuscriptHash,
    }],
    status: "approved",
    reason: "Author confirmed the equivalent complete rerun stale decision. finding_id=DIAG-303 finding_status=stale",
  });
  assert.equal(approval.processResult.status, 0, approval.processResult.stdout);

  const decided = await project.command("record-finding-decision", {
    finding_id: currentFinding.id,
    status: "stale",
    report: "reports/diagnostics/pass-001-local.md",
    reason: "The equivalent complete rerun no longer observes this finding after the reviewed input change.",
    author_decision_id: "STALE-001",
  });

  assert.equal(decided.processResult.status, 0, `${decided.processResult.stdout}\n${decided.processResult.stderr}`);
  assert.equal(decided.response.result.finding.status, "stale");
  const evaluated = await evaluateEvidence(project, evidence, "evaluation-stale-001");
  assert.equal(evaluated.processResult.status, 0, `${evaluated.processResult.stdout}\n${evaluated.processResult.stderr}`);
  assert.equal(evaluated.response.result.evaluation.outcome, "satisfied");
});


test("record-finding-decision accepts an open-to-dismissed transition with current execution evidence", async (t) => {
  const project = await installedProject(t);
  const original = await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), "utf8");
  const output = "# Chapter One\n\nThe ferry departure is intentionally abrupt.\n";
  await confirmScope(project);
  const base = await createNoEditEvidence(project.projectRoot, { passId: "pass-001" });
  const baseEvaluation = await evaluateEvidence(project, base, "evaluation-dismiss-base-001");
  assert.equal(baseEvaluation.processResult.status, 0, baseEvaluation.processResult.stdout);
  const planRelative = "sessions/dismiss-plan-001.md";
  const batchRelative = "sessions/dismiss-batch-001.json";
  await writeFile(path.join(project.projectRoot, planRelative), "# Dismiss plan\n\nRetain the intentional transition.\n", "utf8");
  await writeJson(path.join(project.projectRoot, batchRelative), {
    batch_id: "dismiss-batch-001",
    action: "Retain the intentional transition.",
  });
  const plan = { plan_id: "dismiss-plan-001", ...(await artifactAt(project.projectRoot, planRelative)) };
  const batch = { batch_id: "dismiss-batch-001", ...(await artifactAt(project.projectRoot, batchRelative)) };
  const files = [{
    path: "manuscript/chapter-001.md",
    action: "modify",
    input_sha256: sha256(original),
    output_sha256: sha256(output),
  }];
  for (const approval of [
    { approval_id: "PLAN-003", type: "revision-plan", operation: "revision-plan" },
    { approval_id: "EDIT-003", type: "edit", operation: "chapter-revision" },
  ]) {
    const recorded = await project.command("record-approval", {
      ...approval,
      scope_id: base.scopeReference.scope_id,
      paths: files.map((file) => file.path),
      files,
      status: "approved",
      reason: "Author approved the exact dismissal execution binding.",
      revision: {
        plan,
        batch,
        scope_fingerprint: base.scopeReference.scope_fingerprint,
      },
    });
    assert.equal(recorded.processResult.status, 0, recorded.processResult.stdout);
  }
  const backupRelative = ".author-toolkit/backups/backup-dismiss-001/manuscript/chapter-001.md";
  const backupManifestRelative = ".author-toolkit/backups/backup-dismiss-001/manifest.json";
  await writeBackupEvidence(project.projectRoot, {
    backupId: "backup-dismiss-001",
    approvalId: "EDIT-003",
    scope: base.scopeReference,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(output),
      contents: original,
    }],
  });

  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), output, "utf8");
  await confirmScope(project);
  const currentFinding = {
    ...finding("DIAG-404"),
    audit: "narrative",
    location: { file: "manuscript/chapter-001.md", scope: "file" },
  };
  const target = await createNoEditEvidence(project.projectRoot, {
    passId: "pass-002",
    baselinePass: base.passReference,
    noEditDecisionId: "NOEDIT-002",
    findings: [currentFinding],
    findingStatuses: {
      [currentFinding.id]: { status: "open", reason: "Author decision is required for the intentional transition." },
    },
  });
  const now = new Date().toISOString();
  const execution = {
    schema_version: "1.0.0",
    execution_id: "execution-dismiss-001",
    cycle_id: null,
    plan,
    batch,
    requested_pass: target.passReference,
    input_scope: base.scopeReference,
    target_scope: target.scopeReference,
    finding_dispositions: [{
      finding_id: currentFinding.id,
      disposition: "dismiss",
      author_decision_id: "PLAN-003",
    }],
    author_decision_ids: ["PLAN-003"],
    approval_ids: ["EDIT-003"],
    backups: [{
      backup_id: "backup-dismiss-001",
      approval_id: "EDIT-003",
      manifest: await artifactAt(project.projectRoot, backupManifestRelative),
      files: [{
        path: "manuscript/chapter-001.md",
        backup_path: backupRelative,
        sha256: sha256(original),
      }],
    }],
    files,
    status: "verified",
    created_at: now,
    verified_at: now,
  };
  const executionRelative = ".author-toolkit/convergence/executions/execution-dismiss-001.json";
  await mkdir(path.dirname(path.join(project.projectRoot, executionRelative)), { recursive: true });
  await writeJson(path.join(project.projectRoot, executionRelative), execution);
  const executionReference = {
    execution_id: execution.execution_id,
    ...(await artifactAt(project.projectRoot, executionRelative)),
  };

  const decided = await project.command("record-finding-decision", {
    finding_id: currentFinding.id,
    status: "dismissed",
    report: "reports/diagnostics/pass-002-local.md",
    reason: "Author confirmed that the abrupt transition is intentional and requires no further edit.",
    author_decision_id: "PLAN-003",
    revision_execution: executionReference,
  });

  assert.equal(decided.processResult.status, 0, `${decided.processResult.stdout}\n${decided.processResult.stderr}`);
  assert.equal(decided.response.result.finding.status, "dismissed");
  const evaluated = await evaluateEvidence(project, target, "evaluation-dismissed-001", [executionReference]);
  assert.equal(evaluated.processResult.status, 0, `${evaluated.processResult.stdout}\n${evaluated.processResult.stderr}`);
  assert.equal(evaluated.response.result.evaluation.outcome, "satisfied");
});


test("concurrent record-finding commands preserve distinct rows and reject a racing duplicate", async (t) => {
  const project = await installedProject(t);
  const first = finding("RACE-001");
  const second = finding("RACE-002");
  const reportPath = "reports/diagnostics/race-001.md";
  await writeReport(project.projectRoot, reportPath, reportEnvelope([first, second]));
  const input = (currentFinding) => ({
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "Author review is required for the concurrent finding.",
  });

  const distinct = await Promise.all([
    project.commandAsync("record-finding", input(first)),
    project.commandAsync("record-finding", input(second)),
  ]);
  for (const result of distinct) {
    assert.equal(result.processResult.status, 0, `${result.processResult.stdout}\n${result.processResult.stderr}`);
  }
  let tracker = await readFile(path.join(project.projectRoot, "audit-tracker.md"), "utf8");
  assert.ok(tracker.includes("RACE-001"));
  assert.ok(tracker.includes("RACE-002"));

  const duplicates = await Promise.all([
    project.commandAsync("record-finding", input(first)),
    project.commandAsync("record-finding", input(first)),
  ]);
  assert.equal(duplicates.filter(({ processResult }) => processResult.status === 0).length, 0);
  assert.equal(duplicates.filter(({ processResult }) => processResult.status === 1).length, 2);
  tracker = await readFile(path.join(project.projectRoot, "audit-tracker.md"), "utf8");
  assert.equal((tracker.match(/RACE-001/g) ?? []).length, 1);
});

test("concurrent same-ID record-finding commands permit only one publication", async (t) => {
  const project = await installedProject(t);
  const currentFinding = finding("RACE-101");
  const reportPath = "reports/diagnostics/race-101.md";
  await writeReport(project.projectRoot, reportPath, reportEnvelope([currentFinding]));
  const input = {
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "Author review is required for the racing duplicate.",
  };

  const results = await Promise.all([
    project.commandAsync("record-finding", input),
    project.commandAsync("record-finding", input),
  ]);

  assert.equal(results.filter(({ processResult }) => processResult.status === 0).length, 1);
  const loser = results.find(({ processResult }) => processResult.status === 1);
  assert.equal(loser.response.errors[0].code, "duplicate-finding-id");
  const tracker = await readFile(path.join(project.projectRoot, "audit-tracker.md"), "utf8");
  assert.equal((tracker.match(/RACE-101/g) ?? []).length, 1);
});

test("record-finding interruption reports the verified row and preserves recovery state", async (t) => {
  const project = await installedProject(t);
  const currentFinding = finding("INTERRUPT-001");
  const reportPath = "reports/diagnostics/interrupt-001.md";
  await writeReport(project.projectRoot, reportPath, reportEnvelope([currentFinding]));
  const request = {
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "Author review is required after the interrupted write.",
  };

  const interrupted = await recordFinding(project.projectRoot, request, {
    checkpoint(point) {
      if (point === "tracker-written") throw new Error("Simulated post-tracker interruption");
    },
  });

  assert.equal(interrupted.valid, false);
  assert.equal(interrupted.state_written, true);
  assert.equal(interrupted.blockers[0].code, "tracker-write-interrupted");
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const trackerAfter = await readFile(trackerPath, "utf8");
  assert.ok(trackerAfter.includes("INTERRUPT-001"));
  assert.equal(interrupted.recovery.tracker_sha256, sha256(trackerAfter));
  await assert.rejects(readFile(
    path.join(project.projectRoot, ".author-toolkit", "convergence", "active-cycle.lock", "owner.json"),
    "utf8",
  ), { code: "ENOENT" });
  const retry = await project.command("record-finding", request);
  assert.equal(retry.processResult.status, 1);
  assert.equal(retry.response.errors[0].code, "duplicate-finding-id");
  assert.equal(await readFile(trackerPath, "utf8"), trackerAfter);
});


test("typed approval and completeCycle share the cycle lock without losing either tracker row", async (t) => {
  const project = await installedProject(t, { withManuscript: false });
  const started = await project.command("start-cycle", {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(started.processResult.status, 0, started.processResult.stdout);
  const manuscript = "# Chapter One\n\nThe ferry leaves at dusk.\n";
  await writeFile(path.join(project.projectRoot, "manuscript", "chapter-001.md"), manuscript, "utf8");
  await confirmScope(project, "scope-first-publication");
  const firstPublication = await createFirstPublicationArtifacts(project.projectRoot);
  const evidence = await createNoEditEvidence(project.projectRoot);
  const transitioned = await project.command("transition-cycle", {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The complete no-edit evidence set awaits convergence evaluation.",
    },
    target_scope: evidence.scopeReference,
    requested_pass: evidence.passReference,
    related_artifacts: {
      ...firstPublication.relatedArtifacts,
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(transitioned.processResult.status, 0, transitioned.processResult.stdout);
  const evaluated = await project.command(
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-lock-001", 2),
  );
  assert.equal(evaluated.processResult.status, 0, `${evaluated.processResult.stdout}\n${evaluated.processResult.stderr}`);

  let approvalPromise;
  const completed = await completeCycle(project.projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 3,
    evaluation_id: "evaluation-lock-completion",
    decision_id: "COMPLETELOCK-001",
    author_confirmed: true,
  }, {
    async checkpoint(point) {
      if (point !== "completion-decision-written") return;
      approvalPromise = project.commandAsync("record-approval", {
        approval_id: "APPROVALLOCK-001",
        type: "requested-subcheck",
        operation: "diagnostics",
        scope_id: evidence.scopeReference.scope_id,
        paths: ["manuscript/chapter-001.md"],
        files: [{
          path: "manuscript/chapter-001.md",
          action: "review",
          input_sha256: sha256(manuscript),
          output_sha256: sha256(manuscript),
        }],
        status: "approved",
        reason: "Author requested the diagnostics subcheck while completion held the shared lock.",
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    },
  });
  assert.equal(completed.valid, true, JSON.stringify(completed.blockers));
  const approval = await approvalPromise;
  assert.equal(approval.processResult.status, 0, `${approval.processResult.stdout}\n${approval.processResult.stderr}`);
  const tracker = await readFile(path.join(project.projectRoot, "audit-tracker.md"), "utf8");
  assert.ok(tracker.includes("COMPLETELOCK-001"));
  assert.ok(tracker.includes("APPROVALLOCK-001"));
  const completedCycle = JSON.parse(await readFile(path.join(
    project.projectRoot,
    ".author-toolkit",
    "convergence",
    "cycles",
    "cycle-bootstrap-001.json",
  ), "utf8"));
  assert.equal(completedCycle.completion.decision_id, "COMPLETELOCK-001");
});


test("external edits cannot change a typed finding decision without a validation error", async (t) => {
  const project = await installedProject(t);
  await confirmScope(project);
  const currentFinding = {
    ...finding("EXTERNAL-001"),
    audit: "narrative",
    location: { file: "manuscript/chapter-001.md", scope: "file" },
  };
  const evidence = await createNoEditEvidence(project.projectRoot, {
    findings: [currentFinding],
    findingStatuses: {
      [currentFinding.id]: { status: "open", reason: "Author decision is required." },
    },
  });
  const decided = await project.command("record-finding-decision", {
    finding_id: currentFinding.id,
    status: "deferred",
    report: "reports/diagnostics/pass-001-local.md",
    reason: "Author deferred the finding with its consequence recorded.",
    author_decision_id: evidence.noEditSkip.author_decision_id,
    no_edit_skip: evidence.noEditReference,
  });
  assert.equal(decided.processResult.status, 0, decided.processResult.stdout);
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const typedTracker = await readFile(trackerPath, "utf8");
  const externallyEdited = typedTracker.replace(
    "| EXTERNAL-001 | diagnostics | narrative | manuscript/chapter-001.md | deferred |",
    "| EXTERNAL-001 | diagnostics | narrative | manuscript/chapter-001.md | dismissed |",
  );
  assert.notEqual(externallyEdited, typedTracker);
  await writeFile(trackerPath, externallyEdited, "utf8");

  const status = project.run(["status", "--project-root", project.projectRoot]);

  assert.equal(status.status, 1, `${status.stdout}\n${status.stderr}`);
  const response = JSON.parse(status.stdout);
  assert.equal(response.valid, false);
  assert.ok(response.errors.some((error) => error.keyword === "tracker"), status.stdout);
  assert.match(status.stdout, /finding_status=deferred|decision status|decision.*mismatch/i);
  assert.equal(await readFile(trackerPath, "utf8"), externallyEdited);
});


test("record-finding binds the exact finding audit within its operation report", async (t) => {
  const project = await installedProject(t);
  const currentFinding = finding("AUDIT-001");
  const reportPath = "reports/diagnostics/audit-001.md";
  await writeReport(
    project.projectRoot,
    reportPath,
    reportEnvelope([currentFinding], { audit: "diagnostics audit" }),
  );

  const { processResult, response } = await project.command("record-finding", {
    finding: currentFinding,
    operation: "diagnostics",
    report: reportPath,
    status: "open",
    reason: "Author review is required for the exact finding audit.",
  });

  assert.equal(processResult.status, 0, `${processResult.stdout}\n${processResult.stderr}`);
  assert.equal(response.result.finding.audit, currentFinding.audit);
});

test("record-approval preserves special paths and rejects a duplicate approval ID", async (t) => {
  const project = await installedProject(t);
  const paths = [
    "manuscript/chapter, one|draft`final).md",
    "manuscript/chapter two.md",
  ];
  const files = paths.map((filePath, index) => ({
    path: filePath,
    action: "review",
    input_sha256: index === 0 ? "1".repeat(64) : "2".repeat(64),
    output_sha256: index === 0 ? "1".repeat(64) : "2".repeat(64),
  }));
  const input = {
    approval_id: "APPROVAL-001",
    type: "requested-subcheck",
    operation: "diagnostics",
    scope_id: "scope-draft-001",
    paths,
    files,
    status: "approved",
    reason: "Author approved the complete ordered special-character paths.",
  };
  const recorded = await project.command("record-approval", input);
  assert.equal(recorded.processResult.status, 0, `${recorded.processResult.stdout}\n${recorded.processResult.stderr}`);
  assert.deepEqual(recorded.response.result.approval.paths, paths);
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const beforeDuplicate = await readFile(trackerPath, "utf8");
  assert.ok(beforeDuplicate.includes("\\|"));
  assert.ok(beforeDuplicate.includes("``"));

  const duplicate = await project.command("record-approval", input);
  assert.equal(duplicate.processResult.status, 1, duplicate.processResult.stdout);
  assert.equal(duplicate.response.errors[0].code, "duplicate-approval-id");
  assert.deepEqual(duplicate.response.result.conflicts, [{
    approval_id: "APPROVAL-001",
    row: 0,
    operation: "diagnostics",
    scope_id: "scope-draft-001",
  }]);
  assert.equal(await readFile(trackerPath, "utf8"), beforeDuplicate);
});

test("external duplicate completion IDs block validation and later typed writes without repair", async (t) => {
  const project = await installedProject(t);
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|\n";
  const index = tracker.indexOf(separator, tracker.indexOf("## Cycle completions"));
  const timestamp = new Date().toISOString();
  const row = `| COMPLETE-001 | cycle-001 | ${"a".repeat(64)} | approved | Author confirmed completion. | ${timestamp} |\n`;
  const externallyEdited = `${tracker.slice(0, index + separator.length)}${row}${row}${tracker.slice(index + separator.length)}`;
  await writeFile(trackerPath, externallyEdited, "utf8");

  const status = project.run(["status", "--project-root", project.projectRoot]);
  assert.equal(status.status, 1, status.stdout);
  assert.match(status.stdout, /duplicate completion decision ID: COMPLETE-001/);
  const approval = await project.command("record-approval", {
    approval_id: "APPROVAL-002",
    type: "requested-subcheck",
    operation: "diagnostics",
    scope_id: "scope-draft-001",
    paths: ["manuscript/chapter-001.md"],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "review",
      input_sha256: "1".repeat(64),
      output_sha256: "1".repeat(64),
    }],
    status: "approved",
    reason: "This typed write must stop at the external duplicate.",
  });
  assert.equal(approval.processResult.status, 1, approval.processResult.stdout);
  assert.equal(approval.response.errors[0].code, "tracker-invalid");
  assert.equal(await readFile(trackerPath, "utf8"), externallyEdited);
});
