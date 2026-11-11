# Author Toolkit

Incremental fiction creation and four fiction revision strategies sharing one
project evidence model, plus six independent writing skills for Codex, Claude
Code, and Kimi Code.

[Chinese quick start](README.zh-CN.md) | [Controlled terminology](references/terminology.md) |
[Validation status](docs/VALIDATION.md)

## What is included

Version 3.1.0 contains 16 skills in three groups.

### User entry points

| Skill | Purpose |
| --- | --- |
| `ask-author` | Read project state and route the author to the appropriate user entry or independent skill. |
| `setup-author-toolkit` | Register an existing writing project and initialize the shared project state required by creation and revision. |
| `write-fiction` | Create or continue a novel through reviewed creation batches, staged drafts, synchronized story state, and milestone reviews. |
| `revise-fiction` | Revise a whole novel through its Story Bible, macro structure, character arcs, and final review. |
| `revise-draft` | Revise the current manuscript through a draft baseline, local narrative diagnostics, and current-scope review of the target scope. |
| `revise-increment` | Revise added or affected chapters after incremental creation while applying the evidence-reuse rules to unchanged chapters and completing a full-target current-scope review. |
| `revise-request` | Apply an author-defined revision to existing content from a full-manuscript base scope that has reached current-draft revision convergence, with request-only review by default and optional full-scope review. |

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` must all run the same
`setup-author-toolkit` first. Setup does not accept a workflow name or operation
argument; registration and intake are identical for every subsequent strategy.

### Shared orchestration skills

These skills support the user entries. They are not separate user workflows.

| Skill | Purpose |
| --- | --- |
| `author-project` | Read and update project registration, neutral evidence, current scope, pending actions, artifact paths, finding ID allocation and batch upsert, backups, and restores. |
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

The shared 3.1 creation and revision workflows support single-book fiction
projects with Markdown or plain-text manuscripts. `write-fiction` can start
without a complete outline or ending and can also continue an existing manuscript.
`revise-fiction` addresses the whole book. `revise-draft` can work on an
unfinished manuscript; its diagnostics address the target scope rather than
judging the percentage of a future book or penalizing beats that do not yet
exist. `revise-increment` applies the same current-draft operation gates after
scope growth, reusing only reusable evidence for unchanged text and reviewing the
full target scope. `revise-request` starts from a full-manuscript base scope that
has reached current-draft revision convergence and applies an author-defined
revision to existing content. Its default request review covers only changed and
affected passages; an explicit full-scope review is required to reverify
current-draft revision convergence for the full-manuscript target scope.

Narrative nonfiction remains a direct `narrative-nonfiction` task. Multi-book
projects and integrations with hosts other than Codex, Claude Code, and Kimi
Code are outside the supported 3.1 workflows.

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

### Codex

Use the generic installation below. Codex discovers project skills from
`.agents/skills/` and user skills from `~/.agents/skills/`. Invoke a skill with
`$` followed by its exact unqualified registered name, such as
`$setup-author-toolkit`.

### Generic project or user installation

The generic installer requires Node.js >= 22.20. Install into the current
project for all three supported hosts:

```bash
npx skills@latest add shengchen1998/author-toolkit -a codex -a claude-code -a kimi-code-cli
```

Add `-g` to install at user level instead:

```bash
npx skills@latest add shengchen1998/author-toolkit -a codex -a claude-code -a kimi-code-cli -g
```

The setup skill includes self-contained installation, preflight, manifest-projection, pending-action, validation, status, project-digest, finding-state, manuscript-write, and character-range CLIs under
`setup-author-toolkit/scripts/`. Shared workflows resolve that installed skill
directory directly; no repository checkout or writing-project `npm install` is
required.

Run `node <setup-skill-root>/scripts/doctor.mjs` for a bounded installation
summary and only the failed paths. It verifies the skill's regular payload files,
including internal CLI modules, against `assets/payload-manifest.json`. Add
`--project-root <root>` to verify the writing project's `AGENTS.md` and relative
`CLAUDE.md -> AGENTS.md` link; project-state validation and host command visibility
remain separate checks. Its text and JSON output distinguish installed-payload
failures from repairable project-entry failures, with an explicit exit reason.

Run `node <setup-skill-root>/scripts/preflight.mjs --project-root <root>` to
combine the payload and entry-file check with project validation and ordinary
status. It shares their library implementation and prints a bounded summary.
Unverified approvals are grouped by operation with counts and first/last approval
IDs; the endpoints do not imply contiguous ID ranges.
The current scope is selected by default. Add `--require-execution` with an
explicit `--scope-id` only for an execution gate; add `--digest` only when the
navigation cache should be refreshed after successful read-only checks.
`node <setup-skill-root>/scripts/check.mjs` is the stable local alias with the
same arguments and exit statuses. It reuses preflight rather than duplicating
doctor, validation, or strict execution logic.
When validation fails, add `--diagnose` without `--digest` for one bounded
read-only result containing the projection marked `recorded_unverified` and
backup-index conflict fields. Its text displays up to 12 scope paths with their
recorded hashes; the JSON projection retains every scope file. Recorded hashes
are not current-file verification; the command still exits 1 and never repairs
state. Do not repeat `check-index` for conflicts already explained by the diagnosis.

`read.mjs` bounds failed validation to failed checks, 12 errors per check, and
operation-grouped unverified-approval summaries. Add `--details` for complete
failed checks and approval details. For a backup-index inconsistency, run
`writes.mjs check-index --manifest <manifest> --explain` for read-only backup
index inspection; it reports exact record locations and backup/approval identity
differences without migrating history or selecting a repair value.

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
| Bare skills | Codex | `$setup-author-toolkit` | `$write-fiction` | `$revise-fiction` | `$revise-draft` | `$revise-increment` | `$revise-request` |
| Plugin | Claude Code | `/author-toolkit:setup-author-toolkit` | `/author-toolkit:write-fiction` | `/author-toolkit:revise-fiction` | `/author-toolkit:revise-draft` | `/author-toolkit:revise-increment` | `/author-toolkit:revise-request` |
| Plugin | Kimi Code | `/skill:author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:write-fiction` | `/skill:author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-draft` | `/skill:author-toolkit:revise-increment` | `/skill:author-toolkit:revise-request` |
| Bare skills | Claude Code | `/setup-author-toolkit` | `/write-fiction` | `/revise-fiction` | `/revise-draft` | `/revise-increment` | `/revise-request` |
| Bare skills | Kimi Code | `/skill:setup-author-toolkit` | `/skill:write-fiction` | `/skill:revise-fiction` | `/skill:revise-draft` | `/skill:revise-increment` | `/skill:revise-request` |

For `ask-author`, use the same command form with that skill name.

The five strategies are user entries and are not required in the model-facing
Skill tool list. Setup reports ready only after your confirmation of host
command visibility: all five exact strategy commands appear in the current
host's command palette or autocomplete (the `$` autocomplete in Codex). On a host without skill commands,
confirm all five exact registered names in its skill picker instead. Without
that confirmation, setup reports host command visibility as unverified.
Displayed command strings and plugin or skill `enabled` metadata do not
establish it.

A quick run looks like this:

1. Identify the writing project directory. It may contain an existing Markdown
   or plain-text manuscript, or it may be the destination for a new novel.
2. Invoke `setup-author-toolkit` with that path. Answer the project registration
   and language questions. Registration records paths; it does not move the
   manuscript into a new layout. Shared contracts remain in the setup skill's
   installed `assets/references/` payload and are read directly from that
   location; setup does not deploy them into the writing project. On every
   setup, it overwrites the project-root `AGENTS.md` with the installed template
   and replaces a regular `CLAUDE.md` or existing symlink with a relative
   `CLAUDE.md -> AGENTS.md` symlink. The template keeps only language,
   explicit-entry routing, and manuscript-safety invariants. Detailed strategy
   routing lives in `ask-author`; operational details remain in the installed
   skills and references. For an existing project, this repair occurs once the
   manifest-schema check accepts v3.1 even if later project-state validation
   fails; setup then reports the blocker without repairing manuscript or history.
   Custom content in these two files is not preserved. Do not pass
   a workflow name or operation argument. After a toolkit update, existing v3.1
   projects use the updated installed contracts without another deployment.
   Initial `author-project` read, validation, and status calls report missing
   installed contracts or scripts as an incomplete toolkit installation rather
   than relying on project-local reference copies. Existing projects use the
   bounded initialize, validation, and status reference instead of loading the
   backup, restore, and creation-commit procedures. Setup summarizes the
   installation payload, project entry files, manuscript scope, and execution
   evidence separately.
3. After setup validates the shared manifest, choose `write-fiction` to create
   or continue a novel, `revise-fiction` for whole-book revision, `revise-draft`
   for the available manuscript and current-scope review, `revise-increment` to
   bring added or affected chapters to current-draft revision convergence, or
   `revise-request` to revise existing content from a full-manuscript base scope
   that has reached that state. Request review covers changed and affected passages
   by default; full-scope review is a separate explicit choice. The selected
   strategy establishes and confirms the initial target scope when one is needed.
4. Review evidence and proposals at the author gates. The agent presents one
   active decision at a time so you can discuss evidence and alternatives before
   deciding. Before presenting a concrete revision, the agent completes a
   context-fit check against the whole local scene and necessary history: references
   and continuity, character and object familiarity, repeated wording and actions,
   voice and collocation, request intent and setup/reveal dependencies, and the exact
   replacement in context. This is editorial judgment, not lint or permission to
   expand the edit or review scope. Planning, manuscript writes, creation acceptance,
   and restores have distinct approvals.

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
convergence for the publication scope; continue with `revise-increment` when
that is the goal.

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
   reached that state, or to `revise-increment` when creation or import has
   grown the scope.
2. Confirm the requested outcome, constraints, request set, full-manuscript
   target scope, and initial work set. Choose the default request review with
   exact changed and affected passages plus necessary local context, or explicitly
   choose a full-target current-scope review.
3. Apply only approved batches with backups. Expand the work set by actual text
   and dependency impact, rerun affected operations, and compose new operation
   coverage and full-target syntheses for the target scope while reusing matching
   unchanged full local coverage units.
4. Preserve every applicable subcheck required by the base scope's current-draft
   revision convergence evidence and add newly requested checks. A local request
   does not silently reduce the coverage required for current-draft revision
   convergence.
5. After a logical round of approved changes, run `review_mode=request` over only
   the declared changed and affected passages with all three perspectives. Do not
   silently expand them to full chapters or the full manuscript. If full-scope
   review was explicitly selected, instead run a full-target current-scope review
   with a sequential fresh reader.
6. Generate `reports/review_brief.md` from resolved and dismissed tracker findings.
   Reconcile repeated observations after independent review: preserve their finding
   IDs and decisions unless the relevant passage, factual basis, dependency, or
   underlying issue materially changed. Reviewers, including the fresh reader, do
   not receive this brief.
7. Report request completion separately from current-draft revision convergence.
   Request review never satisfies the full-target current-scope review requirement; after only
   request review, state that full-manuscript current-draft revision convergence has not been reverified.

The skill definitions contain the full gates and audit rules.

## Shared project files and evidence

All five strategies use the same neutral `.author-toolkit/project.json` and
artifact paths. Only schema 3.1.0 is supported; other manifest versions are
rejected and are not converted automatically.

`author-project read` uses `read.mjs` for a bounded validated projection with
resolved paths, complete current-scope hashes, and pending-artifact counts. Its
failure output is bounded by default; `--details` returns complete failed checks.
Read
`PROJECT_STATE.md` first when present; use `validate` for registered files
and current hashes, `status` for current scope, pending action, recorded blockers,
and execution receipts, and `status --digest` for navigation counts, latest
pointers, and next action. `--scope-id` filters unverified approvals and a blocked
pending action, but stale findings remain project-wide because tracker finding
rows have no scope ID. Add `--require-execution` to make unverified approvals in
the selected scope exit 1; this checks only execution evidence, not the other
current-draft revision convergence conditions. Without the flag, unverified approvals leave the command
successful. Status does not evaluate operation-specific evidence
completeness, evidence reuse, or current-draft revision convergence; the active
strategy retains those judgments at operation gates. It runs strict status whenever
it determines or claims current-draft revision convergence and before entering a
strategy that requires that state for a previous or base scope. A recorded statement of that state or a
current-scope-review pending action does not replace that check. A failed strict
check records a `blocked` pending action; it does not alter approvals or manufacture
execution receipts.

The installed `preflight.mjs --project-root <root>` combines one payload and
entry-file inspection with the same validation and ordinary-status rules. It
does not write project state unless `--digest` is explicitly supplied.
After a validation failure, `--diagnose` supplies the bounded
recorded-unverified projection, scope paths and hashes, and index differences
without repeating the other inspection commands or printing the complete manifest.
Use `read.mjs --project-root <root>` for its bounded manifest projection and
`set-pending.mjs --help` for validated pending-action updates.

- `project.json` records project registration, artifact locations, and optional
  `current_scope` and `pending_action`. It has no `workflow.name`,
  `current_stage`, or `stages` state.
- New pending actions retain at most eight inline artifacts. Longer complete
  lists live in `.author-toolkit/pending-artifacts.json`, linked by
  `pending_action.artifact_index`; `set-pending.mjs` validates and writes the
  pair. Existing long inline lists without an index remain valid and are never
  migrated by setup or inspection.
- Shared runtime contracts remain in the installed setup skill's
  `assets/references/` payload and are read directly from that location. They
  have no manifest field and are not copied into the writing project.
- `story-bible.md` records author intent. Accepted manuscript text establishes
  observed story facts; neither source silently overwrites the other when they
  conflict.
- `audit-tracker.md` records stable finding IDs, statuses, author decisions,
  shared approvals, and report pointers. `author-project next-finding-id` supplies
  unused consecutive ID blocks from tracker and report history. `record-findings`
  validates and atomically upserts complete report batches, preserving existing
  author decisions and timestamps rather than manually appending Markdown rows.
- `PROJECT_STATE.md` is a generated navigation cache. Invoke `author-project`
  with `status --digest` to regenerate it after shared-state writes and at
  resume. Generation requires the same complete project validation as preflight,
  including current manuscript hashes, the tracker, and backup-index execution
  evidence. Its UTC `Generated at` value and `Validation at generation: passed`
  line are a generation-time snapshot, not current health, an execution gate, or
  a current-draft revision convergence claim; rerun preflight before reusing the
  cache. It points to the current scope and hashes, pending action, finding
  counts, current-scope execution evidence, active plan, latest session and
  report, and next action. Any unverified approvals in the current scope make
  the cache state that the strict execution gate would fail. The next action
  remains recorded rather than being rerouted, and is labeled as unevaluated by
  strategy gates; zero unverified approvals alone does not establish
  current-draft revision convergence. The manifest,
  tracker, and current evidence remain authoritative; the cache grants no
  approval and does not replace evidence reading. Routine navigation uses its
  pointers, targeted artifact reads, or aggregate counts rather than emitting
  complete file listings of the registered session or backup directories. It
  reads current manuscript files and the backup index for validation without
  reproducing their contents, and does not read full reports. Record `- Active plan: <project-relative-path>` and
  `- Next action: <concise action>` in the latest session so the cache can
  locate them. A legacy tracker `Next action` remains a fallback. Latest-file
  selection prefers UTC filename timestamps and uses modification time for
  undated files. The report scan excludes the disposable `review_brief.md`
  decision summary. Its Read next section points to `author-project status` for
  recorded blockers and execution evidence, and to `validate` for current hashes
  and missing paths; status does not use the cache as a data source.
- `reports/` preserves diagnostic context and machine-readable results. A rerun
  creates a new report instead of rewriting a delivered report. Reusable
  coverage units and the living coverage index also belong under this
  registered path. `review_brief.md` is a disposable summary of resolved and
  dismissed tracker findings used for decision reuse, not reviewer input or an
  authoritative decision record. Validate it against the tracker with
  `node <setup-skill-root>/scripts/validate.mjs --review-brief <path> --tracker <path>`.
- `sessions/` records completed work, open decisions, backup paths, and the
  stopping point so a later session can resume or handle rework.
- `backups/` preserves affected manuscript files before approved edits. Its index
  also stores post-write execution receipts for edit approvals and completed
  restoration records for restore approvals. `author-project status` reports
  scoped unverified approvals without reading manuscript content or comparing
  historical outputs with later text. A backup alone does not prove execution;
  `record-backup` refuses new edit batches while another approval is unverified,
  including create-only batches. `reconcile-executions` adds only receipts backed
  by preserved post-write evidence; unsupported approvals remain unverified.
  `check-index --explain` provides read-only backup index inspection for identity
  mismatches without migrating historical records or adding execution receipts.
  Restoration also requires author approval and retains its separate safety path.
- `handoffs/` preserves pointers to the current evidence and next action.
- `paths.creation` registers creation state and defaults to
  `.author-toolkit/creation/`. It contains `state/current.md`,
  `state/chapters/`, `state/volumes/`, `batches/`, and `staging/`.

Chapter and volume story state is derived from accepted manuscript text and
versioned source artifacts. It supports continuation; it does not replace the
Story Bible's intent or the manuscript's facts. Rejected staging text does not
enter story state or manuscript scope.

The manifest records the actual paths, including custom locations. Switching
among `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and
`revise-request` at a stable operation gate reuses these artifacts and requires
no second project tree or shared-state reset. It does not automatically resume a pending
write.

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
decision. It replaces stage-specific progress state and is not permission to
publish or resume a manuscript write.

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
manuscript. Request review instead reads only its declared changed and affected
line ranges in sequence and cannot establish a full-target reader chain. Report
`full` coverage only for the units required by the selected review mode, never as
a claim that unread target-scope text was covered.

