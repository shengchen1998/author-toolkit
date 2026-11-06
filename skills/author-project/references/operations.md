# Project operations

Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared names, contract values, and their boundaries.

## Paths and manifest identity

Resolve the project root before reading or writing. The canonical manifest is `.author-toolkit/project.json` beneath that root. Accept `schema_version: "3.0.0"`, `"3.1.0"`, and `"3.2.0"`; they store project metadata, `manuscript_root`, shared `paths`, and optional `current_scope` and `pending_action`, with no `workflow`, `current_stage`, or `stages` properties. A v3.1 manifest also registers `paths.creation`, defaulting to `.author-toolkit/creation/`. Keep v3.0 and v3.1 manifests readable for their supported legacy operations; recognize v2 only for setup migration. Migrate v2, v3.0, or v3.1 directly to v3.2 before using current-draft convergence cycle operations. The separate `upgrade-v31` operation remains only a legacy v3.1 compatibility path, not a substitute for v3.2 migration. A v3.2 manifest registers the convergence state root, defaulting to `.author-toolkit/convergence/`.

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
2. For an existing v3.2 manifest, validate and return it without resetting current scope, pending action, paths, artifacts, decisions, snapshots, or external backup records. Do not infer a scope snapshot or author confirmation.
3. For an existing v2, v3.0, or v3.1 manifest, preserve it and run `node <toolkit-root>/scripts/migrate-v32.mjs --project-root <project-root>`. The `migrate-v3.mjs` command and `migrateProjectToV3` function are compatibility wrappers with the same target. Migrate directly to v3.2 without writing v3.1 first. Retain the script's snapshot and migrate current scope, pending action, and legacy overrides as documented. Report the snapshot path, created scope and inventory snapshots, and legacy recovery diagnostics. Never silently replace or reset a legacy project.
4. Resolve `paths.backups` and create `<paths.backups>/index.json` from `../assets/backup-index-template.json` when absent. Keep backup records in this index rather than adding undeclared manifest properties.

The caller creates directories and empty creative templates. Initialization does not populate manuscript or Story Bible creative content, establish an entry operation, or invoke a strategy.

## Upgrade v3.1

Use `upgrade-v31` only after the author confirms the additive upgrade for a valid v3.0 project that intentionally remains on the legacy v3.1 path. Add `paths.creation`, using the supplied safe project-relative path or `.author-toolkit/creation/`, change only `schema_version` to `"3.1.0"`, and update `updated_at`. Write the manifest atomically and validate it as v3.1. Preserve manuscripts, reports, findings, approvals, scopes, pending work, backups, and every other registered path. Existing creation artifacts remain untouched.

For a valid v3.1 or v3.2 manifest, validate and return it without another write or a version change. For v2, v3.0, or v3.1 work that uses a current-draft convergence cycle, return to direct setup migration instead of composing upgrades. Do not create manuscript files or mark creation evidence current during this upgrade.

## Legacy migration and recovery

Migration creates the skeleton for the convergence state root and current inventory evidence. It preserves an author-confirmed scope snapshot only when one existing approved tracker row has type `scope-confirmation`, operation `intake`, the exact scope ID and ordered paths, and matching whitespace-separated `scope_fingerprint=<fingerprint>` and `reading_order_confirmed=true` tokens. Reuse that row's existing approval ID and timestamp; never create a placeholder approval. Without exactly one matching row, preserve the original confirmed record in the migration snapshot and make the migrated current scope proposed for reconfirmation. Legacy reports, findings, approvals, pending actions, sessions, staging, backups, batches, and journals do not create a satisfied evaluation or active cycle.

Preserve every v3.0 or v3.1 pending action exactly. Run `author-project reconcile-cycle` without a direction to diagnose nonterminal legacy journals and `in_progress` pending work before dependent cycle operations or manuscript writes. `legacy-commit-recovery-required` and `legacy-pending-recovery-required` are recovery blockers, not inferred cycle ownership. Follow the explicit creation recovery procedure and its independent author decisions before starting a cycle. A diagnostic direction never publishes, restores, or rewrites these legacy artifacts.

A staged draft from a legacy project requires either an exact `creation-rejection` decision or a current satisfied full-manuscript starting evaluation followed by exact reapproval in one new `write-fiction` cycle. Reapproval rechecks the staged bytes, dependency fingerprint, story-state differences, complete publication scope, and new manuscript and scope approvals. `legacy-staging-decision-required` blocks bootstrap until rejection; it does not block independent full-manuscript `revise-draft` recovery or a later ordinary cycle with satisfied starting evidence. Migration never publishes staging or infers acceptance. When a legacy revision base cannot be revalidated, use current full-manuscript `revise-draft` recovery and apply only the normal coverage-reuse rules.

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

