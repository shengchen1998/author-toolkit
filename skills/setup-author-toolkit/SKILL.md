---
name: setup-author-toolkit
description: Set up, validate, or migrate an author-toolkit book project while preserving existing files and paths.
disable-model-invocation: true
---

# Setup Author Toolkit

Register one book project and prepare its shared persistent files. Accept only the project root, an optional manuscript path, and optional language or project metadata. There is no entry-stage or workflow argument. Perform the same setup for every later creation or revision strategy.

## Setup

1. Inspect the project root. Look for `.author-toolkit/project.json`, manuscript text files, a Story Bible, an audit tracker, reports, session notes, and creation state. If several plausible roots or manuscript paths exist, present the choices and let the author select one.
2. Register existing paths as they are. Use these defaults only for missing components:
   - `manuscript/`
   - `story-bible.md`
   - `audit-tracker.md`
   - `reports/`
   - `sessions/`
   - `.author-toolkit/backups/`
   - `.author-toolkit/handoffs/`
   - `.author-toolkit/creation/`
3. Resolve `author-project` in the current skill listing and copy its registered name exactly. It may appear as `author-project` or `author-toolkit:author-project`. Invoke that exact name with `initialize`, the selected root and paths, project metadata, and BCP 47 language. If neither name is registered, stop and identify the missing dependency.
4. For a new project, create missing directories and write only missing skeleton files. Use `../author-project/assets/story-bible-template.md` and the neutral `../author-project/assets/audit-tracker-template.md`. Copy `assets/AGENTS.md` to `<project-root>/AGENTS.md` only when that file is absent; it gives later agents project-level routing and manuscript-safety guidance, and an existing instruction file remains unchanged. Write supplied project metadata only where the templates request it and leave creative fields empty. Fill the new tracker's project root and manifest timestamp. Leave current scope and pending action unset for the selected skill to establish with the author.
5. For an existing v3.0 or v3.1 manifest, `initialize` only validates it. Preserve its paths, current scope, pending action, historical evidence, approvals, staged drafts, and backup records. Make no entry-stage or strategy changes. A v3.0 project receives the separate confirmed `upgrade-v31` only when the author starts shared creation.
6. For an existing v2 manifest, have `author-project` run `node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>`. Preserve the returned snapshot and migrate current scope, pending action, and legacy overrides. If the script cannot run, display that exact command and its requirements instead of resetting the project. Finish with a separate `validate` call after creation, v3 validation, or migration.
7. Display the manifest path, registered paths, validation or migration result, snapshot path when present, current scope, pending action, and shared stale or blocked evidence. Show the exact host commands for `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`. Explain that the skill the author explicitly starts will confirm the entry operation with the author. Wait for that choice.

## Boundaries

Create no manuscript prose and fill in no Story Bible creative content. Keep every existing file in place. Except for the documented v2-to-v3 manifest and tracker migration, preserve existing file contents and historical artifacts. All five strategies use the same manifest, tracker, reports, sessions, backups, handoffs, and registered creation path. Create no strategy-specific state directory. Setup does not alter Git configuration or `.gitignore`.

Use the host's documented command syntax when displaying the next commands. Claude Code plugin installations use `/author-toolkit:write-fiction`, `/author-toolkit:revise-fiction`, `/author-toolkit:revise-draft`, `/author-toolkit:revise-increment`, and `/author-toolkit:revise-request`; Kimi Code adds the `/skill:` prefix. Bare installations use `/write-fiction`, `/revise-fiction`, `/revise-draft`, `/revise-increment`, and `/revise-request` in Claude Code and add `/skill:` to each name in Kimi Code. A host without skill commands should show its skill picker and the exact registered names.

Setup is complete when the manifest validates or its concrete errors are reported, all selected paths are registered, and all five workflow commands are visible. Do not invoke `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, `revise-request`, or another writing skill from setup.
