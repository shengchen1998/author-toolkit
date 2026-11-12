---
name: author-project
description: Use when reading, validating, or updating a neutral author-toolkit v3.1 project, recording its current scope or pending action, and recording manuscript backups, execution receipts, and restores.
---

# Author Project

Manage persistent state for one book. The manifest is `<project-root>/.author-toolkit/project.json`; accept only schema v3.1 without resetting it. V3.1 registers `paths.creation` for shared creation state, batches, staging, and commit journals. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

This skill owns state, paths, validation, backup records, execution receipts, and commit bookkeeping. Manuscript prose and Story Bible creative content belong to the writing skills. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `read` | Project root or manifest path | Return the bounded validated manifest projection, resolved paths, scope hashes, and pending-artifact counts through `read.mjs` |
| `validate` | Project root or manifest path | Run the installed project schema validator and report registered-file and current-scope hash diagnostics |
| `status` | Project root or manifest path; for a current-draft revision convergence or previous/base-scope execution gate, target scope ID and `--require-execution` | Return current scope, pending action, recorded blockers, and execution evidence; do not infer operation-specific evidence completeness |
| `status --digest` | Project root | Generate the bounded `PROJECT_STATE.md` navigation cache after complete project validation, with a UTC generation-time snapshot, finding counts, current-scope execution evidence, latest pointers, and the recorded next action when execution evidence permits; otherwise show the reconciliation route |
| `next-finding-id` | Uppercase audit prefix and positive batch count | Return an unused consecutive ID block after all tracker and immutable-report history |
| `record-findings` | Project root and one or more immutable report paths beneath the registered reports path | Validate and atomically insert or update finding rows while preserving author decisions |
| `set-pending` | Operation, status, scope ID, reason, and artifacts | Write the requested pending action without stage progression |
| `record-scope` | Scope ID, description, ordered files with SHA-256 hashes, excluded files, and `proposed` or `confirmed` status | Record the current scope after the required author confirmation |
| `record-backup` | Operation, scope ID, approval ID, exact batch file, and optional backup ID | Refuse a new batch while another unverified approval remains; otherwise back up existing files and record expected absence for create targets |
| `complete-write` | Operation, scope ID, approval ID, exact publication batch, and optional creation commit journal | Publish approved content through verified temporary siblings, preserve execution evidence, and append its linked receipt in one invocation |
| `record-execution` | One preserved post-write evidence file and receipt timestamp from interrupted or historical recovery | Append one evidence-linked post-write execution receipt and report any remaining unverified approvals |
| `reconcile-executions` | One or more preserved post-write evidence files; explicit `--write` after preview | Add only provable missing receipts, preserve unsupported approvals as unverified, and report rejected evidence |
| `check-index` | Manifest path and `--explain` | Run read-only backup index inspection, including exact backup and approval identity differences, without repairing history |
| `record-restore` | Operation, scope ID, backup or commit ID, files, independent restore approval ID, and safety backup ID | Record an approved restore, including safe removal of batch-created files, and propagate dependency invalidation |

For `read`, `validate`, `status`, `status --digest`, and `check-index`, read [`references/read-operations.md`](references/read-operations.md). For a new manifest and every record or write operation, read [`references/operations.md`](references/operations.md) and follow its state, evidence, approval, and record rules. Setup owns new-project registration and runs `<setup-skill-root>/scripts/initialize.mjs --project-root <project-root>` for an existing manifest; this skill has no `initialize` operation. Use [`assets/project-template.json`](assets/project-template.json) only when setup creates a new v3.1 manifest.

## Invocation boundary

This skill calls no other skills. Its `SKILL.md` and applicable references are the procedure, which the agent executes directly. Use the installed CLIs for their operations and `writes.mjs` for backups, manuscript publication, execution receipts, execution reconciliation, and backup index inspection rather than manually changing their index. Read shared contracts from `<setup-skill-root>/assets/references/`. These CLIs include their runtime dependencies and require no repository checkout or project `npm install`. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. For each shared-state operation, refresh the navigation cache once after its state writes, following [`references/read-operations.md`](references/read-operations.md). Leave creative files untouched. Setup finishes with shared project state ready for the author to choose `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`; it does not start a skill or select an entry operation.
