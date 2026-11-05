# Author Toolkit

## Project overview

Author Toolkit 3.1.0 is a source-distributed collection of 16 writing skills for Claude Code and Kimi Code, plus Node.js tools for validating and migrating its project contracts. It provides incremental creation and four revision strategies over one shared evidence model:

- `write-fiction` coordinates author-reviewed creation batches, staging, story-state synchronization, imports, and milestone reviews.
- `revise-fiction` coordinates whole-book fiction revision.
- `revise-draft` coordinates revision of the available draft without requiring an outline, ending, or whole-book structure audit.
- `revise-increment` brings added or affected chapters to current-draft revision convergence while reusing valid evidence for unchanged chapters.
- `revise-request` applies an author-defined revision to existing content in a converged full current draft and restores full-manuscript current-draft revision convergence.
- Six independent skills (`fiction-workshop`, `character-archetypes`, `story-structure`, `narrative-nonfiction`, `prose-mechanics`, and `avoid-ai-writing`) also work without a shared creation or revision strategy.

The production runtime is the host coding agent interpreting `SKILL.md` files and their references. There is no web application, server, database, compiled frontend, vector store, or long-running local process. Node.js is used for contract tests, schema and artifact validation, manuscript inventory, and migration from v2 or v3.0 to v3.1.

The shared creation and revision workflows support one single-book fiction project per manifest, with Markdown or plain-text manuscripts. English and Chinese are the core workflow languages. Chinese prose uses dedicated sentence, segmentation, grammar, and catalog procedures; Chinese AI-Isms uses a local adapter catalog and never claims to prove AI authorship. Reports record actual language subchecks and partial or skipped coverage truthfully.

## Technology and configuration

