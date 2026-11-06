# Author Toolkit writing project

Route work and protect shared state. Match the author's language and exact registered skill names. The active skill's `SKILL.md` and its references supply full procedures.

## Project and routing

For shared work, locate `<project-root>` and `<project-root>/.author-toolkit/project.json`. Use one manifest per book. `author-project` owns state, validation, paths, backups, commits, and restores; writing skills own creative content. Use manifest `paths` for artifacts and `<project-root>/.author-toolkit/references/` for contracts.

Read `<project-root>/.author-toolkit/references/terminology.md` for shared terms, operation identifiers, and contract values. For reports and tracker changes, follow the active strategy's `state-and-findings.md` pointer and read `.author-toolkit/references/workflow-reporting.md`.

At entry or resume, run the active skill's `author-project` `read`, `validate`, and `status` checks. Run one evidence-gated operation and stop at its author gate. A pending action does not authorize a manuscript write, publication, restore, or completion.

These entries require an explicit author command. Display the exact host command and wait; never invoke another user entry through the Skill tool.

| Need | User entry |
| --- | --- |
| Setup; missing or legacy manifest; missing or mismatched references | `setup-author-toolkit`; stop shared work |
| Create or continue fiction | `write-fiction` |
| Available-draft revision; first-time bootstrap publication; previous full-manuscript scope without current-draft revision convergence | `revise-draft` |
| Added or affected paths from a previous full-manuscript scope with current-draft revision convergence | `revise-increment` |
| Author-defined revision from a full-manuscript base scope with current-draft revision convergence | `revise-request` |
| Whole-book Story Bible, structure, character, or final-review work | `revise-fiction` |
| Inspect state or clarify routing | `ask-author` |

## Manuscript safety

At a stable operation gate, an active current-draft convergence cycle permits only exact recovery and read-only inspection; block parallel manuscript-changing cycles. Stage creation beneath `<paths.creation>/staging/<batch-id>/` until exact batch and publication-scope acceptance.

Before any manuscript edit, present the exact operation, scope, paths, actions, and input versions; obtain explicit current author approval in the tracker; back up every existing affected file; recompute each SHA-256 hash and verify create targets are absent immediately before writing. Stop on mismatch and follow the active skill's execution and commit-journal procedures.

A restore requires separate explicit approval naming the backup or commit and exact files, plus a safety backup. After external manuscript changes, use `author-project reconcile-manuscript` with the required inventory, story-state, scope, and `creation-import` decision before dependent work. Never silently refresh hashes or stale evidence. Preserve immutable history.
