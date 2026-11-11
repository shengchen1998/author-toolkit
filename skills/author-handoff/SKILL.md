---
name: author-handoff
description: Use when creating or restoring a concise author-toolkit session handoff for a new chat or another host without copying manuscript, Story Bible, creation state, draft-baseline, or fresh reader-state content.
---

# Author Handoff

Create or restore a portable pointer to shared project state. Accept `create` or `restore`, a project root, and optionally a handoff path. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values. If `author-project` reports an incomplete toolkit installation, stop creation or restoration and report the missing installed files; do not deploy contracts into the project.

## Create

1. Read `../author-project/SKILL.md` and `../author-project/references/read-operations.md`, then run its `read`, `validate`, and ordinary `status` procedures separately. Pass the current scope ID through `--scope-id` when available. If the manifest is missing, display the host command for user-invoked `setup-author-toolkit` and stop. If its schema version is not `3.1.0`, report that it is unsupported and stop without changing it. Treat recorded statements of current-draft revision convergence as historical; when a handoff recommends `revise-request` or `revise-increment`, apply that strategy's entry gate for this state, including strict execution status, instead of forwarding the statement as verified.
2. Read the registered audit tracker, current revision or writing plan, active creation batch, review job, and recent session notes. Include only decisions explicitly approved by the author. Treat proposals, open findings, and model recommendations as open questions or paths, not approved decisions.
3. Start with [`assets/handoff-template.md`](assets/handoff-template.md). Record current scope and confirmation status, pending action and status, blocked or stale evidence with reasons, shared approvals, unresolved questions, portable paths, and one next action. Link reports and finding IDs instead of reproducing findings.
4. Resolve creation artifacts through registered `paths.creation`. Record creation pointers when present: creation batch ID and path, staging directory, chapter and volume/phase state paths, commit ID and journal path, coverage index, review job ID and path, and fresh reader-state path. Record the last explicitly invoked skill and recommend the actual `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` command for the next action. This recommendation is advisory and does not change scope or pending action.
5. Resolve the manifest's `paths.handoffs` directory and write the handoff to `<paths.handoffs>/<UTC-stamp>_<scope-id-slug>.md` unless the author supplied another in-project path. The default for a new manifest is `.author-toolkit/handoffs/`; an existing custom directory takes precedence. Use a unique filename and leave prior handoffs unchanged.
6. Return the handoff path and the exact command for restoring it on the current host.

Keep manuscript, Story Bible, draft-baseline, creation batch, chapter or volume state, commit content, and full findings out of the handoff. Do not include chapter excerpts, character bios, plot summaries, prose rewrites, baseline text, or full audit findings. Fresh-reader state remains independent: include only its path and review job identity, never its observations or another perspective's state. Paths, finding IDs, approval IDs, batch and commit IDs, and concise approved decision summaries provide continuity.

## Restore

1. Read the supplied handoff and resolve its project root. Use the stored absolute root only when it exists on this host; otherwise ask for or use the supplied local root and resolve every relative path against it.
2. Run `author-project` separately with `read`, `validate`, and ordinary `status`, passing the current scope ID through `--scope-id` when available, when a v3.1 manifest is available. Confirm the manifest creation timestamp and manuscript root recorded in the handoff, then reconcile it with newer shared state. Current manifest, tracker, approval, batch, commit, and evidence state wins; retain unresolved questions that still apply. Before recommending an entry that requires a previous or base scope to have reached current-draft revision convergence, apply that strategy's complete procedure for this state and its strict-execution gate. If strict status fails, report the execution blocker and show `revise-draft` rather than recommending the dependent entry.
3. If the manifest is missing, display the host command for `setup-author-toolkit` so the author can register the project. Do not start that user entry internally. If its schema version is not `3.1.0`, report that it is unsupported and stop without changing it.
4. Display current scope, pending action and status, blocked or stale evidence, creation and review pointers, approved decisions by reference, unresolved questions, and the exact next action. Include an advisory `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` command based on the author's explicit goal. Wait for the author to start it. Restoration alone does not edit a manuscript, change shared state, resume pending writes, or continue a review job.

Switching among all five strategies at a stable operation gate preserves shared project state and does not change current scope. A fresh review resumes only through its own reader-state path and the layered-review procedure. For a new session on the same host, use the handoff path as restore input. For another host, copy the project and handoff, then run `author-handoff` with the local project root and handoff path. The receiving host needs the skill files used by the next action.

## Host commands

Codex uses `$author-handoff`, `$write-fiction`, `$revise-fiction`, `$revise-draft`, `$revise-increment`, and `$revise-request` with unqualified registered skill names. Never present an internal skill call as an author-facing command.

Creation is complete when the file contains only approved handoff categories and every referenced path resolves or is marked missing. Restoration is complete when the author can see current shared state and the next command; neither result implies operation completion.
