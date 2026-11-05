---
name: revise-draft
description: Coordinate an existing manuscript through nine evidence-gated revision operations without requiring a full-book outline, structure, or ending.
disable-model-invocation: true
---

# Revise Draft

Coordinate revision of existing manuscript from the same shared project evidence as `revise-fiction`. This skill mirrors its guided sequence while allowing an unfinished manuscript and undecided future plot. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent or has `schema_version: "2.0.0"`, display the host command for user-invoked `setup-author-toolkit` and stop. Use the same setup command forms as `revise-fiction`. Setup is identical for all five workflow entries.
2. Resolve callees only when needed and copy their actual registered names. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. These calls check the deployed shared references. If they report missing or mismatched files, display the setup command from step 1 and stop; a valid manifest does not prove reference deployment. Read the shared tracker, sessions, current plan, current scope, pending action, and relevant evidence. Switching from `revise-fiction` requires no migration and changes no scope or status.
4. On the first run for a new scope, complete the read-only `intake` inventory and a proposed `draft-baseline`, then stop at the first item in the author decision loop, normally confirmation of the proposed scope. Show the proposed baseline as context without requesting its confirmation in the same turn. On later runs, select the author-requested operation or the earliest missing, partial, or stale evidence in the sequence below. Read only the relevant section in [`references/stage-gates.md`](references/stage-gates.md).
5. Record the operation through `author-project` with `set-pending`. Run one operation and stop at its gate with `awaiting_author` or `blocked`. When the author says to continue, advance to the next applicable operation whose evidence is not current. Do not require an outline, total chapter count, planned ending, or full-book structure audit at any gate.

The current-draft sequence is `intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review`.

## Independent work and active-cycle recovery

Independent local, diagnostic, direct `prose` or `ai-cleanup`, and narrowed requested passes may finish without a current-draft convergence cycle. Record their confirmed scope, requested coverage, narrowing decision, gaps, and actual evidence. They must not claim full-manuscript current-draft revision convergence. A narrowed independent pass does not reduce the last satisfied full-manuscript subcheck baseline; retain that baseline's pass reference and add only explicitly requested checks to a later full-manuscript pass.

Use `author-project check-operation` before manuscript work. With no active cycle, independent `revise-draft` work remains available. After an independent pass leaves the manuscript unconverged, `write-fiction`, `revise-request`, `revise-increment`, and manuscript-changing `revise-fiction` remain blocked until a full-manuscript convergence evaluation is satisfied. Show the required entry's exact host command and wait; never invoke another user entry through the Skill tool.

For an independent full-manuscript no-edit pass, bind the requested pass, target scope, current reports and coverage, review group, no-edit skips, and semantic attestations, then run `author-project evaluate-draft`. This operation uses the shared evaluator without creating an active cycle; its evaluation records `cycle_id: null`. A narrowed pass produces `not_satisfied`, never a satisfied claim. Do not run `complete-cycle` for independent work. A current satisfied independent evaluation can support another strategy's starting gate and supplies the latest unrestricted satisfied subcheck baseline.

For an independent full-manuscript recovery with accepted edits, run `prepare-draft-revision-execution` before changing manuscript. It checks the exact decisions, approvals, backups, planned outputs, and current inputs and publishes only a `prepared` record with `cycle_id: null`. After editing, confirm the new full-manuscript scope and pass, then run `verify-draft-revision-execution` to reread actual output bytes and produce the verified revision execution. A resolved finding in this recovery requires a verified revision execution record; approval, backup, a `prepared` record, or a caller-supplied status cannot substitute. Supply its execution reference through `revision_executions` to `evaluate-draft`, which rechecks the record and current bytes. Duplicate preparation, repeated verification, changed inputs, and changed outputs fail without a success claim or replacement publication.

When status reports an active cycle that requires `revise-draft`, recover the same cycle. Link the requested pass, full-manuscript target, revision executions, review group, and no-edit skips through `transition-cycle`, then run `evaluate-cycle` with its cycle ID and expected revision. `evaluate-draft` rejects this work with `active-cycle-exists`; never start a parallel cycle. Wait for the author's explicit completion decision before `complete-cycle`.

After first-time bootstrap publication, continue the same cycle through `revise-draft` and establish its initial full-manuscript evaluation. The first publication has no previous scope that has reached current-draft revision convergence, so do not route it to `revise-increment`. Link the first creation batch and commit journal with the initial pass and review evidence; for bootstrap, run `evaluate-cycle` and never `evaluate-draft` while that cycle is active. Only a current satisfied target evaluation and the author's completion decision permit a later ordinary creation cycle.

## Author interaction

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop) before presenting questions or approval requests. This applies within an operation as well as at its final gate.

## Operation routing

For each diagnostic callee, supply the operation identifier, destination report path, named inputs and versions, `scope_id`, BCP 47 language, and tracker path. Require `<project-root>/.author-toolkit/references/workflow-reporting.md` and finding v2, and supply `../revise-fiction/references/state-and-findings.md` resolved from the callee's installed skill directory as the shared state reference. Record actual operation coverage and subchecks; unknown future story is not a finding by itself.

| Operation | Delegation |
|---|---|
| `intake` | `author-project` plus manuscript inventory |
| `draft-baseline` | `fiction-workshop`, current-text summary using the local baseline template |
| `diagnostics` | `fiction-workshop` Developmental Editor, scene and chapter scope only |
| `characters` | Character Consultant and Continuity Tracker; `character-archetypes` when requested or when profiles already exist |
| `revision-plan` | Consolidate accepted findings using the shared plan template |
| `chapter-revision` | `fiction-workshop`, scoped to the approved plan |
| `prose` | `prose-mechanics`, audits 1-18 in upstream order |
| `ai-cleanup` | Follow `<project-root>/.author-toolkit/references/avoid-ai-writing-adapter.md` |
| `current-scope-review` | `author-review` with `review_mode=current-scope` |

