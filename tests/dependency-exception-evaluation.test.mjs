import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  artifactAt,
  createConvergenceProject,
  createNoEditEvidence,
  runInput,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

const manuscript = "The ferry leaves at dawn.\nMara watches it go.\n";
const dependencyPath = "reports/draft-baseline/baseline.md";

async function createProject(t, selectedDependencyPath = dependencyPath) {
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await mkdir(path.dirname(path.join(projectRoot, selectedDependencyPath)), { recursive: true });
  await writeFile(
    path.join(projectRoot, selectedDependencyPath),
    "Observed fact: Mara watches the ferry.\n",
    "utf8",
  );
  await recordScope(projectRoot, {
    scope_id: "scope-001",
    description: "The complete current manuscript.",
    status: "confirmed",
    files: [{
      path: "manuscript/chapter-001.md",
      sha256: createHash("sha256").update(manuscript).digest("hex"),
    }],
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: "SCOPE-001",
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  return projectRoot;
}

async function evaluate(projectRoot, evidence, evaluationId, options = {}) {
  return runInput(projectRoot, "evaluate-draft", {
    evaluation_id: evaluationId,
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: options.coverageIndexReference ?? evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: [],
    semantic_attestations: options.semanticAttestations ?? [
      evidence.hostAttestationReference,
      evidence.freshAttestationReference,
    ],
  });
}

async function publishException(projectRoot, sourceEvidence, evidence, options = {}) {
  const exceptionDependencyPath = options.dependencyPath ?? dependencyPath;
  const operation = options.operation ?? "draft-baseline";
  const source = sourceEvidence.coverageUnits.find(
    ({ unit }) => unit.operation === "diagnostics",
  );
  const currentDependency = evidence.pass.dependencies.find(
    (dependency) => dependency.path === exceptionDependencyPath,
  );
  const sourceDependency = source.unit.dependencies.find(
    (dependency) => dependency.path === exceptionDependencyPath,
  );
  const attestation = {
    schema_version: "1.0.0",
    attestation_id: `${evidence.pass.pass_id}-dependency-copyedit`,
    attester: { id: `${evidence.pass.pass_id}-host`, role: "host" },
    pass_id: evidence.pass.pass_id,
    pass_fingerprint: evidence.pass.pass_fingerprint,
    scope_id: evidence.scopeReference.scope_id,
    scope_fingerprint: evidence.scopeReference.scope_fingerprint,
    claims: [{
      claim_type: "dependency-copyedit",
      subject: source.unit.unit_id,
      verdict: "confirmed",
      statement: `The ${operation} copyedit changed punctuation without changing meaning.`,
      artifacts: [source.reference, evidence.passReference, currentDependency]
        .map(({ path: artifactPath, sha256 }) => ({ path: artifactPath, sha256 })),
    }],
    created_at: timestamp,
  };
  const attestationRelative = `.author-toolkit/convergence/attestations/${attestation.attestation_id}.json`;
  await writeJson(path.join(projectRoot, attestationRelative), attestation);
  const attestationReference = {
    attestation_id: attestation.attestation_id,
    ...(await artifactAt(projectRoot, attestationRelative)),
  };

  const unit = {
    ...source.unit,
    dependency_exception: {
      unit_id: source.unit.unit_id,
      requested_pass: { ...evidence.passReference },
      dependency_path: exceptionDependencyPath,
      old_sha256: sourceDependency.sha256,
      new_sha256: currentDependency.sha256,
      operation,
      reason: `The ${operation} copyedit corrected punctuation without changing meaning.`,
      semantic_attestation: attestationReference,
    },
  };
  const unitRelative = `reports/coverage/${unit.unit_id}-${evidence.pass.pass_id}-exception.json`;
  await writeJson(path.join(projectRoot, unitRelative), unit);
  const unitReference = {
    unit_id: unit.unit_id,
    ...(await artifactAt(projectRoot, unitRelative)),
  };

  const coverageIndex = JSON.parse(
    await readFile(path.join(projectRoot, evidence.coverageIndexReference.path), "utf8"),
  );
  const entry = coverageIndex.entries.find((candidate) => candidate.operation === "diagnostics");
  entry.units = entry.units.map((reference) =>
    reference.unit_id === unit.unit_id ? unitReference : reference
  );
  await writeJson(
    path.join(projectRoot, evidence.coverageIndexReference.path),
    coverageIndex,
  );
  const coverageIndexReference = await artifactAt(
    projectRoot,
    evidence.coverageIndexReference.path,
  );

  const hostAttestation = structuredClone(evidence.hostAttestation);
  const coverageClaim = hostAttestation.claims.find(
    (claim) => claim.claim_type === "coverage-semantics",
  );
  coverageClaim.artifacts = coverageClaim.artifacts.map((artifact) => {
    if (artifact.path === source.reference.path) {
      return { path: unitReference.path, sha256: unitReference.sha256 };
    }
    if (artifact.path === coverageIndexReference.path) {
      return { path: coverageIndexReference.path, sha256: coverageIndexReference.sha256 };
    }
    return artifact;
  });
  await writeJson(
    path.join(projectRoot, evidence.hostAttestationReference.path),
    hostAttestation,
  );
  const hostAttestationReference = {
    attestation_id: hostAttestation.attestation_id,
    ...(await artifactAt(projectRoot, evidence.hostAttestationReference.path)),
  };
  return {
    attestation,
    attestationReference,
    coverageIndexReference,
    hostAttestation,
    hostAttestationReference,
    source,
    unit,
    unitReference,
  };
}

async function refreshPublication(projectRoot, evidence, published) {
  await writeJson(
    path.join(projectRoot, published.attestationReference.path),
    published.attestation,
  );
  published.attestationReference.sha256 = await artifactAt(
    projectRoot,
    published.attestationReference.path,
  ).then((reference) => reference.sha256);
  published.unit.dependency_exception.semantic_attestation = published.attestationReference;
  await writeJson(path.join(projectRoot, published.unitReference.path), published.unit);
  published.unitReference.sha256 = await artifactAt(
    projectRoot,
    published.unitReference.path,
  ).then((reference) => reference.sha256);

  const coverageIndex = JSON.parse(
    await readFile(path.join(projectRoot, evidence.coverageIndexReference.path), "utf8"),
  );
  for (const entry of coverageIndex.entries) {
    for (const reference of entry.units) {
      if (reference.unit_id === published.unit.unit_id) {
        reference.sha256 = published.unitReference.sha256;
      }
    }
  }
  await writeJson(path.join(projectRoot, evidence.coverageIndexReference.path), coverageIndex);
  published.coverageIndexReference.sha256 = await artifactAt(
    projectRoot,
    evidence.coverageIndexReference.path,
  ).then((reference) => reference.sha256);

  const coverageClaim = published.hostAttestation.claims.find(
    (claim) => claim.claim_type === "coverage-semantics",
  );
  for (const artifact of coverageClaim.artifacts) {
    if (artifact.path === published.unitReference.path) {
      artifact.sha256 = published.unitReference.sha256;
    }
    if (artifact.path === published.coverageIndexReference.path) {
      artifact.sha256 = published.coverageIndexReference.sha256;
    }
  }
  await writeJson(
    path.join(projectRoot, published.hostAttestationReference.path),
    published.hostAttestation,
  );
  published.hostAttestationReference.sha256 = await artifactAt(
    projectRoot,
    published.hostAttestationReference.path,
  ).then((reference) => reference.sha256);
}

async function copyeditEvaluation(t, options) {
  const projectRoot = await createProject(t, options.dependencyPath);
  const sourceEvidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-001",
    dependencyPath: options.dependencyPath,
  });
  const sourceEvaluation = await evaluate(projectRoot, sourceEvidence, "evaluation-001");
  assert.equal(sourceEvaluation.status, 0, `${sourceEvaluation.stdout}\n${sourceEvaluation.stderr}`);
  await writeFile(
    path.join(projectRoot, options.dependencyPath),
    "Observed fact: Mara watches the ferry!\n",
    "utf8",
  );
  const evidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-002",
    dependencyPath: options.dependencyPath,
    baselinePass: sourceEvidence.passReference,
    reusedCoverageUnits: [sourceEvidence.coverageUnits.find(
      ({ unit }) => unit.operation === "diagnostics",
    )],
  });
  if (options.skipException) {
    const evaluated = await evaluate(projectRoot, evidence, "evaluation-002");
    return {
      evaluated,
      evidence,
      published: null,
      projectRoot,
      sourceEvidence,
      sourceEvaluationResult: JSON.parse(sourceEvaluation.stdout),
    };
  }
  const published = await publishException(projectRoot, sourceEvidence, evidence, options);
  if (options.afterPublication) {
    await options.afterPublication({
      evidence,
      projectRoot,
      published,
      sourceEvidence,
      sourceEvaluationResult: JSON.parse(sourceEvaluation.stdout),
    });
    await refreshPublication(projectRoot, evidence, published);
  }
  if (options.afterRefresh) {
    await options.afterRefresh({ evidence, projectRoot, published, sourceEvidence });
  }
  const evaluated = await evaluate(projectRoot, evidence, "evaluation-002", {
    coverageIndexReference: published.coverageIndexReference,
    semanticAttestations: [
      published.hostAttestationReference,
      evidence.freshAttestationReference,
      ...(options.includeDependencyAttestation === false ? [] : [published.attestationReference]),
    ],
  });
  return {
    evaluated,
    evidence,
    published,
    projectRoot,
    sourceEvidence,
    sourceEvaluationResult: JSON.parse(sourceEvaluation.stdout),
  };
}

