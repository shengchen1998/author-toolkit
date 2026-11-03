---
name: author-handoff
description: Use when creating or restoring a concise author-toolkit session handoff for a new chat or another host without copying manuscript or Story Bible content.
---

# Author Handoff

Create or restore a portable pointer to the current main workflow. Accept `create` or `restore`, a project root, and optionally a handoff path.

## Create

1. Resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read`, `validate`, and `status`. Bare and `author-toolkit:` qualified registrations are both valid when listed. If no manifest exists, display the host command for user-invoked `setup-author-toolkit` and stop.
2. Read the registered audit tracker, current revision plan, and recent session notes. Include only decisions explicitly approved by the author. Treat proposals, open findings, and model recommendations as open questions or paths, not approved decisions.
3. Start with [`assets/handoff-template.md`](assets/handoff-template.md). Record the current stage and status, stale stages and reasons, approved decision summaries with source paths, unresolved questions, portable paths, and one next action. Link reports and finding IDs instead of reproducing findings.
4. Resolve the manifest's `paths.handoffs` directory and write the handoff to `<paths.handoffs>/<UTC-stamp>_<stage>.md` unless the author supplied another in-project path. The default for a new manifest is `.author-toolkit/handoffs/`; an existing custom directory takes precedence. Use a unique filename and leave prior handoffs unchanged.
5. Return the handoff path and the exact command for restoring it on the current host.

Keep manuscript and Story Bible content out of the handoff. Do not include chapter excerpts, character bios, plot summaries, prose rewrites, or full audit findings. Paths, finding IDs, and concise approved decision summaries provide the continuity.

## Restore

1. Read the supplied handoff and resolve its project root. Use the stored absolute root only when it exists on this host; otherwise ask for or use the supplied local root and resolve every relative path against it.
2. Invoke `author-project` in separate calls with `read`, `validate`, and `status` when the manifest is available. Confirm the manifest creation timestamp and manuscript root recorded in the handoff, then reconcile it with newer manifest state. Current manifest state wins; retain stale reasons and unresolved questions that still apply.
3. If the manifest is missing, display the host command for `setup-author-toolkit` so the author can register the moved project. Do not invoke that user entry through the Skill tool.
4. Display the current stage, stale stages, approved decisions by reference, unresolved questions, and the exact next action. Wait for the author to start it. Restoration alone does not edit a manuscript, change workflow state, or launch the next stage.

For a new session on the same host, use the handoff path as the restore input. For another host, copy the project and handoff, then invoke `author-handoff` with the local project root and handoff path. The receiving host needs the registered skills used by the next action.

## Host commands

Display commands in the receiving host's documented user syntax. Claude Code plugin installations use `/author-toolkit:author-handoff` and `/author-toolkit:revise-fiction`; Kimi Code adds the `/skill:` prefix, giving `/skill:author-toolkit:author-handoff` and `/skill:author-toolkit:revise-fiction`. Bare installations use `/author-handoff` or `/revise-fiction` in Claude Code and `/skill:author-handoff` or `/skill:revise-fiction` in Kimi Code. If skill commands are unavailable, name the host's skill picker and exact registered skill. Never present a Skill tool call as an author-facing command.

Creation is complete when the file contains only the approved handoff categories and every referenced path resolves or is marked missing. Restoration is complete when the author can see current state and the next command; it does not imply stage completion.
