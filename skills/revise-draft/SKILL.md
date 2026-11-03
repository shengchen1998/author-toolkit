---
name: revise-draft
description: Coordinate an existing draft through nine evidence-gated revision operations without requiring a full-book outline, structure, or ending.
disable-model-invocation: true
---

# Revise Draft

Coordinate current-draft revision from the same shared project evidence as `revise-fiction`. This skill mirrors its guided sequence while allowing an unfinished manuscript and undecided future plot.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent or has `schema_version: "2.0.0"`, display the host command for user-invoked `setup-author-toolkit` and stop. Use the same setup command forms as `revise-fiction`. Setup is identical for both skills.
2. Resolve callees only when needed and copy their actual registered names. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. Read the shared tracker, sessions, current plan, current scope, pending action, and relevant evidence. Switching from `revise-fiction` requires no migration and changes no scope or status.
4. On the first run for a new scope, complete the read-only `intake` inventory and a proposed `draft-baseline`, then stop at the first item in the author decision loop, normally confirmation of the proposed scope. Show the proposed baseline as context without requesting its confirmation in the same turn. On later runs, select the author-requested operation or the earliest missing, partial, or stale evidence in the sequence below. Read only the relevant section in [`references/stage-gates.md`](references/stage-gates.md).
5. Record the operation through `author-project` with `set-pending`. Run one operation and stop at its gate with `awaiting_author` or `blocked`. When the author says to continue, advance to the next applicable operation whose evidence is not current. Do not require an outline, total chapter count, planned ending, or full-book structure audit at any gate.

The current-draft sequence is `intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review`.

## Author interaction

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop) before presenting questions or approval requests. This applies within an operation as well as at its final gate.

## Operation routing

For each diagnostic callee, supply the workflow stage, destination report path, named inputs and versions, `scope_id`, BCP 47 language, and tracker path. Require `../../references/workflow-reporting.md` and finding v2. Record actual operation coverage and subchecks; unknown future story is not a finding by itself.

| Operation | Delegation |
|---|---|
| `intake` | `author-project` plus manuscript inventory |
| `draft-baseline` | `fiction-workshop`, current-text summary using the local baseline template |
| `diagnostics` | `fiction-workshop` Developmental Editor, scene and chapter scope only |
| `characters` | Character Consultant and Continuity Tracker; `character-archetypes` when requested or when profiles already exist |
| `revision-plan` | Consolidate accepted findings using the shared plan template |
| `chapter-revision` | `fiction-workshop`, scoped to the approved plan |
| `prose` | `prose-mechanics`, audits 1-18 in upstream order |
| `ai-cleanup` | Follow [`../../references/avoid-ai-writing-adapter.md`](../../references/avoid-ai-writing-adapter.md) |
| `current-scope-review` | `author-review` with `review_mode=current-scope` |

`diagnostics` excludes full-book act-level landmark placement, percentage timing, ending completeness, and missing future beats. It may diagnose observable scene causality, chapter function, information release, local pacing, chapter transitions, and current climactic turns. Local split, merge, reorder, cut, or scene rewrite proposals are allowed after approval; describe their local purpose and uncertainty rather than claiming an optimal whole-book structure.

`characters` uses the same character and continuity capabilities as `revise-fiction`, evaluated against current text. Motivation, voice, choices, current arc trends, timeline, relationships, knowledge states, and world facts are in scope. Future arc resolution and full-cast readiness are not prerequisites. Reports list actual subchecks so their evidence is not mistaken for full-book character coverage.

## Direct entry and skips

The author may request diagnosis-only work, direct `prose` or `ai-cleanup`, or a limited review. These entries require a valid intake, confirmed scope, and language metadata; chapter revision still requires an approved plan and batch. Record skipped operations in the session and tracker rather than manufacturing evidence. When no accepted finding requires edits, `revision-plan` and `chapter-revision` may be skipped for the current scope.

Before prose over text with approved but unexecuted changes, explain the rework risk. If the author continues, record a `prose-risk` approval for that exact scope. Unknown future structure and issues outside the selected scope do not block prose.

## Approval and backup gate

For manuscript changes, first diagnose and show affected paths and intended changes without editing. Record explicit author approval in the shared tracker, then invoke `author-project` with `record-backup` for every affected file and the approval ID. Apply only the approved batch after every backup succeeds. Restore requires separate explicit approval and a safety backup.

Baseline writes distinguish text-established facts, interpretations, and unknowns. Interpretations remain labeled until the author turns them into creative decisions. Only affected baseline differences are presented after an edit; unknowns never become automatic blockers.

## Reports and shared state

Before writing any report or changing finding or approval status, read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md). Reports use the shared `reports/` directories and report v2; there is no separate `revise-draft` state tree. Record `scope_id`, `operation_coverage`, and applicable `subchecks` in `engine.notes`.

Do not repeatedly recommend outlining, choosing an ending, or switching to `revise-fiction`. Mention that path only when the author asks for full-book structure or final review. Do not auto-write future scenes or invoke `story-structure` Map as a substitute for current-draft revision.

Finish each invocation with the current operation and scope, actual coverage, stale evidence, artifact paths, approvals or backups, unknowns, and the exact next action. Use `author-handoff` for session transfer after shared state is current.