Status does not infer operation completion, select a strategy, advance pending action, or claim current-draft revision convergence from a full-manuscript result alone. A valid convergence status query reports `satisfied`, `not_satisfied`, or `indeterminate` without changing state. With no active cycle, select the latest completed-cycle target evaluation or independent `revise-draft` evaluation; a newer narrowed or otherwise unsatisfied independent result therefore prevents an older satisfied evaluation from passing the gate. When no evaluation or trustworthy proof is available, report `indeterminate`, `current: false`, and the missing-proof blocker; report a known unmet condition as `not_satisfied` with its concrete blocker. The separate convergence gate succeeds only for `satisfied` with current evidence; both other outcomes and stale evidence fail with structured blockers. Neither query treats an ordinary unfinished lifecycle as a malformed file.

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

For ordinary creation publication, link the committed creation batch and its committed journal through `related_artifacts`; these existing artifacts remain the publication execution records. Verify their IDs, `verified` files, starting and target scope IDs, and exact create, modify, delete, and reorder transitions against the preserved starting snapshot and complete current target snapshot. Require exactly one current chapter-review `creation-manuscript` approval for the batch paths and one `creation-scope` approval for the complete ordered target paths; duplicate or missing types fail with `creation-approval-missing`. Both reasons must bind the batch ID, recomputed dependency fingerprint covering actions and input hashes, and target scope fingerprint covering the complete reading order and output hashes. The scope approval must also match the snapshot confirmation decision. Derive the cycle change set from those snapshots and the journal rather than copying file transitions into the cycle. Pure create insertion before or between retained paths changes absolute indexes without requiring retained-path reorder records; compare retained paths by relative order. A real retained-order change still requires exact reorder transitions and the author-approved complete target order. The publication transition resumes the same cycle as `revise-increment` with its starting snapshot and evaluation preserved. A cycle can link one accepted creation commit, whose approved batch may contain multiple chapters. A second commit or a return to `writing-plan` before completion returns `creation-commit-limit`; `check-operation` supplies the exact `revise-increment` recovery command. These checks do not replace the creation journal, approvals, backups, absence checks, or publication writes.

For bootstrap publication, apply the same committed artifact, exact approval, backup, absence, output-hash, and story-state rules with a null `scope_before_id` and no starting snapshot. Derive every target path as created from the null starting scope, and link the first batch and journal explicitly; manuscript bytes or a confirmed scope alone cannot supply their execution evidence. The first nonempty publication resumes the same cycle as `revise-draft` for its initial full-manuscript pass and review. A first approved nonempty external import can instead establish this publication through `reconcile-manuscript`: the active bootstrap's null previous scope produces the complete created change set, the record supplies the approved import execution evidence, and no creation commit is required. Cycle-external reconciliation still requires an explicit previous scope. The import and commit paths must not switch to `revise-increment`, link a second commit, or return to `writing-plan` before satisfied evaluation and explicit completion. A rejected bootstrap batch with no approved nonempty import remains empty and cannot complete. After completion, later creation uses only the ordinary satisfied-start and one-commit path.

The evaluator checks actual manuscript inventory in addition to the target snapshot. An empty manuscript inventory produces `empty-manuscript` with `not_satisfied`, even when a historical target was previously satisfied, and cannot complete. A bootstrap evaluation without its linked first publication produces `creation-commit-evidence-missing`. Empty staging or a rejected first batch does not create a nonempty manuscript or permit no-change completion.

For ordinary rejected staging, link the rejected batch without a commit journal and retain its text outside manuscript inventory. Require exactly one current chapter-review `creation-rejection` decision whose paths and batch, dependency-fingerprint, and unchanged starting-scope binding match the rejected batch. Acceptance or another approval type does not authorize rejection. Revalidate the unchanged starting scope as the current full-manuscript target. The cycle then has a no-change change set and may complete through current no-change evidence and the normal satisfied evaluation and completion gates. Staging alone never supplies that evidence.

Before those checks, acquire `<convergence-state-root>/active-cycle.lock/` through atomic directory creation and record the owning PID and random token. Reread the active record inside this cross-process critical section and recheck cycle ID and expected revision before validating references or writing. A later writer that acquires the lock after a successful transition therefore receives `cycle-revision-conflict` instead of overwriting the winner. The default wait is 10 seconds with bounded retries; JavaScript callers can supply shorter test timeouts. `cycle-transition-lock-timeout` and `cycle-transition-lock-error` report coordination failure without writing state. Do not steal or silently remove a leftover lock directory after a crash; dependent work remains blocked for explicit recovery. Read-only status remains available.

