# Project operations

For every operation, resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and read shared runtime contracts directly from its `assets/references/` payload. Use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared names, contract values, and their boundaries. If the setup skill or a required installed contract or script is missing, report an incomplete toolkit installation and stop; do not copy contracts into the writing project.

For each shared-state operation, finish by refreshing the navigation cache as described under [Digest](#digest). Do not read the backup index to generate it.

## Paths and manifest identity

Resolve the project root before reading or writing. The canonical manifest is `.author-toolkit/project.json` beneath that root. Accept only `schema_version: "3.1.0"`; it stores project metadata, `manuscript_root`, shared `paths`, and optional `current_scope` and `pending_action`, with no `workflow`, `current_stage`, or `stages` properties. A v3.1 manifest registers `paths.creation`, defaulting to `.author-toolkit/creation/`. Report other schema versions as unsupported and do not convert them.

Keep stored paths relative to the project root and use forward slashes. Resolve them against the root when reading. Reject absolute paths, backslashes, URI schemes, home paths, and `..` segments. Resolve `paths.creation` by the same rules and exclude it from manuscript inventory. Shared runtime contracts remain in the installed setup skill's `assets/references/` directory. They are not project artifacts and have no manifest field. One manifest represents one book. A separate book needs its own project root and manifest.

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are author-invoked strategies over the same manifest, tracker, reports, sessions, backups, and handoffs. No strategy owns the shared project state. Do not create a strategy-specific subdirectory or a second tracker. At any stable operation gate, switching preserves current scope, evidence, decisions, staged drafts, and pending action; it never resumes writing automatically.

Valid pending-action operation names are `intake`, `story-bible`, `draft-baseline`, `structure`, `characters`, `diagnostics`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, `current-scope-review`, `final-review`, `creation-baseline`, `writing-plan`, `chapter-creation`, `chapter-review`, `creation-commit`, `creation-import`, and `milestone-review`. Creation operations remain outside report v2 `stage`.

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

An edit approval remains `approved` after its batch runs. Its post-write execution receipt proves completion; do not invent an `executed` approval status or treat a backup as execution evidence. A completed restoration record is the execution receipt for a restore approval.

Before assigning IDs to different issues, allocate one consecutive block for the complete planned report or review-unit batch:

```bash
node <setup-skill-root>/scripts/findings.mjs next-finding-id STANDARD --manifest <project-root>/.author-toolkit/project.json --count 35
```

The JSON `ids` result starts after the highest occupied number for that prefix across tracker findings and every readable report-v2 envelope beneath the registered reports path, including stale reports and nonnumeric gaps. Pass the exact allocated block to the reviewer or callee; an isolated reviewer must not choose its own starting number. Allocation reads state and does not reserve IDs across concurrent processes, so assign the whole block before dispatch and reconcile conflicts when recording findings. Do not use fixed 1xx/2xx review-pass blocks.

After the caller completes finding-identity reconciliation, record the complete new report set through the installed CLI rather than manually inserting tracker rows:

```bash
node <setup-skill-root>/scripts/findings.mjs record-findings --manifest <project-root>/.author-toolkit/project.json --report <report-path> [--report <report-path>...]
```

The command accepts only valid v3.1 manifests and reports beneath the registered reports path. It validates every input and the complete result before writing the tracker through a verified temporary sibling and atomic rename. A duplicate report ID, conflicting identity, malformed tracker row, missing current report, or invalid result leaves the tracker unchanged. Argument errors exit 2; validation and filesystem failures exit 1.

A new finding enters as `open` with the report creation timestamp and `No author decision recorded.` An existing ID updates only its location and current report pointer after comparison with the tracker row's current report; preserve its status, author reason, and updated timestamp. Reimporting the same report does not append duplicate rows. Historical reports remain immutable: a changed rerun uses a new report file. The command does not perform semantic identity matching, reopen a decided finding, record author decisions, or refresh the review brief; the caller completes those steps and refreshes the navigation cache after the logical state operation.

For explicit report validation, `--report` may be repeated. `node <setup-skill-root>/scripts/validate.mjs --report <path>...` checks report-internal duplicate IDs and conflicting identities within the supplied set. Add `--tracker <path>` to compare tracker stage and audit identity; use exactly one `--manifest <path>` with reports from that project to load its tracker and historical report identities. Independent project reports must not be compared as one batch.

## Initialize

1. For a new project, start with `../assets/project-template.json`. Replace sentinel timestamps with the current UTC timestamp and `und` with the detected or author-supplied BCP 47 language. Register supplied project metadata and paths, retaining template defaults for omitted paths, including `paths.creation`. Do not add a workflow, entry operation, or strategy owner.
2. For an existing v3.1 manifest, validate and return it without resetting current scope, pending action, paths, artifacts, decisions, or external backup records. For any other schema version, report that it is unsupported and stop without changing it.
3. Resolve `paths.backups` and create `<paths.backups>/index.json` from `../assets/backup-index-template.json` when absent. Keep backup, restoration, and execution receipt records in this index rather than adding undeclared manifest properties. A legacy index without `executions` remains readable; its approved edits have no execution evidence until reconciled receipts are appended.

The caller creates directories and empty creative templates. Initialization does not populate manuscript or Story Bible creative content, establish an entry operation, or invoke a strategy.

## Read and validate

Before a shared workflow `read`, `validate`, or `status`, run `node <setup-skill-root>/scripts/doctor.mjs` to confirm the installed setup payload against its authoritative `assets/payload-manifest.json`. Read shared runtime contracts directly from `<setup-skill-root>/assets/references/`; do not compare them with or copy them into project files. If doctor reports an installed-payload failure, report an incomplete toolkit installation and stop. Do not continue shared work or write project state.

Shared state readiness requires a valid manifest and the installed setup payload, not a project-local reference copy.

For every read, parse JSON and check `schema_version`. Apply `<setup-skill-root>/assets/references/project-schema-v3.1.json` and the operation rules for v3.1, including required fields, additional-property restrictions, current scope, pending action, timestamps, safe relative paths, and creation registration. Report every other schema version as unsupported; do not reinterpret or convert it.

`read` is a skill operation with no standalone `read.mjs`. Use normal text reads for the complete manifest and resolved paths; do not print a second copy through a wrapper CLI. Use the installed validator and the compact commands below for their respective checks.

Run the self-contained installed validator:

```bash
node <setup-skill-root>/scripts/validate.mjs --manifest <manifest-path>
```

Use the documented Node environment. The bundled CLI includes its runtime dependencies and needs no repository checkout or project `npm install`. If the required installed script is missing, report an incomplete toolkit installation and stop. Report the command, exit status, and diagnostics. For a v3.1 project with a current scope, the command also recomputes manuscript hashes and reports them under `#scope`. Treat a `scope-currency` diagnostic as changed input: mark dependent evidence stale and reconcile the scope with the author before relying on it or writing. Do not refresh hashes silently. The `#executions` check validates receipt structure, approval and backup references, and per-file hash rules; a missing receipt alone is valid intermediate state and is reported by `status`, not rejected as malformed state. Script validation is authoritative. On read, report validation failures, changed inputs, and missing registered paths without repairing them implicitly. A read returns the full parsed manifest and resolved paths, not the compact navigation view.

## Status

Run the installed status CLI for the mechanical state and execution view:

```bash
node <setup-skill-root>/scripts/status.mjs --manifest <project-root>/.author-toolkit/project.json
```

The command returns the current scope ID and status, pending action, recorded blockers, and approval execution evidence. Recorded blockers comprise stale tracker findings and a blocked pending action. Add `--scope-id <target-scope-id>` when checking current-draft revision convergence or a previous or base scope. The scope filter applies to unverified approvals and a blocked pending action; stale findings remain project-wide because tracker finding rows have no scope ID.

The text output bounds the unverified-approval and stale-finding lists to eight entries each and truncates displayed long reasons. Add `--json` for complete machine-readable lists and untruncated values. The command joins approved `edit` approvals to post-write execution receipts and approved `restore` approvals to completed restoration records. Missing receipts appear as `unverified` and leave the CLI successful because they can be valid intermediate state. They still block current-draft revision convergence and any entry gate that requires a verified previous or base scope. Malformed receipts, duplicate approval receipts, unknown approvals or backups, and identity mismatches fail validation.

The status CLI reads the manifest, tracker, and backup index without reading manuscript content or session notes. It does not compare historical output hashes with current manuscript files; later edits do not invalidate an earlier receipt. Its `evidence.operation_specific` value is `not_evaluated`: it does not infer missing evidence, stale evidence beyond recorded tracker rows, coverage reuse, or current-draft revision convergence. Use `read` for full scope paths and hashes, `validate` for current hashes and missing paths, and `status --digest` for finding counts, latest report and session, and next action. The active strategy evaluates operation-specific evidence and its operation gates.

Status does not infer operation completion, select a strategy, or advance pending action.

### Digest

For `status --digest`, accept the project root and run:

```bash
node <setup-skill-root>/scripts/project-digest.mjs --project-root <project-root>
```

The CLI validates a v3.1 manifest before replacing anything. It writes the bounded navigation cache `<project-root>/PROJECT_STATE.md`, containing the current scope and a pointer to its hashes, pending action, finding counts, active plan, latest report and session, next action, and pointers to the authoritative files and mechanical status and validation commands. Latest-file selection prefers a UTC timestamp at the start of the filename, falls back to modification time for undated files, and emits normalized project-relative paths. The report scan excludes `<paths.reports>/review_brief.md`, which is a disposable decision summary rather than an immutable report. It does not read the backup index, manuscript content, or full report content. An invalid manifest or failed generation preserves an existing cache; report the error instead of hand-writing a substitute.

For routine navigation, use `PROJECT_STATE.md` pointers, targeted artifact reads, or aggregate counts rather than emitting complete file listings of the registered session or backup directories. Cache generation may scan those directories internally without emitting the list.

The cache is disposable and generated, never a third authority. The manifest, tracker, and current evidence remain authoritative. Once per logical shared-state operation or stopping point, after that operation's state writes, run `status --digest` through `author-project`; do not regenerate between individual commit-journal transitions. A refresh failure is reported without rolling back completed state or manuscript writes. Also refresh at the start of resume. The cache grants no approval and does not replace evidence validation, manuscript reading, or an operation gate.

The latest session supplies the navigation fields `- Active plan: <project-relative-path>` and `- Next action: <concise action>`, or `none` when no active plan is recorded. These are pointers, not new approval state. An existing session without these fields yields `none recorded`; a legacy tracker `Next action` remains a fallback.

## Set pending

Read the manifest immediately before each write. Write the requested `pending_action` values: `operation`, `status`, `scope_id`, `reason`, and `artifacts`. Status is `in_progress`, `awaiting_author`, or `blocked`; reason is always nonempty and identifies the decision, interruption, or dependency. Preserve `current_scope` and all historical records. Append unique artifact paths and set both `pending_action.updated_at` and top-level `updated_at` to the current UTC timestamp.

`pending_action` describes requested or interrupted work, not linear operation progress. Do not mark an operation complete, choose a following operation, or resume a write because another skill was invoked. The calling strategy supplies each explicit transition. If a write fails after the manifest was read, reread before retrying.

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

## Record execution

After every completed approved edit batch, record one execution receipt before claiming the batch executed. Read `<setup-skill-root>/assets/references/execution-receipt-schema.json` and append one receipt to `executions` in `<paths.backups>/index.json` with:

- `schema_version: "1.0.0"`, the exact edit `approval_id`, operation, and scope ID;
- every `backup_id` used by the batch; a create-only batch can have an empty list;
- one entry for every approved path with its `create`, `modify`, `delete`, or `reorder` action and verified input and output SHA-256 hashes. A create has a null input hash, a delete has a null output hash, and every other action has both hashes;
- `recorded_at`, the UTC time this receipt is recorded.

Recompute output hashes immediately after writing and verifying the exact batch. Do not compare historical receipt outputs with the current manuscript after later edits. An incomplete or interrupted batch has no execution receipt; preserve its interrupted state for explicit reconciliation.

Append only one receipt per approval, preserve all existing records, and update the index through a verified temporary sibling and atomic rename. Run the installed manifest validator and `status.mjs`; the approval remains `approved`, while the receipt supplies execution evidence.

For a legacy project, backfill a receipt only after preserved post-write evidence establishes the exact completed batch and output hashes. A backup, an approval, or a session statement alone does not establish those hashes. Later manuscript text is not evidence of an earlier output after subsequent edits. Leave an unreconciled approval `unverified` rather than inventing execution evidence; `recorded_at` records the later reconciliation time.

## Restore

A restore needs separate explicit author approval naming the backup or creation commit and exact files. Verify the approval and current scope, then back up current versions under a new safety backup ID with their input hashes before restoring anything. For files created by the restored batch, move created files into the safety backup before removing them from the manuscript; preserve their exact bytes and record both paths. Restore approved original snapshots only after every safety backup succeeds. Reverse the accepted creation-state differences as directed by the creation recovery procedure.

After every restore action completes, append a `restorations` record to the backup index containing the restore timestamp, source backup or commit ID, restored and removed files and hashes, approval ID, scope ID, and safety backup ID. This completed record is the restore execution receipt; a safety backup alone is not execution evidence. Keep both backup manifests, created-file safety copies, commit journals, and all records. Record the restore in the current session note and report restored paths.

After the restore, apply the shared state-and-findings dependency rules to stale every affected evidence item and identify the resulting next action. Establish a newly confirmed scope when membership, reading order, or exclusions change; otherwise retain the scope ID with reconciled hashes. Validate the resulting shared state before returning.
