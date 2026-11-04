# Project operations

## Paths and manifest identity

Resolve the project root before reading or writing. The canonical manifest is `.author-toolkit/project.json` beneath that root. Accept `schema_version: "3.0.0"` and `"3.1.0"`; both store project metadata, `manuscript_root`, shared `paths`, and optional `current_scope` and `pending_action`, with no `workflow`, `current_stage`, or `stages` properties. A v3.1 manifest also registers `paths.creation`, defaulting to `.author-toolkit/creation/`. Preserve a v3.0 project until the author confirms `upgrade-v31`; recognize v2 only for setup migration.

Keep stored paths relative to the project root and use forward slashes. Resolve them against the root when reading. Reject absolute paths, backslashes, URI schemes, home paths, and `..` segments. Resolve `paths.creation` by the same rules and exclude it from manuscript inventory. One manifest represents one book. A separate book needs its own project root and manifest.

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are author-invoked strategies over the same manifest, tracker, reports, sessions, backups, and handoffs. None owns persistent workflow state. Do not create a strategy-specific subdirectory or a second tracker. At any stable operation gate, switching preserves current scope, evidence, decisions, staged drafts, and pending action; it never resumes writing automatically.

Valid pending operation names are `intake`, `story-bible`, `draft-baseline`, `structure`, `characters`, `diagnostics`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, `current-scope-review`, `final-review`, `creation-baseline`, `writing-plan`, `chapter-creation`, `chapter-review`, `creation-commit`, `creation-import`, and `milestone-review`. The legacy `STAGES` remains revision-only; do not add creation operations to it or to report v2 `stage`.

## Shared scope and evidence

A scope record identifies `scope_id`, `description`, ordered manuscript `files` with a `sha256` hash for each, `excluded_files`, `proposed` or `confirmed` status, and `created_at`. Record a proposed scope first. Mark it `confirmed` only after the author explicitly confirms that scope ID, its ordered paths and hashes, and its exclusions. A new book can have no current scope before its first accepted manuscript file.

Create a new `scope_id` whenever manuscript membership, reading order, or exclusions change. A text-only change can retain the scope ID, but its new input hashes invalidate evidence as described below. Only the author confirms a scope change. Keep every historical report bound to its original scope ID and input versions; never relabel it as covering a new scope.

Whole-report evidence is reusable only when its operation, `scope_id`, every input version, requested coverage and subchecks, and dependency state match the requested work. Otherwise, report the evidence as missing, stale, or blocked with its reason.

A full local coverage unit can also compose into an expanded scope through the living coverage index. Its original scope ID remains bound to the source report; reuse requires matching operation, exact paths and hashes, requested subchecks, and dependencies, while the new synthesis receives the new scope ID. Synthesis units never reuse this way.

This evidence is shared by all five strategies. Read the latest tracker and reports before reuse, and preserve historical artifacts. Follow [`../../revise-fiction/references/state-and-findings.md`](../../revise-fiction/references/state-and-findings.md) for report identity, finding status, coverage units, and dependency-specific stale propagation. Creation evidence does not become chapter-revision evidence.

Before any manuscript write, reread the manifest and current scope, recompute every existing affected file's SHA-256 hash, require every create target to be absent, and require an exact match with the approved input batch. Stop when any path, presence, hash, approval, or dependency differs.

## Tracker and approvals

Use the registered shared tracker as the living index. Its `Findings` section follows the shared state-and-findings rules. Its `Approvals` section uses these columns:

| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |
|---|---|---|---|---|---|---|---|

Approval statuses are `approved`, `deferred`, `cancelled`, and `superseded`. Record only explicit author decisions with UTC timestamps and exact operation, scope, paths, and input versions. Only a current `approved` row matching the requested batch authorizes that batch. Mark an approval `superseded` when its batch changes; retain the row and create a new approval ID for the new decision. A deferred or cancelled row authorizes no write.

A diagnostic proposes changes but does not create an approval. Creation acceptance records manuscript and resulting-scope approvals separately. A restore always needs a separate approval ID. Backup, commit, and restoration records cite the applicable approval, scope, and input hashes.

## Initialize

1. For a new project, start with `../assets/project-template.json`. Replace sentinel timestamps with the current UTC timestamp and `und` with the detected or author-supplied BCP 47 language. Register supplied project metadata and paths, retaining template defaults for omitted paths, including `paths.creation`. Do not add a workflow, entry stage, or strategy owner.
2. For an existing v3.0 or v3.1 manifest, validate and return it without resetting current scope, pending action, paths, artifacts, decisions, or external backup records.
3. For an existing v2 manifest, preserve it and run `node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>`. Retain the script's snapshot and migrate current scope, pending action, and legacy overrides directly to v3.1. Report the snapshot path and migration diagnostics. Validate the resulting v3.1 manifest. Never silently replace or reset a v2 project.
4. Resolve `paths.backups` and create `<paths.backups>/index.json` from `../assets/backup-index-template.json` when absent. Keep backup records in this index rather than adding undeclared manifest properties.

The caller creates directories and empty creative templates. Initialization does not populate manuscript or Story Bible creative content, establish an entry operation, or invoke a strategy.

## Upgrade v3.1

Use `upgrade-v31` only after the author confirms the additive upgrade for a valid v3.0 project. Add `paths.creation`, using the supplied safe project-relative path or `.author-toolkit/creation/`, change only `schema_version` to `"3.1.0"`, and update `updated_at`. Write the manifest atomically and validate it as v3.1. Preserve manuscripts, reports, findings, approvals, scopes, pending work, backups, and every other registered path. Existing creation artifacts remain untouched.

