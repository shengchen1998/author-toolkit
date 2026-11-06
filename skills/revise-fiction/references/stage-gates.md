# Full-book operation gates

Load the section for the current operation. A gate describes the evidence needed to finish that operation for the active scope. Finish with `awaiting_author`; the author starts the next operation explicitly. At every author gate, also follow the [Author decision loop](state-and-findings.md#author-decision-loop).

For every report, follow `state-and-findings.md` and the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md`. A clean report contains zero findings and still records engine, `scope_id`, input versions, operation coverage, subchecks when applicable, and language coverage.

At a stable operation gate, apply the [current-draft convergence cycle rules](../../author-project/references/operations.md#current-draft-convergence-cycle). An active cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. With no active cycle, the author may switch to `write-fiction`, `revise-draft`, `revise-increment`, or `revise-request` through its exact command; no entry starts automatically. Reuse a local coverage unit only when every path, hash, subcheck, and dependency matches, or when a [dependency exception](state-and-findings.md#dependency-exceptions) covers an attested baseline or plan copyedit. Reevaluate every applicable whole-book synthesis after relevant changes instead of carrying it forward with unchanged local units. Creation evidence does not satisfy `chapter-revision`.

Read-only analysis and review do not open a cycle. Manuscript-changing or required-evidence-invalidating work first requires a satisfied full-manuscript starting evaluation and a linked `revise-fiction` cycle. These current-draft revision convergence requirements add to every whole-book gate below; they do not replace Story Bible, structure, character, revision, or final-review evidence.

For the cycle's current requested pass and target fingerprint, apply the [whole-book evaluation bindings](../../author-project/references/operations.md#no-edit-convergence-evaluation-and-completion): full-target `story-bible`, `structure`, and `final-review` requirements, their exact report and Story Bible decision identities, and the host coverage and review attestations. These bindings apply whenever the cycle's initiating or current strategy is `revise-fiction`, including request→fiction and draft→fiction work. Final review needs `mode: "final"` jobs and `stage: "final-review"` reports; `current-scope-review` cannot satisfy this whole-book gate. After a revision execution is linked, the active cycle cannot switch away from `revise-fiction` before whole-book evidence and explicit completion.

## 1. Intake

**Inputs:** A v3 project root and accessible manuscript text.

**Work:** Inventory every registered manuscript file in reading order, including missing or duplicate chapter identifiers, language, and excluded non-manuscript files. Compute a SHA-256 version for every in-scope file. Record a new `scope_id` through `author-project`; scope changes require author confirmation. Record target reader, book metadata, current author goal, and requested entry operation when known. Use the author decision loop only for missing choices required by the current gate; keep optional unknowns open without requesting a batch of metadata.

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

**Work:** For one approved batch at a time, invoke `fiction-workshop` first for diagnosis and proposed edits without writing. Show the exact files and changes, obtain and record approval, and back up every file through `author-project`. Run `prepare-revision-execution` before editing to validate the active cycle, exact decisions, approvals, backups, planned outputs, and current inputs. Implement only that batch, confirm the resulting full-manuscript scope and requested pass, then run `verify-revision-execution` to reread and link actual output hashes to the same cycle. Recheck affected continuity and update plan batch status and finding decisions.

**Gate:** Every planned batch is completed and accepted, or explicitly deferred with its downstream effect recorded. Each modified file has a successful backup record linked to its approval and a `verified` revision execution record for the active pass and full-manuscript target. No requested batch remains unapproved, prepared but unexecuted, or partially edited. Approved structural or character-fact changes trigger stale propagation and require restored full-target coverage and review before cycle completion.

## 7. Prose

**Inputs:** Structurally stable chapter revisions, current Story Bible, tracker, and an audit scope.

**Work:** Before starting, verify the structure gate and character-fact stability for this exact scope. If unstable, stop and display the required earlier operation. The author may instead approve a `prose-override` in the shared tracker; bind it to the current scope and structural evidence. Invoke `prose-mechanics` for author-selected audits among audits 1-18, one at a time and in upstream order. Produce report v2, wait for author decisions, and back up before applying approved fixes.

**Gate:** Every selected audit has a current report for every in-scope file, all findings have tracker decisions, and approved fixes have approvals and backups. The structure remains stable or a current override covers the exact scope. When the author selects only some audits, name the uncovered audits and record limited operation coverage.

## 8. AI cleanup

**Inputs:** Current manuscript scope, tracker, language metadata, and any prose reports.

**Work:** Read `<project-root>/.author-toolkit/references/avoid-ai-writing-adapter.md` and follow it exactly. Run English spans through the upstream `avoid-ai-writing` skill and Chinese spans through the adapter's local Chinese catalog. Rewrites require the standard approval and backup gate and a second detection pass.

**Gate:** Each in-scope file has a full result for its requested language procedure or an explicit `skipped` or `partial` language result. Reports contain severity mappings, engine and fallback details, coverage, and degradation. Every rewrite has approval, a backup ID, and second-pass detection. Every finding has a tracker decision. A failure in a required upstream or local execution path leaves the affected coverage blocked rather than producing a clean result.

## 9. Final review

**Inputs:** Current manuscript, Story Bible, approved revision plan, target reader, and review checklists.

**Work:** Invoke `author-review` with `review_mode=final`. Keep intent and consistency, writing standards, and fresh reader independent through its chunk -> volume/phase -> book protocol. Intent and standards chunks may run in parallel; fresh remains sequential with one logical reviewer and only its own reader-state. Without subagents, use resumable separate-session handoffs. `final-review` produces findings only and does not open a cycle. Read-only review remains available with unconverged state or an active cycle; accepted findings that require changes enter the protected cycle path.

**Gate:** For each perspective, every required chunk report and applicable synthesis report validates for the same current `scope_id`, all required final-review checks are covered, and findings are linked in the tracker. Any missing unit or synthesis leaves coverage partial or skipped. Record dissent without merging it away. Later manuscript or baseline changes make the affected final review stale. Return findings for author decisions; do not edit the manuscript. A `current-scope-review` cannot satisfy this gate. When final review supplies same-scope and same-checks evidence for an active cycle, link its review group, evaluate the full-manuscript target, and require the author's explicit cycle completion decision; final review alone completes neither current-draft revision convergence nor the cycle.
