---
name: story-structure
description: "Use when planning or diagnosing a novel's macro plot structure. Trigger on: 'story structure', 'plot point', 'inciting event', 'midpoint', 'structure audit', 'structure map', 'signpost scene', 'mirror moment', or macro-structure analysis."
---

# Story Structure

A percentage-anchored landmark-beat skeleton (K.M. Weiland's *5 Secrets of Story Structure* / *Structuring Your Novel*) overlaid with James Scott Bell's 14-signpost catalog (*Super Structure*) — plus two modes for using them: mapping a new story's structure before drafting, and auditing an existing manuscript against it.

Weiland's beats answer **where** a turning point should fall; Bell's signposts answer **what psychological or emotional work** that turning point needs to do. Together they give a placement skeleton with content diagnostics at each joint, not just a percentage ladder.

## When to Use

This skill is for:
- ✅ Fiction manuscripts — novels, novellas, short stories
- ✅ Placing landmark beats (Inciting Event, Plot Points, Pinch Points, Midpoint, Climax) into a new outline before drafting
- ✅ Checking where beats actually land in an existing draft, by approximate percentage
- ✅ Checking whether a beat that's present is doing the psychological work it needs to (via Bell's signposts)
- ✅ Catching two specific, commonly-missed failure modes: Inciting Event/Key Event/First Plot Point confusion, and the Faux Climax trap

## When NOT to Use

This skill is NOT for:
- ❌ Scene-level micro-structure (Goal/Conflict/Outcome, Scene/Sequel) — use `fiction-workshop`'s `references/developmental-editing.md` Scene-Level section instead.
- ❌ Character-arc mechanics (Want, Need, Wound, Lie) — use `fiction-workshop`'s `references/character-work.md` Core Four instead. This skill only notes *which* structural beat is where the Lie is tested (Third Plot Point) and resolved (Climax).
- ❌ Narrative nonfiction structure — use `narrative-nonfiction`'s transformation-arc guidance instead; this skill's beats assume a plotted fiction conflict.
- ❌ Prose-level pacing (sentence rhythm, word choice) — use `prose-mechanics`.

## Session Continuity

Structure placement is meant to persist in the project's Story Bible, not be re-derived each session.

- **At session start:** If a Story Bible exists, check its "Plot Foundation" section for an existing Structure Profile block (see `assets/structure-profile-template.md`). Don't re-run Map on a story that already has one unless the author asks for a re-check.
- **When a beat is newly placed or moved:** Return the profile block to the author or calling orchestrator. Standalone calls leave Story Bible changes to the author; `revise-fiction` and `revise-request` write only author-approved changes.

## The Landmark Beat Skeleton

Full skeleton, percentages, and the two named failure-mode diagnostics (Inciting/Key/First-Plot-Point confusion, Faux Climax): `references/landmark-beats.md`.

## Bell's 14 Signposts

Full catalog, in Bell's own order, cross-referenced to the landmarks above where they overlay one: `references/signposts.md`.

## The Two Modes

| Mode | Invocation | Question | Reference file |
|---|---|---|---|
| **Map** | "Map the structure for this story" | Where should each beat and signpost land, for a story not yet fully drafted? | `references/structure-map.md` |
| **Audit** | "Audit this manuscript's structure" | Where do beats actually land, and is each doing its job? | `references/structure-audit.md` |

**Ordering guidance:** Map is for pre-draft planning; Audit is for anything already written. They are not sequential stages of one session — run whichever mode matches the story's current stage.

Load only the reference file matching the currently invoked mode, plus `landmark-beats.md` and `signposts.md` (both modes need both). Do not preload mode files you're not running.

## Workflow

1. **Identify the mode** the author is invoking (see table above). If unclear, ask.
2. **Load `references/landmark-beats.md` and `references/signposts.md`**, plus the mode file for the identified mode.
3. **Run the mode's workflow** exactly as documented in its reference file.
4. **Stop at the mode's documented stop condition** (see Stopping Points below). Hand results back to the author.
5. **If a new or changed Structure Profile results**, return the `assets/structure-profile-template.md` block. In standalone use, the author places it in the Story Bible; in `revise-fiction` or `revise-request`, the orchestrator writes approved changes to the applicable baseline or Story Bible.

## Integration with `fiction-workshop`

- `fiction-workshop/references/developmental-editing.md`'s Act-Level section links here for the deeper percentage-anchored skeleton and signpost content-checks.
- `fiction-workshop/references/character-work.md`'s Arc Milestones section links here, noting Third Plot Point and Climax as the beats where the Lie is tested and resolved.
- `assets/structure-profile-template.md` is designed to paste directly into the Story Bible's existing "Plot Foundation → Three-Act Structure" section (see `fiction-workshop/assets/story-bible-template.md`), adding finer beat percentages and signpost notes on top of the existing Act I/Midpoint/Act II-B/Act III placeholders.
- This skill never restructures `fiction-workshop/assets/story-bible-template.md` — it only adds an optional block.

## Stopping Points

Each mode has a defined end. Stop at it. Do not auto-advance to the other mode, do not silently expand scope, do not write to the Story Bible without being asked.

| Mode | Stops when... | Then |
|---|---|---|
| **Map** | Structure Map block completed for all 11 landmarks | Hand back for author confirmation. Do not auto-write to Story Bible. |
| **Audit** | Flagged-beat report delivered (missing/mistimed/thin beats, Faux Climax check) | Stop. No auto-rewrite — author decides which flags to act on. |

## Finding Format

Standalone audit-mode output (missing/misplaced landmark beats, signpost gaps) conforms to `references/finding-schema.json`: `audit` = "story-structure-audit", `technique` = the specific landmark or signpost involved, `severity`, `location`, `confidence: "judgment"`, and optional `exemplar`. Map-building mode is not diagnostic and remains outside the finding contract.

When `revise-fiction` or `revise-request` supplies workflow report context, load `<project-root>/.author-toolkit/references/workflow-reporting.md` and use finding v2. Use chapter scope for a missing or chapter-wide beat; do not invent a line number or quotation. Return the Structure Profile and report to the orchestrator, which writes approved profile changes to the applicable baseline or Story Bible.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Treating the percentages as exact page counts | Weiland's own framing: aim for rough quarters, not surgical precision — a beat within a few points of its mark is fine |
| Conflating Inciting Event, Key Event, and First Plot Point into one beat | They can be three distinct scenes with three distinct jobs — see `landmark-beats.md`'s callout |
| Declaring an early goal-achieved scene "the climax" | Check for Faux Climax — is there a bigger obstacle still standing between the protagonist and the true goal? |
| Running Audit on a story with no draft yet | Audit needs actual manuscript text to locate beats in — use Map instead for pre-draft planning |
| Checking only placement, not content | A beat can land at the right percentage and still be hollow — always run the matching Bell signpost content-check too |

## Quick Reference Commands

| Need | Command |
|---|---|
| Plan a new story's structure | "Map the structure for this story" |
| Check an existing draft | "Audit this manuscript's structure" |
| Check one beat's placement | "Where does the Midpoint land in this draft?" |
| Check for a specific trap | "Check this manuscript for a Faux Climax" |

## Files

- `references/landmark-beats.md` - The 11-beat percentage skeleton, diagnostics, two failure-mode callouts
- `references/signposts.md` - Bell's full 14-signpost catalog, cross-referenced to the landmarks
- `references/structure-map.md` - Map mode workflow
- `references/structure-audit.md` - Audit mode workflow
- `assets/structure-profile-template.md` - Story Bible block for a story's structure profile
