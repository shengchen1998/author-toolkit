# Author Toolkit writing project

These instructions govern an agent working in one writing project with Author Toolkit installed. Use them to route work and protect shared state. The active skill's `SKILL.md` and its references supply the full procedure.

## Resolve and route skills

Match the author's language. Resolve every skill in the host's current skill listing and use its exact registered name, including an `author-toolkit:` qualifier when present.

`ask-author`, `setup-author-toolkit`, `revise-fiction`, and `revise-draft` are explicit author entry points. When one is needed, display its exact host command and wait for the author; do not invoke it through the Skill tool. Setup, routing, validation, and handoff restoration never start a revision strategy automatically.

For an existing fiction manuscript that needs a shared revision workflow, locate the project root and `.author-toolkit/project.json`:

- If the manifest is missing or v2, show the `setup-author-toolkit` command and stop revision work. Setup registers existing paths and migrates v2 without resetting project artifacts.
- For whole-book Story Bible, macro-structure, complete character-arc, or final-review work, show the `revise-fiction` command.
- For diagnosis, revision, prose work, AI cleanup, or review of the available draft within a confirmed scope, show the `revise-draft` command. This path does not require an outline, ending, or whole-book structure audit.
- When the appropriate route is unclear, show the `ask-author` command and the relevant choices.

Use the independent skills directly when their standalone scope matches the request:

| Request | Skill |
| --- | --- |
| Draft or edit fiction, develop a Story Bible, brainstorm, or start fiction from scratch | `fiction-workshop` |
| Map or audit macro plot structure | `story-structure` |
| Identify or audit character archetypes | `character-archetypes` |
| Develop or revise narrative nonfiction | `narrative-nonfiction` |
| Run sentence-level diagnostics on stabilized prose | `prose-mechanics` |
| Detect or rewrite AI writing patterns | `avoid-ai-writing` |

`author-project`, `author-handoff`, and `author-review` serve shared orchestration. They do not replace an author-selected revision strategy.

## Run revision from shared state

Use one manifest per book. `author-project` owns manifest, path, validation, backup, and restore operations; writing skills own creative content. Resolve the Story Bible, tracker, reports, sessions, backups, and handoffs through the manifest's registered paths rather than assumed defaults. Both revision strategies use this same state.

At the start or resumption of a revision invocation, follow the active entry skill's procedure, including separate `author-project` calls for `read`, `validate`, and `status`. Read the current scope, pending action, tracker, relevant sessions and plan, and the evidence for the requested operation. Run one evidence-gated operation and stop at its author gate. Switching strategies preserves scope, evidence, decisions, and backups.

Reuse evidence only when its operation, `scope_id`, input versions, requested coverage and subchecks, and dependency state all match the proposed work. Treat changed inputs or dependencies as stale evidence to reconcile, not as hashes to refresh silently. A schema-valid historical report is not necessarily current.

A pending action records interrupted or awaiting work. Recheck current evidence and approvals before acting on it; it does not authorize a manuscript write.

## Keep author decisions explicit

Follow the active revision skill's author decision loop at every gate. Unless the author explicitly requests batch handling, present one active decision with its evidence, recommendation, and main tradeoff, then ask one question. Discussion and acceptance of a finding are not manuscript-edit approval.

Before any manuscript edit:

1. Complete the diagnosis or proposal and show the exact operation, scope, affected paths, and intended change batch.
2. Obtain explicit author approval for that batch and record it in the shared tracker with its input versions.
3. Use `author-project` to back up every affected file under that approval.
4. Reread the manifest and scope, recompute each affected file's SHA-256 hash, and write only when every path, hash, approval, and dependency still matches. A mismatch stops the batch for reconciliation.

A restore requires separate explicit approval naming the backup ID and files, followed by a safety backup of current content through `author-project`. Story Bible creative changes require author confirmation and consistency with the approved plan.

Standalone skill runs leave shared project state unchanged. Incorporate their output only when the author explicitly requests it, preserving the source and recording the decision and shared evidence required by the active revision skill.

## Preserve truthful evidence

Before writing a shared report or changing finding or approval status, read the active revision skill's pointers to `state-and-findings.md` and `workflow-reporting.md`. Shared revision work uses finding v2 and immutable report v2 files; reruns create new reports. Standalone skills retain their own reporting contracts.

Record actual operation, scope, input, language, and subcheck coverage. Label partial or skipped checks with their reasons. In `revise-draft`, unknown future plot and an unwritten ending remain baseline unknowns unless they cause a concrete problem in existing text.

At each stop, update pending state, the living tracker, and a session note as directed by the active skill. For a session transfer or context-exhausted stop, use `author-handoff` after shared state is current; handoffs contain paths, IDs, approved decision summaries, and next actions rather than manuscript or baseline excerpts.

Finish with the current operation and scope, actual or stale coverage, artifact paths, approvals and backups used, unresolved questions, and the exact next author action.
