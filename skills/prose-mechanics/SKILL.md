---
name: prose-mechanics
description: "Use when auditing prose at the sentence level on stabilized drafts. Trigger on: 'audit prose', 'active voice', 'sentence variance', 'passive voice pass', 'parallel structure check', 'readability audit', 'prose mechanics', or sentence-level diagnostic work on fiction or nonfiction."
---

# Prose Mechanics

Diagnostic audits for sentence-level prose quality on near-final drafts. Each audit is a focused pass that produces a flagged-issues report; the author reviews and applies fixes before moving to the next audit. Shared revision workflows automatically advance past a fully covered clean audit under the workflow rule below. Works for fiction or nonfiction.

## Session Continuity

Audit work is iterative, and agent sessions do not reliably preserve context. The audit tracker indexes persistent reports and decisions; `.author-toolkit/project.json`, when present, supplies its path.

- **At session start:** Read the registered tracker, or `audit-tracker.md` in a standalone project. Create it from `assets/audit-tracker-template.md` only when it is absent. Check current and stale runs and outstanding finding decisions.
- **At session end:** Update the run index and finding statuses with report pointers. Record the stopping point and any backups in `sessions/`; keep finding details in reports.
- **Surface unresolved questions:** If prior audits flagged issues the author hasn't addressed, list them at session start so the user can decide what to take on.

## Core Concept

Audits are diagnostics, not edits. Each pass scans for one specific class of failure, produces a list of flagged passages, and stops. The author—not the audit—decides whether each flag is a real problem and how to fix it.

## When to Use

This skill is for:
- ✅ Sentence-level audits on finished or near-finished drafts (fiction or nonfiction)
- ✅ Final polish before submission, query, or publication
- ✅ Catching the mechanical failures that survive developmental editing
- ✅ Complementing `fiction-workshop` or `narrative-nonfiction` work after structural editing is done

## When NOT to Use

This skill is NOT for:
- ❌ Early drafting—audits are for revision, not generation
- ❌ Developmental editing tasks—use `fiction-workshop` or `narrative-nonfiction` instead
- ❌ Manuscripts that haven't stabilized structurally yet (you'll audit prose that's about to be cut)
- ❌ Single scenes or short passages where eyeballing is faster than running a pass
- ❌ Heavy stylistic departures (e.g., experimental prose) where the audits' assumptions don't hold

## Audit Passes

Run audits **one at a time, in the table order**. Earlier audits change what later audits flag. Frequency precedes Crutch Words so its results can inform the project configuration; semantic passes come last because they require prose that is unlikely to be reworked.

| # | Audit | Class | Invocation | Catches |
|---|-------|-------|------------|---------|
| 1 | Active/Passive | hybrid | "Run active/passive audit on..." | Unjustified passive, hidden agency |
| 2 | Parallel Structure | semantic | "Run parallel-structure audit on..." | Broken grammatical parallels |
| 3 | Sentence Variance (file: `sentence-length-variance.md`) | hybrid | "Run sentence-variance audit on..." | Flat rhythm, narrow length bands |
| 4 | Readability (file: `accessibility-audit.md`) | deterministic | "Run readability audit on..." | Grade-level spikes, paragraph bloat |
| 5 | Echoes | deterministic | "Run echoes audit on..." | Word repeated within 100 words |
| 6 | Frequency | deterministic | "Run frequency audit on..." | Chapter-scope word overuse |
| 7 | Crutch Words | deterministic | "Run crutch-words audit on..." | Author-specific overused words |
| 8 | Filter Words | deterministic | "Run filter-words audit on..." | felt/saw/heard/realized/noticed/watched |
| 9 | Adverb Audit | deterministic | "Run adverb audit on..." | -ly density, dialogue vs. narration |
| 10 | Dialogue Tags | hybrid | "Run dialogue-tags audit on..." | Said-bookisms, adverb-modified tags |
| 11 | Sticky Sentences | deterministic | "Run sticky-sentences audit on..." | Glue-word density |
| 12 | Sentence Starters | deterministic | "Run sentence-starters audit on..." | Repeated opener patterns |
| 13 | Tense Consistency | hybrid | "Run tense-consistency audit on..." | Unintentional tense flips |
| 14 | Invented-Term Consistency | deterministic | "Run invented-term-consistency audit on..." | Capitalization/spelling drift |
| 15 | Clichés | hybrid | "Run cliches audit on..." | Well-worn phrases |
| 16 | Pronoun Clarity | semantic | "Run pronoun-clarity audit on..." | Ambiguous antecedents |
| 17 | Show vs. Tell | semantic | "Run show-vs-tell audit on..." | Named vs. dramatized emotion |
| 18 | POV Consistency | semantic | "Run pov-consistency audit on..." | Head-hopping, knowledge violations |
| 19 | AI-Isms | hybrid | "Run ai-isms audit on..." | AI-associated patterns through the adapter |

