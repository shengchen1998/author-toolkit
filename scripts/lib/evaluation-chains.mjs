import { readFile } from "node:fs/promises";
import path from "node:path";

import { deriveCreationChangeSet } from "./cycles.mjs";
import { diffManuscriptInventories, validateScopeSnapshot } from "./scope.mjs";
import { parseTrackerState } from "./tracker.mjs";
import { sameScopeReference } from "./evaluation-contracts.mjs";

function scopeEventIdentity(reference) {
  return reference === null || reference === undefined
    ? null
    : JSON.stringify([
        reference.scope_id,
        reference.scope_fingerprint,
        reference.snapshot_path,
        reference.snapshot_sha256,
      ]);
}

function buildScopeEventChain(cycle, roots, reconciliations, executionChain, creationEvents = []) {
  const events = [
    ...creationEvents,
    ...reconciliations.map((value) => ({
      type: "reconciliation",
      value,
      input: value.previous_scope,
      output: value.target_scope,
    })),
    ...executionChain.map((value) => ({
      type: "execution",
      value,
      input: value.input_scope,
      output: value.target_scope,
    })),
  ];
  if (events.length === 0) return null;
  const startingIdentity = cycle?.bootstrap ? null : scopeEventIdentity(cycle?.starting_scope);
  const targetIdentity = scopeEventIdentity(roots.target_scope);
  const used = new Set();
  const chain = [];
  const failed = new Set();

  function visit(currentIdentity, emptyPending) {
    if (used.size === events.length) {
      return !emptyPending && currentIdentity === targetIdentity ? [...chain] : null;
    }
    const memoKey = `${currentIdentity ?? "null"}|${emptyPending}|${[...used].sort((left, right) => left - right).join(",")}`;
    if (failed.has(memoKey)) return null;
    for (const [index, event] of events.entries()) {
      if (used.has(index) || scopeEventIdentity(event.input) !== currentIdentity) continue;
      let nextEmptyPending = false;
      if (event.type === "reconciliation") {
        const reconciliation = event.value;
        if (currentIdentity === null) {
          if (emptyPending) {
            if (
              !reconciliation.recovery_from_empty ||
              !reconciliation.target_scope ||
              reconciliation.required_strategy !== "revise-draft"
            ) continue;
          } else if (
            used.size > 0 ||
            reconciliation.recovery_from_empty ||
            !reconciliation.target_scope
          ) continue;
        } else if (reconciliation.recovery_from_empty) continue;
        if (reconciliation.target_scope === null) {
          if (currentIdentity === null) continue;
          nextEmptyPending = true;
        }
      } else if (event.type === "execution" && currentIdentity === null) continue;

      used.add(index);
      chain.push(event);
      const result = visit(scopeEventIdentity(event.output), nextEmptyPending);
      if (result) return result;
      chain.pop();
      used.delete(index);
    }
    failed.add(memoKey);
    return null;
  }

  return visit(startingIdentity, false);
}

async function validateImportDecision(project, reconciliation, previousScope, targetScope, inventory, options = {}) {
  const trackerText = await readFile(
    path.resolve(project.root, project.manifest.paths.audit_tracker),
    "utf8",
  );
  const tracker = await parseTrackerState(trackerText, project.root, options);
  const decisions = tracker.approvals.filter(
    (approval) => approval.id === reconciliation.author_decision_id,
  );
  const decision = decisions.length === 1 ? decisions[0] : null;
  const tokens = new Set(decision?.reason.split(/\s+/) ?? []);
  const scopeForDecision = targetScope ?? previousScope;
  return Boolean(
    tracker.valid &&
    decision &&
    scopeForDecision &&
    decision.status === "approved" &&
    decision.type === "creation-import" &&
    decision.operation === "creation-import" &&
    decision.scopeId === scopeForDecision.scope_id &&
    JSON.stringify(decision.paths) === JSON.stringify(scopeForDecision.files.map((file) => file.path)) &&
    (!targetScope || (
      targetScope.author_confirmation?.decision_id === reconciliation.author_decision_id &&
      targetScope.author_confirmation?.reading_order_confirmed === true
    )) &&
    tokens.has(`reconciliation_id=${reconciliation.reconciliation_id}`) &&
    tokens.has(`inventory_fingerprint=${reconciliation.inventory.inventory_fingerprint}`) &&
    tokens.has(`scope_fingerprint=${targetScope?.scope_fingerprint ?? "null"}`)
  );
}

