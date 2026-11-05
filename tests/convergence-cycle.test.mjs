import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertCycleAllowsOperation,
  checkConvergenceGate,
  getCycleStatus,
  recordScope,
  startCycle,
  transitionCycle,
  validateConvergenceCycle,
} from "../scripts/lib/index.mjs";
import {
  createConvergenceProject,
  runAuthorProject,
  runValidator,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

test("a first-time bootstrap starts one active cycle without inventing a converged scope", async (t) => {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const before = await readFile(manifestPath, "utf8");

  const result = await startCycle(
    projectRoot,
    {
      cycle_id: "cycle-bootstrap-001",
      initiating_strategy: "write-fiction",
      bootstrap: true,
      starting_scope: null,
    },
    { now: new Date(timestamp) },
  );

  assert.equal(result.valid, true, JSON.stringify(result.blockers));
  assert.equal(result.cycle.schema_version, "1.0.0");
  assert.equal(result.cycle.cycle_id, "cycle-bootstrap-001");
  assert.equal(result.cycle.revision, 1);
  assert.equal(result.cycle.status, "active");
  assert.equal(result.cycle.initiating_strategy, "write-fiction");
  assert.equal(result.cycle.current_strategy, "write-fiction");
  assert.equal(result.cycle.bootstrap, true);
  assert.equal(result.cycle.starting_scope, null);
  assert.equal(result.cycle.target_scope, null);
  assert.equal(result.cycle.requested_pass, null);
  assert.equal(result.cycle.starting_evaluation, null);
  assert.equal(result.cycle.target_evaluation, null);
  assert.equal(result.cycle.completion, null);
  assert.equal(result.cycle.recovery_position.operation, "creation-baseline");
  assert.equal(result.cycle.recovery_position.required_strategy, "write-fiction");
  assert.deepEqual(result.cycle.related_artifacts, {
    plans: [],
    creation_batches: [],
    creation_commits: [],
    revision_executions: [],
    review_groups: [],
    reviews: [],
    no_edit_skips: [],
  });
  assert.deepEqual(result.cycle.change_set, {
    from_scope: null,
    to_scope: null,
    created: [],
    modified: [],
    deleted: [],
    reordered: [],
    evidence_affected: [],
    dependency_affected: [],
  });
  assert.deepEqual(result.cycle.work_set, { entries: [] });
  assert.equal(validateConvergenceCycle(result.cycle).valid, true);

  const activePath = path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "active-cycle.json",
  );
  assert.deepEqual(JSON.parse(await readFile(activePath, "utf8")), result.cycle);
  assert.equal(await readFile(manifestPath, "utf8"), before);
});


test("an active cycle blocks parallel manuscript changes with its exact next action", async (t) => {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const activeBefore = await readFile(started.cycle_path, "utf8");
  const manifestBefore = await readFile(manifestPath, "utf8");

  const second = await startCycle(projectRoot, {
    cycle_id: "cycle-request-002",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: null,
  });
  assert.equal(second.valid, false);
  assert.equal(second.blockers[0].code, "active-cycle-exists");
  assert.deepEqual(second.required_action, {
    strategy: "write-fiction",
    operation: "creation-baseline",
    command: "write-fiction",
  });
  assert.equal(second.cycle.cycle_id, "cycle-bootstrap-001");

  const inspection = await assertCycleAllowsOperation(projectRoot, {
    strategy: "revise-fiction",
    operation: "final-review",
    manuscript_change: false,
  });
  assert.equal(inspection.valid, true);
  assert.equal(inspection.read_only, true);

  const parallel = await assertCycleAllowsOperation(projectRoot, {
    strategy: "revise-request",
    operation: "chapter-revision",
    manuscript_change: true,
  });
  assert.equal(parallel.valid, false);
  assert.equal(parallel.blockers[0].code, "active-cycle-exists");
  assert.deepEqual(parallel.required_action, second.required_action);
  assert.equal(await readFile(started.cycle_path, "utf8"), activeBefore);
  assert.equal(await readFile(manifestPath, "utf8"), manifestBefore);
});

