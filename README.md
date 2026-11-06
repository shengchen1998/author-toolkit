# Author Toolkit

Incremental fiction creation and four fiction revision strategies sharing one
project evidence model, plus six independent writing skills for Claude Code and
Kimi Code.

[Chinese quick start](README.zh-CN.md) | [Controlled terminology](references/terminology.md) |
[3.2 migration](docs/MIGRATION-3.2.md) |
[3.1 migration history](docs/MIGRATION-3.1.md) |
[3.0 migration history](docs/MIGRATION-3.0.md) |
[2.0 migration history](docs/MIGRATION-2.0.md) |
[Validation status](docs/VALIDATION.md)

## What is included

Version 3.2.0 contains 16 skills in three groups.

### User entry points

| Skill | Purpose |
| --- | --- |
| `ask-author` | Read project state and route the author to the appropriate user entry or independent skill. |
| `setup-author-toolkit` | Register an existing writing project and initialize the shared project state required by creation and revision. |
| `write-fiction` | Create or continue a novel through reviewed creation batches, staged drafts, synchronized story state, and milestone reviews. |
| `revise-fiction` | Revise a whole novel through its Story Bible, macro structure, character arcs, and final review. |
| `revise-draft` | Revise the current manuscript through a draft baseline, local narrative diagnostics, and current-scope review of the target scope. |
| `revise-increment` | Revise added or affected chapters after incremental creation while applying the evidence-reuse rules to unchanged chapters and completing a full-target current-scope review. |
| `revise-request` | Apply an author-defined revision to existing content from a full-manuscript base scope that has reached current-draft revision convergence and restore that state for the full-manuscript target scope. |

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` must all run the same
`setup-author-toolkit` first. Setup does not accept a workflow name or operation
argument; registration and intake are identical for every subsequent strategy.

### Shared orchestration skills

These skills support the user entries. They are not separate user workflows.

| Skill | Purpose |
| --- | --- |
| `author-project` | Read and update project registration, neutral evidence, current scope, pending actions, current-draft convergence cycles, artifact paths, backups, and restores. |
| `author-handoff` | Preserve session context and support resume, rework, and switching between creation and revision user entries. |
| `author-review` | Run independent intent, craft, and fresh-reader reviews without editing the manuscript, including resumable chunked review for large books. |

### Independent writing skills

These six skills keep their existing names, triggers, direct invocation, and
standalone behavior. They can be used without a shared creation or revision
workflow.

| Skill | Purpose | Example request |
| --- | --- | --- |
| `fiction-workshop` | Draft or edit fiction with developmental, line-editing, character, continuity, and brainstorming perspectives. | "As developmental editor, analyze chapter 3." |
| `character-archetypes` | Identify archetype pairings and audit cliches, drift, and cast balance. | "What archetype is this character?" |
| `story-structure` | Map a new structure or audit landmark beats and signposts in an existing draft. | "Audit this manuscript's structure." |
| `narrative-nonfiction` | Develop narrative nonfiction, reader transformation, metaphors, exercises, reveals, and voice. | "Design the transformation arc for this book." |
| `prose-mechanics` | Run 19 focused sentence-level audits on stabilized drafts, including the local Chinese AI-Isms catalog. | "Run an echoes audit on chapter 7." |
| `avoid-ai-writing` | Run the vendored English AI-writing detection and rewrite catalog. | "Detect mode: flag AI patterns in this English chapter." |

`avoid-ai-writing` is vendored from
[conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing)
under MIT. See [ATTRIBUTION.md](ATTRIBUTION.md). Its standalone upstream behavior
remains English-specific. For standalone Chinese AI-associated pattern detection
or rewriting, invoke `prose-mechanics` with its AI-Isms audit; shared
`ai-cleanup` selects the English or local Chinese procedure by actual text span.

## Scope and language support

The shared 3.2 creation and revision workflows support single-book fiction
projects with Markdown or plain-text manuscripts. `write-fiction` can start
without a complete outline or ending and can also continue an existing manuscript.
`revise-fiction` addresses the whole book. `revise-draft` can work on an
unfinished manuscript; its diagnostics address the target scope rather than
judging the percentage of a future book or penalizing beats that do not yet
exist. `revise-increment` applies the same current-draft operation gates after
scope growth, reusing only reusable evidence for unchanged text and reviewing the
full target scope. `revise-request` starts from a full-manuscript base scope that
has reached current-draft revision convergence, applies an author-defined
revision to existing content, and restores that state for the full-manuscript
target scope.

Narrative nonfiction remains a direct `narrative-nonfiction` task. Multi-book
projects and integrations with other hosts are outside the supported 3.2
workflows.

English and Chinese are the core workflow languages. Chinese prose audits use
`skills/prose-mechanics/references/chinese-rules.md`, with Chinese sentence
boundaries, character-based measurement, declared segmentation, grammar rules,
and local word and phrase catalogs. Full Chinese language coverage means
completion of the requested Chinese subchecks; it never means that an English
metric or an English-only engine was treated as equivalent. Chinese
AI-associated findings describe textual patterns and do not establish AI
authorship.

Workflow reports and living trackers retain English headings, columns, and
status values as their machine-readable Markdown contract. Chinese explanations,
finding text, quotations, and manuscript paths remain supported as content.
JSON report fields and machine enums retain their versioned contracts. Other
languages use the documented fallback rules, and reduced rule coverage is
recorded as partial or skipped. Use the
[controlled workflow terminology](references/terminology.md) for shared natural
language and exact contract values.

## Installation

### Claude Code plugin

Add the marketplace, then install the plugin:

```bash
claude plugin marketplace add shengchen1998/author-toolkit
claude plugin install author-toolkit@author-toolkit
```

### Kimi Code plugin

Run:

```text
/plugins install https://github.com/shengchen1998/author-toolkit
```

Then run `/reload` or start a new session with `/new`.

### Generic project or user installation

The generic installer requires Node.js >= 22.20. Install into the current
project for both supported hosts:

```bash
npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli
```

Add `-g` to install at user level instead:

```bash
npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli -g
```

Updates are manual. Check and apply them with:

```bash
npx skills check
npx skills update
```

No installation method in this document implies automatic updates. See the
[validation status](docs/VALIDATION.md) before relying on a specific host or
installation path.

## Set up a project and choose a strategy

Use the command forms that match the installation method:

| Installation | Host | Setup | Creation | Whole-book revision | Current-draft revision | Incremental revision | Request revision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plugin | Claude Code | `/author-toolkit:setup-author-toolkit` | `/author-toolkit:write-fiction` | `/author-toolkit:revise-fiction` | `/author-toolkit:revise-draft` | `/author-toolkit:revise-increment` | `/author-toolkit:revise-request` |
| Plugin | Kimi Code | `/skill:author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:write-fiction` | `/skill:author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-draft` | `/skill:author-toolkit:revise-increment` | `/skill:author-toolkit:revise-request` |
| Bare skills | Claude Code | `/setup-author-toolkit` | `/write-fiction` | `/revise-fiction` | `/revise-draft` | `/revise-increment` | `/revise-request` |
| Bare skills | Kimi Code | `/skill:setup-author-toolkit` | `/skill:write-fiction` | `/skill:revise-fiction` | `/skill:revise-draft` | `/skill:revise-increment` | `/skill:revise-request` |

For `ask-author`, use the same command form with that skill name.

A quick run looks like this:

1. Identify the writing project directory. It may contain an existing Markdown
   or plain-text manuscript, or it may be the destination for a new novel.
2. Invoke `setup-author-toolkit` with that path. Answer the project registration
   and language questions. Registration records paths; it does not move the
   manuscript into a new layout. Setup deploys the shared contracts bundled with
   the skill into `.author-toolkit/references/`, preserving matching files and
   stopping on version conflicts. An approved conflict replacement first
   preserves the existing file beneath the registered backups path. For a new
   project, setup also installs the project-level `AGENTS.md` template when no
   such file exists, preserving any existing agent instructions. Do not pass a
   workflow name or operation argument. After a toolkit update, an existing v3
   project may need setup again to deploy new shared references. Its initial
   `author-project` read, validation, and status calls check every packaged file
   and route missing files or hash mismatches back through setup instead of
   treating a valid manifest as proof of reference deployment.
3. After setup validates the shared manifest, choose `write-fiction` to create
   or continue a novel, `revise-fiction` for whole-book revision, `revise-draft`
   for the available manuscript and current-scope review, `revise-increment` to
   bring added or affected chapters to current-draft revision convergence, or
   `revise-request` to revise existing content from a full-manuscript base scope
   that has reached that state. The selected strategy establishes and confirms
   the initial target scope when one is needed.
4. Review evidence and proposals at the author gates. The agent presents one
   active decision at a time so you can discuss evidence and alternatives before
   deciding. Planning, manuscript writes, creation acceptance, and restores have
   distinct approvals.

### `write-fiction`: incremental creation

The creation operations are:

1. `creation-baseline`: Establish the minimum intent foundation and creation
   state. Future plot, total length, character outcomes, and the ending may
   remain unknown.
2. `writing-plan`: Plan one chapter by default, select versioned context, and
   define the exact target paths and file actions.
3. `chapter-creation`: Draft into staging with `fiction-workshop`, or stage
   author-supplied text.
4. `chapter-review`: Check plan execution, transitions, and continuity, then
   obtain creation acceptance or rejection of the complete batch.
5. `creation-commit`: Publish the accepted batch, update story state and
   publication scope, and preserve recovery records.
6. `creation-import`: Reconcile author-added, modified, deleted, or reordered
   manuscript files created outside the creation loop.
7. `milestone-review`: Summarize an author-selected volume or story phase and
   run requested local checks without calling it a final review.

The repeating loop is `writing-plan` -> `chapter-creation` -> `chapter-review`
-> `creation-commit`. AI-written, author-written, and mixed batches use the same
gates. Keep only one active creation batch per book.

Before writing, approve both the chapter plan and the exact write batch,
including paths, actions, and input versions. After staging, one creation
acceptance covers the exact manuscript content, proposed story-state differences,
and resulting ordered publication scope; manuscript and scope approvals are
recorded separately. Acceptance allows `creation-commit` to proceed without
another author gate. Publication alone does not establish current-draft revision
convergence for the publication scope. After first-time bootstrap publication,
continue the same cycle with `revise-draft` for the initial full-manuscript
evaluation. After ordinary creation, continue the same cycle with
`revise-increment`; another `writing-plan` waits for satisfied full-target
evaluation and the author's explicit cycle completion decision.

### `revise-fiction`: whole-book revision

The nine operations are:

1. `intake`: Clarify scope and use the registered project.
2. `story-bible`: Establish the story foundation and manuscript baseline.
3. `structure`: Review macro structure.
4. `characters`: Review complete character arcs and continuity.
5. `revision-plan`: Organize findings and author decisions into a revision plan.
6. `chapter-revision`: Apply approved chapter revisions with backups.
7. `prose`: Run sentence-level review and approved fixes.
8. `ai-cleanup`: Detect or revise AI writing patterns as requested.
9. `final-review`: Verify the whole-book result with three independent
   perspectives and prepare the handoff.

Read-only structure analysis and final review remain available without opening a
cycle. Manuscript-changing or required-evidence-invalidating work starts from a
current satisfied full-manuscript evaluation in a linked `revise-fiction` cycle,
retains every whole-book gate, and restores current-draft revision convergence before
the author's explicit cycle completion decision.

### `revise-draft`: current-draft revision

The mirrored nine operations are:

1. `intake`: Clarify the current scope and use the same registered project.
2. `draft-baseline`: Establish the available manuscript, its input versions, and
   the target scope without requiring a complete manuscript, outline, or ending.
3. `diagnostics`: Review local narrative problems in the available text. Do not
   score completion of an imagined whole book or flag missing future beats.
4. `characters`: Review current character arcs and continuity in the target scope.
5. `revision-plan`: Organize findings and author decisions when revision is
   requested.
6. `chapter-revision`: Apply approved revisions to the target scope with backups.
7. `prose`: Run sentence-level review and approved fixes.
8. `ai-cleanup`: Detect or revise AI writing patterns as requested.
9. `current-scope-review`: Review the target scope with three independent
   perspectives. Mark whole-book checks that do not apply as `skipped` with
   their scope rationale.

All four revision user entries share the character capability. The draft,
incremental, and request-driven paths require current arcs and continuity; the
whole-book gate requires additional subchecks for complete arcs and book-level
continuity. A draft engagement may enter directly at `prose` or `ai-cleanup`. If
no manuscript revision is requested, `revision-plan` and `chapter-revision` may
be skipped with the reason recorded. A direct entry or narrowed requested pass
does not by itself establish current-draft revision convergence.

Independent local, diagnostic, direct-prose, AI-cleanup, and narrowed draft work
may finish without a cycle or a current-draft revision convergence claim. It never
reduces the last satisfied full-manuscript subcheck baseline. If it leaves the
manuscript unconverged, the other manuscript-changing entries remain blocked
until an independent full-manuscript `evaluate-draft` operation produces a
current satisfied evaluation. A resolved finding in that recovery requires
`prepare-draft-revision-execution` before editing and
`verify-draft-revision-execution` afterward, producing a `cycle_id: null`
execution whose approved inputs and actual outputs are checked. Active-cycle
draft recovery instead links and evaluates the same cycle. Every cross-entry
route displays its exact host command and waits for the author.

### `revise-increment`: revision after incremental creation

Use this entry when the previous scope has reached current-draft revision
convergence and creation or import adds or affects chapters. For example, five
chapters that have reached current-draft revision convergence plus a new sixth
chapter require new evidence for chapter 6 and any affected earlier text;
creation review does not establish revision completion.

The incremental pass uses the same nine current-draft operations and shared
state:

1. Confirm the previous scope, target scope, change set, and work set.
2. Update the draft-baseline for the full target scope and run diagnostics,
   character checks, prose, and AI cleanup on the work set. Reuse unchanged full
   local coverage units only when their operation, source report, paths and
   hashes, subchecks, and dependencies match. Missing reusable units add the
   affected old paths to the work set.
3. Plan and apply only approved work-set edits with backups, then compose new
   operation coverage and full-target syntheses for the target scope.
4. Run a full-target current-scope review with all three perspectives. The fresh
   reader reads the full target scope sequentially; limiting edits does not limit
   review reading.
5. Process review findings and repeat affected operations and review after
   accepted edits. Claim current-draft revision convergence only when the shared
   evidence, finding, approval, coverage, and review conditions are all current.

### `revise-request`: request-driven revision after current-draft revision convergence

Use this entry when the full-manuscript base scope has reached current-draft
revision convergence from the `revise-draft` perspective and the author has any
type of revision request for existing content. Requests may concern plot, scenes,
characters, continuity, POV, prose, or AI cleanup. Requested macro-structure work
can additionally use `story-structure` Audit without adopting the
`revise-fiction` final-review gate.

1. Verify the full-manuscript base scope and its current-draft revision
   convergence evidence. Return to `revise-draft` when that base scope has not
   reached that state, to `revise-draft` after first-time bootstrap publication,
   or to `revise-increment` when ordinary creation or import has grown the scope.
2. Confirm the requested outcome, constraints, request set, full-manuscript
   target scope, and initial work set. The request set determines what to change;
   the full-manuscript target scope determines what must be proven current again.
3. Apply only approved batches with backups. Expand the work set by actual text
   and dependency impact, rerun affected operations, and compose new operation
   coverage and full-target syntheses for the target scope while reusing matching
   unchanged full local coverage units.
4. Preserve every applicable subcheck required by the base scope's current-draft
   revision convergence evidence and add newly requested checks. A local request
   does not silently reduce the coverage required for current-draft revision
   convergence.
5. After any manuscript change, run another full-target current-scope review with
   all three perspectives and a sequential fresh reader. Process findings and
   rework, then report request completion and current-draft revision convergence
   for the full-manuscript target scope separately.

The skill definitions contain the full gates and audit rules.

## Shared project files and evidence

All five strategies use the same neutral `.author-toolkit/project.json` and
artifact paths. New projects use schema 3.2.0; v3.0 and v3.1 manifests remain
readable. `scripts/migrate-v32.mjs` migrates v2, v3.0, and v3.1 projects directly
to v3.2. The existing `scripts/migrate-v3.mjs` command and
`migrateProjectToV3` function are compatibility wrappers with the same target.

- `project.json` records project registration, artifact locations, and optional
  `current_scope` and `pending_action`. It has no `workflow.name`,
  `current_stage`, or `stages` state.
- `.author-toolkit/references/` contains the shared runtime contracts deployed
  by setup from the setup skill's bundled payload. This fixed operational
  directory has no manifest field. Setup preserves matching files and requires
  separate approval plus a backup before replacing a mismatched file.
- `story-bible.md` records author intent. Accepted manuscript text establishes
  observed story facts; neither source silently overwrites the other when they
  conflict.
- `audit-tracker.md` records stable finding IDs, statuses, author decisions,
  shared approvals, and report pointers.
- `reports/` preserves diagnostic context and machine-readable results. A rerun
  creates a new report instead of rewriting a delivered report. Reusable
  coverage units and the living coverage index also belong under this
  registered path.
- `sessions/` records completed work, open decisions, backup paths, and the
  stopping point so a later session can resume or handle rework.
- `backups/` preserves affected manuscript files before approved edits.
  Restoration also requires author approval.
- `handoffs/` preserves pointers to the current evidence and next action.
- `paths.creation` registers creation state and defaults to
  `.author-toolkit/creation/`. It contains `state/current.md`,
  `state/chapters/`, `state/volumes/`, `batches/`, and `staging/`.
- The convergence state root defaults to `.author-toolkit/convergence/` on v3.2.
  Confirming a scope preserves an immutable scope snapshot and inventory snapshot
  there. The scope fingerprint covers ordered path/hash pairs and sorted
  exclusions; record metadata and timestamps are excluded.

Project migration preserves manuscripts, reports, findings, approvals, scopes,
sessions, staging, backups, batches, journals, and pending work. Only an exact
legacy scope confirmation supports a confirmed scope snapshot; other legacy
confirmed scopes become proposed for reconfirmation. Legacy reports and pending
actions create no satisfied evaluation or active cycle. Reconcile interrupted
journals and writes before dependent cycle work. Explicitly reject legacy
staging, or reapprove its exact content in a new cycle only after a current
satisfied starting evaluation. An unproven legacy revision base uses current
full-manuscript `revise-draft` recovery with the normal coverage-reuse rules.
See [Migrating to 3.2](docs/MIGRATION-3.2.md) for the migration matrix and
recovery procedure.

Chapter and volume story state is derived from accepted manuscript text and
versioned source artifacts. It supports continuation; it does not replace the
Story Bible's intent or the manuscript's facts. Rejected staging text does not
enter story state or manuscript scope.

The manifest records the actual paths, including custom locations. Switching
among `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and
`revise-request` at a stable operation gate reuses these artifacts and requires
no second project tree or migration. An active current-draft convergence cycle
instead requires its exact recovery work for manuscript changes and blocks a
parallel manuscript-changing cycle. Read-only inspection remains available, and
no switch automatically resumes a pending write.