test("an attested baseline copyedit publishes a new unit version without rewriting history", async (t) => {
  const projectRoot = await createProject(t);
  const sourceEvidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-001",
    dependencyPath,
  });
  const sourceEvaluation = await evaluate(projectRoot, sourceEvidence, "evaluation-001");
  assert.equal(sourceEvaluation.status, 0, `${sourceEvaluation.stdout}\n${sourceEvaluation.stderr}`);
  const sourceEvaluationResult = JSON.parse(sourceEvaluation.stdout);
  assert.equal(sourceEvaluationResult.evaluation.outcome, "satisfied");
  const historicalEvaluation = await readFile(sourceEvaluationResult.evaluation_path, "utf8");
  const sourceUnit = sourceEvidence.coverageUnits.find(
    ({ unit }) => unit.operation === "diagnostics",
  );
  const historicalUnit = await readFile(path.join(projectRoot, sourceUnit.reference.path), "utf8");
  const unrelatedHistoricalUnit = sourceEvidence.coverageUnits.find(
    ({ unit }) => unit.operation === "characters",
  );

  await writeFile(
    path.join(projectRoot, dependencyPath),
    "Observed fact: Mara watches the ferry!\n",
    "utf8",
  );
  const evidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-002",
    dependencyPath,
    baselinePass: sourceEvidence.passReference,
    reusedCoverageUnits: [sourceUnit],
  });
  const published = await publishException(projectRoot, sourceEvidence, evidence);
  const evaluated = await evaluate(projectRoot, evidence, "evaluation-002", {
    coverageIndexReference: published.coverageIndexReference,
    semanticAttestations: [
      published.hostAttestationReference,
      evidence.freshAttestationReference,
      published.attestationReference,
    ],
  });
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "satisfied", result.stdout);

  assert.equal(await readFile(sourceEvaluationResult.evaluation_path, "utf8"), historicalEvaluation);
  assert.equal(await readFile(path.join(projectRoot, sourceUnit.reference.path), "utf8"), historicalUnit);
  assert.notEqual(published.unitReference.path, sourceUnit.reference.path);
  assert.notEqual(published.unitReference.sha256, sourceUnit.reference.sha256);
  const currentIndex = JSON.parse(
    await readFile(path.join(projectRoot, evidence.coverageIndexReference.path), "utf8"),
  );
  assert.deepEqual(
    currentIndex.entries.find((entry) => entry.operation === "diagnostics").units,
    [{ unit_id: published.unit.unit_id, path: published.unitReference.path, sha256: published.unitReference.sha256 }],
  );
  assert.ok(sourceEvaluationResult.evaluation.evidence_graph.artifacts.some((artifact) =>
    artifact.role === "coverage-unit" && artifact.path === sourceUnit.reference.path &&
    artifact.sha256 === sourceUnit.reference.sha256
  ));
  assert.ok(result.evaluation.evidence_graph.artifacts.some((artifact) =>
    artifact.role === "dependency-exception-source-unit" &&
    artifact.path === sourceUnit.reference.path && artifact.sha256 === sourceUnit.reference.sha256
  ));
  assert.ok(result.evaluation.evidence_graph.artifacts.some((artifact) =>
    artifact.role === "coverage-unit" && artifact.path === published.unitReference.path &&
    artifact.sha256 === published.unitReference.sha256
  ));
  assert.ok(!result.evaluation.evidence_graph.artifacts.some((artifact) =>
    artifact.path === unrelatedHistoricalUnit.reference.path
  ));
});

