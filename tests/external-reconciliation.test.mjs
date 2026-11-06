import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { computeInventoryFingerprint, recordScope } from "../scripts/lib/index.mjs";
import {
  appendTrackerApproval as appendApproval,
  createConvergenceProject,
  createNoEditEvidence,
  currentScopeReference,
  runAuthorProject,
  runInput,
  runValidator,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function establishSatisfiedProject(t, manuscripts = [{
  name: "chapter-001.md",
  contents: "The ferry leaves at dawn.\nMara watches it go.",
}]) {
  const { projectRoot, manifestPath } = await createConvergenceProject(t, { manuscripts });
  const files = [];
  for (const file of manuscripts) {
    files.push({
      path: `manuscript/${file.name}`,
      sha256: sha256(file.contents),
    });
  }
  await recordScope(projectRoot, {
    scope_id: "scope-001",
    description: "The complete current manuscript in reading order.",
    status: "confirmed",
    files,
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
  const evaluated = await runInput(projectRoot, "evaluate-draft", {
    evaluation_id: "evaluation-independent-001",
    requested_pass: evidence.passReference,
    target_scope: evidence.scopeReference,
    coverage_index: evidence.coverageIndexReference,
    reports: evidence.reports,
    review_group: evidence.reviewGroupReference,
    no_edit_skips: [evidence.noEditReference],
    revision_executions: [],
    semantic_attestations: [evidence.hostAttestationReference, evidence.freshAttestationReference],
  });
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  return { projectRoot, manifestPath, evidence, startingScope: await currentScopeReference(projectRoot) };
}

test("an external modification during a cycle blocks dependent work and requires creation-import", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-increment-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);

  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-001.md"),
    `${original}\nAn external paragraph changes the chapter.`,
    "utf8",
  );
  const checked = await runInput(projectRoot, "check-operation", {
    cycle_id: "cycle-increment-001",
    strategy: "revise-increment",
    operation: "intake",
    manuscript_change: true,
  });

  assert.equal(checked.status, 1, `${checked.stdout}\n${checked.stderr}`);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.valid, false);
  assert.equal(result.blockers[0].code, "external-reconciliation-required");
  assert.deepEqual(result.required_action, {
    strategy: "write-fiction",
    operation: "creation-import",
    command: "write-fiction",
  });
  assert.deepEqual(result.external_changes.modified, [{
    path: "manuscript/chapter-001.md",
    input_sha256: sha256(original),
    output_sha256: sha256(`${original}\nAn external paragraph changes the chapter.`),
  }]);
  const active = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ));
  assert.equal(active.revision, 1);
  assert.deepEqual(active.change_set.modified, []);
});


test("an approved external modification reconciles into the same cycle without rewriting its starting snapshot", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const modified = `${original}\nAn external paragraph changes the chapter.`;
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-increment-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const startingSnapshotBefore = await readFile(
    path.join(projectRoot, startingScope.snapshot_path),
    "utf8",
  );
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), modified, "utf8");
  const targetScope = await confirmImportedScope(projectRoot, "IMPORT-001");
  const storyState = await writeReconciledStoryState(projectRoot);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-001",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed the external text, story-state differences, and reading order. reconciliation_id=reconciliation-001 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-001",
    cycle_id: "cycle-increment-001",
    expected_revision: 1,
    author_decision_id: "IMPORT-001",
    target_scope: targetScope,
    story_state: storyState,
  });

  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const result = JSON.parse(reconciled.stdout);
  assert.equal(result.valid, true);
  assert.equal(result.cycle.revision, 2);
  assert.equal(result.cycle.current_strategy, "revise-increment");
  assert.equal(result.cycle.recovery_position.operation, "intake");
  assert.deepEqual(result.cycle.starting_scope, startingScope);
  assert.deepEqual(result.cycle.target_scope, targetScope);
  assert.deepEqual(result.cycle.change_set.from_scope, startingScope);
  assert.deepEqual(result.cycle.change_set.to_scope, targetScope);
  assert.deepEqual(result.cycle.change_set.modified, [{
    path: "manuscript/chapter-001.md",
    input_sha256: sha256(original),
    output_sha256: sha256(modified),
  }]);
  assert.deepEqual(result.cycle.work_set.entries.map((entry) => entry.path), [
    "manuscript/chapter-001.md",
  ]);
  assert.equal(result.cycle.related_artifacts.reconciliations.length, 1);
  assert.equal(result.required_action.strategy, "revise-increment");
  assert.equal(result.required_action.operation, "intake");
  assert.equal(
    await readFile(path.join(projectRoot, startingScope.snapshot_path), "utf8"),
    startingSnapshotBefore,
  );
});

