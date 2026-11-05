# Project operations

Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared names, contract values, and their boundaries.

## Paths and manifest identity

Resolve the project root before reading or writing. The canonical manifest is `.author-toolkit/project.json` beneath that root. Accept `schema_version: "3.0.0"`, `"3.1.0"`, and `"3.2.0"`; they store project metadata, `manuscript_root`, shared `paths`, and optional `current_scope` and `pending_action`, with no `workflow`, `current_stage`, or `stages` properties. A v3.1 manifest also registers `paths.creation`, defaulting to `.author-toolkit/creation/`. Preserve a v3.0 project until the author confirms `upgrade-v31`; recognize v2 only for setup migration. A v3.2 manifest registers the convergence state root, defaulting to `.author-toolkit/convergence/`.

Keep stored paths relative to the project root and use forward slashes. Resolve them against the root when reading. Reject absolute paths, backslashes, URI schemes, home paths, and `..` segments. Resolve `paths.creation` and the convergence state root by the same rules and exclude them from manuscript inventory. Setup deploys shared runtime contracts to the fixed `.author-toolkit/references/` directory beneath the project root. This directory has no manifest field and is excluded by the `.author-toolkit` operational root. One manifest represents one book. A separate book needs its own project root and manifest.

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are author-invoked strategies over the same manifest, tracker, reports, sessions, backups, and handoffs. No strategy owns the shared project state. Do not create a strategy-specific subdirectory or a second tracker. At a stable operation gate, an active current-draft convergence cycle permits its exact recovery work and read-only inspection; it blocks a parallel manuscript-changing cycle. With no active cycle, switching preserves current scope, evidence, decisions, staged drafts, and pending action. Every switch waits for the author's exact command and never resumes writing automatically.

Valid pending-action operation names are `intake`, `story-bible`, `draft-baseline`, `structure`, `characters`, `diagnostics`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, `current-scope-review`, `final-review`, `creation-baseline`, `writing-plan`, `chapter-creation`, `chapter-review`, `creation-commit`, `creation-import`, and `milestone-review`. The legacy `STAGES` remains revision-only; do not add creation operations to it or to report v2 `stage`.

## Shared scope and evidence

A scope record identifies `scope_id`, `description`, ordered manuscript `files` with a `sha256` hash for each, `excluded_files`, `proposed` or `confirmed` status, and `created_at`. Record a proposed scope first. Mark it `confirmed` only after the author explicitly confirms that scope ID, its ordered paths and hashes, its exclusions, and its reading order. A new book can have no current scope before its first accepted manuscript file.

On v3.2, every current scope also has `scope_fingerprint`. Compute it as SHA-256 over UTF-8 `JSON.stringify` of this object, with keys in the shown order:

```json
{
  "files": [{ "path": "manuscript/chapter-001.md", "sha256": "<sha256>" }],
  "excluded_files": ["<sorted-project-relative-path>"]
}
```

`files` retains the author-confirmed reading order and each object retains `path`, then `sha256`. Sort `excluded_files` by code-unit order before hashing. Scope ID, description, status, author confirmation, snapshot locations, and timestamps do not enter the scope fingerprint. Text-only edits can retain the scope ID but produce a new scope fingerprint. Two scope records with different IDs can have the same scope fingerprint.

Create a new `scope_id` whenever manuscript membership, reading order, or exclusions change. A text-only change can retain the scope ID, but its new input hashes and scope fingerprint invalidate evidence as described below. Only the author confirms a scope change. Keep every historical report bound to its original scope ID and input versions; never relabel it as covering a new scope.

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

1. For a new project, start with `../assets/project-template.json`. Replace sentinel timestamps with the current UTC timestamp and `und` with the detected or author-supplied BCP 47 language. Register supplied project metadata and paths, retaining template defaults for omitted paths, including `paths.creation` and the convergence state root. Do not add a workflow, entry operation, or strategy owner.
2. For an existing v3.0, v3.1, or v3.2 manifest, validate and return it without resetting current scope, pending action, paths, artifacts, decisions, snapshots, or external backup records. Do not infer a scope snapshot or author confirmation for an older manifest.
3. For an existing v2 manifest, preserve it and run `node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>`. Retain the script's snapshot and migrate current scope, pending action, and legacy overrides directly to v3.1. Report the snapshot path and migration diagnostics. Validate the resulting v3.1 manifest. Never silently replace or reset a v2 project.
4. Resolve `paths.backups` and create `<paths.backups>/index.json` from `../assets/backup-index-template.json` when absent. Keep backup records in this index rather than adding undeclared manifest properties.