test("an attested revision-plan copyedit reuses coverage", async (t) => {
  const { evaluated } = await copyeditEvaluation(t, {
    dependencyPath: "sessions/revision-plan.md",
    operation: "revision-plan",
  });
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
});

test("a Story Bible dependency cannot be relabeled as a revision-plan copyedit", async (t) => {
  const { evaluated } = await copyeditEvaluation(t, {
    dependencyPath: "story-bible.md",
    operation: "revision-plan",
  });
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.equal(result.evaluation.outcome, "indeterminate", result.stdout);
  assert.ok(result.evaluation.blockers.some((blocker) =>
    blocker.code === "dependency-exception-ineligible"
  ), result.stdout);
});

const ineligibleDependencies = [
  ["manuscript", ({ evidence }) => evidence.pass.paths[0]],
  ["scope", ({ evidence }) => evidence.scopeReference.snapshot_path],
  ["inventory", ({ sourceEvaluationResult }) => sourceEvaluationResult.evaluation.evidence_graph.artifacts.find(
    (artifact) => artifact.role === "inventory-snapshot"
  ).path],
  ["approval", async ({ projectRoot }) => {
    const approvalPath = ".author-toolkit/backups/backup-approval/manifest.json";
    await writeJson(path.join(projectRoot, approvalPath), {
      backup_id: "backup-approval",
      approval_id: "EDIT-001",
      scope_id: "scope-001",
    });
    return approvalPath;
  }],
  ["review", ({ sourceEvidence }) => sourceEvidence.reviewJobs[0].reference.path],
  ["execution", async ({ projectRoot }) => {
    const executionPath = ".author-toolkit/convergence/revision-executions/execution-001.json";
    await writeJson(path.join(projectRoot, executionPath), {
      execution_id: "execution-001",
      status: "verified",
    });
    return executionPath;
  }],
  ["tracker", () => "audit-tracker.md"],
  ["other evidence identity", ({ evidence }) => evidence.passReference.path],
];

