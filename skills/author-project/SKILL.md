---
name: author-project
description: Use when initializing, reading, validating, or updating a neutral author-toolkit v3 project, recording its current scope or pending action, and recording manuscript backups and restores.
---

# Author Project

Manage persistent state for one book. The manifest is `<project-root>/.author-toolkit/project.json`; accept v3.0 and v3.1 without resetting either. V3.1 registers `paths.creation` for shared creation state, batches, staging, and commit journals. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

This skill owns state, paths, validation, backup records, and commit bookkeeping. Manuscript prose and Story Bible creative content belong to the writing skills. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `initialize` | Project root, project metadata, paths, and BCP 47 language | Create a neutral v3.1 manifest, validate an existing v3 manifest, or migrate v2 without resetting work |
| `upgrade-v31` | Project root, confirmed additive upgrade, and optional creation path | Add v3.1 creation registration to a valid v3.0 manifest while preserving all work |
| `read` | Project root or manifest path | Return the parsed manifest, resolved paths, current scope, pending action, shared stale or blocked evidence, and next action |
| `validate` | Project root or manifest path | Run the installed project schema validator and report diagnostics |
| `status` | Project root or manifest path | Return current scope, pending action, shared stale or blocked evidence, approvals, and next action |
| `status --digest` | Project root | Generate the bounded `PROJECT_STATE.md` navigation cache and return its path |
| `set-pending` | Operation, status, scope ID, reason, and artifacts | Write the requested pending action without stage progression |
| `record-scope` | Scope ID, description, ordered files with SHA-256 hashes, excluded files, and `proposed` or `confirmed` status | Record the current scope after the required author confirmation |
| `record-backup` | Operation, scope ID, approval ID, affected files and actions, and backup ID | Back up existing files and record expected absence for create targets |
| `record-restore` | Operation, scope ID, backup or commit ID, files, independent restore approval ID, and safety backup ID | Record an approved restore, including safe removal of batch-created files, and propagate dependency invalidation |

For every operation, read [`references/operations.md`](references/operations.md) and follow its state, evidence, approval, and record rules. Use [`assets/project-template.json`](assets/project-template.json) only for a new v3.1 manifest.

## Invocation boundary

This skill calls no other skills. Use text reads and writes for normal operation. Read shared contracts from `<setup-skill-root>/assets/references/` and run the setup skill's bundled validation or migration script. These CLIs include their runtime dependencies and require no repository checkout or project `npm install`. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. For each shared-state operation, refresh the navigation cache once after its state writes, following `references/operations.md`. Leave creative files untouched. Initialization ends with shared project state ready for the author to choose `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`; it does not start a skill or select an entry operation.