test("status and gate expose truthful indeterminate state without writes", async (t) => {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const activeBefore = await readFile(started.cycle_path, "utf8");
  const manifestBefore = await readFile(manifestPath, "utf8");

  const status = await getCycleStatus(projectRoot);
  assert.equal(status.query_valid, true);
  assert.equal(status.outcome, "indeterminate");
  assert.equal(status.current, false);
  assert.equal(status.evaluation, null);
  assert.equal(status.cycle.cycle_id, "cycle-bootstrap-001");
  assert.equal(status.pending_action, null);
  assert.equal(status.blockers[0].code, "current-evaluation-unavailable");
  assert.deepEqual(status.required_action, {
    strategy: "write-fiction",
    operation: "creation-baseline",
    command: "write-fiction",
  });

  const gate = await checkConvergenceGate(projectRoot);
  assert.equal(gate.valid, false);
  assert.equal(gate.query_valid, true);
  assert.equal(gate.outcome, "indeterminate");
  assert.equal(gate.current, false);
  assert.equal(gate.blockers[0].code, "current-evaluation-unavailable");
  assert.equal(await readFile(started.cycle_path, "utf8"), activeBefore);
  assert.equal(await readFile(manifestPath, "utf8"), manifestBefore);
});


test("a public transition resumes the same cycle with versioned refs and preserves pending", async (t) => {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const started = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const manuscript = "First chapter\n";
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), manuscript, "utf8");
  const manuscriptHash = createHash("sha256").update(manuscript).digest("hex");
  await recordScope(projectRoot, {
    scope_id: "scope-first-publication",
    description: "The first nonempty manuscript in author-confirmed reading order.",
    status: "confirmed",
    files: [{ path: "manuscript/chapter-001.md", sha256: manuscriptHash }],
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

  const plan = "# Writing plan\n";
  const planPath = "sessions/plan-001.md";
  await writeFile(path.join(projectRoot, planPath), plan, "utf8");
  const passPath = ".author-toolkit/convergence/passes/pass-001.json";
  await writeJson(path.join(projectRoot, passPath), { pass_id: "pass-001" });
  const passHash = createHash("sha256")
    .update(await readFile(path.join(projectRoot, passPath)))
    .digest("hex");
  const scopedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const scopeRef = {
    scope_id: scopedManifest.current_scope.scope_id,
    scope_fingerprint: scopedManifest.current_scope.scope_fingerprint,
    snapshot_path: scopedManifest.current_scope.snapshot_path,
    snapshot_sha256: scopedManifest.current_scope.snapshot_sha256,
  };
  const pending = {
    operation: "chapter-review",
    status: "awaiting_author",
    scope_id: scopeRef.scope_id,
    reason: "The author is reviewing the first publication.",
    artifacts: ["sessions/plan-001.md"],
    updated_at: timestamp,
  };
  await writeJson(manifestPath, { ...scopedManifest, pending_action: pending });

  const transitioned = await transitionCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "intake",
      reason: "The first publication needs its initial full-manuscript evaluation.",
    },
    target_scope: scopeRef,
    requested_pass: {
      pass_id: "pass-001",
      pass_fingerprint: "a".repeat(64),
      path: passPath,
      sha256: passHash,
    },
    related_artifacts: {
      plans: [{
        plan_id: "plan-001",
        path: planPath,
        sha256: createHash("sha256").update(plan).digest("hex"),
      }],
    },
  }, { now: new Date("2026-11-05T01:00:00Z") });

  assert.equal(transitioned.valid, true, JSON.stringify(transitioned.blockers));
  assert.equal(transitioned.cycle.revision, 2);
  assert.equal(transitioned.cycle.initiating_strategy, "write-fiction");
  assert.equal(transitioned.cycle.current_strategy, "revise-draft");
  assert.equal(transitioned.cycle.bootstrap, true);
  assert.equal(transitioned.cycle.starting_scope, null);
  assert.deepEqual(transitioned.cycle.target_scope, scopeRef);
  assert.equal(transitioned.cycle.requested_pass.pass_id, "pass-001");
  assert.equal(transitioned.cycle.related_artifacts.plans[0].plan_id, "plan-001");
  assert.equal(transitioned.cycle.recovery_position.required_strategy, "revise-draft");
  assert.equal(transitioned.cycle.updated_at, "2026-11-05T01:00:00.000Z");
  assert.equal(validateConvergenceCycle(transitioned.cycle).valid, true);
  assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")).pending_action, pending);

  const resume = await assertCycleAllowsOperation(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    strategy: "revise-draft",
    operation: "intake",
    manuscript_change: true,
  });
  assert.equal(resume.valid, true);

  const activeBeforeStaleWrite = await readFile(started.cycle_path, "utf8");
  const stale = await transitionCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
    current_strategy: "write-fiction",
    recovery_position: { operation: "writing-plan", reason: "A stale caller." },
  });
  assert.equal(stale.valid, false);
  assert.equal(stale.blockers[0].code, "cycle-revision-conflict");
  assert.equal(stale.required_action.strategy, "revise-draft");
  assert.equal(await readFile(started.cycle_path, "utf8"), activeBeforeStaleWrite);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), "Revised chapter\n", "utf8");
  const afterExpectedEdit = await transitionCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 2,
    recovery_position: {
      operation: "diagnostics",
      reason: "The historical target snapshot remains evidence after an expected manuscript edit.",
    },
  });
  assert.equal(afterExpectedEdit.valid, true, JSON.stringify(afterExpectedEdit.blockers));
  assert.deepEqual(afterExpectedEdit.cycle.target_scope, scopeRef);
});


