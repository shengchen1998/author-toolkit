# Author Toolkit writing project

Match the author's language. The active skill's `SKILL.md` and its references supply the full procedure. Resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and read shared runtime contracts directly from `<setup-skill-root>/assets/references/`; use `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values. Do not copy contracts into the writing project.

## Resolve and route skills

Resolve each skill that the agent will invoke through the Skill tool in the current model-facing skill listing and use its exact registered name, including an `author-toolkit:` qualifier when present. Do not use that listing to check the explicit author entry points below; setup checks the five strategies' host command visibility with the author.

For author-facing commands in Codex, use `$` followed by the exact unqualified registered skill name, such as `$write-fiction`, and check visibility in the `$` autocomplete. Do not display `/skill:` or a Claude Code plugin qualifier as a Codex command. On other hosts, use their documented syntax rather than inferring it from the model's name or identity.

`ask-author`, `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author entry points. When one is needed, display its exact host command and wait for the author; do not invoke it through the Skill tool. Setup, routing, validation, and handoff restoration never start a strategy automatically. Read the installed `ask-author` skill's `SKILL.md` before selecting among shared strategies or independent skills; when the route is unclear, show its host command and the relevant choices.

For shared fiction creation or revision, locate `.author-toolkit/project.json`:

- Missing manifest: show the `setup-author-toolkit` command and stop shared work.
- Non-v3.1 manifest: report the unsupported schema version and stop without converting it.
- Incomplete installation: stop shared work and report failures from `node <setup-skill-root>/scripts/doctor.mjs`.

`author-project`, `author-handoff`, and `author-review` serve shared orchestration and do not replace an author-selected strategy. Standalone work leaves shared project state unchanged unless the author explicitly requests incorporation.

## Run creation or revision from shared state

Use one manifest per book. Resolve registered artifacts through its `paths`; `author-project` owns state operations and writing skills own creative content. All five strategies use the same state. Run one evidence-gated operation and stop at its author gate. Strategy switches occur only at a stable operation gate and never resume a write or commit automatically. A pending action does not authorize a manuscript write or publication.

## Keep author decisions explicit

Manuscript edits require explicit approval of the exact operation, scope, paths, actions, and input versions, recorded in the shared tracker. Discussing or accepting a finding does not approve an edit. Story Bible creative changes require author confirmation. Follow the active strategy and `author-project` for complete-batch backups, execution receipts, staged draft acceptance, commit journals, and separately approved restores.

For shared reports, findings, approvals, evidence reuse, navigation, and session transfer, follow the active strategy and `author-project`; the manifest, tracker, and current evidence remain authoritative.
