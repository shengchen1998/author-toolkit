# Layered manuscript review

Use this protocol for every review that needs chunking and for every `collect`. The hierarchy is chunk -> volume/phase -> book. Read actual manuscript text at every leaf; preserve report v2 and finding v2.

## Review job and units

Create or resume one review job per perspective before dispatch. Record its confirmed `scope_id`, review mode, perspective and checklist, ordered manuscript paths and SHA-256 hashes, target reader when applicable, context budget, unit and synthesis status, report paths, and reviewer identity. Use the installed `<setup-skill-root>/assets/references/review-job-schema.json` and `<setup-skill-root>/assets/references/reader-state-schema.json` contracts; this document does not define another JSON schema. Resolve reports and the living coverage index through registered `paths.reports`, and handoffs through `paths.handoffs`.

Measure the available context budget after reserving space for instructions, permitted references, output, and fresh reader-state. Use chapter or scene boundaries rather than arbitrary token cuts: split at chapter boundaries first, then scene boundaries when a chapter does not fit. Split an oversized scene only into contiguous passages with verifiable locations. Cover every in-scope source path exactly once in reading order for each perspective, and record each unit's path, hash, and actual boundaries. Do not infer missing chapters or silently drop text that exceeds the budget.

Group adjacent units by existing volumes or author-selected story phases. Every volume or phase synthesis names its child unit reports and hashes. The book synthesis names every applicable volume/phase synthesis; a one-volume book still has an explicit book synthesis.

## Perspective isolation

The three perspectives remain isolated. Give each reviewer only the inputs permitted in `SKILL.md`; no chunk report, synthesis, reader-state, finding, or author explanation crosses perspectives.

- `intent` and `standards` chunk work may run in parallel in separate contexts. Within each perspective, wait for every required child unit before its volume/phase synthesis and every applicable child synthesis before the book synthesis.
- `fresh` reading is strictly sequential in manuscript order. Use the same logical reviewer for all chunks, volume/phase syntheses, and the book synthesis. After the first unit, that reviewer receives only its own reader-state in addition to the next actual text unit, target reader, and fresh checklist. It receives no other perspective's state, fresh summaries from another reviewer, baselines, plans, or prior reports.

After each fresh unit, persist that reviewer's own reader-state at the path recorded in the review job and handoff. Include only its current reading position, source versions, expectations, questions, and observed responses required to resume. Validate the previous state and source hash before the next unit. A new session can continue the same logical reviewer only by restoring this state with no earlier review context.

For final fresh book synthesis, the same reviewer must have read all actual manuscript text in the current scope sequentially. Reopen original passages for synthesis evidence as needed; the protocol never substitutes summaries for the original manuscript. Missing original reading leaves fresh coverage `partial` or `skipped`, even when chapter or volume summaries are available.

## Reports and findings

Write immutable chunk reports and a synthesis report for each applicable volume/phase and book level. Use the selected mode's report v2 `stage`, actual source versions, one perspective in `subchecks`, and human-readable `Language coverage` and `Review coverage` sections. Record unit identity, parent or child report paths, execution path, and degraded context in `engine.notes` without adding fields to the closed envelope. Validate each report when the installed validator is available.

A unit can have full coverage while its report remains partial for the requested whole operation. A synthesis is full only when all its required children and applicable checklist coverage are complete. Otherwise mark it `partial` or `skipped`, identify every missing unit or check, and leave the corresponding review job incomplete.

Report concrete observations at real locations. In human-readable synthesis and tracker notes, cross-file findings cite every real contributing location. Since finding v2 stores one location per finding, use linked findings for additional verified locations and retain the narrowest truthful location in each. Never invent a single file, chapter, line, or quotation to contain a cross-file issue.

## Collect and finish

`collect` validates the review job and coverage before consolidating. Check the review ID, mode, scope, perspective, ordered source paths and hashes, every required unit, parent-child links, applicable syntheses, report envelopes, and finding IDs. For fresh, also verify one logical reviewer, strict unit order, and an unbroken chain of its own reader-state. Reject reports from another scope, perspective, source version, or reviewer chain as evidence for the missing coverage.

Return a gap list and `partial` or `skipped` coverage when anything is missing. A perspective is complete only when every required unit and every applicable synthesis for that perspective is complete. `all` is complete only when this holds for intent, standards, and fresh under the same current scope and review mode. A consolidated report preserves all finding IDs, perspectives, and disagreements; it does not repair missing coverage or authorize edits.
