# Author Toolkit

Two fiction revision strategies sharing one project evidence model, plus six
independent writing skills for Claude Code and Kimi Code.

[Chinese quick start](README.zh-CN.md) | [3.0 migration](docs/MIGRATION-3.0.md) |
[2.0 migration history](docs/MIGRATION-2.0.md) |
[Validation status](docs/VALIDATION.md)

## What is included

Version 3.0.0 contains 13 skills in three groups.

### User entry points

| Skill | Purpose |
| --- | --- |
| `ask-author` | Read project state and route the author to the appropriate entry point or independent skill. |
| `setup-author-toolkit` | Register an existing writing project and initialize the shared project state required by both revision entry points. |
| `revise-fiction` | Revise a whole novel through its Story Bible, macro structure, character arcs, and final whole-book review. |
| `revise-draft` | Revise the current draft through a draft baseline, local narrative diagnostics, and a review of the selected scope. |

`revise-fiction` and `revise-draft` must both run the same
`setup-author-toolkit` first. Setup does not accept a workflow name or entry
stage; registration and intake are identical for every subsequent workflow.

### Shared orchestration skills

These skills support the entry points. They are not separate user workflows.

| Skill | Purpose |
| --- | --- |
| `author-project` | Read and update project registration, neutral evidence, current scope, pending operations, and artifact paths. |
| `author-handoff` | Preserve session context and support resume, rework, and switching between revision entry points. |
| `author-review` | Run independent intent, craft, and fresh-reader reviews without editing the manuscript. |

### Independent writing skills

These six skills keep their existing names, triggers, direct invocation, and
standalone behavior. They can be used without either shared revision workflow.

| Skill | Purpose | Example request |
| --- | --- | --- |
| `fiction-workshop` | Draft or edit fiction with developmental, line-editing, character, continuity, and brainstorming perspectives. | "As developmental editor, analyze chapter 3." |
| `character-archetypes` | Identify archetype pairings and audit cliches, drift, and cast balance. | "What archetype is this character?" |
| `story-structure` | Map a new structure or audit landmark beats and signposts in an existing draft. | "Audit this manuscript's structure." |
| `narrative-nonfiction` | Develop narrative nonfiction, reader transformation, metaphors, exercises, reveals, and voice. | "Design the transformation arc for this book." |
| `prose-mechanics` | Run 19 focused sentence-level audits on stabilized drafts. | "Run an echoes audit on chapter 7." |
| `avoid-ai-writing` | Detect AI writing patterns or rewrite text to remove them. | "Detect mode: flag AI patterns in this chapter." |

`avoid-ai-writing` is vendored from
[conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing)
under MIT. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Scope and language support

The shared 3.0 revision workflows support single-book fiction projects with
Markdown or plain-text manuscripts. `revise-fiction` addresses the whole book.
`revise-draft` can work on an unfinished draft with no outline and no ending;
its diagnostics address the selected narrative scope rather than judging the
percentage of a future book or penalizing beats that do not yet exist.

Writing a new novel from scratch remains a direct `fiction-workshop` or
`story-structure` task. Narrative nonfiction remains a direct
`narrative-nonfiction` task. Multi-book projects and integrations with other
hosts are outside the supported 3.0 workflows.

English and Chinese are the core workflow languages. Where a diagnostic has
narrower language coverage, it follows its language-support rules and records
partial or skipped checks. Other languages use the documented fallback rules;
reduced rule coverage is not reported as an equivalent completed audit.

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

## Set up a project and choose a revision strategy

Use the command forms that match the installation method:

| Installation | Host | Setup | Whole-book revision | Current-draft revision |
| --- | --- | --- | --- | --- |
| Plugin | Claude Code | `/author-toolkit:setup-author-toolkit` | `/author-toolkit:revise-fiction` | `/author-toolkit:revise-draft` |
| Plugin | Kimi Code | `/skill:author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-draft` |
| Bare skills | Claude Code | `/setup-author-toolkit` | `/revise-fiction` | `/revise-draft` |
| Bare skills | Kimi Code | `/skill:setup-author-toolkit` | `/skill:revise-fiction` | `/skill:revise-draft` |

For `ask-author`, use the same command form with that skill name.

A quick run looks like this:

1. Identify the directory containing the novel or current draft and its
   Markdown or plain-text manuscript files.
