# Creation operation gates

Load the section for the current operation. Preserve the shared [Author decision loop](../../revise-fiction/references/state-and-findings.md#author-decision-loop) at every gate and use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md`. Creation reports describe actual coverage; accepted creative text is not a diagnostic finding.

## 1. Creation baseline

**Inputs:** A 4.0.0 project, any Story Bible or draft baseline, and accessible current text.

**Work:** Require a current 4.0.0 project before creation writes. Establish target reader, core premise, protagonist, central conflict, and narrative constraints. Mark unwritten future turns, total length, character outcomes, and ending as unknown unless the author supplies them. Create missing `state/`, `batches/`, and `staging/` skeletons beneath the registered creation root. For a project with no accepted manuscript, initialize `state/current.md` from `../assets/current-state-template.md` with `scope_id: null` and the versioned Story Bible as its source. Build initial chapter records from existing text when present; label model extraction proposed until the author confirms it.

**Gate:** The minimum foundation and initial state differences are author-confirmed. No current scope is required before the first accepted manuscript file. Do not require a complete outline or ending.

## 2. Writing plan

**Inputs:** Current foundation, story state, tracker, active scope when present, author goal, and the active creation cycle. Ordinary creation requires its current satisfied starting evaluation; bootstrap instead has its explicit null starting scope and actually empty manuscript. A cycle that already has an accepted creation commit cannot enter this operation until it completes.

**Work:** Plan one chapter unless the author selects a scene or multi-chapter batch for one explicit write approval. Record purpose, POV, goal and conflict, entering and leaving character states, information release, setups and payoffs, continuity constraints, source mode, and exact target paths and actions. Preserve the existing manuscript layout; confirm a naming rule only for a new project.

Construct the context package from relevant Story Bible entries, chapter records, open threads, the preceding chapter ending, and searched older passages. Record every selected input and version. List related open findings and their accepted risk. Compute the dependency fingerprint as specified in `creation-state.md`.

**Gate:** `check-operation` permits `writing-plan` for the active cycle, and the author approves the plan and exact write batch. Record the approval with input versions. No manuscript file has changed. After a creation commit, return `creation-commit-limit` or the active-cycle operation blocker and display the exact `revise-draft` recovery command for bootstrap or `revise-increment` for ordinary creation instead of approving another plan.

## 3. Chapter creation

**Inputs:** Approved plan, context package, and empty staging directory for the batch.

**Work:** Invoke `fiction-workshop` for AI or mixed drafting. Write new chapters and proposed continuity patches only beneath `staging/<batch-id>/`. For author-supplied text, stage the exact proposed version. Keep rejected and superseded drafts outside the manuscript inventory. Do not run full prose, AI cleanup, or whole-book diagnosis automatically.

**Gate:** Staged content, proposed story-state differences, and output hashes are complete. Every create target was absent when planned; every existing target retains its original input hash.

## 4. Chapter review

**Inputs:** Approved plan, staged content, current relevant story state, and proposed scope.

**Work:** Check plan execution, chapter transitions, character knowledge, timeline, world rules, and unintended foundation changes. Present manuscript and state differences together. Recheck the dependency fingerprint before acceptance.

**Gate:** The author accepts the exact batch and resulting scope, or rejects it. Record exactly one `creation-manuscript` approval for the batch paths and one `creation-scope` approval for the complete ordered target paths, both as current chapter-review decisions with the batch, dependency-fingerprint, and scope-fingerprint binding specified in `creation-state.md`. Missing or duplicate types cannot authorize publication. Rejection instead requires exactly one current `creation-rejection` decision for the exact batch, with the same batch and unchanged-starting-scope binding; acceptance or another approval type cannot authorize rejection. Rejection leaves manuscript, current story state, and scope unchanged, preserves the staging drafts, and creates no commit journal. Ordinary creation revalidates the starting scope before no-change cycle completion. A rejected bootstrap batch leaves an empty manuscript and cannot complete; continue with an approved nonempty creation batch or import followed by `revise-draft`. Rejected staging itself supplies no current-draft revision convergence evidence.

## 5. Creation commit

**Inputs:** Accepted batch, approvals, staged files, current project state, and an active creation cycle with no existing creation commit.

**Work:** Follow the commit procedure in `creation-state.md`. Reread the manifest and scope, compare dependencies, verify old-file hashes and new-file absence, back up every existing target, and write a recovery journal before publication. Publish each file atomically, update story state, record the accepted scope, propagate evidence changes, and validate the result. Link the committed batch and journal to the same cycle. For bootstrap, derive the change set from the null starting scope with `scope_before_id: null` and transition the first nonempty publication to `revise-draft`; for ordinary creation, preserve the starting snapshot and transition to `revise-increment`. There is no additional author gate.

**Gate:** Every file and state artifact verifies against its accepted output hash, the new scope is current, and the immutable batch and committed journal agree. The cycle references those artifacts without duplicating their transitions. An interruption records exact completed and pending actions and stops automatic publication. This is a creation gate, not current-draft revision convergence; display the exact `revise-draft` command after bootstrap or `revise-increment` after ordinary creation, and block another writing plan until explicit cycle completion.

A creation restore requires separate explicit approval naming the batch, commit, and files. Safety-back up current content, restore old text, move newly created files into the safety backup before removing them from the manuscript, and confirm the resulting scope.

## 6. Creation import

**Inputs:** Current manifest, recorded scope, actual manuscript inventory, and existing story state.

**Work:** Account for every added, modified, missing, or reordered manuscript file. Extract proposed chapter-state differences for author-written or externally changed text. Show reading-order and evidence effects. Missing or damaged operational artifacts block the import. Record the confirmed result through `author-project reconcile-manuscript`; without an active cycle, identify the previous scope explicitly. During an active cycle, keep the same starting snapshot and update its target, cumulative change set, work set, and recovery position rather than opening a parallel cycle. For first-time bootstrap, the active cycle itself authorizes a null previous scope, so the first approved nonempty import derives every target path as created and supplies initial publication evidence without a creation commit. Later imports preserve that null cumulative origin and link their previous target. Creation commits, reconciliations, and verified executions form one scope-identity chain: commit scope_before matches the starting scope or null bootstrap origin, commit scope_after passes the existing batch/journal/approval/verified-file checks, and every later previous or input scope follows the preceding output. Creation commit→import and creation commit→edit→import are valid only with the commit event present. Empty reconciliation is a legal intermediate state awaiting nonempty recovery, never a completed target; recovery must link that null state and use full-manuscript `revise-draft`. Chain gaps and forged targets remain blockers. Every cycle-external reconciliation requires an explicit `previous_scope`; only verified empty recovery may explicitly set it to null, and omission is a usage error before any write.

**Gate:** The author confirms the actual manuscript, state differences, and resulting scope in a current tracker `creation-import` decision bound to the reconciliation ID, exact inventory fingerprint, and scope fingerprint or null empty scope. Chapter and current story-state artifacts must bind the actual sources and target, including a null-scope current state with no chapter children after complete deletion. Never silently refresh hashes or treat extracted facts as approved creative decisions. A satisfied previous full-manuscript evaluation with intact required evidence routes to `revise-increment`; missing or untrustworthy history routes to full-manuscript `revise-draft`. An empty target remains `not_satisfied` and requires an approved nonempty restore or import followed by full-manuscript `revise-draft`.

## 7. Milestone review

**Inputs:** Author-selected volume or story-phase boundary, chapter records, current text, and tracker.

**Work:** Build or refresh the corresponding volume summary from current chapter records. Run requested local causality, continuity, character-arc, timeline, thread, and pacing checks. Use the shared coverage-unit and chunked-review procedures when the selected text exceeds the available context.

**Gate:** The summary and actual checks are recorded with full, partial, or skipped coverage. Related findings receive author decisions or named risk acceptance before the next dependent plan; unrelated findings remain queued. Do not describe milestone evidence as whole-book final review.