### Current-draft convergence cycles

V3.2 stores at most one active current-draft convergence cycle in
`<convergence-state-root>/active-cycle.json`. Completed records remain immutable under
`<convergence-state-root>/cycles/`. The versioned contract records initiating and
current strategies, bootstrap, starting and target scope references, requested
pass, recovery position, related artifacts, change set, work set, evaluation
references, and completion. Request base scope and increment previous scope map
to the same `starting_scope` role. Execution, review, evaluation, and completion
references connect later evidence without making the reference itself proof of
current-draft revision convergence.

First-time bootstrap is available only for `write-fiction` with an actually empty
manuscript and no existing scope. It uses a null starting scope without treating
the empty manuscript as having reached current-draft revision convergence. Its
first committed publication keeps the exact staging, approval, backup, journal,
and story-state requirements, records a null `scope_before_id`, and resumes the
same cycle through `revise-draft`. The initial full-manuscript pass links that
publication, its requested pass and review evidence, a satisfied evaluation, and
the explicit completion decision. Empty manuscript state cannot satisfy or
complete the cycle. Later creation uses the ordinary satisfied-start and
one-commit rules; bootstrap is not available again.

Every ordinary start requires a current satisfied starting convergence evaluation. A
valid full-manuscript scope, pending action, or caller-supplied claim cannot
manufacture that result; unavailable proof blocks the start with
`starting-evaluation-indeterminate`. Only the latest completed-cycle or independent
evaluation is eligible: a newer narrowed, `not_satisfied`, or `indeterminate`
independent result blocks the start instead of reopening it through an older
satisfied record. A later current satisfied evaluation restores the ordinary start.

