# Shared evidence, findings, approvals, and state

Use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared names, contract values, and their boundaries.

## Report envelope

Use `<setup-skill-root>/assets/references/report-schema-v2.json` as the authoritative envelope contract and resolve its reference to `finding-schema-v2.json`. Read both schemas before writing. Do not infer v2 from the legacy `finding-schema.json`.

Write each report beneath the registered shared `reports/` path using an operation directory and a unique UTC-stamped filename. Include human-readable context, a `Language coverage` heading, and exactly one fenced `json` block containing one report v2 object.

Populate the actual v2 fields:

- `skill.name` and `skill.version` identify the executing skill; use its declared version or `unversioned`.
- `stage` identifies the operation, not the orchestration skill that invoked it. Valid project operations are `intake`, `story-bible`, `draft-baseline`, `structure`, `characters`, `diagnostics`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, `current-scope-review`, and `final-review`.
- `language` is the BCP 47 tag of the evaluated text. Split reports when one tag cannot describe mixed coverage truthfully.
- `inputs` lists every manuscript, baseline, plan, or prior-report input with its available content hash or other truthful version. Current v3 manuscript scopes require SHA-256 hashes.
- `engine.name` is exactly `conversational` or `scriptorium`. Record the actual version or `unknown`, a truthful `degraded` boolean, and detailed notes containing the execution path, fallback, context profile, mode, and degradation.
- `engine.notes` also contains `scope_id=<id>` and `operation_coverage=full|partial|skipped`. For `characters`, `diagnostics`, and `current-scope-review`, add `subchecks=` followed by the actual checks covered. For new `current-scope-review` reports, add `review_mode=current-scope|request`; historical reports without that field retain current-scope semantics. Operation coverage is distinct from language coverage.
- Under `Language coverage`, mark each requested rule or category `full`, `partial`, or `skipped` with a reason. Repeat the concise language summary in `engine.notes`.
- Every finding has an uppercase audit-specific ID prefix and at least three digits, a nonempty `recommendation`, and the narrowest truthful `location.scope`. Do not invent a line or quotation for a broad issue.

Use `confidence: "judgment"` for editorial interpretation and `deterministic` only for direct code-detected evidence. Finding status is tracker state and is not a finding v2 property.

Run `node <setup-skill-root>/scripts/validate.mjs --report <report-path>` and retain the result in the session note. Use `validateEvidenceReport` for v3 evidence-semantic checks. If the payload does not conform, record the operation as `blocked`; never emit a legacy payload as a substitute.

Historical reports are immutable. Author decisions, stale marks, later locations, and rerun results go into the living tracker and new reports.

## Finding identity across reruns

Read the latest prior reports for the same operation, audit, and scope before assigning IDs. Reuse an existing ID for the same underlying issue. Match by upstream stable ID, then by the same audit, technique, file, normalized quotation and issue, then by clearly overlapping location after nearby text changed. Allocate a fresh ID for a different issue and link any possible predecessor in tracker notes. Before dispatching new findings, run `author-project` with `next-finding-id` for the complete planned batch and supply its returned ID block to the callee; do not restart each reviewer or chunk at `001` or use fixed review-pass number blocks.

A finding absent from an equivalent complete rerun becomes `stale`, not `resolved`, unless the author confirmed and the new text verifies the fix. New findings enter as `open`.

## Review brief and decision reuse

Before processing shared review findings, generate or refresh `<paths.reports>/review_brief.md` from the current tracker. This review brief is a disposable navigation summary, not an immutable report or another authority. It has exactly these sections:

```md
# Review Brief

- Updated: <UTC timestamp>
- Tracker: <project-relative tracker path>

## Resolved decisions

| Finding ID | Location | Decision reason | Current report |
|---|---|---|---|

## Dismissed decisions

| Finding ID | Location | Decision reason | Current report |
|---|---|---|---|
```

Include every tracker row whose status is `resolved` or `dismissed`; copy its actual location, decision reason, and report path without expanding it into a full finding or manuscript excerpt. If neither status has any rows, state `No resolved or dismissed findings.` beneath both headings instead of inventing decisions. Refresh the brief after relevant tracker changes and validate it with `node <setup-skill-root>/scripts/validate.mjs --review-brief <path> --tracker <tracker-path>`. The tracker remains authoritative; rebuild a missing or inconsistent brief rather than treating its contents as approval.