for (const [name, selectPath] of ineligibleDependencies) {
  test(`a dependency exception rejects ${name}`, async (t) => {
    const { evaluated } = await copyeditEvaluation(t, {
      dependencyPath,
      operation: "draft-baseline",
      afterPublication: async (context) => {
        context.published.unit.dependency_exception.dependency_path = await selectPath(context);
      },
    });
    assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
    const result = JSON.parse(evaluated.stdout);
    assert.ok(result.evaluation.blockers.some((blocker) =>
      blocker.code === "dependency-exception-ineligible"
    ), result.stdout);
  });
}

const invalidExceptionBindings = [
  ["unit identity", "dependency-exception-identity-mismatch", ({ published }) => {
    published.unit.dependency_exception.unit_id = "unit-other";
  }],
  ["requested pass", "dependency-exception-identity-mismatch", ({ published }) => {
    published.unit.dependency_exception.requested_pass.pass_fingerprint = "0".repeat(64);
  }],
  ["old dependency hash", "dependency-exception-hash-mismatch", ({ published }) => {
    published.unit.dependency_exception.old_sha256 = "0".repeat(64);
  }],
  ["new dependency hash", "dependency-exception-hash-mismatch", ({ published }) => {
    published.unit.dependency_exception.new_sha256 = "0".repeat(64);
  }],
  ["operation", "dependency-exception-ineligible", ({ published }) => {
    published.unit.dependency_exception.operation = "revision-plan";
  }],
  ["coverage path hash", "coverage-unit-not-current", ({ published }) => {
    published.unit.paths[0].sha256 = "0".repeat(64);
  }],
  ["subchecks", "coverage-unit-not-current", ({ published }) => {
    published.unit.subchecks = ["different-subcheck"];
  }],
  ["full local coverage", "coverage-unit-not-current", ({ published }) => {
    published.unit.coverage = "partial";
  }],
  ["local unit kind", "coverage-unit-not-current", ({ published }) => {
    published.unit.kind = "synthesis";
  }],
  ["attestation identity", "dependency-exception-attestation-missing", ({ published }) => {
    published.attestationReference.attestation_id = "attestation-other";
  }],
  ["attestation subject", "dependency-exception-attestation-mismatch", ({ published }) => {
    published.attestation.claims[0].subject = "unit-other";
  }],
  ["refuted attestation", "dependency-exception-attestation-mismatch", ({ published }) => {
    published.attestation.claims[0].verdict = "refuted";
  }],
  ["attested source unit", "dependency-exception-source-mismatch", ({ published, sourceEvidence }) => {
    const wrongSource = sourceEvidence.coverageUnits.find(
      ({ unit }) => unit.operation === "characters",
    );
    const artifact = published.attestation.claims[0].artifacts.find(
      (candidate) => candidate.path === published.source.reference.path,
    );
    artifact.path = wrongSource.reference.path;
    artifact.sha256 = wrongSource.reference.sha256;
  }],
  ["automatic hash chaining", "dependency-exception-hash-mismatch", ({ published }) => {
    published.unit.dependencies[0].sha256 = published.unit.dependency_exception.new_sha256;
  }],
  ["an exception-bearing source", "dependency-exception-chain", async ({ published, projectRoot }) => {
    published.source.unit.dependency_exception = structuredClone(
      published.unit.dependency_exception,
    );
    await writeJson(
      path.join(projectRoot, published.source.reference.path),
      published.source.unit,
    );
    const sourceReference = await artifactAt(projectRoot, published.source.reference.path);
    published.attestation.claims[0].artifacts.find(
      (artifact) => artifact.path === published.source.reference.path
    ).sha256 = sourceReference.sha256;
  }],
];

