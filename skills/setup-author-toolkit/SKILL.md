---
name: setup-author-toolkit
description: Set up or resume an author-toolkit book project while preserving existing files and paths.
disable-model-invocation: true
---

# Setup Author Toolkit

Register a book project and prepare its persistent files. Accept an existing project root, an optional manuscript path, and an optional stage at which the author wants to resume.

## Setup

1. Inspect the project root. Look for `.author-toolkit/project.json`, manuscript text files, a Story Bible, an audit tracker, reports, and session notes. If several plausible roots or manuscript paths exist, present the choices and let the author select one.
2. Register existing paths as they are. Use these defaults only for missing components:
   - `manuscript/`
   - `story-bible.md`
   - `audit-tracker.md`
   - `reports/`
   - `sessions/`
   - `.author-toolkit/backups/`
   - `.author-toolkit/handoffs/`
3. Resolve `author-project` in the current skill listing and copy its registered name exactly. It may appear as `author-project` or `author-toolkit:author-project`. Invoke that exact name with `initialize`, the selected root and paths, project type, BCP 47 language, and requested entry stage. If neither name is registered, stop and identify the missing dependency.
4. For a new project, create missing directories and write only missing skeleton files. Use `../author-project/assets/story-bible-template.md` and `../author-project/assets/audit-tracker-template.md`. Replace the Story Bible title placeholder when a title is known and leave creative fields empty. Store the target reader in the Story Bible or intake notes. Fill the new tracker's project root, manifest timestamp, current stage, and next-action pointers; leave an existing tracker unchanged.
5. For an existing manifest, preserve its paths, stage history, artifacts, and backup records. Call `author-project` with `initialize` to validate without resetting state. When the requested entry stage differs from the current one, call it again with `set-stage`: supply the requested stage, `not_started` status, existing artifacts for that stage, and any required stale reasons or overrides. If the author is resuming the same stage, retain its current status. Use `skipped` only for stages the author explicitly bypassed; mark uncertain earlier evidence `stale` with a reason rather than guessing completion. Finish with a separate `validate` call so the selected entry is verified in the persisted manifest.
6. Display the manifest path, registered paths, validation result, current or stale stages, and the exact host command for starting `revise-fiction` at the selected stage. Wait for the author to start that work.

## Boundaries

Create no manuscript prose and fill in no Story Bible creative content. Keep every existing file in place and preserve its contents. Setup does not alter Git configuration or `.gitignore`.

Use the host's documented command syntax when displaying the next command. Claude Code plugin installations use `/author-toolkit:revise-fiction`; Kimi Code plugin installations use `/skill:author-toolkit:revise-fiction`. Bare installations use `/revise-fiction` in Claude Code and `/skill:revise-fiction` in Kimi Code. A host without skill commands should show its skill picker and the exact registered name.

Setup is complete when the manifest validates or its concrete errors are reported, all selected paths are registered, and the author can see the next action. Do not invoke `revise-fiction` from setup.