For a valid v3.1 manifest, validate and return it without another write. For v2, return to setup migration instead of composing upgrades. Do not create manuscript files or mark creation evidence current during this upgrade.

## Read and validate

For every read, parse JSON and check `schema_version`. Apply the installed v3 schema and operation rules for the declared v3.0 or v3.1 version, including required fields, additional-property restrictions, current scope, pending action, timestamps, safe relative paths, and creation registration. Use [`../../../references/project-schema.json`](../../../references/project-schema.json) only to recognize legacy v2 state before migration. Return v2 as requiring migration through setup; do not reinterpret it as v3.

When the installed toolkit contains `scripts/validate.mjs`, run:

```bash
node <toolkit-root>/scripts/validate.mjs --manifest <manifest-path>
```

Use the documented Node environment. Report the command, exit status, and diagnostics. For v3 with a current scope, the command also recomputes manuscript hashes and reports them under `#scope`. Treat a `scope-currency` diagnostic as changed input: mark dependent evidence stale and reconcile the scope with the author before relying on it or writing. Do not refresh hashes silently. Script validation is authoritative. Without the script, perform the schema and hash checks above and label the result `manual-checks-only`; do not claim full JSON Schema validation. On read or status, report validation failures, changed inputs, and missing registered paths without repairing them implicitly. A read returns the full parsed manifest plus the shared state view below; status returns that compact view.

## Status

Return a compact shared state view containing:

- project root, manifest schema and creation timestamps, project type, language, and manuscript root;
- current scope ID, confirmation status, ordered paths and hashes, and exclusions;
- pending operation, status, scope ID, reason, and artifacts, or its absence;
- every stale or blocked evidence item with its operation, scope, dependency reason, and source report or tracker row;
- the next action recorded in the tracker or latest session note;
- validation errors, missing paths, and unresolved approval, backup, commit, or restore requirements.

Status does not infer operation completion, select a strategy, or advance pending action.

## Set pending

Read the manifest immediately before each write. Write the requested `pending_action` values: `operation`, `status`, `scope_id`, `reason`, and `artifacts`. Status is `in_progress`, `awaiting_author`, or `blocked`; reason is always nonempty and identifies the decision, interruption, or dependency. Preserve `current_scope` and all historical records. Append unique artifact paths and set both `pending_action.updated_at` and top-level `updated_at` to the current UTC timestamp.

`pending_action` describes requested or interrupted work, not linear stage progress. Do not mark a stage complete, choose a following operation, or resume a write because another skill was invoked. The calling strategy supplies each explicit transition. If a write fails after the manifest was read, reread before retrying.

## Record scope

Read the manifest and hash every complete manuscript file immediately before writing. Record the scope ID, description, ordered paths, SHA-256 hashes, `excluded_files`, `proposed` or `confirmed` status, and creation timestamp. A confirmed write requires the author's explicit confirmation of that exact record. Preserve the prior scope in reports and session history.

Before a later manuscript write, repeat the read, presence, and hash comparison. Treat a mismatch as a stopped approval and backup gate, not as permission to refresh the scope silently.

## Backup and creation commit

Before a manuscript edit, resolve the backup root from `paths.backups`. The calling orchestrator supplies an approved file list and approval ID. Verify that the approval is current and matches the operation, scope ID, paths, and actions. For every existing modify, delete, or reorder target:

1. Read the complete original text and compute its SHA-256 hash.
2. Write it to `<paths.backups>/<backup-id>/<original-relative-path>`, preserving the relative directory path and exact text.
3. Create `<paths.backups>/<backup-id>/manifest.json` containing the backup ID, UTC timestamp, operation, approval ID, scope ID, input hashes, approval summary, and source/backup path pairs.
4. Append one record to `<paths.backups>/index.json` with the same identity fields, paths, and backup manifest path.

For each create target, record that the file is expected absent with a null input hash; do not invent an original backup or backup ID. Recheck absence immediately before publication. Use a unique backup ID based on UTC time, operation, and a short scope slug, adding a suffix on collision. Complete and verify every required backup and absence check before the first manuscript write. A partial, unexpected, or hash-mismatched result blocks the write.

For `creation-commit`, follow [`../../write-fiction/references/creation-state.md`](../../write-fiction/references/creation-state.md). Write `<paths.creation>/batches/<commit-id>.json` before touching manuscript text, record every planned action and its pending state, and update the journal after every write and verification transition. An interrupted journal records exact completed and pending actions and stops publication pending an explicit author decision. Record backup IDs, approvals, scope IDs, commit ID, and paths in the session note. Backups and journals are text records; Git is not a substitute.

## Restore

A restore needs separate explicit author approval naming the backup or creation commit and exact files. Verify the approval and current scope, then back up current versions under a new safety backup ID with their input hashes before restoring anything. For files created by the restored batch, move created files into the safety backup before removing them from the manuscript; preserve their exact bytes and record both paths. Restore approved original snapshots only after every safety backup succeeds. Reverse the accepted creation-state differences as directed by the creation recovery procedure.

Append a `restorations` record to the backup index containing the restore timestamp, source backup or commit ID, restored and removed files and hashes, approval ID, scope ID, and safety backup ID. Keep both backup manifests, created-file safety copies, commit journals, and all records. Record the restore in the current session note and report restored paths.

After the restore, apply the shared state-and-findings dependency rules to stale every affected evidence item and identify the resulting next action. Establish a newly confirmed scope when membership, reading order, or exclusions change; otherwise retain the scope ID with reconciled hashes. Validate the resulting shared state before returning.
