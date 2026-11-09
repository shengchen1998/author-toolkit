---
name: author-project
description: Use when initializing, reading, validating, or updating a neutral author-toolkit v3.1 project, recording its current scope or pending action, and recording manuscript backups, execution receipts, and restores.
---

# Author Project

Manage persistent state for one book. The manifest is `<project-root>/.author-toolkit/project.json`; accept only schema v3.1 without resetting it. V3.1 registers `paths.creation` for shared creation state, batches, staging, and commit journals. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

This skill owns state, paths, validation, backup records, execution receipts, and commit bookkeeping. Manuscript prose and Story Bible creative content belong to the writing skills. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `initialize` | Project root, project metadata, paths, and BCP 47 language | Create a neutral v3.1 manifest or validate an existing v3.1 manifest without resetting work |
| `read` | Project root or manifest path | Return the full parsed manifest and resolved paths through text reads and installed validation; there is no `read.mjs` |
| `validate` | Project root or manifest path | Run the installed project schema validator and report registered-file and current-scope hash diagnostics |
| `status` | Project root or manifest path | Return current scope, pending action, recorded blockers, and execution evidence; do not infer operation-specific evidence completeness |
| `status --digest` | Project root | Generate the bounded `PROJECT_STATE.md` navigation cache with finding counts, latest pointers, and next action |
| `next-finding-id` | Uppercase audit prefix and positive batch count | Return an unused consecutive ID block after all tracker and immutable-report history |
| `record-findings` | Project root and one or more immutable report paths beneath the registered reports path | Validate and atomically insert or update finding rows while preserving author decisions |
| `set-pending` | Operation, status, scope ID, reason, and artifacts | Write the requested pending action without stage progression |
| `record-scope` | Scope ID, description, ordered files with SHA-256 hashes, excluded files, and `proposed` or `confirmed` status | Record the current scope after the required author confirmation |
| `record-backup` | Operation, scope ID, approval ID, affected files and actions, and backup ID | Back up existing files and record expected absence for create targets |
| `record-execution` | Completed edit approval ID, backup IDs, exact file actions, verified input and output hashes, and receipt timestamp | Append one post-write execution receipt and report any remaining unverified approvals |
| `record-restore` | Operation, scope ID, backup or commit ID, files, independent restore approval ID, and safety backup ID | Record an approved restore, including safe removal of batch-created files, and propagate dependency invalidation |

For every operation, read [`references/operations.md`](references/operations.md) and follow its state, evidence, approval, and record rules. Use [`assets/project-template.json`](assets/project-template.json) only for a new v3.1 manifest.

## Invocation boundary

This skill calls no other skills. Use text reads and writes for normal operation. Read shared contracts from `<setup-skill-root>/assets/references/` and run the setup skill's bundled validation scripts. These CLIs include their runtime dependencies and require no repository checkout or project `npm install`. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. For each shared-state operation, refresh the navigation cache once after its state writes, following `references/operations.md`. Leave creative files untouched. Initialization ends with shared project state ready for the author to choose `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`; it does not start a skill or select an entry operation.