Create the first active record through a verified temporary sibling and no-clobber publication. Apply later active updates with the cross-process lock, expected revision, a verified temporary sibling, and atomic rename. Release the lock only after verifying its PID and token. `cycle-transition-lock-release-error` reports a release failure with truthful `state_written` state instead of claiming normal completion. Completed history is never overwritten. Cycle, manifest, pending, and lock-directory writes are coordinated records, not a claimed multi-file filesystem transaction; identity mismatches stop dependent work for reconciliation.

`check-operation` always permits read-only status, diagnostics, and review. With no active cycle, independent `revise-draft` manuscript work remains available without a cycle. Except for the explicit `write-fiction` bootstrap started through `start-cycle`, the other manuscript-changing entries first require a current satisfied full-manuscript evaluation; failure returns `starting-evaluation-indeterminate` and the exact `revise-draft` recovery action. After that gate succeeds, the other four strategies must start and link an active cycle before manuscript-changing work; an unlinked attempt returns `active-cycle-required`.

With an active cycle, manuscript-changing work requires its cycle ID, current strategy, and exact recovery-position operation. Other manuscript-changing work returns `active-cycle-exists` or `cycle-operation-mismatch` with `required_action.strategy`, `required_action.operation`, and `required_action.command`. The command is the exact registered strategy name; render the host's command prefix without changing that name and wait for the author. This operation gate does not replace exact manuscript approval, backups, or input-hash checks.

Pending action continues to describe only the current operation and author gate through `in_progress`, `awaiting_author`, or `blocked`. Optional `cycle_id`, `cycle_revision`, `operation_id`, and `scope_fingerprint` fields are coordination references, not cycle ownership, history, resume permission, evaluation evidence, or approval. Cycle operations do not create a pending action or infer its operation. When an existing pending action links the active cycle, a successful coordinated transition synchronizes those references to the cycle's recovery position. Pending action alone never authorizes a manuscript write, publication, restore, or cycle completion.

## Coordinated cycle recovery

Living active-cycle and manifest JSON uses a verified temporary sibling, atomic rename, and a final content-hash check. Completed cycles, scope and inventory snapshots, evaluations, approvals, commit journals, backups, and verified execution records remain immutable; recovery never rewrites them to make state agree. `last_completed_cycle` is a manifest pointer to immutable completed history, not a stored flag for current-draft revision convergence.

A dependent operation records `cycle_operation` in the manifest before changing cycle state. It contains the operation `kind`, exact `operation_id`, cycle ID, expected and intended revisions, an optional artifact ID, and its creation time. The recovery position carries the same operation ID. The write order is:

1. Write manifest `cycle_operation` through a verified atomic replacement.
2. Publish the immutable evaluation, reconciliation, or execution record when the operation has one. Creation manuscript publication and its journal instead follow the creation-state protocol before cycle linking.
3. Replace the active cycle with its intended revision and operation ID.
4. Write the final manifest, removing `cycle_operation`, synchronizing an already linked pending action, and updating the manuscript-reconciliation pointer when applicable.

Completion instead writes `cycle_operation`, records the explicit completion decision, publishes the post-decision evaluation, publishes completed history, writes `last_completed_cycle` and the final manifest, and only then removes the active record after verifying its expected bytes. These are coordinated recoverable writes, not a multi-file filesystem transaction. An interruption before or after any of these writes leaves a diagnosable intermediate state. Dependent work returns `cycle-reconciliation-required` or a more specific cycle, revision, pending, scope, operation-ID, artifact-path, or artifact-hash blocker. Read-only status remains available and reports `indeterminate` instead of treating an old evaluation as current.

Run the public operation without an input for diagnosis only:

```bash
node <toolkit-root>/scripts/author-project.mjs reconcile-cycle --project-root <project-root>
node <toolkit-root>/scripts/author-project.mjs reconcile-cycle --project-root <project-root> --input <direction.json>
```

Without `direction`, the operation rechecks the manifest, active and completed cycles, linked pending references, referenced artifact identities and hashes, and lock owner without writing any file. It returns `diagnostic_only: true`, `state_written: false`, the interrupted operation when present, and concrete blockers. A direction is an explicit author choice of recovery metadata; it is not manuscript, publication, restore, or completion approval. Directions that change cycle or manifest state acquire the same active-cycle lock and reconfirm the diagnosed bytes before writing. Directions that resume a public operation reuse that operation's lock and full validation.

Use exactly one applicable direction with `cycle_id` and `operation_id`:

| Direction | Recovery behavior |
| --- | --- |
| `discard-interrupted-operation` | Clear only the recorded intent while the active cycle is still at its expected revision and removing that intent would leave consistent state. If an artifact identity/hash, pending, reconciliation, or completed-pointer contradiction remains, return `valid: false`, preserve `cycle_operation` and every historical byte, and expose `available_directions` such as `resume-revision-execution`. Never discard the only usable recovery handle or roll back a verified execution. |
| `accept-active-cycle` | Accept an active cycle already at the intended revision with the same operation ID, then finish its manifest and pending coordination. Without `cycle_operation`, this is also the explicit way to accept the current recovery position for a pending or manuscript-reconciliation mismatch; every active artifact must first match its path, hash, and internal identity. |
| `attach-interrupted-evaluation` | Recompute and attach an already published evaluation whose cycle, pass, target, outcome, and evidence graph are current, then finish manifest coordination. Do not rewrite the evaluation. |
| `resume-revision-execution` | Reuse the recorded prepared or verified execution, rerun preparation or actual-output verification, and link it to the same cycle. Verified bytes and backups are not rewritten. |
| `resume-creation-publication` | Read the named existing commit and batch, then run the normal creation-publication transition against current approvals, journal transitions, and confirmed scope. This writes no manuscript and cannot derive approval from pending action. |
| `resume-manuscript-reconciliation` | Revalidate and reuse the named immutable manuscript reconciliation, then complete the same cycle and manifest pointer through the existing event-chain rules. |
| `resume-completion` | Resume the same unfinished completion decision and evaluation ID. Reuse an already published current evaluation instead of creating a different record with a new timestamp. |
| `finish-completion` | When completed history and active state coexist, reverify the post-decision satisfied evaluation and completion decision, write the completed pointer and final manifest, then remove only the expected active bytes. |
| `repair-completed-pointer` | When the manifest pointer has the wrong path or metadata but the expected completed file retains the exact recorded bytes, reverify its satisfied post-decision evaluation and repair only the pointer. A completed-history hash mismatch remains blocked; never rehash or relabel altered history. |

The completed-cycle pointer is checked before dependent starts, transitions, execution, evaluation, external reconciliation, and status or gate queries. Its path, SHA-256, cycle ID, and revision must match the immutable history. `repair-completed-pointer` uses the completed target evaluation ID as `operation_id`.

`release-stale-lock` is separate and requires `lock_owner: {pid, token}` exactly as recorded in `owner.json`. Diagnosis reports whether that PID is running. Recovery refuses a running owner, malformed owner, changed token, unexpected directory contents, or an unverifiable lock; it never steals a lock silently. A verified abandoned lock may be removed without changing cycle or manuscript state. `cycle-recovery-state-changed` means another writer changed state after diagnosis and requires a fresh diagnosis.

For independent read-only checks, use:

```bash
node <toolkit-root>/scripts/validate.mjs --convergence-status <manifest-path>
node <toolkit-root>/scripts/validate.mjs --convergence-gate <manifest-path>
```

Convergence status exits successfully when the query itself is valid, including an `indeterminate` outcome. Convergence gate exits nonzero for `not_satisfied`, `indeterminate`, stale evidence, or malformed state. Usage errors retain the validator's exit status 2. Both commands are read-only. Evaluation and completion require their dedicated evidence operations; `transition-cycle` never substitutes for them.

## External manuscript reconciliation

Before manuscript-changing `check-operation`, `start-cycle`, `transition-cycle`, and revision preparation, compare the active or manifest scope's immutable inventory with current disk state. A created, modified, deleted, or retained-path reordered file returns `external-reconciliation-required` with `write-fiction` `creation-import` as the required action and does not write cycle or execution state. Confirmed reading-order changes are compared through the new manifest scope and active target; directory traversal order alone does not invent a reorder. Pure insertion does not change retained relative order. Evaluation remains a diagnostic operation: it reports the external-change blocker together with target, execution, and evidence failures instead of refreshing the scope or producing a satisfied result.

Run the public operation after the author has approved the actual external text and proposed story-state differences:

```bash
node <toolkit-root>/scripts/author-project.mjs reconcile-manuscript --project-root <project-root> --input <reconciliation.json>
node <toolkit-root>/scripts/validate.mjs --manuscript-reconciliation <reconciliation.json>
```