async function confirmImportedScope(projectRoot, decisionId, scopeId = "scope-001") {
  const manifest = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    "utf8",
  ));
  const files = [];
  for (const file of manifest.current_scope?.files ?? []) {
    files.push({
      path: file.path,
      sha256: sha256(await readFile(path.join(projectRoot, file.path))),
    });
  }
  await recordScope(projectRoot, {
    scope_id: scopeId,
    description: "The externally changed manuscript confirmed through creation-import.",
    status: "confirmed",
    files,
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: decisionId,
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  return currentScopeReference(projectRoot);
}

async function writeReconciledStoryState(projectRoot) {
  const manifest = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    "utf8",
  ));
  const references = [];
  const children = [];
  for (const [index, file] of manifest.current_scope.files.entries()) {
    const relative = `.author-toolkit/creation/state/chapters/reconciled-${index + 1}.md`;
    const value = {
      schema_version: "1.0.0",
      state_id: `reconciled-${index + 1}`,
      level: "chapter",
      scope_id: manifest.current_scope.scope_id,
      updated_at: timestamp,
      sources: [{ path: file.path, sha256: file.sha256 }],
      summary: `Reconciled observed facts for ${file.path}.`,
      records: [],
      children: [],
    };
    const markdown = `# Reconciled chapter\n\n${value.summary}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
    await mkdir(path.dirname(path.join(projectRoot, relative)), { recursive: true });
    await writeFile(path.join(projectRoot, relative), markdown, "utf8");
    const reference = {
      path: relative,
      sha256: sha256(await readFile(path.join(projectRoot, relative))),
    };
    references.push(reference);
    children.push(reference);
  }
  const relative = ".author-toolkit/creation/state/current.md";
  const current = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: manifest.current_scope.scope_id,
    updated_at: timestamp,
    sources: children,
    summary: "The externally changed manuscript has reconciled story state.",
    records: [],
    children,
  };
  const markdown = `# Current story state\n\n${current.summary}\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\`\n`;
  await mkdir(path.dirname(path.join(projectRoot, relative)), { recursive: true });
  await writeFile(path.join(projectRoot, relative), markdown, "utf8");
  references.push({
    path: relative,
    sha256: sha256(await readFile(path.join(projectRoot, relative))),
  });
  return references;
}


test("reconciliation cannot refresh scope hashes without a verifiable author decision", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-increment-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const activeBefore = await readFile(activePath, "utf8");
  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-001.md"),
    `${original}\nUnreviewed external text.`,
    "utf8",
  );
  const targetScope = await confirmImportedScope(projectRoot, "IMPORT-901");
  const storyState = await writeReconciledStoryState(projectRoot);

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-901",
    cycle_id: "cycle-increment-001",
    expected_revision: 1,
    author_decision_id: "IMPORT-901",
    target_scope: targetScope,
    story_state: storyState,
  });

  assert.equal(reconciled.status, 1, `${reconciled.stdout}\n${reconciled.stderr}`);
  const result = JSON.parse(reconciled.stdout);
  assert.equal(result.valid, false);
  assert.equal(result.state_written, false);
  assert.equal(result.blockers[0].code, "creation-import-approval-missing");
  assert.equal(await readFile(activePath, "utf8"), activeBefore);
  await assert.rejects(
    readFile(path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "reconciliations",
      "reconciliation-901.json",
    )),
    { code: "ENOENT" },
  );
});