Use the executable `author-project` facade for lifecycle operations:

```bash
node scripts/author-project.mjs start-cycle --project-root <project-root> --input <request.json>
node scripts/author-project.mjs transition-cycle --project-root <project-root> --input <transition.json>
node scripts/author-project.mjs reconcile-cycle --project-root <project-root> [--input <direction.json>]
node scripts/author-project.mjs prepare-draft-revision-execution --project-root <project-root> --input <independent-preparation.json>
node scripts/author-project.mjs verify-draft-revision-execution --project-root <project-root> --input <independent-verification.json>
node scripts/author-project.mjs prepare-revision-execution --project-root <project-root> --input <preparation.json>
node scripts/author-project.mjs verify-revision-execution --project-root <project-root> --input <verification.json>
node scripts/author-project.mjs evaluate-cycle --project-root <project-root> --input <evaluation-request.json>
node scripts/author-project.mjs evaluate-draft --project-root <project-root> --input <independent-evaluation.json>
node scripts/author-project.mjs complete-cycle --project-root <project-root> --input <completion.json>
node scripts/author-project.mjs cycle-status --project-root <project-root>
node scripts/author-project.mjs cycle-gate --project-root <project-root>
```

A second manuscript-changing cycle returns `active-cycle-exists` with the active
cycle's required strategy, operation, and command. Transitions acquire a
cross-process lock directory, reread the active cycle ID and expected revision
inside that lock, and verify referenced artifact hashes before an atomic update.
Only one writer can succeed for the same expected revision; later writers get
`cycle-revision-conflict`. Lock timeouts and errors block without a success
claim, and a leftover lock directory requires owner-verified explicit recovery.