export async function buildCreationCommitEvents(
  project,
  computation,
  cycle,
  roots,
  creationCommits,
  creationBatches,
  reconciliations,
  executionChain,
) {
  const events = [];
  const scopeReferences = new Map();
  for (const reference of [
    ...reconciliations.flatMap((reconciliation) => [
      reconciliation.previous_scope,
      reconciliation.target_scope,
    ]),
    ...executionChain.flatMap((execution) => [execution.input_scope, execution.target_scope]),
    roots.target_scope,
  ].filter(Boolean)) {
    scopeReferences.set(scopeEventIdentity(reference), reference);
  }
  for (const commit of creationCommits) {
    const batch = creationBatches.find((candidate) => candidate.batch_id === commit.batch_id);
    const commitReference = relatedArtifactsReference(
      computation.cycle?.related_artifacts.creation_commits,
      commit.commit_id,
      "commit_id",
    );
    const batchReference = relatedArtifactsReference(
      computation.cycle?.related_artifacts.creation_batches,
      commit.batch_id,
      "batch_id",
    );
    const inputScope = cycle?.bootstrap ? null : cycle?.starting_scope ?? null;
    if (
      !batch ||
      !commitReference ||
      !batchReference ||
      commit.scope_before_id !== (inputScope?.scope_id ?? null) ||
      batch.scope_id !== commit.scope_after_id
    ) {
      return null;
    }
    let matched = null;
    for (const targetReference of scopeReferences.values()) {
      if (
        targetReference.scope_id !== commit.scope_after_id ||
        targetReference.scope_id !== batch.scope_id
      ) continue;
      const outputSnapshot = await computation.json(
        {
          path: targetReference.snapshot_path,
          sha256: targetReference.snapshot_sha256,
        },
        "creation-target-scope",
        `${commit.commit_id}:${targetReference.scope_fingerprint}`,
        validateScopeSnapshot,
      );
      if (!outputSnapshot) continue;
      const candidate = {
        ...cycle,
        target_scope: targetReference,
        related_artifacts: {
          ...cycle.related_artifacts,
          creation_batches: [batchReference],
          creation_commits: [commitReference],
        },
      };
      try {
        const changeSet = await deriveCreationChangeSet(project, cycle, candidate, {
          related_artifacts: { creation_commits: [commitReference] },
        });
        if (changeSet) {
          matched = {
            type: "creation",
            value: { commit, batch, changeSet, outputSnapshot },
            input: inputScope,
            output: targetReference,
          };
          break;
        }
      } catch {
        continue;
      }
    }
    if (!matched) return null;
    events.push(matched);
  }
  return events;
}

function relatedArtifactsReference(references, id, field) {
  return (references ?? []).find((reference) => reference[field] === id) ?? null;
}

export async function validateScopeEventChain(
  project,
  computation,
  cycle,
  roots,
  reconciliations,
  reconciliationScopes,
  reconciliationInventories,
  executionChain,
  executionScopes,
  creationEvents,
) {
  const chain = buildScopeEventChain(cycle, roots, reconciliations, executionChain, creationEvents);
  if (!chain) return null;
  let origin = { files: [], excluded_files: [] };
  if (!cycle?.bootstrap) {
    origin = await computation.json(
      {
        path: cycle.starting_scope.snapshot_path,
        sha256: cycle.starting_scope.snapshot_sha256,
      },
      "starting-scope",
      cycle.starting_scope.scope_id,
      validateScopeSnapshot,
    );
    if (!origin) return null;
  }
  let previousScope = origin;
  let approvalsValid = true;
  for (const event of chain) {
    if (event.type === "creation") {
      if (!event.value.outputSnapshot) return null;
      previousScope = event.value.outputSnapshot;
      continue;
    }
    if (event.type === "execution") {
      const scopes = executionScopes.get(event.value.execution_id);
      if (!scopes?.input || !scopes.target) return null;
      previousScope = scopes.target;
      continue;
    }
    const reconciliation = event.value;
    const targetScope = reconciliation.target_scope
      ? reconciliationScopes.get(reconciliation.reconciliation_id)
      : null;
    const inventory = reconciliationInventories.get(reconciliation.reconciliation_id);
    if (
      (reconciliation.cycle_id !== null && reconciliation.cycle_id !== roots.cycle_id) ||
      !sameScopeReference(
        reconciliation.change_set.from_scope,
        cycle?.bootstrap ? null : cycle.starting_scope,
      ) ||
      !sameScopeReference(reconciliation.change_set.to_scope, reconciliation.target_scope) ||
      (reconciliation.target_scope && !targetScope) ||
      !inventory
    ) {
      return null;
    }
    const expected = diffManuscriptInventories(origin, targetScope ?? inventory);
    for (const field of [
      "created",
      "modified",
      "deleted",
      "reordered",
      "evidence_affected",
      "dependency_affected",
    ]) {
      if (JSON.stringify(expected[field]) !== JSON.stringify(reconciliation.change_set[field])) {
        return null;
      }
    }
    try {
      const approved = await validateImportDecision(
        project,
        reconciliation,
        previousScope,
        targetScope,
        inventory,
        computation.options,
      );
      if (!approved) approvalsValid = false;
    } catch {
      approvalsValid = false;
    }
    previousScope = targetScope;
  }
  return { chain, approvalsValid };
}
