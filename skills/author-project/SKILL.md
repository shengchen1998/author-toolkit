---
name: author-project
description: Use when reading, validating, or updating a neutral author-toolkit v3.1 project, recording its current scope or pending action, and recording manuscript backups, execution receipts, and restores.
version: 3.1.0
---

# Author Project

Manage persistent state for one book. The manifest is `<project-root>/.author-toolkit/project.json`; accept only schema v3.1 without resetting it. V3.1 registers `paths.creation` for shared creation state, batches, staging, and commit journals. Toolkit skills from one installation are siblings. Resolve `<setup-skill-root>` as `../setup-author-toolkit` relative to this skill's installed directory and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

This skill owns state, paths, validation, backup records, execution receipts, and commit bookkeeping. Manuscript prose and Story Bible creative content belong to the writing skills. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `read` | Project root or manifest path | Return the bounded validated manifest projection, resolved paths, scope hashes, and pending-artifact counts through `read.mjs` |
| `validate` | Project root or manifest path | Run the installed project schema validator and report registered-file and current-scope hash diagnostics |
| `status` | `node <setup-skill-root>/scripts/status.mjs --manifest <project-root>/.author-toolkit/project.json`; add `--scope-id <target-scope-id> --require-execution` for a current-draft revision convergence or previous/base-scope execution gate | Return current scope, pending action, recorded blockers, and execution evidence; do not infer operation-specific evidence completeness |
| `check --full` | `node <setup-skill-root>/scripts/check.mjs --project-root <project-root> --full [--scope-id <scope-id>]` | Run one read-only project, selected-evidence, and strict-execution check; do not infer evidence currency, operation completion, or current-draft revision convergence |
| `check --digest` | `node <setup-skill-root>/scripts/check.mjs --project-root <project-root> --digest --json [--require-sibling NAME ...]` | Run one installation, requested-sibling, entry-file, project-validation, and ordinary-status check; return the bounded validated projection in JSON and refresh the navigation cache |
| `status --digest` | `node <setup-skill-root>/scripts/project-digest.mjs --project-root <project-root>` | Generate the bounded `PROJECT_STATE.md` navigation cache after complete project validation, with a UTC generation-time snapshot, finding counts, current-scope execution evidence, latest pointers, and the recorded next action when execution evidence permits; otherwise show the reconciliation route |
| `next-finding-id` | Uppercase audit prefix and positive batch count | Return an unused consecutive ID block after all tracker and immutable-report history |
| `record-findings` | Project root and one or more immutable report paths beneath the registered reports path | Under the shared write lock, validate and atomically insert or update finding rows and one Audit runs row per report while preserving author decisions |
| `scaffold-report` | Project manifest, create-only report destination, human-readable body, executing skill name, and report v2 envelope or semantic fields for a stage preset | Fill the declared skill version and preset fields, default omitted findings to `findings: []`, validate the complete report before writing, and preserve existing reports |
| `coverage-index` | Project manifest and one complete operation entry | Validate the referenced full local coverage units and reports, preserve other operations, and atomically update the living coverage index |
| `evidence-retention` | Project root; optional operation; explicit enable and apply for migration | Preview bounded audit-evidence retention or migrate and apply it while protecting current and recovery references |
| `review-brief` | Project root, living tracker, and optional output path | Regenerate every resolved and dismissed tracker decision with exact locations, reasons, and report paths; validate and atomically replace the disposable brief |
| `set-pending` | Operation, status, scope ID, reason, and artifacts | Write the requested pending action without stage progression |
| `record-scope` | Scope ID, description, ordered manuscript files, and non-manuscript exclusions for a proposal; matching scope ID for confirmation | Hash and record a proposed current scope; after explicit author confirmation, confirm only that exact unchanged record |
| `record-backup` | Operation, scope ID, approval ID, exact batch file, and optional backup ID | Refuse a new batch while another unverified approval remains; otherwise back up existing files and record expected absence for create targets |
| `complete-write` | Operation, scope ID, approval ID, exact publication batch, and optional creation commit journal | Publish approved content through verified temporary siblings, preserve execution evidence, and append its linked receipt in one invocation |
| `record-execution` | One preserved post-write evidence file and receipt timestamp from interrupted or historical recovery | Append one evidence-linked post-write execution receipt and report any remaining unverified approvals |
| `reconcile-executions` | One or more preserved post-write evidence files; explicit `--write` after preview | Add only provable missing receipts, preserve unsupported approvals as unverified, and report rejected evidence |
| `check-index` | Manifest path and `--explain` | Run read-only backup index inspection, including exact backup and approval identity differences, without repairing history |
| `record-restore` | Operation, scope ID, backup or commit ID, files, independent restore approval ID, and safety backup ID | Record an approved restore, including safe removal of batch-created files, and propagate dependency invalidation |

