# Migrating to Author Toolkit 3.2

Author Toolkit 3.2 adds deterministic scope and inventory identities, immutable snapshots, and the current-draft convergence cycle. Project migration converts v2, v3.0, and v3.1 projects directly to v3.2 while preserving prior work. It does not turn legacy reports, approvals, pending actions, or staging into a satisfied convergence evaluation or an active cycle.

## Run the migration

Use a disposable copy for development. For an actual writing project, first preserve any independent backup you normally require, then run:

```bash
node <toolkit-root>/scripts/migrate-v32.mjs --project-root <project-root>
```

The existing command remains a compatibility wrapper with the same v3.2 target:

```bash
node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>
```

The public JavaScript functions are `migrateProjectToV32` and the compatibility wrapper `migrateProjectToV3`. Neither path writes a v3.1 manifest or creates an intermediate v3.1 migration record before producing v3.2.

Run `setup-author-toolkit` after installing or updating the toolkit so the project receives every shared reference. Existing reference conflicts still require the exact-file approval and backup procedure. Setup and migration do not invoke a writing strategy.

## Migration matrix

| Source | Migration snapshot | Scope and storage result |
| --- | --- | --- |
| v2.0.0 | `.author-toolkit/migrations/<stamp>-v2-v3_2/` | Inventory the manuscript into a proposed `scope-v3-migration`, convert unfinished stage work to an `awaiting_author` pending action, and retain overrides as deferred `LEGACY` approvals. Add creation and convergence storage. |
| v3.0.0 | `.author-toolkit/migrations/<stamp>-v3_0-v3_2/` | Preserve the registered paths and pending action, add the default creation path and convergence state root, and compute the current scope fingerprint when a scope exists. |
| v3.1.0 | `.author-toolkit/migrations/<stamp>-v3_1-v3_2/` | Preserve the registered creation path and pending action, add the convergence state root, and compute the current scope fingerprint when a scope exists. |
| v3.2.0 | None | Validate and return without changing project bytes or creating another snapshot. The CLI reports `snapshot: null` and empty `created_snapshots`. |

Every source migration preserves manuscripts, reports, findings, approvals, scopes in the original manifest snapshot, sessions, handoffs, staging, backups, creation batches, commit journals, and story state. Existing registered paths are retained. New operational directories are created with recursive directory creation; existing files are not cleared.

The convergence state root contains `cycles/`, `scopes/`, `inventories/`, `reconciliations/`, `passes/`, `executions/`, `no-edit-skips/`, `review-groups/`, `attestations/`, and `evaluations/`. No `active-cycle.json` is created by migration. A v2 migration with no manuscript files fails before changing project state, as in the earlier migration guides.

## Scope and inventory evidence

Each migrated current scope receives its deterministic `scope_fingerprint`. Migration preserves an inventory snapshot for the manuscript inventory that can be read and hashed from current inputs, including an empty inventory for a legacy v3 project with no current scope.

A confirmed scope snapshot additionally needs an exact legacy scope confirmation. The migrator recognizes one existing tracker approval only when all of these conditions match:

- `Type` is `scope-confirmation`, `Operation` is `intake`, and `Status` is `approved`;
- the scope ID and complete ordered path list match the legacy current scope;
- the reason contains whitespace-separated `scope_fingerprint=<computed-fingerprint>` and `reading_order_confirmed=true` tokens;
- exactly one approval satisfies every condition.

Its existing approval ID and update timestamp become the snapshot's `author_confirmation` reference. Migration does not add or modify that approval. The scope and inventory artifacts use the same fingerprint and no-clobber publication rules as a normal public `record-scope` confirmation (`recordScope` in the source module).

Without that exact reference, a legacy confirmed scope becomes `proposed` in the v3.2 manifest so the author can reconfirm it. The original confirmed record remains unchanged in the migration's `project.json` snapshot, and the migration record uses `scope_disposition: "reconfirmation-required"` with `scope_confirmation: null`. No placeholder decision ID or approval is invented. A proposed scope never supplies `full_manuscript=true` or a satisfied evaluation.

The CLI reports newly created artifacts under `created_snapshots.scopes` and `created_snapshots.inventories`. These are historical inputs for later evaluation, not evidence that the manuscript has reached current-draft revision convergence.

## Pending work and legacy recovery

A v3.0 or v3.1 pending action is preserved exactly. A v2 unfinished current stage retains the established conversion to an `awaiting_author` pending action. Pending action remains operation-scoped and supplies no cycle ownership, manuscript write, publication, restore, or completion approval.

The migration summary's `recovery` object reports unresolved legacy work without changing it:

