---
name: revise-request
description: Apply an author-requested revision to existing manuscript after the full-manuscript base scope reaches current-draft revision convergence, then restore that state for the full-manuscript target scope.
disable-model-invocation: true
---

# Revise Request

Coordinate an author-defined revision of existing manuscript content from a full-manuscript base scope that has reached current-draft revision convergence. The request selects the craft work; the shared current-draft gates determine when the full-manuscript target scope reaches current-draft revision convergence again. One manifest continues to represent one book. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent or has `schema_version: "2.0.0"`, display the host command for `setup-author-toolkit` and stop. Use the same setup command forms as `revise-fiction`.
2. Resolve callees only when needed and copy their actual registered names. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. These calls check the deployed shared references. If they report missing or mismatched files, display the setup command from step 1 and stop; a valid manifest does not prove reference deployment. Read the shared tracker, sessions, current plan and scope, pending action, coverage units and index, review jobs, and prior revision evidence. Reconcile an interrupted write or commit before dependent work.
4. On a new request, inventory the complete manuscript and verify that the confirmed base scope is a full-manuscript scope that has reached [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence), proven by a current satisfied base evaluation. Use `author-project` `start-cycle` with `initiating_strategy: "revise-request"`, `bootstrap: false`, and that exact base snapshot; the public operation refuses a missing, stale, or unsatisfied base and preserves the accepted base as `starting_scope` and `starting_evaluation`. Open findings, missing or stale required coverage, unexecuted approved edits, and scope or hash mismatches prevent entry. Show `revise-increment` when creation or import grew the scope; otherwise show `revise-draft`. Stop rather than using the new request to bypass unfinished work for the base scope.
5. Record the author's requested outcome, constraints, named paths or passages, and requested checks in the intake report and session note. Establish the full-manuscript target scope, request set, initial work set, and reusable evidence. The target scope always contains the complete current manuscript. The request set contains the text the author asked to change and the checks they requested; the work set also contains dependencies and paths that need new current evidence for the target scope.
6. On the first run, select `intake`. Present the verified base scope, request interpretation, target scope, request set, work set, operation route, and evidence gaps. Stop for author confirmation of this request plan. If the confirmed current scope already matches the requested target scope, reuse it as the target scope; otherwise use `author-project` with `record-scope` after explicit confirmation when membership, order, or exclusions change. Request-plan confirmation does not approve manuscript edits.
7. On resume, locate the active request in the latest session and any current plan. Treat its verified base scope as historical evidence: the entry's own approved edits are expected to stale that base scope, so rederive the current work set and current-draft revision convergence instead of requiring the edited manuscript to match the base scope. Keep one active request per book and preserve completed request records in sessions and reports.
8. Select the earliest operation required by the request or by missing, partial, or stale evidence required for current-draft revision convergence in the sequence below. Read the corresponding gate in [`../revise-draft/references/stage-gates.md`](../revise-draft/references/stage-gates.md), plus the rules below. Record the operation through `author-project` with `set-pending`, run one operation, and stop at its author gate with `awaiting_author` or `blocked`.

The current-draft operation sequence is `intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review`. Enter at the operation applicable to the request and reuse current evidence for the base scope rather than automatically rerunning the full sequence.

## Request routing

Translate the requested outcome into ordered craft operations without narrowing the coverage required for current-draft revision convergence. Developmental and continuity changes precede prose and AI cleanup. A combined request may use several routes; an unspecified revision type is not permission to make unrelated edits.

| Operation or requested work | Request-driven work |
|---|---|
| `intake` | Verify that the full-manuscript base scope has reached current-draft revision convergence; record the request, full-manuscript target scope, request set, work set, and reusable evidence |
| `draft-baseline` | Refresh input versions and affected observations, interpretations, and unknowns for the full target scope after approved changes |
| `diagnostics` | Use `fiction-workshop` for requested or affected scene, causality, pacing, information-release, POV, and chapter-transition work |
| Requested macro structure | Use `story-structure` Audit as additional `structure` evidence over the existing text; it does not replace current-draft diagnostics or impose `revise-fiction` final-review gates |
| `characters` | Recheck requested or affected motivation, voice, arcs, relationships, knowledge states, timeline, continuity, and world facts; use `character-archetypes` when requested or profiles exist |
| `revision-plan` | Turn the confirmed request and accepted findings into exact batches with paths, actions, input versions, constraints, and acceptance evidence |
| `chapter-revision` | Apply only approved request and review-finding batches with current hashes and backups |
| `prose` | Use `prose-mechanics` or `fiction-workshop` line editing for the requested prose outcome, then restore every affected applicable audit |
| `ai-cleanup` | Follow `<project-root>/.author-toolkit/references/avoid-ai-writing-adapter.md` for requested detection or approved rewrites and affected rechecks |
| `current-scope-review` | Run `author-review` with `review_mode=current-scope` over the full target scope and all three perspectives |