Load only the reference file matching the currently invoked audit. Before a workflow or non-English audit, also load `references/language-support.md` and record full, partial, or skipped coverage. For Chinese, load `references/chinese-rules.md`; its procedures replace the language-specific rules in the individual audit references. For AI-Isms, load `references/avoid-ai-writing-adapter.md`, which supplies the local Chinese catalog and the standalone Chinese detection path.

## Finding Format

Standalone audits retain finding v1 from `references/finding-schema.json`, grouped by severity with optional exemplars resolved against `references/exemplars/<ref>.md`.

When `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` supplies workflow report context and the resolved `<setup-skill-root>`, load `<setup-skill-root>/assets/references/workflow-reporting.md` and use report and finding v2. Every finding includes a recommendation, and the tracker stores stable finding IDs and their review statuses.

## Engine Hook

Before running any audit, check `command -v scriptorium` when shell discovery is available. For English, if it succeeds:
- **Deterministic audits:** run `scriptorium prose audit <name> <chapter>` and treat its JSON as the detection result within the engine's documented coverage.
- **Hybrid audits:** run `scriptorium prose prepare <name> <chapter>` to get code-detected candidates, judge each per that audit's reference file, then submit findings through the engine.
- **Semantic audits:** prepare the raw chapter, judge it per the embedded instructions, then submit findings.

Sentence Variance uses the hybrid path because the engine implements only detection pattern #1; apply patterns #2-5 as additional judgment. If `scriptorium` or shell discovery is unavailable, perform the audit conversationally using the reference file's complete detection rules.

For Chinese, apply `references/chinese-rules.md` through the conversational path. Use `scriptorium` only for subchecks whose installed version explicitly documents Chinese support; an English-only result is not Chinese coverage. A complete Chinese conversational run can be full and non-degraded. Workflow reports record the selected engine, segmentation method, actual subchecks, and coverage without claiming equivalent results across execution paths.

## Workflow

For each audit:

1. **Scope:** Confirm which chapter(s) or passage(s) to audit. Audit one chapter at a time unless the user asks for broader scope.

2. **Run the pass:** Read the prose looking for the specific patterns named in the relevant reference file. Do **not** look for other classes of issue—keep the lens narrow.

3. **Produce a flagged-issues report:** Before presenting fixes for author review, read `references/context-fit.md` in standalone mode or `<setup-skill-root>/assets/references/context-fit.md` in workflow mode and complete the context-fit check. This does not add diagnostic categories to the selected audit. For each flagged passage, output:
   - File and approximate location
   - The flagged text (short excerpt)
   - Why it was flagged (which detection pattern matched)
   - A suggested fix or two—not a mandate, just options

4. **Review the result.** Do not apply fixes automatically. When the report contains findings, stop for author review; the author decides which flags are real and which are stylistic choices. In workflow mode, apply the clean-audit continuation rule below instead of requesting an empty confirmation.

5. **Apply approved fixes:** In workflow mode, return the approved file list to `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` and wait for its backup confirmation before editing. The orchestrator records every backup through `author-project`. Use targeted text edits only on confirmed flags and record the resulting backup IDs in the session note.