test("an ordinary start cannot manufacture satisfaction from a valid scope or caller claim", async (t) => {
  const manuscript = "Existing chapter\n";
  const { projectRoot } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await recordScope(projectRoot, {
    scope_id: "scope-existing",
    description: "The complete existing manuscript.",
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
  });
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const startingScope = {
    scope_id: manifest.current_scope.scope_id,
    scope_fingerprint: manifest.current_scope.scope_fingerprint,
    snapshot_path: manifest.current_scope.snapshot_path,
    snapshot_sha256: manifest.current_scope.snapshot_sha256,
  };
  const request = {
    cycle_id: "cycle-request-001",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: startingScope,
  };

  const result = await startCycle(projectRoot, request);
  assert.equal(result.valid, false);
  assert.equal(result.blockers[0].code, "starting-evaluation-indeterminate");
  assert.deepEqual(result.required_action, {
    strategy: "revise-draft",
    operation: "intake",
    command: "revise-draft",
  });
  await assert.rejects(
    startCycle(projectRoot, {
      ...request,
      starting_evaluation: {
        evaluation_id: "caller-claimed-satisfied",
        outcome: "satisfied",
      },
    }),
    /Unknown start-cycle input field: starting_evaluation/,
  );
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json")),
    { code: "ENOENT" },
  );

  const bootstrap = await startCycle(projectRoot, {
    cycle_id: "cycle-invalid-bootstrap",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(bootstrap.valid, false);
  assert.equal(bootstrap.blockers[0].code, "bootstrap-requires-empty-project");
});


test("an ordinary start rejects an untrustworthy starting snapshot before its evaluation gate", async (t) => {
  const manuscript = "Existing chapter\n";
  const { projectRoot, manifestPath } = await createConvergenceProject(t, {
    manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
  });
  await recordScope(projectRoot, {
    scope_id: "scope-existing",
    description: "The complete existing manuscript.",
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
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = await startCycle(projectRoot, {
    cycle_id: "cycle-request-001",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: {
      scope_id: manifest.current_scope.scope_id,
      scope_fingerprint: manifest.current_scope.scope_fingerprint,
      snapshot_path: manifest.current_scope.snapshot_path,
      snapshot_sha256: "0".repeat(64),
    },
  });

  assert.equal(result.valid, false);
  assert.equal(result.blockers[0].code, "starting-scope-indeterminate");
  assert.equal(result.required_action.strategy, "revise-draft");
});


test("the cycle contract is closed and versions active and completed records", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const { cycle } = await startCycle(projectRoot, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const targetEvaluation = {
    evaluation_id: "evaluation-001",
    path: ".author-toolkit/convergence/evaluations/evaluation-001.json",
    sha256: "b".repeat(64),
  };
  const completed = {
    ...cycle,
    status: "completed",
    target_scope: {
      scope_id: "scope-001",
      scope_fingerprint: "a".repeat(64),
      snapshot_path: `.author-toolkit/convergence/scopes/scope-001-${"a".repeat(64)}.json`,
      snapshot_sha256: "c".repeat(64),
    },
    target_evaluation: targetEvaluation,
    recovery_position: null,
    completion: {
      decision_id: "DECISION-001",
      target_evaluation_id: "evaluation-001",
      completed_at: timestamp,
    },
  };
  assert.equal(validateConvergenceCycle(completed).valid, true);

  const unknownStatus = { ...cycle, status: "paused" };
  assert.equal(validateConvergenceCycle(unknownStatus).valid, false);
  const mismatchedRecovery = { ...cycle, current_strategy: "revise-draft" };
  assert.equal(validateConvergenceCycle(mismatchedRecovery).valid, false);
  const additional = { ...cycle, owner: "pending_action" };
  assert.equal(validateConvergenceCycle(additional).valid, false);
  const invalidBootstrap = { ...cycle, starting_scope: completed.target_scope };
  assert.equal(validateConvergenceCycle(invalidBootstrap).valid, false);
  const ordinaryWithoutEvaluation = {
    ...cycle,
    bootstrap: false,
    starting_scope: completed.target_scope,
  };
  assert.equal(validateConvergenceCycle(ordinaryWithoutEvaluation).valid, false);
  const mismatchedCompletion = {
    ...completed,
    completion: { ...completed.completion, target_evaluation_id: "evaluation-other" },
  };
  assert.equal(validateConvergenceCycle(mismatchedCompletion).valid, false);
  const unsafeArtifact = structuredClone(cycle);
  unsafeArtifact.related_artifacts.plans.push({
    plan_id: "plan-001",
    path: "../outside.md",
    sha256: "d".repeat(64),
  });
  assert.equal(validateConvergenceCycle(unsafeArtifact).valid, false);
});

test("executable project operations and validator queries share the public cycle state", async (t) => {
  const { projectRoot, manifestPath } = await createConvergenceProject(t);
  const inputPath = await writeJson(path.join(projectRoot, "start-cycle.json"), {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const started = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    inputPath,
  ]);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(JSON.parse(started.stdout).valid, true);
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");

  const secondInput = await writeJson(path.join(projectRoot, "second-cycle.json"), {
    cycle_id: "cycle-other-002",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: null,
  });
  const second = runAuthorProject([
    "start-cycle",
    "--project-root",
    projectRoot,
    "--input",
    secondInput,
  ]);
  assert.equal(second.status, 1);
  assert.equal(JSON.parse(second.stdout).blockers[0].code, "active-cycle-exists");

  const status = runAuthorProject(["cycle-status", "--project-root", projectRoot]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).outcome, "indeterminate");
  const gate = runAuthorProject(["cycle-gate", "--project-root", projectRoot]);
  assert.equal(gate.status, 1);
  assert.equal(JSON.parse(gate.stdout).outcome, "indeterminate");

  const artifact = runValidator(["--convergence-cycle", activePath]);
  assert.equal(artifact.status, 0, artifact.stderr);
  assert.match(artifact.stdout, /1 checks, 0 failures/);
  const query = runValidator(["--convergence-status", manifestPath]);
  assert.equal(query.status, 0, query.stderr);
  assert.equal(JSON.parse(query.stdout).outcome, "indeterminate");
  const validatorGate = runValidator(["--convergence-gate", manifestPath]);
  assert.equal(validatorGate.status, 1);
  assert.equal(JSON.parse(validatorGate.stdout).outcome, "indeterminate");

  const invalid = JSON.parse(await readFile(activePath, "utf8"));
  invalid.unexpected = true;
  const invalidPath = await writeJson(path.join(projectRoot, "invalid-cycle.json"), invalid);
  assert.equal(runValidator(["--convergence-cycle", invalidPath]).status, 1);
  assert.equal(runValidator(["--convergence-cycle"]).status, 2);
  assert.equal(runAuthorProject(["unknown-command"]).status, 2);
  const help = runValidator(["--help"]);
  assert.match(help.stdout, /--convergence-cycle FILE/);
  assert.match(help.stdout, /--convergence-status MANIFEST/);
  assert.match(help.stdout, /--convergence-gate MANIFEST/);
  const operationHelp = runAuthorProject(["--help"]);
  assert.equal(operationHelp.status, 0);
  assert.match(operationHelp.stdout, /transition-cycle/);
});


test("an empty project without a cycle is indeterminate and read-only inspection remains available", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const status = await getCycleStatus(projectRoot);
  assert.equal(status.query_valid, true);
  assert.equal(status.outcome, "indeterminate");
  assert.equal(status.cycle, null);
  assert.equal(status.required_action.strategy, "revise-draft");
  const gate = await checkConvergenceGate(projectRoot);
  assert.equal(gate.valid, false);
  const inspection = await assertCycleAllowsOperation(projectRoot, {
    strategy: "revise-draft",
    operation: "diagnostics",
    manuscript_change: false,
  });
  assert.equal(inspection.valid, true);
});

test("concurrent bootstrap starts cannot publish two active cycles", async (t) => {
  const { projectRoot } = await createConvergenceProject(t);
  const requests = ["cycle-first-001", "cycle-second-002"].map((cycleId) => ({
    cycle_id: cycleId,
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  }));
  const results = await Promise.all(requests.map((request) => startCycle(projectRoot, request)));
  assert.equal(results.filter((result) => result.valid).length, 1);
  assert.equal(results.filter((result) => !result.valid).length, 1);
  const loser = results.find((result) => !result.valid);
  assert.equal(loser.blockers[0].code, "active-cycle-exists");
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  const winner = results.find((result) => result.valid);
  assert.equal(active.cycle_id, winner.cycle.cycle_id);
});