Match each new review observation using the Finding identity rules above before presenting an author decision. For the same underlying issue, reuse its existing ID and point the current report at the new immutable report. Keep a `resolved` or `dismissed` status and its original reason; do not put the observation back into the decision queue merely because a reviewer reports it again. Record the decision reuse in the session note. An unrelated wording change or a new report alone is not new evidence.

Reopen the finding as `open` only when the relevant quoted passage or location, a fact or dependency on which the decision relied, or the underlying issue has materially changed. Name that concrete change and the prior decision when asking for a new decision. A genuinely different issue receives a new ID. Reviewers, including the fresh reader, do not receive this brief; decision reconciliation happens after their independent observations are returned.

## Living tracker

After reconciling new observations with prior findings and decisions, run `author-project` with `record-findings` and the complete report set to batch upsert finding rows through the installed CLI. Do not hand-write batches of tracker rows. New IDs enter as `open`; a reused ID retains its status, author reason, and updated timestamp while its location and current report pointer change. Preserve historical reports and refresh the review brief when applicable. The CLI rejects duplicate report IDs and conflicting identities but does not replace semantic identity reconciliation.

Use only these finding statuses:

| Status | Meaning |
|---|---|
| `open` | A current finding awaits an author decision or verified resolution |
| `resolved` | The author accepted a resolution and current evidence verifies it |
| `deferred` | The author chose to address it later; record the consequence |
| `dismissed` | The author judged it inapplicable or intentional; record the reason |
| `stale` | Its input or scope changed, or an equivalent rerun no longer observes it without verified resolution |

For each status change, update the tracker row with UTC time, current report path, and reason. Keep historical report paths in the audit-run table. Unknown future plot, an unwritten ending, and other open creative choices belong in baseline open questions; they become findings only when they cause a concrete problem in existing text.

## Author decision loop

Use this loop at every author gate, including scope, baseline, creative choices, finding dispositions, plan approvals, manuscript edits, restores, and overrides.

1. Present the completed inventory or report as context, then choose one active decision by dependency and impact. A coherent scope or edit batch is one decision; unrelated questions need separate turns. A findings table supplies context while only the selected row is active.
2. Show the active item's evidence, recommendation, and main tradeoff. End with one question. Keep other items queued without turning them into additional questions.
3. When the author asks questions, disputes evidence, or explores alternatives, stay with the active item and refine the proposal. Only an explicit author decision closes the active item; discussion alone does not advance the queue or approve work.
4. Record the explicit decision, recheck dependencies, then present the next single item. Keep unresolved findings `open` and the operation `awaiting_author`. Put the active item and remaining queue in `pending_action.reason` and the session note so resume returns to the same item.
5. When the required decisions are complete, finish the gate and name the next operation. The existing operation-transition gates still apply.

Ask only for choices needed now. Keep nonblocking unknowns labeled as unknown instead of turning them into decision requests.

The author may select a different active item, explicitly request batch handling, or supply several decisions at once. Record each exact decision and its scope. Otherwise, each assistant turn has one active decision. Accepting a finding does not authorize a manuscript edit.

## Author approvals

Use the shared `## Approvals` table for edit, restore, plan, baseline, story-bible, scope, prose-override, and prose-risk decisions. Record `Approval ID`, `Type`, `Operation`, `Scope ID`, `Paths`, `Status`, `Reason`, and `Updated`. Approval IDs use an uppercase prefix and at least three digits. Status is `approved`, `deferred`, `cancelled`, or `superseded`. Only `edit` and `restore` approvals authorize writes and receive execution evidence. Plan, baseline, story-bible, scope, and override approvals record decisions; they do not authorize a write or supply a write backup identity.

Plan approval selects intended work. Before each write, obtain a separate `edit` approval for its actual operation, exact paths, actions, and input versions. Use the operation that owns the write, such as `chapter-revision`, `draft-baseline`, or `story-bible`, rather than `revision-plan`; one plan does not combine later writes under its approval ID. Keep a plan's approved file scope and its exact write batches distinct. Link every write backup record to its `edit` approval ID. A structural or input change supersedes an affected override; record the supersession rather than deleting history. Legacy v2 overrides remain `deferred` until the author confirms them on resume.

After approval and backup, run `author-project` with `complete-write` to publish exact approved content and generate its evidence-linked execution receipt in one invocation. Keep the approval status `approved`; the execution receipt proves completion. A completed restoration record supplies the corresponding evidence for a restore approval. A backup or safety backup alone proves only pre-write preservation.

