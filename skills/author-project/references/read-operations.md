# Project initialization and inspection

Use this reference for `initialize` on an existing v3.1 manifest, `read`, `validate`, `status`, `status --digest`, and `check-index`. For a new manifest or an operation that records or changes project state, follow [`operations.md`](operations.md) instead.

Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and read shared runtime contracts directly from its `assets/references/` payload. Use its `terminology.md` for shared terms and exact contract values. A missing setup skill, required contract, or script is an incomplete toolkit installation; stop shared work and report the failure. Shared contracts remain installed with the setup skill, not in the writing project.

## Paths and manifest identity

The canonical manifest is `<project-root>/.author-toolkit/project.json`. Accept only `schema_version: "3.1.0"`; report other versions as unsupported without conversion. A v3.1 manifest stores project metadata, `manuscript_root`, shared `paths`, optional `current_scope` and `pending_action`, and no `workflow`, `current_stage`, or `stages`. Its `paths.creation` registers creation state, defaulting to `.author-toolkit/creation/`.

Stored paths are project-relative with forward slashes. Reject absolute paths, backslashes, URI schemes, home paths, and `..` segments. Resolve every registered path against the project root and exclude `paths.creation` from manuscript inventory. One manifest represents one book.

## Existing-project initialize

Read `PROJECT_STATE.md` first when present, then run the bounded `read` command below. Treat the cache as navigation, not evidence or approval. Preserve the current scope, pending action, paths, artifacts, decisions, and external backup records. Do not establish an entry operation or invoke a strategy.

Resolve `paths.backups` and create `<paths.backups>/index.json` from `../assets/backup-index-template.json` when absent. Keep backup, restoration, and execution receipt records in this index rather than adding manifest properties. A legacy index without `executions` remains readable; its approved edits have no execution evidence until reconciled receipts are appended.

Setup's entry-file repair is independent of project-state validation after the manifest-schema check accepts v3.1: repair both entry files, then report any later validation blocker. This does not validate the project or modify manuscript or historical records. Unsupported or schema-invalid manifests stop before entry repair.

## Read and validate

Run the installed doctor before each `read`, `validate`, or `status` operation:

```bash
node <setup-skill-root>/scripts/doctor.mjs
```

This checks the installed setup payload against `assets/payload-manifest.json`. Setup separately supplies `--project-root` when checking project entry files. Stop on an installed-payload failure.

To combine that payload check, project validation, and ordinary status after initialization, run:

```bash
node <setup-skill-root>/scripts/preflight.mjs --project-root <project-root>
```

`node <setup-skill-root>/scripts/check.mjs` accepts the same arguments and is the stable local alias for this combined check, including the strict execution mode below. It is a thin preflight entry point, not a second implementation.

It checks the installed payload once, includes project entry files, and shares the validation and status implementation with the individual CLIs. Its default status selects the manifest's current scope ID when present; an explicit `--scope-id` takes precedence. The bounded text output summarizes each stage and groups unverified approvals by operation; `--json` returns complete results. A project-entry mismatch is reported for setup's repair procedure and does not stop validation or set the final exit status by itself. An installed-payload or project-validation failure exits 1 and stops later stages; a digest generation error also exits 1. Use standalone `validate.mjs` to diagnose a validation failure rather than repeating it after a successful preflight. When validation fails, rerun the same preflight once with `--diagnose` instead of repeating `read`, `validate`, and `status` or manually printing the manifest. This read-only mode adds the bounded projection marked `recorded_unverified`, pending-artifact counts, and at most 12 backup-index conflict records with exact field differences. Its scope hashes are recorded values, not current-file verification; its overall `valid` remains false and its exit status remains 1. An unreadable pending artifact index leaves its count null with a bounded error rather than being ignored. `--diagnose` cannot be combined with `--digest`. `--digest` refreshes `PROJECT_STATE.md` only after the read-only checks pass; without it, preflight writes nothing. Add `--require-execution` with an explicit `--scope-id` for an execution gate; ordinary preflight leaves unverified approvals nonblocking and does not establish operation-specific evidence completeness. Argument errors exit 2.

For every `read`, run:

```bash
node <setup-skill-root>/scripts/read.mjs --project-root <project-root>
```

The command validates the complete manifest and any pending artifact index before returning the bounded projection: registration, resolved paths, current scope and manuscript hashes, and pending action with a truncated reason, at most two artifact pointers, an accurate artifact count, and an optional index pointer. The projection excludes no current-scope hashes; scope file descriptions and displayed artifact paths are capped at 240 characters without changing authoritative on-disk values. Validation failure returns only failed checks, at most 12 errors per check, the omitted-error count, and unverified-approval counts with first and last IDs grouped by operation. Add `--details` for complete failed checks and every unverified approval. A failed check never returns a scope projection. Never dump the complete manifest, backup index, or `payload-manifest.json` for routine navigation.

Run the self-contained installed validator:

```bash
node <setup-skill-root>/scripts/validate.mjs --manifest <manifest-path>
```

Report the command, exit status, and diagnostics. The bundled CLI requires Node.js 22 or newer and needs no repository checkout or project `npm install`. It checks registered paths and current manuscript hashes. Treat a `scope-currency` diagnostic as changed input: mark dependent evidence stale and reconcile the scope with the author before relying on it or writing; preserve the recorded scope rather than silently refreshing its hashes. The `#executions` check validates receipt structure and identity; a missing receipt alone is reported by `status`, not rejected as malformed state. Report validation failures, changed inputs, and missing registered paths without repairing them implicitly. Inspection operations leave project state unchanged.

