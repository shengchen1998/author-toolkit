---
name: author-project
description: Use when initializing, reading, validating, or updating a neutral author-toolkit v3 project, recording its current scope or pending action, and recording manuscript backups and restores.
---

# Author Project

Manage persistent state for one book. The manifest is `<project-root>/.author-toolkit/project.json`; accept v3.0, v3.1, and v3.2 without resetting them. V3.1 registers `paths.creation` for shared creation state, batches, staging, and commit journals. V3.2 adds the convergence state root, deterministic scope fingerprints, and immutable scope and inventory snapshots. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

This skill owns state, paths, validation, backup records, and commit bookkeeping. Manuscript prose and Story Bible creative content belong to the writing skills. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `initialize` | Project root, project metadata, paths, and BCP 47 language | Create a neutral v3.2 manifest, validate an existing v3 manifest, or migrate v2 without resetting work |
| `upgrade-v31` | Project root, confirmed additive upgrade, and optional creation path | Add v3.1 creation registration to a valid v3.0 manifest while preserving all work |
| `read` | Project root or manifest path | Return the parsed manifest, resolved paths, current scope and scope fingerprint, pending action, shared stale or blocked evidence, and next action |
| `validate` | Project root or manifest path | Run the installed project schema validator and report diagnostics, including the v3.2 full-manuscript result |
| `status` | Project root or manifest path | Return current scope identity and validation, pending action, shared stale or blocked evidence, approvals, and next action |
| `set-pending` | Operation, status, scope ID, reason, and artifacts | Write the requested pending action without stage progression |
| `record-scope` | Scope ID, description, ordered files with SHA-256 hashes, excluded files, and `proposed` or `confirmed` status; for confirmation, an author-confirmation reference with reading-order confirmation | Record the current scope; on v3.2, compute its scope fingerprint and preserve immutable inventory and scope snapshots after confirmation |
| `record-backup` | Operation, scope ID, approval ID, affected files and actions, and backup ID | Back up existing files and record expected absence for create targets |
| `record-restore` | Operation, scope ID, backup or commit ID, files, independent restore approval ID, and safety backup ID | Record an approved restore, including safe removal of batch-created files, and propagate dependency invalidation |

For every operation, read [`references/operations.md`](references/operations.md) and follow its state, evidence, approval, and record rules. Use [`assets/project-template.json`](assets/project-template.json) only for a new v3.2 manifest.

When the installed toolkit provides `scripts/lib/index.mjs`, its public `recordScope` and `validateFullManuscriptScope` functions are the executable project-operation seam for v3.2 scope recording and full-manuscript validation. Use the public validator CLI for independent artifact and manifest checks.

## Invocation boundary

This skill calls no other skills. Use text reads and writes for normal operation. Run the documented validation or migration script when the installed toolkit provides it. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. For a v3.2 scope, include its scope ID, scope fingerprint, snapshot paths, and full-manuscript result. Leave creative files untouched. Initialization ends with shared project state ready for the author to choose `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`; it does not start a skill or select an entry operation.
