---
name: revise-increment
description: Bring added or affected paths to current-draft revision convergence for the target scope while reusing full local coverage units from unchanged paths.
disable-model-invocation: true
---

# Revise Increment

Coordinate revision after incremental manuscript growth. Use the current-draft operations and shared evidence to revise added or affected paths without treating creation acceptance as current-draft revision convergence. One manifest continues to represent one book. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent or has `schema_version: "2.0.0"`, display the host command for `setup-author-toolkit` and stop. Use the same setup command forms as `revise-fiction`.
2. Resolve callees only when needed and copy their actual registered names. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. These calls use the shared contracts and validator installed with setup. If they report an incomplete toolkit installation, stop and report the missing installed files; do not deploy contracts into the project. Read the shared tracker, sessions, current plan and scope, pending action, applicable creation batches and commit journals, coverage units and index, review jobs, and prior revision evidence. Reconcile an interrupted write or commit before dependent work.
4. On a new increment, establish the previous scope, the requested target scope, and the change set. Verify that the previous scope has reached current-draft revision convergence; if it has open findings, unresolved required coverage, or unexecuted approved edits, show the `revise-draft` command and stop rather than skipping unfinished work for the previous scope. The target scope normally contains every retained chapter from the previous scope plus the selected new chapters. The change set includes every created, modified, deleted, or reordered path and every path whose evidence or dependencies changed. Creation batches can locate changes; their `create` action alone cannot prove that other chapters are unaffected.
5. On resume, locate the active increment in the latest session and any current plan. Treat its verified previous scope as historical evidence: the increment's own approved edits may stale that previous scope without reopening the entry gate. Rederive the current change set, work set, and current-draft revision convergence for the target scope from current evidence instead of requiring the edited manuscript to match the previous scope. Reconcile external manuscript changes and any interrupted write or commit before dependent work. If no active increment with a verified previous scope can be established, apply the new-increment entry gate.
6. Derive the work set from target-scope paths that need new local evidence or edits. Include changed paths, paths with stale dependencies, and paths without a reusable full local coverage unit for a required operation. Unchanged paths remain reusable only when operation, source-report identity, paths and hashes, requested subchecks, and dependencies match. Whole-report evidence for the previous scope does not establish coverage for the expanded target scope.
7. On the first run, select `intake`. On later runs, select the earliest missing, partial, or stale evidence in the sequence below, including review findings that require another revision pass.
8. Record the selected operation through `author-project` with `set-pending`. Run one operation and stop at its author gate with `awaiting_author` or `blocked`. For `intake`, complete the read-only inventory and present the previous scope, proposed or confirmed target scope, change set, work set, reusable evidence, and evidence gaps. Stop for author confirmation of the target scope and work set. If the confirmed current scope already matches the requested target scope, reuse it as the target scope instead of manufacturing a replacement; otherwise use `author-project` with `record-scope` after explicit confirmation. Target-scope and work-set confirmation do not approve manuscript edits.

The operation sequence is `intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review`. Follow the corresponding gates in [`../revise-draft/references/stage-gates.md`](../revise-draft/references/stage-gates.md), with the incremental rules below.

## Incremental operation routing

For each diagnostic callee, supply the operation identifier, destination report path, named inputs and versions, target `scope_id`, BCP 47 language, tracker path, and resolved `<setup-skill-root>`. Require `<setup-skill-root>/assets/references/workflow-reporting.md` and finding v2, and supply `../revise-fiction/references/state-and-findings.md` resolved from the callee's installed skill directory as the shared state reference. Identify the work-set paths in the report notes and record actual operation coverage and subchecks.

