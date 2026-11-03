---
name: author-project
description: Use when initializing, reading, validating, or updating an author-toolkit project manifest, changing nine-stage workflow state, or recording manuscript backups and restores.
---

# Author Project

Manage persistent project state for one book. The default manifest is `<project-root>/.author-toolkit/project.json`.

This skill owns state, paths, validation, and backup records. Manuscript prose and Story Bible creative content belong to the writing skills.

## Operations

Accept one operation per invocation:

| Operation | Required input | Result |
|---|---|---|
| `initialize` | Project root, project type, paths, BCP 47 language, and optional entry stage | Create a manifest from the template without resetting existing work |
| `read` | Project root or manifest path | Return the parsed manifest and resolved paths |
| `validate` | Project root or manifest path | Check structure and run the project schema validator when available |
| `status` | Project root or manifest path | Return current stage, stale stages and reasons, next action from the tracker, and missing paths |
| `set-stage` | Stage, status, reason, artifacts, override reason, and next action | Append artifact links and write the requested stage transition |
| `record-backup` | Stage, approval, affected files, and backup ID | Record an approved backup after copying the files |
| `record-restore` | Backup ID, files, approval, and safety backup ID | Record an approved restore after writing it |

For every operation, read [`references/operations.md`](references/operations.md) and follow its state and record rules. Use [`assets/project-template.json`](assets/project-template.json) only for a new manifest.

## Invocation boundary

This skill calls no other skills. Use text reads and writes for normal operation. A schema validation script is optional; use the project's documented command when one exists. Git is optional and is never required for state or backups.

## Completion

Finish the requested operation and report the manifest path, changed fields, validation result, and any missing inputs. Leave creative files untouched. An initialization ends with the requested entry stage ready for the author to start, not with revision work already running.
