# Project operations

## Paths and manifest identity

Resolve the project root before reading or writing. The canonical manifest is `.author-toolkit/project.json` beneath that root. A v3 manifest has `schema_version: "3.0.0"`, project metadata, `manuscript_root`, and shared `paths`. It can contain `current_scope` and `pending_action`; it has no `workflow`, `current_stage`, or `stages` properties.

Keep stored paths relative to the project root and use forward slashes. Resolve them against the root when reading. Reject absolute paths, backslashes, URI schemes, home paths, and `..` segments. One manifest represents one book. A separate book needs its own project root and manifest.

`revise-fiction` and `revise-draft` are author-invoked strategies over the same manifest, tracker, reports, sessions, backups, and handoffs. Neither owns persistent workflow state. Do not create a `revise-draft` subdirectory or a second tracker. Switching strategies preserves the current scope and pending action and never resumes writing automatically.

Valid operation names are `intake`, `story-bible`, `draft-baseline`, `structure`, `characters`, `diagnostics`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, `current-scope-review`, and `final-review`.

## Shared scope and evidence

A scope record identifies `scope_id`, `description`, ordered manuscript `files` with a `sha256` hash for each, `excluded_files`, `proposed` or `confirmed` status, and `created_at`. Record a proposed scope first. Mark it `confirmed` only after the author explicitly confirms that scope ID, its ordered paths and hashes, and its exclusions. An absent current scope remains absent until the selected skill establishes it with the author.

Create a new `scope_id` whenever manuscript membership, reading order, or exclusions change. A text-only revision can retain the scope ID, but its new input hashes invalidate evidence as described below. Only the author confirms a scope change. Keep every historical report bound to its original scope ID and input versions; never relabel it as covering a new scope.

Evidence is reusable only when all of these match the requested work:

- `operation`;
- `scope_id`;
- every input version;
- requested coverage, including any partial or skipped coverage;
- dependency status, with no stale or blocked dependency affecting the requested work.

Otherwise, report the evidence as missing, stale, or blocked with its reason. This evidence is shared by both strategies. Read the latest tracker and reports before reuse, and preserve historical artifacts. Follow [`../../revise-fiction/references/state-and-findings.md`](../../revise-fiction/references/state-and-findings.md) for report identity, finding status, and dependency-specific stale propagation.

Before any manuscript write, reread the manifest and current scope, recompute every affected file's SHA-256 hash, and require an exact match with the confirmed scope and approved input batch. Stop when any path, hash, approval, or dependency differs.

## Tracker and approvals

Use the registered shared tracker as the living index. Its `Findings` section follows the shared state-and-findings rules. Its `Approvals` section uses these columns:

| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |
|---|---|---|---|---|---|---|---|

Approval statuses are `approved`, `deferred`, `cancelled`, and `superseded`. Record only explicit author decisions with UTC timestamps and exact operation, scope, and paths. Only a current `approved` row matching the requested batch authorizes that batch. Mark an approval `superseded` when its batch changes; retain the row and create a new approval ID for the new decision. A deferred or cancelled row authorizes no write.

A diagnostic proposes changes but does not create an approval. A restore always needs a separate approval ID. Backup and restoration records cite the applicable `approval_id`, `scope_id`, and input hashes.

## Initialize

1. For a new project, start with `../assets/project-template.json`. Replace sentinel timestamps with the current UTC timestamp and `und` with the detected or author-supplied BCP 47 language. Register supplied project metadata and paths, retaining template defaults for omitted paths. Do not add a workflow, entry stage, or strategy owner.
2. For an existing v3 manifest, validate and return it without resetting current scope, pending action, paths, artifacts, decisions, or external backup records.
3. For an existing v2 manifest, preserve it and run `node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>`. Retain the script's snapshot and migrate current scope, pending action, and legacy overrides. Report the snapshot path and migration diagnostics. Validate the resulting v3 manifest. Never silently replace or reset a v2 project.
4. Resolve `paths.backups` and create `<paths.backups>/index.json` from `../assets/backup-index-template.json` when absent. Keep backup records in this index rather than adding undeclared manifest properties.

The caller creates directories and empty creative templates. Initialization does not populate manuscript or Story Bible creative content, establish an entry operation, or invoke either revision strategy.

## Read and validate

