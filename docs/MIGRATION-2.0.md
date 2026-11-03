# Migrating to Author Toolkit 2.0

Author Toolkit 2.0 adds an opt-in orchestration workflow for revising an
existing novel. The six independent writing skills remain available with their
existing names and triggers. Installing 2.0 does not require converting an
existing writing project.

## Keep using the independent skills

Direct calls to `fiction-workshop`, `character-archetypes`, `story-structure`,
`narrative-nonfiction`, `prose-mechanics`, and `avoid-ai-writing` continue to
use their standalone behavior. Existing Story Bibles, book blueprints, audit
trackers, session notes, reports, and finding v1 payloads remain readable.

Use the command form for the new installation method and host listed in the
[README](../README.md#invoke-an-independent-skill-directly). A command prefix
can change between plugin and bare installations without changing the skill
name or its triggers.

The complete `revise-fiction` workflow is optional. It is scoped to an existing,
single-book fiction manuscript. From-zero fiction and narrative nonfiction
continue through the independent skills.

## Register a project without moving files

Run `setup-author-toolkit` to register the existing project path in
`.author-toolkit/project.json`. `revise-fiction` requires a registered manifest;
when it is missing, the workflow displays the setup command and stops.
Registration records manuscript and artifact locations; it does not move,
rename, or reorganize the manuscript, Story Bible, blueprint, or old reports.

The new project schema defines the 2.0 project state and artifact pointers.
Existing project documents can stay where they are. New orchestration artifacts
use the paths recorded by the workflow instead of requiring a migration of old
files.

## Finding and report compatibility

Finding schema v1 remains at `references/finding-schema.json`. Existing
standalone skills and consumers can continue to use it.

The 2.0 orchestration workflow adds:

- finding v2 in `references/finding-schema-v2.json`;
- the report envelope in `references/report-schema-v2.json`;
- the project schema in `references/project-schema.json`.

New orchestrated reports use the report envelope and finding v2. The Markdown
report contains human-readable context and one JSON envelope. Findings carry
stable IDs. The envelope records input versions, the execution engine, and any
degradation. Standalone calls retain their existing finding v1 and prose output
behavior unless their own documentation says otherwise.

Old reports are historical artifacts. They are not automatically rewritten,
wrapped in a v2 envelope, or converted to finding v2. A rerun creates a new
report; it does not mutate a delivered report. Any explicit conversion should
produce a new artifact and be checked against the target schema.

## Tracker and workflow states

The 2.0 finding tracker adds states for review and input changes:

| State | Meaning |
| --- | --- |
| `open` | The finding has not been reviewed or resolved. |
| `resolved` | The author has accepted and completed the resolution. |
| `deferred` | The author has postponed action. |
| `dismissed` | The author has decided not to act on the finding. |
| `stale` | An input has changed, so the finding needs a fresh assessment. |

The tracker stores stable finding IDs, statuses, author notes, and pointers to
reports. Full finding details stay in the reports. Do not treat a stale or
deferred finding as resolved.

The project manifest separately tracks each of the nine workflow stages:

| State | Meaning |
| --- | --- |
| `not_started` | The stage has not started. |
| `in_progress` | The stage is active. |
| `awaiting_author` | The stage needs an author decision before continuing. |
| `blocked` | Missing input or an unmet gate prevents progress. |
| `complete` | The stage is complete. |
| `skipped` | The workflow recorded an allowed skip. |
| `stale` | Changed inputs require fresh review of the stage. |

These states do not require rewriting an existing standalone audit tracker.

## Backups and rework

Before an approved manuscript edit, the workflow saves the affected file under
`.author-toolkit/backups/` and records its path, workflow stage, and time in the
session note. Existing backups are not moved or renamed during registration.

Resuming a session or rerunning an audit does not restore a backup. Restoration
requires explicit author approval. Rework creates new reports or tracker
updates as needed while preserving the earlier report.

## Versions remain independent

The plugin release version, individual skill versions, finding schema versions,
report schema version, project schema version, and host versions are separate.
Author Toolkit 2.0.0 does not turn finding v1 into v2, rewrite old reports, or
change an upstream skill's own version. Record the applicable schema and host
versions when exchanging projects or validating a run.

See [VALIDATION.md](VALIDATION.md) for current runtime verification and
unverified limitations.
