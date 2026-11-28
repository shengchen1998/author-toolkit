---
name: revise-draft
description: Coordinate an existing manuscript through nine evidence-gated revision operations without requiring a full-book outline, structure, or ending.
disable-model-invocation: true
version: 3.1.0
---

# Revise Draft

Coordinate revision of existing manuscript from the same shared project evidence as `revise-fiction`. This skill mirrors its guided sequence while allowing an unfinished manuscript and undecided future plot. Toolkit skills from one installation are siblings. Resolve `<setup-skill-root>` as `../setup-author-toolkit` relative to this skill's installed directory and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent, display the host command for user-invoked `setup-author-toolkit` and stop. Use the same setup command forms as `revise-fiction`. Setup is identical for all five workflow entries. If the manifest has any schema version other than `3.1.0`, report that it is unsupported and stop without changing it.
2. Read each needed callee's installed `SKILL.md` and applicable references unless the selected procedure below explicitly excludes an entry file. Execute its procedure directly. A user-invoked entry starts only through its author-facing command, never as an internal callee.
3. Run `node <setup-skill-root>/scripts/check.mjs --project-root <project-root> --digest --json --require-sibling author-project --require-sibling revise-fiction` once. Its single JSON result supplies the bounded projection, project validation, ordinary status, and refreshed navigation cache, with installation and entry-file checks included; use this result instead of separate doctor, `read`, `validate`, `status`, or standalone digest-generation calls for this startup. On success, use `projection.schema_version`, `projection.language`, `projection.current_scope`, and `projection.pending_action` for schema, language, scope, and pending-action navigation; this also satisfies step 1's schema-version check without rereading the manifest. If it reports an incomplete toolkit installation, stop and report the missing installed files; do not deploy contracts into the project. If another check fails, rerun it once with `--diagnose` instead of `--digest`, report the failure, and stop at the applicable author gate. Read `PROJECT_STATE.md` first, then read only the tracker sections, sessions, current plan, current scope, pending action, and relevant evidence needed for the requested work. Do not read the full tracker or backup index for routine navigation. For routine navigation, use `PROJECT_STATE.md` pointers, targeted artifact reads, or aggregate counts rather than emitting complete file listings of the registered session or backup directories. Switching from `revise-fiction` preserves the shared project state and changes no scope or status.
4. On the first run for a new scope, follow this first-scope gate:
   - Before scope confirmation, use this bounded first-scope reading route instead of the general whole-reference rule for noncontiguous ranges. For `stage-gates.md`, `operations.md`, and `state-and-findings.md`, read each file's opening rules or shared preamble from its first line through the line before its first level-two heading. For every named section below, locate its heading and section end first, then use parallel bounded line-range reads for exactly these ranges:
     - `references/stage-gates.md`: [Intake](references/stage-gates.md#1-intake) and [Draft baseline](references/stage-gates.md#2-draft-baseline), stopping before `## 3. Diagnostics`.
     - `../author-project/references/operations.md` for `intake-inventory`, `record-scope`, and `set-pending`: [opening project-operation rules](../author-project/references/operations.md#project-operations), [Paths and manifest identity](../author-project/references/operations.md#paths-and-manifest-identity), [Shared scope and evidence](../author-project/references/operations.md#shared-scope-and-evidence), [Intake inventory](../author-project/references/operations.md#intake-inventory), [Record scope](../author-project/references/operations.md#record-scope), and [Set pending](../author-project/references/operations.md#set-pending).
     - `../author-project/references/read-operations.md` for writing the session note before the final cache refresh: [Digest](../author-project/references/read-operations.md#digest) only, following its linked session-note template.
     - `../revise-fiction/references/state-and-findings.md` for the author gate, scope record, and stopping point: [Task-based reading](../revise-fiction/references/state-and-findings.md#task-based-reading), [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop), [Author approvals](../revise-fiction/references/state-and-findings.md#author-approvals), [Scope and input currency](../revise-fiction/references/state-and-findings.md#scope-and-input-currency), and [Pending actions and session writes](../revise-fiction/references/state-and-findings.md#pending-actions-and-session-writes).

     Keep every read of these four references within those ranges; defer Diagnostics and unrelated operation sections to their own branches. Use the linked reference and template paths directly. This gate is the complete first-scope procedure. On this branch, `author-project` and `revise-fiction` supply only the shared reference sections linked here; their entry `SKILL.md` files and other strategies are outside this procedure.
   - Before asking for scope confirmation, complete the read-only `intake` inventory, record the proposed scope through `author-project` with `record-scope`, persist the proposed `draft-baseline` artifact, and pass its installed `--draft-baseline` validation. Show the proposed baseline as context without requesting its confirmation in the same turn. Record the gate as `awaiting_author` through `set-pending` with `--operation intake`, including the baseline path in `pending_action.artifacts` and the active scope decision in `pending_action.reason`; write the session note with `Operation: intake` and refresh the navigation cache once. Then stop for confirmation of the proposed scope. Defer the intake-report template and all intake-report preparation, including the Report envelope, until after explicit scope confirmation.
   - After explicit scope confirmation, confirm that exact unchanged record through `record-scope`; then follow the Writing a report route and the Intake section to read `assets/intake-report-template.md` and publish the intake report through `scaffold-report`. Review baseline corrections and confirmation as the next author decision.

   On later runs, select the author-requested operation or the earliest missing, partial, or stale evidence in the sequence below and read only the relevant section in the same gates.
5. Record the operation through `author-project` with `set-pending`. Run one operation and stop at its gate with `awaiting_author` or `blocked`. When the author says to continue, advance to the next applicable operation whose evidence is not current. Do not require an outline, total chapter count, planned ending, or full-book structure audit at any gate. When execution evidence is unverified, run preflight once with `--diagnose` and use its execution-recovery audit before choosing a recovery route.

The current-draft sequence is `intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review`. Clean-audit continuation within `prose` follows `prose-mechanics` and does not advance to another operation.

## Author interaction

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop) before presenting questions or approval requests. This applies within an operation as well as at its final gate.

## Operation routing

For each diagnostic callee, supply the operation identifier, destination report path, named inputs and versions, `scope_id`, BCP 47 language, tracker path, and resolved `<setup-skill-root>`. Require `<setup-skill-root>/assets/references/workflow-reporting.md` and finding v2, and supply `../revise-fiction/references/state-and-findings.md` resolved from the callee's installed skill directory as the shared state reference. Record actual operation coverage and subchecks; unknown future story is not a finding by itself.

| Operation | Delegation |
|---|---|
| `intake` | `author-project` with `intake-inventory`, current scope, and semantic intake fields |
| `draft-baseline` | Execute the local [Draft baseline](references/stage-gates.md#2-draft-baseline) procedure with `assets/draft-baseline-template.md`; optional editorial reference: [developmental editing](../fiction-workshop/references/developmental-editing.md) |
| `diagnostics` | `fiction-workshop` Developmental Editor, scene and chapter scope only |
| `characters` | Character Consultant and Continuity Tracker; `character-archetypes` when requested or when profiles already exist |
| `revision-plan` | Consolidate accepted findings using the shared plan template |
| `chapter-revision` | `fiction-workshop`, scoped to the approved plan |
| `prose` | `prose-mechanics`, audits 1-18 in upstream order |
| `ai-cleanup` | Follow `<setup-skill-root>/assets/references/avoid-ai-writing-adapter.md` |
| `current-scope-review` | `author-review` with `review_mode=current-scope` |

`diagnostics` excludes full-book act-level landmark placement, percentage timing, ending completeness, and missing future beats. It may diagnose observable scene causality, chapter function, information release, local pacing, chapter transitions, and current climactic turns. Local split, merge, reorder, cut, or scene rewrite proposals are allowed after approval; describe their local purpose and uncertainty rather than claiming an optimal whole-book structure.

`characters` uses the same character and continuity capabilities as `revise-fiction`, evaluated against current text. Motivation, voice, choices, current arc trends, timeline, relationships, knowledge states, and world facts are in scope. Future arc resolution and full-cast readiness are not prerequisites. Reports list actual subchecks so their evidence is not mistaken for full-book character coverage.

## Direct entry and skips

The author may request diagnosis-only work, direct `prose` or `ai-cleanup`, or a limited review. These entries require current intake evidence, a confirmed scope, and language metadata; chapter revision still requires an approved plan and batch. Record skipped operations in the session and tracker rather than manufacturing evidence. When no accepted finding requires edits, `revision-plan` and `chapter-revision` may be skipped for the current scope. A direct entry or narrowed requested pass does not by itself establish current-draft revision convergence.

Before prose over text with approved but unexecuted changes, explain the rework risk. If the author continues, record a `prose-risk` approval for that exact scope. Unknown future structure and issues outside the target scope do not block prose.

## Approval and backup gate

For manuscript changes, first diagnose without editing. Read `<setup-skill-root>/assets/references/context-fit.md` and complete its check before presenting an edit proposal. Then show affected paths, exact intended changes, and checked local context. Record explicit author approval in the shared tracker, then run `author-project` with `record-backup` for every affected file and the approval ID. Run `complete-write` with the exact approved content to publish it, preserve evidence, and record the execution receipt in one invocation; an interrupted batch has no execution receipt until reconciliation and remains unverified. Restore requires separate explicit approval and a safety backup.

Baseline writes distinguish text-established facts, interpretations, and unknowns. Interpretations remain labeled until the author turns them into creative decisions. Only affected baseline differences are presented after an edit; unknowns never become automatic blockers.

Publishing or changing `draft-baseline.md` or another registered baseline path uses its own `edit` approval with operation `draft-baseline`; a Story Bible write uses operation `story-bible`. A plan or baseline decision does not authorize that write. Split batches when their operations differ, and give each its own backup and execution receipt.

## Strategy switching and evidence reuse

`write-fiction`, `revise-fiction`, `revise-increment`, and `revise-request` use this same manifest and state. At any stable operation gate, show the exact command for the author's selected strategy and wait; do not switch automatically or require the other strategy's sequence to finish. Preserve scope, evidence, approvals, staged drafts, and backups. Reconcile an interrupted write or commit before dependent work. After shared creation adds or affects chapters, offer `revise-increment` when the author wants to preserve reusable unchanged-chapter evidence and bring the expanded target scope to current-draft revision convergence. When the current scope is a full-manuscript scope that has reached current-draft revision convergence, offer `write-fiction` for a new creation batch, `revise-fiction` for a new full-book revision, or `revise-request` for another revision of existing content; each entry still performs its own verification.

Reuse full local coverage units only when source-report identity, operation, paths and hashes, subchecks, and dependencies match. Keep the unit's original scope for provenance and use the target scope for the composed index and synthesis. Reevaluate every applicable whole-book synthesis after changed text, membership, reading order, or dependencies, even when some local units remain reusable. Creation evidence does not satisfy `chapter-revision`. Review jobs and fresh-reader continuity retain their same-scope and actual-reading requirements.

## Unrecoverable execution evidence

When the strict execution gate fails, follow the shared recovery decision in [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence). Reconcile only evidence candidates accepted by the read-only recovery audit, then repeat the strict gate and the remaining strategy conditions. If the audit reports zero reconcilable approvals, do not repeat reconciliation or present another revision pass as a repair. Present one author decision: locate additional preserved post-write evidence for another audit, or end recovery with current-draft revision convergence explicitly not established for the selected scope. Record that decision, the audit counts, the continuing unverified approvals, and the resulting `awaiting_author` or `blocked` pending action. Preserve the approvals and write gate unchanged. A new scope, baseline, request, or narrowed pass cannot close this historical execution blocker.

## Current-draft revision convergence and reports

Use the shared [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence) definition before claiming that state for a requested pass. Persist full local coverage units for independently covered paths so later dependent strategies can reuse them under their own entry and evidence gates. After current-scope review, process every finding; accepted edits return to the affected planning and revision operations and require new downstream coverage and review. A completed current-scope review with open findings does not establish current-draft revision convergence.

Follow [Task-based reading](../revise-fiction/references/state-and-findings.md#task-based-reading) before writing a report, changing finding or approval status, propagating stale evidence, or recording a stopping point. Reports use the shared `reports/` directories and report v2; there is no separate `revise-draft` state tree. Record `scope_id`, `operation_coverage`, and applicable `subchecks` in `engine.notes`.

Do not repeatedly recommend outlining, choosing an ending, or switching to `revise-fiction`. Mention that path only when the author asks for full-book structure or final review. Do not auto-write future scenes or run `story-structure` Map as a substitute for current-draft revision.

Finish each invocation with the current operation and scope, actual coverage, stale evidence, artifact paths, approvals or backups, unknowns, current-draft revision convergence status and blockers, and the exact next action. Use `author-handoff` for session transfer after shared state is current.