The caller creates directories and empty creative templates. Initialization does not populate manuscript or Story Bible creative content, establish an entry operation, or invoke a strategy.

## Upgrade v3.1

Use `upgrade-v31` only after the author confirms the additive upgrade for a valid v3.0 project. Add `paths.creation`, using the supplied safe project-relative path or `.author-toolkit/creation/`, change only `schema_version` to `"3.1.0"`, and update `updated_at`. Write the manifest atomically and validate it as v3.1. Preserve manuscripts, reports, findings, approvals, scopes, pending work, backups, and every other registered path. Existing creation artifacts remain untouched.

For a valid v3.1 or v3.2 manifest, validate and return it without another write or a version change. For v2, return to setup migration instead of composing upgrades. Do not create manuscript files or mark creation evidence current during this upgrade.

## Read and validate

Before a shared workflow `read`, `validate`, or `status`, resolve the installed `setup-author-toolkit` skill's `assets/references/` payload and compare every packaged file with its corresponding file beneath `<project-root>/.author-toolkit/references/`. A valid v3 manifest alone does not prove that these shared runtime contracts are deployed.

- If a packaged file is missing from the project, stop and return the missing project-relative paths. Instruct the caller to display the exact user-invoked `setup-author-toolkit` command and wait for the author. Do not continue shared work or write project state.
- If an existing file's SHA-256 hash differs from the packaged file, stop and report `reference-version-conflict` with both hashes. Instruct the caller to display the setup command and wait. Only setup may replace the file through its separate exact-file approval and backup procedure.

Return shared state as ready only after every packaged reference exists with a matching hash. Setup deploys the payload before initialization or migration, so its later validation continues through these same checks without another deployment.

For every read, parse JSON and check `schema_version`. Apply the installed schema and operation rules for the declared v3.0, v3.1, or v3.2 version, including required fields, additional-property restrictions, current scope, pending action, timestamps, safe relative paths, and registered operational roots. Use `<project-root>/.author-toolkit/references/project-schema.json` only to recognize legacy v2 state before migration. Return v2 as requiring migration through setup; do not reinterpret it as v3.

When the installed toolkit contains `scripts/validate.mjs`, run:

```bash
node <toolkit-root>/scripts/validate.mjs --manifest <manifest-path>
node <toolkit-root>/scripts/validate.mjs --scope-snapshot <snapshot-path> --inventory-snapshot <inventory-path>
```

Use the documented Node environment. Report the command, exit status, and diagnostics. For v3.0 and v3.1 with a current scope, manifest validation recomputes manuscript hashes under `#scope`. For v3.2, `#scope` additionally returns `scope_id`, `scope_fingerprint`, and `full_manuscript=true|false` after the checks below. Treat a `scope-currency` or failed full-manuscript diagnostic as changed or incomplete input: mark dependent evidence stale and reconcile the scope with the author before relying on it or writing. Do not refresh hashes silently. Script validation is authoritative. Without the script, perform the schema and hash checks above and label the result `manual-checks-only`; do not claim full JSON Schema validation. On read or status, report validation failures, changed inputs, and missing registered paths without repairing them implicitly. A read returns the full parsed manifest plus the shared state view below; status returns that compact view.

A v3.2 full-manuscript result is true only when all of these conditions hold:

- the current scope is confirmed and its declared scope fingerprint matches canonical content;
- every manuscript path is unique and belongs to current manuscript inventory;
- the scope and its immutable inventory snapshot contain exactly the same manuscript paths and hashes, with no unregistered current manuscript;
- every current disk hash matches the confirmed scope;
- manifest file order matches the author-confirmed snapshot order, and the author-confirmation reference explicitly confirms reading order;
- scope exclusions match the snapshot and current non-operational inventory exclusions;
- scope and inventory snapshots satisfy their closed schemas, fingerprint identities, paths, and recorded content hashes.

Operational-file additions do not by themselves change scope exclusions. A non-operational exclusion change, including a new or removed non-manuscript file beneath the manuscript root, does change the full-manuscript result.

