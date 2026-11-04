---
name: revise-increment
description: Bring newly created or affected chapters to current-draft revision convergence while reusing valid evidence for unchanged chapters.
disable-model-invocation: true
---

# Revise Increment

Coordinate revision after incremental manuscript growth. Use the current-draft operations and shared evidence to revise added or affected paths without treating creation acceptance as revision convergence. One manifest continues to represent one book.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent or has `schema_version: "2.0.0"`, display the host command for `setup-author-toolkit` and stop. Use the same setup command forms as `revise-fiction`.
2. Resolve callees only when needed and copy their actual registered names. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. Read the shared tracker, sessions, current plan and scope, pending action, applicable creation batches and commit journals, coverage units and index, review jobs, and prior revision evidence. Reconcile an interrupted write or commit before dependent work.
4. Establish the previous converged scope, the requested target scope, and the change set. Verify the previous scope against current-draft evidence; if it has open findings, unresolved required coverage, or unexecuted approved edits, show the `revise-draft` command and stop rather than skipping unfinished base work. The target normally contains every retained chapter from the previous scope plus the selected new chapters. The change set includes every created, modified, deleted, or reordered path and every path whose evidence or dependencies changed. Creation batches can locate changes; their `create` action alone cannot prove that other chapters are unaffected.
5. Derive the work set from target paths that need new local evidence or edits. Include changed paths, paths with stale dependencies, and paths without reusable full local coverage for a required operation. Unchanged paths remain reusable only when operation, source-report identity, paths and hashes, requested subchecks, and dependencies match. A converged whole-report for the old scope does not establish coverage for the expanded target.
6. On the first run, select `intake`. On later runs, select the earliest missing, partial, or stale evidence in the sequence below, including review findings that require another revision pass.
7. Record the selected operation through `author-project` with `set-pending`. Run one operation and stop at its author gate with `awaiting_author` or `blocked`. For `intake`, complete the read-only inventory and present the previous scope, proposed or current target scope, change set, work set, reusable evidence, and evidence gaps. Stop for author confirmation of the target and work set. Confirm an existing current target rather than manufacturing a replacement scope; otherwise use `author-project` with `record-scope` after explicit confirmation. Target and work-set confirmation do not approve manuscript edits.

The operation sequence is `intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review`. Follow the corresponding gates in [`../revise-draft/references/stage-gates.md`](../revise-draft/references/stage-gates.md), with the incremental rules below.

## Incremental operation routing

For each diagnostic callee, supply the workflow stage, destination report path, named inputs and versions, target `scope_id`, BCP 47 language, and tracker path. Require `../../references/workflow-reporting.md` and finding v2. Identify the work-set paths in the report notes and record actual operation coverage and subchecks.

| Operation | Incremental work |
|---|---|
| `intake` | Inventory the complete manuscript; establish the previous scope, target, change set, work set, and reusable evidence |
| `draft-baseline` | Update the baseline for the full target from current text; reuse labeled prior observations and show affected differences |
| `diagnostics` | Diagnose every work-set chapter and its transitions and dependencies; compose current local coverage for the full target |
| `characters` | Recheck affected current arcs, continuity, knowledge states, timeline, and world facts; compose full-target character coverage |
| `revision-plan` | Consolidate current accepted findings for the target into exact work-set batches; keep no-edit paths and deferred decisions visible |
| `chapter-revision` | Apply only approved work-set batches with current hashes and backups; expand the work set when an accepted fix affects another path |
| `prose` | Run requested audits on work-set text; compose matching full local units and a new target synthesis |
| `ai-cleanup` | Run requested detection or approved rewrites on work-set text; compose full-target language and operation coverage |
| `current-scope-review` | Run `author-review` with `review_mode=current-scope` over the full confirmed target and all three perspectives |

For diagnostics, characters, prose, and AI cleanup, persist full local units for independently covered paths and compose the living coverage index for the target. Write a new target synthesis whenever membership, order, text, dependencies, or child coverage changes. Missing reusable units add the affected old paths to the work set; never relabel an old whole-scope report as target evidence.

The final review has the same scope and actual-reading requirements as `revise-draft`. In particular, the fresh reader must read the full target sequentially through one continuous reviewer state. Prior reports from the previous scope do not replace target review units or syntheses. Limiting edits to the work set does not limit the final review's reading scope.

## Convergence loop

Use the shared [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence) definition at every completion check.

After each target review, resolve every returned finding through the author decision loop. An accepted edit returns to `revision-plan` and `chapter-revision`, stales affected downstream evidence, and requires new affected coverage and another target review. Deferred or dismissed findings retain their explicit decisions. Creation acceptance, a completed `chapter-review`, one clean diagnostic, or a review with undecided findings does not establish convergence.

Claim convergence only when every required operation is current for the target, all requested local coverage and syntheses are complete, every finding has a current decision, no approved batch remains unexecuted, and the full target review satisfies its gate after the latest edits. Record the no-edit skip for `revision-plan` and `chapter-revision` when applicable. Keep partial, skipped, or degraded requested applicable coverage visible as a blocker unless the author explicitly narrows the requested pass; name that limited pass instead of claiming full convergence. Documented inapplicable whole-book or language-specific checks may remain explicitly `skipped` with their reasons.

## Author interaction and manuscript safety

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop). Before manuscript changes, show the exact operation, target scope, work-set paths, actions, and input versions. Record explicit approval in the shared tracker, then invoke `author-project` with `record-backup` for every affected file and approval ID. Recompute hashes immediately before writing. Restore requires separate explicit approval and a safety backup.

## Strategy switching and shared state

`write-fiction`, `revise-draft`, `revise-fiction`, `revise-increment`, and `revise-request` use the same manifest, tracker, reports, sessions, backups, handoffs, and creation state. At any stable operation gate, show the exact command for the author's selected strategy and wait. Switching does not reset evidence, resume writes, or require migration. This entry adds no report stage, pending-operation name, manifest field, or separate state tree.

Before writing any report or changing finding or approval status, read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md). Validate newly written reports and artifacts with the installed validator and preserve historical evidence.

## Finish

Finish each invocation with the previous and target scope IDs, change set and work-set paths, reused units, new reports and syntheses, actual coverage, approvals and backups, unresolved findings, and the exact next action. At the final gate, state explicitly whether the target is revision-converged and list every blocker when it is not. Show the `write-fiction`, `revise-draft`, `revise-fiction`, `revise-increment`, or `revise-request` command that matches the author's next goal. Use `author-handoff` for session transfer after shared state is current.
