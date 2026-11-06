---
name: write-fiction
description: Coordinate incremental fiction creation from a new or existing shared project.
disable-model-invocation: true
---

# Write Fiction

Coordinate one reviewable creation batch from the shared project evidence. This skill owns sequence, staging, approvals, and recovery; `fiction-workshop` supplies the creative process. One manifest continues to represent one book. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent or has `schema_version: "2.0.0"`, display the host command for `setup-author-toolkit` and stop. Use `/author-toolkit:setup-author-toolkit` in Claude Code or `/skill:author-toolkit:setup-author-toolkit` in Kimi Code; bare forms are `/setup-author-toolkit` and `/skill:setup-author-toolkit`.
2. Resolve each callee in the current skill listing only when needed. Copy the actual registered name into the Skill call. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. These calls check the deployed shared references. If they report missing or mismatched files, display the setup command from step 1 and stop; a valid manifest does not prove reference deployment. For a v3.0 or v3.1 project, display the setup command for direct v3.2 migration and stop before creation writes. Preserve manuscripts, reports, findings, approvals, scopes, pending work, staging, and backups during that migration.
4. For first-time bootstrap, require an actually empty manuscript inventory, no current scope, and no completed bootstrap, then start one current-draft convergence cycle with `initiating_strategy: "write-fiction"`, `bootstrap: true`, and `starting_scope: null`. For ordinary creation, start a non-bootstrap cycle with the current full-manuscript scope; entry succeeds only with a current `satisfied` starting evaluation. If that proof is unavailable, show the exact `revise-draft` recovery command and stop. Never manufacture a starting scope or evaluation from a scope, pending action, staged draft, or empty manuscript. If a cycle is already active, resume its exact recovery position instead of starting another cycle.
5. Read the shared tracker, relevant sessions, current scope, Story Bible or draft baseline, current story-state index, active creation batch, and evidence for the requested work. Create only missing creation skeleton files. Existing projects with matching shared references do not need another setup or project tree.
6. Stop for reconciliation when validation finds manuscript changes or a damaged operational artifact. Resume an interrupted commit only through the recovery procedure in [`references/creation-state.md`](references/creation-state.md). A pending action is not permission to publish.
7. Select `creation-baseline` when the minimum foundation is missing, `creation-import` for external manuscript changes, the active batch's interrupted operation, `milestone-review` at an author-selected boundary, or `writing-plan` for the next batch. Read only the relevant section in [`references/stage-gates.md`](references/stage-gates.md). Before manuscript-changing work, run `check-operation` with the active cycle ID, strategy, operation, and `manuscript_change: true`; after a creation commit, another `writing-plan` returns `creation-commit-limit` or the active-cycle operation blocker with `revise-draft` as the bootstrap recovery action or `revise-increment` for ordinary creation.
8. Record the operation through `author-project` with `set-pending`. Run one operation and stop at its author gate. After batch acceptance, execute `creation-commit` without adding another approval gate. Update the batch, tracker, manifest, cycle, and session note before offering another entry.

The repeating creation sequence is `writing-plan`, `chapter-creation`, `chapter-review`, and `creation-commit`. Keep only one active creation batch per book and at most one accepted creation commit per cycle. One explicitly approved batch may contain multiple chapters and necessary small continuity patches. The next `writing-plan` remains blocked until the same cycle reaches current-draft revision convergence for the full target and receives its explicit completion decision; only then may a new creation cycle begin.

## Author interaction

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop). Use two batch control points:

1. Before writing, approve the chapter plan, exact target paths, intended file actions, context versions, and write batch. Planning alone is not write approval.
2. After staging, accept or reject the complete batch. Acceptance covers the exact manuscript content, story-state differences, and resulting ordered paths and hashes. Record the manuscript and scope approvals separately even when the author makes one coherent decision. Rejection records its own current chapter-review decision, preserves the rejected batch and staging outside manuscript inventory, and creates no commit journal. After ordinary creation rejection, link that batch to the active cycle, revalidate the unchanged starting scope as the current full-manuscript target, and use the normal no-change evaluation and explicit completion gates. A rejected bootstrap batch leaves the manuscript empty and cannot complete; create and accept a nonempty batch or complete an approved nonempty restore or import followed by `revise-draft`. Never publish the staged bytes.

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

AI, author-written, and mixed batches use the same acceptance and state-synchronization rules. New chapters and necessary small continuity patches may share one approved batch. Send structural rewrites and requested full prose or AI cleanup to the appropriate revision entry. After `creation-commit`, state that creation acceptance and publication do not establish current-draft revision convergence for the publication scope. Link the existing batch and journal to the originating cycle without another publication transition.

For ordinary creation, offer `revise-increment` to revise added or affected paths while applying the evidence-reuse rules to unchanged chapters and completing a new full-target current-scope review. Display `/author-toolkit:revise-increment` in Claude Code or `/skill:author-toolkit:revise-increment` in Kimi Code; the bare forms are `/revise-increment` and `/skill:revise-increment`.

After first-time bootstrap publication, offer `revise-draft` to resume the same cycle and establish the initial full-manuscript evaluation. The first publication must not use `revise-increment`, which requires a previous scope that has reached current-draft revision convergence that bootstrap does not have. Display `/author-toolkit:revise-draft` in Claude Code or `/skill:author-toolkit:revise-draft` in Kimi Code; the bare forms are `/revise-draft` and `/skill:revise-draft`. Wait for that exact author command and do not plan another batch before cycle completion.

## Strategy switching

`write-fiction`, `revise-draft`, `revise-fiction`, `revise-increment`, and `revise-request` share the same manifest and artifacts. At a stable operation gate, follow the [current-draft convergence cycle rules](../author-project/references/operations.md#current-draft-convergence-cycle). An active cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. Show the required or selected strategy's exact command and wait; do not switch automatically.

A staged draft may remain while the author performs read-only work or the active cycle's required revision. On return, compare its dependency fingerprint with current inputs. Re-review or replan affected drafts; unrelated scope growth alone does not invalidate the staged text. Never publish after an interrupted write or restore until reconciliation is complete.

## Reports and artifacts

Use the artifact contracts and living state rules in [`references/creation-state.md`](references/creation-state.md). Creation batches, commit journals, coverage units, coverage indexes, review jobs, and reader state are distinct artifacts. Story state is human-readable Markdown with one validated JSON envelope. Accepted batch records and review reports are immutable; current story state and the coverage index are living artifacts.

Shared diagnostic and review reports retain report v2 and finding v2. Read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md) before changing findings, approvals, stale evidence, or report files. Do not add creation operations to the closed report v2 stage enum.

Validate newly written artifacts with the installed `setup-author-toolkit/assets/runtime/validate.mjs` options. Record actual coverage and validation results in the session note.

## Finish

Finish each invocation with the operation, batch and scope IDs, staged or published paths, approvals and backups used, dependency or evidence changes, unresolved questions, current-draft revision convergence status, and the exact next action. Show the `write-fiction`, `revise-increment`, `revise-draft`, `revise-fiction`, or `revise-request` command that matches the author's next goal. Use `author-handoff` for session transfer after shared state is current.