## Scope and input currency

A scope records its ID, description, `proposed` or `confirmed` status, ordered file paths and SHA-256 hashes, exclusions, and creation time. Reports, findings, plan batches, approvals, and reviews reference the applicable `scope_id`.

Only the author can confirm a new scope or expand an existing one. New chapters do not silently extend old reports. Reuse unchanged evidence by its actual operation and input versions, and create new coverage for added or affected text. Before every manuscript write, recompute the hashes; if they differ, stop and reconcile the scope and stale evidence instead of overwriting newer work.

## Stale propagation

Apply stale state to the smallest affected dependency set. Keep old reports readable as historical evidence.

| Change | Evidence to mark stale |
|---|---|
| Sentence wording, punctuation, or formatting with no fact or structural change | Prose and AI-cleanup results for the affected text, plus reviews covering that text |
| Copy edits to a baseline or plan with no meaning change | Reviews that used the edited artifact; earlier craft audits remain current |
| Plot event, beat order, chapter order, ending, POV strategy, or other structural fact | Structure and diagnostics, revision plan, affected chapter revision and downstream prose/AI results, reviews, and affected character evidence |
| Character want, need, wound, lie, arc, relationship, voice rule, knowledge state, timeline fact, or world rule | Characters, revision plan, affected chapter revision and downstream prose/AI results, reviews, and structural evidence when a beat changes |
| Manuscript files added, removed, replaced, or reordered | Intake and every audit whose scope or reading order changed, plus affected reviews |
| Approved plan action or priority change | Affected unexecuted batches and downstream results, plus reviews that used the plan |

Record each stale reason with the changed path and decision or edit batch. Old evidence keeps its original scope; it never expands silently.