## Status

Return a compact shared state view containing:

- project root, manifest schema and creation timestamps, project type, language, and manuscript root;
- current scope ID, scope fingerprint when available, confirmation status, ordered paths and hashes, exclusions, snapshot paths, and the v3.2 full-manuscript result;
- the active current-draft convergence cycle, its revision, current strategy, recovery position, and related references, or its absence;
- pending action, status, scope ID, reason, and artifacts, or its absence;
- convergence status with `query_valid`, `outcome`, `current`, `evaluation`, `cycle`, `blockers`, and `required_action`;
- every stale or blocked evidence item with its operation, scope, dependency reason, and source report or tracker row;
- the active cycle's exact next action, or the next action recorded in the tracker or latest session note when no cycle is active;
- validation errors, missing paths, and unresolved approval, backup, commit, or restore requirements.

Status does not infer operation completion, select a strategy, advance pending action, or claim current-draft revision convergence from a full-manuscript result alone. A valid convergence status query reports `satisfied`, `not_satisfied`, or `indeterminate` without changing state. When no evaluation or trustworthy proof is available, report `indeterminate`, `current: false`, and the missing-proof blocker; report a known unmet condition as `not_satisfied` with its concrete blocker. The separate convergence gate succeeds only for `satisfied` with current evidence; both other outcomes and stale evidence fail with structured blockers. Neither query treats an ordinary unfinished lifecycle as a malformed file.

## Current-draft convergence cycle

The active current-draft convergence cycle lives at `<convergence-state-root>/active-cycle.json`. At most one active record exists for the book. Completed records are immutable beneath `<convergence-state-root>/cycles/<cycle-id>.json`; when no cycle is active, the active record is absent. Use the deployed closed cycle contract beneath `<project-root>/.author-toolkit/references/` for artifact validation. Do not put lifecycle ownership in session notes, tracker prose, or pending action.

A versioned cycle records `cycle_id`, `revision`, `active` or `completed` status, initiating and current strategies, bootstrap, starting and target scope references, requested-pass reference, recovery position, related artifacts, change set, work set, starting and target evaluation references, completion, and timestamps. Scope references carry the scope ID, fingerprint, snapshot path, and snapshot SHA-256. Pass and evaluation references carry their IDs and content-addressed artifact identities. Related artifacts cover plans, creation batches, at most one creation commit, revision execution records, review groups, review jobs, and no-edit skips. The change set records its two scope references, created, modified, deleted, and reordered paths, and evidence-affected and dependency-affected paths. The work set records required operations and reasons by path. These references let later execution, review, evaluation, and completion operations extend the same lifecycle without changing the closed cycle contract.

For first-time bootstrap, require `initiating_strategy: "write-fiction"`, `bootstrap: true`, a null `starting_scope`, no current scope, an actually empty manuscript inventory, and no completed bootstrap. Bootstrap creates an active record with no starting scope or starting evaluation; it does not claim that an empty manuscript has reached current-draft revision convergence. A nonempty manuscript, an existing current scope, or a completed bootstrap receives `bootstrap-requires-empty-project` and the exact `revise-draft` recovery action.

Every non-bootstrap start requires a full-manuscript starting scope whose immutable snapshot is current at entry, plus a current satisfied starting convergence evaluation. Request base scope and increment previous scope are strategy-specific names for this same starting-scope role. A scope result, pending action, session note, staged draft, or caller-supplied outcome never supplies the evaluation. An untrustworthy snapshot returns `starting-scope-indeterminate`; unavailable evaluation proof returns `starting-evaluation-indeterminate`. Neither case creates an active record. Preserve the starting snapshot as historical evidence after expected manuscript edits instead of reapplying the entry check to that historical record.

Use the public facade for starts and optimistic transitions:

```bash
node <toolkit-root>/scripts/author-project.mjs start-cycle --project-root <project-root> --input <request.json>
node <toolkit-root>/scripts/author-project.mjs transition-cycle --project-root <project-root> --input <transition.json>
node <toolkit-root>/scripts/author-project.mjs cycle-status --project-root <project-root>
node <toolkit-root>/scripts/author-project.mjs cycle-gate --project-root <project-root>
node <toolkit-root>/scripts/author-project.mjs check-operation --project-root <project-root> --input <operation.json>
```

