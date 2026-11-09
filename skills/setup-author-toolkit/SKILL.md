---
name: setup-author-toolkit
description: Set up or validate a v3.1 author-toolkit book project while preserving manuscript, evidence, and registered paths.
disable-model-invocation: true
---

# Setup Author Toolkit

Register one book project and prepare its shared persistent files. Accept only the project root, an optional manuscript path, and optional language or project metadata. There is no entry-stage or workflow argument. Perform the same setup for every later creation or revision strategy. Use the bundled [controlled workflow terminology](assets/references/terminology.md) for shared terms and exact contract values.

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
3. Keep every shared runtime contract in this installed skill's `assets/references/` payload and resolve it directly from that location. Confirm that the payload and the self-contained `scripts/validate.mjs`, `scripts/status.mjs`, `scripts/project-digest.mjs`, and `scripts/findings.mjs` CLIs are present. If a required installed file is missing, report an incomplete toolkit installation and stop. Do not copy shared contracts into the writing project.
4. Resolve `author-project` in the current skill listing and copy its registered name exactly. It may appear as `author-project` or `author-toolkit:author-project`. Invoke that exact name with `initialize`, the selected root and paths, project metadata, and BCP 47 language. If neither name is registered, stop and identify the missing dependency.
5. On every setup, replace `<project-root>/AGENTS.md` with a regular file containing `assets/AGENTS.md`, and replace any existing `CLAUDE.md` file or symlink with a relative symlink named `CLAUDE.md` pointing to `AGENTS.md`, so project-level routing and manuscript-safety guidance track the installed toolkit. After checking that neither target is a directory, remove any existing regular files or symlinks with `rm -f AGENTS.md CLAUDE.md`, copy the template to `AGENTS.md`, then run `ln -s AGENTS.md CLAUDE.md`; `ln -sfn` alone cannot replace a regular `CLAUDE.md`. If either target is a directory, or any operation fails, stop and report the error rather than recursively deleting anything. Verify that `AGENTS.md` matches the bundled template and `CLAUDE.md` resolves to it. This replacement is limited to these two project-root files and applies to new projects and existing v3.1 projects.
6. For a new project, create missing directories and write only missing skeleton files. Use `../author-project/assets/story-bible-template.md` and the neutral `../author-project/assets/audit-tracker-template.md`. Write supplied project metadata only where the templates request it and leave creative fields empty. Fill the new tracker's project root and manifest timestamp. Leave current scope and pending action unset for the selected skill to establish with the author.
7. For an existing v3.1 manifest, `initialize` only validates it. Preserve its paths, current scope, pending action, historical evidence, approvals, staged drafts, and backup records. Make no entry-stage or strategy changes. For any other schema version, report that it is unsupported and stop without changing it. Finish with a separate `validate` call after creation or validation.
8. Display the manifest path, registered paths, installed shared reference location, validation result, current scope, pending action, and shared stale or blocked evidence. Show the exact host commands for `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`. Explain that the skill the author explicitly starts will confirm the entry operation with the author. Wait for that choice.

## Boundaries

Create no manuscript prose and fill in no Story Bible creative content. Except for the two project-root agent entry files described above, preserve existing file contents and historical artifacts. All five strategies use the same manifest, tracker, reports, sessions, backups, handoffs, registered creation path, and shared references installed with this setup skill. Create no strategy-specific state directory. Setup does not alter Git configuration or `.gitignore`.

The six independent skills do not require setup for standalone use. Their standalone contracts live in their own skill directories; the installed shared reference payload does not replace those skill-local files.

Use the host's documented command syntax when displaying the next commands. Claude Code plugin installations use `/author-toolkit:write-fiction`, `/author-toolkit:revise-fiction`, `/author-toolkit:revise-draft`, `/author-toolkit:revise-increment`, and `/author-toolkit:revise-request`; Kimi Code adds the `/skill:` prefix. Bare installations use `/write-fiction`, `/revise-fiction`, `/revise-draft`, `/revise-increment`, and `/revise-request` in Claude Code and add `/skill:` to each name in Kimi Code. A host without skill commands should show its skill picker and the exact registered names.

Report setup as ready only when the manifest validates or its concrete errors are reported, all selected paths are registered, the required installed shared references and CLIs are present, and all five workflow commands are visible. Do not invoke `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, `revise-request`, or another writing skill from setup.