test("an approved addition before a cycle preserves the satisfied previous scope for a later increment start", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const added = "A second chapter arrives from an external draft.\n";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-002.md"), added, "utf8");

  const checked = await runInput(projectRoot, "check-operation", {
    strategy: "write-fiction",
    operation: "writing-plan",
    manuscript_change: true,
  });
  assert.equal(checked.status, 1, `${checked.stdout}\n${checked.stderr}`);
  assert.equal(JSON.parse(checked.stdout).blockers[0].code, "external-reconciliation-required");
  assert.deepEqual(JSON.parse(checked.stdout).external_changes.created, [{
    path: "manuscript/chapter-002.md",
    sha256: sha256(added),
  }]);

  const targetScope = await confirmImportedFiles(projectRoot, "IMPORT-002", [
    { path: "manuscript/chapter-001.md", sha256: sha256(original) },
    { path: "manuscript/chapter-002.md", sha256: sha256(added) },
  ], "scope-external-002");
  const storyState = await writeReconciledStoryState(projectRoot);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-002",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-001.md", "manuscript/chapter-002.md"],
    reason: `Author confirmed the added chapter and complete reading order. reconciliation_id=reconciliation-002 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
  const startingSnapshotBefore = await readFile(
    path.join(projectRoot, startingScope.snapshot_path),
    "utf8",
  );
  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-002",
    previous_scope: startingScope,
    author_decision_id: "IMPORT-002",
    target_scope: targetScope,
    story_state: storyState,
  });

  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const reconciliation = JSON.parse(reconciled.stdout);
  assert.equal(reconciliation.valid, true);
  assert.equal(reconciliation.cycle, null);
  assert.equal(reconciliation.reconciliation.cycle_id, null);
  assert.equal(reconciliation.reconciliation.previous_evaluation.evaluation_id, "evaluation-independent-001");
  assert.deepEqual(reconciliation.reconciliation.change_set.created, [{
    path: "manuscript/chapter-002.md",
    sha256: sha256(added),
  }]);
  assert.deepEqual(reconciliation.required_action, {
    strategy: "revise-increment",
    operation: "intake",
    command: "revise-increment",
  });
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json")),
    { code: "ENOENT" },
  );

  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-increment-002",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const cycle = JSON.parse(started.stdout).cycle;
  assert.deepEqual(cycle.starting_scope, startingScope);
  assert.deepEqual(cycle.target_scope, targetScope);
  assert.equal(cycle.starting_evaluation.evaluation_id, "evaluation-independent-001");
  assert.deepEqual(cycle.change_set.created, [{
    path: "manuscript/chapter-002.md",
    sha256: sha256(added),
  }]);
  assert.equal(cycle.related_artifacts.reconciliations[0].reconciliation_id, "reconciliation-002");
  assert.equal(
    await readFile(path.join(projectRoot, startingScope.snapshot_path), "utf8"),
    startingSnapshotBefore,
  );
});

async function confirmImportedFiles(projectRoot, decisionId, files, scopeId) {
  await recordScope(projectRoot, {
    scope_id: scopeId,
    description: "The externally changed manuscript confirmed through creation-import.",
    status: "confirmed",
    files,
    excluded_files: [],
    created_at: timestamp,
  }, {
    authorConfirmation: {
      decision_id: decisionId,
      confirmed_at: timestamp,
      reading_order_confirmed: true,
    },
    now: new Date(timestamp),
  });
  return currentScopeReference(projectRoot);
}


test("external reordering updates the active target with retained-path transitions", async (t) => {
  const first = "Chapter one opens the ferry journey.\n";
  const second = "Chapter two follows another passenger.\n";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t, [
    { name: "chapter-001.md", contents: first },
    { name: "chapter-002.md", contents: second },
  ]);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-reorder-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const targetScope = await confirmImportedFiles(projectRoot, "IMPORT-003", [
    { path: "manuscript/chapter-002.md", sha256: sha256(second) },
    { path: "manuscript/chapter-001.md", sha256: sha256(first) },
  ], "scope-reordered-002");
  const storyState = await writeReconciledStoryState(projectRoot);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-003",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-002.md", "manuscript/chapter-001.md"],
    reason: `Author confirmed the externally changed reading order. reconciliation_id=reconciliation-003 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });

  const checked = await runInput(projectRoot, "check-operation", {
    cycle_id: "cycle-reorder-001",
    strategy: "revise-increment",
    operation: "intake",
    manuscript_change: true,
  });
  assert.equal(checked.status, 1, `${checked.stdout}\n${checked.stderr}`);
  assert.deepEqual(JSON.parse(checked.stdout).external_changes.reordered, [
    { path: "manuscript/chapter-001.md", before_index: 0, after_index: 1 },
    { path: "manuscript/chapter-002.md", before_index: 1, after_index: 0 },
  ]);

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-003",
    cycle_id: "cycle-reorder-001",
    expected_revision: 1,
    author_decision_id: "IMPORT-003",
    target_scope: targetScope,
    story_state: storyState,
  });
  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const cycle = JSON.parse(reconciled.stdout).cycle;
  assert.deepEqual(cycle.change_set.reordered, [
    { path: "manuscript/chapter-001.md", before_index: 0, after_index: 1 },
    { path: "manuscript/chapter-002.md", before_index: 1, after_index: 0 },
  ]);
  assert.deepEqual(cycle.change_set.created, []);
  assert.deepEqual(cycle.change_set.modified, []);
  assert.deepEqual(cycle.change_set.deleted, []);
  assert.deepEqual(cycle.target_scope.files ?? cycle.target_scope, targetScope);
  assert.deepEqual(cycle.work_set.entries.map((entry) => entry.path), [
    "manuscript/chapter-002.md",
    "manuscript/chapter-001.md",
  ]);
  const resumed = await runInput(projectRoot, "check-operation", {
    cycle_id: "cycle-reorder-001",
    strategy: "revise-increment",
    operation: "intake",
    manuscript_change: true,
  });
  assert.equal(resumed.status, 0, `${resumed.stdout}\n${resumed.stderr}`);
  assert.equal(JSON.parse(resumed.stdout).valid, true);
});


