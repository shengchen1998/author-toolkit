import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { root } from "./helpers.mjs";

export const timestamp = "2026-11-05T00:00:00Z";
export const authorProjectCli = path.join(root, "scripts", "author-project.mjs");

export function manifestV32() {
  return {
    schema_version: "3.2.0",
    project_type: "fiction",
    language: "en",
    manuscript_root: "manuscript",
    paths: {
      story_bible: "story-bible.md",
      audit_tracker: "audit-tracker.md",
      reports: "reports",
      sessions: "sessions",
      backups: ".author-toolkit/backups",
      handoffs: ".author-toolkit/handoffs",
      creation: ".author-toolkit/creation",
      convergence: ".author-toolkit/convergence",
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

export async function createConvergenceProject(t, { manuscripts = [] } = {}) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "convergence-cycle-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  for (const directory of [
    ".author-toolkit/convergence",
    ".author-toolkit/backups",
    ".author-toolkit/handoffs",
    ".author-toolkit/creation",
    "manuscript",
    "reports",
    "sessions",
  ]) {
    await mkdir(path.join(projectRoot, directory), { recursive: true });
  }
  await writeFile(path.join(projectRoot, "story-bible.md"), "Story\n", "utf8");
  const tracker = await readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
  await writeFile(path.join(projectRoot, "audit-tracker.md"), tracker, "utf8");
  for (const file of manuscripts) {
    const target = path.join(projectRoot, "manuscript", file.name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents, "utf8");
  }
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  await writeJson(manifestPath, manifestV32());
  return { projectRoot, manifestPath };
}