Dependent operations record manifest `cycle_operation` before publishing their
artifact and advancing the active cycle, then clear it during final manifest
coordination. Completion writes completed history and `last_completed_cycle`
before removing the expected active bytes. An interruption blocks dependent work
with the exact cycle, revision, operation, scope, or artifact mismatch while
read-only status remains available. Run `reconcile-cycle` without a direction for
a write-free diagnosis. Recovery directions accept, attach, resume, discard, or
finish only the exact intended work; they never rewrite evaluations, approvals,
commit journals, backups, or verified executions. Pending action still describes
only the current operation and author gate. Its cycle, revision, operation, and
scope-fingerprint fields are coordination references, not ownership or approval
for a write, publication, restore, or completion. These are coordinated writes,
not a multi-file filesystem transaction.

Request-driven edits use revision execution records under `executions/`. Preparation
verifies existing author decisions, exact edit approvals, backup manifests and
bytes, and current input hashes without creating approval or writing manuscript.
Plan decisions and edit approvals bind the plan and batch identities and hashes,
operation, input scope fingerprint, complete ordered paths, actions, input hashes,
and approved outputs; the same scope ID cannot make an old approval valid for new
content. Verification rereads actual output bytes against the prepared hashes and
binds the final requested pass and full-manuscript target scope. The final pass
preserves every prepared operation and subcheck and may only add requirements.
Pure insertion and deletion do not invent retained-path reorders; real retained
reordering still requires exact approved actions. `prepared` never satisfies
current-draft revision convergence. Resolved findings require a current verified
execution; deferred and dismissed findings retain their decisions, and accepted
review fixes require new affected coverage and another full-target current-scope
review. Earlier verified executions remain historical after later approved batches.

