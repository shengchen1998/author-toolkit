---
name: setup-author-toolkit
description: Set up or validate an author-toolkit 4.0.0 book project while preserving existing files and paths.
disable-model-invocation: true
---

# Setup Author Toolkit

Register one book project and prepare its shared persistent files. Accept only the project root, an optional manuscript path, and optional language or project metadata. Perform the same setup for every later creation or revision strategy. Use the bundled [controlled workflow terminology](assets/references/terminology.md) while deploying shared references.

## Setup

1. Inspect the project root. Locate `.author-toolkit/project.json`, manuscript text files, and existing operational paths. If several plausible roots or manuscript paths exist, present the choices and let the author select one. Use these defaults only for missing components:
   - `manuscript/`
   - `story-bible.md`
   - `audit-tracker.md`
   - `reports/`
   - `sessions/`
   - `.author-toolkit/backups/`
   - `.author-toolkit/handoffs/`
   - `.author-toolkit/creation/`
   - `.author-toolkit/convergence/`
2. Before any project write, run `node <setup-skill>/assets/runtime/author-project.mjs init --project-root <project-root> --input <initialization.json>` when a manifest exists. Resolve `<setup-skill>` as this installed skill's directory. For a simple default project, `--language <tag>` and optional `--manuscript-root <path>` can replace `--input`. If the response is `greenfield-initialization-required`, stop and report that 4.0.0 requires a new project initialized from manuscript-only input. Preserve the old project and do not deploy references, edit its manifest, or copy its findings, approvals, evaluations, or other shared state into the new project. No migration or old shared-state import is available.
3. For a new 4.0.0 project, `init` deploys the shared references and creates missing directories and only missing skeleton files from the packaged project, Story Bible, audit-tracker, and backup-index templates. It creates no manuscript prose, current scope, pending action, active current-draft convergence cycle, scope or inventory snapshot, or convergence evaluation, and it imports no findings, approvals, or current-draft revision convergence claims. Copy `assets/AGENTS.md` to `<project-root>/AGENTS.md` only when that file is absent; it gives later agents project-level routing and manuscript-safety guidance, and an existing instruction file remains unchanged.
4. For an existing 4.0.0 manifest, `init` validates current state without resetting it. Preserve paths, current scope, pending action, active cycle, completed cycle history, historical evidence, approvals, staged drafts, and backup records. Make no entry-stage or strategy changes and do not infer an active cycle or evaluation.
5. Deploy every file from `assets/references/` to `<project-root>/.author-toolkit/references/` while preserving filenames. For each existing file, compare its SHA-256 hash with the packaged file. Leave matching files unchanged. For a mismatch, leave the existing file untouched, report `reference-version-conflict` with both hashes, and stop shared workflows until the author resolves it. Replace a mismatched file only after explicit author approval for that exact file; run `node <setup-skill>/assets/runtime/author-project.mjs timestamp` and use `result.filename` as the UTC stamp, preserve the existing file beneath `<paths.backups>/reference-updates/<UTC-stamp>/`, copy the packaged file, and record the action in the session note. Do not infer approval from the setup invocation itself.
6. After initialization, run `node <setup-skill>/assets/runtime/validate.mjs --project-root <project-root>`. The self-contained ESM runtime bundles Ajv and its dependencies and loads schemas from `assets/references/`; do not copy runtime code or install dependencies into the writing project. The command checks the manifest before deployed references so old-state diagnostics cannot be hidden by missing or mismatched references, then validates current files, tracker, backups, and scope evidence. Report its exit status and diagnostics. No-argument invocation prints help; `--repository` is reserved for explicit source-development validation.
7. Run `node <setup-skill>/assets/runtime/author-project.mjs status --project-root <project-root>` and report its compact project and reference validation, current scope identity and file count, full-manuscript result, pending action, active cycle and recovery position, evaluation outcome and blockers, decision counts, and exact next action. Use `status --full` only when complete identities, ordered hashes, snapshots, evaluations, or history are needed. Display the manifest path, registered paths, deployment result, and validation result. Show the exact host commands for `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`, with the active cycle's required command taking precedence for manuscript changes. Wait for the author's explicit choice.

## Boundaries

Create no manuscript prose and fill in no Story Bible creative content. Keep every existing file in place. Except for an explicitly approved shared-reference replacement, preserve existing file contents and historical artifacts. All five strategies use the same 4.0.0 manifest, tracker, reports, sessions, backups, handoffs, registered creation path, registered convergence state root, and project-local `.author-toolkit/references/`. Create no strategy-specific state directory. Setup does not alter Git configuration or `.gitignore`.

The six independent skills do not require setup for standalone use. Their standalone contracts live in their own skill directories; the shared reference deployment does not replace those skill-local files.

Use the host's documented command syntax when displaying the next commands. Claude Code plugin installations use `/author-toolkit:write-fiction`, `/author-toolkit:revise-fiction`, `/author-toolkit:revise-draft`, `/author-toolkit:revise-increment`, and `/author-toolkit:revise-request`; Kimi Code adds the `/skill:` prefix. Bare installations use `/write-fiction`, `/revise-fiction`, `/revise-draft`, `/revise-increment`, and `/revise-request` in Claude Code and add `/skill:` to each name in Kimi Code. A host without skill commands should show its skill picker and the exact registered names.

Report setup as ready only when the manifest validates or its concrete errors are reported, all selected paths are registered, every deployed shared reference matches the packaged payload, and all five workflow commands are visible. A `reference-version-conflict` leaves shared workflows blocked. Do not invoke `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, `revise-request`, or another writing skill from setup.
