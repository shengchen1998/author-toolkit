---
name: author-project
description: Use when initializing, reading, validating, or updating a neutral author-toolkit v3 project, recording its current scope or pending action, and recording manuscript backups and restores.
---

# Author Project

Manage persistent state for one book. The manifest is `<project-root>/.author-toolkit/project.json`.

This skill owns state, paths, validation, and backup records. Manuscript prose and Story Bible creative content belong to the writing skills. `revise-fiction` and `revise-draft` are explicit author-selected strategies over this same state.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `initialize` | Project root, project metadata, paths, and BCP 47 language | Create a neutral v3 manifest, validate an existing v3 manifest, or migrate a v2 manifest without resetting work |
| `read` | Project root or manifest path | Return the parsed manifest, resolved paths, current scope, pending action, shared stale or blocked evidence, and next action |
| `validate` | Project root or manifest path | Run the installed project schema validator and report diagnostics |
| `status` | Project root or manifest path | Return current scope, pending action, shared stale or blocked evidence, approvals, and next action |
| `set-pending` | Operation, status, scope ID, reason, and artifacts | Write the requested pending action without stage progression |
| `record-scope` | Scope ID, description, ordered files with SHA-256 hashes, excluded files, and `proposed` or `confirmed` status | Record the current scope after the required author confirmation |
| `record-backup` | Operation, scope ID, approval ID, affected files, and backup ID | Record an approved backup with input hashes after copying every file |
| `record-restore` | Operation, scope ID, backup ID, files, independent restore approval ID, and safety backup ID | Record an approved restore and propagate dependency invalidation |

For every operation, read [`references/operations.md`](references/operations.md) and follow its state, evidence, approval, and record rules. Use [`assets/project-template.json`](assets/project-template.json) only for a new v3 manifest.

## Invocation boundary

This skill calls no other skills. Use text reads and writes for normal operation. Run the documented validation or migration script when the installed toolkit provides it. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. Leave creative files untouched. Initialization ends with shared project state ready for the author to choose `revise-fiction` or `revise-draft`; it does not start either skill or select an entry operation.
