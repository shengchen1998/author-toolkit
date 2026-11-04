---
name: revise-request
description: Apply an author-requested revision to existing text in a converged current draft and restore full-scope revision convergence.
disable-model-invocation: true
---

# Revise Request

Coordinate an author-defined revision of existing manuscript content from a previously converged full current draft. The request selects the craft work; the shared current-draft gates determine when the full manuscript is converged again. One manifest continues to represent one book.

## Start or resume

1. Locate `.author-toolkit/project.json`. If it is absent or has `schema_version: "2.0.0"`, display the host command for `setup-author-toolkit` and stop. Use the same setup command forms as `revise-fiction`.
2. Resolve callees only when needed and copy their actual registered names. Never invoke a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. Read the shared tracker, sessions, current plan and scope, pending action, coverage units and index, review jobs, and prior revision evidence. Reconcile an interrupted write or commit before dependent work.
4. On a new request, inventory the complete manuscript and verify that the confirmed base scope covers that full current manuscript and satisfies [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence). Open findings, missing or stale required coverage, unexecuted approved edits, and scope or hash mismatches prevent entry. Show `revise-increment` when creation or import grew the scope; otherwise show `revise-draft`. Stop rather than using the new request to bypass unfinished base work.
5. Record the author's requested outcome, constraints, named paths or passages, and requested checks in the intake report and session note. Establish the full target scope, request set, initial work set, and reusable evidence. The target always contains the complete current manuscript. The request set contains the text the author asked to change and the checks they requested; the work set also contains dependencies and paths that will need new current-draft evidence.
6. On the first run, select `intake`. Present the verified base, request interpretation, target, request set, work set, operation route, and evidence gaps. Stop for author confirmation of this request plan. Confirm an existing current target or use `author-project` with `record-scope` after explicit confirmation when membership, order, or exclusions change. Request-plan confirmation does not approve manuscript edits.
7. On resume, locate the active request in the latest session and any current plan. Treat its verified base scope as historical evidence: the entry's own approved edits are expected to stale that base, so rederive the current work set and convergence instead of requiring the edited manuscript to match the old base. Keep one active request per book and preserve completed request records in sessions and reports.
8. Select the earliest operation required by the request or by missing, partial, or stale convergence evidence in the sequence below. Read the corresponding gate in [`../revise-draft/references/stage-gates.md`](../revise-draft/references/stage-gates.md), plus the rules below. Record the operation through `author-project` with `set-pending`, run one operation, and stop at its author gate with `awaiting_author` or `blocked`.

The current-draft convergence sequence is `intake`, `draft-baseline`, `diagnostics`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `current-scope-review`. Enter at the operation applicable to the request and reuse current base evidence rather than automatically rerunning the full sequence.

## Request routing

Translate the requested outcome into ordered craft operations without narrowing the coverage required for convergence. Developmental and continuity changes precede prose and AI cleanup. A combined request may use several routes; an unspecified revision type is not permission to make unrelated edits.

| Operation or requested work | Request-driven work |
|---|---|
| `intake` | Verify the converged full-manuscript base; record the request, full target, request set, work set, and reusable evidence |
| `draft-baseline` | Refresh full-target input versions and affected observations, interpretations, and unknowns after approved changes |
| `diagnostics` | Use `fiction-workshop` for requested or affected scene, causality, pacing, information-release, POV, and chapter-transition work |
| Requested macro structure | Use `story-structure` Audit as additional `structure` evidence over the existing text; it does not replace current-draft diagnostics or impose `revise-fiction` final-review gates |
| `characters` | Recheck requested or affected motivation, voice, arcs, relationships, knowledge states, timeline, continuity, and world facts; use `character-archetypes` when requested or profiles exist |
| `revision-plan` | Turn the confirmed request and accepted findings into exact batches with paths, actions, input versions, constraints, and acceptance evidence |
| `chapter-revision` | Apply only approved request and review-finding batches with current hashes and backups |
| `prose` | Use `prose-mechanics` or `fiction-workshop` line editing for the requested prose outcome, then restore every affected applicable audit |
| `ai-cleanup` | Follow [`../../references/avoid-ai-writing-adapter.md`](../../references/avoid-ai-writing-adapter.md) for requested detection or approved rewrites and affected rechecks |
| `current-scope-review` | Run `author-review` with `review_mode=current-scope` over the full target and all three perspectives |

For each diagnostic callee, supply the workflow stage, destination report path, named inputs and versions, target `scope_id`, BCP 47 language, and tracker path. Require `../../references/workflow-reporting.md` and finding v2. Identify the request and work-set paths in the report notes and record actual operation coverage and subchecks. Additional request-specific evidence does not replace any current-draft gate.

New chapters or imported external text belong to `write-fiction` and then `revise-increment`. A request may split, merge, delete, or reorder existing manuscript files only through an approved batch and a newly confirmed full target scope.

## Impact and convergence loop

After every approved change, apply the shared stale-propagation rules to actual text and dependencies. Expand the work set with every path whose required evidence became stale, every path affected by a baseline or plan change, and every target path lacking reusable full local coverage. Preserve unaffected full local units only when operation, source-report identity, paths and hashes, requested subchecks, and dependencies match. Compose a new full-target coverage index and synthesis for every affected operation; never extend an old target synthesis because local units survived.

Required convergence coverage includes every applicable subcheck from the verified converged pass plus newly requested checks. A narrower revision request does not silently reduce the old pass. Partial, skipped, or degraded requested applicable coverage remains a convergence blocker under the shared definition.

After any manuscript change, run a new full-target current-scope review after the latest affected operations. Base-scope review reports do not replace target review units or syntheses. The fresh reader reads the full target sequentially through one continuous reviewer state even when the request names one passage. Review-input changes also stale dependent review evidence under the shared rules.

Process every review finding through the author decision loop. An accepted edit returns to `revision-plan` and `chapter-revision`, expands the work set by actual impact, and requires new affected coverage and another full-target review. Deferred or dismissed findings retain their explicit decisions. If a request ends with no manuscript or dependency change, record the no-edit decision and reuse the still-current base review; new findings still require decisions.

Use the shared [Current-draft revision convergence](../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence) definition at every completion check. Request completion alone does not establish current-draft convergence. Report both states separately: the requested work is complete only when its approved batches and decisions are finished; the full target is converged only when every current-draft condition is current after that work.

## Author interaction and manuscript safety

At every author gate, follow the [Author decision loop](../revise-fiction/references/state-and-findings.md). Before manuscript changes, show the exact operation, request, full target scope, work-set paths, actions, and input versions. Record explicit approval in the shared tracker, then invoke `author-project` with `record-backup` for every affected file and approval ID. Recompute hashes immediately before writing. Restore requires separate explicit approval and a safety backup.

Before writing any report or changing finding or approval status, read [`../revise-fiction/references/state-and-findings.md`](../revise-fiction/references/state-and-findings.md). Validate newly written reports and artifacts with the installed validator and preserve historical evidence.

## Strategy switching and shared state

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` use the same manifest, tracker, reports, sessions, backups, handoffs, and creation state. At any stable operation gate, show the exact command for the author's selected strategy and wait. Switching does not reset evidence, resume writes, or require migration. This entry adds no report stage, pending-operation name, manifest field, or separate state tree.

## Finish

Finish each invocation with the request and its decisions, base and target scope IDs, request-set and work-set paths, reused units, new reports and syntheses, actual coverage, approvals and backups, unresolved findings, request-completion status, full-target convergence status and blockers, and the exact next action. Show the `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` command that matches the author's next goal. Use `author-handoff` for session transfer after shared state is current.
