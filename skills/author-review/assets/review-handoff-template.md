# Independent Review Handoff

- Review ID:
- Review mode: `final` or `current-scope`
- Perspective: `intent`, `standards`, or `fresh`
- Scope ID:
- Report stage: `final-review` or `current-scope-review`
- Created at:
- Project root:
- Manuscript scope in reading order, with SHA-256 hashes:
- Review job path:
- Next unfinished unit or synthesis:
- Report destination:
- Reader-state path: fresh only
- Finding ID prefix:

Use the installed review-job and reader-state artifact contracts. This handoff records pointers and resume state, not their JSON fields or content.

## Permitted inputs

List only the inputs assigned to this perspective in `author-review/SKILL.md`.

- Intent: manuscript paths, Story Bible path, approved draft-baseline path when supplied, approved revision-plan path, and `skills/author-review/references/checklists.md`.
- Standards: manuscript paths and `skills/author-review/references/checklists.md` only; no baselines, plans, or prior reports.
- Fresh: the next actual manuscript unit in reading order, target reader description, this reviewer's own reader-state path after the first unit, and `skills/author-review/references/checklists.md` only; no baselines, plans, prior reports, other reader-state, or author explanations.

Delete the two lines that do not apply. State the fresh target reader inline in one concise metadata line without author explanation or plot summary. Keep all three perspectives isolated.

## Review task

1. Start or resume a session with no earlier review or self-assessment context. For fresh, restore only the named reader-state so the same logical reviewer continues in strict manuscript order.
2. Invoke the exact registered `author-review` skill with the named perspective, review mode, scope ID, and this handoff path.
3. Read `skills/author-review/references/chunked-review.md`, only the assigned checklist section, and permitted inputs. Validate the review job, source hashes, next unit, and applicable parent synthesis before reviewing.
4. Review actual manuscript text within the context budget. Produce finding v2 with the narrowest truthful location, a recommendation, and judgment confidence. Link related cross-file findings without inventing one location.
5. Write the assigned immutable chunk or synthesis report with human-readable scope, `Language coverage` and `Review coverage` sections, and exactly one report v2 JSON envelope at the report destination. Use the handoff's report stage and disclose every `partial` or `skipped` unit and check.
6. Use `engine.name: "conversational"` and record separate-session execution, version or `unknown`, and degradation. Include `scope_id=<actual-scope-id>`, actual `operation_coverage=full|partial|skipped`, and the single actual `subchecks=intent|standards|fresh` value in `engine.notes`.
7. Update the review job with actual coverage and the next unfinished unit or synthesis. For fresh, persist only this reviewer's reader-state after the unit. Update this handoff's next action without copying manuscript, reports, findings, or reader-state content into it.
8. Return the report path, actual coverage, and finding count. Make no manuscript or Story Bible edits.

## Resume command

Use the host's documented author command with `review_mode=<named mode>`, `perspective=<named perspective>`, `scope_id=<scope ID>`, and `handoff=<this path>`. Claude Code plugin form: `/author-toolkit:author-review`. Kimi Code plugin form: `/skill:author-toolkit:author-review`. Bare forms are `/author-review` in Claude Code and `/skill:author-review` in Kimi Code. If the host has no skill commands, use its skill picker and the exact registered skill name.