- Development requires Node.js 22 or newer and npm. The generic skills installer documented in the README requires Node.js 22.20 or newer.
- The package uses native ECMAScript modules (`"type": "module"`) and Node's built-in test runner.
- `ajv` and `ajv-formats` are the only direct development dependencies. Schemas use JSON Schema draft 2020-12.
- `package.json` defines the development scripts and Node engine; `package-lock.json` is the npm lockfile.
- `kimi.plugin.json` exposes `./skills/` to Kimi Code.
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` contain Claude Code plugin metadata.
- Release metadata is not generated from one source. Inspect all four metadata files when changing versions. All four currently say `3.1.0`.
- There is no build, lint, formatter, coverage-threshold, environment-variable, or secrets configuration in this repository. There are no repository CI workflows or automated deployment scripts.

## Repository layout

| Path | Purpose |
| --- | --- |
| `skills/*/SKILL.md` | Host-executable skill instructions with YAML frontmatter. |
| `skills/*/references/` | Detailed craft rules, operation gates, creation recovery, review procedures, and audit instructions loaded by skills as needed. |
| `skills/*/assets/` | Project, agent-instruction, report, tracker, handoff, baseline, writing-plan, creation-batch, and story-state templates. |
| `scripts/validate.mjs` | CLI for schemas, manifests, on-disk project state, Markdown reports and story state, creation and coverage artifacts, review jobs, and workflow fixtures. |
| `scripts/migrate-v3.mjs` | CLI for migrating a writing project's v2 or v3.0 state to v3.1 and for idempotent v3.1 validation. |
| `scripts/lib/` | Validation and migration implementation, exported through `index.mjs`. |
| `references/` | Shared JSON Schemas, workflow reporting rules, and the vendored-skill adapter. |
| `examples/` | English and Chinese manuscript/report/tracker fixtures used by tests and default validation. |
| `tests/` | Node test files and shared fixture helpers. |
| `docs/` | Migration guides and the record of repository and host validation. |

The examples under `examples/fiction-revision-en/` and `examples/fiction-revision-zh/` intentionally use legacy v2 manifests and workflow fixtures for compatibility testing. The neutral v3.1 starting point is `skills/author-project/assets/project-template.json`. Do not convert the shipped examples merely to make them look current.

### Skill groups

The seven explicit user entry points are `ask-author`, `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`. Their frontmatter includes `disable-model-invocation: true`; routers and orchestrators show their host commands rather than invoking them through the Skill tool.

`author-project`, `author-handoff`, and `author-review` are shared orchestration capabilities. The six independent writing skills retain standalone behavior. Every skill directory name must match its frontmatter `name`; `tests/skills.test.mjs` checks the complete skill inventory and invocation modes.

### JavaScript modules

- `scripts/lib/schemas.mjs` loads the shared schemas and configures Ajv.
- `scripts/lib/manifest.mjs` dispatches v2, v3.0, and v3.1 manifest validation; `workflow.mjs` retains legacy v2 sequence invariants.
- `scripts/lib/manuscript.mjs` inventories `.md`, `.markdown`, and `.txt` files and excludes registered operational paths, including the creation root and staging.
- `scripts/lib/project-files.mjs` checks registered paths, artifacts, scope hashes, and newly added manuscript files.
- `scripts/lib/markdown.mjs` extracts and validates the single JSON report envelope and language/evidence coverage.
- `scripts/lib/artifacts.mjs` validates story state, creation batches, commit journals, coverage units and indexes, and coverage-reuse semantics.
- `scripts/lib/review.mjs` validates review-job source ranges, chunk/volume/book completion, fresh-reader sequence, and reader-state continuity.
- `scripts/lib/tracker.mjs` validates living finding and approval tables; `approval-paths.mjs` handles paths containing commas, pipes, and backticks.
- `scripts/lib/migration.mjs` performs preflight checks, preserves migration snapshots, creates the creation directory skeleton, and writes manifest/tracker changes atomically.

## Runtime architecture and state contracts

All five strategies require the same user-invoked `setup-author-toolkit`. Setup registers existing paths without imposing a manuscript layout. `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request` then execute one evidence-gated operation at a time and stop for author review at operation gates. Their exact sequences, delegation rules, and gates live in their `SKILL.md` and `references/stage-gates.md` files. At any stable operation gate, the author can switch among all five strategies over the same state without completing another strategy's full sequence.

The canonical manifest is `<project-root>/.author-toolkit/project.json`. A v3.1 manifest stores registration, `manuscript_root`, seven operational paths, and optional `current_scope` and `pending_action`. It has no `workflow.name`, `current_stage`, or `stages` state. New and migrated manifests use schema 3.1.0. The runtime still reads valid v3.0 manifests; creation work requires the confirmed additive `upgrade-v31`. Recognize v2 only for setup migration. `author-project` owns state and path operations; creative content belongs to the writing skills.

Resolve operational files through the manifest's registered `paths`, including custom backup, handoff, report, and creation locations. The shared artifacts are the Story Bible, audit tracker, reports, sessions, backups, handoffs, and creation state. New v3.1 manifests default to `.author-toolkit/backups/`, `.author-toolkit/handoffs/`, and `.author-toolkit/creation/`; existing projects may use other registered locations. Switching strategies reuses this state and does not create a second project tree or run a migration.

The default creation root contains:

- `state/current.md`, `state/chapters/`, and `state/volumes/` for living story state;
- `batches/` for immutable accepted creation batches and resumable commit journals;
- `staging/<batch-id>/` for proposed, rejected, and superseded text outside manuscript inventory.

The Story Bible records author intent; accepted manuscript text establishes observed facts; chapter, volume, and current story state are derived artifacts keyed to source hashes. Keep intent and observed facts visible when they conflict and request an author decision. Rejected staging never enters current story state or manuscript scope. Structural validation of derived state does not prove semantic extraction completeness.

The creation operations are `creation-baseline`, `writing-plan`, `chapter-creation`, `chapter-review`, `creation-commit`, `creation-import`, and `milestone-review`. The repeating creation loop is `writing-plan`, `chapter-creation`, `chapter-review`, and `creation-commit`. AI, author-written, and mixed batches share the same gates and default to one chapter per plan. Keep one active creation batch per book and one shared pending action. Creation operations remain outside report v2 `stage` and the legacy revision-only stage sequence.

Before creation, the author approves the plan and exact write batch, including paths, actions, context versions, and input hashes. After staging, one batch acceptance covers the exact manuscript content, story-state differences, and resulting ordered scope, with manuscript and scope approvals recorded separately. `creation-commit` follows acceptance without another gate. A dependency fingerprint determines whether staged content remains current; unrelated scope growth requires a refreshed publication scope but does not alone stale the staged text. `creation-import` reconciles external additions, modifications, deletions, and reordering with author confirmation.

Whole-report evidence reuse requires matching operation, `scope_id`, input versions, requested coverage and subchecks, and dependency state. Changed inputs or dependencies invalidate affected evidence; a schema-valid old report is not necessarily current. Scope membership, order, or exclusion changes require a new author-confirmed scope. Pending actions describe interrupted or awaiting work, not permission to resume a manuscript write.

Workflow reports are immutable Markdown files with human-readable coverage and exactly one report v2 JSON envelope. Reruns create new files. The author decision loop, stable finding identity, tracker statuses, stale propagation, coverage reuse, current-draft revision convergence, and approval history are defined in `skills/revise-fiction/references/state-and-findings.md`; that file is the single source for these rules. Shared revision and diagnostic work uses finding v2 and report v2. Creation batches, commit journals, story state, coverage artifacts, review jobs, and reader state use separate artifact contracts. Standalone skills retain finding v1 and do not modify shared project state unless the author explicitly incorporates their output.

Coverage units and the living coverage index live beneath the registered reports path. Reuse only full local units whose source-report identity, operation, paths and hashes, requested subchecks, and dependencies match. Keep the unit's original scope for provenance and use the requested scope for the composed index and synthesis. Reevaluate affected volume, phase, current-scope, and whole-book synthesis whenever text, membership, order, dependencies, or child coverage changes. Local summaries never extend an old whole-book synthesis into a new scope.

`revise-increment` uses creation batches to locate changes, then derives a work set from added, affected, stale, or non-reusable paths. It reuses the current-draft operations and report stages without adding manifest or schema state. Edits stay within approved work-set batches, while target syntheses and current-scope review cover the full expanded scope. Accepted review findings trigger another affected revision and review pass before current-draft revision convergence can be claimed.

`revise-request` starts from a verified converged full-manuscript scope and an author-defined revision of existing content. Its request set guides the craft work, while its work set grows with actual stale evidence and missing reusable local units. It preserves the converged pass's applicable coverage, recomposes affected target syntheses, and requires a new full-target current-scope review after manuscript changes. Request completion and current-draft revision convergence for the full target scope are separate completion states. On resume, an active request continues from session and plan records even though its own edits staled the historical base. The entry adds no manifest or schema state.

`author-review` reads actual manuscript chunks, then volume or story-phase syntheses, then a book synthesis for final review. Intent and standards may run in parallel. Fresh-reader review is sequential within one logical reviewer and carries only that reviewer's isolated reader-state. Summaries and story state cannot replace manuscript reading. Claim `full` only for actual requested-scope coverage.

## Setup, build, and test commands

Install the locked development dependencies from the repository root:

```bash
npm ci
```

There is no compilation or build output. Run the complete repository checks with:

```bash
npm test
npm run validate
```

`npm test` runs every `tests/*.test.mjs` file using `node:test`. `npm run validate` checks all schema definitions, both localized legacy examples, their reports and on-disk state, and workflow sequences.

During development, run a focused test file or test-name pattern:

```bash
node --test tests/v31.test.mjs
node --test --test-name-pattern="migration" tests/migration.test.mjs
```

Run the full test and validation commands before finishing changes to scripts, schemas, skills, templates, or fixtures.

### Test organization and conventions

- `contracts.test.mjs` covers finding v1/v2, legacy project and report contracts, paths, and Markdown envelopes.
- `v3.test.mjs` covers neutral v3.0 state, scopes, pending actions, approvals, and evidence semantics.
- `v31.test.mjs` covers v3.1 creation operations and paths, v3.0 compatibility, scope currency, and additive upgrades.
- `creation.test.mjs` covers story state, creation batches, interrupted commits, coverage-unit reuse, and coverage indexes.
- `review-job.test.mjs` covers chunk-to-volume/phase-to-book completion and resumable fresh-reader sequencing.
- `scale.test.mjs` checks structural handling of a million-Chinese-character inventory without importing creation state as manuscript; it is not creative-quality evidence.
- `workflow.test.mjs` covers legacy v2 sequencing, stale work, resume, and overrides.
- `project-files.test.mjs` covers on-disk paths, trackers, and project-root resolution.
- `migration.test.mjs` exercises the real migration CLI against copied projects, including direct v2-to-v3.1 migration, idempotence, and protected-file preservation.
- `cli.test.mjs` exercises core validator exit statuses and diagnostics; `cli-artifacts.test.mjs` covers repeated new-artifact options and their exit statuses.
- `skills.test.mjs` checks skill metadata and cross-file orchestration contracts.
- `chinese-prose.test.mjs` checks all 19 Chinese audit procedures and their engine-coverage boundaries.
- `chinese-ai-writing.test.mjs` checks the local Chinese AI-writing catalog, language routing, provenance limits, and vendored-skill isolation.
- `chinese-writing-skills.test.mjs` checks Chinese line-editing, review, nonfiction, and length-configuration pointers.
- `approval-paths.test.mjs` covers special-character parsing in approval paths.

Tests use `node:assert/strict`, shared readers in `tests/helpers.mjs`, and copied fixtures for writes. Filesystem and CLI tests create temporary directories beneath `.test-output/` and register cleanup with `t.after`. `.test-output/` and `tests/.tmp/` are ignored; keep temporary projects and generated output out of commits. There is no configured coverage threshold.

### Validate individual artifacts

```bash
node scripts/validate.mjs --help
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --report /path/to/report.md
node scripts/validate.mjs --workflow-fixture /path/to/fixture.json
```

Use the installed `--help` output for the creation-batch, commit-journal, story-state, coverage, and review-job option names. Options may be repeated or combined where documented. For a v3 manifest with `current_scope`, manifest validation also checks registered files, the tracker, and current manuscript hashes. Validation failures exit nonzero; argument or usage errors exit with status 2.

Migrate an actual writing project only when migration is intended:

```bash
node /path/to/author-toolkit/scripts/migrate-v3.mjs --project-root /path/to/writing-project
```

For development, run migration against a disposable copy as the tests do. Migration converts v2 or v3.0 to v3.1 and creates `.author-toolkit/migrations/<stamp>-v2-v3/` or `.author-toolkit/migrations/<stamp>-v3_0-v3_1/`. It preserves manuscript, report, creative evidence, and backup contents. Repeating it against valid v3.1 state is idempotent and creates no snapshot.

## Code and documentation style

- JavaScript uses two-space indentation, double quotes, semicolons, named ESM imports/exports, and `node:` prefixes for built-ins. Match the surrounding use of `node:fs/promises`, `node:path`, and URL-based repository path resolution.
- JSON uses two-space indentation and a trailing newline. Keep schema `additionalProperties` and legacy compatibility behavior deliberate; validators are closed contracts, not permissive examples.
- Skill documentation and code are primarily English. Keep user-facing workflow changes synchronized across the relevant skill references, `README.md`, `README.zh-CN.md`, schemas, examples, and tests.
- Preserve exact relative Markdown links from each skill's location. Avoid introducing reference cycles; `references/workflow-reporting.md` points to `state-and-findings.md`, not the reverse.
- `skills/avoid-ai-writing/` is vendored upstream content with its own license and recorded commit in `ATTRIBUTION.md`. Keep Author Toolkit integration and the Chinese candidate catalog in `references/avoid-ai-writing-adapter.md` and `references/avoid-ai-writing-zh-CN.md`; the test suite checks that local integration text is not added to the upstream skill. Chinese standalone AI-Isms routes through `prose-mechanics`, leaving the upstream standalone skill English-specific.
- Workflow report headings, tracker columns, and Markdown status values remain English machine contracts for every project language. Chinese explanations, finding text, quotations, and manuscript paths are supported as content. Do not add localized aliases for these contract labels or statuses; keep parsers, templates, and tests aligned on the English forms.
- No automated formatter or linter is configured, so follow the existing file's conventions rather than introducing a new style tool incidentally.

## Safety and data integrity

- Stored project paths must be portable project-relative paths with forward slashes. Reject absolute paths, home expansion, URI schemes, backslashes, and `..` segments. Resolve registered paths against the selected project root. Apply the same rules to `paths.creation` and exclude the creation root, including staging, from manuscript inventory.
- Before a manuscript edit, require explicit current author approval for the exact operation, scope, paths, actions, and input versions. Recompute SHA-256 hashes immediately before writing. A mismatch stops the write.
- Before creation publication, require every create target to be absent and back up every existing modify, delete, or reorder target. Record expected absence with a null input hash rather than inventing an original backup.
- Write the creation commit journal before touching manuscript content. Publish each file through a verified temporary sibling and atomic rename, and update the journal after every transition. A journal coordinates files; it does not make a multi-file batch one filesystem transaction. Interrupted publication stops pending an explicit author decision.
- Restores require separate explicit approval naming the backup or creation commit and exact files, plus a safety backup of current content. Move files created by the restored batch into the safety backup before removing them from the manuscript. Edit or creation approval is not restore approval.
- Use `creation-import` to reconcile author-added, modified, deleted, or reordered manuscript files. Do not silently refresh scope hashes, derived story state, or stale evidence. Report changed input and reconcile it with the author.
- Preserve historical reports, findings, approvals, creation batches, commit journals, backups, and migration snapshots. Record later decisions in living state, the tracker, and new reports rather than rewriting history.
- Handoffs contain paths, IDs, approved decision summaries, and next actions, not manuscript excerpts, Story Bible content, draft baselines, reader state, or full findings.
- Git is optional for writing projects and is not a substitute for toolkit backups or commit journals. Setup and migration do not alter Git configuration or `.gitignore`.
- The repository has no authentication or secret-management flow. Host credentials and plugin permissions are external to these scripts.

## Distribution and deployment

The repository is installed directly as source; there is no release bundle to build. Installation methods are documented in `README.md`:

- Claude Code uses the `shengchen1998/author-toolkit` marketplace and the `author-toolkit@author-toolkit` plugin.
- Kimi Code uses `/plugins install https://github.com/shengchen1998/author-toolkit`, followed by `/reload` or a new session.
- Generic project or user installation uses `npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli`, with optional `-g`.

Updates are manual through the host or `npx skills check` and `npx skills update`. No CI/CD or publishing workflow is present.

`npm test` and `npm run validate` verify repository contracts only; they do not prove skill discovery, installation, a complete creative run in Claude Code or Kimi Code, or creative quality on a million-character manuscript. `docs/VALIDATION.md` distinguishes current 3.1 repository checks from historical 3.0 and 2.0 evidence and unverified host paths. Update that record when performing real host validation, and do not present fixture reports or scale fixtures as model-run evidence.