The closed input names `reconciliation_id`, `author_decision_id`, `target_scope`, and hashed `story_state` references. An active reconciliation also names its `cycle_id` and `expected_revision`; without an active cycle, it names `previous_scope` and creates no cycle. The field is mandatory for every cycle-external reconciliation, including recovery from empty. It may be explicitly null only when the latest verified reconciliation has a null target, in which case `recovery_from_empty` is required. Omitting the field is a usage error before any reconciliation or manifest write; an empty manifest pointer never makes omission valid. A nonempty target must be manifest `current_scope`, pass full-manuscript validation, and have a snapshot author-confirmation decision equal to the import decision. A null target requires actual empty inventory and creates an immutable empty inventory snapshot, not an empty scope. The manifest's optional `manuscript_reconciliation` points to the latest immutable record beneath `reconciliations/`.

The tracker decision must be a current approved `creation-import` row for operation `creation-import`. Its paths equal the complete ordered target paths, or the deleted previous paths for an empty target, and its scope ID equals the target or previous scope as applicable. Its reason contains whitespace-separated `reconciliation_id=<id>`, `inventory_fingerprint=<fingerprint>`, and `scope_fingerprint=<fingerprint>` tokens; an empty target uses `scope_fingerprint=null`. The snapshot confirmation, inventory evidence, decision, and actual bytes must agree. A caller `confirm: true`, `author_confirmed: true`, replacement change set, or new scope hash alone cannot authorize reconciliation.

Story state is checked as real Markdown artifacts. For a nonempty target, chapter records bind every current manuscript path and hash to the target scope, and the current record references those reconciled chapters. For an empty target, one current record has `scope_id: null`, no chapter children, and preserved non-manuscript sources such as Story Bible intent. Missing or stale story-state evidence blocks the operation. The command writes no manuscript and creates no author decision. An approved restore must first complete the existing independent restore approval and safety-backup procedure; reconciliation never substitutes for it.

During an active cycle, the operation derives the cumulative change set from the preserved starting snapshot and updates the same cycle's target, work set, requested-pass and target-evaluation recovery state, current strategy, and exact recovery position. It never changes the starting scope or starting evaluation references and never opens a parallel cycle. Without an active cycle, it returns `cycle: null`; a later `start-cycle` can use a matching reconciliation with a provable satisfied previous scope to join that previous starting scope to the confirmed target. An unrelated or malformed reconciliation cannot open this entry shortcut.

The record preserves `previous_evaluation`, `proof_blockers`, `invalidated_evaluations`, and `invalidated_coverage`. Use `revise-increment` only when the previous full-manuscript scope's satisfied evaluation and required evidence remain provable. Changed manuscript bytes and the append-only author-decision log do not erase that historical role, but damaged scope, report, coverage, review, execution, or attestation evidence makes it unproven. That outcome is `indeterminate` with `previous-evaluation-unproven`; use full-manuscript `revise-draft`. An unreadable or hash-mismatched starting snapshot stops reconciliation with `starting-scope-indeterminate` and no state write. Historical artifacts are never relabeled or rewritten.

An empty target is `not_satisfied` with `empty-manuscript`, blocks completion, and routes to another approved nonempty restore or import. Nonempty recovery from that empty state always requires full-manuscript `revise-draft`, even when an older satisfied starting evaluation remains intact. The latest reconciliation, its inventory, and current story-state hashes join subsequent evaluation evidence graphs. Older reconciliations remain immutable history and do not impose their old targets or superseded living story-state bytes on the new evaluation. Changed external text also leaves affected old evaluations, full-target indexes and syntheses, and local coverage units stale for the new target; unchanged eligible local units remain reusable only under the normal identity rules.

Throughout an active bootstrap, every cumulative change set keeps `from_scope: null` for the null starting origin. Reconciliation previous scopes and execution input scopes form one ordered event chain: every event's previous or input identity must equal the preceding event's target or output identity, every recorded event must be used exactly once, and the final target must equal current scope. A real creation commit is also a scope event. Its `scope_before_id` matches the starting scope or null bootstrap origin, and its `scope_after_id` resolves only to a candidate snapshot that passes the existing batch, journal, approval, dependency-fingerprint, reading-order, and verified create/modify/delete/reorder checks through `deriveCreationChangeSet`. Missing commits and unmatched output scopes cannot close the chain. Evaluation derives the chain from verified scope identities rather than trusting an order field or assuming all reconciliations precede executions. It checks every target snapshot and inventory hash, cumulative change set, and exact import decision, while retaining the existing execution approval, backup, output, and stale-evidence checks.

Import→import, import→edit, edit→import, and repeated interleavings are valid when those identities connect. Empty reconciliation is also a valid intermediate event with a null target and a recovery-position wait for nonempty import or restore; it is never a satisfied or completed target. A following `recovery_from_empty` event must have a null previous scope, a nonempty target, and `revise-draft` as its required strategy. Other events need not all use that strategy. A missing execution link, skipped empty predecessor, inconsistent cumulative origin, or forged reconciliation or execution target returns `reconciliation-chain-mismatch`, `reconciliation-target-mismatch`, or the applicable execution blocker and cannot satisfy or complete.

