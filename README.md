# Author Toolkit

Incremental fiction creation and four fiction revision strategies sharing one
project evidence model, plus six independent writing skills for Claude Code and
Kimi Code.

[Chinese quick start](README.zh-CN.md) | [3.1 migration](docs/MIGRATION-3.1.md) |
[3.0 migration history](docs/MIGRATION-3.0.md) |
[2.0 migration history](docs/MIGRATION-2.0.md) |
[Validation status](docs/VALIDATION.md)

## What is included

Version 3.1.0 contains 16 skills in three groups.

### User entry points

| Skill | Purpose |
| --- | --- |
| `ask-author` | Read project state and route the author to the appropriate entry point or independent skill. |
| `setup-author-toolkit` | Register an existing writing project and initialize the shared project state required by creation and revision. |
| `write-fiction` | Create or continue a novel through reviewed writing batches, staged drafts, synchronized story state, and milestone reviews. |
| `revise-fiction` | Revise a whole novel through its Story Bible, macro structure, character arcs, and final whole-book review. |
| `revise-draft` | Revise the current draft through a draft baseline, local narrative diagnostics, and a review of the selected scope. |
| `revise-increment` | Revise added or affected chapters after incremental creation while reusing valid unchanged-chapter evidence and completing a full target-scope review. |
| `revise-request` | Apply any author-defined revision to existing content in a converged full current draft and restore full-manuscript current-draft convergence. |

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` must all run the same
`setup-author-toolkit` first. Setup does not accept a workflow name or entry
stage; registration and intake are identical for every subsequent strategy.

### Shared orchestration skills

These skills support the entry points. They are not separate user workflows.

| Skill | Purpose |
| --- | --- |
| `author-project` | Read and update project registration, neutral evidence, current scope, pending operations, artifact paths, backups, and restores. |
| `author-handoff` | Preserve session context and support resume, rework, and switching between creation and revision entry points. |
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
without a complete outline or ending and can also continue an existing draft.
`revise-fiction` addresses the whole book. `revise-draft` can work on an
unfinished draft; its diagnostics address the selected narrative scope rather
than judging the percentage of a future book or penalizing beats that do not yet
exist. `revise-increment` applies the same current-draft standard after scope
growth, reusing only valid unchanged evidence and reviewing the full target.
`revise-request` starts after full current-draft convergence, applies an
author-defined revision to existing content, and restores that convergence.

Narrative nonfiction remains a direct `narrative-nonfiction` task. Multi-book
projects and integrations with other hosts are outside the supported 3.1
workflows.

English and Chinese are the core workflow languages. Chinese prose audits use
`skills/prose-mechanics/references/chinese-rules.md`, with Chinese sentence
boundaries, character-based measurement, declared segmentation, grammar rules,
and local word and phrase catalogs. Full Chinese coverage means completion of
the requested Chinese subchecks; it never means that an English metric or an
English-only engine was treated as equivalent. Chinese AI-associated findings
describe textual patterns and do not establish AI authorship.

Workflow reports and living trackers retain English headings, columns, and
status values as their machine-readable Markdown contract. Chinese explanations,
finding text, quotations, and manuscript paths remain supported as content.
JSON report fields and machine enums retain their versioned contracts. Other
languages use the documented fallback rules, and reduced rule coverage is
recorded as partial or skipped.

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
   manuscript into a new layout. For a new project, setup also installs the
   project-level `AGENTS.md` template when no such file exists, preserving any
   existing agent instructions. Do not pass a workflow name or entry stage.
3. After setup validates the shared manifest, choose `write-fiction` to create
   or continue a novel, `revise-fiction` for whole-book revision, `revise-draft`
   for the available draft and current-scope review, `revise-increment` to
   converge added or affected chapters, or `revise-request` to revise existing
   content after full current-draft convergence. The selected strategy
   establishes and confirms the initial scope when one is needed.
4. Review evidence and proposals at the author gates. The agent presents one
   active decision at a time so you can discuss evidence and alternatives before
   deciding. Planning, manuscript writes, batch acceptance, and restores have
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
   obtain acceptance or rejection of the complete batch.
5. `creation-commit`: Publish the accepted batch, update story state and scope,
   and preserve recovery records.
6. `creation-import`: Reconcile author-added, modified, deleted, or reordered
   manuscript files created outside the creation loop.
7. `milestone-review`: Summarize an author-selected volume or story phase and
   run requested local checks without calling it a whole-book final review.

The repeating loop is `writing-plan` -> `chapter-creation` -> `chapter-review`
-> `creation-commit`. AI-written, author-written, and mixed batches use the same
gates. Keep only one active creation batch per book.

Before writing, approve both the chapter plan and the exact write batch,
including paths, actions, and input versions. After staging, one acceptance
decision covers the exact manuscript content, proposed story-state differences,
and resulting ordered scope; manuscript and scope approvals are recorded
separately. Acceptance allows `creation-commit` to proceed without another
author gate. Publication alone does not make the expanded scope
revision-converged; continue with `revise-increment` when that is the goal.

### `revise-fiction`: whole-book revision

The nine stages are:

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

The mirrored nine stages are:

1. `intake`: Clarify the current scope and use the same registered project.
2. `draft-baseline`: Establish the available draft, its input versions, and the
   selected scope without requiring a complete manuscript, outline, or ending.
3. `diagnostics`: Review local narrative problems in the available text. Do not
   score completion of an imagined whole book or flag missing future beats.
4. `characters`: Review current character arcs and continuity in the selected
   scope.
5. `revision-plan`: Organize findings and author decisions when revision is
   requested.
6. `chapter-revision`: Apply approved revisions to the selected draft scope
   with backups.
7. `prose`: Run sentence-level review and approved fixes.
8. `ai-cleanup`: Detect or revise AI writing patterns as requested.
9. `current-scope-review`: Review the selected scope with three independent
   perspectives. Mark whole-book checks that do not apply as `skipped` with
   their scope rationale.

All four revision entry points share the character capability. The draft,
incremental, and request-driven paths require current arcs and continuity; the
whole-book gate requires additional subchecks for complete arcs and book-level
continuity. A draft engagement may enter directly at `prose` or `ai-cleanup`. If
no manuscript revision is requested, `revision-plan` and `chapter-revision` may
be skipped with the reason recorded. A direct or limited pass is not by itself a
claim of full current-draft convergence.

### `revise-increment`: revision after incremental creation

Use this entry when a previous scope is current-draft-converged and creation or
import adds or affects chapters. For example, five converged chapters plus a new
sixth chapter require new evidence for chapter 6 and any affected earlier text,
not an assumption that creation review completed revision.

The incremental pass uses the same nine current-draft operations and shared
state:

1. Confirm the previous scope, full target scope, change set, and work set.
2. Update the full-target baseline and run diagnostics, character checks, prose,
   and AI cleanup on the work set. Reuse unchanged full local units only when
   their operation, source report, paths and hashes, subchecks, and dependencies
   match. Missing reusable units add the affected old paths to the work set.
3. Plan and apply only approved work-set edits with backups, then compose new
   target-scope coverage and syntheses.
4. Run current-scope review over the full target with all three perspectives.
   The fresh reader reads the full target sequentially; limiting edits does not
   limit review reading.
5. Process review findings and repeat affected operations and review after
   accepted edits. Claim convergence only when the shared evidence, finding,
   approval, coverage, and review conditions are all current.

### `revise-request`: request-driven revision after convergence

Use this entry when the full current manuscript is converged from the
`revise-draft` perspective and the author has any type of revision request for
existing content. Requests may concern plot, scenes, characters, continuity,
POV, prose, or AI cleanup. Requested macro-structure work can additionally use
`story-structure` Audit without adopting the `revise-fiction` final-review gate.

1. Verify the full-manuscript base scope and its current convergence evidence.
   Return to `revise-draft` when that base is unfinished, or to
   `revise-increment` when creation or import has grown the scope.
2. Confirm the requested outcome, constraints, request set, full target, and
   initial work set. The request set determines what to change; the full target
   determines what must be proven current again.
3. Apply only approved batches with backups. Expand the work set by actual text
   and dependency impact, rerun affected operations, and compose new full-target
   coverage and syntheses while reusing matching unchanged local units.
4. Preserve the converged pass's applicable subchecks and add newly requested
   checks. A local request does not silently reduce convergence coverage.
5. After any manuscript change, review the full target again with all three
   perspectives and a sequential fresh reader. Process findings and rework, then
   report request completion and full-manuscript convergence separately.

The skill definitions contain the full gates and audit rules.

## Shared project files and evidence

All five strategies use the same neutral `.author-toolkit/project.json` and
artifact paths. New projects and migrated projects use schema 3.1.0; v3.0
manifests remain readable and can receive the additive 3.1 upgrade.

- `project.json` records project registration, artifact locations, and optional
  `current_scope` and `pending_action`. It has no `workflow.name`,
  `current_stage`, or `stages` state.
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

Chapter and volume story state is derived from accepted manuscript text and
versioned source artifacts. It supports continuation; it does not replace the
Story Bible's intent or the manuscript's facts. Rejected staging text does not
enter story state or manuscript scope.

The manifest records the actual paths, including custom locations. Switching
among `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and
`revise-request` at a stable operation gate reuses these artifacts and requires
no second project tree or migration. It does not automatically resume a pending
write.