6. **Update the tracker:** Index the report and update each finding's review status. Keep full finding details in the report.

7. **Finish or continue:** Standalone work waits for the author's next request. Shared revision work follows the clean-audit continuation rule and otherwise waits at the current audit's author gate.

### Shared clean-audit continuation

This rule applies only when `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` supplies workflow context for selected audits 1-18. It does not apply to standalone audits, audit 19, or `ai-cleanup`.

1. Finish the current audit over every unit of the agreed scope before starting another audit. Keep audits sequential and produce a separate immutable report for each one; do not interleave per-file passes from different audits or merge their reports.
2. A clean audit has `findings: []`, `operation_coverage=full`, full applicable language coverage, and `engine.degraded=false`. Documented language-inapplicable subchecks may remain explicitly `skipped` with their reasons; requested applicable coverage that is partial or skipped is not clean.
3. Validate and publish the report, persist its full local coverage units, and index the run in the tracker before continuing. A clean report adds no finding decision and needs no manuscript approval, backup, or execution receipt. Report `0 findings` and the next audit briefly without presenting an empty report template or asking whether to continue.
4. Continue automatically only within the author-selected audit queue. Before each next audit, recheck the confirmed scope, input hashes, dependencies, structural stability or override, and unresolved write or commit interruptions. Stop when the author pauses, an applicable check is partial, skipped, degraded, or failed, or any of those prerequisites differs.
5. When updating the living `prose` coverage entry, retain every current matching unit accumulated for the target scope, including units from earlier audits and reusable unchanged paths. Do not replace earlier units with only the latest audit's units. Until all selected audits finish, keep synthesis coverage partial or unrecorded rather than claiming a full-target synthesis. Generate the complete full-target synthesis only after the selected queue finishes, then stop at the `prose` operation gate.
6. Historical findings do not block an otherwise clean current audit. Findings returned by the current audit stop the queue for the author decision loop. After any approved fixes, complete the required decisions, approvals, backups, execution receipts, and stale propagation before requesting confirmation to enter the next audit; a later clean audit cannot close that earlier gate.
7. During automatic continuation, keep `pending_action.operation=prose` and `pending_action.status=in_progress`. At a clean audit boundary, record the selected queue, completed audit, and exact next audit in the pending reason and session note. If context is exhausted or execution is interrupted, finish the current report and state writes when possible, preserve the same pending operation, and resume by validating reusable evidence before the first unfinished selected audit. Use `awaiting_author` for a finding or other author decision and `blocked` for a concrete blocker, not for an ordinary context handoff.

## Common Mistakes

| Mistake | Why It Happens | Fix |
|---------|---------------|-----|
| **Running all audits simultaneously** | Wanting to be thorough in one pass | Each audit has a different lens. Stacked, they produce a noise-flood the author can't act on. One pass at a time. |
| **Applying fixes mechanically** | Treating flags as instructions, not diagnostics | Every flag needs a judgment call. A flagged passive may be the right passive. Surface the flag; let the author choose. |
| **Treating audits as line edits** | Conflating diagnostics with revision | Audits identify candidate issues; line editing is the craft of resolving them. Run the audit, then do the line edit—not both at once. |
| **Auditing unstable drafts** | "Polish as I go" instinct | If chapters are still being cut or reordered, audited prose is wasted work. Wait for stability or record the author's explicit scoped risk approval when `revise-draft`, `revise-increment`, or `revise-request` permits the pass. |
| **Skipping the report step** | Wanting to be efficient by fixing in place | The report is the deliverable. It teaches the author to see the pattern themselves, which is the long-term value of the audit. |
| **Running audits out of order** | Convenience or user request | Each audit changes what the next will flag. If the user insists on a different order, note that downstream audits may need a re-run. |
| **Auditing during developmental work** | Mistaking line-mechanical issues for structural ones | Prose mechanics are downstream of structure. If the chapter's purpose isn't clear, the prose isn't the problem. Use the developmental skills first. |

## Self-Check: Is This Working?

Use these checkpoints to verify you're running audits correctly.

