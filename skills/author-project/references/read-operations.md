# Project initialization and inspection

Use this reference for `initialize` on an existing v3.1 manifest, `read`, `validate`, `status`, and `status --digest`. For a new manifest or an operation that records or changes project state, follow [`operations.md`](operations.md) instead.

Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and read shared runtime contracts directly from its `assets/references/` payload. Use its `terminology.md` for shared terms and exact contract values. A missing setup skill, required contract, or script is an incomplete toolkit installation; stop shared work and report the failure. Shared contracts remain installed with the setup skill, not in the writing project.

## Paths and manifest identity

The canonical manifest is `<project-root>/.author-toolkit/project.json`. Accept only `schema_version: "3.1.0"`; report other versions as unsupported without conversion. A v3.1 manifest stores project metadata, `manuscript_root`, shared `paths`, optional `current_scope` and `pending_action`, and no `workflow`, `current_stage`, or `stages`. Its `paths.creation` registers creation state, defaulting to `.author-toolkit/creation/`.

Stored paths are project-relative with forward slashes. Reject absolute paths, backslashes, URI schemes, home paths, and `..` segments. Resolve every registered path against the project root and exclude `paths.creation` from manuscript inventory. One manifest represents one book.

## Existing-project initialize

Read the complete manifest with normal text reads, parse its JSON, and return the full parsed manifest and resolved paths. Validate it before returning. Preserve its current scope, pending action, paths, artifacts, decisions, and external backup records. Do not establish an entry operation or invoke a strategy.

Resolve `paths.backups` and create `<paths.backups>/index.json` from `../assets/backup-index-template.json` when absent. Keep backup, restoration, and execution receipt records in this index rather than adding manifest properties. A legacy index without `executions` remains readable; its approved edits have no execution evidence until reconciled receipts are appended.

## Read and validate

Run the installed doctor before each `read`, `validate`, or `status` operation:

```bash
node <setup-skill-root>/scripts/doctor.mjs
```

This checks the installed setup payload against `assets/payload-manifest.json`. Setup separately supplies `--project-root` when checking project entry files. Stop on an installed-payload failure.

For every `read`, use normal text reads for the complete manifest and resolved paths. Check its schema version and v3.1 required fields, additional-property restrictions, current scope, pending action, timestamps, safe relative paths, and creation registration against `project-schema-v3.1.json`. Return the full parsed manifest and resolved paths; there is no `read.mjs` and no second copy through a wrapper CLI.

Run the self-contained installed validator:

```bash
node <setup-skill-root>/scripts/validate.mjs --manifest <manifest-path>
```

Report the command, exit status, and diagnostics. The bundled CLI requires Node.js 22 or newer and needs no repository checkout or project `npm install`. It checks registered paths and current manuscript hashes. Treat a `scope-currency` diagnostic as changed input: mark dependent evidence stale and reconcile the scope with the author before relying on it or writing; preserve the recorded scope rather than silently refreshing its hashes. The `#executions` check validates receipt structure and identity; a missing receipt alone is reported by `status`, not rejected as malformed state. Report validation failures, changed inputs, and missing registered paths without repairing them implicitly. Inspection operations leave project state unchanged.

## Status

Run the installed status CLI:

```bash
node <setup-skill-root>/scripts/status.mjs --manifest <project-root>/.author-toolkit/project.json
```

When the manifest has a current scope ID, use it to scope execution evidence and a blocked pending action:

```bash
node <setup-skill-root>/scripts/status.mjs --manifest <project-root>/.author-toolkit/project.json --scope-id <current-scope-id>
```

The command returns current scope and pending action, recorded blockers, and approval execution evidence. Stale findings remain project-wide because tracker finding rows have no scope ID. The bounded text output lists at most eight unverified approvals and stale findings and truncates long reasons; add `--json` for complete lists and untruncated values.

Missing receipts appear as `unverified` and leave the ordinary command successful because they can be valid intermediate state. For a current-draft revision convergence or previous/base-scope execution gate, add `--require-execution`; an unverified approval in the selected scope then exits 1. This checks execution evidence only, not the other current-draft revision convergence conditions. Using the flag without `--scope-id` is an argument error and exits 2. Malformed receipts, duplicate approval receipts, unknown approvals or backups, and identity mismatches fail validation.

The active strategy runs this strict command whenever it determines or claims current-draft revision convergence, including at a final gate and when resuming work that depends on a previous or base scope having reached that state. A `current-scope-review` pending action is not itself a claim of that state and does not trigger strict status during routine setup or navigation. Treat a recorded statement of that state as historical until the strategy rederives every required condition. When strict status exits nonzero, record the affected operation as `blocked` with the selected scope, unverified approval count, and failed command; keep the approvals `approved` and `unverified`. Reconcile receipts from preserved post-write evidence before repeating the gate. Do not backfill an output hash from later manuscript text or waive the gate by creating a new baseline. The active strategy selects the recovery route; status does not rewrite pending action or approvals.

Status reads the manifest, tracker, and backup index without reading manuscript content or session notes. It does not compare historical output hashes with current manuscript. Its `evidence.operation_specific` value is `not_evaluated`: the active strategy evaluates operation-specific evidence, evidence reuse, and current-draft revision convergence. Status does not infer operation completion, select a strategy, or advance pending action.

### Digest

For `status --digest`, run:

```bash
node <setup-skill-root>/scripts/project-digest.mjs --project-root <project-root>
```

The CLI validates the manifest before replacing the bounded navigation cache `<project-root>/PROJECT_STATE.md`. The cache points to the current scope and hashes, pending action, finding counts, active plan, latest session and report, next action, and the authoritative manifest, tracker, validation, and status. It excludes `review_brief.md` from latest-report selection and does not read the backup index, manuscript content, or full reports. Latest-file selection prefers a UTC timestamp at the start of the filename and falls back to modification time for undated files. An invalid manifest or failed generation preserves the existing cache; report the failure instead of hand-writing a substitute.

For routine navigation, use `PROJECT_STATE.md` pointers, targeted artifact reads, or aggregate counts rather than emitting complete file listings of the registered session or backup directories. Cache generation may scan those directories internally without emitting the list.

The manifest, tracker, and current evidence remain authoritative; the cache grants no approval and does not replace evidence validation, manuscript reading, or an operation gate. Refresh it once after each logical shared-state operation or stopping point, after state writes, and at resume. Do not regenerate between individual commit-journal transitions. A refresh failure does not roll back completed state or manuscript writes.

The latest session supplies `- Active plan: <project-relative-path>` and `- Next action: <concise action>`, or `none` when no active plan is recorded. An existing session without these fields yields `none recorded`; a legacy tracker `Next action` remains a fallback.