test("deleting every manuscript file reconciles to an empty target that cannot satisfy or complete", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const { projectRoot, manifestPath, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-empty-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const startingSnapshotBefore = await readFile(
    path.join(projectRoot, startingScope.snapshot_path),
    "utf8",
  );
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const storyState = await writeEmptyStoryState(projectRoot);
  const emptyInventoryFingerprint = computeInventoryFingerprint({
    manuscript_root: "manuscript",
    files: [],
    excluded_files: [],
  });
  await appendApproval(projectRoot, {
    id: "IMPORT-004",
    type: "creation-import",
    operation: "creation-import",
    scopeId: startingScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed the complete external deletion and empty story state. reconciliation_id=reconciliation-004 inventory_fingerprint=${emptyInventoryFingerprint} scope_fingerprint=null`,
  });

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-004",
    cycle_id: "cycle-empty-001",
    expected_revision: 1,
    author_decision_id: "IMPORT-004",
    target_scope: null,
    story_state: storyState,
  });
  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const result = JSON.parse(reconciled.stdout);
  assert.equal(result.valid, true);
  assert.equal(result.cycle.target_scope, null);
  assert.equal(result.cycle.target_evaluation, null);
  assert.equal(result.cycle.current_strategy, "write-fiction");
  assert.equal(result.cycle.recovery_position.operation, "creation-import");
  assert.deepEqual(result.cycle.change_set.deleted, [{
    path: "manuscript/chapter-001.md",
    input_sha256: sha256(original),
  }]);
  assert.deepEqual(result.cycle.work_set.entries, []);
  assert.equal(result.reconciliation.inventory.inventory_fingerprint, emptyInventoryFingerprint);
  assert.equal(
    await readFile(path.join(projectRoot, startingScope.snapshot_path), "utf8"),
    startingSnapshotBefore,
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.current_scope, undefined);

  const status = runAuthorProject(["convergence-status", "--project-root", projectRoot]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  const current = JSON.parse(status.stdout);
  assert.equal(current.outcome, "not_satisfied");
  assert.equal(current.current, false);
  assert.ok(current.blockers.some((blocker) => blocker.code === "empty-manuscript"));
  assert.deepEqual(current.required_action, {
    strategy: "write-fiction",
    operation: "creation-import",
    command: "write-fiction",
  });
  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-empty-001",
    expected_revision: 2,
    evaluation_id: "evaluation-empty-001",
    decision_id: "EMPTY-001",
    author_confirmed: true,
  });
  assert.equal(completed.status, 1, `${completed.stdout}\n${completed.stderr}`);
  assert.equal(JSON.parse(completed.stdout).blockers[0].code, "completion-evaluation-not-satisfied");
});

async function writeEmptyStoryState(projectRoot) {
  const dependency = {
    path: "story-bible.md",
    sha256: sha256(await readFile(path.join(projectRoot, "story-bible.md"))),
  };
  const relative = ".author-toolkit/creation/state/current.md";
  const current = {
    schema_version: "1.0.0",
    state_id: "current",
    level: "current",
    scope_id: null,
    updated_at: timestamp,
    sources: [dependency],
    summary: "No accepted manuscript remains; Story Bible intent is preserved.",
    records: [],
    children: [],
  };
  const markdown = `# Current story state\n\n${current.summary}\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\`\n`;
  await mkdir(path.dirname(path.join(projectRoot, relative)), { recursive: true });
  await writeFile(path.join(projectRoot, relative), markdown, "utf8");
  return [{ path: relative, sha256: sha256(await readFile(path.join(projectRoot, relative))) }];
}


test("a nonempty approved import after empty deletion requires full-manuscript revise-draft before completion", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const restored = "The restored ferry leaves at noon.\nMara watches it go.";
  const { projectRoot, evidence: baseline, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-empty-006",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const emptyStoryState = await writeEmptyStoryState(projectRoot);
  const emptyInventoryFingerprint = computeInventoryFingerprint({
    manuscript_root: "manuscript",
    files: [],
    excluded_files: [],
  });
  await appendApproval(projectRoot, {
    id: "IMPORT-005",
    type: "creation-import",
    operation: "creation-import",
    scopeId: startingScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed the complete deletion. reconciliation_id=reconciliation-005 inventory_fingerprint=${emptyInventoryFingerprint} scope_fingerprint=null`,
  });
  const emptied = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-005",
    cycle_id: "cycle-empty-006",
    expected_revision: 1,
    author_decision_id: "IMPORT-005",
    target_scope: null,
    story_state: emptyStoryState,
  });
  assert.equal(emptied.status, 0, `${emptied.stdout}\n${emptied.stderr}`);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), restored, "utf8");
  const recoveredScope = await confirmImportedFiles(projectRoot, "IMPORT-006", [
    { path: "manuscript/chapter-001.md", sha256: sha256(restored) },
  ], "scope-recovered-006");
  const recoveredStoryState = await writeReconciledStoryState(projectRoot);
  const recoveredInventory = JSON.parse(await readFile(
    path.join(projectRoot, recoveredScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-006",
    type: "creation-import",
    operation: "creation-import",
    scopeId: recoveredScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author approved the nonempty recovery import and its story state. reconciliation_id=reconciliation-006 inventory_fingerprint=${recoveredInventory.inventory_fingerprint} scope_fingerprint=${recoveredScope.scope_fingerprint}`,
  });
  const recovered = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-006",
    cycle_id: "cycle-empty-006",
    expected_revision: 2,
    author_decision_id: "IMPORT-006",
    target_scope: recoveredScope,
    story_state: recoveredStoryState,
  });

  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const recovery = JSON.parse(recovered.stdout);
  assert.equal(recovery.reconciliation.recovery_from_empty, true);
  assert.equal(recovery.cycle.current_strategy, "revise-draft");
  assert.equal(recovery.cycle.recovery_position.operation, "intake");
  assert.deepEqual(recovery.required_action, {
    strategy: "revise-draft",
    operation: "intake",
    command: "revise-draft",
  });
  assert.deepEqual(recovery.cycle.work_set.entries.map((entry) => entry.path), [
    "manuscript/chapter-001.md",
  ]);
  assert.deepEqual(recovery.cycle.change_set.modified, [{
    path: "manuscript/chapter-001.md",
    input_sha256: sha256(original),
    output_sha256: sha256(restored),
  }]);

  const evidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-recovered-006",
    baselinePass: baseline.passReference,
    noEditDecisionId: "NOEDIT-006",
  });
  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-empty-006",
    expected_revision: 3,
    current_strategy: "revise-draft",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The nonempty recovery has a complete full-manuscript revise-draft evidence set.",
    },
    requested_pass: evidence.passReference,
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-recovered-006", 4, "cycle-empty-006"),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  assert.equal(JSON.parse(evaluated.stdout).evaluation.outcome, "satisfied");
  const completed = await runInput(projectRoot, "complete-cycle", {
    cycle_id: "cycle-empty-006",
    expected_revision: 5,
    evaluation_id: "evaluation-recovered-006-completion",
    decision_id: "COMPLETE-006",
    author_confirmed: true,
  });
  assert.equal(completed.status, 0, `${completed.stdout}\n${completed.stderr}`);
  assert.equal(JSON.parse(completed.stdout).cycle.status, "completed");
  assert.equal(JSON.parse(completed.stdout).cycle.current_strategy, "revise-draft");
});


