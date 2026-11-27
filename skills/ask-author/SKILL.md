---
name: ask-author
description: Show the right author-toolkit command and the current shared creation or revision state for a book project.
disable-model-invocation: true
version: 3.1.0
---

# Ask Author

Route the author to an explicit next command. This is a router, not an orchestrator. Toolkit skills from one installation are siblings. When using shared state, resolve `<setup-skill-root>` as `../setup-author-toolkit` relative to this skill's installed directory. Use the controlled workflow terminology in `<setup-skill-root>/assets/references/terminology.md` for shared terms and exact contract values.

## Route

1. Establish whether the author wants standalone fiction drafting from scratch, a new shared creation batch or full-book revision from a full-manuscript base scope that has reached current-draft revision convergence, revision of an existing manuscript, revision after incremental creation, request-driven revision from that full-manuscript base scope at current-draft revision convergence, other standalone fiction work, or narrative nonfiction. Select the project root when one exists. For revision, establish whether the goal is whole-book work, scoped revision of an unfinished draft, current-draft revision convergence after scope growth, or revision of existing content with request review by default.
2. Look for `<project-root>/.author-toolkit/project.json`. If it is missing, recommend setup first. Display the `setup-author-toolkit` host command and explain that setup registers existing paths without moving files. After setup, show the creation and revision commands that fit the author's goals. If the manifest has any schema version other than `3.1.0`, report that it is unsupported and stop shared work. Do not route a missing or unsupported manifest directly into shared creation or revision work.
3. For a v3.1 manifest, read `../author-project/SKILL.md` and `../author-project/references/read-operations.md`, then run its `read`, `validate`, and `status` procedures separately. These use the shared contracts and validator installed with setup. If they report an incomplete toolkit installation, stop and report the missing installed files; do not deploy contracts into the project. Display:
   - current scope ID and confirmation status;
   - pending action, status, scope ID, reason, and artifacts, or its absence;
   - every shared stale or blocked evidence item with its reason;
   - unresolved approval, backup, commit, restore, or missing-path errors;
   - the next action from the tracker or latest session note;
   - the exact author command for the selected strategy, plus `author-handoff` when a session transfer is useful.
4. Apply the selected strategy's complete entry gate before recommending `write-fiction` for a new creation batch, `revise-fiction` for a new full-book revision, or `revise-request` for existing content. Each requires a confirmed full-manuscript base scope that has reached current-draft revision convergence and a passing strict execution check; a recorded statement of that state does not replace verification. When creation or import grew the scope after a verified previous scope, recommend `revise-increment`; otherwise recommend `revise-draft` to establish or restore the required state. An active creation batch, full-book revision, or request may resume with its verified base scope as historical evidence under that strategy's resume rule. Recommend `revise-draft` to diagnose, revise, or review the available draft within a confirmed scope; no outline, ending, or whole-book structure audit is required. Recommend `revise-increment` after incremental creation or import when the previous scope has reached current-draft revision convergence, unchanged chapters have reusable current-draft evidence, and the author wants to revise only added or affected paths before completing a full-target current-scope review. Explain that an explicit full-scope review is required to reverify current-draft revision convergence after request review. All five are explicit author commands over the same project state and can switch at a stable operation gate without conversion; switching does not waive an entry gate.
5. Use the independent skills directly when their standalone scope matches the request. Use standalone `fiction-workshop` for initial drafting from scratch before a shared full-manuscript base scope exists, and keep it available for Story Bible, brainstorming, drafting, or editing outside the shared workflow. Standalone work leaves shared project state unchanged unless the author explicitly requests incorporation. For standalone Chinese AI-associated pattern detection or approved rewriting, route to `prose-mechanics` with its AI-Isms audit; the upstream standalone `avoid-ai-writing` skill retains its English catalog. Narrative nonfiction does not have equivalent orchestration through a fiction entry.

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

Start user entries through the current host's skill command or skill picker with the exact unqualified registered skill name.

| Need | Registered skill |
|---|---|
| Set up or register a manuscript project | `setup-author-toolkit` |
| Start a new shared creation batch after the full-manuscript base scope has reached current-draft revision convergence, or resume an active batch | `write-fiction` |
| Start a new whole-book revision after the full-manuscript base scope has reached current-draft revision convergence, or resume an active revision | `revise-fiction` |
| Revise an unfinished draft within a confirmed scope | `revise-draft` |
| Revise added or affected chapters after the previous scope has reached current-draft revision convergence and the manuscript grows | `revise-increment` |
| Revise existing content after the full-manuscript base scope has reached current-draft revision convergence | `revise-request` |
| Create or restore a session handoff | `author-handoff` |
| Use standalone fiction writing or editing | `fiction-workshop` |
| Work on narrative nonfiction | `narrative-nonfiction` |
| Run sentence-level audits or Chinese AI-Isms detection | `prose-mechanics` |
| Run the upstream English AI-writing catalog | `avoid-ai-writing` |

Routing is complete when the author can see the current or missing shared state and the exact next command. The author, not this skill, starts the selected route.