For `validate`, read only [Read and validate](references/read-operations.md#read-and-validate). For `read`, `status`, `check --full`, `check --digest`, `status --digest`, and `check-index`, read [`references/read-operations.md`](references/read-operations.md). Setup owns new-project registration through `<setup-skill-root>/scripts/scaffold-project.mjs` and captures `<setup-skill-root>/scripts/initialize.mjs --project-root <project-root>` through `setup-report.mjs` for an existing manifest; this skill has no `scaffold-project` or `initialize` operation. Its assets supply the templates read by the scaffold CLI.

### Operation reference routes

For each operation below, read the [opening project-operation rules](references/operations.md#project-operations) and the linked sections. When those ranges are noncontiguous, read `operations.md` once in full; otherwise use bounded section reads. The opening rules cover installation, bounded reads, and navigation-cache refresh. Follow [Digest](references/read-operations.md#digest) for that refresh rather than reading the whole read-operations reference. Do not read unrelated operation sections during bounded reads.

| Operations | Required sections in `operations.md` |
|---|---|
| `next-finding-id` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Tracker and approvals](references/operations.md#tracker-and-approvals) |
| `record-findings` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Tracker and approvals](references/operations.md#tracker-and-approvals) |
| `scaffold-report` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Scaffold report](references/operations.md#scaffold-report) |
| `coverage-index` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Coverage index](references/operations.md#coverage-index) |
| `evidence-retention` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Tracker and approvals](references/operations.md#tracker-and-approvals); [Evidence retention](references/operations.md#evidence-retention) |
| `review-brief` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Review brief](references/operations.md#review-brief) |
| `set-pending` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Set pending](references/operations.md#set-pending) |
| `record-scope` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Record scope](references/operations.md#record-scope) |
| `record-backup` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Tracker and approvals](references/operations.md#tracker-and-approvals); [Backup and creation commit](references/operations.md#backup-and-creation-commit) |
| `complete-write` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Tracker and approvals](references/operations.md#tracker-and-approvals); [Backup and creation commit](references/operations.md#backup-and-creation-commit); [Complete write](references/operations.md#complete-write) |
| `record-execution`, `reconcile-executions` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Tracker and approvals](references/operations.md#tracker-and-approvals); [Complete write](references/operations.md#complete-write) |
| `record-restore` | [Paths and manifest identity](references/operations.md#paths-and-manifest-identity); [Shared scope and evidence](references/operations.md#shared-scope-and-evidence); [Tracker and approvals](references/operations.md#tracker-and-approvals); [Restore](references/operations.md#restore) |

## Invocation boundary

This skill calls no other skills. Its `SKILL.md` and applicable references are the procedure, which the agent executes directly. Use the installed CLIs for their operations and `writes.mjs` for backups, manuscript publication, execution receipts, execution reconciliation, and backup index inspection rather than manually changing their index. Read shared contracts from `<setup-skill-root>/assets/references/`. These CLIs include their runtime dependencies and require no repository checkout or project `npm install`. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. When recording a stopping point, write the session note from [`assets/session-note-template.md`](assets/session-note-template.md). For each shared-state operation, refresh the navigation cache once after its state writes, following [Digest](references/read-operations.md#digest). Leave creative files untouched. Setup finishes with shared project state ready for the author to choose `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`; it does not start a skill or select an entry operation.
