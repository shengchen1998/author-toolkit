# Author Toolkit writing project

These instructions govern an agent working in one writing project with Author Toolkit installed. Use them to route work and protect shared state. The active skill's `SKILL.md` and its references supply the full procedure. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and use `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

## Resolve and route skills

Match the author's language. Resolve each skill that the agent will invoke through the Skill tool in the current model-facing skill listing, and use its exact registered name, including an `author-toolkit:` qualifier when present. Do not use that listing to check the explicit author entry points below; setup checks the five strategies' host command visibility with the author.

`ask-author`, `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author entry points. When one is needed, display its exact host command and wait for the author; do not invoke it through the Skill tool. Setup, routing, validation, and handoff restoration never start a strategy automatically.

For shared fiction creation or revision, locate the project root and `.author-toolkit/project.json`:

- If the manifest is missing, show the `setup-author-toolkit` command and stop shared work. Setup registers existing paths without resetting project artifacts; shared contracts remain in the installed setup skill.
- If the manifest is not v3.1, report that its schema version is unsupported and stop shared work. Do not convert or rewrite it.
- If `author-project` reports an incomplete toolkit installation during `read`, `validate`, or `status`, stop shared work and report the failures from `node <setup-skill-root>/scripts/doctor.mjs`. Repair or reinstall the toolkit rather than copying contracts into the writing project.
- To create fiction from scratch or continue shared creation, show the `write-fiction` command.
- For whole-book Story Bible, macro-structure, complete character-arc, or final-review work, show the `revise-fiction` command.
- For diagnosis, revision, prose work, AI cleanup, or review of the available draft within a confirmed scope, show the `revise-draft` command. This path does not require an outline, ending, or whole-book structure audit.
- After incremental creation or import, when unchanged chapters have reusable current-draft evidence, show the `revise-increment` command to revise added or affected paths and complete a full-target current-scope review.
- When the current scope is a full-manuscript scope that has reached current-draft revision convergence and the author requests any type of revision to existing content, show the `revise-request` command. It reviews only changed and affected passages by default; an explicit full-scope review is required to reverify current-draft revision convergence for the full-manuscript target scope.
- When the appropriate route is unclear, show the `ask-author` command and the relevant choices.

Use the independent skills directly when their standalone scope matches the request:

| Request | Skill |
| --- | --- |
| Draft or edit fiction, develop a Story Bible, brainstorm, or work outside shared creation | `fiction-workshop` |
| Map or audit macro plot structure | `story-structure` |
| Identify or audit character archetypes | `character-archetypes` |
| Develop or revise narrative nonfiction | `narrative-nonfiction` |
| Run sentence-level diagnostics on stabilized prose | `prose-mechanics` |
| Detect or rewrite Chinese AI-associated writing patterns | `prose-mechanics` with its AI-Isms audit and local Chinese catalog |
| Detect or rewrite English AI writing patterns through the upstream catalog | `avoid-ai-writing` |

`author-project`, `author-handoff`, and `author-review` serve shared orchestration. They do not replace an author-selected strategy.

## Run creation or revision from shared state

Use one manifest per book. `author-project` owns manifest, path, validation, backup, execution receipt, commit, and restore operations; writing skills own creative content. Resolve the Story Bible, tracker, reports, sessions, backups, handoffs, and `paths.creation` through the manifest rather than assumed defaults. Resolve shared runtime contracts directly from `<setup-skill-root>/assets/references/`; they remain with the installed setup skill and have no manifest field. All five strategies use this same state.

At the start or resumption of an invocation, follow the active entry skill's procedure, including separate `author-project` calls for `read`, `validate`, and `status --digest`. Read `PROJECT_STATE.md` first, then read only the tracker sections, sessions, plans, and evidence needed for the requested work. `read` returns the full manifest and resolved paths through text reads; there is no `read.mjs`. Use `validate` for registered files and current hashes, `status` for recorded blockers and execution evidence, and `status --digest` for navigation. Status reports stale findings across all scopes and does not evaluate operation-specific evidence completeness; the active strategy retains that judgment. The generated navigation cache is not authoritative: the manifest, tracker, and current evidence remain authoritative. Do not read the full tracker or backup index for routine navigation. For routine navigation, use `PROJECT_STATE.md` pointers, targeted artifact reads, or aggregate counts rather than emitting complete file listings of the registered session or backup directories. Run one evidence-gated operation and stop at its author gate. At a stable operation gate, show the author's selected strategy command and wait. Switching preserves scope, evidence, decisions, staging, and backups; it never resumes a write or commit automatically.

When the author supplies an inline character range as `path:line:start-end`, resolve it with `node <setup-skill-root>/scripts/range.mjs --project-root <project-root> "<location>"` instead of ad hoc parsing. Line and character positions are 1-based and inclusive, and characters count Unicode code points. The helper reads one project-relative file and writes nothing; record the resolved text as a quotation or line location in shared artifacts.

Reuse evidence only when its operation, `scope_id`, input versions, requested coverage and subchecks, and dependency state all match the proposed work. Reuse local coverage units by their exact paths and hashes, and reevaluate affected whole-book synthesis after changes. Treat changed inputs or dependencies as stale evidence to reconcile, not as hashes to refresh silently. Creation evidence does not satisfy `chapter-revision`.

A pending action records interrupted or awaiting work. Recheck current evidence and approvals before acting on it; it does not authorize a manuscript write.

## Keep author decisions explicit

Follow the active skill's author decision loop and operation gates. These project invariants remain mandatory:

- Manuscript edits require explicit approval of the exact operation, scope, paths, actions, and input versions, recorded in the shared tracker. Discussing or accepting a finding does not approve an edit; for revisions, complete `<setup-skill-root>/assets/references/context-fit.md` before presenting the proposal.
- Before any write, back up every existing affected file through `author-project`, recompute each existing file's SHA-256 hash, verify each create target's absence, and stop if any approval, path, hash, or dependency no longer matches.
- After each completed edit batch, verify its output hashes and invoke `author-project` with `record-execution`. A backup does not prove execution. Use `status` with the target scope ID and `--require-execution` before claiming current-draft revision convergence or entering work that requires a verified previous or base scope.
- For shared creation, stage proposed text only beneath `<paths.creation>/staging/<batch-id>/` and require acceptance of the exact staged batch and resulting scope before `creation-commit`. Stop interrupted commits for reconciliation.
- Restores require separate explicit approval naming the backup or commit and exact files, plus a safety backup of current content through `author-project`; move batch-created files into that safety backup before removing them. Story Bible creative changes require author confirmation.
- Standalone skill runs leave shared project state unchanged unless the author explicitly requests incorporation of their output under the active strategy's evidence and decision rules.

## Preserve truthful evidence

Before writing a shared report or changing finding or approval status, read the active strategy's pointers to `state-and-findings.md` and `<setup-skill-root>/assets/references/workflow-reporting.md`. Shared diagnostic and review work uses finding v2 and immutable report v2 files; reruns create new reports. Creation operations and report v2 `stage` remain distinct. Standalone skills retain their own skill-local reporting contracts.

Use `author-project next-finding-id` to allocate a complete unused ID block before dispatching new findings, and `record-findings` to batch upsert validated reports into the tracker. Do not manually append finding rows or restart each reviewer at `001`. Preserve prior finding identities and existing author decisions; neither operation grants an approval or replaces semantic reconciliation.

Record actual operation, scope, input, language, and subcheck coverage. Label partial or skipped checks with their reasons. Keep the coverage index beneath registered `paths.reports`. In `revise-draft`, `revise-increment`, `revise-request`, and shared creation, unknown future plot and an unwritten ending remain baseline unknowns unless they cause a concrete problem in existing text.

At each stop, update pending state, the living tracker, and a session note as directed by the active skill, then follow `author-project`'s navigation-cache contract. For a session transfer or context-exhausted stop, use `author-handoff` after shared state is current; handoffs contain paths, IDs, approved decision summaries, and next actions rather than manuscript, story-state, or baseline excerpts. Fresh-reader state remains independent and is transferred only by path.

Finish with the current operation and scope, actual or stale coverage, artifact paths, approvals and backups used, unresolved questions, and the exact next author action.
