import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  completeCycle,
  evaluateCycle,
  evaluateDraft,
  extractReportEnvelope,
  getCycleStatus,
  recordScope,
  startCycle,
  transitionCycle,
} from "../scripts/lib/index.mjs";
import {
  createConvergenceProject,
  createFirstPublicationArtifacts,
  createNoEditEvidence,
  createRevisionExecutionFixture,
  writeBackupEvidence,
  writeJson,
} from "./convergence-helpers.mjs";
import { root } from "./helpers.mjs";

const NOW = "2026-11-06T00:00:00.000Z";
const hash = "a".repeat(64);
const validator = path.join(
  root,
  "skills",
  "setup-author-toolkit",
  "assets",
  "runtime",
  "validate.mjs",
);

function atOffset(seconds) {
  return new Date(Date.parse(NOW) + seconds * 1000).toISOString();
}

function setTimestamp(value, pointer, timestamp) {
  const parts = pointer.slice(1).split("/");
  let target = value;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = timestamp;
}

function markdownEnvelope(value, report) {
  const coverage = report ? "## Language coverage\n\nfull\n\n" : "";
  return `# Evidence\n\n${coverage}\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

async function readJson(projectRoot, relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));
}

async function currentArtifacts(t) {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-time-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  }, { now: new Date(NOW) });
  assert.equal(started.valid, true, JSON.stringify(started.blockers));

  const manuscript = "The ferry leaves at dawn.\nMara watches it go.";
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), manuscript, "utf8");
  await recordScope(projectRoot, {
    scope_id: "scope-time-001",
    description: "The complete current manuscript.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(manuscript).digest("hex"),
    }],
    excluded_files: [],
    created_at: NOW,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: NOW,
      reading_order_confirmed: true,
    },
    now: new Date(NOW),
  });
  const publication = await createFirstPublicationArtifacts(projectRoot);
  const evidence = await createNoEditEvidence(projectRoot);
  await writeBackupEvidence(projectRoot, {
    backupId: "backup-time-001",
    approvalId: "EDIT-001",
    scope: evidence.scopeReference,
    createdAt: NOW,
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: createHash("sha256").update(manuscript).digest("hex"),
      output_sha256: hash,
      contents: manuscript,
    }],
  });
  let lockAcquiredAt = null;
  const transitioned = await transitionCycle(projectRoot, {
    cycle_id: "cycle-time-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The complete evidence set awaits convergence evaluation.",
    },
    target_scope: evidence.scopeReference,
    requested_pass: evidence.passReference,
    related_artifacts: {
      ...publication.relatedArtifacts,
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  }, {
    now: new Date(NOW),
    checkpoint: async (point) => {
      if (point !== "manifest-written") return;
      const owner = JSON.parse(await readFile(
        path.join(projectRoot, ".author-toolkit/convergence/active-cycle.lock/owner.json"),
        "utf8",
      ));
      lockAcquiredAt = owner.acquired_at;
    },
  });
  assert.equal(transitioned.valid, true, JSON.stringify(transitioned.blockers));
  assert.equal(lockAcquiredAt, NOW);
  const evaluated = await evaluateCycle(
    projectRoot,
    evidence.evaluationInput("evaluation-time-001", 2, "cycle-time-001"),
    { now: new Date(NOW) },
  );
  assert.equal(evaluated.valid, true, JSON.stringify(evaluated.errors ?? evaluated.blockers));
  const completed = await completeCycle(projectRoot, {
    cycle_id: "cycle-time-001",
    expected_revision: 3,
    evaluation_id: "evaluation-time-completion",
    decision_id: "COMPLETE-001",
    author_confirmed: true,
  }, { now: new Date(NOW) });
  assert.equal(completed.valid, true, JSON.stringify(completed.errors ?? completed.blockers));

  const scope = await readJson(projectRoot, completed.cycle.target_scope.snapshot_path);
  const inventory = await readJson(projectRoot, scope.inventory.path);
  const manifest = await readJson(projectRoot, ".author-toolkit/project.json");
  manifest.cycle_operation = {
    kind: "evaluation",
    operation_id: "operation-time-001",
    cycle_id: "cycle-time-001",
    expected_revision: 3,
    intended_revision: 4,
    artifact_id: "evaluation-time-completion",
    created_at: NOW,
  };
  manifest.pending_action = {
    operation: "intake",
    status: "in_progress",
    reason: "Exercise every current manifest timestamp field.",
    updated_at: NOW,
  };
  const reportMarkdown = await readFile(
    path.join(projectRoot, evidence.reports[0].path),
    "utf8",
  );
  const storyMarkdown = await readFile(
    path.join(projectRoot, ".author-toolkit/creation/state/current.md"),
    "utf8",
  );
  const artifact = (pathValue, sha256 = hash) => ({ path: pathValue, sha256 });
  const passReference = evidence.passReference;
  const revisionExecution = {
    schema_version: "1.0.0",
    execution_id: "execution-time-001",
    cycle_id: null,
    plan: { plan_id: "plan-time-001", ...artifact("sessions/plan-time-001.md") },
    batch: { batch_id: "batch-time-001", ...artifact("sessions/batch-time-001.json") },
    requested_pass: passReference,
    input_scope: evidence.scopeReference,
    target_scope: evidence.scopeReference,
    finding_dispositions: [],
    author_decision_ids: ["PLAN-001"],
    approval_ids: ["EDIT-001"],
    backups: [],
    files: [{
      path: "manuscript/chapter-002.md",
      action: "create",
      input_sha256: null,
      output_sha256: hash,
    }],
    status: "verified",
    created_at: NOW,
    verified_at: NOW,
  };
  const reconciliation = {
    schema_version: "1.0.0",
    reconciliation_id: "reconciliation-time-001",
    cycle_id: null,
    previous_scope: null,
    previous_evaluation: null,
    proof_blockers: [],
    invalidated_evaluations: [],
    invalidated_coverage: [],
    target_scope: null,
    inventory: {
      ...artifact(".author-toolkit/convergence/inventories/time-001.json"),
      inventory_fingerprint: hash,
    },
    change_set: {
      from_scope: null,
      to_scope: null,
      created: [],
      modified: [],
      deleted: [],
      reordered: [],
      evidence_affected: [],
      dependency_affected: [],
    },
    work_set: { entries: [] },
    story_state: [artifact(".author-toolkit/creation/state/current.md")],
    author_decision_id: "IMPORT-001",
    recovery_from_empty: true,
    required_strategy: "write-fiction",
    recovery_operation: "creation-import",
    created_at: NOW,
  };

  return {
    projectRoot,
    manifestPath,
    cases: [
      {
        name: "project manifest",
        option: "--manifest",
        value: manifest,
        fields: [
          "/created_at",
          "/updated_at",
          "/current_scope/created_at",
          "/cycle_operation/created_at",
          "/pending_action/updated_at",
        ],
        manifest: true,
      },
      {
        name: "report",
        option: "--report",
        value: extractReportEnvelope(reportMarkdown),
        fields: ["/created_at"],
        markdown: "report",
      },
      {
        name: "backup manifest",
        option: "--backup-manifest",
        value: await readJson(projectRoot, ".author-toolkit/backups/backup-time-001/manifest.json"),
        fields: ["/created_at"],
      },
      {
        name: "backup index",
        option: "--backup-index",
        value: await readJson(projectRoot, ".author-toolkit/backups/index.json"),
        fields: ["/backups/0/created_at"],
        backupIndex: true,
      },
      {
        name: "scope snapshot",
        option: "--scope-snapshot",
        value: scope,
        fields: ["/created_at", "/author_confirmation/confirmed_at"],
      },
      {
        name: "inventory snapshot",
        option: "--inventory-snapshot",
        value: inventory,
        fields: ["/created_at"],
      },
      {
        name: "convergence cycle",
        option: "--convergence-cycle",
        value: completed.cycle,
        fields: ["/created_at", "/updated_at", "/completion/completed_at"],
      },
      {
        name: "requested pass",
        option: "--requested-pass",
        value: evidence.pass,
        fields: ["/created_at"],
      },
      {
        name: "revision execution",
        option: "--revision-execution",
        value: revisionExecution,
        fields: ["/created_at", "/verified_at"],
      },
      {
        name: "manuscript reconciliation",
        option: "--manuscript-reconciliation",
        value: reconciliation,
        fields: ["/created_at"],
      },
      {
        name: "no-edit skip",
        option: "--no-edit-skip",
        value: evidence.noEditSkip,
        fields: ["/created_at"],
      },
      {
        name: "review group",
        option: "--review-group",
        value: evidence.reviewGroup,
        fields: ["/created_at"],
      },
      {
        name: "semantic attestation",
        option: "--semantic-attestation",
        value: evidence.hostAttestation,
        fields: ["/created_at"],
      },
      {
        name: "convergence evaluation",
        option: "--convergence-evaluation",
        value: completed.evaluation,
        fields: ["/created_at"],
      },
      {
        name: "creation batch",
        option: "--creation-batch",
        value: await readJson(projectRoot, publication.batchReference.path),
        fields: ["/created_at", "/updated_at"],
      },
      {
        name: "creation commit",
        option: "--creation-commit",
        value: await readJson(projectRoot, publication.commitReference.path),
        fields: ["/created_at", "/updated_at"],
      },
      {
        name: "coverage unit",
        option: "--coverage-unit",
        value: evidence.coverageUnits[0].unit,
        fields: ["/created_at"],
      },
      {
        name: "coverage index",
        option: "--coverage-index",
        value: await readJson(projectRoot, evidence.coverageIndexReference.path),
        fields: ["/updated_at"],
      },
      {
        name: "review job",
        option: "--review-job",
        value: evidence.reviewJobs[0].job,
        fields: ["/created_at", "/updated_at"],
      },
      {
        name: "reader state",
        option: "--reader-state",
        value: evidence.reviewStates[0].state,
        fields: ["/updated_at"],
      },
      {
        name: "story state",
        option: "--story-state",
        value: extractReportEnvelope(storyMarkdown),
        fields: ["/updated_at"],
        markdown: "story",
      },
    ],
  };
}

function runValidator(option, file) {
  return spawnSync(process.execPath, [validator, option, file, "--now", NOW], {
    cwd: root,
    encoding: "utf8",
  });
}

test("installed validation applies one fixed UTC clock and 60-second allowance to every current artifact family", async (t) => {
  const { projectRoot, manifestPath, cases } = await currentArtifacts(t);
  assert.equal(cases.length, 21);
  const fixtures = path.join(projectRoot, "time-fixtures");
  await mkdir(fixtures, { recursive: true });

  for (const [caseIndex, artifactCase] of cases.entries()) {
    for (const field of artifactCase.fields) {
      await t.test(`${artifactCase.name} ${field}`, async () => {
        for (const offset of [0, 60, 61]) {
          const value = structuredClone(artifactCase.value);
          setTimestamp(value, field, atOffset(offset));
          const file = artifactCase.manifest
            ? manifestPath
            : artifactCase.backupIndex
              ? path.join(projectRoot, ".author-toolkit", "backups", "index.json")
              : path.join(
                  fixtures,
                  `${offset > 60 ? "2000" : "2099"}-${caseIndex}-${field.replaceAll("/", "-")}.${artifactCase.markdown ? "md" : "json"}`,
                );
          if (artifactCase.backupIndex) {
            const manifestReference = artifactCase.value.backups[0].manifest;
            const backupManifest = await readJson(projectRoot, manifestReference.path);
            setTimestamp(backupManifest, "/created_at", atOffset(offset));
            const manifestText = `${JSON.stringify(backupManifest, null, 2)}\n`;
            await writeFile(path.join(projectRoot, manifestReference.path), manifestText, "utf8");
            value.backups[0].manifest.sha256 = createHash("sha256").update(manifestText).digest("hex");
          }
          const contents = artifactCase.markdown
            ? markdownEnvelope(value, artifactCase.markdown === "report")
            : `${JSON.stringify(value, null, 2)}\n`;
          await writeFile(file, contents, "utf8");
          const result = runValidator(artifactCase.option, file);
          if (offset <= 60) {
            assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
            const response = JSON.parse(result.stdout);
            assert.equal(response.valid, true);
            assert.deepEqual(response.errors, []);
          } else {
            assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
            assert.ok(
              result.stderr.includes(field),
              `expected a concrete ${field} diagnostic, received: ${result.stderr}`,
            );
            assert.match(result.stderr, /60 seconds/);
          }
        }
      });
    }
  }
});


test("tracker findings, approvals, and cycle completions share the fixed clock and future allowance", async (t) => {
  const { projectRoot, manifestPath } = await currentArtifacts(t);
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const original = await readFile(trackerPath, "utf8");
  const findingSeparator = "|---|---|---|---|---|---|---|---|\n";
  const findingIndex = original.indexOf(findingSeparator, original.indexOf("## Findings"));
  assert.ok(findingIndex >= 0);
  const families = [
    {
      name: "findings",
      path: "/Findings/0/updated",
      update(markdown, updated) {
        const row = `| TIME-001 | diagnostics | narrative | manuscript/chapter-001.md | open | reports/diagnostics/pass-001-local.md | ${updated} | Author decision is required. |\n`;
        return markdown.slice(0, findingIndex + findingSeparator.length) + row + markdown.slice(findingIndex + findingSeparator.length);
      },
    },
    {
      name: "approvals",
      path: "/Approvals/0/updated",
      update(markdown, updated) {
        return markdown.replace(/^(\| NOEDIT-001 \|.*\| )[^ |]+( \|)$/m, `$1${updated}$2`);
      },
    },
    {
      name: "cycle completions",
      path: "/Cycle completions/0/updated",
      update(markdown, updated) {
        return markdown.replace(/^(\| COMPLETE-001 \|.*\| )[^ |]+( \|)$/m, `$1${updated}$2`);
      },
    },
  ];
  for (const family of families) {
    await t.test(family.name, async (t) => {
      for (const offset of [0, 60, 61, "invalid"]) {
        await t.test(String(offset), async () => {
          const updated = offset === "invalid" ? "not-a-date-time" : atOffset(offset);
          const candidate = family.update(original, updated);
          assert.ok(candidate.includes(updated));
          await writeFile(trackerPath, candidate, "utf8");
          const result = runValidator("--manifest", manifestPath);
          if (offset === 0 || offset === 60) {
            assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
          } else {
            assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
            assert.ok(result.stderr.includes(family.path), result.stderr);
            assert.match(result.stderr, offset === "invalid" ? /date-time|timestamp/i : /60 seconds/);
          }
        });
      }
    });
  }
});


async function fixedClockEvidence(t) {
  const manuscript = "The ferry leaves at dawn.\n";
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await recordScope(projectRoot, {
    scope_id: "scope-fixed-clock",
    description: "The complete manuscript for the injected validation clock.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(manuscript).digest("hex"),
    }],
    excluded_files: [],
    created_at: NOW,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: NOW,
      reading_order_confirmed: true,
    },
    now: new Date(NOW),
  });
  const evidence = await createNoEditEvidence(projectRoot);
  const input = {
    evaluation_id: "evaluation-fixed-clock",
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: [],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  };
  return { projectRoot, evidence, input };
}

test("public evaluation uses the injected clock for nested evidence instead of wall time", async (t) => {
  const { projectRoot, input } = await fixedClockEvidence(t);
  const result = await evaluateDraft(projectRoot, input, { now: new Date(NOW) });
  assert.equal(result.valid, true, JSON.stringify(result.blockers));
});

for (const family of ["report", "requested pass", "semantic attestation", "revision execution", "manifest"]) {
  await test(`injected clock rejects future ${family} evidence`, async (t) => {
    const { projectRoot, evidence, input } = await fixedClockEvidence(t);
    if (family === "report") {
      const reference = evidence.reports[0];
      const reportPath = path.join(projectRoot, reference.path);
      const markdown = await readFile(reportPath, "utf8");
      const envelope = JSON.parse(markdown.match(/```json\n([\s\S]+?)\n```/)[1]);
      envelope.created_at = atOffset(61);
      await writeFile(reportPath, markdown.replace(/```json\n[\s\S]+?\n```/, `\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\``), "utf8");
      reference.sha256 = createHash("sha256").update(await readFile(reportPath)).digest("hex");
    } else if (family === "requested pass") {
      evidence.pass.created_at = atOffset(61);
      await writeJson(path.join(projectRoot, evidence.passReference.path), evidence.pass);
      evidence.passReference.sha256 = createHash("sha256").update(await readFile(path.join(projectRoot, evidence.passReference.path))).digest("hex");
    } else if (family === "semantic attestation") {
      evidence.hostAttestation.created_at = atOffset(61);
      await writeJson(path.join(projectRoot, evidence.hostAttestationReference.path), evidence.hostAttestation);
      evidence.hostAttestationReference.sha256 = createHash("sha256").update(await readFile(path.join(projectRoot, evidence.hostAttestationReference.path))).digest("hex");
    } else if (family === "revision execution") {
      const { execution } = await createRevisionExecutionFixture(projectRoot, {
        requestedPass: evidence.passReference,
        inputScope: evidence.scopeReference,
      });
      execution.status = "verified";
      execution.created_at = atOffset(61);
      execution.verified_at = atOffset(61);
      const relative = ".author-toolkit/convergence/executions/execution-fixed-clock.json";
      await writeJson(path.join(projectRoot, relative), execution);
      input.revision_executions.push({
        execution_id: execution.execution_id,
        path: relative,
        sha256: createHash("sha256").update(await readFile(path.join(projectRoot, relative))).digest("hex"),
      });
    } else {
      const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifest.updated_at = atOffset(61);
      await writeJson(manifestPath, manifest);
    }

    if (family === "manifest") {
      await assert.rejects(evaluateDraft(projectRoot, input, { now: new Date(NOW) }), (error) =>
        error.projectCode === "project-state-invalid" && /60 seconds/.test(error.message)
      );
    } else {
      const result = await evaluateDraft(projectRoot, input, { now: new Date(NOW) });
      assert.equal(result.valid, false, JSON.stringify(result.blockers));
      assert.match(JSON.stringify(result.blockers), /60 seconds/);
    }
  });
}

