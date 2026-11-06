---
name: author-handoff
description: Use when creating or restoring a concise author-toolkit session handoff for a new chat or another host without copying manuscript, Story Bible, creation state, draft-baseline, or fresh reader-state content.
---

# Author Handoff

Create or restore a portable pointer to shared project state. Accept `create` or `restore`, a project root, and optionally a handoff path. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values. The `author-project` calls below also check the deployed shared references. If they report missing or mismatched files, display the user-invoked `setup-author-toolkit` command and stop creation or restoration; a valid manifest does not prove reference deployment.

## Create

1. Resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read`, `validate`, and `status`. Bare and `author-toolkit:` qualified registrations are both valid when listed. If the manifest is missing or v2, display the host command for user-invoked `setup-author-toolkit` and stop.
2. Read the registered audit tracker, current revision or writing plan, active creation batch, review job, and recent session notes. Include only decisions explicitly approved by the author. Treat proposals, open findings, and model recommendations as open questions or paths, not approved decisions.
3. Start with [`assets/handoff-template.md`](assets/handoff-template.md). Record current scope and confirmation status, pending action and status, blocked or stale evidence with reasons, shared approvals, unresolved questions, portable paths, and one next action. Link reports and finding IDs instead of reproducing findings.
4. Resolve creation artifacts through registered `paths.creation`. Record creation pointers when present: creation batch ID and path, staging directory, chapter and volume/phase state paths, commit ID and journal path, coverage index, review job ID and path, and fresh reader-state path. Record the last explicitly invoked skill and recommend the actual `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` command for the next action. This recommendation is advisory and does not change scope or pending action.
5. Resolve the manifest's `paths.handoffs` directory and write the handoff to `<paths.handoffs>/<UTC-stamp>_<scope-id-slug>.md` unless the author supplied another in-project path. The default for a new manifest is `.author-toolkit/handoffs/`; an existing custom directory takes precedence. Use a unique filename and leave prior handoffs unchanged.
6. Return the handoff path and the exact command for restoring it on the current host.

Keep manuscript, Story Bible, draft-baseline, creation batch, chapter or volume state, commit content, and full findings out of the handoff. Do not include chapter excerpts, character bios, plot summaries, prose rewrites, baseline text, or full audit findings. Fresh-reader state remains independent: include only its path and review job identity, never its observations or another perspective's state. Paths, finding IDs, approval IDs, batch and commit IDs, and concise approved decision summaries provide continuity.

## Restore

1. Read the supplied handoff and resolve its project root. Use the stored absolute root only when it exists on this host; otherwise ask for or use the supplied local root and resolve every relative path against it.
2. Invoke `author-project` in separate calls with `read`, `validate`, and `status` when a v3 manifest is available. Confirm the manifest creation timestamp and manuscript root recorded in the handoff, then reconcile it with newer shared state. Current manifest, tracker, approval, batch, commit, and evidence state wins; retain unresolved questions that still apply.
3. If the manifest is missing or v2, display the host command for `setup-author-toolkit` so the author can register or migrate the project. Do not invoke that user entry through the Skill tool.
4. Display current scope, active cycle ID and revision, current strategy, recovery position, evaluation references and outcome, pending action and status, blocked or stale evidence, creation and review pointers, approved decisions by reference, unresolved questions, and the exact next action. Include only the active cycle's required command for manuscript changes, or an advisory `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` command based on the author's explicit goal when no cycle is active. Wait for the author to start it. Restoration alone does not edit a manuscript, change shared state, resume pending writes, or continue a review job.
5. If status reports an interrupted `cycle_operation`, active/completed conflict, pending identity mismatch, or leftover lock, display the exact `author-project reconcile-cycle` diagnostic command instead of a manuscript-changing next action. Report only the interrupted cycle and operation IDs, artifact paths, and available direction; never infer a direction or approval from the handoff or pending action.

Switching among all five strategies at a stable operation gate needs no migration and does not change current scope. An active current-draft convergence cycle blocks a parallel manuscript-changing cycle while preserving read-only inspection. A fresh review resumes only through its own reader-state path and the layered-review procedure. For a new session on the same host, use the handoff path as restore input. For another host, copy the project and handoff, then invoke `author-handoff` with the local project root and handoff path. The receiving host needs the registered skill used by the next action.

## Host commands

Display commands in the receiving host's documented user syntax. Claude Code plugin installations use `/author-toolkit:author-handoff`, `/author-toolkit:write-fiction`, `/author-toolkit:revise-fiction`, `/author-toolkit:revise-draft`, `/author-toolkit:revise-increment`, and `/author-toolkit:revise-request`; Kimi Code adds the `/skill:` prefix. Bare installations use `/author-handoff`, `/write-fiction`, `/revise-fiction`, `/revise-draft`, `/revise-increment`, and `/revise-request` in Claude Code and add `/skill:` to each name in Kimi Code. If skill commands are unavailable, name the host's skill picker and exact registered skill. Never present a Skill tool call as an author-facing command.

Creation is complete when the file contains only approved handoff categories and every referenced path resolves or is marked missing. Restoration is complete when the author can see current shared state and the next command; neither result implies operation completion.
