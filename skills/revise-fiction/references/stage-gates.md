# Full-book operation gates

Load the section for the current operation. A gate describes the evidence needed to finish that operation for the active scope. Finish with `awaiting_author`; the author starts the next operation explicitly.

For every report, follow `state-and-findings.md`. A clean report contains zero findings and still records engine, `scope_id`, input versions, operation coverage, subchecks when applicable, and language coverage.

## 1. Intake

**Inputs:** A v3 project root and accessible manuscript text.

**Work:** Inventory every registered manuscript file in reading order, including missing or duplicate chapter identifiers, language, and excluded non-manuscript files. Compute a SHA-256 version for every in-scope file. Record a new `scope_id` through `author-project`; scope changes require author confirmation. Confirm target reader, book metadata, current author goal, and requested entry operation.

**Gate:** The manifest passes validation, the inventory accounts for every in-scope file, paths are readable, exclusions are named, the tracker exists, and the author confirms the scope. Save the inventory in `reports/intake/` as report v2. Record open metadata questions without inventing answers.

## 2. Story Bible

**Inputs:** Intake inventory, manuscript, and any existing Story Bible or current-draft baseline.

**Work:** Invoke `fiction-workshop` in Story Bible Building mode. Establish or correct the full-book baseline against the actual manuscript and the author's decisions. Preserve approved content and surface contradictions as questions. Obtain author confirmation before writing changed creative content.

**Gate:** The baseline identifies premise, target reader, major plot turns and ending, principal characters and arcs, world rules, timeline constraints, and open questions. The author confirms the baseline. An undecided foundation field keeps dependent full-book operations from starting until it is resolved. A draft-baseline with unknown foundation fields does not satisfy this gate.

## 3. Structure

**Inputs:** Current manuscript, confirmed Story Bible baseline, and intake scope.

**Work:** Invoke `story-structure` in Audit mode over the full selected manuscript scope. Keep its landmark and signpost rules upstream. For an incomplete manuscript, follow its requirement to ask whether to audit what exists with rougher percentages or wait; never treat the current last chapter as the book ending by default. Convert flagged beats to finding v2. Do not rewrite beats or chapters here.

**Gate:** Every in-scope structural section has full-book landmark coverage, all findings have tracker decisions, and the author has identified which accepted findings require revision. Structural stability means no `open` findings and no deferred or dismissed item still implies a planned major cut, reorder, or arc change. Local `diagnostics` evidence alone does not satisfy this gate.

## 4. Characters

**Inputs:** Current manuscript, Story Bible, structure findings, and any saved archetype profiles.

**Work:** Use `character-archetypes` Conformance for established profiles and Ensemble when the main cast is ready. Use Analyzer only for a character who lacks a profile and needs one. Separately invoke `fiction-workshop` as Character Consultant for motivation, voice, and arc consistency, then as Continuity Tracker for timeline, relationships, knowledge states, and world facts. Record the actual subchecks and coverage in every report.

**Gate:** The main cast and requested supporting cast have continuity coverage across the selected manuscript, required profile and full-arc checks are covered, no finding remains `open`, approved Story Bible changes are written, and unresolved character-fact instability is explicit for later gates. Current-arc-only evidence remains partial for this gate.

## 5. Revision plan

**Inputs:** Current baselines, structure and character reports, tracker, and manuscript inventory.

**Work:** Copy `assets/revision-plan-template.md` to `.author-toolkit/revision-plan/<plan-id>.md`. Link every accepted finding ID to a concrete action, file, order, `scope_id`, and baseline impact. Group edits into reviewable chapter batches. Keep deferred and dismissed decisions visible with their reasons.

**Gate:** Every accepted structure and character finding is mapped to a batch or an explicit deferral, conflicting actions are resolved with the author, and the author approves the plan and intended file scope. The approved plan is the baseline for chapter revision.

## 6. Chapter revision

**Inputs:** Approved revision plan, relevant baselines, manuscript, and tracker.

**Work:** For one approved batch at a time, invoke `fiction-workshop` first for diagnosis and proposed edits without writing. Show the exact files and changes, obtain and record approval, back up every file through `author-project`, and then implement that batch. Recheck affected continuity and update current-scope file hashes after the writes. Update plan batch status and finding decisions.

**Gate:** Every planned batch is completed and accepted, or explicitly deferred with its downstream effect recorded. Each modified file has a successful backup record linked to its approval. No requested batch remains unapproved or partially edited. Approved structural or character-fact changes trigger stale propagation.

## 7. Prose

**Inputs:** Structurally stable chapter revisions, current Story Bible, tracker, and an audit scope.

**Work:** Before starting, verify the structure gate and character-fact stability for this exact scope. If unstable, stop and display the required earlier operation. The author may instead approve a `prose-override` in the shared tracker; bind it to the current scope and structural evidence. Invoke `prose-mechanics` for author-selected audits among audits 1-18, one at a time and in upstream order. Produce report v2, wait for author decisions, and back up before applying approved fixes.

**Gate:** Every selected audit has a current report for every in-scope file, all findings have tracker decisions, and approved fixes have approvals and backups. The structure remains stable or a current override covers the exact scope. When the author selects only some audits, name the uncovered audits and record limited operation coverage.

## 8. AI cleanup

**Inputs:** Current manuscript scope, tracker, language metadata, and any prose reports.

**Work:** Read the toolkit root's `references/avoid-ai-writing-adapter.md` and follow it exactly. Run detection through the upstream `avoid-ai-writing` skill. Rewrites require the standard approval and backup gate and a second detection pass.

**Gate:** Each in-scope file has a full English detection result or an explicit `skipped` or `partial` language result. Reports contain severity mappings, engine and fallback details, coverage, and degradation. Every rewrite has approval, a backup ID, and second-pass detection. Every finding has a tracker decision. An upstream execution failure leaves the operation blocked rather than producing a clean result.

## 9. Final review

**Inputs:** Current manuscript, Story Bible, approved revision plan, target reader, and review checklists.

**Work:** Invoke `author-review` with `review_mode=final`. Keep intent and consistency, writing standards, and fresh reader independent. With subagents, run them in parallel with separate inputs. Without subagents, create three handoffs and wait for separate sessions. This operation produces findings only.

**Gate:** Three schema-valid perspective reports cover the same current `scope_id` and all required final-review checks, and their findings are linked in the tracker. Record dissent without merging it away. Later manuscript or baseline changes make the affected final review stale. Return findings for author decisions; do not edit the manuscript. A `current-scope-review` cannot satisfy this gate.
