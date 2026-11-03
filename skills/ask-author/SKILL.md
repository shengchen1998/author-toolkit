---
name: ask-author
description: Show the right author-toolkit command and the current shared revision state for a book project.
disable-model-invocation: true
---

# Ask Author

Route the author to an explicit next command. This is a router, not an orchestrator.

## Route

1. Establish whether the author has an existing fiction manuscript, wants to write fiction from scratch, or has narrative nonfiction. Select the project root when one exists. For an existing manuscript, establish whether the goal is a whole-book baseline, structural revision, or final review, or scoped mirror revision of an unfinished draft without requiring whole-book structure.
2. Look for `<project-root>/.author-toolkit/project.json`. If it is missing or has `schema_version: "2.0.0"`, recommend setup first. Display the `setup-author-toolkit` host command and explain that setup registers existing paths without moving files and migrates v2 with a preserved snapshot. After setup, show both revision commands and let the author choose by goal. Do not route a v2 manifest through revision work.
3. For a v3 manifest, resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read`, `validate`, and `status`. Bare and `author-toolkit:` qualified names are valid when listed. Display:
   - current scope ID and confirmation status;
   - pending operation, status, scope, reason, and artifacts, or its absence;
   - every shared stale or blocked evidence item with its reason;
   - unresolved approval, backup, restore, or missing-path errors;
   - the next action from the tracker or latest session note;
   - the exact author command for the selected strategy, plus `author-handoff` when a session transfer is useful.
4. Recommend `revise-fiction` when the author wants a whole-book baseline, structural revision, or final review. Recommend `revise-draft` when the author wants scoped mirror revision of an unfinished draft without considering whole-book structure. Both are explicit author commands over the same project state; neither requires a state conversion when the author switches.
5. If the author wants fiction from scratch, route to the standalone `fiction-workshop` skill for Story Bible and chapter development. Do not claim that this route runs either revision strategy over an existing manuscript.
6. If the project is narrative nonfiction, route to the standalone `narrative-nonfiction` skill. Do not route it through `revise-fiction` or `revise-draft`, or claim equivalent nonfiction orchestration.

Show only the routes matching the author's situation and wait for the author to choose. Do not call `setup-author-toolkit`, `revise-fiction`, `revise-draft`, or another routed entry through the Skill tool from this router. `author-project` is permitted only for reading and validating existing v3 state.

## Author-facing commands

Use the host's actual documented syntax. The table shows qualified plugin commands. Bare installations use `/name` in Claude Code and `/skill:name` in Kimi Code. On another host, show its skill picker and exact registered name instead of inventing a command.

| Need | Claude Code | Kimi Code |
|---|---|---|
| Set up, register, or migrate a manuscript project | `/author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:setup-author-toolkit` |
| Revise a whole-book baseline, structure, or final review | `/author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-fiction` |
| Revise an unfinished draft within a confirmed scope | `/author-toolkit:revise-draft` | `/skill:author-toolkit:revise-draft` |
| Create or restore a session handoff | `/author-toolkit:author-handoff` | `/skill:author-toolkit:author-handoff` |
| Start fiction from scratch | `/author-toolkit:fiction-workshop` | `/skill:author-toolkit:fiction-workshop` |
| Work on narrative nonfiction | `/author-toolkit:narrative-nonfiction` | `/skill:author-toolkit:narrative-nonfiction` |

Routing is complete when the author can see the current or missing shared state and the exact next command. The author, not this skill, starts the selected route.