## No-edit convergence evaluation and completion

Use the deployed `requested-pass-schema.json`, `no-edit-skip-schema.json`, `review-group-schema.json`, `semantic-attestation-schema.json`, and `convergence-evaluation-schema.json` for the first full-manuscript no-edit path. Preserve passes beneath `passes/`, no-edit skips beneath `no-edit-skips/`, review groups beneath `review-groups/`, attestations beneath `attestations/`, and evaluations beneath `evaluations/` in the convergence state root. These artifacts are immutable after publication.

A requested pass records its target scope reference, required operations and paths, BCP 47 language, subchecks, versioned dependencies, inapplicability reasons, narrowing decision and gaps, baseline pass, newly requested subchecks, and creation time. Compute its fingerprint as SHA-256 over UTF-8 `JSON.stringify` of an object with keys in this order: `target_scope` containing only `scope_id` and `scope_fingerprint`, `required_operations`, `paths`, `language`, `dependencies`, `inapplicability`, `narrowing` containing only `reason` and `gaps` or null, `baseline_pass` containing only `pass_id` and `pass_fingerprint` or null, and `requested_subchecks` containing only `operation` and `subcheck`. Preserve the recorded array order. Pass ID, snapshot locations, decision IDs, and timestamps are excluded.

The baseline is the latest satisfied, unrestricted full-manuscript pass preserved in completed history or independent `revise-draft` evaluations, excluding the cycle or independent evaluation being evaluated. Every inherited operation and subcheck remains required. Newly requested checks have explicit author decision IDs and extend that baseline; they cannot remove or relabel an inherited check. A later narrowed requested pass never supplies or reduces this baseline. Eligible local coverage units keep their original scope and pass provenance. Their source reports may belong to an earlier pass only when the source hash, operation, paths and hashes, requested subchecks, and dependencies all match; compose a new full-target index and synthesis for the requested pass.

A no-edit skip binds `revision-plan` and `chapter-revision` to the pass and target fingerprint, covered finding IDs, explicit author decision, and reason. Verify the decision in the shared tracker. Deferred and dismissed findings remain valid when their decisions are current and covered; open findings are `not_satisfied`, and resolved findings need verified revision execution evidence rather than a no-edit claim. An empty manuscript or missing evidence never becomes satisfied.

A review group binds intent, standards, and fresh jobs, their reader states, every chunk and applicable synthesis report, and the fresh logical-reviewer attestation to one pass and target fingerprint. Each job must validate complete full-target coverage against actual source hashes and line counts. A completed fresh job requires a completed reader state containing every job chunk in the declared order, not merely a continuous prefix. Final review can satisfy current-scope review only under the existing same-scope and same-checks equivalence rule.

Semantic attestations identify the attester, pass and scope fingerprints, claim subject, verdict, statement, referenced artifact hashes, and creation time. Require host `coverage-semantics` and `review-semantics` claims plus the fresh logical reviewer's `fresh-reader-continuity` claim. `confirmed` supports a claim; `refuted` records a known failed condition. Missing, conflicting, or mismatched attestations are `indeterminate`. Attestations never replace tracker decisions, and deterministic validation cannot prove actual reading quality or editorial correctness.

Run the public operations with exact cycle ID and expected revision:

```bash
node <toolkit-root>/scripts/author-project.mjs evaluate-cycle --project-root <project-root> --input <evaluation-request.json>
node <toolkit-root>/scripts/author-project.mjs complete-cycle --project-root <project-root> --input <completion.json>
```

The evaluation request supplies `evaluation_id`, the coverage-index reference, intake and draft-baseline report references, review-group reference, and semantic-attestation references. Evaluation and completion acquire the same `active-cycle.lock/` used for transitions and recheck the expected revision inside the lock. Only one writer can win a revision race. The evaluation request does not accept an outcome: the evaluator derives `satisfied`, `not_satisfied`, or `indeterminate` from current evidence and returns concrete blockers.

For a full-manuscript independent `revise-draft` pass with no active cycle, run:

```bash
node <toolkit-root>/scripts/author-project.mjs evaluate-draft --project-root <project-root> --input <independent-evaluation.json>
```