test("scope recording validates nested snapshots with the injected clock", async (t) => {
  const manuscript = "The ferry leaves at dawn.\n";
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await assert.rejects(recordScope(projectRoot, {
    scope_id: "scope-fixed-clock-future",
    description: "A nested scope snapshot beyond the injected allowance.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(manuscript).digest("hex"),
    }],
    excluded_files: [],
    created_at: atOffset(61),
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: NOW,
      reading_order_confirmed: true,
    },
    now: new Date(NOW),
  }), /60 seconds/);
});


test("convergence status applies the injected clock to historical evaluations", async (t) => {
  const { projectRoot, input } = await fixedClockEvidence(t);
  const evaluated = await evaluateDraft(projectRoot, input, { now: new Date(NOW) });
  assert.equal(evaluated.valid, true, JSON.stringify(evaluated.blockers));
  const evaluation = await readJson(projectRoot, evaluated.evaluation_reference.path);
  evaluation.created_at = atOffset(61);
  await writeJson(path.join(projectRoot, evaluated.evaluation_reference.path), evaluation);

  const status = await getCycleStatus(projectRoot, { now: new Date(NOW) });

  assert.equal(status.query_valid, false, JSON.stringify(status.blockers));
  assert.match(JSON.stringify(status.blockers), /60 seconds/);
});
