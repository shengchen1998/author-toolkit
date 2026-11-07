import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  artifactAt,
  createConvergenceProject,
  createNoEditEvidence,
  runValidator,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

async function currentIndexProject(t) {
  const manuscript = "The ferry leaves at dawn.\n";
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await recordScope(projectRoot, {
    scope_id: "scope-current-index",
    description: "The complete manuscript for current-index validation.",
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
  const evidence = await createNoEditEvidence(projectRoot);
  return { projectRoot, evidence };
}

test("current-index validation accepts exact referenced evidence and ignores unrelated history", async (t) => {
  const { projectRoot, evidence } = await currentIndexProject(t);
  await writeFile(path.join(projectRoot, "reports", "coverage", "historical-invalid.json"), "{not JSON\n", "utf8");

  const result = runValidator(["--coverage-index", path.join(projectRoot, evidence.coverageIndexReference.path)]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const response = JSON.parse(result.stdout);
  assert.equal(response.response_contract_version, "1.0");
  assert.equal(response.command, "validate");
  assert.equal(response.valid, true);
  assert.equal(response.result.mode, "artifacts");
  assert.equal(response.result.checks, 1);
  assert.deepEqual(response.errors, []);
});

for (const [name, mutate] of [
  ["missing unit", (index) => {
    index.entries[0].units[0].path = "reports/coverage/missing-unit.json";
  }],
  ["altered unit hash", (index) => {
    index.entries[0].units[0].sha256 = "0".repeat(64);
  }],
  ["missing synthesis", (index) => {
    index.entries[0].synthesis_report = "reports/diagnostics/missing-synthesis.md";
  }],
  ["altered synthesis hash", (index) => {
    index.entries[0].synthesis_report_sha256 = "0".repeat(64);
  }],
]) {
  await test(`current-index validation rejects ${name}`, async (t) => {
    const { projectRoot, evidence } = await currentIndexProject(t);
    const index = JSON.parse(await readFile(path.join(projectRoot, evidence.coverageIndexReference.path), "utf8"));
    mutate(index);
    await writeJson(path.join(projectRoot, evidence.coverageIndexReference.path), index);

    const result = runValidator(["--coverage-index", path.join(projectRoot, evidence.coverageIndexReference.path)]);

    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /coverage-|hash|read artifact/i);
  });
}


function baselineReport(copyedited = false) {
  const envelope = {
    schema_version: "2.0.0",
    report_id: "draft-baseline-source",
    audit: `Baseline dependency audit${copyedited ? "!" : "."}`,
    stage: "draft-baseline",
    created_at: timestamp,
    language: "en",
    skill: { name: "revise-draft", version: "4.0.0" },
    inputs: [{
      path: "manuscript/chapter-001.md",
      version: createHash("sha256").update("The ferry leaves at dawn.\n").digest("hex"),
      version_type: "sha256",
    }],
    engine: {
      name: "conversational",
      version: "test",
      degraded: false,
      notes: "scope_id=scope-current-index operation_coverage=full language coverage=full",
    },
    scope_id: "scope-current-index",
    scope_fingerprint: "0".repeat(64),
    requested_pass: {
      pass_id: "pass-source",
      pass_fingerprint: "0".repeat(64),
      path: ".author-toolkit/convergence/passes/pass-source.json",
      sha256: "0".repeat(64),
    },
    findings: [],
  };
  return `# Baseline dependency\n\n## Language coverage\n\nfull\n\n\`\`\`json\n${JSON.stringify(envelope, null, 2)}\n\`\`\`\n`;
}

async function exceptionProject(t) {
  const { projectRoot, evidence: sourceEvidence } = await currentIndexProject(t);
  const dependencyPath = "reports/draft-baseline/baseline.md";
  await writeFile(path.join(projectRoot, dependencyPath), baselineReport(), "utf8");
  const first = await createNoEditEvidence(projectRoot, {
    passId: "pass-001",
    dependencyPath,
  });
  await writeFile(path.join(projectRoot, dependencyPath), baselineReport(true), "utf8");
  const second = await createNoEditEvidence(projectRoot, {
    passId: "pass-002",
    dependencyPath,
    baselinePass: first.passReference,
    reusedCoverageUnits: [first.coverageUnits.find(({ unit }) => unit.operation === "diagnostics")],
  });
  const source = first.coverageUnits.find(({ unit }) => unit.operation === "diagnostics");
  const currentDependency = second.pass.dependencies.find((dependency) => dependency.path === dependencyPath);
  const oldDependency = source.unit.dependencies.find((dependency) => dependency.path === dependencyPath);
  const attestation = {
    schema_version: "1.0.0",
    attestation_id: "pass-002-dependency-copyedit",
    attester: { id: "pass-002-host", role: "host" },
    pass_id: second.pass.pass_id,
    pass_fingerprint: second.pass.pass_fingerprint,
    scope_id: second.scopeReference.scope_id,
    scope_fingerprint: second.scopeReference.scope_fingerprint,
    claims: [{
      claim_type: "dependency-copyedit",
      subject: source.unit.unit_id,
      verdict: "confirmed",
      statement: "The baseline copyedit changed punctuation without changing meaning.",
      artifacts: [source.reference, second.passReference, currentDependency]
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
      requested_pass: second.passReference,
      dependency_path: dependencyPath,
      old_sha256: oldDependency.sha256,
      new_sha256: currentDependency.sha256,
      operation: "draft-baseline",
      reason: "The baseline copyedit corrected punctuation without changing meaning.",
      semantic_attestation: attestationReference,
    },
  };
  const unitRelative = `reports/coverage/${unit.unit_id}-exception.json`;
  await writeJson(path.join(projectRoot, unitRelative), unit);
  const unitReference = { unit_id: unit.unit_id, ...(await artifactAt(projectRoot, unitRelative)) };
  const index = JSON.parse(await readFile(path.join(projectRoot, second.coverageIndexReference.path), "utf8"));
  index.entries.find((entry) => entry.operation === "diagnostics").units = [unitReference];
  await writeJson(path.join(projectRoot, second.coverageIndexReference.path), index);
  const indexReference = await artifactAt(projectRoot, second.coverageIndexReference.path);
  return { projectRoot, indexReference, unit, unitReference, attestation, attestationReference, sourceEvidence };
}

test("current-index validation accepts a complete dependency exception", async (t) => {
  const { projectRoot, indexReference } = await exceptionProject(t);
  const result = runValidator(["--coverage-index", path.join(projectRoot, indexReference.path)]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("current-index validation rejects a dependency exception missing its requested pass attestation", async (t) => {
  const { projectRoot, indexReference, unit, unitReference, attestation, attestationReference } = await exceptionProject(t);
  attestation.claims[0].artifacts = attestation.claims[0].artifacts.filter((artifact) =>
    artifact.path !== attestation.pass_id && !artifact.path.includes("/passes/")
  );
  await writeJson(path.join(projectRoot, attestationReference.path), attestation);
  unit.dependency_exception.semantic_attestation.sha256 = createHash("sha256")
    .update(await readFile(path.join(projectRoot, attestationReference.path)))
    .digest("hex");
  await writeJson(path.join(projectRoot, unitReference.path), unit);
  unitReference.sha256 = createHash("sha256")
    .update(await readFile(path.join(projectRoot, unitReference.path)))
    .digest("hex");
  const index = JSON.parse(await readFile(path.join(projectRoot, indexReference.path), "utf8"));
  index.entries[0].units[0].sha256 = unitReference.sha256;
  await writeJson(path.join(projectRoot, indexReference.path), index);
  indexReference.sha256 = createHash("sha256")
    .update(await readFile(path.join(projectRoot, indexReference.path)))
    .digest("hex");

  const result = runValidator(["--coverage-index", path.join(projectRoot, indexReference.path)]);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /attestation|dependency/);
});
