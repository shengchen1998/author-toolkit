---
name: ask-author
description: Show the right author-toolkit command and the current shared creation or revision state for a book project.
disable-model-invocation: true
---

# Ask Author

Route the author to an explicit next command. This is a router, not an orchestrator. When using shared state, resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>`. Use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

## Route

1. Establish whether the author wants shared fiction creation from scratch, continuation of an existing creation project, revision of an existing manuscript, revision after incremental creation, a new request-driven revision from a full-manuscript base scope that has reached current-draft revision convergence, standalone fiction work, or narrative nonfiction. Select the project root when one exists. For revision, establish whether the goal is whole-book work, scoped revision of an unfinished draft, current-draft revision convergence after scope growth, or revision of existing content with request review by default.
2. Look for `<project-root>/.author-toolkit/project.json`. If it is missing, recommend setup first. Display the `setup-author-toolkit` host command and explain that setup registers existing paths without moving files. After setup, show the creation and revision commands that fit the author's goals. If the manifest has any schema version other than `3.1.0`, report that it is unsupported and stop shared work. Do not route a missing or unsupported manifest directly into shared creation or revision work.
3. For a v3.1 manifest, read `../author-project/SKILL.md` and `../author-project/references/read-operations.md`, then run its `read`, `validate`, and `status` procedures separately. These use the shared contracts and validator installed with setup. If they report an incomplete toolkit installation, stop and report the missing installed files; do not deploy contracts into the project. Display:
   - current scope ID and confirmation status;
   - pending action, status, scope ID, reason, and artifacts, or its absence;
   - every shared stale or blocked evidence item with its reason;
   - unresolved approval, backup, commit, restore, or missing-path errors;
   - the next action from the tracker or latest session note;
   - the exact author command for the selected strategy, plus `author-handoff` when a session transfer is useful.
4. Recommend `write-fiction` for shared creation from scratch or continuation of shared creation state. Recommend `revise-fiction` for whole-book Story Bible, macro-structure, complete character arcs, or final review. Recommend `revise-draft` to diagnose, revise, or review the available draft within a confirmed scope; no outline, ending, or whole-book structure audit is required. Recommend `revise-increment` after incremental creation or import when unchanged chapters have reusable current-draft evidence and the author wants to revise only added or affected paths before completing a full-target current-scope review. Recommend `revise-request` when the current scope is a full-manuscript scope that has reached current-draft revision convergence and the author wants any type of revision to existing content with request review by default. Explain that an explicit full-scope review is required to reverify current-draft revision convergence for the full-manuscript target scope. All five are explicit author commands over the same project state and can switch at a stable operation gate without conversion.
5. Use the independent skills directly when their standalone scope matches the request. Keep standalone `fiction-workshop` available for Story Bible, brainstorming, drafting, or editing outside the shared workflow. Standalone work leaves shared project state unchanged unless the author explicitly requests incorporation. For standalone Chinese AI-associated pattern detection or approved rewriting, route to `prose-mechanics` with its AI-Isms audit; the upstream standalone `avoid-ai-writing` skill retains its English catalog. Narrative nonfiction does not have equivalent orchestration through a fiction entry.

| Request | Skill |
| --- | --- |
| Fiction drafting, editing, Story Bible, or brainstorming outside shared creation | `fiction-workshop` |
| Macro plot structure | `story-structure` |
| Character archetypes | `character-archetypes` |
| Narrative nonfiction | `narrative-nonfiction` |
| Sentence-level diagnostics or Chinese AI-associated writing patterns | `prose-mechanics` |
| English AI writing patterns through the upstream catalog | `avoid-ai-writing` |

Show only the routes matching the author's situation and wait for the author to choose. Do not start `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, `revise-request`, or another routed entry internally. `author-project` is permitted only for reading and validating existing v3.1 state.

## Author-facing commands

Codex uses `$name` with the exact unqualified registered skill name.

| Need | Codex command |
|---|---|
| Set up or register a manuscript project | `$setup-author-toolkit` |
| Create fiction from scratch or continue shared creation | `$write-fiction` |
| Revise a whole-book baseline, structure, or final review | `$revise-fiction` |
| Revise an unfinished draft within a confirmed scope | `$revise-draft` |
| Revise added or affected chapters after the previous scope has reached current-draft revision convergence and the manuscript grows | `$revise-increment` |
| Revise existing content after the full-manuscript base scope has reached current-draft revision convergence | `$revise-request` |
| Create or restore a session handoff | `$author-handoff` |
| Use standalone fiction writing or editing | `$fiction-workshop` |
| Work on narrative nonfiction | `$narrative-nonfiction` |
| Run sentence-level audits or Chinese AI-Isms detection | `$prose-mechanics` |
| Run the upstream English AI-writing catalog | `$avoid-ai-writing` |

Routing is complete when the author can see the current or missing shared state and the exact next command. The author, not this skill, starts the selected route.
