---
name: setup-author-toolkit
description: Set up, validate, or migrate an author-toolkit book project while preserving existing files and paths.
disable-model-invocation: true
---

# Setup Author Toolkit

Register one book project and prepare its shared persistent files. Accept only the project root, an optional manuscript path, and optional language or project metadata. There is no entry-stage or workflow argument. Perform the same setup for every later creation or revision strategy. Use the bundled [controlled workflow terminology](assets/references/terminology.md) while deploying shared references.

## Setup

1. Inspect the project root. Look for `.author-toolkit/project.json`, manuscript text files, a Story Bible, an audit tracker, reports, session notes, creation state, and the convergence state root. If several plausible roots or manuscript paths exist, present the choices and let the author select one.
2. Register existing paths as they are. Use these defaults only for missing components:
   - `manuscript/`
   - `story-bible.md`
   - `audit-tracker.md`
   - `reports/`
   - `sessions/`
   - `.author-toolkit/backups/`
   - `.author-toolkit/handoffs/`
   - `.author-toolkit/creation/`
   - `.author-toolkit/convergence/`
3. Deploy every file from `assets/references/` to `<project-root>/.author-toolkit/references/` while preserving filenames. Create missing directories and files. For each existing file, compare its SHA-256 hash with the packaged file. Leave matching files unchanged. For a mismatch, leave the existing file untouched, report `reference-version-conflict` with both hashes, and stop shared workflows until the author resolves it. Replace a mismatched file only after explicit author approval for that exact file; first preserve the existing file beneath `<paths.backups>/reference-updates/<UTC-stamp>/`, then copy the packaged file and record the action in the session note. Do not infer approval from the setup invocation itself.
4. Resolve `author-project` in the current skill listing and copy its registered name exactly. It may appear as `author-project` or `author-toolkit:author-project`. Invoke that exact name with `initialize`, the selected root and paths, project metadata, and BCP 47 language. If neither name is registered, stop and identify the missing dependency.
5. For a new project, create missing directories and write only missing skeleton files. Use `../author-project/assets/story-bible-template.md` and the neutral `../author-project/assets/audit-tracker-template.md`. Copy `assets/AGENTS.md` to `<project-root>/AGENTS.md` only when that file is absent; it gives later agents project-level routing and manuscript-safety guidance, and an existing instruction file remains unchanged. Write supplied project metadata only where the templates request it and leave creative fields empty. Fill the new tracker's project root and manifest timestamp. Leave current scope and pending action unset for the selected skill to establish with the author. Create the registered convergence state root without creating a scope, active current-draft convergence cycle, or convergence evaluation, and without inventing author confirmation.
6. For an existing v3.2 manifest, `initialize` only validates it. Preserve its paths, current scope, pending action, active cycle, completed cycle history, historical evidence, approvals, staged drafts, and backup records. Make no entry-stage or strategy changes and do not infer an active cycle or evaluation.
7. For an existing v2, v3.0, or v3.1 manifest, have `author-project` run `node <toolkit-root>/scripts/migrate-v32.mjs --project-root <project-root>`. The older `migrate-v3.mjs` command is an equivalent compatibility wrapper. Migrate directly to v3.2 without an intermediate v3.1 write. Preserve the returned snapshot, current scope and pending work, and convert legacy v2 overrides as documented. Preserve every manuscript, report, finding, approval, scope record, session, staged draft, backup, creation batch, and commit journal. Only an exact legacy scope confirmation can support a confirmed scope snapshot; otherwise leave the migrated scope proposed for author reconfirmation. Create no satisfied evaluation or active cycle. If the script cannot run, display that exact command and its requirements instead of resetting the project. Finish with a separate `validate` call after creation, validation, or migration.
8. Display the manifest path, registered paths, shared reference deployment result, validation or migration result, snapshot path when present, current scope and scope fingerprint, full-manuscript result for a v3.2 current scope, active current-draft convergence cycle and recovery position, evaluation outcome, pending action, legacy recovery blockers, and shared stale or blocked evidence. Show the exact host commands for `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`, with the active cycle's required command taking precedence for manuscript changes. Explain that the skill the author explicitly starts will confirm the entry operation with the author. Wait for that choice.

## Boundaries

Create no manuscript prose and fill in no Story Bible creative content. Keep every existing file in place. Except for the documented legacy-to-v3.2 manifest and tracker migration or an explicitly approved shared-reference replacement, preserve existing file contents and historical artifacts. All five strategies use the same manifest, tracker, reports, sessions, backups, handoffs, registered creation path, registered convergence state root, and project-local `.author-toolkit/references/`. Create no strategy-specific state directory. Setup does not alter Git configuration or `.gitignore`.

The six independent skills do not require setup for standalone use. Their standalone contracts live in their own skill directories; the shared reference deployment does not replace those skill-local files.

Use the host's documented command syntax when displaying the next commands. Claude Code plugin installations use `/author-toolkit:write-fiction`, `/author-toolkit:revise-fiction`, `/author-toolkit:revise-draft`, `/author-toolkit:revise-increment`, and `/author-toolkit:revise-request`; Kimi Code adds the `/skill:` prefix. Bare installations use `/write-fiction`, `/revise-fiction`, `/revise-draft`, `/revise-increment`, and `/revise-request` in Claude Code and add `/skill:` to each name in Kimi Code. A host without skill commands should show its skill picker and the exact registered names.

Report setup as ready only when the manifest validates or its concrete errors are reported, all selected paths are registered, every deployed shared reference matches the packaged payload, and all five workflow commands are visible. A `reference-version-conflict` leaves shared workflows blocked. Do not invoke `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, `revise-request`, or another writing skill from setup.
