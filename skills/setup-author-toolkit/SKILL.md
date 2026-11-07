---
name: setup-author-toolkit
description: Set up, validate, or migrate an author-toolkit book project while preserving existing files and paths.
disable-model-invocation: true
---

# Setup Author Toolkit

Register one book project and prepare its shared persistent files. Accept only the project root, an optional manuscript path, and optional language or project metadata. There is no entry-stage or workflow argument. Perform the same setup for every later creation or revision strategy. Use the bundled [controlled workflow terminology](assets/references/terminology.md) while deploying shared references.

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
3. Deploy every file from `assets/references/` to `<project-root>/.author-toolkit/references/` while preserving filenames. Create missing directories and files. For each existing file, compare its SHA-256 hash with the packaged file. Leave matching files unchanged. For a mismatch, leave the existing file untouched, report `reference-version-conflict` with both hashes, and stop shared workflows until the author resolves it. Replace a mismatched file only after explicit author approval for that exact file; first preserve the existing file beneath `<paths.backups>/reference-updates/<UTC-stamp>/`, then copy the packaged file and record the action in the session note. Do not infer approval from the setup invocation itself.
4. Resolve `author-project` in the current skill listing and copy its registered name exactly. It may appear as `author-project` or `author-toolkit:author-project`. Invoke that exact name with `initialize`, the selected root and paths, project metadata, and BCP 47 language. If neither name is registered, stop and identify the missing dependency.
5. For a new project, create missing directories and write only missing skeleton files. Use `../author-project/assets/story-bible-template.md` and the neutral `../author-project/assets/audit-tracker-template.md`. Copy `assets/AGENTS.md` to `<project-root>/AGENTS.md` only when that file is absent; it gives later agents project-level routing and manuscript-safety guidance, and an existing instruction file remains unchanged. Write supplied project metadata only where the templates request it and leave creative fields empty. Fill the new tracker's project root and manifest timestamp. Leave current scope and pending action unset for the selected skill to establish with the author.
6. For an existing v3.0 or v3.1 manifest, `initialize` only validates it. Preserve its paths, current scope, pending action, historical evidence, approvals, staged drafts, and backup records. Make no entry-stage or strategy changes. A v3.0 project receives the separate confirmed `upgrade-v31` only when the author starts shared creation.
7. For an existing v2 manifest, have `author-project` run `node <setup-skill-root>/scripts/migrate-v3.mjs --project-root <project-root>`. Preserve the returned snapshot and migrate current scope, pending action, and legacy overrides. The setup skill bundles self-contained validation and migration CLIs, including their runtime dependencies; no repository checkout or project `npm install` is needed. If the required installed script is missing, report an incomplete toolkit installation and stop instead of resetting the project. Finish with a separate `validate` call after creation, v3 validation, or migration.
8. Display the manifest path, registered paths, shared reference deployment result, validation or migration result, snapshot path when present, current scope, pending action, and shared stale or blocked evidence. Show the exact host commands for `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`. Explain that the skill the author explicitly starts will confirm the entry operation with the author. Wait for that choice.

## Boundaries

Create no manuscript prose and fill in no Story Bible creative content. Keep every existing file in place. Except for the documented v2-to-v3 manifest and tracker migration or an explicitly approved shared-reference replacement, preserve existing file contents and historical artifacts. All five strategies use the same manifest, tracker, reports, sessions, backups, handoffs, registered creation path, and project-local `.author-toolkit/references/`. Create no strategy-specific state directory. Setup does not alter Git configuration or `.gitignore`.

The six independent skills do not require setup for standalone use. Their standalone contracts live in their own skill directories; the shared reference deployment does not replace those skill-local files.

Use the host's documented command syntax when displaying the next commands. Claude Code plugin installations use `/author-toolkit:write-fiction`, `/author-toolkit:revise-fiction`, `/author-toolkit:revise-draft`, `/author-toolkit:revise-increment`, and `/author-toolkit:revise-request`; Kimi Code adds the `/skill:` prefix. Bare installations use `/write-fiction`, `/revise-fiction`, `/revise-draft`, `/revise-increment`, and `/revise-request` in Claude Code and add `/skill:` to each name in Kimi Code. A host without skill commands should show its skill picker and the exact registered names.

Report setup as ready only when the manifest validates or its concrete errors are reported, all selected paths are registered, every deployed shared reference matches the packaged payload, and all five workflow commands are visible. A `reference-version-conflict` leaves shared workflows blocked. Do not invoke `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, `revise-request`, or another writing skill from setup.