The independent request supplies `evaluation_id`, requested-pass and target-scope references, the same evidence roots, and the no-edit-skip and verified revision-execution references that a cycle would otherwise link. It uses the same evaluator and immutable `evaluations/` storage without creating an active cycle. `cycle_id` is null for an independent `revise-draft` evaluation. The evaluator rereads every execution and rechecks its actual output bytes; a `prepared` record or caller-supplied `verified` claim alone is insufficient. An active cycle rejects this operation with `active-cycle-exists`; recovery must use `evaluate-cycle` and link that cycle instead. A narrowed independent pass records `not_satisfied` and does not supply or reduce the satisfied baseline. A current satisfied independent evaluation supports status, gate, and later starting-evaluation checks without a cycle completion decision; `complete-cycle` remains exclusive to an active cycle.

Before reading target evidence, compare the target reference's `scope_id`, `scope_fingerprint`, `snapshot_path`, and `snapshot_sha256` with manifest `current_scope`. Any difference returns `target-scope-identity-mismatch` as `indeterminate`, fails status currency and the gate, and blocks evaluation or completion even when manuscript line counts are unchanged. This current-target check does not rewrite historical baseline evidence; ordinary starts separately revalidate their current starting snapshot and satisfied evaluation before later manuscript work makes that snapshot historical.

Every evaluation records its complete evidence graph: target and inventory snapshots, requested and baseline passes, manuscript and dependency versions, tracker, reports, coverage index and units, no-edit skips, review group, jobs, reader states, attestations, and baseline evaluation when applicable. Creation-originated cycles also include their preserved starting scope, inventory and starting evaluation when present, plus the linked creation batch and commit journal; bootstrap preserves the null starting scope instead of inventing a snapshot. Historical no-edit skips stay in this graph, but only skips matching the evaluated pass and target fingerprint participate in current no-edit decisions; accepted review rework instead requires its verified revision execution. Each entry records role, artifact identity, safe project-relative path, and SHA-256. The active cycle, manifest pending fields, and evaluation itself are excluded, preventing a self-hash cycle. Status and gate queries recompute current text, artifact hashes, coverage, decisions, review chains, and claims instead of trusting a stored outcome. A known failed condition is `not_satisfied`; missing, unreadable, changed, or inconsistent proof is `indeterminate`. Both fail the gate.

The completion input supplies a new `evaluation_id`, `decision_id`, and `author_confirmed: true`. Completion uses this exact order:

1. Recompute the current target evaluation and reject completion if it is not current and satisfied. Author confirmation cannot override `not_satisfied`, `indeterminate`, or stale evidence.
2. Append the explicit decision to the tracker's `## Cycle completions` table with its cycle ID, target fingerprint, approved status, reason, and UTC time. Older trackers without this optional table remain valid; the operation adds it before `## Open questions` when needed.
3. Recompute and publish a new immutable evaluation using the changed tracker hash. Never exclude the tracker hash, accept the pre-decision evaluation, or add the evaluation's own hash to its graph.
4. Only when the new evaluation is satisfied, publish the completed cycle with the new evaluation and decision IDs, write `last_completed_cycle` and the final manifest, and then remove the expected active bytes. Preserve the prior evaluation and every referenced artifact. A non-satisfied post-decision evaluation leaves the cycle active and retains the recorded decision as history.

These coordinated writes do not claim a multi-file filesystem transaction. A leftover lock, identity mismatch, or partially coordinated state stops dependent work and uses the explicit `reconcile-cycle` directions above. Read-only status remains available.

Validate the artifacts through the public CLI:

```bash
node <toolkit-root>/scripts/validate.mjs --requested-pass <pass.json>
node <toolkit-root>/scripts/validate.mjs --no-edit-skip <skip.json>
node <toolkit-root>/scripts/validate.mjs --review-group <review-group.json>
node <toolkit-root>/scripts/validate.mjs --semantic-attestation <attestation.json>
node <toolkit-root>/scripts/validate.mjs --convergence-evaluation <evaluation.json>
```

## Revision execution and request completion

Use the deployed closed `revision-execution-schema.json` for approved manuscript revision batches. Preserve execution records beneath `executions/<execution-id>.json` in the convergence state root. A record binds its cycle or independent draft context, plan, exact batch, requested pass, input and target scope snapshots, finding dispositions and decisions, edit approvals, backup manifests and preserved bytes, every file action and input/output hash, `prepared` or `verified` status, and timestamps. Cycle-bound records carry their cycle ID; independent `revise-draft` records use `cycle_id: null`. Create actions require a null input hash and expected absence; delete actions require a null output hash. Every modify, delete, or reorder action requires preserved input bytes.

Run the public operations with exact cycle ID and expected revision:

```bash
node <toolkit-root>/scripts/author-project.mjs prepare-revision-execution --project-root <project-root> --input <preparation.json>
node <toolkit-root>/scripts/author-project.mjs verify-revision-execution --project-root <project-root> --input <verification.json>
node <toolkit-root>/scripts/validate.mjs --revision-execution <execution.json>
```

Preparation requires the active `chapter-revision` recovery position, the active requested pass and full-manuscript input scope, an existing exact author plan decision and chapter-revision approval, and every required backup. It validates tracker decisions and approval paths, backup manifest identity and raw backup hashes, referenced plan and batch hashes, and current input hashes. It writes only a `prepared` execution and its cycle reference. It does not create an author decision or approval, write manuscript, infer a backup, or mark execution complete.

After the approved write, confirm the full-manuscript target scope and requested pass. Verification accepts only the execution ID, final pass, and final target beyond the cycle identity and expected revision; it does not accept replacement output hashes from the caller. It rereads every current output and compares it with the prepared record, verifies the approved change set against input and target snapshots, then writes `verified` and links the new pass, target, execution hash, cumulative change set, and full-target current-scope review recovery position to the cycle. Bootstrap keeps the cumulative change set's `from_scope` null and derives every current target file from that empty starting point rather than replacing first publication with the edit's input scope. Missing, changed, extra, or unrecorded output stops verification without advancing the cycle. `approved-edit-unexecuted` is `not_satisfied`; changed or inconsistent output proof is `indeterminate` unless another known failed condition takes precedence.

Both operations acquire the same `active-cycle.lock/` used by transitions and evaluations and recheck the expected cycle revision inside the lock. A revision race returns `cycle-revision-conflict` without overwriting the winner. Verified execution is immutable thereafter. Later approved batches preserve earlier executions, their approvals, and their input/output scopes as history; only executions bound to the current requested pass and full-manuscript target satisfy current accepted findings. Superseding a later approval does not rewrite or invalidate the historical execution it approved.

For independent `revise-draft` edits with no active cycle, use:

```bash
node <toolkit-root>/scripts/author-project.mjs prepare-draft-revision-execution --project-root <project-root> --input <independent-preparation.json>
node <toolkit-root>/scripts/author-project.mjs verify-draft-revision-execution --project-root <project-root> --input <independent-verification.json>
```

The independent preparation has the same plan, batch, pass, input scope, finding, decision, approval, backup, file action, and hash fields as cycle preparation, but accepts no cycle ID or expected revision. It acquires the same lock, rejects any active cycle with `active-cycle-exists`, rechecks current inputs, and publishes one `prepared` record with `cycle_id: null` through no-clobber creation. A duplicate ID returns `revision-execution-already-exists` without replacement. Independent verification accepts only the execution ID, final pass, and final target, requires the stored independent `prepared` record, and rereads actual output bytes against the approved output and full-manuscript target. Output mismatch returns `revision-output-mismatch` with `state_written: false` and preserves the prepared record; repeated verification returns `revision-execution-identity-mismatch`. Supply the resulting reference through `revision_executions` to `evaluate-draft`, which repeats the contract and disk checks instead of trusting a claimed status. An active cycle always uses the cycle-bound operations and never this independent path.

Every resolved finding maps to a current verified execution whose finding disposition is `execute`. Deferred and dismissed findings retain their current decisions. With no edited batch, the no-edit skip rules above remain required; a no-edit skip cannot substitute for a resolved finding or conceal a prepared approved execution. Review findings use the same decision and execution loop. Accepted fixes produce new affected coverage and another full-target current-scope review group before evaluation can become satisfied.

`cycle-status`, `convergence-status`, and validator status return `request_completion` separately from the convergence evaluation. Its `complete` status means every approved request batch and request decision is finished through current verified executions or lawful no-edit decisions. `incomplete` names open findings, prepared executions, missing decisions, or changed current outputs. Request completion can therefore be `complete` while current-draft revision convergence remains `indeterminate` pending coverage or review, and it never substitutes for a satisfied target evaluation or the explicit cycle completion decision.

## Set pending

Read the manifest immediately before each write. Write the requested `pending_action` values: `operation`, `status`, `scope_id`, `reason`, and `artifacts`. When the work is already linked to an active cycle, also record its `cycle_id`, `cycle_revision`, `operation_id`, and `scope_fingerprint` as coordination references. Status is `in_progress`, `awaiting_author`, or `blocked`; reason is always nonempty and identifies the decision, interruption, or dependency. Preserve `current_scope` and all historical records. Append unique artifact paths and set both `pending_action.updated_at` and top-level `updated_at` to the current UTC timestamp. These references never authorize a write or completion.

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