- `interrupted_commits` identifies nonterminal commit journals;
- `interrupted_pending_actions` identifies legacy `in_progress` pending work;
- `legacy_staging` identifies unresolved staging, including a batch marked `rejected` without a verified rejection decision;
- `pending_decision_required` records whether any pending action remains;
- `blockers` and `required_action` identify the next recovery boundary.

Run this read-only diagnosis before dependent cycle work:

```bash
node <toolkit-root>/scripts/author-project.mjs reconcile-cycle --project-root <project-root>
```

A nonterminal journal produces `legacy-commit-recovery-required`; an in-progress legacy pending action produces `legacy-pending-recovery-required`. These states block a new cycle and dependent manuscript writes. The diagnosis does not modify the manifest, journal, staging, or approvals and does not invent an active cycle for recovery ownership. Follow the explicit continue, reject, or restore decision in `skills/write-fiction/references/creation-state.md`, including all backup and input-hash checks. After the journal reaches a terminal state and the pending work is reconciled, rerun the diagnosis before starting a cycle.

## Staged drafts from a legacy project

Migration never publishes staging or treats an old acceptance as a v3.2 creation acceptance. Preserve the staged bytes and choose one explicit route:

1. **Reject:** Record the author's exact `creation-rejection` decision for the batch and preserve the rejected staging outside manuscript inventory. Do not create a commit journal. The batch must be schema-valid, have `status: "rejected"` and `commit: null`, and name exactly one rejection approval ID in `batch.approvals`. The valid tracker must contain that exact ID with `type: "creation-rejection"`, `operation: "chapter-review"`, and `status: "approved"`. Its ordered paths must equal the batch paths, and its reason must bind the same batch ID, the dependency fingerprint recomputed from the plan, file actions and input versions, and the current scope fingerprint. A nonempty legacy scope also requires the same scope ID in the batch, approval, and current scope. With no current scope, the batch must have `scope_id: null` and use the empty scope fingerprint. A status label or caller-supplied boolean never substitutes for this decision.
2. **Reapprove:** First complete a current full-manuscript `revise-draft` recovery and obtain a satisfied starting evaluation. Then start one new `write-fiction` cycle and recheck the exact staged bytes, context versions, dependency fingerprint, story-state differences, and complete publication scope. Record new exact `creation-manuscript` and `creation-scope` approvals bound to that batch, dependency fingerprint, and scope fingerprint before any commit. Legacy approvals and pending action do not substitute for these decisions.

A batch marked `rejected` without that exact decision remains blocked by `legacy-staging-decision-required`, for bootstrap and for an ordinary cycle even when satisfied starting evidence exists. A valid rejection permits an empty project to use the normal bootstrap rules; it does not make the empty manuscript satisfied. A valid nonempty rejection still requires the satisfied starting evaluation before an ordinary cycle. Other unresolved staging retains the reapproval route above after that evaluation. No route publishes during migration, diagnosis, rejection, or cycle start.

## Legacy revision evidence

Legacy reports and findings remain immutable historical evidence. If the original revision base cannot be revalidated, run a current full-manuscript `revise-draft` pass instead of constructing a starting scope or cycle from the old pending action. Reuse whole reports and full local coverage units only under the normal operation, scope, path/hash, subcheck, dependency, and source-identity rules. Migration does not bless partial, skipped, stale, or synthesis coverage and does not rewrite coverage artifacts into cycle-owned evidence.

A current satisfied evaluation must come from the v3.2 evaluator with real scope, report, coverage, review, execution or no-edit, decision, and semantic-attestation evidence. Schema-valid legacy artifacts alone remain `indeterminate`.

## Compatibility and history

V2, v3.0, and v3.1 manifest schemas remain available for their supported read and validation paths. Older tools do not implement the v3.2 convergence contracts. Do not remove registered paths or rename a schema version to force compatibility.

The migration snapshot preserves the original manifest and `migration.json` records the source, target, scope disposition, pending work, overrides, and created snapshot references. These writes are coordinated per-file operations, not a claimed multi-file filesystem transaction. Keep all migration snapshots and historical artifacts.

The shipped `examples/fiction-revision-en/` and `examples/fiction-revision-zh/` projects intentionally remain v2 compatibility fixtures. Migrate only disposable copies, never those fixtures in place.

See [VALIDATION.md](VALIDATION.md) for the checks actually executed. Repository migration tests do not prove a complete host run, actual editorial judgment, or creative quality. Historical behavior is retained in [MIGRATION-3.1.md](MIGRATION-3.1.md), [MIGRATION-3.0.md](MIGRATION-3.0.md), and [MIGRATION-2.0.md](MIGRATION-2.0.md).