## Evidence reuse across skills

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` share this evidence at stable operation gates. Switching requires the author's exact command and does not reset state or resume pending writes. Reuse evidence by operation, scope, input versions, subchecks, and dependency state rather than by report title. Creation evidence does not satisfy `chapter-revision`, and creation operations remain outside report v2 `stage`.

- Story Bible can supply facts to draft-baseline and creation planning, but the current manuscript still needs its requested coverage. Draft-baseline with unknown foundation fields cannot satisfy Story Bible.
- Full-book structure can supply local leads, but does not replace scene-level diagnostics. Local diagnostics cannot satisfy full-book landmark coverage.
- Character reports reuse only the subchecks actually covered. Continuity with the same scope and inputs can transfer directly; current-arc-only evidence is partial for a full-arc gate.
- Revision plans, chapter revisions, prose, and AI cleanup transfer when their operations, scopes, inputs, approvals, and coverage match. Creation batches and milestone evidence retain their own operation identity.
- Final review can satisfy current-scope review when it covers the same scope and checks. Current-scope review and milestone review never satisfy final review.

## Coverage units and synthesis

Store reusable coverage units and the living coverage index beneath the registered `paths.reports` directory, using the installed artifact contracts. A coverage unit records its source report, operation, original scope, exact paths and hashes, subchecks, dependencies, and actual coverage. Reuse only a full local coverage unit whose source-report identity, operation, paths and hashes, requested subchecks, and dependencies all match. Its original scope remains unchanged for provenance; a composed coverage index and new synthesis use the target scope. Partial, skipped, or stale coverage units and synthesis units are not reusable.

A changed input invalidates only affected local units and their dependents; unrelated unchanged units can remain current. Reevaluate every applicable volume, phase, current-scope, or whole-book synthesis whenever its text, membership, reading order, dependencies, or child coverage changes. Record a new synthesis report for the current inputs. Never extend an old whole-book synthesis to a new scope because its local units still match.

Chunk reports and their syntheses retain report v2 and finding v2. Creation operations remain outside report v2 `stage`; their batches, commit journals, story state, review jobs, and reader state use their own artifact contracts rather than masquerading as revision evidence. Review jobs and fresh-reader continuity also require their own same-scope evidence. Composed local units from another scope never replace actual reading of the target scope or an unbroken fresh reviewer chain.

## Current-draft revision convergence

For a confirmed target scope, the target scope has reached current-draft revision convergence only when all of these conditions hold after the latest manuscript change:

- Intake and draft-baseline identify the target scope's current ordered paths, hashes, exclusions, and labeled facts and unknowns.
- Diagnostics, characters, prose, and AI cleanup have current full local coverage units for every target-scope path and each subcheck applicable to its language and the requested pass, with a composed coverage index and new full-target synthesis for every affected operation. Unchanged local units may come from a previous scope only under the reuse rules above.
- Revision-plan and chapter-revision cover every accepted finding through an executed approved batch, an explicit deferral, or the recorded no-edit skip for the requested pass.
- Every current finding has an author decision. Deferred and dismissed findings remain visible; no open finding, stale required evidence, missing synthesis, or approved but unexecuted edit remains.
- The full-target current-scope review completes intent, standards, and fresh-reader coverage over the same target scope after the latest edits, including every required unit and applicable synthesis. Its findings have entered the same decision and, when accepted, revision loop.

Partial, skipped, or degraded requested applicable coverage prevents current-draft revision convergence unless the author explicitly narrows the requested pass; identify that narrowed requested pass and its gaps instead. Inapplicable whole-book or language-specific checks may remain explicitly `skipped` with their reasons; a skipped coverage unit cannot be reused as a full local coverage unit. A completed creation batch, chapter review, or diagnostic pass alone does not establish current-draft revision convergence. Recompute this state from current evidence at each resume rather than storing a standalone flag for this state.

Use `author-project status` with the target scope ID and `--require-execution` for the mechanical execution check every time the strategy determines or claims this state, including at a final gate and on resume. Run it with the previous scope ID before entering `revise-increment` and with the base scope ID before entering `revise-request`. Every approved edit or restore approval in that scope must have execution evidence; any `unverified` result prevents current-draft revision convergence, while an unrelated historical scope does not. A legacy approval without a reconciled receipt remains unverified rather than being inferred as executed from its backup.

On a nonzero strict result, do not claim the state, enter a strategy that requires it, or rely on a recorded statement of current-draft revision convergence. Record the affected operation as `blocked` with the selected scope, unverified approval count, and failed command, and report the strict execution failure separately from other evidence conditions. Preserve each approval as `approved` and `unverified`; neither an ordinary status success nor a `current-scope-review` operation establishes current-draft revision convergence. Run `preflight.mjs --project-root <project-root> --scope-id <scope-id> --diagnose --json` once to audit recovery without writing. Its `execution_recovery` result discovers project-local JSON evidence, previews reconciliation through the same validation as `reconcile-executions`, and separates reconcilable approvals from unsupported unverified approvals. Reconcile a legacy receipt only from preserved post-write evidence that establishes the exact completed batch and output hashes; keep unsupported approvals unverified. The audit establishes neither execution completion nor the other conditions of that state.

If `reconcilable_count` is positive, preview and apply those named evidence files through `reconcile-executions`, then repeat strict status and the remaining conditions of that state. If it is zero and unverified approvals remain, stop repeating reconciliation. Present one author decision: locate additional preserved post-write evidence and rerun the audit, or end recovery for that scope with current-draft revision convergence explicitly not established. Record the decision and audit counts in the pending action and session, retaining `blocked` while no author decision is active and `awaiting_author` while the decision is open. A new scope, baseline, revision pass, request, or narrowed pass does not remove or waive this historical execution blocker; preserve every approval and the project-wide backup gate. An active increment's or request's own approved edits may stale its verified previous or base scope without rerunning that historical entry gate, but every new target-scope check for that state still requires strict status.

## Pending actions and session writes

The neutral manifest stores only the current scope and an optional shared pending action. A pending action records `operation`, `status`, `scope_id`, `reason`, `artifacts`, optional `artifact_index`, and `updated_at`; status is `in_progress`, `awaiting_author`, or `blocked`. It does not record which orchestration skill created it. Use `author-project set-pending` to retain at most eight inline artifacts and put longer complete lists in the linked pending artifact index. Legacy longer inline lists without an index remain valid.

At each stop, update the manifest through `author-project`, then the tracker and a short session note. Record work performed, author decisions, report and backup paths, open questions, stale propagation, and the exact next action. Follow `author-project`'s navigation-cache contract for session navigation fields and cache refresh. On resume, rederive gates from current evidence rather than treating a pending action as permission to write. Read-only work may continue with an unrelated pending decision; reconcile conflicting writes first.

## Standalone work

Standalone use of underlying skills has no effect on shared project state. Incorporate a standalone artifact only after the author explicitly requests it. Preserve the original output, create a new immutable v2 report when needed, continue finding IDs where identity matches, and record the decision in the shared tracker and session note.
