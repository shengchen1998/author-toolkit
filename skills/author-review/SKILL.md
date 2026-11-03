---
name: author-review
description: Use when running independent final manuscript reviews for intent and consistency, writing standards, and a fresh target reader, or preparing separate review handoffs when subagents are unavailable.
---

# Author Review

Organize three independent reviews and produce findings only. Accept `all`, one perspective (`intent`, `standards`, or `fresh`), or `collect`, plus a project root or review handoff.

This skill does not revise prose, update Story Bible creative content, or apply fixes. When called by `revise-fiction`, the caller owns manifest and tracker writes. Standalone use leaves main workflow state unchanged unless the author explicitly incorporates the resulting reports later.

## Prepare

1. Read [`references/checklists.md`](references/checklists.md). Read the report envelope and finding identity sections of `../revise-fiction/references/state-and-findings.md`; its state-write instructions remain the caller's responsibility.
2. For project input, resolve `author-project` in the current skill listing and invoke its exact registered name in separate calls with `read` and `status`. Bare and `author-toolkit:` qualified names are supported when listed. These are the only Skill calls this skill may make. Do not call other skills from a reviewer or subagent.
3. Establish one manuscript scope for all three perspectives. Use unique report paths under `reports/final-review/` and the uppercase finding ID prefixes `INTENT`, `STANDARD`, and `READER`. Every reviewer uses judgment confidence and includes a recommendation. The caller enters returned findings as `open` in the tracker; status is not a finding v2 property.
4. Preserve input independence as follows:

| Perspective | Permitted inputs |
|---|---|
| Intent and consistency | Manuscript, Story Bible, approved revision plan, and intent checklist |
| Writing standards | Manuscript and writing standards checklist only; exclude previous self-assessments, Story Bible, plan, and prior review reports |
| Fresh reader | Manuscript, target reader description, and fresh-reader questions only; exclude Story Bible, plan, prior reports, and author explanations |

## Run with subagents

When independent subagents are available, dispatch all three in parallel. Each must have a fresh context containing only its permitted inputs and checklist. Do not share one reviewer's output with another. Ask each reviewer to return finding v2 payloads with the narrowest truthful location scope and a recommendation.

Write one immutable Markdown report per perspective with human-readable scope, a `Language coverage` section, and exactly one report v2 JSON envelope. Use `engine.name: "conversational"` and record independent-subagent execution, version or `unknown`, degradation, scope, and coverage in the engine fields. Collect the three reports without editing their findings. For `collect`, read and validate the three supplied report paths, list them as versioned inputs, and create a consolidated conversational-engine report that preserves every finding ID and perspective. Keep disagreements visible.

## Run without subagents

Resolve the manifest's `paths.handoffs` directory and create three separate handoffs from [`assets/review-handoff-template.md`](assets/review-handoff-template.md) beneath `<paths.handoffs>/final-review/<review-id>/`. The default for a new manifest is `.author-toolkit/handoffs/`; an existing custom directory takes precedence. Customize each to its permitted inputs and report destination. Give the author three exact host commands for opening separate new sessions with `author-review`, one handoff per session.

Stop while the reviews are pending. In each new session, run only the handoff's named perspective and write its report. Once all three reports exist, the author can invoke `author-review` with `collect` or return to `revise-fiction` at `final-review`. Record the separate-session fallback and any reduced coverage in `engine.notes` and the Markdown coverage section.

## Findings and completion

Use `author-review-intent`, `author-review-standards`, and `author-review-fresh-reader` as audit names. Report concrete observations, contradictions, or reader experience at specific locations. Do not produce manuscript replacements or automatic resolutions.

A perspective is complete when its report validates against report v2 and covers the agreed manuscript scope. `all` is complete only when all three independent reports exist. Return report paths and finding counts to the caller or author; do not start another revision stage.
