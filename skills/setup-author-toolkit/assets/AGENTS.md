# Author Toolkit writing project

These instructions govern an agent working in one writing project with Author Toolkit installed. Use them to route work and protect shared state. The active skill's `SKILL.md` and its references supply the full procedure. Use `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

## Resolve and route skills

Match the author's language. Resolve every skill in the host's current skill listing and use its exact registered name, including an `author-toolkit:` qualifier when present.

`ask-author`, `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author entry points. When one is needed, display its exact host command and wait for the author; do not invoke it through the Skill tool. Setup, routing, validation, and handoff restoration never start a strategy automatically.

For shared fiction creation or revision, locate the project root and `.author-toolkit/project.json`:

- If the manifest is missing or v2, show the `setup-author-toolkit` command and stop shared work. Setup registers existing paths, deploys shared contracts to `.author-toolkit/references/`, and migrates v2 without resetting project artifacts.
- If `author-project` reports missing or mismatched shared references during `read`, `validate`, or `status`, show the `setup-author-toolkit` command and stop shared work. A valid v3 manifest alone does not prove reference deployment.
- To create fiction from scratch or continue shared creation, show the `write-fiction` command.
- For whole-book Story Bible, macro-structure, complete character-arc, or final-review work, show the `revise-fiction` command.
- For diagnosis, revision, prose work, AI cleanup, or review of the available draft within a confirmed scope, show the `revise-draft` command. This path does not require an outline, ending, or whole-book structure audit.
- After incremental creation or import, when unchanged chapters have reusable current-draft evidence, show the `revise-increment` command to revise added or affected paths and complete a full-target current-scope review.
- When the current scope is a full-manuscript scope that has reached current-draft revision convergence and the author requests any type of revision to existing content, show the `revise-request` command to apply it and restore current-draft revision convergence for the full-manuscript target scope.
- When the appropriate route is unclear, show the `ask-author` command and the relevant choices.

Use the independent skills directly when their standalone scope matches the request:

| Request | Skill |
| --- | --- |
| Draft or edit fiction, develop a Story Bible, brainstorm, or work outside shared creation | `fiction-workshop` |
| Map or audit macro plot structure | `story-structure` |
| Identify or audit character archetypes | `character-archetypes` |
| Develop or revise narrative nonfiction | `narrative-nonfiction` |
| Run sentence-level diagnostics on stabilized prose | `prose-mechanics` |
| Detect or rewrite Chinese AI-associated writing patterns | `prose-mechanics` with its AI-Isms audit and local Chinese catalog |
| Detect or rewrite English AI writing patterns through the upstream catalog | `avoid-ai-writing` |

`author-project`, `author-handoff`, and `author-review` serve shared orchestration. They do not replace an author-selected strategy.

## Run creation or revision from shared state

Use one manifest per book. `author-project` owns manifest, path, validation, backup, commit, and restore operations; writing skills own creative content. Resolve the Story Bible, tracker, reports, sessions, backups, handoffs, `paths.creation`, and the convergence state root through the manifest rather than assumed defaults. Resolve shared runtime contracts from `<project-root>/.author-toolkit/references/`; this fixed operational directory has no manifest field. All five strategies use this same state.

At the start or resumption of an invocation, follow the active entry skill's procedure, including separate `author-project` calls for `read`, `validate`, and `status`. Read the current scope, active current-draft convergence cycle and recovery position, pending action, tracker, relevant sessions and plan, active creation batch, and evidence for the requested operation. Run one evidence-gated operation and stop at its author gate. At a stable operation gate, an active cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. Show the required or selected strategy command and wait. Switching preserves scope, evidence, decisions, staging, and backups; it never resumes a write or commit automatically.

Independent local or narrowed `revise-draft` work may finish without a cycle, but it does not establish current-draft revision convergence or reduce the last satisfied subcheck baseline. Use independent `evaluate-draft` only with no active cycle; active `revise-draft` recovery links and evaluates the same cycle. Until a full-manuscript evaluation is satisfied, the other manuscript-changing entries remain blocked. Read-only `revise-fiction` analysis and final review remain available without a cycle. Its manuscript-changing or required-evidence-invalidating work needs a satisfied start, a linked `revise-fiction` cycle, every whole-book gate, and restored current-draft revision convergence before completion. Display the exact host command for every cross-entry route and wait; do not invoke another user entry through the Skill tool.

Reuse evidence only when its operation, `scope_id`, input versions, requested coverage and subchecks, and dependency state all match the proposed work. Reuse local coverage units by their exact paths and hashes, and reevaluate affected whole-book synthesis after changes. Treat changed inputs or dependencies as stale evidence to reconcile, not as hashes to refresh silently. Creation evidence does not satisfy `chapter-revision`.

A pending action records interrupted or awaiting work. Recheck current evidence and approvals before acting on it; it does not authorize a manuscript write.

## Keep author decisions explicit

Follow the shared author decision loop at every gate. Unless the author explicitly requests batch handling, present one active decision with its evidence, recommendation, and main tradeoff, then ask one question. Discussion and acceptance of a finding are not manuscript-edit approval.

Before any manuscript edit:

1. Complete the diagnosis or proposal and show the exact operation, scope, affected paths, and intended change batch.
2. Obtain explicit author approval for that batch and record it in the shared tracker with its input versions.
3. Use `author-project` to back up every existing affected file under that approval.
4. Reread the manifest and scope, recompute each existing file's SHA-256 hash and each create target's absence, and write only when every path, hash, approval, and dependency still matches. A mismatch stops the batch for reconciliation.
5. For a revision batch, use `prepare-revision-execution` before writing and `verify-revision-execution` after confirming the resulting scope and requested pass. Preparation does not create approval; approval without verified execution does not establish current-draft revision convergence.

For shared creation, write proposed text only beneath `<paths.creation>/staging/<batch-id>/` before acceptance. The author approves the write plan and later accepts the exact staged batch and resulting scope. `creation-commit` then verifies dependencies, expected absence and old hashes, existing-file backups, and its recovery journal before publication. Acceptance supplies the commit approval; interrupted commits stop for reconciliation.

A restore requires separate explicit approval naming the backup or commit and files, followed by a safety backup of current content through `author-project`. Move batch-created files into that safety backup before removing them from the manuscript. Story Bible creative changes require author confirmation and consistency with the approved plan.

Standalone skill runs leave shared project state unchanged. Incorporate their output only when the author explicitly requests it, preserving the source and recording the decision and shared evidence required by the active strategy.

## Preserve truthful evidence

Before writing a shared report or changing finding or approval status, read the active strategy's pointers to `state-and-findings.md` and `<project-root>/.author-toolkit/references/workflow-reporting.md`. Shared diagnostic and review work uses finding v2 and immutable report v2 files; reruns create new reports. Creation operations and report v2 `stage` remain distinct. Standalone skills retain their own skill-local reporting contracts.

Record actual operation, scope, input, language, and subcheck coverage. Label partial or skipped checks with their reasons. Keep the coverage index beneath registered `paths.reports`. In `revise-draft`, `revise-increment`, `revise-request`, and shared creation, unknown future plot and an unwritten ending remain baseline unknowns unless they cause a concrete problem in existing text.

At each stop, update pending state, the living tracker, and a session note as directed by the active skill. For a session transfer or context-exhausted stop, use `author-handoff` after shared state is current; handoffs contain paths, IDs, approved decision summaries, and next actions rather than manuscript, story-state, or baseline excerpts. Fresh-reader state remains independent and is transferred only by path.

Finish with the current operation and scope, actual or stale coverage, artifact paths, approvals and backups used, unresolved questions, and the exact next author action.