test("unprovable historical coverage invalidates the old evaluation and forces truthful revise-draft recovery", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const modified = "The externally revised ferry leaves at dusk.\nMara watches it go.";
  const { projectRoot, evidence, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-history-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), modified, "utf8");
  const coveragePath = path.join(projectRoot, evidence.coverageIndexReference.path);
  const coverage = JSON.parse(await readFile(coveragePath, "utf8"));
  coverage.updated_at = "2026-11-06T00:00:00Z";
  await writeJson(coveragePath, coverage);

  const targetScope = await confirmImportedScope(projectRoot, "IMPORT-007");
  const storyState = await writeReconciledStoryState(projectRoot);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-007",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed the external change despite stale historical coverage. reconciliation_id=reconciliation-007 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-007",
    cycle_id: "cycle-history-001",
    expected_revision: 1,
    author_decision_id: "IMPORT-007",
    target_scope: targetScope,
    story_state: storyState,
  });

  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const result = JSON.parse(reconciled.stdout);
  assert.equal(result.reconciliation.previous_evaluation, null);
  assert.equal(result.reconciliation.required_strategy, "revise-draft");
  assert.ok(result.reconciliation.proof_blockers.some(
    (blocker) => blocker.code === "previous-evaluation-unproven"
  ));
  assert.ok(result.reconciliation.invalidated_evaluations.some(
    (reference) => reference.evaluation_id === "evaluation-independent-001"
  ));
  assert.ok(result.reconciliation.invalidated_coverage.some(
    (reference) => reference.path === evidence.coverageIndexReference.path
  ));
  assert.ok(result.reconciliation.invalidated_coverage.some(
    (reference) => reference.path === evidence.coverageUnits[0].reference.path
  ));
  assert.deepEqual(result.cycle.work_set.entries.map((entry) => entry.path), [
    "manuscript/chapter-001.md",
  ]);

  const status = runAuthorProject(["convergence-status", "--project-root", projectRoot]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  const current = JSON.parse(status.stdout);
  assert.equal(current.outcome, "indeterminate");
  assert.equal(current.current, false);
  assert.ok(current.blockers.some((blocker) => blocker.code === "previous-evaluation-unproven"));
  assert.equal(current.required_action.strategy, "revise-draft");
  assert.equal(current.required_action.operation, "intake");
});


test("transition requires reconciliation while evaluation reports the external change", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const { projectRoot, evidence, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-preflight-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const linked = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-preflight-001",
    expected_revision: 1,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The existing pass is linked before an external change arrives.",
    },
    requested_pass: evidence.passReference,
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(linked.status, 0, `${linked.stdout}\n${linked.stderr}`);
  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-001.md"),
    `${original}\nExternal text arrived before evaluation.`,
    "utf8",
  );
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const activeBefore = await readFile(activePath, "utf8");

  const transitioned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-preflight-001",
    expected_revision: 2,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "This transition must not bypass reconciliation.",
    },
  });
  assert.equal(transitioned.status, 1, `${transitioned.stdout}\n${transitioned.stderr}`);
  assert.equal(JSON.parse(transitioned.stdout).blockers[0].code, "external-reconciliation-required");
  assert.equal(JSON.parse(transitioned.stdout).state_written, false);
  assert.equal(await readFile(activePath, "utf8"), activeBefore);

  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-preflight-001", 2, "cycle-preflight-001"),
  );
  assert.equal(evaluated.status, 1, `${evaluated.stdout}\n${evaluated.stderr}`);
  const result = JSON.parse(evaluated.stdout);
  assert.ok(result.blockers.some((blocker) => blocker.code === "external-reconciliation-required"));
  assert.equal(result.state_written, true);
  assert.equal(result.evaluation.outcome, "indeterminate");
  assert.equal(JSON.parse(await readFile(activePath, "utf8")).revision, 3);
  const diagnostic = JSON.parse(await readFile(path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "evaluations",
    "evaluation-preflight-001.json",
  ), "utf8"));
  assert.ok(diagnostic.blockers.some((blocker) => blocker.code === "external-reconciliation-required"));
});


