# Migrating to Author Toolkit 3.0

Author Toolkit 3.0.0 replaces stage-specific orchestration state with one
neutral project evidence model shared by `revise-fiction` and `revise-draft`.
Both entry points require the same `setup-author-toolkit`. Setup accepts no
workflow name or entry stage and behaves identically for subsequent workflows.

The six independent skills keep their existing behavior and require no
migration. Switching between `revise-fiction` and `revise-draft` also requires
no migration.

## Upgrade a v2 project

Use either migration path on the existing writing project:

1. Run the unified `setup-author-toolkit` at the existing project root and let
   it upgrade the registered v2 project. Do not select a revision workflow or
   entry stage during setup.
2. Alternatively, run the migration command directly:

   ```bash
   node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>
   ```

Here, `<toolkit-root>` is the Author Toolkit installation or repository root,
and `<project-root>` is the writing project containing
`.author-toolkit/project.json`.

The migrator writes a snapshot under:

```text
.author-toolkit/migrations/<stamp>-v2-v3/
```

The manuscript, existing reports, and backups are not moved, renamed, or
rewritten. Existing reports remain historical artifacts. Registration continues
to use their recorded paths rather than imposing a new manuscript layout.

If no manuscript is available, migration fails and leaves the original manifest
unchanged. Do not treat a failed attempt as a registered v3 project. Migration
is idempotent: repeating it does not apply the v2 conversion twice or duplicate
legacy approvals.

## What changes in the manifest

The v3 manifest has no `workflow.name`, `current_stage`, or `stages`. Its only
optional progress fields are `current_scope` and `pending_action`, alongside
project registration, evidence, and artifact paths.

During conversion:

- Old stage names and stage statuses remain available only as historical
  evidence in the migration snapshot. They do not continue as active v3
  progress state.
- The old current stage becomes an `awaiting_author` pending action so the
  author can confirm what should happen next.
- The migrated scope is `proposed`, not silently approved. It includes SHA-256
  input versions for the available manuscript scope and requires author
  confirmation before subsequent work relies on it. Registered operational
  files and directories, `.author-toolkit`, and `draft-baseline.md` are excluded
  from manuscript inventory even when `manuscript_root` is the project root.
  Later scope-currency checks detect changed manuscript hashes and unregistered
  manuscript files without treating new operational reports as chapters.
- Each old override becomes a `LEGACY` approval in the shared
  `audit-tracker.md`. A deferred legacy decision remains deferred and awaits
  author confirmation; it is not treated as current approval for a manuscript
  edit.

The resulting `.author-toolkit/project.json`, `audit-tracker.md`,
`story-bible.md`, reports, sessions, backups, and handoffs are shared by both
revision entry points. There is no `revise-draft`-specific directory and no
second workflow state to synchronize.

## Evidence after migration

A migrated report or approval is not automatically current evidence for new
work. Reuse requires a match on `operation`, `scope_id`, input versions,
coverage, and dependencies. A new scope requires author confirmation. Changed
inputs or dependencies make affected evidence `stale`, with invalidation
propagating to dependent operations.

After migration, review the proposed scope, the `awaiting_author` pending
action, and deferred `LEGACY` approvals with the author. Rerun an operation
when its evidence does not match the current inputs or requested coverage.
Preserve the earlier reports and create new reports for reruns.

Before any manuscript edit, the shared tracker must contain explicit author
approval, the affected file must have a backup, and the current file hash must
match the expected input. A legacy or deferred approval does not bypass these
checks.

## Finding and report compatibility

Finding v2 and report v2 keep their existing schema versions and locations:

- `references/finding-schema-v2.json`;
- `references/report-schema-v2.json`.

Only the stage enumeration expands to include `draft-baseline`, `diagnostics`,
and `current-scope-review`. Existing finding and report payloads are not
rewritten to a new schema version. Finding v1 remains available for standalone
skills and existing consumers.

## Projects that do not need migration

Direct calls to `fiction-workshop`, `character-archetypes`, `story-structure`,
`narrative-nonfiction`, `prose-mechanics`, and `avoid-ai-writing` retain their
standalone behavior. Their existing Story Bibles, blueprints, trackers,
reports, and finding payloads do not require conversion.

Once a project has the shared v3 manifest, changing from `revise-fiction` to
`revise-draft` or back is a change of operation and scope, not another
migration. Both skills read the same project artifacts and decide whether
existing evidence can be reused from its operation, scope, input versions,
coverage, and dependencies.

The [2.0 migration guide](MIGRATION-2.0.md) is retained as historical
documentation. See [VALIDATION.md](VALIDATION.md) for the distinction between
repository checks, historical 2.0 runtime evidence, and unverified 3.0 host
runs.
