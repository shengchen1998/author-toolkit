# Audit Tracker: The Tide Archive

> **Fixture notice:** The seeded observations and structure report are handwritten and describe intentional manuscript defects. No entry is evidence of a model run, and no audit has author approval to alter the manuscript.

## Workflow

- Project root: `.`
- Manifest created at: `2026-01-10T09:00:00Z`
- Main workflow: `revise-fiction`
- Current stage: `structure`
- Next action: Resolve the midpoint and climax questions before rerunning downstream stages.

## Findings

Allowed statuses: `open`, `resolved`, `deferred`, `dismissed`, `stale`.

| Finding ID | Stage | Audit | Location | Status | Current report | Updated | Decision or stale reason |
|---|---|---|---|---|---|---|---|
| STRUCT-001 | structure | story-structure-audit | `manuscript/chapter-02.md`, chapter 2 | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |
| STRUCT-002 | structure | story-structure-audit | `manuscript/chapter-03.md`, chapter 3 | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |
| STRUCT-003 | structure | story-structure-audit | `manuscript/chapter-02.md`, chapter 2 passage | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |
| STRUCT-004 | structure | story-structure-audit | `manuscript/chapter-01.md`, chapter 1 | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |

## Audit runs

| Stage | Scope | Report | Engine and fallback | Language coverage | Run at | Result |
|---|---|---|---|---|---|---|
| structure | All three chapters and all landmark checks | `reports/structure/2026-01-17_structure.md` | `conversational`, `degraded: true`, no execution | full | 2026-01-17T18:00:00Z | Handwritten fixture; schema validation only; no model run. |

## Open questions

These fixture leads have no corresponding report and are not formal tracker findings:

- `CHAR-001` lead: Tao shifts from practical reassurance to a cruel joke without an adequate trigger in Chapter 2. Run a character consult before assigning a formal finding.
- `CHAR-002` lead: Ning states that she can let go before Chapter 3 dramatizes a sufficiently difficult action. Check this after structural decisions are approved.
- `PROSE-001` lead: Repeated "There was" openings and flat declarative runs may flatten emphasis across Chapters 1-3. Run a sentence-variance audit after chapter revision.
- `PROSE-002` lead: Passive constructions in Chapter 2 may obscure who starts the generator and moves the reels. Run an active/passive audit later.
- `AI-001` lead: The abstract phrase "a testament to the enduring power of community" in Chapter 3 may explain a sentiment the scene has not earned. Run AI-writing detection independently.

## Approved decisions

| Decision ID | Approved at | Summary | Source |
|---|---|---|---|

## Current Handoff

The fixture state represents a requested structure rework after the midpoint and climax diagnostics. Return to `structure`; do not begin line edits merely because sentence issues are easy to spot. After structural choices are approved, rerun `characters`, rebuild `revision-plan`, and only then resume chapter and prose work. The manifest and `sessions/rework-resume.fixture.json` show which downstream artifacts become stale.

## Refusal Boundary

Structure, character, prose-audit, archetype-audit, and AI-detection passes produce findings only. If a request during those passes asks for direct manuscript rewriting, pause and request an explicit revision task. Record author decisions here before changing the Story Bible or manuscript.
