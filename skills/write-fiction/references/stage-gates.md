# Creation operation gates

Load the section for the current operation. Preserve the shared [Author decision loop](../../revise-fiction/references/state-and-findings.md#author-decision-loop) at every gate. Creation reports describe actual coverage; accepted creative text is not a diagnostic finding.

## 1. Creation baseline

**Inputs:** A v3 project, any Story Bible or draft baseline, and accessible current text.

**Work:** For v3.0, complete the confirmed additive v3.1 upgrade. Establish target reader, core premise, protagonist, central conflict, and narrative constraints. Mark unwritten future turns, total length, character outcomes, and ending as unknown unless the author supplies them. Create missing `state/`, `batches/`, and `staging/` skeletons beneath the registered creation root. For a project with no accepted manuscript, initialize `state/current.md` from `../assets/current-state-template.md` with `scope_id: null` and the versioned Story Bible as its source. Build initial chapter records from existing text when present; label model extraction proposed until the author confirms it.

**Gate:** The minimum foundation and initial state differences are author-confirmed. No current scope is required before the first accepted manuscript file. Do not require a complete outline or ending.

## 2. Writing plan

**Inputs:** Current foundation, story state, tracker, active scope, and author goal.

**Work:** Plan one chapter unless the author selects a scene or small chapter batch. Record purpose, POV, goal and conflict, entering and leaving character states, information release, setups and payoffs, continuity constraints, source mode, and exact target paths and actions. Preserve the existing manuscript layout; confirm a naming rule only for a new project.

Construct the context package from relevant Story Bible entries, chapter records, open threads, the preceding chapter ending, and searched older passages. Record every selected input and version. List related open findings and their accepted risk. Compute the dependency fingerprint as specified in `creation-state.md`.

**Gate:** The author approves the plan and exact write batch. Record the approval with input versions. No manuscript file has changed.

## 3. Chapter creation

**Inputs:** Approved plan, context package, and empty staging directory for the batch.

**Work:** Invoke `fiction-workshop` for AI or mixed drafting. Write new chapters and proposed continuity patches only beneath `staging/<batch-id>/`. For author-supplied text, stage the exact proposed version. Keep rejected and superseded drafts outside the manuscript inventory. Do not run full prose, AI cleanup, or whole-book diagnosis automatically.

**Gate:** Staged content, proposed story-state differences, and output hashes are complete. Every create target was absent when planned; every existing target retains its original input hash.

## 4. Chapter review

**Inputs:** Approved plan, staged content, current relevant story state, and proposed scope.

**Work:** Check plan execution, chapter transitions, character knowledge, timeline, world rules, and unintended foundation changes. Present manuscript and state differences together. Recheck the dependency fingerprint before acceptance.

**Gate:** The author accepts the exact batch and resulting scope, or rejects it. Record manuscript and scope approvals for acceptance. Rejection leaves manuscript, current story state, and scope unchanged and preserves the staging drafts.

## 5. Creation commit

**Inputs:** Accepted batch, approvals, staged files, and current project state.

**Work:** Follow the commit procedure in `creation-state.md`. Reread the manifest and scope, compare dependencies, verify old-file hashes and new-file absence, back up every existing target, and write a recovery journal before publication. Publish each file atomically, update story state, record the accepted scope, propagate evidence changes, and validate the result. There is no additional author gate.

**Gate:** Every file and state artifact verifies against its accepted output hash, the new scope is current, and the immutable batch and committed journal agree. An interruption records exact completed and pending actions and stops automatic publication. This is a creation gate, not current-draft revision convergence; offer `revise-increment` for the added and affected paths when revision is the next goal.

A creation restore requires separate explicit approval naming the batch, commit, and files. Safety-back up current content, restore old text, move newly created files into the safety backup before removing them from the manuscript, and confirm the resulting scope.

## 6. Creation import

**Inputs:** Current manifest, recorded scope, actual manuscript inventory, and existing story state.

**Work:** Account for every added, modified, missing, or reordered manuscript file. Extract proposed chapter-state differences for author-written or externally changed text. Show reading-order and evidence effects. Missing or damaged operational artifacts block the import.

**Gate:** The author confirms the actual manuscript, state differences, and resulting scope. Never silently refresh hashes or treat extracted facts as approved creative decisions.

## 7. Milestone review

**Inputs:** Author-selected volume or story-phase boundary, chapter records, current text, and tracker.

**Work:** Build or refresh the corresponding volume summary from current chapter records. Run requested local causality, continuity, character-arc, timeline, thread, and pacing checks. Use the shared coverage-unit and chunked-review procedures when the selected text exceeds the available context.

**Gate:** The summary and actual checks are recorded with full, partial, or skipped coverage. Related findings receive author decisions or named risk acceptance before the next dependent plan; unrelated findings remain queued. Do not describe milestone evidence as whole-book final review.
