---
name: ask-author
description: Show the right author-toolkit command and the current shared creation or revision state for a book project.
disable-model-invocation: true
---

# Ask Author

Route the author to an explicit next command. This is a router, not an orchestrator. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

## Route

1. Establish whether the author wants shared fiction creation from scratch, continuation of an existing creation project, revision of an existing manuscript, revision after incremental creation, a new request-driven revision from a full-manuscript base scope that has reached current-draft revision convergence, standalone fiction work, or narrative nonfiction. Select the project root when one exists. For revision, establish whether the goal is whole-book work, scoped revision of an unfinished draft, current-draft revision convergence after scope growth, or revision of existing content while preserving current-draft revision convergence for the full-manuscript target scope.
2. Look for `<project-root>/.author-toolkit/project.json`. If it is missing or has `schema_version: "2.0.0"`, recommend setup first. Display the `setup-author-toolkit` host command and explain that setup registers existing paths without moving files and migrates v2 with a preserved snapshot. After setup, show the creation and revision commands that fit the author's goals. Do not route a missing or v2 manifest directly into shared creation or revision work.
3. For a v3.0 or v3.1 manifest, resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read`, `validate`, and `status`. Bare and `author-toolkit:` qualified names are valid when listed. Display:
   - current scope ID and confirmation status;
   - pending action, status, scope ID, reason, and artifacts, or its absence;
   - every shared stale or blocked evidence item with its reason;
   - unresolved approval, backup, commit, restore, or missing-path errors;
   - the next action from the tracker or latest session note;
   - the exact author command for the selected strategy, plus `author-handoff` when a session transfer is useful.
4. Recommend `write-fiction` for shared creation from scratch or continuation of shared creation state. Recommend `revise-fiction` for a whole-book baseline, structural revision, or final review, and `revise-draft` for scoped mirror revision without requiring whole-book structure. Recommend `revise-increment` after incremental creation or import when unchanged chapters have reusable current-draft evidence and the author wants to revise only added or affected paths before completing a full-target current-scope review. Recommend `revise-request` when the current scope is a full-manuscript scope that has reached current-draft revision convergence and the author wants any type of revision to existing content followed by restored current-draft revision convergence for the full-manuscript target scope. All five are explicit author commands over the same project state and can switch at a stable operation gate without conversion.
5. Keep standalone `fiction-workshop` available for Story Bible, brainstorming, drafting, or editing outside the shared workflow. Do not claim that standalone work updates shared creation or revision state. For standalone Chinese AI-associated pattern detection or approved rewriting, route to `prose-mechanics` with its AI-Isms audit; the upstream standalone `avoid-ai-writing` skill retains its English catalog.
6. If the project is narrative nonfiction, route to standalone `narrative-nonfiction`; do not claim equivalent orchestration through a fiction entry.

Show only the routes matching the author's situation and wait for the author to choose. Do not call `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, `revise-request`, or another routed entry through the Skill tool from this router. `author-project` is permitted only for reading and validating existing v3 state.

## Author-facing commands

Use the host's actual documented syntax. The table shows qualified plugin commands. Bare installations use `/name` in Claude Code and `/skill:name` in Kimi Code. On another host, show its skill picker and exact registered name instead of inventing a command.

| Need | Claude Code | Kimi Code |
|---|---|---|
| Set up, register, or migrate a manuscript project | `/author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:setup-author-toolkit` |
| Create fiction from scratch or continue shared creation | `/author-toolkit:write-fiction` | `/skill:author-toolkit:write-fiction` |
| Revise a whole-book baseline, structure, or final review | `/author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-fiction` |
| Revise an unfinished draft within a confirmed scope | `/author-toolkit:revise-draft` | `/skill:author-toolkit:revise-draft` |
| Revise added or affected chapters after the previous scope has reached current-draft revision convergence and the manuscript grows | `/author-toolkit:revise-increment` | `/skill:author-toolkit:revise-increment` |
| Revise existing content after the full-manuscript base scope has reached current-draft revision convergence | `/author-toolkit:revise-request` | `/skill:author-toolkit:revise-request` |
| Create or restore a session handoff | `/author-toolkit:author-handoff` | `/skill:author-toolkit:author-handoff` |
| Use standalone fiction writing or editing | `/author-toolkit:fiction-workshop` | `/skill:author-toolkit:fiction-workshop` |
| Work on narrative nonfiction | `/author-toolkit:narrative-nonfiction` | `/skill:author-toolkit:narrative-nonfiction` |
| Run sentence-level audits or Chinese AI-Isms detection | `/author-toolkit:prose-mechanics` | `/skill:author-toolkit:prose-mechanics` |
| Run the upstream English AI-writing catalog | `/author-toolkit:avoid-ai-writing` | `/skill:author-toolkit:avoid-ai-writing` |

Routing is complete when the author can see the current or missing shared state and the exact next command. The author, not this skill, starts the selected route.
