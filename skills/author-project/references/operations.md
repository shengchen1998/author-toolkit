# Project operations

For every operation, resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and read shared runtime contracts directly from its `assets/references/` payload. Use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared names, contract values, and their boundaries. If the setup skill or a required installed contract or script is missing, report an incomplete toolkit installation and stop; do not copy contracts into the writing project.

For each shared-state operation, finish by refreshing the navigation cache as described under [Digest](read-operations.md#digest). Generation validates the backup index and records a generation-time snapshot without reproducing its contents. For a reported backup-index inconsistency, use the read-only `check-index --explain` procedure in [Validation](read-operations.md#validation); it is not a state-writing operation and does not refresh the cache.

Use bounded reads for routine state inspection. Obtain required state through the bounded projection, current scope, tracker sections, and named artifacts; state-writing CLIs reread the manifest internally for their transactions. A manuscript write, backup, execution receipt, restore, or scope record still verifies exact current input hashes and approved paths immediately before its state transition. Reading the full manifest is reserved for diagnosing a reported manifest inconsistency, not for routine navigation.

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

This evidence is shared by all five strategies. Read the latest tracker and reports before reuse. Projects without `evidence_retention.mode: "bounded"` preserve historical artifacts. Bounded projects retire only validated, unreferenced audit evidence through the shared retention transaction; this never includes backups, write batches, creation records, or execution evidence. Follow the applicable [Task-based reading](../../revise-fiction/references/state-and-findings.md#task-based-reading) route for report identity, finding status, coverage units, and dependency-specific stale propagation. Creation evidence does not become chapter-revision evidence.

Before any manuscript write, reread the manifest and current scope, recompute every existing affected file's SHA-256 hash, require every create target to be absent, and require an exact match with the approved input batch. Stop when any path, presence, hash, approval, or dependency differs.

## Tracker and approvals

The optional manifest `evidence_retention: { "mode": "bounded" }` selects bounded audit-evidence retention. Its absence preserves every historical artifact. Enabling requires an explicit author decision and one preview followed by `evidence-retention --enable --apply`; migration copies every finding identity into the tracker before deleting unreferenced old audit artifacts. Later coverage registration cleans replaced unreferenced evidence automatically. A pending action naming a superseded reference must first be refreshed through `set-pending`; never bypass it to delete recovery inputs.

Use the registered shared tracker as the living index. Current scope and pending action live only in the manifest; read them through `author-project read` and `author-project status` rather than duplicating them in the tracker. Existing trackers may retain their historical summary lines: setup, initialization, and state-writing operations preserve those lines without treating them as current state. Its `Findings` section follows the shared state-and-findings rules. Its `Approvals` section uses these columns:

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

After the caller completes finding-identity reconciliation, record the complete new report set, including clean reports, through the installed CLI rather than manually inserting tracker rows:

```bash
node <setup-skill-root>/scripts/findings.mjs record-findings --manifest <project-root>/.author-toolkit/project.json --report <report-path> [--report <report-path>...]
```

The command accepts only valid v3.1 manifests and reports beneath the registered reports path. It acquires the shared write lock, rereads and compares the manifest, validates every input and the complete tracker result, then writes findings and Audit runs together through a verified temporary sibling and atomic rename. A duplicate report ID, conflicting identity, malformed tracker row, missing current report, invalid Audit runs table or row, active write lock, or concurrent manifest change leaves the tracker unchanged. Argument errors exit 2; validation and filesystem failures exit 1.

A new finding enters as `open` with the report creation timestamp and `No author decision recorded.` An existing ID updates only its location and current report pointer after comparison with the tracker row's current report; preserve its status, author reason, and updated timestamp. Historical reports remain immutable: a changed rerun uses a new report file.

Each report also inserts or updates one Audit runs row keyed by its project-relative report path. The row records the report `stage`, `scope_id`, path, engine name, version and `degraded` state, language coverage, `created_at` as `Run at`, and `operation_coverage=<full|partial|skipped>; findings=<count>` as `Result`. A clean report records `findings=0` without creating finding rows. Reimporting the same report updates its existing audit run rather than appending a duplicate; JSON output separately lists inserted and updated finding IDs and the report paths for inserted and updated audit runs. Audit runs validation preserves historical and bounded-retention rows, permits the retention marker `none`, and does not require a historical report to remain on disk.

Recording requires the standard Audit runs table. A legacy tracker without that table remains readable but must be repaired and validated before recording. Manual tracker edits are recovery-only; normal report ingestion uses this transaction. The command does not perform semantic identity matching, reopen a decided finding, record author decisions, establish evidence currency or operation completion, or refresh the review brief; the caller completes those steps and refreshes the navigation cache after the logical state operation.

## Scaffold report

Create every shared report v2 through the installed scaffold rather than hand-assembling its JSON envelope:

```bash
node <setup-skill-root>/scripts/scaffold-report.mjs --manifest <project-root>/.author-toolkit/project.json --output <project-relative-report-path> --body <body-file> --envelope <envelope-file> [--created-at <UTC-timestamp>] [--json]
```

The body file supplies the human-readable report and its `Language coverage` section without fenced code blocks. The envelope file supplies the actual report v2 fields and findings; `created_at` may come from either the envelope or the matching `--created-at` option. When `findings` is omitted, the CLI supplies `findings: []` for a clean report. It validates the complete report before writing and publishes it create-only through a verified temporary sibling. It rejects invalid findings, missing or invalid inputs and notes, evidence-semantic failures, a destination outside the registered reports path, special-file inputs, and every existing destination without writing a report. Argument errors exit 2; validation and filesystem failures exit 1.

The empty array is a structural default for a completed clean review, not evidence that the reviewer found nothing. The semantic skill supplies the actual body, findings, input versions, engine notes, scope, coverage, and parent-child links; the CLI does not infer them or update review jobs, coverage indexes, manuscript hashes, or downstream syntheses. Only a successfully scaffolded report may be cited by a new coverage registration or synthesis.

## Coverage index

Compose the living coverage index from the semantic skill's decided full local coverage units and full-target synthesis. Supply one complete operation entry per call rather than modifying its JSON structure manually:

```json
{
  "operation": "prose",
  "units": [
    { "unit_id": "prose-chapter-01", "path": "reports/coverage/prose-chapter-01.json" }
  ],
  "synthesis_report": "reports/prose/synthesis.md",
  "synthesis_coverage": "full"
}
```

Save that entry as a project-relative JSON file, then run:

```bash
node <setup-skill-root>/scripts/coverage-index.mjs --manifest <project-root>/.author-toolkit/project.json --entry <project-relative-entry-path> [--updated-at <UTC-timestamp>] [--json]
```

The command writes `<paths.reports>/coverage-index.json` with its top-level `scope_id`, `entries`, and `updated_at` fields. It replaces only the complete entry for the supplied operation and preserves the other recorded operations. The index requires a confirmed current scope; all unit and report paths stay beneath the registered reports path. The CLI validates every supplied full local coverage unit's schema, ID and operation identity, its source report, the synthesis report, and the complete result before a verified atomic replacement under the shared write lock. A reusable unit retains its original `scope_id`; the composed index records the target scope. The semantic skill establishes reuse before registration. The command rereads the manifest after acquiring the lock and stops on a concurrent change. An invalid entry or existing index, missing or mismatched artifact, duplicate operation or unit ID, or publication failure preserves the existing index.

The semantic skill still decides whether units are reusable, which subchecks and dependencies are required, and whether actual full-target coverage exists. Registration validates declared identities and report structure, not semantic coverage, manuscript hash currency, review jobs, tracker findings, or current-draft revision convergence. Rerun `check --full` for selected-evidence validation and refresh the navigation cache after this logical shared-state operation. Argument errors exit 2; validation and filesystem failures exit 1.

## Evidence retention

Run `node <setup-skill-root>/scripts/evidence-retention.mjs --project-root <project-root> [--operation <operation>]` for a read-only preview. An unenabled project requires explicit `--enable --apply` after author confirmation. Once enabled, `--apply` removes only superseded audit reports, unreferenced coverage units, completed review chains, and closed session summaries. Current coverage, source and synthesis reports, tracker findings, full-check report roots, pending artifacts, incomplete review jobs, fresh reader-state, and recovery references are protected. Unknown or unreadable candidates fail closed. Cleanup runs under the shared write lock and returns deleted and failed paths; deletion failures never claim success.

In bounded mode, the tracker `Finding history` table supplies retired finding identities for ID allocation and conflict checks. An optional manifest field never authorizes manuscript, backup, batch, creation, or restore deletion.

## Review brief

Generate or refresh the disposable decision summary through the installed CLI after relevant tracker changes:

```bash
node <setup-skill-root>/scripts/review-brief.mjs --project-root <project-root> [--tracker <project-relative-tracker-path>] [--out <project-relative-brief-path>] [--updated-at <UTC-timestamp>] [--json]
```

The tracker defaults to `paths.audit_tracker`; the output defaults to `<paths.reports>/review_brief.md`. The command includes every `resolved` and `dismissed` finding with its exact location, decision reason, and current report. It validates the tracker and complete brief before replacing the output through a verified temporary sibling under the shared write lock. Invalid input, unsafe paths, or a failed publication preserves the existing brief and tracker. It changes no decisions or manuscript and grants no approval. Argument errors exit 2; validation and filesystem failures exit 1.

For explicit report validation, `--report` may be repeated. `node <setup-skill-root>/scripts/validate.mjs --report <path>...` checks report-internal duplicate IDs and conflicting identities within the supplied set. Add `--tracker <path>` to compare tracker stage and audit identity; use exactly one `--manifest <path>` with reports from that project to load its tracker and historical report identities. Independent project reports must not be compared as one batch.

## Initialize

For a new project, run the installed `scaffold-project.mjs --project-root <project-root> --language <selected-language> --json`, adding the selected title, manuscript root, and operational paths through the options in its `--help` output. That CLI is the only new-project scaffolding implementation. It reads `../assets/project-template.json`, `../assets/backup-index-template.json`, and the Story Bible and audit-tracker templates from the sibling `author-project` skill by default; `--author-project-root` overrides that location for a nonstandard installation. It retains template defaults for omitted paths, applies one current UTC timestamp to the manifest and new tracker, creates only missing directories and skeleton files, preserves existing manuscript and skeleton content, and refuses an existing manifest. It validates the complete project before succeeding. Do not manually replace template fields, create a backup index, or follow creation with a duplicate standalone validation.

For an existing manifest, run the installed `initialize.mjs --project-root <project-root> --json` directly as described under [Existing-project initialization](read-operations.md#existing-project-initialization). That CLI is the only existing-project initialization implementation; do not manually validate, create its index, or construct a replacement projection. Keep backup, restoration, and execution receipt records in this index rather than adding undeclared manifest properties. A legacy index without `executions` remains readable; its approved edits have no execution evidence until reconciled receipts are appended.

Neither command populates manuscript or Story Bible creative content, establishes an entry operation, or invokes a strategy.

Read, validation, status, and navigation-cache procedures live in [`read-operations.md`](read-operations.md).

## Record scope

Record a proposed scope with:

```bash
node <setup-skill-root>/scripts/record-scope.mjs --manifest <project-root>/.author-toolkit/project.json --scope-id <scope-id> --description <description> --status proposed --file <project-relative-path> [--file <project-relative-path> ...] [--exclude <project-relative-path> ...] [--created-at <UTC-timestamp>]
```

Each `--file` retains its supplied reading order. The CLI rejects duplicate paths and computes every SHA-256 hash from current file bytes inside the shared write lock. Each `--exclude` names a current non-manuscript inventory exclusion; it does not exclude a manuscript file from `current_scope.files`. Apply the scope-ID rules above: a confirmed scope can retain its ID for text-only hash changes, while membership, reading-order, or exclusion changes require a new ID.

After the author explicitly confirms the proposed scope ID, description, ordered paths and hashes, and exclusions, confirm that exact record with:

```bash
node <setup-skill-root>/scripts/record-scope.mjs --manifest <project-root>/.author-toolkit/project.json --scope-id <scope-id> --confirm [--updated-at <UTC-timestamp>]
```

Confirmation accepts no proposal fields. It preserves `created_at` and every other scope field, updates only `status` and the manifest's top-level `updated_at`, and stops if any manuscript hash or recorded non-manuscript exclusion has changed. It never refreshes the proposed hashes to match changed text. A text change requires a new proposal before confirmation.

Both forms reread the manifest after acquiring the shared lock and stop on a concurrent change. They preserve unrelated manifest fields, validate the complete candidate project before a verified atomic write, and validate the published manifest afterward. Both forms always emit JSON without a `--json` option. Their output includes the complete `current_scope` for the author decision. Argument errors exit 2; validation and filesystem failures exit 1.

## Set pending

The CLI reads the manifest internally immediately before each write. Use `node <setup-skill-root>/scripts/set-pending.mjs --project-root <project-root> --operation <operation> --status <status> --reason <reason> [--scope-id <scope-id>] [--artifact <path>...]`. Status is `in_progress`, `awaiting_author`, or `blocked`; reason is always nonempty and identifies the decision, interruption, or dependency. Preserve `current_scope` and all historical records. The command removes duplicate artifact paths while preserving first occurrence, retains at most eight inline in `pending_action.artifacts`, and writes the complete list to `.author-toolkit/pending-artifacts.json` when longer. The index matches the pending operation, scope ID, pending timestamp, and top-level manifest timestamp, and `pending_action.artifact_index` points to it. Shorter lists stay inline without an index. Set both `pending_action.updated_at` and top-level `updated_at` to the same current UTC timestamp; validate both files through the installed validator. An interrupted two-file update requires reconciliation before relying on either file. The command always emits JSON without a `--json` option.

The index is the current pending action's living artifact index, not a history of completed operations. A subsequent pending action replaces it only as part of that state update. Preserve reports, sessions, batches, and other historical evidence at their original paths. An existing long inline list without `artifact_index` remains valid until an author-requested pending-action update; never migrate it as part of setup or read-only work.

`pending_action` describes requested or interrupted work, not linear operation progress. Do not mark an operation complete, choose a following operation, or resume a write because another skill was invoked. The calling strategy supplies each explicit transition. If a write fails after the manifest was read, reread before retrying.

## Backup and creation commit

Before a manuscript, baseline, or Story Bible edit, resolve the backup root from `paths.backups`. The calling orchestrator supplies an approved file list and an `edit` approval ID for the write's actual operation. A plan, baseline, story-bible, scope, or override decision is not a write approval. Verify that the approval is current and matches the operation, scope ID, paths, and actions. For every existing modify, delete, or reorder target:

Write a batch JSON containing only `files`, with `path`, `action`, and `input_sha256` for every approved path, then run:

```bash
node <setup-skill-root>/scripts/writes.mjs record-backup --manifest <project-root>/.author-toolkit/project.json --operation <operation> --scope-id <scope-id> --approval-id <approval-id> --batch <batch-file>
```

The command verifies the manifest, current scope, approval, exact paths, and current hashes; backs up every existing target under `<paths.backups>/<backup-id>/`; verifies the copies; and atomically appends a `pending_backups` record, including create-only absence evidence. Create targets use a null input hash and must remain absent. The gate is project-wide: an unverified approval from another batch, or an already-started unverified current batch, rejects every new backup, including create-only batches. A current approval without a prior backup may take its first backup. The command does not approve a batch or alter manuscript content.

For each create target, record that the file is expected absent with a null input hash; do not invent an original backup or backup ID. Recheck absence immediately before publication. Use a unique backup ID based on UTC time, operation, and a short scope slug, adding a suffix on collision. Complete and verify every required backup and absence check before the first manuscript write. A partial, unexpected, or hash-mismatched result blocks the write.

For `creation-commit`, follow [`../../write-fiction/references/creation-state.md`](../../write-fiction/references/creation-state.md). Write `<paths.creation>/batches/<commit-id>.json` before touching manuscript text, record every planned action and its pending state, and update the journal after every write and verification transition. An interrupted journal records exact completed and pending actions and stops publication pending an explicit author decision. Record backup IDs, approvals, scope IDs, commit ID, and paths in the session note. Backups and journals are text records; Git is not a substitute.

## Complete write

After `record-backup`, place the complete approved publication batch in a project-local JSON file. Its `files` entries contain `path`, `action`, `input_sha256`, `output_sha256`, and `content`. Non-delete content is the exact UTF-8 file body; delete uses null content and output hash. Then run:

```bash
node <setup-skill-root>/scripts/writes.mjs complete-write --manifest <project-root>/.author-toolkit/project.json --operation <operation> --scope-id <scope-id> --approval-id <approval-id> --batch <publication-batch-file> [--commit <creation-commit-journal>]
```

The command validates every approved path, action, input and output hash, content, pending backup, and optional journal before publication. It rechecks the current input, publishes each non-delete file through a verified temporary sibling and atomic rename, verifies every resulting output, preserves one immutable `execution-evidence-schema.json` record under `<paths.backups>/executions/`, and atomically appends its linked receipt to `executions` in `<paths.backups>/index.json`. The writing skill supplies decided content but performs no manuscript-write counterpart. The receipt retains:

- `schema_version: "1.0.0"`, the exact edit `approval_id`, operation, and scope ID;
- every `backup_id` used by the batch; a create-only batch can have an empty list;
- one entry for every approved path with its `create`, `modify`, `delete`, or `reorder` action and verified input and output SHA-256 hashes. A create has a null input hash, a delete has a null output hash, and every other action has both hashes;
- `recorded_at`, the UTC time this receipt is recorded.

The command generates evidence and its receipt in the same invocation, with `completed_at` from its completion timestamp. It does not compare historical receipt outputs with current manuscript after later edits. A failed preflight leaves manuscript unchanged. Per-file publication is atomic; the batch is not one filesystem transaction. Preserve an interrupted batch for explicit reconciliation. For creation, `--commit` verifies the journal and records written and verified transitions; it remains `in_progress` while story state and scope are published. After all targets are verified, evidence and receipt are retained even if scope publication is interrupted.

Only one receipt is allowed per approval, and it must cite every backup belonging to that approval. Preserve all existing records. On receipt, existing-file records move from `pending_backups` to `backups`; create-only absence evidence is removed after its linked receipt is preserved. Run the installed manifest validator and `status.mjs`; the approval remains `approved`, while the receipt supplies execution evidence.

Retry `complete-write` with the same exact batch after interruption. It verifies preserved evidence and journal state instead of republishing them; unchanged input targets still require the approved input hash. Ordinary revision retries reconcile scope currency before continuing. A `written` but unverified journal entry requires explicit reconciliation. For other preserved post-write evidence from interrupted or historical work, run:

```bash
node <setup-skill-root>/scripts/writes.mjs record-execution --manifest <project-root>/.author-toolkit/project.json --evidence <project-relative-evidence-path>
```

This recovery command appends a receipt from existing evidence; it is not the routine manuscript publication procedure.

For a legacy project, preview reconciliation with one or more `--evidence` arguments, then repeat with `--write` to append the accepted candidates:

```bash
node <setup-skill-root>/scripts/writes.mjs reconcile-executions --manifest <project-root>/.author-toolkit/project.json --evidence <path>... [--write]
```

Reconciliation accepts only preserved post-write evidence that establishes the exact completed batch and output hashes. A backup, an approval, or a session statement alone does not establish those hashes. Later manuscript text is not evidence of an earlier output after subsequent edits. Invalid or unprovable inputs are reported in `rejected`; valid candidates may be appended without fabricating receipts for rejected inputs. Unsupported approvals remain `unverified`, and `recorded_at` records the later reconciliation time. Repeating the same evidence is idempotent. A receipt's linked evidence is immutable: a later hash change invalidates project validation. Use preflight's read-only `--diagnose` recovery audit to discover and preview candidates before this command. If it finds no reconcilable evidence, follow the shared author decision to locate new evidence or end recovery without establishing current-draft revision convergence; do not loop reconciliation or bypass the backup gate by changing approval status, scope, or baseline. Restore safety backups and interrupted-state recovery remain separate operations; this gate does not require an execution receipt before preserving current content for a restore.

## Restore

A restore needs separate explicit author approval naming the backup or creation commit and exact files. Verify the approval and current scope, then back up current versions under a new safety backup ID with their input hashes before restoring anything. For files created by the restored batch, move created files into the safety backup before removing them from the manuscript; preserve their exact bytes and record both paths. Restore approved original snapshots only after every safety backup succeeds. Reverse the accepted creation-state differences as directed by the creation recovery procedure.

After every restore action completes, append a `restorations` record to the backup index containing the restore timestamp, source backup or commit ID, restored and removed files and hashes, approval ID, scope ID, and safety backup ID. This completed record is the restore execution receipt; a safety backup alone is not execution evidence. Keep both backup manifests, created-file safety copies, commit journals, and all records. Record the restore in the current session note and report restored paths.

After the restore, apply the shared state-and-findings dependency rules to stale every affected evidence item and identify the resulting next action. Establish a newly confirmed scope when membership, reading order, or exclusions change; otherwise retain the scope ID with reconciled hashes. Validate the resulting shared state before returning.
