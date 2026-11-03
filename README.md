# Author Toolkit

A reusable fiction revision workflow and six independent writing skills for
Claude Code and Kimi Code.

[Chinese quick start](README.zh-CN.md) | [2.0 migration](docs/MIGRATION-2.0.md) |
[Validation status](docs/VALIDATION.md)

## What is included

Version 2.0.0 contains 12 skills in three groups.

### User entry points

| Skill | Purpose |
| --- | --- |
| `ask-author` | Read project state and route the author to the appropriate entry point or independent skill. |
| `setup-author-toolkit` | Register an existing writing project and initialize its workflow state. |
| `revise-fiction` | Run the nine-stage revision workflow for an existing novel. |

### Shared orchestration skills

These skills support the entry points. They are not separate user workflows.

| Skill | Purpose |
| --- | --- |
| `author-project` | Read and update project registration, workflow state, and artifact paths. |
| `author-handoff` | Preserve session context and support resume and rework. |
| `author-review` | Run independent intent, craft, and fresh-reader reviews without editing the manuscript. |

### Independent writing skills

These six skills keep their existing names, triggers, and direct invocation.
They can be used without the 2.0 orchestration workflow.

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

The complete 2.0 orchestration workflow supports revision of an existing,
single-book fiction manuscript. It accepts Markdown and plain text.

Writing a new novel from scratch remains a direct `fiction-workshop` or
`story-structure` task. Narrative nonfiction remains a direct
`narrative-nonfiction` task. Multi-book projects and integrations with other
hosts are outside the supported 2.0 workflow.

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

## Revise an existing novel

Use the command that matches the installation method:

| Installation | Host | Command |
| --- | --- | --- |
| Plugin | Claude Code | `/author-toolkit:revise-fiction` |
| Plugin | Kimi Code | `/skill:author-toolkit:revise-fiction` |
| Bare skills | Claude Code | `/revise-fiction` |
| Bare skills | Kimi Code | `/skill:revise-fiction` |

For the other user entry points, replace `revise-fiction` with `ask-author` or
`setup-author-toolkit` in the same command form.

A quick run looks like this:

1. Identify the directory containing the existing novel and its Markdown or
   plain-text manuscript files.
2. Invoke `setup-author-toolkit` with that path. Answer the intake questions and
   confirm the revision scope. Registration records paths; it does not move the
   manuscript into a new layout.
3. After setup validates the manifest, invoke `revise-fiction` at the registered
   project and selected entry stage.
4. Review reports at the author gates. Resolve, defer, or dismiss findings,
   request rework, and approve revisions before continuing.

The nine stages are:

1. `intake`: Clarify scope and register the project.
2. `story-bible`: Establish the story foundation and manuscript baseline.
3. `structure`: Review macro structure.
4. `characters`: Review characters and continuity.
5. `revision-plan`: Organize findings and author decisions into a revision plan.
6. `chapter-revision`: Apply approved chapter revisions with backups.
7. `prose`: Run sentence-level review and approved fixes.
8. `ai-cleanup`: Detect or revise AI writing patterns as requested.
9. `final-review`: Verify the result and prepare the handoff.

The skill definitions contain the full gates and audit rules.

### Project files and artifacts

`.author-toolkit/project.json` registers workflow state and artifact paths in the writing project:

- `project.json` records project registration, workflow state, and artifact
  locations.
- Reports default to `reports/` and preserve diagnostic context and
  machine-readable results. A rerun creates a new report instead of rewriting a
  delivered report.
- The tracker defaults to `audit-tracker.md` and records stable finding IDs,
  statuses, author decisions, and report pointers.
- Session notes default to `sessions/` and record completed work, open decisions,
  backup paths, and the stopping point so a later session can resume or handle
  rework.
- Before an approved manuscript edit, the affected file is copied to
  `.author-toolkit/backups/`. Restoration also requires author approval.

The exact paths and state transitions are defined by the workflow skills and
project schema. Standalone skills retain their existing Story Bible, blueprint,
and audit-tracker conventions.

### Finding and report schemas

Finding schema v1 remains at `references/finding-schema.json` for existing
standalone skills and consumers. The 2.0 workflow adds finding v2 in
`references/finding-schema-v2.json`, a report envelope in
`references/report-schema-v2.json`, and a project schema in
`references/project-schema.json`.
Existing reports are not automatically rewritten. See
[Migrating to 2.0](docs/MIGRATION-2.0.md).

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
findings before applying changes. The independent skills do not start the
nine-stage orchestration workflow.

## Resume or request rework

Start `revise-fiction` again in the registered project and describe whether you
want to resume, review a report, or rework a finding. The workflow uses
`project.json`, the tracker, reports, and session notes to recover context. It
does not reconstruct state by moving or renaming existing project files.

Use backups to inspect or restore pre-edit manuscript content. Ask for
restoration explicitly; a resume or report rerun does not implicitly restore a
backup.

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