| Operation | Incremental work |
|---|---|
| `intake` | Inventory the complete manuscript; establish the previous scope, target scope, change set, work set, and reusable evidence |
| `draft-baseline` | Update the baseline for the full target scope from current text; reuse labeled prior observations and show affected differences |
| `diagnostics` | Diagnose every work-set chapter and its transitions and dependencies; compose current local coverage for the full target scope |
| `characters` | Recheck affected current arcs, continuity, knowledge states, timeline, and world facts on work-set paths; compose character coverage for the full target scope |
| `revision-plan` | Consolidate current accepted findings for the target scope into exact work-set batches; keep no-edit paths and deferred decisions visible |
| `chapter-revision` | Apply only approved work-set batches with current hashes and backups; expand the work set when an accepted fix affects another path |
| `prose` | Run requested audits on work-set text; compose matching full local coverage units and a new full-target synthesis |
| `ai-cleanup` | Run requested detection or approved rewrites on work-set text; compose language coverage and operation coverage for the full target scope |
| `current-scope-review` | Run `author-review` with `review_mode=current-scope` over the full confirmed target scope and all three perspectives |

For diagnostics, characters, prose, and AI cleanup, persist full local coverage units for independently covered paths and compose the living coverage index for the target scope. Write a new full-target synthesis whenever membership, order, text, dependencies, or child coverage changes. Missing reusable units add the affected old paths to the work set; never relabel old whole-report evidence as target-scope evidence.

The full-target current-scope review has the same scope and actual-reading requirements as `revise-draft`. In particular, the fresh reader must read the full target scope sequentially through one continuous reviewer state. Prior reports from the previous scope do not replace review units or syntheses for the target scope. Limiting edits to the work set does not limit the review's reading scope.

## Current-draft revision convergence loop

Use the shared [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence) definition at every completion check.

After each full-target current-scope review, resolve every returned finding through the author decision loop. An accepted edit returns to `revision-plan` and `chapter-revision`, stales affected downstream evidence, and requires new affected coverage and another full-target current-scope review. Deferred or dismissed findings retain their explicit decisions. Creation acceptance, a completed `chapter-review`, one clean diagnostic, or a review with undecided findings does not establish current-draft revision convergence.

Claim current-draft revision convergence only when every required operation is current for the target scope, all requested local coverage and syntheses are complete, every finding has a current decision, no approved batch remains unexecuted, and the full-target current-scope review satisfies its gate after the latest edits. Record the no-edit skip for `revision-plan` and `chapter-revision` when applicable. Keep partial, skipped, or degraded requested applicable coverage visible as a blocker unless the author explicitly narrows the requested pass; name that narrowed requested pass instead of claiming current-draft revision convergence. Documented inapplicable whole-book or language-specific checks may remain explicitly `skipped` with their reasons.

## Author interaction and manuscript safety

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md#author-decision-loop). Before manuscript changes, show the exact operation, target scope, work-set paths, actions, and input versions. Record explicit approval in the shared tracker, then invoke `author-project` with `record-backup` for every affected file and approval ID. Recompute hashes immediately before writing. Restore requires separate explicit approval and a safety backup.

## Strategy switching and shared state

`write-fiction`, `revise-draft`, `revise-fiction`, `revise-increment`, and `revise-request` use the same manifest, tracker, reports, sessions, backups, handoffs, and creation state. At any stable operation gate, show the exact command for the author's selected strategy and wait. Switching does not reset evidence, resume writes, or require migration. This entry adds no report v2 `stage` value, pending-action operation name, manifest field, or separate state tree.

Before writing any report or changing finding or approval status, read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md). Validate newly written reports and artifacts with the installed validator and preserve historical evidence.

## Finish

Finish each invocation with the previous-scope and target-scope IDs, change-set and work-set paths, reused full local coverage units, new reports and syntheses, actual coverage, approvals and backups, unresolved findings, and the exact next action. At the final gate, state explicitly whether the target scope has reached current-draft revision convergence and list every blocker when it has not. Show the `write-fiction`, `revise-draft`, `revise-fiction`, `revise-increment`, or `revise-request` command that matches the author's next goal. Use `author-handoff` for session transfer after shared state is current.