for (const [name, expectedCode, mutate] of invalidExceptionBindings) {
  test(`a dependency exception rejects a changed ${name}`, async (t) => {
    const { evaluated } = await copyeditEvaluation(t, {
      dependencyPath,
      operation: "draft-baseline",
      afterPublication: mutate,
    });
    assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
    const result = JSON.parse(evaluated.stdout);
    assert.ok(
      result.evaluation.blockers.some((blocker) => blocker.code === expectedCode),
      JSON.stringify(result.evaluation.blockers),
    );
  });
}

test("a missing dependency attestation input blocks reuse", async (t) => {
  const { evaluated } = await copyeditEvaluation(t, {
    dependencyPath,
    operation: "draft-baseline",
    includeDependencyAttestation: false,
  });
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.ok(JSON.parse(evaluated.stdout).evaluation.blockers.some((blocker) =>
    blocker.code === "dependency-exception-attestation-missing"
  ));
});

test("altered attestation bytes and a further dependency change both block reuse", async (t) => {
  await t.test("altered attestation bytes", async (t) => {
    const { evaluated } = await copyeditEvaluation(t, {
      dependencyPath,
      operation: "draft-baseline",
      afterRefresh: async ({ projectRoot, published }) => {
        const altered = structuredClone(published.attestation);
        altered.claims[0].statement += " Altered after the reference was published.";
        await writeFile(
          path.join(projectRoot, published.attestationReference.path),
          `${JSON.stringify(altered, null, 2)}\n`,
          "utf8",
        );
      },
    });
    assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
    assert.ok(JSON.parse(evaluated.stdout).evaluation.blockers.some((blocker) =>
      blocker.code === "artifact-hash-mismatch"
    ));
  });

  await t.test("further dependency change", async (t) => {
    const { evaluated } = await copyeditEvaluation(t, {
      dependencyPath,
      operation: "draft-baseline",
      afterRefresh: async ({ projectRoot }) => {
        await writeFile(
          path.join(projectRoot, dependencyPath),
          "Observed fact: Mara watches the ferry; punctuation changed again.\n",
          "utf8",
        );
      },
    });
    assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
    assert.ok(JSON.parse(evaluated.stdout).evaluation.blockers.some((blocker) =>
      blocker.code === "artifact-hash-mismatch" && blocker.path === dependencyPath
    ));
  });
});

test("ordinary reuse without an exception still rejects a changed dependency hash", async (t) => {
  const { evaluated } = await copyeditEvaluation(t, {
    dependencyPath,
    operation: "draft-baseline",
    skipException: true,
  });
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.ok(JSON.parse(evaluated.stdout).evaluation.blockers.some((blocker) =>
    blocker.code === "coverage-unit-not-current"
  ));
});