test("reconciliation and story-state hashes join the evaluation evidence graph", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const modified = "The externally revised ferry leaves at dusk.\nMara watches it go.";
  const { projectRoot, manifestPath, evidence: baseline, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-evidence-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), modified, "utf8");
  const targetScope = await confirmImportedScope(projectRoot, "IMPORT-008");
  const storyState = await writeReconciledStoryState(projectRoot);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-008",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed this external modification and story state. reconciliation_id=reconciliation-008 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-008",
    cycle_id: "cycle-evidence-001",
    expected_revision: 1,
    author_decision_id: "IMPORT-008",
    target_scope: targetScope,
    story_state: storyState,
  });
  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  const reconciliationReference = JSON.parse(reconciled.stdout).reconciliation_reference;
  const evidence = await createNoEditEvidence(projectRoot, {
    passId: "pass-external-008",
    baselinePass: baseline.passReference,
    noEditDecisionId: "NOEDIT-008",
  });
  const reviewed = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-evidence-001",
    expected_revision: 2,
    current_strategy: "revise-increment",
    recovery_position: {
      operation: "current-scope-review",
      reason: "The reconciled target has new affected coverage and full-target review.",
    },
    requested_pass: evidence.passReference,
    related_artifacts: {
      review_groups: [evidence.reviewGroupReference],
      reviews: evidence.reviewJobs.map(({ reference }) => reference),
      no_edit_skips: [evidence.noEditReference],
    },
  });
  assert.equal(reviewed.status, 0, `${reviewed.stdout}\n${reviewed.stderr}`);
  const evaluated = await runInput(
    projectRoot,
    "evaluate-cycle",
    evidence.evaluationInput("evaluation-external-008", 3, "cycle-evidence-001"),
  );
  assert.equal(evaluated.status, 0, `${evaluated.stdout}\n${evaluated.stderr}`);
  const evaluation = JSON.parse(evaluated.stdout).evaluation;
  assert.equal(evaluation.outcome, "satisfied");
  assert.ok(evaluation.evidence_graph.artifacts.some(
    (artifact) => artifact.role === "manuscript-reconciliation" &&
      artifact.artifact_id === reconciliationReference.reconciliation_id &&
      artifact.sha256 === reconciliationReference.sha256
  ));
  for (const reference of storyState) {
    assert.ok(evaluation.evidence_graph.artifacts.some(
      (artifact) => artifact.role === "story-state" &&
        artifact.path === reference.path &&
        artifact.sha256 === reference.sha256
    ));
  }
  const artifactValidation = runValidator([
    "--manuscript-reconciliation",
    path.join(projectRoot, reconciliationReference.path),
  ]);
  assert.equal(artifactValidation.status, 0, `${artifactValidation.stdout}\n${artifactValidation.stderr}`);
  assert.match(artifactValidation.stdout, /1 checks, 0 failures/);

  await writeFile(
    path.join(projectRoot, storyState[0].path),
    `${await readFile(path.join(projectRoot, storyState[0].path), "utf8")}\nUnrecorded story-state change.\n`,
    "utf8",
  );
  const status = runAuthorProject(["convergence-status", "--project-root", projectRoot]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  const current = JSON.parse(status.stdout);
  assert.equal(current.outcome, "indeterminate");
  assert.equal(current.current, false);
  assert.ok(current.blockers.some(
    (blocker) => blocker.code === "artifact-hash-mismatch" && blocker.path === storyState[0].path
  ));
  const gate = runAuthorProject(["convergence-gate", "--project-root", projectRoot]);
  assert.equal(gate.status, 1, `${gate.stdout}\n${gate.stderr}`);
  assert.equal(JSON.parse(gate.stdout).valid, false);
  assert.ok(manifestPath);
});


test("an untrustworthy starting snapshot stops reconciliation with an indeterminate recovery reason", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-starting-history-001",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-001.md"),
    `${original}\nExternal text.`,
    "utf8",
  );
  const startingSnapshot = JSON.parse(await readFile(
    path.join(projectRoot, startingScope.snapshot_path),
    "utf8",
  ));
  startingSnapshot.description = "Tampered historical description; the reference hash no longer matches.";
  await writeJson(path.join(projectRoot, startingScope.snapshot_path), startingSnapshot);
  const targetScope = await confirmImportedScope(projectRoot, "IMPORT-009");
  const storyState = await writeReconciledStoryState(projectRoot);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-009",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed the current text but not the damaged history. reconciliation_id=reconciliation-009 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const activeBefore = await readFile(activePath, "utf8");

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-009",
    cycle_id: "cycle-starting-history-001",
    expected_revision: 1,
    author_decision_id: "IMPORT-009",
    target_scope: targetScope,
    story_state: storyState,
  });
  assert.equal(reconciled.status, 1, `${reconciled.stdout}\n${reconciled.stderr}`);
  const result = JSON.parse(reconciled.stdout);
  assert.equal(result.valid, false);
  assert.equal(result.state_written, false);
  assert.equal(result.blockers[0].code, "starting-scope-indeterminate");
  assert.equal(result.required_action.strategy, "revise-draft");
  assert.equal(result.required_action.operation, "intake");
  assert.equal(await readFile(activePath, "utf8"), activeBefore);
  await assert.rejects(
    readFile(path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "reconciliations",
      "reconciliation-009.json",
    )),
    { code: "ENOENT" },
  );

  const status = runAuthorProject(["convergence-status", "--project-root", projectRoot]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  const current = JSON.parse(status.stdout);
  assert.equal(current.outcome, "indeterminate");
  assert.ok(current.blockers.some((blocker) => blocker.code === "starting-scope-unproven"));
  assert.equal(current.required_action.strategy, "revise-draft");
  assert.equal(current.required_action.operation, "intake");
});


test("start-cycle detects an unreconciled external change before checking the starting gate", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-001.md"),
    `${original}\nExternal text before start.`,
    "utf8",
  );
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-unreconciled-start",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 1, `${started.stdout}\n${started.stderr}`);
  const result = JSON.parse(started.stdout);
  assert.equal(result.blockers[0].code, "external-reconciliation-required");
  assert.equal(result.required_action.operation, "creation-import");
  assert.equal(result.state_written, false);
  await assert.rejects(
    readFile(path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json")),
    { code: "ENOENT" },
  );
});