export function runAuthorProject(args) {
  return spawnSync(process.execPath, [authorProjectCli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}


export function runValidator(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "validate.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}


export async function runAuthorProjectAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [authorProjectCli, ...args], {
      cwd: root,
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
    child.once("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}


export async function fileSha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function artifactAt(projectRoot, relativePath) {
  return { path: relativePath, sha256: await fileSha256(path.join(projectRoot, relativePath)) };
}

export async function currentScopeReference(projectRoot) {
  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"),
  );
  const scope = manifest.current_scope;
  return {
    scope_id: scope.scope_id,
    scope_fingerprint: scope.scope_fingerprint,
    snapshot_path: scope.snapshot_path,
    snapshot_sha256: scope.snapshot_sha256,
  };
}

function requestedPassFingerprint(pass) {
  return createHash("sha256").update(JSON.stringify({
    target_scope: {
      scope_id: pass.target_scope.scope_id,
      scope_fingerprint: pass.target_scope.scope_fingerprint,
    },
    required_operations: pass.required_operations,
    paths: pass.paths,
    language: pass.language,
    dependencies: pass.dependencies,
    inapplicability: pass.inapplicability,
    narrowing: pass.narrowing
      ? { reason: pass.narrowing.reason, gaps: pass.narrowing.gaps }
      : null,
    baseline_pass: pass.baseline_pass
      ? {
          pass_id: pass.baseline_pass.pass_id,
          pass_fingerprint: pass.baseline_pass.pass_fingerprint,
        }
      : null,
    requested_subchecks: pass.requested_subchecks.map(({ operation, subcheck }) => ({
      operation,
      subcheck,
    })),
  })).digest("hex");
}

async function appendTrackerApproval(projectRoot, approval) {
  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  const tracker = await readFile(trackerPath, "utf8");
  const separator = "|---|---|---|---|---|---|---|---|\n";
  const index = tracker.indexOf(separator, tracker.indexOf("## Approvals"));
  if (index < 0) throw new Error("Approvals table is unavailable");
  const insertAt = index + separator.length;
  const paths = approval.paths.map((value) => `\`${value}\``).join(", ");
  const row = `| ${approval.id} | ${approval.type} | ${approval.operation} | ${approval.scopeId} | ${paths} | approved | ${approval.reason} | ${timestamp} |\n`;
  await writeFile(trackerPath, tracker.slice(0, insertAt) + row + tracker.slice(insertAt), "utf8");
}

const coverageOperations = ["diagnostics", "characters", "prose", "ai-cleanup"];
const reviewPerspectives = ["intent", "standards", "fresh"];

export async function createNoEditEvidence(projectRoot, options = {}) {
  const passId = options.passId ?? "pass-001";
  const numericSuffix = passId.match(/[0-9]+/g)?.join("-") ?? "001";
  const scopeReference = await currentScopeReference(projectRoot);
  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, ".author-toolkit", "project.json"), "utf8"),
  );
  const paths = manifest.current_scope.files.map((file) => file.path);
  const versionedPaths = manifest.current_scope.files.map(({ path: filePath, sha256 }) => ({
    path: filePath,
    sha256,
  }));
  const dependency = await artifactAt(projectRoot, "story-bible.md");
  const requestedSubchecks = options.requestedSubchecks ?? [];
  let baselinePass = null;
  let baselinePassRecord = null;
  if (options.baselinePass) {
    baselinePass = options.baselinePass;
    baselinePassRecord = JSON.parse(
      await readFile(path.join(projectRoot, baselinePass.path), "utf8"),
    );
  }

  const defaultSubchecks = {
    intake: ["manuscript-inventory"],
    "draft-baseline": ["observed-facts"],
    diagnostics: ["causality"],
    characters: ["continuity"],
    "revision-plan": ["accepted-findings"],
    "chapter-revision": ["approved-batches"],
    prose: ["sentence-mechanics"],
    "ai-cleanup": ["ai-associated-patterns"],
    "current-scope-review": ["intent", "standards", "fresh"],
  };
  const operationOrder = Object.keys(defaultSubchecks);
  const requiredByOperation = new Map();
  const sourceOperations = baselinePassRecord
    ? baselinePassRecord.required_operations
    : operationOrder.map((operation) => ({
        operation,
        paths,
        subchecks: defaultSubchecks[operation],
      }));
  for (const requirement of sourceOperations) {
    requiredByOperation.set(requirement.operation, new Set(requirement.subchecks));
  }
  for (const request of requestedSubchecks) {
    if (!requiredByOperation.has(request.operation)) {
      requiredByOperation.set(request.operation, new Set());
    }
    requiredByOperation.get(request.operation).add(request.subcheck);
    await appendTrackerApproval(projectRoot, {
      id: request.author_decision_id,
      type: "requested-subcheck",
      operation: request.operation,
      scopeId: scopeReference.scope_id,
      paths,
      reason: `Author requested ${request.subcheck} for ${request.operation}.`,
    });
  }
  const requiredOperations = [...requiredByOperation.entries()]
    .sort(([left], [right]) => {
      const leftIndex = operationOrder.indexOf(left);
      const rightIndex = operationOrder.indexOf(right);
      return (leftIndex < 0 ? operationOrder.length : leftIndex) -
        (rightIndex < 0 ? operationOrder.length : rightIndex) || left.localeCompare(right);
    })
    .map(([operation, subchecks]) => ({
      operation,
      paths,
      subchecks: [...subchecks].sort(),
    }));
  if (options.narrowing) {
    await appendTrackerApproval(projectRoot, {
      id: options.narrowing.author_decision_id,
      type: "requested-pass-narrowing",
      operation: "intake",
      scopeId: scopeReference.scope_id,
      paths,
      reason: options.narrowing.reason,
    });
  }
  const pass = {
    schema_version: "1.0.0",
    pass_id: passId,
    pass_fingerprint: "",
    target_scope: scopeReference,
    required_operations: requiredOperations,
    paths,
    language: manifest.language,
    dependencies: [dependency],
    inapplicability: [],
    narrowing: options.narrowing ?? null,
    baseline_pass: baselinePass,
    requested_subchecks: [...requestedSubchecks].sort((left, right) =>
      left.operation.localeCompare(right.operation) || left.subcheck.localeCompare(right.subcheck)
    ),
    created_at: timestamp,
  };
  pass.pass_fingerprint = requestedPassFingerprint(pass);
  const passRelative = `.author-toolkit/convergence/passes/${passId}-${pass.pass_fingerprint}.json`;
  await writeJson(path.join(projectRoot, passRelative), pass);
  const passReference = {
    pass_id: passId,
    pass_fingerprint: pass.pass_fingerprint,
    ...(await artifactAt(projectRoot, passRelative)),
  };

  const noEditDecisionId = options.noEditDecisionId ?? `NOEDIT-${numericSuffix}`;
  await appendTrackerApproval(projectRoot, {
    id: noEditDecisionId,
    type: "no-edit-skip",
    operation: "revision-plan",
    scopeId: scopeReference.scope_id,
    paths,
    reason: "Author confirmed that no accepted finding requires a manuscript edit.",
  });

  async function writeReport(
    reportId,
    stage,
    reportPath,
    subchecks = ["full-review"],
    reportFiles = versionedPaths,
  ) {
    const envelope = {
      schema_version: "2.0.0",
      report_id: reportId,
      audit: `${stage} audit`,
      stage,
      created_at: timestamp,
      language: manifest.language,
      skill: { name: "revise-draft", version: "3.2.0" },
      inputs: reportFiles.map((file) => ({
        path: file.path,
        version: file.sha256,
        version_type: "sha256",
      })),
      engine: {
        name: "conversational",
        version: "host-test",
        degraded: false,
        notes: `scope_id=${scopeReference.scope_id} operation_coverage=full subchecks=${subchecks.join(",")} coverage=full language=full`,
      },
      scope_id: scopeReference.scope_id,
      scope_fingerprint: scopeReference.scope_fingerprint,
      requested_pass: passReference,
      findings: reportId === `${passId}-diagnostics-local` ? (options.findings ?? []) : [],
    };
    const markdown = `# ${reportId}\n\n## Language coverage\n\nfull\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;
    await mkdir(path.dirname(path.join(projectRoot, reportPath)), { recursive: true });
    await writeFile(path.join(projectRoot, reportPath), markdown, "utf8");
    return { report_id: reportId, ...(await artifactAt(projectRoot, reportPath)) };
  }

  const reports = [];
  reports.push(await writeReport(
    `${passId}-intake`,
    "intake",
    `reports/intake/${passId}.md`,
    ["manuscript-inventory"],
  ));
  reports.push(await writeReport(
    `${passId}-baseline`,
    "draft-baseline",
    `reports/draft-baseline/${passId}.md`,
    ["observed-facts"],
  ));

  const coverageUnits = [];
  const coverageEntries = [];
  const coverageArtifacts = [];
  for (const operation of coverageOperations) {
    const requirement = requiredOperations.find((entry) => entry.operation === operation);
    const reused = (options.reusedCoverageUnits ?? []).filter(
      ({ unit }) => unit.operation === operation,
    );
    const reusedPaths = new Set(reused.flatMap(({ unit }) => unit.paths.map((file) => file.path)));
    const localPaths = versionedPaths.filter((file) => !reusedPaths.has(file.path));
    const unitReferences = reused.map(({ reference }) => ({
      unit_id: reference.unit_id,
      path: reference.path,
      sha256: reference.sha256,
    }));
    coverageUnits.push(...reused);
    for (const entry of reused) {
      coverageArtifacts.push(entry.sourceReport, entry.reference);
    }
    if (localPaths.length > 0) {
      const localReport = await writeReport(
        `${passId}-${operation}-local`,
        operation,
        `reports/${operation}/${passId}-local.md`,
        requirement.subchecks,
        localPaths,
      );
      const unit = {
        schema_version: "1.0.0",
        unit_id: `${passId}-${operation}-local`,
        source_report: localReport.path,
        source_report_sha256: localReport.sha256,
        scope_id: scopeReference.scope_id,
        operation,
        kind: "local",
        paths: localPaths,
        subchecks: requirement.subchecks,
        dependencies: [dependency],
        coverage: "full",
        created_at: timestamp,
      };
      const unitRelative = `reports/coverage/${unit.unit_id}.json`;
      await writeJson(path.join(projectRoot, unitRelative), unit);
      const unitReference = {
        unit_id: unit.unit_id,
        ...(await artifactAt(projectRoot, unitRelative)),
      };
      coverageUnits.push({ unit, reference: unitReference, sourceReport: localReport });
      coverageArtifacts.push(localReport, unitReference);
      unitReferences.push({
        unit_id: unit.unit_id,
        path: unitReference.path,
        sha256: unitReference.sha256,
      });
    }

    const synthesisReport = await writeReport(
      `${passId}-${operation}-synthesis`,
      operation,
      `reports/${operation}/${passId}-synthesis.md`,
      requirement.subchecks,
    );
    coverageArtifacts.push(synthesisReport);
    coverageEntries.push({
      operation,
      units: unitReferences,
      synthesis_report: synthesisReport.path,
      synthesis_report_sha256: synthesisReport.sha256,
      synthesis_coverage: "full",
    });
  }
  const coverageIndex = {
    schema_version: "1.0.0",
    scope_id: scopeReference.scope_id,
    scope_fingerprint: scopeReference.scope_fingerprint,
    requested_pass: passReference,
    entries: coverageEntries,
    updated_at: timestamp,
  };
  const coverageIndexRelative = `reports/coverage/${passId}-index.json`;
  await writeJson(path.join(projectRoot, coverageIndexRelative), coverageIndex);
  const coverageIndexReference = await artifactAt(projectRoot, coverageIndexRelative);

  const reviewJobs = [];
  const reviewStates = [];
  const reviewReports = [];
  const reviewJobInputs = [];
  for (const perspective of reviewPerspectives) {
    const jobId = `${passId}-${perspective}-review`;
    const chunkReport = await writeReport(
      `${jobId}-chunk-report`,
      "current-scope-review",
      `reports/current-scope-review/${passId}/${perspective}/chunk.md`,
      [perspective],
    );
    const volumeReport = await writeReport(
      `${jobId}-volume-report`,
      "current-scope-review",
      `reports/current-scope-review/${passId}/${perspective}/volume.md`,
      [perspective],
    );
    const bookReport = await writeReport(
      `${jobId}-book-report`,
      "current-scope-review",
      `reports/current-scope-review/${passId}/${perspective}/book.md`,
      [perspective],
    );
    reviewReports.push(chunkReport, volumeReport, bookReport);
    const files = [];
    const sources = [];
    for (const file of manifest.current_scope.files) {
      const text = await readFile(path.join(projectRoot, file.path), "utf8");
      const lineCount = text.split(/\r?\n/).length;
      files.push({ path: file.path, sha256: file.sha256, line_count: lineCount });
      sources.push({
        path: file.path,
        sha256: file.sha256,
        line_start: 1,
        line_end: lineCount,
      });
    }
    const stateRelative = `.author-toolkit/convergence/review-readers/${jobId}.json`;
    const job = {
      schema_version: "1.0.0",
      job_id: jobId,
      mode: "current-scope",
      perspective,
      scope_id: scopeReference.scope_id,
      status: "complete",
      coverage: "full",
      files,
      chunks: [{
        chunk_id: `${jobId}-chunk`,
        sequence: 1,
        status: "complete",
        sources,
        report: chunkReport.path,
      }],
      volumes: [{
        volume_id: `${jobId}-volume`,
        chunk_ids: [`${jobId}-chunk`],
        status: "complete",
        report: volumeReport.path,
      }],
      book: {
        volume_ids: [`${jobId}-volume`],
        status: "complete",
        report: bookReport.path,
      },
      context_budget: { profile: "full-manuscript-test", estimate_tokens: 12000 },
      next_chunk_id: null,
      reviewer_state_path: stateRelative,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const jobRelative = `.author-toolkit/convergence/review-jobs/${jobId}.json`;
    await writeJson(path.join(projectRoot, jobRelative), job);
    const jobReference = { job_id: jobId, ...(await artifactAt(projectRoot, jobRelative)) };
    const state = {
      schema_version: "1.0.0",
      state_id: `${jobId}-reader`,
      job_id: jobId,
      scope_id: scopeReference.scope_id,
      perspective,
      status: "complete",
      next_sequence: 2,
      chunks: [{
        chunk_id: job.chunks[0].chunk_id,
        sequence: 1,
        sources,
        report: chunkReport.path,
      }],
      summary: `${perspective} reader completed the target scope.`,
      open_questions: [],
      updated_at: timestamp,
    };
    await writeJson(path.join(projectRoot, stateRelative), state);
    const stateReference = {
      state_id: state.state_id,
      ...(await artifactAt(projectRoot, stateRelative)),
    };
    reviewJobs.push({ job, reference: jobReference });
    reviewStates.push({ state, reference: stateReference });
    reviewJobInputs.push({
      perspective,
      job: jobReference,
      reader_state: stateReference,
    });
  }

  const freshAttestation = {
    schema_version: "1.0.0",
    attestation_id: `${passId}-fresh-attestation`,
    attester: { id: `${passId}-logical-reviewer`, role: "logical-reviewer" },
    pass_id: passId,
    pass_fingerprint: pass.pass_fingerprint,
    scope_id: scopeReference.scope_id,
    scope_fingerprint: scopeReference.scope_fingerprint,
    claims: [{
      claim_type: "fresh-reader-continuity",
      subject: reviewJobs[2].job.job_id,
      verdict: "confirmed",
      statement: "One logical reviewer read every fresh chunk in order using only this reader state.",
      artifacts: [reviewJobs[2].reference, reviewStates[2].reference].map(({ path, sha256 }) => ({ path, sha256 })),
    }],
    created_at: timestamp,
  };
  const freshAttestationRelative = `.author-toolkit/convergence/attestations/${freshAttestation.attestation_id}.json`;
  await writeJson(path.join(projectRoot, freshAttestationRelative), freshAttestation);
  const freshAttestationReference = {
    attestation_id: freshAttestation.attestation_id,
    ...(await artifactAt(projectRoot, freshAttestationRelative)),
  };
  const reviewGroup = {
    schema_version: "1.0.0",
    review_group_id: `${passId}-review-group`,
    requested_pass: passReference,
    scope_fingerprint: scopeReference.scope_fingerprint,
    jobs: reviewJobInputs,
    reports: reviewReports,
    fresh_reader_attestation: freshAttestationReference,
    created_at: timestamp,
  };
  const reviewGroupRelative = `.author-toolkit/convergence/review-groups/${reviewGroup.review_group_id}.json`;
  await writeJson(path.join(projectRoot, reviewGroupRelative), reviewGroup);
  const reviewGroupReference = {
    review_group_id: reviewGroup.review_group_id,
    ...(await artifactAt(projectRoot, reviewGroupRelative)),
  };

  const hostAttestation = {
    schema_version: "1.0.0",
    attestation_id: `${passId}-host-attestation`,
    attester: { id: `${passId}-host`, role: "host" },
    pass_id: passId,
    pass_fingerprint: pass.pass_fingerprint,
    scope_id: scopeReference.scope_id,
    scope_fingerprint: scopeReference.scope_fingerprint,
    claims: [
      {
        claim_type: "coverage-semantics",
        subject: passId,
        verdict: "confirmed",
        statement: "The requested operations and applicable subchecks were actually performed for the recorded paths.",
        artifacts: [passReference, coverageIndexReference, ...coverageArtifacts].map(({ path, sha256 }) => ({ path, sha256 })),
      },
      {
        claim_type: "review-semantics",
        subject: reviewGroup.review_group_id,
        verdict: "confirmed",
        statement: "The three review perspectives actually read the manuscript and completed their syntheses.",
        artifacts: [
          reviewGroupReference,
          ...reviewJobs.map(({ reference }) => reference),
          ...reviewStates.map(({ reference }) => reference),
          ...reviewReports,
        ].map(({ path, sha256 }) => ({ path, sha256 })),
      },
    ],
    created_at: timestamp,
  };
  const hostAttestationRelative = `.author-toolkit/convergence/attestations/${hostAttestation.attestation_id}.json`;
  await writeJson(path.join(projectRoot, hostAttestationRelative), hostAttestation);
  const hostAttestationReference = {
    attestation_id: hostAttestation.attestation_id,
    ...(await artifactAt(projectRoot, hostAttestationRelative)),
  };

  const noEditSkip = {
    schema_version: "1.0.0",
    skip_id: `${passId}-no-edit`,
    requested_pass: passReference,
    scope_fingerprint: scopeReference.scope_fingerprint,
    operations: ["revision-plan", "chapter-revision"],
    covered_findings: (options.findings ?? []).map((finding) => finding.id),
    author_decision_id: noEditDecisionId,
    reason: "No accepted finding requires an edit in this requested pass.",
    created_at: timestamp,
  };
  const noEditRelative = `.author-toolkit/convergence/no-edit-skips/${noEditSkip.skip_id}.json`;
  await writeJson(path.join(projectRoot, noEditRelative), noEditSkip);
  const noEditReference = {
    skip_id: noEditSkip.skip_id,
    ...(await artifactAt(projectRoot, noEditRelative)),
  };
  if ((options.findings ?? []).length > 0) {
    const trackerPath = path.join(projectRoot, "audit-tracker.md");
    let tracker = await readFile(trackerPath, "utf8");
    const separator = "|---|---|---|---|---|---|---|---|\n";
    for (const finding of options.findings) {
      const decision = options.findingStatuses?.[finding.id] ?? {
        status: "deferred",
        reason: "Author deferred the finding with its consequence recorded.",
      };
      const row = `| ${finding.id} | diagnostics | narrative | manuscript/chapter-001.md | ${decision.status} | reports/diagnostics/${passId}-local.md | ${timestamp} | ${decision.reason} |\n`;
      const existing = new RegExp(`^\\| ${finding.id} \\|.*\\|$`, "m");
      if (existing.test(tracker)) {
        tracker = tracker.replace(existing, row.trimEnd());
      } else {
        const index = tracker.indexOf(separator, tracker.indexOf("## Findings"));
        tracker = tracker.slice(0, index + separator.length) + row + tracker.slice(index + separator.length);
      }
    }
    await writeFile(trackerPath, tracker, "utf8");
  }

  return {
    pass,
    passReference,
    scopeReference,
    coverageIndexReference,
    reports,
    coverageUnits,
    reviewJobs,
    reviewStates,
    reviewReports,
    reviewGroup,
    reviewGroupReference,
    hostAttestation,
    hostAttestationReference,
    freshAttestationReference,
    noEditSkip,
    noEditReference,
    evaluationInput(evaluationId, expectedRevision, cycleId = "cycle-bootstrap-001") {
      return {
        cycle_id: cycleId,
        expected_revision: expectedRevision,
        evaluation_id: evaluationId,
        coverage_index: coverageIndexReference,
        reports,
        review_group: reviewGroupReference,
        semantic_attestations: [hostAttestationReference, freshAttestationReference],
      };
    },
  };
}