The transition input names `cycle_id` and `expected_revision`. It may change current strategy, recovery position, target scope, requested pass, related artifacts, change set, and work set. It cannot change cycle ID, initiating strategy, bootstrap, starting scope, status, evaluation references, or completion. A newly assigned target scope must be the current confirmed full-manuscript scope. An existing starting or target snapshot remains valid historical evidence after expected edits. Recompute every referenced artifact hash before the write. A stale revision, ID mismatch, unsafe reference, missing artifact, or changed hash stops the transition without replacing active state.

Before those checks, acquire `<convergence-state-root>/active-cycle.lock/` through atomic directory creation and record the owning PID and random token. Reread the active record inside this cross-process critical section and recheck cycle ID and expected revision before validating references or writing. A later writer that acquires the lock after a successful transition therefore receives `cycle-revision-conflict` instead of overwriting the winner. The default wait is 10 seconds with bounded retries; JavaScript callers can supply shorter test timeouts. `cycle-transition-lock-timeout` and `cycle-transition-lock-error` report coordination failure without writing state. Do not steal or silently remove a leftover lock directory after a crash; dependent work remains blocked for explicit recovery. Read-only status remains available.

Create the first active record through a verified temporary sibling and no-clobber publication. Apply later active updates with the cross-process lock, expected revision, a verified temporary sibling, and atomic rename. Release the lock only after verifying its PID and token. `cycle-transition-lock-release-error` reports a release failure with truthful `state_written` state instead of claiming normal completion. Completed history is never overwritten. Cycle, manifest, pending, and lock-directory writes are coordinated records, not a claimed multi-file filesystem transaction; identity mismatches stop dependent work for reconciliation.

`check-operation` always permits read-only status, diagnostics, and review. For manuscript-changing work it requires the active cycle ID, current strategy, and exact recovery-position operation. Other manuscript-changing work returns `active-cycle-exists` or `cycle-operation-mismatch` with `required_action.strategy`, `required_action.operation`, and `required_action.command`. The command is the exact registered strategy name; render the host's command prefix without changing that name and wait for the author. This operation gate does not replace exact manuscript approval, backups, or input-hash checks.

Pending action continues to describe only the current operation and author gate through `in_progress`, `awaiting_author`, or `blocked`. It has no cycle ownership field and does not supply cycle history, resume permission, evaluation evidence, or completion. Starting or transitioning a cycle does not infer or advance pending action.

For independent read-only checks, use:

```bash
node <toolkit-root>/scripts/validate.mjs --convergence-status <manifest-path>
node <toolkit-root>/scripts/validate.mjs --convergence-gate <manifest-path>
```

Convergence status exits successfully when the query itself is valid, including an `indeterminate` outcome. Convergence gate exits nonzero for `not_satisfied`, `indeterminate`, stale evidence, or malformed state. Usage errors retain the validator's exit status 2. Both commands are read-only. Evaluation and completion require their dedicated evidence operations; `transition-cycle` never substitutes for them.

## No-edit convergence evaluation and completion

Use the deployed `requested-pass-schema.json`, `no-edit-skip-schema.json`, `review-group-schema.json`, `semantic-attestation-schema.json`, and `convergence-evaluation-schema.json` for the first full-manuscript no-edit path. Preserve passes beneath `passes/`, no-edit skips beneath `no-edit-skips/`, review groups beneath `review-groups/`, attestations beneath `attestations/`, and evaluations beneath `evaluations/` in the convergence state root. These artifacts are immutable after publication.

A requested pass records its target scope reference, required operations and paths, BCP 47 language, subchecks, versioned dependencies, inapplicability reasons, narrowing decision and gaps, baseline pass, newly requested subchecks, and creation time. Compute its fingerprint as SHA-256 over UTF-8 `JSON.stringify` of an object with keys in this order: `target_scope` containing only `scope_id` and `scope_fingerprint`, `required_operations`, `paths`, `language`, `dependencies`, `inapplicability`, `narrowing` containing only `reason` and `gaps` or null, `baseline_pass` containing only `pass_id` and `pass_fingerprint` or null, and `requested_subchecks` containing only `operation` and `subcheck`. Preserve the recorded array order. Pass ID, snapshot locations, decision IDs, and timestamps are excluded.