For a reported backup-index or execution-receipt inconsistency, run read-only backup index inspection:

```bash
node <setup-skill-root>/scripts/writes.mjs check-index --manifest <project-root>/.author-toolkit/project.json --explain
```

The JSON result identifies affected records by zero-based collection index, backup and approval IDs, backup manifest path, recorded and approved operation and scope values, field differences, validation errors, and recovery boundaries. It exits 1 for invalid state and 0 for a valid index. It does not take the write lock, modify state, infer which historical value is correct, or supply a migration. Preserve the records and reconcile their identity with the author before designing any separately approved migration. Missing execution receipts remain valid intermediate state and are not an index-inspection failure; `reconcile-executions` handles only receipts supported by preserved post-write evidence, not backup identity mismatches.

## Status

Run the installed status CLI:

```bash
node <setup-skill-root>/scripts/status.mjs --manifest <project-root>/.author-toolkit/project.json
```

When the manifest has a current scope ID, use it to scope execution evidence and a blocked pending action:

```bash
node <setup-skill-root>/scripts/status.mjs --manifest <project-root>/.author-toolkit/project.json --scope-id <current-scope-id>
```

The command returns current scope and pending action, recorded blockers, and approval execution evidence. Stale findings remain project-wide because tracker finding rows have no scope ID. The bounded text output lists at most eight operation groups and stale findings and truncates long reasons. Each unverified-approval group shows its count and first and last approval IDs in tracker order; the endpoints do not imply a contiguous ID range. Add `--json` for complete approval details and untruncated values.

The pending action holds at most eight inline artifacts when it uses `.author-toolkit/pending-artifacts.json`. The index records the complete unique artifact list for the current pending action and matches its operation, scope ID, and timestamp. Inline artifacts must be a prefix of the indexed list. Existing longer inline lists without an index remain valid historical state; do not migrate, truncate, or rewrite them during inspection.

Missing receipts appear as `unverified` and leave the ordinary command successful because they can be valid intermediate state. For a current-draft revision convergence or previous/base-scope execution gate, add `--require-execution`; an unverified approval in the selected scope then exits 1. This checks execution evidence only, not the other current-draft revision convergence conditions. Using the flag without `--scope-id` is an argument error and exits 2. Malformed receipts, duplicate approval receipts, unknown approvals or backups, and identity mismatches fail validation.

The active strategy runs this strict command whenever it determines or claims current-draft revision convergence, including at a final gate and when resuming work that depends on a previous or base scope having reached that state. A `current-scope-review` pending action is not itself a claim of that state and does not trigger strict status during routine setup or navigation. Treat a recorded statement of that state as historical until the strategy rederives every required condition. When strict status exits nonzero, record the affected operation as `blocked` with the selected scope, unverified approval count, and failed command; keep the approvals `approved` and `unverified`. Reconcile receipts from preserved post-write evidence before repeating the gate. Do not backfill an output hash from later manuscript text or waive the gate by creating a new baseline. The active strategy selects the recovery route; status does not rewrite pending action or approvals.

Status reads the manifest, tracker, and backup index without reading manuscript content or session notes. It does not compare historical output hashes with current manuscript. Its `evidence.operation_specific` value is `not_evaluated`: the active strategy evaluates operation-specific evidence, evidence reuse, and current-draft revision convergence. Status does not infer operation completion, select a strategy, or advance pending action.

### Digest

For `status --digest`, run:

```bash
node <setup-skill-root>/scripts/project-digest.mjs --project-root <project-root>
```

The CLI runs the same complete project validation as preflight before replacing the bounded navigation cache `<project-root>/PROJECT_STATE.md`, including current manuscript hashes, the tracker, and backup-index execution evidence. The cache records its UTC `Generated at` timestamp, `Validation at generation: passed`, and a generation-time snapshot warning that requires rerunning preflight before reuse. This is not an execution gate or a current-draft revision convergence claim; that gate still requires explicit strict preflight. The cache points to the current scope and hashes, pending action, finding counts, active plan, latest session and report, next action, and the authoritative manifest, tracker, validation, and status. It excludes `review_brief.md` from latest-report selection and does not read full reports; it does read current manuscript files and the backup index for validation without reproducing their contents. Latest-file selection prefers a UTC timestamp at the start of the filename and falls back to modification time for undated files. Any project-validation or generation failure preserves the existing cache; report the failure instead of hand-writing a substitute.

For routine navigation, use `PROJECT_STATE.md` pointers, targeted artifact reads, or aggregate counts rather than emitting complete file listings of the registered session or backup directories. Cache generation may scan those directories internally without emitting the list.

The manifest, tracker, and current evidence remain authoritative; the cache grants no approval and does not replace evidence validation, manuscript reading, or an operation gate. A passed generation-time check says nothing about later state drift. Refresh it once after each logical shared-state operation or stopping point, after state writes, and at resume. Do not regenerate between individual commit-journal transitions. A refresh failure does not roll back completed state or manuscript writes.

The latest session supplies `- Active plan: <project-relative-path>` and `- Next action: <concise action>`, or `none` when no active plan is recorded. An existing session without these fields yields `none recorded`; a legacy tracker `Next action` remains a fallback.