A full-manuscript no-edit pass records its requested-pass fingerprint, inherited
and newly requested subchecks, hashed coverage evidence, no-edit decisions,
three-perspective review group, complete fresh reader chain, and semantic
attestations. `evaluate-cycle` derives the outcome and an immutable evidence
graph; callers cannot supply an outcome. The evaluator accepts eligible local
units from an earlier pass while requiring a new full-target index, synthesis,
and review group for the requested pass. Changing the cycle's requested pass
after satisfaction makes its old target evaluation stale for status, gate, and
completion. Whenever a cycle's initiating or current strategy is `revise-fiction`,
including request→fiction and draft→fiction work, it requires current full-target
Story Bible, structure, and final-review evidence bound to that pass and scope;
current-scope review alone cannot satisfy the whole-book gates. Once revision
execution is linked, the active cycle cannot switch away from `revise-fiction`
before that evidence and explicit cycle completion.

Completion requires a separate explicit author decision. The operation appends
that decision to the tracker, recomputes and saves a new evaluation with the
changed tracker hash, publishes completed history and the completed-cycle
pointer before removing active state, and completes only if the new evaluation
remains `satisfied`. Deterministic checks verify evidence identity and structure, but
actual reading and editorial judgments remain bounded by trust in the host and
logical-reviewer attestations and the recorded author decisions. Status also
returns `request_completion` independently: approved request batches and decisions
can be complete while full-manuscript evidence is not yet satisfied.

