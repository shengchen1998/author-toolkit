# Independent Review Handoff

- Review ID:
- Perspective: `intent`, `standards`, or `fresh`
- Created at:
- Project root:
- Manuscript scope in reading order:
- Report destination:
- Finding ID prefix:

## Permitted inputs

List only the inputs assigned to this perspective in `author-review/SKILL.md`.

- Intent: manuscript paths, Story Bible path, approved revision-plan path, and `skills/author-review/references/checklists.md`.
- Standards: manuscript paths and `skills/author-review/references/checklists.md` only.
- Fresh: manuscript paths, target reader description, and `skills/author-review/references/checklists.md` only.

Delete the two lines that do not apply. The fresh handoff must state the target reader inline in one concise metadata line, without author explanation or plot summary.

## Review task

1. Start a new session with no earlier review or self-assessment context.
2. Invoke the exact registered `author-review` skill with the named perspective and this handoff path.
3. Read only the assigned section of the checklist and the permitted inputs above.
4. Produce finding v2 with the narrowest truthful location scope, a recommendation, and judgment confidence. Use audit name `author-review-<perspective>` and the assigned uppercase ID prefix. Finding status belongs in the tracker.
5. Write one Markdown file with human-readable scope, a `Language coverage` section, and exactly one report v2 JSON envelope at the report destination. Use `engine.name: "conversational"` and record separate-session execution, version or `unknown`, degradation, and actual coverage in the engine fields.
6. Return the report path and finding count. Make no manuscript or Story Bible edits.

## Resume command

Use the host's documented author command with `perspective=<named perspective>` and `handoff=<this path>`. Claude Code plugin form: `/author-toolkit:author-review`. Kimi Code plugin form: `/skill:author-toolkit:author-review`. Bare forms are `/author-review` in Claude Code and `/skill:author-review` in Kimi Code. If the host has no skill commands, use its skill picker and the exact registered skill name.