The baseline is the latest satisfied, unrestricted full-manuscript pass preserved in completed history, excluding the cycle being evaluated. Every inherited operation and subcheck remains required. Newly requested checks have explicit author decision IDs and extend that baseline; they cannot remove or relabel an inherited check. A later narrowed requested pass never supplies or reduces this baseline. Eligible local coverage units keep their original scope and pass provenance. Their source reports may belong to an earlier pass only when the source hash, operation, paths and hashes, requested subchecks, and dependencies all match; compose a new full-target index and synthesis for the requested pass.

A no-edit skip binds `revision-plan` and `chapter-revision` to the pass and target fingerprint, covered finding IDs, explicit author decision, and reason. Verify the decision in the shared tracker. Deferred and dismissed findings remain valid when their decisions are current and covered; open findings are `not_satisfied`, and resolved findings need verified revision execution evidence rather than a no-edit claim. An empty manuscript or missing evidence never becomes satisfied.

A review group binds intent, standards, and fresh jobs, their reader states, every chunk and applicable synthesis report, and the fresh logical-reviewer attestation to one pass and target fingerprint. Each job must validate complete full-target coverage against actual source hashes and line counts. A completed fresh job requires a completed reader state containing every job chunk in the declared order, not merely a continuous prefix. Final review can satisfy current-scope review only under the existing same-scope and same-checks equivalence rule.

Semantic attestations identify the attester, pass and scope fingerprints, claim subject, verdict, statement, referenced artifact hashes, and creation time. Require host `coverage-semantics` and `review-semantics` claims plus the fresh logical reviewer's `fresh-reader-continuity` claim. `confirmed` supports a claim; `refuted` records a known failed condition. Missing, conflicting, or mismatched attestations are `indeterminate`. Attestations never replace tracker decisions, and deterministic validation cannot prove actual reading quality or editorial correctness.

Run the public operations with exact cycle ID and expected revision:

```bash
node <toolkit-root>/scripts/author-project.mjs evaluate-cycle --project-root <project-root> --input <evaluation-request.json>
node <toolkit-root>/scripts/author-project.mjs complete-cycle --project-root <project-root> --input <completion.json>
```

The evaluation request supplies `evaluation_id`, the coverage-index reference, intake and draft-baseline report references, review-group reference, and semantic-attestation references. Evaluation and completion acquire the same `active-cycle.lock/` used for transitions and recheck the expected revision inside the lock. Only one writer can win a revision race. The evaluation request does not accept an outcome: the evaluator derives `satisfied`, `not_satisfied`, or `indeterminate` from current evidence and returns concrete blockers.

Before reading target evidence, compare the target reference's `scope_id`, `scope_fingerprint`, `snapshot_path`, and `snapshot_sha256` with manifest `current_scope`. Any difference returns `target-scope-identity-mismatch` as `indeterminate`, fails status currency and the gate, and blocks evaluation or completion even when manuscript line counts are unchanged. This current-target check does not rewrite historical baseline evidence; ordinary starts separately revalidate their current starting snapshot and satisfied evaluation before later manuscript work makes that snapshot historical.

Every evaluation records its complete evidence graph: target and inventory snapshots, requested and baseline passes, manuscript and dependency versions, tracker, reports, coverage index and units, no-edit skips, review group, jobs, reader states, attestations, and baseline evaluation when applicable. Each entry records role, artifact identity, safe project-relative path, and SHA-256. The active cycle, manifest pending fields, and evaluation itself are excluded, preventing a self-hash cycle. Status and gate queries recompute current text, artifact hashes, coverage, decisions, review chains, and claims instead of trusting a stored outcome. A known failed condition is `not_satisfied`; missing, unreadable, changed, or inconsistent proof is `indeterminate`. Both fail the gate.

The completion input supplies a new `evaluation_id`, `decision_id`, and `author_confirmed: true`. Completion uses this exact order:

1. Recompute the current target evaluation and reject completion if it is not current and satisfied. Author confirmation cannot override `not_satisfied`, `indeterminate`, or stale evidence.
2. Append the explicit decision to the tracker's `## Cycle completions` table with its cycle ID, target fingerprint, approved status, reason, and UTC time. Older trackers without this optional table remain valid; the operation adds it before `## Open questions` when needed.
3. Recompute and publish a new immutable evaluation using the changed tracker hash. Never exclude the tracker hash, accept the pre-decision evaluation, or add the evaluation's own hash to its graph.
4. Only when the new evaluation is satisfied, publish the completed cycle with the new evaluation and decision IDs, then remove the active record. Preserve the prior evaluation and every referenced artifact. A non-satisfied post-decision evaluation leaves the cycle active and retains the recorded decision as history.

These coordinated writes do not claim a multi-file filesystem transaction or comprehensive crash reconciliation. A leftover lock, identity mismatch, or partially coordinated state stops dependent work for explicit recovery. Read-only status remains available.

Validate the artifacts through the public CLI:

```bash
node <toolkit-root>/scripts/validate.mjs --requested-pass <pass.json>
node <toolkit-root>/scripts/validate.mjs --no-edit-skip <skip.json>
node <toolkit-root>/scripts/validate.mjs --review-group <review-group.json>
node <toolkit-root>/scripts/validate.mjs --semantic-attestation <attestation.json>
node <toolkit-root>/scripts/validate.mjs --convergence-evaluation <evaluation.json>
```

## Set pending

Read the manifest immediately before each write. Write the requested `pending_action` values: `operation`, `status`, `scope_id`, `reason`, and `artifacts`. Status is `in_progress`, `awaiting_author`, or `blocked`; reason is always nonempty and identifies the decision, interruption, or dependency. Preserve `current_scope` and all historical records. Append unique artifact paths and set both `pending_action.updated_at` and top-level `updated_at` to the current UTC timestamp.

`pending_action` describes requested or interrupted work, not linear operation progress. Do not mark an operation complete, choose a following operation, or resume a write because another skill was invoked. The calling strategy supplies each explicit transition. If a write fails after the manifest was read, reread before retrying.

## Record scope

Read the manifest and hash every complete manuscript file immediately before writing. Record the scope ID, description, ordered paths, SHA-256 hashes, `excluded_files`, `proposed` or `confirmed` status, and creation timestamp. A confirmed write requires the author's explicit confirmation of that exact record and reading order. Preserve the prior scope in reports, immutable snapshots, and session history. V3.0 and v3.1 retain their existing scope record behavior.

On v3.2, use the public `recordScope` operation exported by `scripts/lib/index.mjs`. A proposed write records the scope fingerprint without creating a snapshot. A confirmed write additionally requires `authorConfirmation.decision_id`, `authorConfirmation.confirmed_at`, and `authorConfirmation.reading_order_confirmed: true`; the decision reference is evidence of confirmation, not manuscript-edit approval.

The confirmed operation creates or reuses two immutable artifacts beneath the registered convergence state root:

- `inventories/<inventory-fingerprint>.json` contains the complete observed manuscript inventory, current hashes, exclusions, manuscript root, and observation timestamp. Its fingerprint hashes canonical JSON containing the manuscript root, file path/hash pairs sorted by path, and exclusions sorted by code-unit order; the timestamp is excluded.
- `scopes/<scope-id>-<scope-fingerprint>.json` contains the exact confirmed scope, its ordered files and hashes, sorted exclusions, an inventory reference with path, SHA-256 and inventory fingerprint, and the author-confirmation reference. Including both scope ID and scope fingerprint in the filename permits distinct confirmed scope IDs to share identical content.

Write snapshot content through a verified temporary sibling and publish it without overwriting an existing path. Reuse an identical existing artifact. If the same artifact identity has different content, stop with an immutable-snapshot conflict rather than replacing history. Update the manifest with the scope fingerprint, snapshot project-relative path, and snapshot SHA-256 through a verified temporary sibling and atomic rename. Snapshot creation and manifest update are coordinated writes, not a claimed multi-file filesystem transaction.

Use `validateFullManuscriptScope` from the same public module or the validator CLI to rederive the full-manuscript result. A proposed or narrowed scope can be recorded truthfully but does not return `full_manuscript=true`.

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

After the restore, apply the shared state-and-findings dependency rules to stale every affected evidence item and identify the resulting next action. Establish a newly confirmed scope when membership, reading order, or exclusions change; otherwise retain the scope ID with reconciled hashes and a new scope fingerprint on v3.2. Validate the resulting shared state before returning.
