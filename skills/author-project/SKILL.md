---
name: author-project
description: Use when initializing, reading, validating, or updating a neutral author-toolkit v3 project, recording its current scope or pending action, starting, evaluating, completing, or checking a current-draft convergence cycle, and recording manuscript backups and restores.
---

# Author Project

Manage persistent state for one book. The manifest is `<project-root>/.author-toolkit/project.json`; accept v3.0, v3.1, and v3.2 without resetting them. V3.1 registers `paths.creation` for shared creation state, batches, staging, and commit journals. V3.2 adds the convergence state root, deterministic scope fingerprints, immutable scope and inventory snapshots, and the authoritative current-draft convergence cycle. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

This skill owns state, paths, validation, backup records, cycle transitions, and commit bookkeeping. Manuscript prose and Story Bible creative content belong to the writing skills. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `initialize` | Project root, project metadata, paths, and BCP 47 language | Create a neutral v3.2 manifest, validate an existing v3 manifest, or migrate v2 without resetting work |
| `upgrade-v31` | Project root, confirmed additive upgrade, and optional creation path | Add v3.1 creation registration to a valid v3.0 manifest while preserving all work |
| `read` | Project root or manifest path | Return the parsed manifest, resolved paths, current scope and scope fingerprint, pending action, active cycle, shared stale or blocked evidence, and next action |
| `validate` | Project root or manifest path | Run the installed project schema validator and report diagnostics, including the v3.2 full-manuscript result and cycle contract |
| `status` | Project root or manifest path | Return current scope identity and validation, pending action, active cycle, recovery position, evaluation outcome, shared stale or blocked evidence, approvals, and next action |
| `set-pending` | Operation, status, scope ID, reason, and artifacts | Write the requested pending action without stage progression or cycle ownership |
| `record-scope` | Scope ID, description, ordered files with SHA-256 hashes, excluded files, and `proposed` or `confirmed` status; for confirmation, an author-confirmation reference with reading-order confirmation | Record the current scope; on v3.2, compute its scope fingerprint and preserve immutable inventory and scope snapshots after confirmation |
| `start-cycle` | Cycle ID, initiating strategy, explicit bootstrap marker, and starting scope reference | Start one active current-draft convergence cycle after validating the bootstrap exception or current satisfied starting evaluation |
| `transition-cycle` | Cycle ID, expected revision, and requested strategy, recovery position, target, pass, change set, work set, or related-artifact changes | Resume the same active cycle through an optimistic, content-checked transition |
| `prepare-revision-execution` | Cycle ID, expected revision, execution ID, hashed plan and batch, pass and input scope, finding decisions, edit approvals, backups, file actions, and input/output hashes | Validate existing author decisions, approvals, backup manifests and bytes, and current inputs; write a `prepared` record without approving or editing manuscript |
| `verify-revision-execution` | Cycle ID, expected revision, execution ID, final requested pass, and full-manuscript target scope | Reread actual output bytes against the prepared hashes, verify the approved target change set, and link a `verified` record to the cycle |
| `evaluate-cycle` | Cycle ID, expected revision, evaluation ID, coverage index, intake and baseline reports, review group, and semantic attestations | Derive and preserve an immutable evaluation and evidence graph without accepting a caller-supplied outcome |
| `complete-cycle` | Cycle ID, expected revision, new evaluation ID, completion decision ID, and explicit author confirmation | Record the decision, reevaluate the changed tracker evidence, and complete only a still-satisfied cycle |
| `cycle-status` | Project root or manifest path | Read the active cycle, pending action, recovery position, current evaluation outcome, and independent request completion without writing state |
| `cycle-gate` | Project root or manifest path | Succeed only for a current satisfied evaluation; return structured blockers otherwise |
| `check-operation` | Strategy, operation, explicit manuscript-change marker, and optional cycle ID | Allow read-only inspection or the active cycle's exact recovery work; block parallel manuscript changes |
| `record-backup` | Operation, scope ID, approval ID, affected files and actions, and backup ID | Back up existing files and record expected absence for create targets |
| `record-restore` | Operation, scope ID, backup or commit ID, files, independent restore approval ID, and safety backup ID | Record an approved restore, including safe removal of batch-created files, and propagate dependency invalidation |

For every operation, read [`references/operations.md`](references/operations.md) and follow its state, evidence, approval, and record rules. Use [`assets/project-template.json`](assets/project-template.json) only for a new v3.2 manifest.

When the installed toolkit provides `scripts/lib/index.mjs`, its public `recordScope`, `validateFullManuscriptScope`, `startCycle`, `transitionCycle`, `prepareRevisionExecution`, `verifyRevisionExecution`, `evaluateCycle`, `completeCycle`, `getCycleStatus`, `getRequestCompletion`, `checkConvergenceGate`, and `assertCycleAllowsOperation` functions are the executable project-operation seam. Host procedures and disposable-project tests use these same functions or the executable facade:

```bash
node <toolkit-root>/scripts/author-project.mjs start-cycle --project-root <project-root> --input <request.json>
node <toolkit-root>/scripts/author-project.mjs transition-cycle --project-root <project-root> --input <transition.json>
node <toolkit-root>/scripts/author-project.mjs prepare-revision-execution --project-root <project-root> --input <preparation.json>
node <toolkit-root>/scripts/author-project.mjs verify-revision-execution --project-root <project-root> --input <verification.json>
node <toolkit-root>/scripts/author-project.mjs evaluate-cycle --project-root <project-root> --input <evaluation-request.json>
node <toolkit-root>/scripts/author-project.mjs complete-cycle --project-root <project-root> --input <completion.json>
node <toolkit-root>/scripts/author-project.mjs cycle-status --project-root <project-root>
node <toolkit-root>/scripts/author-project.mjs cycle-gate --project-root <project-root>
node <toolkit-root>/scripts/author-project.mjs check-operation --project-root <project-root> --input <operation.json>
```

Use the public validator CLI for independent artifact, manifest, and read-only cycle checks. These project operations never invoke a strategy.

## Invocation boundary

This skill calls no other skills. Use text reads and writes for normal operation. Run the documented project-operation, validation, or migration script when the installed toolkit provides it. Display the recovery position's exact registered strategy command and wait for the author; do not invoke it. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. For a v3.2 scope, include its scope ID, scope fingerprint, snapshot paths, and full-manuscript result. For a current-draft convergence cycle, include its ID, revision, status, current strategy, recovery position, evaluation outcome, blockers, and exact next action. Leave creative files untouched. Initialization ends with shared project state ready for the author to choose `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`; it does not start a skill or select an entry operation.