test("nonempty recovery after an out-of-cycle empty reconciliation also requires revise-draft", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const restored = "A nonempty external recovery chapter.\n";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  await rm(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const emptyStoryState = await writeEmptyStoryState(projectRoot);
  const emptyInventoryFingerprint = computeInventoryFingerprint({
    manuscript_root: "manuscript",
    files: [],
    excluded_files: [],
  });
  await appendApproval(projectRoot, {
    id: "IMPORT-010",
    type: "creation-import",
    operation: "creation-import",
    scopeId: startingScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed the empty manuscript. reconciliation_id=reconciliation-010 inventory_fingerprint=${emptyInventoryFingerprint} scope_fingerprint=null`,
  });
  const emptied = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-010",
    previous_scope: startingScope,
    author_decision_id: "IMPORT-010",
    target_scope: null,
    story_state: emptyStoryState,
  });
  assert.equal(emptied.status, 0, `${emptied.stdout}\n${emptied.stderr}`);

  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), restored, "utf8");
  const recoveredScope = await confirmImportedFiles(projectRoot, "IMPORT-011", [
    { path: "manuscript/chapter-001.md", sha256: sha256(restored) },
  ], "scope-recovered-011");
  const recoveredStoryState = await writeReconciledStoryState(projectRoot);
  const recoveredInventory = JSON.parse(await readFile(
    path.join(projectRoot, recoveredScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-011",
    type: "creation-import",
    operation: "creation-import",
    scopeId: recoveredScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author approved nonempty recovery. reconciliation_id=reconciliation-011 inventory_fingerprint=${recoveredInventory.inventory_fingerprint} scope_fingerprint=${recoveredScope.scope_fingerprint}`,
  });
  const recovered = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-011",
    previous_scope: startingScope,
    author_decision_id: "IMPORT-011",
    target_scope: recoveredScope,
    story_state: recoveredStoryState,
  });
  assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
  const result = JSON.parse(recovered.stdout);
  assert.equal(result.cycle, null);
  assert.equal(result.reconciliation.recovery_from_empty, true);
  assert.equal(result.reconciliation.required_strategy, "revise-draft");
  assert.equal(result.required_action.strategy, "revise-draft");
  assert.equal(result.required_action.operation, "intake");
});


test("revision preparation rejects external inputs before creating an execution record", async (t) => {
  const original = "The ferry leaves at dawn.\nMara watches it go.";
  const modified = "The externally revised ferry leaves at dusk.\nMara watches it go.";
  const { projectRoot, evidence, startingScope } = await establishSatisfiedProject(t);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-prepare-external",
    initiating_strategy: "revise-request",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const planned = await runInput(projectRoot, "transition-cycle", {
    cycle_id: "cycle-prepare-external",
    expected_revision: 1,
    current_strategy: "revise-request",
    recovery_position: {
      operation: "chapter-revision",
      reason: "A revision batch is linked before the input changes externally.",
    },
    requested_pass: evidence.passReference,
  });
  assert.equal(planned.status, 0, `${planned.stdout}\n${planned.stderr}`);
  await writeFile(path.join(projectRoot, "manuscript", "chapter-001.md"), modified, "utf8");
  await writeJson(path.join(projectRoot, "sessions", "external-plan.json"), {
    plan_id: "external-plan",
  });
  await writeJson(path.join(projectRoot, "sessions", "external-batch.json"), {
    batch_id: "external-batch",
  });
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const activeBefore = await readFile(activePath, "utf8");

  const prepared = await runInput(projectRoot, "prepare-revision-execution", {
    cycle_id: "cycle-prepare-external",
    expected_revision: 2,
    execution_id: "execution-external-001",
    plan: {
      plan_id: "external-plan",
      path: "sessions/external-plan.json",
      sha256: sha256(await readFile(path.join(projectRoot, "sessions", "external-plan.json"))),
    },
    batch: {
      batch_id: "external-batch",
      path: "sessions/external-batch.json",
      sha256: sha256(await readFile(path.join(projectRoot, "sessions", "external-batch.json"))),
    },
    requested_pass: evidence.passReference,
    input_scope: startingScope,
    finding_dispositions: [],
    author_decision_ids: [],
    approval_ids: [],
    backups: [],
    files: [{
      path: "manuscript/chapter-001.md",
      action: "modify",
      input_sha256: sha256(original),
      output_sha256: sha256(modified),
    }],
  });
  assert.equal(prepared.status, 1, `${prepared.stdout}\n${prepared.stderr}`);
  const result = JSON.parse(prepared.stdout);
  assert.equal(result.blockers[0].code, "external-reconciliation-required");
  assert.equal(result.state_written, false);
  assert.equal(await readFile(activePath, "utf8"), activeBefore);
  await assert.rejects(
    readFile(path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "executions",
      "execution-external-001.json",
    )),
    { code: "ENOENT" },
  );
});