2. Invoke `setup-author-toolkit` with that path. Answer the project registration
   and language questions. Registration records paths; it does not move the
   manuscript into a new layout. Do not pass a workflow name or entry stage. The
   selected revision skill establishes and confirms the initial scope afterward.
3. After setup validates the shared v3 manifest, choose `revise-fiction` for
   whole-book Story Bible, structure, and final review, or `revise-draft` for
   the current draft, local diagnostics, and current-scope review.
4. Review reports at the author gates. Resolve, defer, or dismiss findings,
   request rework, and approve revisions before manuscript changes.

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

Both entry points share the character capability. The draft path requires only
current arcs and continuity; the whole-book gate requires additional subchecks
for complete arcs and book-level continuity. A draft engagement may enter
directly at `prose` or `ai-cleanup`. If no manuscript revision is requested,
`revision-plan` and `chapter-revision` may be skipped with the reason recorded.

The skill definitions contain the full gates and audit rules.

## Shared project files and evidence

Both revision strategies use the same neutral `.author-toolkit/project.json`
(v3) and artifact paths:

- `project.json` records project registration, artifact locations, and optional
  `current_scope` and `pending_action`. It has no `workflow.name`,
  `current_stage`, or `stages` state.
- `story-bible.md` is the shared story foundation when the selected work needs
  it. Switching entry points does not create a second Story Bible.
- `audit-tracker.md` records stable finding IDs, statuses, author decisions,
  shared approvals, and report pointers.
- `reports/` preserves diagnostic context and machine-readable results. A rerun
  creates a new report instead of rewriting a delivered report.
- `sessions/` records completed work, open decisions, backup paths, and the
  stopping point so a later session can resume or handle rework.
- `backups/` preserves affected manuscript files before approved edits.
  Restoration also requires author approval.
- `handoffs/` preserves pointers to the current evidence and next action.

The manifest records the actual paths, including custom locations. There is no
`revise-draft`-specific project directory and no second set of workflow state.
Switching between `revise-fiction` and `revise-draft` reuses these artifacts and
requires no migration.

### Evidence reuse and pending operations

Evidence is reusable only when its `operation`, `scope_id`, input versions,
coverage, and dependencies match the proposed work. A new scope requires author
confirmation. When an input or dependency changes, affected evidence becomes
`stale` and the invalidation propagates through dependent operations; an old
report's valid schema alone does not make it current.

`pending_action` describes the next operation awaiting work or an author
decision. It replaces stage-specific progress state rather than maintaining one
state machine per revision entry point.

The shared tracker stores approvals. Before manuscript edits, the workflow
requires explicit author approval and a backup. It verifies the current file
hash before writing so that an edit cannot silently overwrite changes made
since the evidence or approval was recorded.

### Finding and report schemas

Finding schema v1 remains at `references/finding-schema.json` for existing
standalone skills and consumers. Both shared revision strategies use finding
v2 in `references/finding-schema-v2.json` and the report envelope in
`references/report-schema-v2.json`; their schema versions are unchanged in
3.0.0. The stage enumeration adds `draft-baseline`, `diagnostics`, and
`current-scope-review`. Project registration uses the v3 schema in
`references/project-schema.json`.

Existing reports are not automatically rewritten. See
[Migrating to 3.0](docs/MIGRATION-3.0.md). The
[2.0 migration guide](docs/MIGRATION-2.0.md) remains available as historical
documentation.

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
findings before applying changes. The independent skills do not start either
nine-stage orchestration workflow.

## Resume, switch strategies, or request rework

Start `revise-fiction` or `revise-draft` in the registered project and describe
whether you want to resume, review a report, switch the revision strategy, or
rework a finding. Both use the same manifest, tracker, Story Bible, reports,
session notes, backups, and handoffs to recover context. They evaluate the
current scope and pending operation against evidence and dependencies instead
of reconstructing stage status by moving or renaming files.

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

These commands cover repository-level checks, not host-specific runtime
verification. Host versions, completed checks, and current limitations are
tracked in [docs/VALIDATION.md](docs/VALIDATION.md).

## Attribution and license

Author Toolkit originated at
[rhavekost/author-toolkit](https://github.com/rhavekost/author-toolkit).
The original copyright notice and [MIT License](LICENSE) are preserved. The
current release repository is
[shengchen1998/author-toolkit](https://github.com/shengchen1998/author-toolkit).

Vendored third-party skills retain their original licenses. See
[ATTRIBUTION.md](ATTRIBUTION.md) for upstream sources and the local integration
adapter.
