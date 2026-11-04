---
name: author-review
description: Use when running independent final or current-scope manuscript reviews for intent and consistency, writing standards, and a fresh target reader, or preparing separate review handoffs when subagents are unavailable.
---

# Author Review

Organize three independent reviews and produce findings only. Accept `all`, one perspective (`intent`, `standards`, or `fresh`), or `collect`, plus a project root, review job, or review handoff. Accept `review_mode=final|current-scope`; the default is `final`.

This skill does not revise prose, update Story Bible creative content, or apply fixes. When called by `write-fiction`, `revise-fiction`, `revise-draft`, or `revise-increment`, the caller owns manifest and tracker writes. Standalone use leaves shared project state unchanged unless the author explicitly incorporates the resulting reports later.

## Prepare

1. Read [`references/checklists.md`](references/checklists.md), including its review-mode applicability rules. Read [`references/chunked-review.md`](references/chunked-review.md) before planning, resuming, or collecting a review. Read the report envelope and finding identity sections of `../revise-fiction/references/state-and-findings.md`; its state-write instructions remain the caller's responsibility.
2. For project input, resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read` and `status`. Bare and `author-toolkit:` qualified names are supported when listed. These are the only Skill calls this skill may make. Do not call other skills from a reviewer or subagent.
3. Select the review mode and its output identity:

| Review mode | Report directory under `paths.reports` | Report v2 `stage` | Handoff subdirectory under `paths.handoffs` |
|---|---|---|---|
| `final` | `final-review/` | `final-review` | `final-review/` |
| `current-scope` | `current-scope-review/` | `current-scope-review` | `current-scope-review/` |

   With default paths, these report destinations are `reports/final-review/` and `reports/current-scope-review/`. Use unique UTC-stamped filenames. Creation callers retain their own operation identity and never add a creation operation to report v2 `stage`.
4. Establish one confirmed `scope_id` and one manuscript scope for all three perspectives. A final review covers the whole book. A current-scope review covers only the confirmed current scope and never claims whole-book final approval. Apply the checklist's skipped-item rules for whole-book questions that do not apply.
5. Create or resume one review job per requested perspective and its chunk -> volume/phase -> book plan from actual manuscript paths, hashes, chapter or scene boundaries, and the available context budget. Use the installed review-job and reader-state artifact contracts; the handoff carries their paths rather than copying their content.
6. Use the uppercase finding ID prefixes `INTENT`, `STANDARD`, and `READER`. Every reviewer uses judgment confidence and includes a recommendation. The caller enters returned findings as `open` in the shared tracker; status is not a finding v2 property.
7. Preserve input independence as follows:

| Perspective | Permitted inputs |
|---|---|
| Intent and consistency | Manuscript, Story Bible, approved draft-baseline when supplied, approved revision plan, and intent checklist |
| Writing standards | Manuscript and writing standards checklist only; exclude previous self-assessments, Story Bible, draft-baseline and other baselines, plans, and prior review reports |
| Fresh reader | Actual manuscript units in sequence, target reader description, fresh-reader questions, and only its own reader-state after the first unit; exclude all other review and baseline inputs |

## Run layered reviews

Follow [`references/chunked-review.md`](references/chunked-review.md) for unit coverage, synthesis dependencies, reader-state, findings, and completion. Dispatch independent perspectives with fresh contexts. `intent` and `standards` chunk work may run in parallel; the `fresh` chain remains strictly sequential with one logical reviewer. Do not share one perspective's output with another.

Write immutable chunk reports and each applicable volume/phase and book synthesis report with human-readable scope, a `Language coverage` section, a `Review coverage` section, and exactly one report v2 JSON envelope. Mark inapplicable whole-book checklist items `skipped` with reasons in current-scope mode and record every other gap truthfully.

Use `engine.name: "conversational"` and record the actual execution path, version or `unknown`, and degradation. Every report's `engine.notes` contains:

- `scope_id=<actual-scope-id>`;
- actual `operation_coverage=full|partial|skipped`;
- `subchecks=intent`, `subchecks=standards`, or `subchecks=fresh` for one perspective.

For a consolidated report containing all perspectives, use `subchecks=intent,standards,fresh` and the same scope ID. Preserve every finding ID and disagreement. `collect` validates the review job and coverage, including all units and syntheses and the fresh reader-state chain, before reporting consolidated or remaining coverage.

## Run without subagents

Resolve `paths.handoffs` and create resumable handoffs from [`assets/review-handoff-template.md`](assets/review-handoff-template.md) beneath the mode-specific `<paths.handoffs>/<review-mode-directory>/<review-id>/`. Use the registered custom directory when present. Give each handoff only its permitted inputs, review-job path, next unfinished unit, report destination, and resume command. Only the fresh handoff names its own reader-state path.

Stop while work is pending. Resume the named perspective in a separate session, write the completed chunk or synthesis report, update the review job and handoff to the next unfinished unit, and stop again when no further work fits. Fresh sessions continue the same logical reviewer only through that reviewer's own reader-state. Once all required evidence exists, the author can invoke `author-review` with `collect` and the same review mode or return to the calling strategy's review operation.

## Findings and completion

Use `author-review-intent`, `author-review-standards`, and `author-review-fresh-reader` as audit names. Report concrete observations at verified locations. Linked cross-file findings retain real locations; no broad issue receives an invented single-file location. Produce no manuscript replacements or automatic resolutions.

A perspective is complete only when every required unit and applicable synthesis validates and covers the agreed scope, with all gaps disclosed. `all` is complete only when all three perspectives meet that condition for the same current `scope_id` and review mode. Return report paths, actual coverage, and finding counts; do not start another operation or describe current-scope or milestone evidence as whole-book final review.
