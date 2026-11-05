# Current-draft operation gates

Load only the current operation. Evidence comes from the shared project and is judged by operation, scope, input versions, subchecks, and dependencies. Finish each operation with `awaiting_author`; the author starts the next one explicitly. At every author gate, also follow the [Author decision loop](../../revise-fiction/references/state-and-findings.md#author-decision-loop) and use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md`.

At a stable operation gate, apply the [current-draft convergence cycle rules](../../author-project/references/operations.md#current-draft-convergence-cycle). An active cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. With no active cycle, the author may switch to `write-fiction`, `revise-fiction`, `revise-increment`, or `revise-request` through its exact command; no entry starts automatically. Reuse a local coverage unit only when every path, hash, subcheck, and dependency matches. Reevaluate every applicable whole-book synthesis after relevant changes instead of carrying it forward with unchanged local units. Creation evidence does not satisfy `chapter-revision`. Before claiming current-draft revision convergence for a requested pass, apply the shared [Current-draft revision convergence](../../revise-fiction/references/state-and-findings.md#current-draft-revision-convergence) definition.

## 1. Intake

**Inputs:** A v3 project root and at least one readable manuscript file.

**Work:** Inventory all manuscript files in reading order, record missing or duplicate chapter identifiers, language, exclusions, and SHA-256 versions. Confirm the current `scope_id` with the author. Record the current author goal when known; total length, outline, ending, and requested outcome may remain open.

**Gate:** Manifest and tracker validate, every file is accounted for, paths are readable, exclusions are named, and the author confirms the scope. Write an intake report in `reports/intake/`. Missing metadata does not block current-text work.

## 2. Draft baseline

**Inputs:** Current scope, manuscript, and any existing Story Bible or earlier baseline.

**Work:** Copy `assets/draft-baseline-template.md` to `draft-baseline.md` unless another project path is already registered in the session. Summarize only the current manuscript under `observed`, `inferred`, and `unknown`. Use Story Bible facts as labeled inputs rather than silently treating them as written events. Show the proposed baseline as context. After scope confirmation, review corrections and baseline confirmation through the author decision loop.

**Gate:** The baseline covers current premise and conflict as written, principal characters and current arc trends, established world facts, timeline constraints, and open questions. It identifies the active `scope_id` and input versions. Unknown future turns and ending are valid entries and do not block diagnostics.

## 3. Diagnostics

**Inputs:** Current manuscript, draft-baseline, and scope.

**Work:** Invoke `fiction-workshop` Developmental Editor for scene-level and local chapter diagnosis. Examine scene goal/conflict/outcome, causality, chapter function, information release, local pacing, transitions, and current climactic turns. Exclude act-level landmark placement, percentage timing, full-book ending completeness, and missing future beats. Never force the current last chapter into a climax or resolution role. Persist full local coverage units for independently covered chapters and record their dependencies for later incremental reuse.

**Gate:** Every selected chapter has local narrative coverage, findings reference existing text, assumptions and local structural risks are disclosed, and all findings have tracker decisions. A requested pass intended to establish current-draft revision convergence has full local coverage units for every target-scope chapter and a full-target synthesis. Unwritten future material remains an open question rather than a defect.

## 4. Characters

**Inputs:** Current manuscript, draft-baseline, local findings, and any existing archetype profiles.

**Work:** Use Character Consultant for current motivation, voice, choices, and arc trends, then Continuity Tracker for timeline, relationships, knowledge states, and world facts. Use archetype Conformance for existing profiles or another archetype mode when the author requests it. Do not require full-cast readiness or final arc resolution. Record full local coverage units for independently covered paths and the baseline or other dependencies that constrain each check.

**Gate:** Requested characters have current-text and continuity coverage, every finding has a tracker decision, approved baseline corrections are written, and unresolved facts are explicit. Reports list actual subchecks, including any omitted full-arc or ensemble checks, so later full-book gates can treat the coverage truthfully. A requested pass intended to establish current-draft revision convergence composes current local coverage and a full-target synthesis for every requested path and subcheck.

## 5. Revision plan

**Inputs:** Current baselines, diagnostics and character reports, tracker, and scope.

**Work:** Copy `../../revise-fiction/assets/revision-plan-template.md` to `.author-toolkit/revision-plan/<plan-id>.md`. Link every accepted finding to a concrete local action, file, order, scope, baseline impact, and batch. Keep deferred and dismissed decisions visible.

**Gate:** Accepted findings map to batches or explicit deferrals, conflicts are resolved with the author, and the author approves the plan and file scope. With no accepted edits, record this operation and chapter revision as skipped for the requested pass.

## 6. Chapter revision

**Inputs:** Approved plan, draft-baseline, manuscript, and tracker.

**Work:** Diagnose one batch and show exact changes before writing. Local chapter splits, merges, reordering, cuts, and scene rewrites require the same explicit approval and backups as other edits. Implement only the approved batch, update current-scope hashes, and recheck affected continuity and baseline differences.

**Gate:** Every planned batch is accepted or explicitly deferred, each modified file has a backup linked to its approval, no requested batch is partially edited, and affected evidence is marked stale by dependency.

## 7. Prose

**Inputs:** Intake, confirmed scope, language metadata, current manuscript, and tracker.

**Work:** The author may enter directly without diagnostics or a full-book baseline. Check for approved but unexecuted edits to the selected text; explain rework risk and record a `prose-risk` approval if the author proceeds. Invoke `prose-mechanics` audits 1-18 one at a time in upstream order, wait for decisions, and back up approved fixes. Persist full local coverage units for each fully covered path and requested audit. Issues outside the scope and unknown future structure do not block this operation.

**Gate:** Each selected audit has a current report for the scope, findings have tracker decisions, and fixes have approvals and backups. Name unselected audits and record limited operation coverage. A requested pass intended to establish current-draft revision convergence covers audits 1-18 with current local coverage and a full-target synthesis rather than carrying an unselected-audit gap into that claim.

## 8. AI cleanup

**Inputs:** Confirmed scope, language metadata, current manuscript, and tracker.

**Work:** Follow `<project-root>/.author-toolkit/references/avoid-ai-writing-adapter.md`. Use the upstream skill for English spans and the local Chinese catalog for Chinese spans. Detection and approved rewrites use the shared approval and backup records. A second detection follows every rewrite. Persist full local coverage units for every fully covered path and requested check, including engine and dependency identity.

**Gate:** Every in-scope file has full, partial, or skipped language coverage with engine and degradation details. Every finding has a tracker decision. An upstream failure blocks the operation rather than producing a clean result. Partial or skipped requested applicable coverage prevents current-draft revision convergence; a narrowed requested pass names its actual limits. Documented inapplicable language checks remain explicitly `skipped` with their reasons.

## 9. Current-scope review

**Inputs:** Confirmed scope, current manuscript, relevant baselines, approved plan when used, target reader when known, and review checklists.

**Work:** Invoke `author-review` with `review_mode=current-scope`. Run independent intent and consistency, writing standards, and fresh-reader perspectives over the same `scope_id` using chunk -> volume/phase -> book coverage. Intent and standards chunks may run in parallel; fresh remains sequential with one logical reviewer and only its own reader-state. Without subagents, use resumable separate-session handoffs. Produce findings only.

**Gate:** For each perspective, every required chunk report and applicable synthesis report validates for the same scope and lists actual subchecks. Any missing unit or synthesis leaves coverage partial or skipped. Full-book ending, complete landmark coverage, and other inapplicable checks are explicitly `skipped`. The reports and session state describe only the target scope, never a completed book or final review. Later changes stale the affected review evidence. Review findings enter the author decision loop; accepted edits return to the affected operations and require new downstream coverage and review before current-draft revision convergence can be claimed.
