---
name: ask-author
description: Show the right author-toolkit command and the current revision state for a book project.
disable-model-invocation: true
---

# Ask Author

Route the author to an explicit next command. This is a router, not an orchestrator.

## Route

1. Establish whether the author has an existing fiction manuscript, wants to write fiction from scratch, or has narrative nonfiction. Select the project root when one exists.
2. Look for `<project-root>/.author-toolkit/project.json`.
3. If a manifest exists, resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read`, `validate`, and `status`. Bare and `author-toolkit:` qualified names are valid when listed. Display:
   - current stage and status;
   - every stale or blocked stage with its reason;
   - unresolved approval or missing-path errors;
   - the next action from the tracker or latest session note;
   - the exact author command for continuing `revise-fiction` at that stage, plus `author-handoff` when a session transfer is useful.
4. If no manifest exists and the author has an existing fiction manuscript, recommend setup first. Display the `setup-author-toolkit` host command and explain that it registers existing paths without moving files. After setup, the author can start `revise-fiction`.
5. If the author wants fiction from scratch, route to the standalone `fiction-workshop` skill for Story Bible and chapter development. Do not claim that this route runs the nine-stage revision workflow.
6. If the project is narrative nonfiction, route to the standalone `narrative-nonfiction` skill. Do not route it through `revise-fiction` or claim equivalent nonfiction orchestration.

Show only the routes matching the author's situation and wait for the author to choose. Do not call `setup-author-toolkit`, `revise-fiction`, or another routed entry through the Skill tool from this router. `author-project` is permitted only for reading and validating existing state.

## Author-facing commands

Use the host's actual documented syntax. The table shows qualified plugin commands. Bare installations use `/name` in Claude Code and `/skill:name` in Kimi Code. On another host, show its skill picker and exact registered name instead of inventing a command.

| Need | Claude Code | Kimi Code |
|---|---|---|
| Set up or register a manuscript project | `/author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:setup-author-toolkit` |
| Continue the fiction revision workflow | `/author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-fiction` |
| Create or restore a session handoff | `/author-toolkit:author-handoff` | `/skill:author-toolkit:author-handoff` |
| Start fiction from scratch | `/author-toolkit:fiction-workshop` | `/skill:author-toolkit:fiction-workshop` |
| Work on narrative nonfiction | `/author-toolkit:narrative-nonfiction` | `/skill:author-toolkit:narrative-nonfiction` |

Routing is complete when the author can see the current or missing state and the exact next command. The author, not this skill, starts the selected route.