`diagnostics` excludes full-book act-level landmark placement, percentage timing, ending completeness, and missing future beats. It may diagnose observable scene causality, chapter function, information release, local pacing, chapter transitions, and current climactic turns. Local split, merge, reorder, cut, or scene rewrite proposals are allowed after approval; describe their local purpose and uncertainty rather than claiming an optimal whole-book structure.

`characters` uses the same character and continuity capabilities as `revise-fiction`, evaluated against current text. Motivation, voice, choices, current arc trends, timeline, relationships, knowledge states, and world facts are in scope. Future arc resolution and full-cast readiness are not prerequisites. Reports list actual subchecks so their evidence is not mistaken for full-book character coverage.

## Direct entry and skips

The author may request diagnosis-only work, direct `prose` or `ai-cleanup`, or a limited review. These entries require current intake evidence, a confirmed scope, and language metadata; chapter revision still requires an approved plan and batch. Record skipped operations in the session and tracker rather than manufacturing evidence. When no accepted finding requires edits, record a no-edit skip for `revision-plan` and `chapter-revision` using `<project-root>/.author-toolkit/references/no-edit-skip-schema.json`, bound to the requested pass, target fingerprint, covered findings, explicit author decision, and reason. A direct entry or narrowed requested pass does not by itself establish current-draft revision convergence.

Before prose over text with approved but unexecuted changes, explain the rework risk. If the author continues, record a `prose-risk` approval for that exact scope. Unknown future structure and issues outside the target scope do not block prose.

## Approval and backup gate

For manuscript changes, first diagnose and show affected paths and intended changes without editing. Record explicit author approval in the shared tracker, then invoke `author-project` with `record-backup` for every affected file and the approval ID. With no active cycle, run `prepare-draft-revision-execution`; with an active cycle, run `prepare-revision-execution` before writing. Apply only the approved batch after every backup succeeds, confirm the resulting scope and pass, and use the matching independent or cycle-bound verify operation. Restore requires separate explicit approval and a safety backup.

Baseline writes distinguish text-established facts, interpretations, and unknowns. Interpretations remain labeled until the author turns them into creative decisions. Only affected baseline differences are presented after an edit; unknowns never become automatic blockers.

## Strategy switching and evidence reuse

`write-fiction`, `revise-fiction`, `revise-increment`, and `revise-request` use this same manifest and state. At a stable operation gate, follow the [current-draft convergence cycle rules](../author-project/references/operations.md#current-draft-convergence-cycle). An active cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. Show the required or selected strategy's exact command and wait; do not switch automatically. Preserve scope, evidence, approvals, staged drafts, and backups. Reconcile an interrupted write or commit before dependent work. After ordinary shared creation adds or affects chapters, offer `revise-increment` when the author wants to preserve reusable unchanged-chapter evidence and bring the expanded target scope to current-draft revision convergence; first-time bootstrap publication instead follows the same-cycle `revise-draft` route above. When the current scope is a full-manuscript scope that has reached current-draft revision convergence and the author requests another revision of existing content, offer `revise-request`.

Reuse full local coverage units only when source-report identity, operation, paths and hashes, subchecks, and dependencies match. Keep the unit's original scope for provenance and use the target scope for the composed index and synthesis. Reevaluate every applicable whole-book synthesis after changed text, membership, reading order, or dependencies, even when some local units remain reusable. Creation evidence does not satisfy `chapter-revision`. Review jobs and fresh-reader continuity retain their same-scope and actual-reading requirements.

## Current-draft revision convergence and reports

Use the shared [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence) definition before claiming that state for a requested pass. Persist full local coverage units for independently covered paths so later `revise-increment` or `revise-request` work can reuse them. After current-scope review, process every finding; accepted edits return to the affected planning and revision operations and require new downstream coverage and review. A completed current-scope review with open findings does not establish current-draft revision convergence.

For every full-manuscript no-edit pass, create the requested pass and its fingerprint, bind current reports and coverage hashes, group the three review perspectives, and record the required host and logical-reviewer semantic attestations. Inherit every applicable subcheck from the latest satisfied full-manuscript pass and add only explicitly requested checks. With no active cycle, run `author-project evaluate-draft`; with an active cycle, link the same evidence and run `evaluate-cycle`, then wait for the author's explicit completion decision before `complete-cycle`. Follow the [public evaluation and completion rules](../author-project/references/operations.md#no-edit-convergence-evaluation-and-completion); never write an outcome into fixture or request input.

Before writing any report or changing finding or approval status, read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md). Reports use the shared `reports/` directories and report v2; there is no separate `revise-draft` state tree. Record `scope_id`, `operation_coverage`, and applicable `subchecks` in `engine.notes`.

Do not repeatedly recommend outlining, choosing an ending, or switching to `revise-fiction`. Mention that path only when the author asks for full-book structure or final review. Do not auto-write future scenes or invoke `story-structure` Map as a substitute for current-draft revision.

Finish each invocation with the current operation and scope, actual coverage, stale evidence, artifact paths, approvals or backups, unknowns, current-draft revision convergence status and blockers, and the exact next action. Use `author-handoff` for session transfer after shared state is current.
