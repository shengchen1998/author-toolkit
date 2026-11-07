import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  createConvergenceProject,
  runValidator,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

const hash = "a".repeat(64);

function coverageUnit() {
  return {
    schema_version: "1.0.0",
    unit_id: "unit-diagnostics-001",
    source_report: "reports/diagnostics/chapter-001.md",
    source_report_sha256: "c".repeat(64),
    scope_id: "scope-001",
    operation: "diagnostics",
    kind: "local",
    paths: [{ path: "manuscript/chapter-001.md", sha256: "b".repeat(64) }],
    subchecks: ["causality"],
    dependencies: [{ path: "reports/draft-baseline/baseline.md", sha256: "d".repeat(64) }],
    dependency_exception: null,
    coverage: "full",
    created_at: timestamp,
  };
}

function dependencyException() {
  return {
    unit_id: "unit-diagnostics-001",
    requested_pass: {
      pass_id: "pass-002",
      pass_fingerprint: "e".repeat(64),
      path: ".author-toolkit/convergence/passes/pass-002.json",
      sha256: "f".repeat(64),
    },
    dependency_path: "reports/draft-baseline/baseline.md",
    old_sha256: "d".repeat(64),
    new_sha256: hash,
    operation: "draft-baseline",
    reason: "Copy editing corrected punctuation without changing baseline meaning.",
    semantic_attestation: {
      attestation_id: "attestation-copyedit-002",
      path: ".author-toolkit/convergence/attestations/attestation-copyedit-002.json",
      sha256: "0".repeat(64),
    },
  };
}

test("coverage units require either null or one complete closed dependency exception", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const validUnit = coverageUnit();
  const validException = {
    ...validUnit,
    dependency_exception: dependencyException(),
  };
  const cases = [
    ["ordinary null", validUnit, 0],
    ["complete exception", validException, 0],
    ["missing explicit value", (({ dependency_exception, ...unit }) => unit)(validUnit), 1],
    ["partial exception", {
      ...validUnit,
      dependency_exception: { unit_id: validUnit.unit_id },
    }, 1],
    ["additional exception field", {
      ...validUnit,
      dependency_exception: { ...dependencyException(), unrestricted: true },
    }, 1],
  ];

  for (const [name, unit, expectedStatus] of cases) {
    await t.test(name, async () => {
      const file = await writeJson(path.join(projectRoot, `${name.replaceAll(" ", "-")}.json`), unit);
      const result = runValidator(["--coverage-unit", file]);
      assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
    });
  }
});


test("requested-pass dependencies require a closed role and verifiable source identity", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const dependency = {
    path: "reports/draft-baseline/baseline.md",
    sha256: hash,
    role: "draft-baseline",
    source: {
      report_id: "baseline-source-001",
      path: "reports/draft-baseline/baseline.md",
      sha256: hash,
    },
  };
  const pass = {
    schema_version: "1.0.0",
    pass_id: "pass-dependency-role-001",
    pass_fingerprint: "aabb1f8f1ef448e50ff2d7e6e598daa458bb51ece2a4a5a4f7b6e33f1bce98ac",
    target_scope: {
      scope_id: "scope-001",
      scope_fingerprint: "b".repeat(64),
      snapshot_path: ".author-toolkit/convergence/scopes/scope-001.json",
      snapshot_sha256: "c".repeat(64),
    },
    required_operations: [{ operation: "diagnostics", paths: ["manuscript/chapter-001.md"], subchecks: ["causality"] }],
    paths: ["manuscript/chapter-001.md"],
    language: "en",
    dependencies: [dependency],
    inapplicability: [],
    narrowing: null,
    baseline_pass: null,
    requested_subchecks: [],
    created_at: timestamp,
  };
  const cases = [
    ["complete", dependency, 0],
    ["missing role", (({ role, ...value }) => value)(dependency), 1],
    ["missing source", (({ source, ...value }) => value)(dependency), 1],
    ["uncontrolled role", { ...dependency, role: "notes" }, 1],
    ["extra source field", { ...dependency, source: { ...dependency.source, operation: "draft-baseline" } }, 1],
  ];
  for (const [name, value, expectedStatus] of cases) {
    await t.test(name, async () => {
      const candidate = { ...pass, dependencies: [value] };
      const file = await writeJson(path.join(projectRoot, `requested-pass-${name.replaceAll(" ", "-")}.json`), candidate);
      const result = runValidator(["--requested-pass", file]);
      assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
    });
  }
});
