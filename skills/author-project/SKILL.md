---
name: author-project
description: Use when initializing, reading, validating, or updating an author-toolkit 4.0.0 project, recording its current scope, pending action, findings, finding decisions, approvals, backups, and restores, and operating current-draft convergence cycles and manuscript reconciliation.
---

# Author Project

Manage persistent state for one book. The only supported manifest is `<project-root>/.author-toolkit/project.json` with `schema_version: "4.0.0"`. It registers shared creation state and the convergence state root, deterministic scope fingerprints, immutable scope and inventory snapshots, and the authoritative current-draft convergence cycle. Old manifests and old shared artifacts receive `greenfield-initialization-required`: preserve them and initialize a separate project from manuscript-only input. Never migrate or import old shared state. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

This skill owns state, paths, validation, backup records, cycle transitions, and commit bookkeeping. Manuscript prose and Story Bible creative content belong to the writing skills. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `initialize` | Project root, project metadata, paths, and BCP 47 language | Run public `init` to create fresh neutral 4.0.0 operational state without importing evidence, validate an existing 4.0.0 project without resetting work, or reject old state before any write |
| `timestamp` | Optional injectable UTC time for deterministic tests | Return one versioned response whose `result.json` and `result.filename` values share one UTC clock reading |
| `read` | Project root or manifest path; optional `--full` | Return compact project status by default, or the complete manifest and convergence status only when explicitly requested |
| `validate` | Project root or manifest path | Run the installed project schema validator and report diagnostics, including the 4.0.0 full-manuscript result and cycle contract |
| `status` | Project root or manifest path; optional `--full` | Return project and reference validation, scope identity and file count, pending action, active cycle and recovery position, evaluation outcome and blockers, decision counts, and exact next action |
| `set-pending` | Operation, status, reason, optional artifacts and scope expectations, optional expected manifest hash, and exact cycle identity when supplied | Write operation-scoped pending work while preserving current scope and active-cycle coordination; never infer approval |
| `record-scope` | Scope ID, description, ordered paths or path/hash entries, optional exclusions and creation time, and `proposed` or `confirmed` status; confirmation requires an author-confirmation reference with reading-order confirmation | Recompute current hashes and exclusions, record deterministic identities, validate full-manuscript coverage, and preserve immutable snapshots after confirmation |
| `record-finding` | Exact finding v2 object, operation, current report, `open` status, reason, and optional expected tracker hash | Validate stable identity and report binding, reject duplicate IDs, and publish one real tracker row through the shared lock |
| `record-finding-decision` | Finding ID, `resolved`, `deferred`, `dismissed`, or `stale`, current report and evidence, approved author decision, reason, and optional expected tracker hash | Preserve status-specific evidence semantics and bind the row with matching author-decision and finding-status tokens |
| `record-approval` | Approval ID, type, operation, scope, complete ordered paths and file actions and versions, status, reason, exact revision binding when applicable, and optional expected tracker hash | Bind the explicit author decision with `approval_files` and canonical revision approval tokens before verified publication |
| `record-backup` | Operation, scope ID, approval ID, affected files and actions, and backup ID | Back up existing files and record expected absence for create targets |
| `record-restore` | Operation, scope ID, backup or commit ID, files, independent restore approval ID, and safety backup ID | Record an approved restore, including safe removal of batch-created files, and propagate dependency invalidation |
| `start-cycle` | Cycle ID, initiating strategy, explicit bootstrap marker, and starting scope reference | Start one active current-draft convergence cycle after validating the bootstrap exception or current satisfied starting evaluation |
| `transition-cycle` | Cycle ID, expected revision, operation ID, and requested strategy, recovery position, target, pass, change set, work set, or related-artifact changes | Resume the same active cycle through an optimistic, content-checked transition with coordinated manifest state |
| `reconcile-cycle` | Project root for diagnosis, or exact cycle and operation IDs with an explicit direction | Diagnose interrupted cross-file state without writes, or recover it without rewriting history; never infer approval from pending action |
| `reconcile-manuscript` | Reconciliation ID, exact import decision, previous and target scope evidence, current story-state references, and active cycle identity when present | Preserve an immutable manuscript reconciliation and route the same cycle or later start through increment, full-draft recovery, or nonempty import |
| `prepare-revision-execution` | Cycle ID, expected revision, execution ID, hashed plan and batch, pass and input scope, finding decisions, edit approvals, backups, file actions, and input/output hashes | Validate existing author decisions, approvals, backup manifests and bytes, and current inputs; write a `prepared` record without approving or editing manuscript |
| `verify-revision-execution` | Cycle ID, expected revision, execution ID, final requested pass, and full-manuscript target scope | Reread actual output bytes against the prepared hashes, verify the approved target change set, and link a `verified` record to the cycle |
| `evaluate-cycle` | Cycle ID, expected revision, evaluation ID, coverage index, intake and baseline reports, review group, and semantic attestations | Derive and preserve an immutable evaluation and evidence graph without accepting a caller-supplied outcome |
| `complete-cycle` | Cycle ID, expected revision, new evaluation ID, completion decision ID, and explicit author confirmation | Record the decision, reevaluate the changed tracker evidence, and complete only a still-satisfied cycle |
| `cycle-status` | Project root or manifest path | Read the active cycle, pending action, recovery position, current evaluation outcome, and independent request completion without writing state |
| `cycle-gate` | Project root or manifest path | Succeed only for a current satisfied evaluation; return structured blockers otherwise |
| `check-operation` | Strategy, operation, explicit manuscript-change marker, and optional cycle ID | Allow read-only inspection or the active cycle's exact recovery work; block parallel manuscript changes |

