---
name: author-review
description: Use when running independent final or current-scope manuscript reviews for intent and consistency, writing standards, and a fresh target reader, or preparing separate review handoffs when subagents are unavailable.
---

# Author Review

Organize three independent reviews and produce findings only. Accept `all`, one perspective (`intent`, `standards`, or `fresh`), or `collect`, plus a project root or review handoff. Accept `review_mode=final|current-scope`; the default is `final`, preserving existing behavior.

This skill does not revise prose, update Story Bible creative content, or apply fixes. When called by `revise-fiction` or `revise-draft`, the caller owns manifest and tracker writes. Standalone use leaves shared project state unchanged unless the author explicitly incorporates the resulting reports later.

## Prepare

1. Read [`references/checklists.md`](references/checklists.md), including its review-mode applicability rules. Read the report envelope and finding identity sections of `../revise-fiction/references/state-and-findings.md`; its state-write instructions remain the caller's responsibility.
2. For project input, resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read` and `status`. Bare and `author-toolkit:` qualified names are supported when listed. These are the only Skill calls this skill may make. Do not call other skills from a reviewer or subagent.
3. Select the review mode and its output identity:

| Review mode | Report directory under `paths.reports` | Report v2 `stage` | Handoff subdirectory under `paths.handoffs` |
|---|---|---|---|
| `final` | `final-review/` | `final-review` | `final-review/` |
| `current-scope` | `current-scope-review/` | `current-scope-review` | `current-scope-review/` |

   With default paths, these report destinations are `reports/final-review/` and `reports/current-scope-review/`. Use unique UTC-stamped filenames in the selected directory.
4. Establish one confirmed `scope_id` and one manuscript scope for all three perspectives. A final review covers the whole book. A current-scope review covers only the confirmed current scope and never claims whole-book final approval. Apply the checklist's skipped-item rules for whole-book questions that do not apply to that scope.
5. Use the uppercase finding ID prefixes `INTENT`, `STANDARD`, and `READER`. Every reviewer uses judgment confidence and includes a recommendation. The caller enters returned findings as `open` in the shared tracker; status is not a finding v2 property.
6. Preserve input independence as follows:

| Perspective | Permitted inputs |
|---|---|
| Intent and consistency | Manuscript, Story Bible, approved draft-baseline when supplied, approved revision plan, and intent checklist |
| Writing standards | Manuscript and writing standards checklist only; exclude previous self-assessments, Story Bible, draft-baseline and other baselines, plans, and prior review reports |
| Fresh reader | Manuscript, target reader description, and fresh-reader questions only; exclude Story Bible, draft-baseline and other baselines, plans, prior reports, and author explanations |

## Run with subagents

When independent subagents are available, dispatch all three in parallel. Each must have a fresh context containing only its permitted inputs and checklist. Do not share one reviewer's output with another. Ask each reviewer to return finding v2 payloads with the narrowest truthful location scope and a recommendation.

Write one immutable Markdown report per perspective with human-readable scope, a `Language coverage` section, a `Review coverage` section, and exactly one report v2 JSON envelope. In `Review coverage`, mark every inapplicable whole-book checklist item `skipped` with its reason in current-scope mode; record partial applicable coverage truthfully in either mode.

Use `engine.name: "conversational"` and record independent-subagent execution, version or `unknown`, and degradation. Every report's `engine.notes` must contain:

- `scope_id=<actual-scope-id>`;
- `operation_coverage=full`, `operation_coverage=partial`, or `operation_coverage=skipped` for actual requested-operation coverage;
- `subchecks=intent`, `subchecks=standards`, or `subchecks=fresh`, matching the single perspective in that report.

For a consolidated report containing all perspectives, use `subchecks=intent,standards,fresh` and the same scope ID. Collect the three reports without editing their findings. For `collect`, read and validate the three supplied report paths for the selected mode, list them as versioned inputs, and create a consolidated conversational-engine report that preserves every finding ID and perspective. Keep disagreements visible.

## Run without subagents

Resolve `paths.handoffs` and create three separate handoffs from [`assets/review-handoff-template.md`](assets/review-handoff-template.md) beneath the mode-specific `<paths.handoffs>/<review-mode-directory>/<review-id>/`. The default for a new manifest is `.author-toolkit/handoffs/`; an existing custom directory takes precedence. Customize each to its permitted inputs, confirmed scope ID, review mode, report stage, and report destination. Give the author three exact host commands for opening separate new sessions with `author-review`, one handoff per session, each including the same `review_mode`.

Stop while the reviews are pending. In each new session, run only the handoff's named perspective and write its report. Once all three reports exist, the author can invoke `author-review` with `collect` and the same review mode or return to the calling strategy's corresponding review operation. Record the separate-session fallback and any reduced coverage in `engine.notes` and the Markdown coverage sections.

## Findings and completion

Use `author-review-intent`, `author-review-standards`, and `author-review-fresh-reader` as audit names. Report concrete observations, contradictions, or reader experience at specific locations. Do not produce manuscript replacements or automatic resolutions.

A perspective is complete when its report validates against report v2 and covers the agreed scope with all skipped or partial checks disclosed. `all` is complete only when all three independent perspective reports exist for the same `scope_id` and review mode. Return report paths and finding counts to the caller or author; do not start another operation or describe current-scope results as a whole-book final review.