Independent convergence status and convergence gate queries are read-only:

```bash
node scripts/validate.mjs --convergence-status <manifest-path>
node scripts/validate.mjs --convergence-gate <manifest-path>
```

A valid status query exits successfully for `satisfied`, `not_satisfied`, or
`indeterminate`. The gate succeeds only for current `satisfied` evidence. Missing
proof returns `indeterminate`, `current: false`, and structured blockers without
preventing status, diagnostics, or review.

### Evidence reuse and pending actions

Evidence is reusable only when its `operation`, `scope_id`, input versions,
coverage, subchecks, and dependencies match the proposed work. A new scope
requires author confirmation. When an input or dependency changes, affected
evidence becomes `stale`; an old report's valid schema alone does not make it
current evidence.

A creation batch also records a dependency fingerprint for its plan, selected
context, and target inputs. On return to a staged draft, recompute that
fingerprint. Changed included dependencies require re-review or replanning;
unrelated manuscript growth requires a refreshed publication scope but does not
by itself invalidate the staged content.

`pending_action` describes the single next operation awaiting work or an author
decision. Optional cycle, revision, operation, and scope-fingerprint fields keep
it aligned with coordinated work; they do not make it lifecycle history or
permission to write, publish, restore, complete, or resume manuscript changes.

### Creation staging, commits, and restores