### Finding, report, and creation artifact schemas

Finding schema v1 remains at `references/finding-schema.json` for repository
consumers and is mirrored into each independent skill's `references/` directory
for standalone use. Shared creation and revision diagnostics retain finding v2
and report v2, resolved at runtime from the installed setup skill's
`assets/references/` payload. Creation operations are not added to the closed
report v2 `stage` enumeration.

Creation batches, commit journals, story state, coverage units and indexes,
review jobs, and reader state use their own artifact contracts rather than
masquerading as revision reports. The canonical project registration schema is
`references/project-schema-v3.1.json`; it is mirrored with the other shared
contracts in the installed setup skill. Existing reports are not automatically
rewritten.

The shipped English and Chinese examples use v3.1 manifests and retain
handwritten reports and resume sessions as validation fixtures.

## Invoke an independent skill directly

Use the same installation-specific command form and replace the skill name:

| Installation | Command pattern |
| --- | --- |
| Codex | `$<skill-name>` |
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

A staged draft may remain while another strategy is used. On return, its
dependency fingerprint and the current project state determine whether it can be
reviewed again or needs a new plan. Neither a strategy switch nor a pending
action publishes it.

Use backups to inspect or restore pre-edit manuscript content. Ask for
restoration explicitly; a resume, strategy switch, or report rerun does not
implicitly restore a backup.

## Development

The development package requires Node.js >= 22. The generic skills installer
requires Node.js >= 22.20. After changing validation
implementation, regenerate the checked-in setup runtime mirror:

```bash
npm run sync:setup-runtime
```

After installing dependencies, run the protocol tests and validation from the
repository root. The deployment test checks that the mirror is current and runs
the installed payload, validation, and project-state CLIs without external runtime packages:

```bash
npm test
npm run validate
```

Validate a manifest or report directly with the corresponding CLI option. The
validator also provides options for creation batches, commit journals, story
state, coverage artifacts, and review jobs; use the installed CLI as the source
for their exact names:

```bash
node scripts/validate.mjs --help
node scripts/doctor.mjs --project-root /path/to/writing-project
node scripts/preflight.mjs --project-root /path/to/writing-project
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --report /path/to/report.md
node scripts/status.mjs --manifest /path/to/.author-toolkit/project.json --scope-id scope-001
node scripts/writes.mjs check-index --manifest /path/to/.author-toolkit/project.json --explain
node scripts/range.mjs --project-root /path/to/writing-project "manuscript/1.md:1:56-71"
```

`range.mjs` resolves an author-supplied inline character range. Positions are
1-based and inclusive, and characters count Unicode code points.

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