For every operation, read [`references/operations.md`](references/operations.md) and follow its state, evidence, approval, and record rules. Use [`assets/project-template.json`](assets/project-template.json) only for a new 4.0.0 manifest.

Every public project CLI command returns one JSON project response envelope: `response_contract_version: "1.0"`, `command`, boolean `valid`, command-specific `result`, and structured `errors`. Read the operation payload from `result`. Success and valid read-only queries exit 0, including an unfinished `indeterminate` status; project, operation, evidence, or gate validation failures exit 1; argument, input-file, or input-shape usage errors exit 2. No-argument help is the only non-envelope invocation. Default `read` and `status` responses are compact. Use explicit `--full` or dedicated cycle and artifact queries for complete manifests, ordered path hashes, evaluation identities, evidence graphs, and history.

In a source checkout, `scripts/lib/index.mjs` exports the public `setPendingAction`, `recordProjectScope`, `recordFinding`, `recordFindingDecision`, `recordApproval`, `recordBackup`, `recordRestore`, `recordScope`, `validateFullManuscriptScope`, `startCycle`, `transitionCycle`, `reconcileCycle`, `reconcileManuscript`, `diffManuscriptInventories`, `prepareRevisionExecution`, `verifyRevisionExecution`, `evaluateCycle`, `completeCycle`, `getCycleStatus`, `getRequestCompletion`, `checkConvergenceGate`, and `assertCycleAllowsOperation` functions. Generic and plugin installations provide the same project operations through the self-contained ESM facade in the setup skill; it bundles Ajv and all runtime dependencies and needs no project-local npm installation. Resolve `<setup-skill>` as the installed `setup-author-toolkit` skill directory:

```bash
node <setup-skill>/assets/runtime/author-project.mjs timestamp
node <setup-skill>/assets/runtime/author-project.mjs init --project-root <project-root> --input <initialization.json>
node <setup-skill>/assets/runtime/author-project.mjs read --project-root <project-root>
node <setup-skill>/assets/runtime/author-project.mjs status --project-root <project-root> [--full]
node <setup-skill>/assets/runtime/author-project.mjs set-pending --project-root <project-root> --input <pending-action.json>
node <setup-skill>/assets/runtime/author-project.mjs record-scope --project-root <project-root> --input <scope.json>
node <setup-skill>/assets/runtime/author-project.mjs record-finding --project-root <project-root> --input <finding.json>
node <setup-skill>/assets/runtime/author-project.mjs record-finding-decision --project-root <project-root> --input <finding-decision.json>
node <setup-skill>/assets/runtime/author-project.mjs record-approval --project-root <project-root> --input <approval.json>
node <setup-skill>/assets/runtime/author-project.mjs record-backup --project-root <project-root> --input <backup.json>
node <setup-skill>/assets/runtime/author-project.mjs record-restore --project-root <project-root> --input <restoration.json>
node <setup-skill>/assets/runtime/validate.mjs --backup-index <project-root>/<paths.backups>/index.json
node <setup-skill>/assets/runtime/author-project.mjs start-cycle --project-root <project-root> --input <request.json>
node <setup-skill>/assets/runtime/author-project.mjs transition-cycle --project-root <project-root> --input <transition.json>
node <setup-skill>/assets/runtime/author-project.mjs reconcile-cycle --project-root <project-root> [--input <direction.json>]
node <setup-skill>/assets/runtime/author-project.mjs reconcile-manuscript --project-root <project-root> --input <reconciliation.json>
node <setup-skill>/assets/runtime/author-project.mjs prepare-revision-execution --project-root <project-root> --input <preparation.json>
node <setup-skill>/assets/runtime/author-project.mjs verify-revision-execution --project-root <project-root> --input <verification.json>
node <setup-skill>/assets/runtime/author-project.mjs evaluate-cycle --project-root <project-root> --input <evaluation-request.json>
node <setup-skill>/assets/runtime/author-project.mjs complete-cycle --project-root <project-root> --input <completion.json>
node <setup-skill>/assets/runtime/author-project.mjs cycle-status --project-root <project-root>
node <setup-skill>/assets/runtime/author-project.mjs cycle-gate --project-root <project-root>
node <setup-skill>/assets/runtime/author-project.mjs check-operation --project-root <project-root> --input <operation.json>
```

Use the public validator CLI for independent artifact, manifest, and read-only cycle checks. These project operations never invoke a strategy.

## Invocation boundary

This skill calls no other skills. Use text reads and writes for normal operation. Run the documented project-operation or validation script from the installed payload. Display the recovery position's exact registered strategy command and wait for the author; do not invoke it. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. For a 4.0.0 scope, include its scope ID, scope fingerprint, snapshot paths, and full-manuscript result. For a current-draft convergence cycle, include its ID, revision, status, current strategy, recovery position, evaluation outcome, blockers, and exact next action. Leave creative files untouched. Initialization ends with shared project state ready for the author to choose `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`; it does not start a skill or select an entry operation.