AI drafts are written beneath `staging/<batch-id>/` before publication. Author
and mixed batches follow the same staging and acceptance rules. At commit time,
every new file must still be absent, every existing target must match its
accepted input hash, and every existing target must have a backup.

The commit journal is written before manuscript publication. Each file is
published through a verified temporary sibling and atomic rename, with journal
updates after each transition. The journal coordinates a multi-file batch; it
does not claim that the filesystem provides one transaction across all files.
An interrupted commit records completed and pending actions and stops automatic
publication.

A restore requires separate explicit approval naming the commit or backup and
exact files. Current content receives a safety backup first. Files created by
the restored batch are moved into that safety backup before being removed from
the manuscript. Use `creation-import` to reconcile external manuscript changes
instead of silently refreshing hashes or story state.

`author-project reconcile-manuscript` verifies the exact tracker import decision,
current inventory, confirmed scope or null empty target, and story-state sources.
It preserves an immutable manuscript reconciliation and, during an active cycle,
extends that cycle's target, change set, and work set without rewriting its
starting snapshot. Use `revise-increment` only while the previous satisfied
full-manuscript proof remains intact; otherwise use full-manuscript
`revise-draft`. Empty deletion cannot satisfy or complete a cycle. Recovery
requires an approved nonempty restore or import followed by `revise-draft`.
The command does not write manuscript and does not replace backup, restore, or
input-hash approvals. For first-time bootstrap, an active null starting scope
lets the first approved nonempty import supply initial publication evidence
without a creation commit; it still requires initial full-manuscript
`revise-draft` evaluation and completion. A rejected empty bootstrap cannot
complete before such an import or publication establishes that evidence.
Later bootstrap imports and edits preserve the null cumulative origin and form
one ordered event chain. Every reconciliation previous scope or execution input
scope follows the preceding target or output scope, every event is verified
once, and the final target equals current scope. A real creation commit supplies
an event whose scope_before matches the starting scope or null origin and whose
scope_after passes the existing batch, journal, approval, and verified-file
checks. Creation commit→import and creation commit→edit→import cannot omit that
event. Empty reconciliation is a legal intermediate state awaiting nonempty
recovery, never a completed target. Missing links, skipped empty predecessors,
and forged targets remain blockers. Every cycle-external reconciliation requires
an explicit `previous_scope`; only verified empty recovery may explicitly set it
to null, and omitting the field is a usage error before any write.

### Coverage units and chunked review

A full local coverage unit can be reused only when its source-report identity,
operation, exact paths and hashes, requested subchecks, and dependencies match.
Its original scope remains bound to the source report; the composed index and new
synthesis use the target scope. Partial, skipped, or stale coverage units and
synthesis units cannot be reused. Unchanged local units can survive unrelated
edits, but every affected volume, phase, current-scope, or whole-book synthesis
must be reevaluated for current inputs.