test("story-state reconciliation rejects a deleted chapter retained in the current graph", async (t) => {
  const first = "Chapter one remains.\n";
  const second = "Chapter two is deleted externally.\n";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t, [
    { name: "chapter-001.md", contents: first },
    { name: "chapter-002.md", contents: second },
  ]);
  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-story-delete",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  await rm(path.join(projectRoot, "manuscript", "chapter-002.md"));
  const targetScope = await confirmImportedFiles(projectRoot, "IMPORT-012", [
    { path: "manuscript/chapter-001.md", sha256: sha256(first) },
  ], "scope-delete-012");
  const storyState = await writeReconciledStoryState(projectRoot);
  const staleRelative = ".author-toolkit/creation/state/chapters/deleted-002.md";
  const stale = {
    schema_version: "1.0.0",
    state_id: "deleted-002",
    level: "chapter",
    scope_id: targetScope.scope_id,
    updated_at: timestamp,
    sources: [{ path: "manuscript/chapter-002.md", sha256: sha256(second) }],
    summary: "A deleted chapter incorrectly remains in current story state.",
    records: [],
    children: [],
  };
  await writeFile(
    path.join(projectRoot, staleRelative),
    `# Deleted chapter\n\n${stale.summary}\n\n\`\`\`json\n${JSON.stringify(stale, null, 2)}\n\`\`\`\n`,
    "utf8",
  );
  const staleReference = {
    path: staleRelative,
    sha256: sha256(await readFile(path.join(projectRoot, staleRelative))),
  };
  const currentReference = storyState.at(-1);
  const currentPath = path.join(projectRoot, currentReference.path);
  const currentMarkdown = await readFile(currentPath, "utf8");
  const current = JSON.parse(currentMarkdown.match(/```json\n([\s\S]+)\n```/)[1]);
  current.children.push(staleReference);
  current.sources.push(staleReference);
  await writeFile(
    currentPath,
    `# Current story state\n\n${current.summary}\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\`\n`,
    "utf8",
  );
  storyState.push(staleReference);
  currentReference.sha256 = sha256(await readFile(currentPath));
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-012",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-001.md"],
    reason: `Author confirmed deletion but not the stale story graph. reconciliation_id=reconciliation-012 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
  const activePath = path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json");
  const activeBefore = await readFile(activePath, "utf8");

  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-012",
    cycle_id: "cycle-story-delete",
    expected_revision: 1,
    author_decision_id: "IMPORT-012",
    target_scope: targetScope,
    story_state: storyState,
  });
  assert.equal(reconciled.status, 1, `${reconciled.stdout}\n${reconciled.stderr}`);
  const result = JSON.parse(reconciled.stdout);
  assert.equal(result.valid, false);
  assert.equal(result.state_written, false);
  assert.equal(result.blockers[0].code, "story-state-reconciliation-required");
  assert.equal(result.required_action.operation, "creation-import");
  assert.equal(await readFile(activePath, "utf8"), activeBefore);
});


test("an out-of-cycle reorder can join its previous scope to a later increment cycle", async (t) => {
  const first = "Chapter one opens the ferry journey.\n";
  const second = "Chapter two follows another passenger.\n";
  const { projectRoot, startingScope } = await establishSatisfiedProject(t, [
    { name: "chapter-001.md", contents: first },
    { name: "chapter-002.md", contents: second },
  ]);
  const targetScope = await confirmImportedFiles(projectRoot, "IMPORT-013", [
    { path: "manuscript/chapter-002.md", sha256: sha256(second) },
    { path: "manuscript/chapter-001.md", sha256: sha256(first) },
  ], "scope-reordered-013");
  const storyState = await writeReconciledStoryState(projectRoot);
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, targetScope.snapshot_path),
    "utf8",
  )).inventory;
  await appendApproval(projectRoot, {
    id: "IMPORT-013",
    type: "creation-import",
    operation: "creation-import",
    scopeId: targetScope.scope_id,
    paths: ["manuscript/chapter-002.md", "manuscript/chapter-001.md"],
    reason: `Author confirmed the new external reading order. reconciliation_id=reconciliation-013 inventory_fingerprint=${inventory.inventory_fingerprint} scope_fingerprint=${targetScope.scope_fingerprint}`,
  });
  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-013",
    previous_scope: startingScope,
    author_decision_id: "IMPORT-013",
    target_scope: targetScope,
    story_state: storyState,
  });
  assert.equal(reconciled.status, 0, `${reconciled.stdout}\n${reconciled.stderr}`);
  assert.deepEqual(JSON.parse(reconciled.stdout).reconciliation.change_set.reordered, [
    { path: "manuscript/chapter-001.md", before_index: 0, after_index: 1 },
    { path: "manuscript/chapter-002.md", before_index: 1, after_index: 0 },
  ]);

  const started = await runInput(projectRoot, "start-cycle", {
    cycle_id: "cycle-reordered-013",
    initiating_strategy: "revise-increment",
    bootstrap: false,
    starting_scope: startingScope,
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const cycle = JSON.parse(started.stdout).cycle;
  assert.deepEqual(cycle.starting_scope, startingScope);
  assert.deepEqual(cycle.target_scope, targetScope);
  assert.deepEqual(cycle.change_set.reordered, [
    { path: "manuscript/chapter-001.md", before_index: 0, after_index: 1 },
    { path: "manuscript/chapter-002.md", before_index: 1, after_index: 0 },
  ]);
});


test("reconciliation rejects unsafe artifact paths before reading them", async (t) => {
  const { projectRoot, startingScope } = await establishSatisfiedProject(t);
  const reconciled = await runInput(projectRoot, "reconcile-manuscript", {
    reconciliation_id: "reconciliation-unsafe",
    previous_scope: startingScope,
    author_decision_id: "IMPORT-999",
    target_scope: startingScope,
    story_state: [{ path: "../outside.md", sha256: "0".repeat(64) }],
  });
  assert.equal(reconciled.status, 2);
  assert.match(reconciled.response.errors[0].message, /safe project-relative artifact paths/);
  await assert.rejects(
    readFile(path.join(
      projectRoot,
      ".author-toolkit",
      "convergence",
      "reconciliations",
      "reconciliation-unsafe.json",
    )),
    { code: "ENOENT" },
  );
});
