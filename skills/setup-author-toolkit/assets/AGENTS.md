# Author Toolkit writing project

Match the author's language. The active skill's `SKILL.md` and its references supply the full procedure. Toolkit skills from one installation are siblings. For `setup-author-toolkit`, `<setup-skill-root>` is its own installed directory; from another toolkit skill, resolve it as `../setup-author-toolkit` relative to that skill's installed directory. Read shared runtime contracts directly from `<setup-skill-root>/assets/references/`; use `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values. Do not copy contracts into the writing project.

## Resolve and route skills

Read each semantic skill's installed `SKILL.md` and applicable references, then execute its procedure directly. When a reference routes to selected sections, use the host's heading search and bounded line-range reads to load only the applicable routing row and linked sections, ending each section before the next same-level heading. For `operations.md` and `state-and-findings.md`, use one full read when the required content forms noncontiguous ranges, unless the active strategy supplies an explicit bounded multi-section route naming every required section; follow that strategy route for its branch. Deterministic shared-state transactions have one installed CLI implementation and no model-executed counterpart. Assume the explicit author entry points below are installed; do not check their host visibility or infer availability from model-facing registry metadata.

For author-facing entries, use the current host's skill command or skill picker with the exact unqualified registered skill name, such as `write-fiction`.

`ask-author`, `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` are explicit author entry points. When one is needed, display its exact host command, or its exact registered skill name when the host uses only a skill picker, and wait for the author; do not start it as an internal callee. Setup, routing, validation, and handoff restoration never start a strategy automatically. When the route is unclear, show the `ask-author` host command or registered skill name and wait; `ask-author` owns strategy selection.

For shared fiction creation or revision, locate `.author-toolkit/project.json`:

- Missing manifest: show the `setup-author-toolkit` command and stop shared work.
- Non-v3.1 manifest: report the unsupported schema version and stop without converting it.
- Incomplete installation: stop shared work and report failures from `node <setup-skill-root>/scripts/doctor.mjs`.

`author-project`, `author-handoff`, and `author-review` serve shared orchestration and do not replace an author-selected strategy. Standalone work leaves shared project state unchanged unless the author explicitly requests incorporation.

## Run creation or revision from shared state

At routine strategy start or resume, run `node <setup-skill-root>/scripts/check.mjs --project-root <project-root> --digest --json` with the active strategy's required `--require-sibling NAME` arguments. Use its bounded projection, validation, ordinary status, and refreshed cache instead of repeating standalone inspection commands. If it fails, rerun it with the same sibling arguments and `--diagnose` instead of `--digest`, report the failure, and stop at the active strategy's author gate.

Use one manifest per book and resolve registered artifacts through its `paths`. Run one evidence-gated operation and stop at its author gate; a pending action never authorizes a manuscript write or publication. Follow the active strategy for stable operation gates, shared state, and ownership of state operations and creative content.

## Keep author decisions explicit

Manuscript edits require explicit approval of the exact operation, scope, paths, actions, and input versions; discussing or accepting a finding does not approve an edit. Restores require separate approval, and Story Bible creative changes require author confirmation. Follow the active strategy and `author-project` for complete write procedures, reports, findings, evidence reuse, navigation, and session transfer; the manifest, tracker, and current evidence remain authoritative.