### Evidence reuse and pending operations

Evidence is reusable only when its `operation`, `scope_id`, input versions,
coverage, subchecks, and dependencies match the proposed work. A new scope
requires author confirmation. When an input or dependency changes, affected
evidence becomes `stale`; an old report's valid schema alone does not make it
current.

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
synthesis use the requested scope. Partial, skipped, stale, and synthesis units
are not reusable local proof. Unchanged local units can survive unrelated edits,
but every affected volume, phase, current-scope, or whole-book synthesis must be
reevaluated for current inputs.

For large manuscripts, `author-review` reads actual manuscript chunks, then
synthesizes volume or story-phase results, and finally the book. Intent and
standards reviewers may run in parallel. Fresh-reader review proceeds in reading
order through one logical reviewer carrying only that reviewer's isolated
reader-state. Summaries and extracted story state cannot replace reading the
manuscript. Report `full` coverage only when the requested scope was actually
covered.

### Finding, report, and creation artifact schemas

Finding schema v1 remains at `references/finding-schema.json` for existing
standalone skills and consumers. Shared creation and revision diagnostics retain
finding v2 and report v2. Creation operations are not added to the closed report
v2 `stage` enumeration.

Creation batches, commit journals, story state, coverage units and indexes,
review jobs, and reader state use their own artifact contracts rather than
masquerading as revision reports. Project registration uses
`references/project-schema-v3.1.json`; the v3.0 schema remains available for
reading and upgrading existing projects.

Existing reports are not automatically rewritten. See
[Migrating to 3.1](docs/MIGRATION-3.1.md). The
[3.0 migration guide](docs/MIGRATION-3.0.md) and
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
current scope, pending operation, evidence, and dependencies instead of
reconstructing stage status by moving or renaming files.

A staged draft may remain while another strategy is used. On return, its
dependency fingerprint and the current project state determine whether it can be
reviewed again or needs a new plan. Neither a strategy switch nor a pending
action publishes it.

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
validator also provides options for creation batches, commit journals, story
state, coverage artifacts, and review jobs; use the installed CLI as the source
for their exact names:

```bash
node scripts/validate.mjs --help
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
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
