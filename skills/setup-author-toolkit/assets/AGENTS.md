# Author Toolkit writing project

Match the author's language. Use these instructions to route work and protect shared project state; the active skill's `SKILL.md` and its references supply the full procedure. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and read shared runtime contracts directly from `<setup-skill-root>/assets/references/`; use `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values. Do not copy contracts into the writing project.

## Resolve and route skills

Resolve each skill that the agent will invoke through the Skill tool in the current model-facing skill listing and use its exact registered name, including an `author-toolkit:` qualifier when present. Do not use that listing to check the explicit author entry points below; setup checks the five strategies' host command visibility with the author.

`ask-author`, `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author entry points. When one is needed, display its exact host command and wait for the author; do not invoke it through the Skill tool. Setup, routing, validation, and handoff restoration never start a strategy automatically.

For shared fiction creation or revision, locate `.author-toolkit/project.json`:

- Missing manifest: show the `setup-author-toolkit` command and stop shared work.
- Non-v3.1 manifest: report the unsupported schema version and stop without converting it.
- Incomplete installation: stop shared work and report failures from `node <setup-skill-root>/scripts/doctor.mjs`.
- Create fiction or continue shared creation: show `write-fiction`.
- Work on whole-book Story Bible, macro-structure, complete character arcs, or final review: show `revise-fiction`.
- Diagnose, revise, or review the available draft within a confirmed scope: show `revise-draft`; no outline, ending, or whole-book structure audit is required.
- Revise added or affected paths after incremental creation or import with reusable unchanged-chapter evidence: show `revise-increment`.
- Revise existing content after a full-manuscript scope reaches current-draft revision convergence: show `revise-request`, with request review by default.
- Unclear route: show `ask-author` and the relevant choices.

Use the independent skills directly when their standalone scope matches the request:

| Request | Skill |
| --- | --- |
| Fiction drafting, editing, Story Bible, or brainstorming outside shared creation | `fiction-workshop` |
| Macro plot structure | `story-structure` |
| Character archetypes | `character-archetypes` |
| Narrative nonfiction | `narrative-nonfiction` |
| Sentence-level diagnostics or Chinese AI-associated writing patterns | `prose-mechanics` |
| English AI writing patterns through the upstream catalog | `avoid-ai-writing` |

`author-project`, `author-handoff`, and `author-review` serve shared orchestration and do not replace an author-selected strategy. Standalone work leaves shared project state unchanged unless the author explicitly requests incorporation.

## Run creation or revision from shared state

Use one manifest per book. Resolve registered artifacts through its `paths`; `author-project` owns state operations and writing skills own creative content. All five strategies use the same state. Run one evidence-gated operation and stop at its author gate. Strategy switches occur only at a stable operation gate and never resume a write or commit automatically. A pending action does not authorize a manuscript write or publication.

## Keep author decisions explicit

Manuscript edits require explicit approval of the exact operation, scope, paths, actions, and input versions, recorded in the shared tracker. Discussing or accepting a finding does not approve an edit. Before writing, back up every existing affected file through `author-project`, recompute SHA-256 hashes, verify create-target absence, and stop on any mismatch. Follow the active skill for post-write execution receipts, staged draft acceptance and commit journals, and separately approved restores. Story Bible creative changes require author confirmation.

## Preserve truthful evidence

Resolve an author-supplied inline character range with `node <setup-skill-root>/scripts/range.mjs --project-root <project-root> "<location>"`; positions are 1-based and inclusive and count Unicode code points.

For shared reports, findings, approvals, evidence reuse, and session writes, read the active strategy's pointers to `state-and-findings.md` and `<setup-skill-root>/assets/references/workflow-reporting.md`. For navigation, read `PROJECT_STATE.md` first, then only the tracker sections, sessions, plans, and evidence needed for the requested work; the generated cache is disposable and the manifest, tracker, and current evidence remain authoritative. Use `author-handoff` for session transfer after shared project state is current.

Finish with the current operation and scope, actual or stale coverage, artifact paths, approvals and backups used, unresolved questions, and the exact next author action.