**Before starting an audit:**
- [ ] Has `revise-fiction` verified full-book structural stability, or has `revise-draft`, `revise-increment`, or `revise-request` addressed approved local edits and scoped rework risk?
- [ ] Have the developmental and character passes required by the calling orchestrator been completed?
- [ ] Is the audit scope clearly defined (which chapter, which passages)?

**During an audit:**
- [ ] Are you using only the patterns from the relevant reference file?
- [ ] Are you producing a flagged-issues report rather than applying fixes directly?
- [ ] Are you ignoring issues outside the audit's scope, even when you notice them?

**After producing the report:**
- [ ] Can the author act on each flag without re-reading the audit reference?
- [ ] Did you include a short excerpt and a suggested fix for each flag?
- [ ] For a report with findings, did you stop for review? For a clean shared-workflow audit, did you meet every continuation condition?

**After applying fixes:**
- [ ] Did you use targeted text edits for surgical changes only?
- [ ] Did you skip the flags the author didn't confirm, without re-raising them?
- [ ] Did you update the tracker before ending the session?

**Before moving to the next audit:**
- [ ] Is the current audit clean and eligible for automatic continuation, or are its flags fully resolved with confirmation to proceed?
- [ ] For standalone work or a completed audit with findings, have you confirmed the author wants to proceed?

If you answered "no" to any checkpoint, stop and resolve it before continuing.

## Stopping Points

Each audit has a defined end. In standalone work, stop at it and wait for the author. In shared revision work, follow the clean-audit continuation rule without expanding the audit's lens or applying fixes without explicit author confirmation.

| Tool / Phase | Stop when... | Then |
|--------------|--------------|------|
| **Active/Passive audit** | Flagged-issues report for the requested scope is delivered | Findings wait for author review. A clean shared-workflow result follows the continuation rule. Do not apply fixes automatically. |
| **Parallel Structure audit** | Flagged-issues report is delivered | Same as above; never merge the pass into variance. |
| **Sentence Length Variance audit** | Flagged-issues report is delivered (with std-dev numbers and flagged runs) | Findings wait. Variance fixes ripple, so confirmation matters. |
| **Readability audit** | Flagged-issues report is delivered (with FK grade, paragraph-length, jargon flags) | Findings wait. Don't pivot into developmental editing if structural concerns surface—surface them and stop. |
| **Approved-fixes pass** | All author-confirmed flags resolved via targeted text edits | Update the tracker. Do not start the next audit without confirmation. |
| **Audit sequence** | Author defers, OR a later audit reveals the manuscript needs structural work | Stop. Note in tracker. Recommend the author switch to `fiction-workshop` or `narrative-nonfiction` for the structural pass. |
| **Session** | Stopping point reached or context window is filling | Update `audit-tracker.md`; write a `sessions/` note; stop. |

If the author explicitly asks you to continue past a stopping point (e.g., "just apply the obvious fixes"), fine—but name which flags you're acting on and which you're skipping, so the scope shift is visible.

## Quick Reference Commands

| Need | Command |
|------|---------|
| Start audit sequence | "Run the prose-mechanics audits on [chapter]" |
| Active/passive only | "Run active/passive audit on [chapter]" |
| Parallel structure only | "Run parallel-structure audit on [chapter]" |
| Sentence variance only | "Run sentence-variance audit on [chapter]" |
| Readability only | "Run readability audit on [chapter]" |
| Check audit status | "What audits have run on [chapter]?" |

---

## Files

- `references/active-passive-audit.md` - Voice and agency at the sentence level
- `references/parallel-structure-audit.md` - Grammatical parallelism in lists, comparisons, series
- `references/sentence-length-variance.md` - Rhythm diagnostics for paragraphs
- `references/accessibility-audit.md` - Readability scoring and structural accessibility
- `references/language-support.md` - Language-specific coverage and degradation rules
- `references/chinese-rules.md` - Chinese procedures for all 19 audits
- `assets/audit-tracker-template.md` - Per-project tracker for audit runs and findings
