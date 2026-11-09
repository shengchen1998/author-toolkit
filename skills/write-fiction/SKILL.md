---
name: write-fiction
description: Coordinate incremental fiction creation from a new or existing shared project.
disable-model-invocation: true
---

# Write Fiction

Coordinate one reviewable creation batch from the shared project evidence. This skill owns sequence, staging, approvals, and recovery; `fiction-workshop` supplies the creative process. One manifest continues to represent one book. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent, display the host command for `setup-author-toolkit` and stop. Use `/author-toolkit:setup-author-toolkit` in Claude Code or `/skill:author-toolkit:setup-author-toolkit` in Kimi Code; bare forms are `/setup-author-toolkit` and `/skill:setup-author-toolkit`. If the manifest has any schema version other than `3.1.0`, report that it is unsupported and stop without changing it.
2. Resolve each callee in the current skill listing only when needed. Copy the actual registered name into the Skill call. Include the resolved `<setup-skill-root>` in shared workflow context supplied to a callee. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status --digest`. These calls use the shared contracts and validator installed with setup. If they report an incomplete toolkit installation, stop and report the missing installed files; do not deploy contracts into the project. Read `PROJECT_STATE.md` first, then read only the tracker sections, relevant sessions, current scope, Story Bible or draft baseline, current story-state index, active creation batch, and evidence needed for the requested work. Do not read the full tracker or backup index for routine navigation. Preserve manuscripts, reports, findings, approvals, scopes, and backups.
4. Create only missing creation skeleton files. Existing projects do not need another setup or project tree after a toolkit update because shared contracts remain with the installed setup skill.
5. Stop for reconciliation when validation finds manuscript changes or a damaged operational artifact. Resume an interrupted commit only through the recovery procedure in [`references/creation-state.md`](references/creation-state.md). A pending action is not permission to publish.
6. Select `creation-baseline` when the minimum foundation is missing, `creation-import` for external manuscript changes, the active batch's interrupted operation, `milestone-review` at an author-selected boundary, or `writing-plan` for the next batch. Read only the relevant section in [`references/stage-gates.md`](references/stage-gates.md).
7. Record the operation through `author-project` with `set-pending`. Run one operation and stop at its author gate. After batch acceptance, execute `creation-commit` without adding another approval gate. Update the batch, tracker, manifest, and session note before offering another entry.

The repeating creation sequence is `writing-plan`, `chapter-creation`, `chapter-review`, and `creation-commit`. Keep only one active creation batch per book.

## Author interaction

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop). Use two batch control points:

1. Before writing, approve the chapter plan, exact target paths, intended file actions, context versions, and write batch. Planning alone is not write approval.
2. After staging, accept or reject the complete batch. Acceptance covers the exact manuscript content, story-state differences, and resulting ordered paths and hashes. Record the manuscript and scope approvals separately even when the author makes one coherent decision.

Unrelated open findings remain visible without blocking creation. A finding that affects the planned batch must be resolved or explicitly accepted as a named risk in the writing-plan approval.

## Operation routing

| Operation | Work |
|---|---|
| `creation-baseline` | Establish the minimum Story Bible foundation and creation state; future plot and ending may remain unknown |
| `writing-plan` | Plan one chapter by default and construct the recorded context package |
| `chapter-creation` | Invoke `fiction-workshop` to draft into staging, or stage author-supplied text |
| `chapter-review` | Check plan execution, transitions, and continuity; obtain batch acceptance |
| `creation-commit` | Verify versions, back up old text, publish, update state and scope, and preserve recovery records |
| `creation-import` | Reconcile author-added, modified, deleted, or reordered manuscript files |
| `milestone-review` | Summarize the selected volume or story phase and run requested local checks |

AI, author-written, and mixed batches use the same acceptance and state-synchronization rules. New chapters and necessary small continuity patches may share one approved batch. Send structural rewrites and requested full prose or AI cleanup to the appropriate revision entry. After `creation-commit`, state that creation acceptance and publication do not establish current-draft revision convergence for the publication scope. Offer `revise-increment` to revise added or affected paths while applying the evidence-reuse rules to unchanged chapters and completing a new full-target current-scope review.

## Strategy switching

`write-fiction`, `revise-draft`, `revise-fiction`, `revise-increment`, and `revise-request` share the same manifest and artifacts. At any stable operation gate, show the exact command for the author's selected next strategy. Do not switch automatically or require the other strategy's full sequence to finish.

A staged draft may remain while the author uses a revision entry. On return, compare its dependency fingerprint with current inputs. Re-review or replan affected drafts; unrelated scope growth alone does not invalidate the staged text. Never publish after an interrupted write or restore until reconciliation is complete.

## Reports and artifacts

Use the artifact contracts and living state rules in [`references/creation-state.md`](references/creation-state.md). Creation batches, commit journals, coverage units, coverage indexes, review jobs, and reader state are distinct artifacts. Story state is human-readable Markdown with one validated JSON envelope. Accepted batch records and review reports are immutable; current story state and the coverage index are living artifacts.

Shared diagnostic and review reports retain report v2 and finding v2. Read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md) before changing findings, approvals, stale evidence, or report files. Do not add creation operations to the closed report v2 stage enum.

Validate newly written artifacts with the installed setup skill's `scripts/validate.mjs` options. Record actual coverage and validation results in the session note.

## Finish

Finish each invocation with the operation, batch and scope IDs, staged or published paths, approvals and backups used, dependency or evidence changes, unresolved questions, current-draft revision convergence status, and the exact next action. Show the `write-fiction`, `revise-increment`, `revise-draft`, `revise-fiction`, or `revise-request` command that matches the author's next goal. Use `author-handoff` for session transfer after shared state is current.