For each diagnostic callee, supply the operation identifier, destination report path, named inputs and versions, target `scope_id`, BCP 47 language, and tracker path. Require `<project-root>/.author-toolkit/references/workflow-reporting.md` and finding v2, and supply `../revise-fiction/references/state-and-findings.md` resolved from the callee's installed skill directory as the shared state reference. Identify the request-set and work-set paths in the report notes and record actual operation coverage and subchecks. Additional request-specific evidence does not replace any current-draft gate.

New chapters or imported external text belong to `write-fiction` and then `revise-increment`. A request may split, merge, delete, or reorder existing manuscript files only through an approved batch and a newly confirmed full-manuscript target scope.

## Impact and current-draft revision convergence loop

After every approved change, apply the shared stale-propagation rules to actual text and dependencies. Expand the work set with every path whose required evidence became stale, every path affected by a baseline or plan change, and every target-scope path lacking a reusable full local coverage unit. Preserve unaffected full local coverage units only when operation, source-report identity, paths and hashes, requested subchecks, and dependencies match. Compose a new coverage index for the target scope and a full-target synthesis for every affected operation; never retain an old full-target synthesis because local units survived. Keep the request set narrow when appropriate, but keep requested-pass paths, coverage required for current-draft revision convergence, and every review job over the complete target manuscript.

Required coverage for current-draft revision convergence includes every applicable subcheck required by the base scope's current-draft revision convergence evidence plus newly requested checks. A narrower revision request does not silently reduce that required coverage. Partial, skipped, or degraded requested applicable coverage remains a blocker for current-draft revision convergence under the shared definition.

For each approved batch, preserve a hashed plan and batch artifact and use `author-project` `prepare-revision-execution` before writing. The prepared record binds plan, batch, pass, input scope, finding dispositions, author decisions, approvals, backups, file actions, and planned input/output hashes. After writing and confirming the resulting full-manuscript target scope and requested pass, use `verify-revision-execution` to compare actual output bytes with the prepared hashes. The verified record binds the final pass and target. The cycle preserves its starting scope and accumulates its change set from that base through all approved batches; earlier verified executions remain historical evidence.

After any manuscript change, run a new full-target current-scope review after the latest affected operations. Base-scope review reports do not replace review units or syntheses for the target scope. The fresh reader reads the full target scope sequentially through one continuous reviewer state even when the request names one passage. Review-input changes also stale dependent review evidence under the shared rules.

Process every review finding through the author decision loop. An accepted edit returns to `revision-plan` and `chapter-revision`, expands the work set by actual impact, and requires a new verified execution, new affected coverage, and another full-target current-scope review. Deferred or dismissed findings retain their explicit decisions and their review reports in the evaluation evidence graph. If a request ends with no manuscript or dependency change, record the no-edit decision and reuse eligible base-scope evidence after completing newly requested checks and decisions; new findings still require decisions. A resolved finding always requires a current verified execution and cannot be covered by a no-edit skip.

Use the shared [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence) definition at every completion check. Request completion alone does not establish current-draft revision convergence. Read `request_completion` in `cycle-status` or validator `convergence-status` separately from the evaluation outcome: `complete` means every approved request batch and request decision is finished, while `incomplete` identifies unexecuted approvals, open decisions, or changed outputs. The cycle still completes only after a current satisfied target evaluation and the author's explicit `complete-cycle` confirmation.

## Author interaction and manuscript safety

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md). Before manuscript changes, show the exact operation, request, full-manuscript target scope, work-set paths, actions, and input versions. Record explicit approval in the shared tracker, then invoke `author-project` with `record-backup` for every affected file and approval ID. Recompute hashes immediately before writing. The public prepare operation only verifies those existing decisions, approvals, backup manifests and bytes, and inputs; never use it to manufacture approval. Approval without a verified execution blocks current-draft revision convergence, and post-evaluation output tampering invalidates status and completion. Restore requires separate explicit approval and a safety backup.

Before writing any report or changing finding or approval status, read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md). Validate newly written reports and artifacts with the installed validator, including `--revision-execution`, and preserve historical evidence.

## Strategy switching and shared state

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` use the same manifest, tracker, reports, sessions, backups, handoffs, and creation state. At a stable operation gate, follow the [current-draft convergence cycle rules](../author-project/references/operations.md#current-draft-convergence-cycle). An active cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. Show the required or selected strategy's exact command and wait. Switching does not reset evidence, resume writes, or require migration. This entry adds no report v2 `stage` value, pending-action operation name, manifest field, or separate state tree.

## Finish

Finish each invocation with the request and its decisions, base-scope and target-scope IDs, request-set and work-set paths, reused full local coverage units, new reports and syntheses, actual coverage, approvals and backups, unresolved findings, request-completion status, current-draft revision convergence status for the full-manuscript target scope and blockers, and the exact next action. Show the `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` command that matches the author's next goal. Use `author-handoff` for session transfer after shared state is current.
