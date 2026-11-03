# Stage gates

Load the section for the current stage. A gate describes the evidence needed to finish that stage. Finish with `awaiting_author`; the author starts the next stage explicitly. An upstream skill may require an earlier pause within a stage.

For every audit report, follow `state-and-findings.md`. Record report paths in stage `artifacts` and the tracker. A clean report contains zero findings and still records engine, scope, and `Language coverage`.

## 1. Intake

**Inputs:** A project root and accessible manuscript text.

**Work:** Initialize or read the manifest through `author-project`. Inventory every registered manuscript file in reading order, including missing or duplicate chapter identifiers, approximate word counts when readily available, language, and obvious non-manuscript files excluded from scope. Confirm target reader, book metadata, current author goal, and requested entry stage. Register the Story Bible, tracker, reports, sessions, backups, and handoffs paths.

**Gate:** The manifest passes available validation, the inventory accounts for every in-scope file, paths are readable, excluded files are named, and the tracker exists. Save the inventory in `reports/intake/` as report v2 with an empty findings array when there are no inventory issues. Record open metadata questions.

## 2. Story Bible

**Inputs:** Intake inventory, manuscript, and any existing Story Bible.

**Work:** Invoke `fiction-workshop` in Story Bible Building mode. Establish or correct the baseline against the actual manuscript. Preserve existing approved content and surface contradictions as questions. Obtain author confirmation before writing changed creative content. Use the existing workshop template when a fuller template is useful; the setup skeleton is only a starting point.

**Gate:** The baseline identifies premise, target reader, major plot turns and ending, principal characters and arcs, world rules, timeline constraints, and open questions. Every correction that affects prior audits is passed to the stale rules. The author confirms the baseline. An undecided foundation field keeps every dependent downstream stage from starting until it is resolved.

## 3. Structure

**Inputs:** Current manuscript, confirmed Story Bible baseline, and intake scope.

**Work:** Invoke `story-structure` in Audit mode over the full selected manuscript scope. Keep its landmark and signpost rules upstream. Convert its flagged-beat output into finding v2. Do not rewrite beats or chapters in this stage.

**Gate:** Every in-scope structural section has been audited, all findings have tracker decisions, and the author has identified which accepted findings require revision. Structural stability means no `open` findings and no deferred or dismissed item still implies a planned major cut, reorder, or arc change. Record unresolved instability for the prose gate.

## 4. Characters

**Inputs:** Current manuscript, Story Bible, structure findings, and any saved archetype profiles.

**Work:** Use `character-archetypes` Conformance for established profiles and Ensemble when the main cast is ready. Use Analyzer only for a character who lacks a profile and needs one. Separately invoke `fiction-workshop` as Character Consultant for motivation, voice, and arc consistency, then as Continuity Tracker for timeline, relationships, knowledge states, and world facts. Keep these passes distinct and convert diagnostic outputs to finding v2. Return new profiles or corrections for author confirmation before updating the Story Bible.

**Gate:** The main cast and requested supporting cast have continuity coverage across the selected manuscript, no finding remains `open`, approved Story Bible changes are written, and unresolved character-fact instability is explicit for later gates.

## 5. Revision plan

**Inputs:** Current Story Bible, structure and character reports, tracker, and manuscript inventory.

**Work:** Copy `assets/revision-plan-template.md` to `.author-toolkit/revision-plan/<plan-id>.md`. The plan is a workflow artifact rather than a JSON report. Create a new version whenever an approved plan changes and keep earlier versions linked in stage `artifacts`. Link every accepted finding ID to a concrete action, file, order, and Story Bible impact. Group edits into reviewable chapter batches. Keep deferred and dismissed decisions visible with their reasons.

**Gate:** Every accepted structure and character finding is mapped to a batch or an explicit deferral, conflicting actions are resolved with the author, and the author approves the plan and intended file scope. The approved plan is the baseline for the next stage.

## 6. Chapter revision

**Inputs:** Approved revision plan, Story Bible, manuscript, and tracker.

**Work:** For one approved batch at a time, invoke `fiction-workshop` first for diagnosis and proposed edits without writing. Show the exact files and changes, obtain approval, back up every file through `author-project`, and then invoke the appropriate workshop persona to implement that batch. Recheck affected continuity after the edits. Update plan batch status and finding tracker decisions.

**Gate:** Every planned batch is completed and accepted, or explicitly deferred with its downstream effect recorded. Each modified file has a successful backup record. Approved structural or character-fact changes trigger stale propagation. No requested batch remains unapproved or partially edited.

## 7. Prose

**Inputs:** Structurally stable chapter revisions, current Story Bible, tracker, and an audit scope.

**Work:** Before starting, verify the structure gate and character-fact stability. If unstable, stop and display the required earlier stage. The author may instead approve a named-scope override; record it before proceeding. Invoke `prose-mechanics` for author-selected audits among audits 1-18, one at a time and in upstream order. Leave audit 19 to `ai-cleanup`. Produce report v2, wait for author decisions, and back up before applying approved fixes.

**Gate:** Every selected audit has a current report for every in-scope file, all findings have tracker decisions, and approved fixes have backups. The structure remains stable or a current override covers the exact scope. When the author selects only some audits, name the uncovered audits and record the limited completion scope.

## 8. AI cleanup

**Inputs:** Current manuscript scope, tracker, language metadata, and any prose reports.

**Work:** Read the toolkit root's `references/avoid-ai-writing-adapter.md` and follow it exactly. Run detection through the upstream `avoid-ai-writing` skill. Rewrites require the standard approval and backup gate and a second detection pass. Preserve the upstream skill's standalone behavior outside this workflow.

**Gate:** Each in-scope file has a full English detection result or an explicit `skip` or `partial` language result. Reports contain severity mappings, engine and fallback details, coverage, and degradation. Every rewrite has approval, a backup ID, and second-pass detection. Every finding has a tracker decision. An upstream execution failure leaves the stage blocked rather than producing a clean result.

## 9. Final review

**Inputs:** Current manuscript, Story Bible, approved revision plan, target reader, and review checklists.

**Work:** Invoke `author-review`. Keep intent and consistency, writing standards, and fresh reader independent. With subagents, run them in parallel with separate inputs. Without subagents, create three handoffs and wait for the author to run separate sessions. This stage produces findings only.

**Gate:** Three schema-valid perspective reports cover the same current manuscript scope and their findings are linked in the tracker. Record any dissent between perspectives without silently merging it away. Later manuscript or Story Bible changes make the affected final review stale. Return the findings for author decisions; do not edit the manuscript.