For every read, parse JSON and check `schema_version`. For v3, apply [`../../../references/project-schema-v3.json`](../../../references/project-schema-v3.json), checking required fields, additional-property restrictions, current scope, pending action, operation names, timestamps, and safe relative paths. Use [`../../../references/project-schema.json`](../../../references/project-schema.json) only to recognize legacy v2 state before migration. Return v2 as requiring migration through setup; do not reinterpret it as v3.

When the installed toolkit contains `scripts/validate.mjs`, run:

```bash
node <toolkit-root>/scripts/validate.mjs --manifest <manifest-path>
```

Use the documented Node environment. Report the command, exit status, and diagnostics. For v3 with a current scope, the command also recomputes manuscript hashes and reports them under `#scope`. Treat a `scope-currency` diagnostic as changed input: mark dependent evidence stale and reconcile the scope with the author before relying on it or writing. Do not refresh hashes silently. Script validation is authoritative. Without the script, perform the schema and hash checks above and label the result `manual-checks-only`; do not claim full JSON Schema validation. On read or status, report validation failures, changed inputs, and missing registered paths without repairing them implicitly. A read returns the full parsed manifest plus the shared state view below; status returns that compact view.

## Status

Return a compact shared state view containing:

- project root, manifest creation timestamp, project type, language, and manuscript root;
- current scope ID, confirmation status, ordered paths and hashes, and exclusions;
- pending operation, status, scope ID, reason, and artifacts, or its absence;
- every stale or blocked evidence item with its operation, scope, dependency reason, and source report or tracker row;
- the next action recorded in the tracker or latest session note;
- validation errors, missing paths, and unresolved approval, backup, or restore requirements.

Status does not infer operation completion, select a strategy, or advance pending action.

## Set pending

Read the manifest immediately before each write. Write the requested `pending_action` values: `operation`, `status`, `scope_id`, `reason`, and `artifacts`. Status is `in_progress`, `awaiting_author`, or `blocked`; reason is always nonempty and identifies the decision, interruption, or dependency. Preserve `current_scope` and all historical records. Append unique artifact paths and set both `pending_action.updated_at` and top-level `updated_at` to the current UTC timestamp.

`pending_action` describes requested or interrupted work, not linear stage progress. Do not mark a stage complete, choose a following operation, or resume a write because another skill was invoked. The calling strategy supplies each explicit transition. If a write fails after the manifest was read, reread before retrying.

## Record scope

Read the manifest and hash every complete manuscript file immediately before writing. Record the scope ID, description, ordered paths, SHA-256 hashes, `excluded_files`, `proposed` or `confirmed` status, and creation timestamp. A confirmed write requires the author's explicit confirmation of that exact record. Preserve the prior scope in reports and session history.

Before a later manuscript write, repeat the read and hash comparison. Treat a mismatch as a stopped approval and backup gate, not as permission to refresh the scope silently.

## Backup

Before a manuscript edit, resolve the backup root from `paths.backups`. The calling orchestrator supplies an approved file list and approval ID. Verify that the approval is current and matches the operation, scope ID, and paths. For each file:

1. Read the complete original text and compute its SHA-256 hash.
2. Write it to `<paths.backups>/<backup-id>/<original-relative-path>`, preserving the relative directory path and exact text.
3. Create `<paths.backups>/<backup-id>/manifest.json` containing the backup ID, UTC timestamp, operation, `approval_id`, `scope_id`, input hashes, approval summary, and source/backup path pairs.
4. Append one record to `<paths.backups>/index.json` with the same identity fields, paths, and backup manifest path.

Use a unique backup ID based on UTC time, operation, and a short scope slug. If it collides, add a suffix. Complete and verify every backup before the first edit to any affected file. A partial or hash-mismatched backup fails the operation and blocks the edit.

Record the backup ID, approval ID, scope ID, and paths in the session note. Return the backup manifest as an artifact for the caller's pending action. Backups are text snapshots. Do not use Git commits, Git configuration, or `.gitignore` as a substitute.

## Restore

A restore needs separate explicit author approval naming the backup ID and files. Verify the approval and current scope, then back up current versions under a new safety backup ID with their input hashes before restoring anything. Write the approved snapshot text only after every safety backup succeeds.

Append a `restorations` record to the backup index containing the restore timestamp, source backup ID, restored files and hashes, `approval_id`, `scope_id`, and safety backup ID. Keep both backup manifests and all records. Record the restore in the current session note and report restored paths.

After the restore, apply the shared state-and-findings dependency rules to stale every affected evidence item and identify the resulting next action. A restore does not create a new scope ID unless its membership, reading order, or exclusions change. Validate the resulting shared state before returning.