For large manuscripts, `author-review` reads actual manuscript chunks, then
synthesizes volume or story-phase results, and finally the book. Intent and
standards reviewers may run in parallel. Fresh-reader review proceeds in reading
order through one logical reviewer carrying only that reviewer's isolated
reader-state. Summaries and extracted story state cannot replace reading the
manuscript. Report `full` coverage only when the target scope was actually
covered.

### Finding, report, and creation artifact schemas

Finding schema v1 remains at `references/finding-schema.json` for repository
consumers and is mirrored into each independent skill's `references/` directory
for standalone use. Shared creation and revision diagnostics retain finding v2
and report v2, resolved at runtime from `.author-toolkit/references/`. Creation
operations are not added to the closed report v2 `stage` enumeration.

Creation batches, commit journals, story state, coverage units and indexes,
review jobs, and reader state use their own artifact contracts rather than
masquerading as revision reports. External changes use the closed
`references/manuscript-reconciliation-schema.json` artifact and the optional
manifest `manuscript_reconciliation` reference to its latest immutable record.
The canonical project registration schema is
`references/project-schema-v3.2.json`; setup deploys it with the other shared
contracts into the writing project. The v3.0 and v3.1 schemas remain available
for reading and upgrading existing projects.

Existing reports are not automatically rewritten. See
[Migrating to 3.2](docs/MIGRATION-3.2.md). The
[3.1 migration guide](docs/MIGRATION-3.1.md),
[3.0 migration guide](docs/MIGRATION-3.0.md), and
[2.0 migration guide](docs/MIGRATION-2.0.md) remain available as historical
documentation.

The shipped English and Chinese examples intentionally retain legacy v2
manifests and workflow fixtures for compatibility testing. Do not migrate them
in place merely to make them look current.

## Invoke an independent skill directly

Use the same installation-specific command form and replace the skill name:

| Installation | Command pattern |
| --- | --- |
| Claude Code plugin | `/author-toolkit:<skill-name>` |
| Kimi Code plugin | `/skill:author-toolkit:<skill-name>` |
| Claude Code bare skills | `/<skill-name>` |
| Kimi Code bare skills | `/skill:<skill-name>` |

For example, run `prose-mechanics`, then ask for one audit such as "Run a
frequency audit on chapter 4." Run prose audits one at a time and review the
findings before applying changes. The independent skills do not start shared
creation or revision orchestration.

## Resume, switch strategies, or request rework

Start `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or
`revise-request` in the registered project and describe whether you want to
resume, review a report, switch strategies, or rework a finding. All five use
the same manifest, tracker, Story Bible, reports, session notes, backups,
handoffs, and applicable creation state to recover context. They evaluate the
current scope, pending action, evidence, and dependencies instead of inferring
operation completion by moving or renaming files.

A staged draft may remain during read-only work or the active cycle's required
revision strategy; a parallel manuscript-changing cycle remains blocked. On
return, its dependency fingerprint and the current project state determine
whether it can be reviewed again or needs a new plan. Neither a strategy switch
nor a pending action publishes it.

Use backups to inspect or restore pre-edit manuscript content. Ask for
restoration explicitly; a resume, strategy switch, or report rerun does not
implicitly restore a backup.

## Development

The development package requires Node.js >= 22. The generic skills installer
requires Node.js >= 22.20. After installing dependencies, run the protocol tests
and validation from the repository root:

```bash
npm test
npm run validate
```

Validate a manifest or report directly with the corresponding CLI option. The
validator also provides options for scope snapshots, inventory snapshots,
creation batches, commit journals, story state, coverage artifacts, and review
jobs; use the installed CLI as the source for their exact names:

```bash
node scripts/validate.mjs --help
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --scope-snapshot /path/to/scope.json
node scripts/validate.mjs --inventory-snapshot /path/to/inventory.json
node scripts/validate.mjs --report /path/to/report.md
```

These commands cover repository-level contracts, not host-specific runtime
verification or creative quality. Host versions, completed checks, and current
limitations are tracked in [docs/VALIDATION.md](docs/VALIDATION.md).

## Attribution and license

Author Toolkit originated at
[rhavekost/author-toolkit](https://github.com/rhavekost/author-toolkit).
The original copyright notice and [MIT License](LICENSE) are preserved. The
current release repository is
[shengchen1998/author-toolkit](https://github.com/shengchen1998/author-toolkit).

Vendored third-party skills retain their original licenses. See
[ATTRIBUTION.md](ATTRIBUTION.md) for upstream sources and the local integration
adapter.
