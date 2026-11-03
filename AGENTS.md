# Author Toolkit

## Project overview

Author Toolkit 3.0.0 is a source-distributed collection of 13 writing skills for Claude Code and Kimi Code, plus Node.js tools for validating and migrating its project contracts. It provides two revision strategies over one shared evidence model:

- `revise-fiction` coordinates whole-book fiction revision.
- `revise-draft` coordinates revision of the available draft without requiring an outline, ending, or whole-book structure audit.
- Six independent skills (`fiction-workshop`, `character-archetypes`, `story-structure`, `narrative-nonfiction`, `prose-mechanics`, and `avoid-ai-writing`) also work without either revision strategy.

The production runtime is the host coding agent interpreting `SKILL.md` files and their references. There is no web application, server, database, compiled frontend, or long-running local process. Node.js is used for contract tests, schema and artifact validation, manuscript inventory, and v2-to-v3 migration.

The shared revision workflows support one single-book fiction project per manifest, with Markdown or plain-text manuscripts. English and Chinese are the core workflow languages; individual diagnostics document narrower coverage and must report partial or skipped checks truthfully.

## Technology and configuration

- Development requires Node.js 22 or newer and npm. The generic skills installer documented in the README requires Node.js 22.20 or newer.
- The package uses native ECMAScript modules (`"type": "module"`) and Node's built-in test runner.
- `ajv` and `ajv-formats` are the only direct development dependencies. Schemas use JSON Schema draft 2020-12.
- `package.json` defines the development scripts and Node engine; `package-lock.json` is the npm lockfile.
- `kimi.plugin.json` exposes `./skills/` to Kimi Code.
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` contain Claude Code plugin metadata.
- Release metadata is not generated from one source. Inspect all four metadata files when changing versions. Currently the marketplace plugin entry says `2.0.0`, while `package.json`, `kimi.plugin.json`, and `.claude-plugin/plugin.json` say `3.0.0`.
- There is no build, lint, formatter, coverage, environment-variable, or secrets configuration in this repository. There are no repository CI workflows or automated deployment scripts.

## Repository layout

| Path | Purpose |
| --- | --- |
| `skills/*/SKILL.md` | Host-executable skill instructions with YAML frontmatter. |
| `skills/*/references/` | Detailed craft rules, operation gates, and audit procedures loaded by skills as needed. |
| `skills/*/assets/` | Project, report, tracker, handoff, baseline, and planning templates. |
| `scripts/validate.mjs` | CLI for schemas, manifests, on-disk project state, Markdown reports, and workflow fixtures. |
| `scripts/migrate-v3.mjs` | CLI for migrating a writing project's v2 manifest and tracker to v3. |
| `scripts/lib/` | Validation and migration implementation, exported through `index.mjs`. |
| `references/` | Shared JSON Schemas, workflow reporting rules, and the vendored-skill adapter. |
| `examples/` | English and Chinese manuscript/report/tracker fixtures used by tests and default validation. |
| `tests/` | Node test files and shared fixture helpers. |
| `docs/` | Migration guides and the record of repository and host validation. |

The examples under `examples/fiction-revision-en/` and `examples/fiction-revision-zh/` intentionally use legacy v2 manifests and workflow fixtures for compatibility testing. The neutral v3 starting point is `skills/author-project/assets/project-template.json`. Do not convert the shipped examples merely to make them look current.

### Skill groups

The four explicit user entry points are `ask-author`, `setup-author-toolkit`, `revise-fiction`, and `revise-draft`. Their frontmatter includes `disable-model-invocation: true`; routers and orchestrators show their host commands rather than invoking them through the Skill tool.

`author-project`, `author-handoff`, and `author-review` are shared orchestration capabilities. The six independent writing skills retain standalone behavior. Every skill directory name must match its frontmatter `name`; `tests/skills.test.mjs` checks the complete skill inventory and invocation modes.

### JavaScript modules

- `scripts/lib/schemas.mjs` loads the shared schemas and configures Ajv.
- `scripts/lib/manifest.mjs` dispatches v2 and v3 manifest validation; `workflow.mjs` retains legacy v2 sequence invariants.
- `scripts/lib/manuscript.mjs` inventories `.md`, `.markdown`, and `.txt` files and excludes registered operational paths.
- `scripts/lib/project-files.mjs` checks registered paths, artifacts, scope hashes, and newly added manuscript files.
- `scripts/lib/markdown.mjs` extracts and validates the single JSON report envelope and language/evidence coverage.
- `scripts/lib/tracker.mjs` validates living finding and approval tables; `approval-paths.mjs` handles paths containing commas, pipes, and backticks.
- `scripts/lib/migration.mjs` performs preflight checks, preserves a migration snapshot, and writes manifest/tracker changes atomically.

## Runtime architecture and state contracts

Both revision strategies require the same user-invoked `setup-author-toolkit`. Setup registers existing paths without imposing a manuscript layout. `revise-fiction` and `revise-draft` then execute one evidence-gated operation at a time and stop for author review at operation gates. Their exact sequences, delegation rules, and gates live in their `SKILL.md` and `references/stage-gates.md` files.

The canonical manifest is `<project-root>/.author-toolkit/project.json`. A v3 manifest stores registration, `manuscript_root`, six operational paths, and optional `current_scope` and `pending_action`. It has no `workflow.name`, `current_stage`, or `stages` state. `author-project` owns state and path operations; creative content belongs to the writing skills.

Resolve operational files through the manifest's registered `paths`, including custom backup and handoff locations. The shared artifacts are the Story Bible, audit tracker, reports, sessions, backups, and handoffs. New v3 manifests default to `.author-toolkit/backups/` and `.author-toolkit/handoffs/`; existing and legacy projects may use other registered locations. Switching revision strategies reuses this state and does not create a second project tree or run a migration.

Evidence reuse requires matching operation, `scope_id`, input versions, requested coverage and subchecks, and dependency state. Changed inputs or dependencies invalidate affected evidence; a schema-valid old report is not necessarily current. Scope membership, order, or exclusion changes require a new author-confirmed scope. Pending actions describe interrupted or awaiting work, not permission to resume a manuscript write.

Workflow reports are immutable Markdown files with human-readable coverage and exactly one report v2 JSON envelope. Reruns create new files. The author decision loop, stable finding identity, tracker statuses, stale propagation, and approval history are defined in `skills/revise-fiction/references/state-and-findings.md`; that file is the single source for these rules. Shared revision work uses finding v2 and report v2. Standalone skills retain finding v1 and do not modify shared project state unless the author explicitly incorporates their output.

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
node --test tests/v3.test.mjs
node --test --test-name-pattern="migration" tests/migration.test.mjs
```

Run the full test and validation commands before finishing changes to scripts, schemas, skills, templates, or fixtures.

### Test organization and conventions

- `contracts.test.mjs` covers finding v1/v2, legacy project and report contracts, paths, and Markdown envelopes.
- `v3.test.mjs` covers neutral v3 state, scopes, pending actions, approvals, evidence semantics, and templates.
- `workflow.test.mjs` covers legacy v2 sequencing, stale work, resume, and overrides.
- `project-files.test.mjs` covers on-disk paths, trackers, and project-root resolution.
- `migration.test.mjs` exercises the real migration CLI against copied projects, including idempotence and protected-file preservation.
- `cli.test.mjs` exercises validator exit statuses and diagnostics.
- `skills.test.mjs` checks skill metadata and cross-file orchestration contracts.
- `approval-paths.test.mjs` covers special-character parsing in approval paths.

Tests use `node:assert/strict`, shared readers in `tests/helpers.mjs`, and copied fixtures for writes. Filesystem and CLI tests create temporary directories beneath `.test-output/` and register cleanup with `t.after`. `.test-output/` and `tests/.tmp/` are ignored; keep temporary projects and generated output out of commits. There is no configured coverage threshold.

### Validate individual artifacts

```bash
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --report /path/to/report.md
node scripts/validate.mjs --workflow-fixture /path/to/fixture.json
```

These options may be repeated or combined. For a v3 manifest with `current_scope`, manifest validation also checks registered files, the tracker, and current manuscript hashes. Validation failures exit nonzero; argument or usage errors exit with status 2.

Migrate an actual writing project only when migration is intended:

```bash
node /path/to/author-toolkit/scripts/migrate-v3.mjs --project-root /path/to/writing-project
```

For development, run migration against a disposable copy as the tests do. Migration modifies the target project's manifest and tracker and creates `.author-toolkit/migrations/<stamp>-v2-v3/`; it preserves manuscript, report, and backup contents. Repeating it against valid v3 state is idempotent.

## Code and documentation style

- JavaScript uses two-space indentation, double quotes, semicolons, named ESM imports/exports, and `node:` prefixes for built-ins. Match the surrounding use of `node:fs/promises`, `node:path`, and URL-based repository path resolution.
- JSON uses two-space indentation and a trailing newline. Keep schema `additionalProperties` and legacy compatibility behavior deliberate; validators are closed contracts, not permissive examples.
- Skill documentation and code are primarily English. Keep user-facing workflow changes synchronized across the relevant skill references, `README.md`, `README.zh-CN.md`, schemas, examples, and tests.
- Preserve exact relative Markdown links from each skill's location. Avoid introducing reference cycles; `references/workflow-reporting.md` points to `state-and-findings.md`, not the reverse.
- `skills/avoid-ai-writing/` is vendored upstream content with its own license and recorded commit in `ATTRIBUTION.md`. Keep Author Toolkit integration in `references/avoid-ai-writing-adapter.md`; the test suite checks that local integration text is not added to the upstream skill.
- No automated formatter or linter is configured, so follow the existing file's conventions rather than introducing a new style tool incidentally.

## Safety and data integrity

- Stored project paths must be portable project-relative paths with forward slashes. Reject absolute paths, home expansion, URI schemes, backslashes, and `..` segments. Resolve registered paths against the selected project root.
- Before a manuscript edit, require an explicit current author approval for the exact operation, scope, paths, and input versions; back up every affected file; and recompute SHA-256 hashes immediately before writing. A mismatch stops the write.
- Restores require separate explicit approval naming the backup and files, plus a safety backup of current content. Edit approval is not restore approval.
- Preserve historical reports, findings, approvals, backups, and migration snapshots. Record later decisions in the living tracker and new reports rather than rewriting history.
- Do not silently refresh scope hashes or repair stale evidence. Report changed input and reconcile it with the author.
- Handoffs contain paths, IDs, approved decision summaries, and next actions, not manuscript excerpts, Story Bible content, draft baselines, or full findings.
- Git is optional for writing projects and is not a substitute for toolkit backups. Setup and migration do not alter Git configuration or `.gitignore`.
- The repository has no authentication or secret-management flow. Host credentials and plugin permissions are external to these scripts.

## Distribution and deployment

The repository is installed directly as source; there is no release bundle to build. Installation methods are documented in `README.md`:

- Claude Code uses the `shengchen1998/author-toolkit` marketplace and the `author-toolkit@author-toolkit` plugin.
- Kimi Code uses `/plugins install https://github.com/shengchen1998/author-toolkit`, followed by `/reload` or a new session.
- Generic project or user installation uses `npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli`, with optional `-g`.

Updates are manual through the host or `npx skills check` and `npx skills update`. No CI/CD or publishing workflow is present.

`npm test` and `npm run validate` verify repository contracts only; they do not prove skill discovery, installation, or a complete creative run in Claude Code or Kimi Code. `docs/VALIDATION.md` distinguishes current 3.0 repository checks from historical 2.0 host evidence and unverified host paths. Update that record when performing real host validation, and do not present fixture reports as model-run evidence.
