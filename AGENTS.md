# Author Toolkit

## Project overview

Author Toolkit 3.1.0 is a source-distributed collection of 16 writing skills for Claude Code and Kimi Code, plus Node.js tools for validating and migrating writing-project contracts. It provides incremental fiction creation and four revision strategies over one shared evidence model.

The production runtime is the host coding agent interpreting `skills/*/SKILL.md` files and their references. There is no web application, server, database, compiled frontend, vector store, or long-running local process. Node.js is used for contract tests, JSON Schema and artifact validation, manuscript inventory, and migration from v2 or v3.0 to v3.1.

The seven explicit user entries are:

| Skill | Purpose |
| --- | --- |
| `ask-author` | Inspect shared state and route the author to an appropriate entry or independent skill. |
| `setup-author-toolkit` | Register one writing project, deploy shared contracts, and validate or migrate its state. |
| `write-fiction` | Create or continue a novel through author-reviewed batches, staging, story-state synchronization, imports, and milestone reviews. |
| `revise-fiction` | Coordinate whole-book revision through Story Bible, structure, character, prose, AI-cleanup, and final-review operations. |
| `revise-draft` | Revise the available manuscript without requiring an outline, ending, or whole-book structure audit. |
| `revise-increment` | Bring added or affected chapters to current-draft revision convergence while reusing eligible evidence for unchanged chapters and reviewing the full target scope. |
| `revise-request` | Apply an author-defined revision of existing content from a full-manuscript base scope that has reached current-draft revision convergence, then restore that state for the full-manuscript target scope. |

These entries have `disable-model-invocation: true` in their frontmatter. Routers and orchestrators display their exact host commands instead of invoking them through the Skill tool. `author-project`, `author-handoff`, and `author-review` are shared orchestration capabilities, not separate author-selected strategies.

The six independent skills are `fiction-workshop`, `character-archetypes`, `story-structure`, `narrative-nonfiction`, `prose-mechanics`, and `avoid-ai-writing`. They work without setup or a shared strategy and retain their standalone output contracts. Every skill directory name must match its frontmatter `name`; `tests/skills.test.mjs` checks the complete inventory and invocation modes.

Shared workflows support one single-book fiction project per manifest with Markdown or plain-text manuscripts. English and Chinese are the core workflow languages. Narrative nonfiction uses the independent `narrative-nonfiction` skill; multi-book manifests and other hosts are outside the supported 3.1 workflows. Chinese prose has dedicated sentence, segmentation, grammar, and catalog procedures. Chinese AI-associated findings describe textual patterns and never establish AI authorship. Reports must record actual language subchecks and partial or skipped coverage truthfully.

## Technology and configuration

- Development requires Node.js 22 or newer and npm. The generic skills installer documented in `README.md` requires Node.js 22.20 or newer.
- The package uses native ECMAScript modules (`"type": "module"`) and Node's built-in `node:test` runner.
- `ajv` and `ajv-formats` are the only direct development dependencies. Schemas use JSON Schema draft 2020-12; Ajv runs with `allErrors` and `strict` enabled.
- `package.json` defines the development scripts and Node engine. `package-lock.json` is the npm lockfile.
- `kimi.plugin.json` exposes `./skills/` to Kimi Code. `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` contain Claude Code plugin metadata.
- Release metadata is not generated from one source. When changing versions, inspect `package.json`, `kimi.plugin.json`, and both `.claude-plugin` JSON files; all four currently say `3.1.0`.
- There is no build, lint, formatter, coverage-threshold, environment-variable, or secrets configuration. There are no repository CI workflows or automated deployment scripts.

## Repository layout and module boundaries

| Path | Purpose |
| --- | --- |
| `skills/*/SKILL.md` | Host-executable skill instructions with YAML frontmatter. |
| `skills/*/references/` | Craft rules, operation gates, creation recovery, review procedures, and audit instructions loaded as needed. |
| `skills/*/assets/` | Project, agent-instruction, report, tracker, handoff, baseline, writing-plan, creation-batch, and story-state templates. |
| `scripts/validate.mjs` | CLI for schemas, manifests, on-disk project state, Markdown reports and story state, scope, inventory and cycle artifacts, convergence status and gate queries, creation and coverage artifacts, review jobs, and legacy workflow fixtures. |
| `scripts/author-project.mjs` | Executable facade for cycle start, optimistic transition, operation checks, convergence status, and convergence gate operations; it does not invoke strategies. |
| `scripts/migrate-v3.mjs` | CLI for v2 or v3.0 to v3.1 migration and idempotent v3.1 validation. |
| `scripts/lib/` | Validation, scope recording, cycle lifecycle, verified state writes, and migration implementation, exported through `index.mjs`. |
| `references/` | Canonical shared JSON Schemas, controlled terminology, reporting rules, and AI-writing integration documents. |
| `examples/` | English and Chinese manuscript, report, tracker, and workflow fixtures used by tests and default validation. |
| `tests/` | Node test files and shared fixture helpers. |
| `docs/` | Migration guides and the record of repository and host validation. |

The main JavaScript boundaries are:

- `schemas.mjs` loads the shared schemas and configures Ajv; `manifest.mjs` dispatches v2, v3.0, v3.1, and v3.2 validation, while `workflow.mjs` retains legacy v2 sequence invariants.
- `manuscript.mjs` inventories `.md`, `.markdown`, and `.txt` files and excludes registered operational paths, including creation, staging, and the convergence state root. `project-files.mjs` checks registered files, artifacts, scope hashes, and newly added manuscript files.
- `scope.mjs` records v3.2 scopes, computes deterministic scope and inventory fingerprints, preserves immutable snapshots, and validates full-manuscript membership, order, exclusions, and current disk hashes.
- `cycles.mjs` starts and transitions the authoritative current-draft convergence cycle, checks parallel manuscript changes, and reports read-only convergence status and gate results. `state-io.mjs` provides verified temporary-sibling writes, atomic replacement, no-clobber publication, and owner-verified cross-process lock directories for living state.
- `markdown.mjs` extracts and validates the single JSON report envelope and language/evidence coverage. `tracker.mjs` validates living finding and approval tables; `approval-paths.mjs` parses paths containing commas, pipes, and backticks.
- `artifacts.mjs` validates story state, creation batches, commit journals, coverage units and indexes, and coverage-reuse semantics.
- `review.mjs` validates review-job source ranges, chunk/volume/book completion, fresh-reader sequencing, and reader-state continuity.
- `migration.mjs` performs preflight checks, preserves snapshots, creates the creation directory skeleton, and writes manifest and tracker changes atomically.

The examples under `examples/fiction-revision-en/` and `examples/fiction-revision-zh/` intentionally retain legacy v2 manifests and workflow fixtures for compatibility testing. Do not migrate them in place. The neutral v3.2 starting point is `skills/author-project/assets/project-template.json`.

## Runtime architecture and shared state

All five creation and revision strategies require the same user-invoked `setup-author-toolkit`. Setup registers existing paths without imposing a manuscript layout and deploys every shared contract from `skills/setup-author-toolkit/assets/references/` to `<project-root>/.author-toolkit/references/`. It creates missing files and preserves matching files. A mismatched existing file produces `reference-version-conflict` and blocks shared work; replacement requires separate exact-file author approval and preservation beneath `<paths.backups>/reference-updates/<UTC-stamp>/`.

For a new writing project, setup also copies `skills/setup-author-toolkit/assets/AGENTS.md` to the project root only when no `AGENTS.md` exists. That template routes work inside a writing project; this repository-root `AGENTS.md` documents toolkit development. Setup preserves existing agent instructions.

Every shared `read`, `validate`, and `status` operation through `author-project` checks all packaged references before using project state. Missing files or hash mismatches route the author through setup; a valid v3 manifest alone does not prove reference deployment. Each strategy then runs one evidence-gated operation at a time and stops at its author gate. Exact sequences, delegation, and gates live in the strategies' `SKILL.md` and `references/stage-gates.md` files. At a stable operation gate, an active current-draft convergence cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. Strategy switches wait for the author's exact command and never invoke another user entry automatically.

The canonical manifest is `<project-root>/.author-toolkit/project.json`. A v3.1 manifest stores registration, `manuscript_root`, seven operational paths, and optional `current_scope` and `pending_action`. V3.2 adds the convergence state root, scope identity, and current-draft convergence cycle. The manifest has no `workflow.name`, `current_stage`, `stages`, or shared-reference path state. The neutral template uses schema 3.2.0. The runtime still reads valid v3.0 and v3.1 manifests; creation on v3.0 requires the separately confirmed additive `upgrade-v31`. Recognize v2 only for setup migration. `author-project` owns state, paths, validation, cycle transitions, backups, commits, and restores; creative content belongs to the writing skills.

Resolve operational files through the manifest's registered `paths`, including custom report, backup, handoff, creation, and convergence state root locations. Shared runtime contracts always resolve from the fixed `.author-toolkit/references/` directory. Shared artifacts include the Story Bible, audit tracker, reports, sessions, backups, handoffs, creation state, scope snapshots, inventory snapshots, and cycle records. New manifests default backups, handoffs, creation, and the convergence state root to locations beneath `.author-toolkit/`; existing projects may retain other registered locations. The convergence state root contains `active-cycle.json`, `cycles/<cycle-id>.json`, `scopes/<scope-id>-<scope-fingerprint>.json`, and `inventories/<inventory-fingerprint>.json`. Active state uses a cross-process `active-cycle.lock/` directory, an in-lock expected-revision check, and verified atomic replacement; lock timeouts and leftover lock directories block dependent writes for explicit recovery. Completed cycles, scopes, and inventories are immutable.

A current-draft convergence cycle records initiating and current strategies, bootstrap, starting and target scope references, requested-pass and related-artifact references, recovery position, change set, work set, evaluation references, and completion. Pending action remains operation-scoped and does not own the cycle. `scripts/author-project.mjs` and the public exports in `scripts/lib/index.mjs` provide the shared start, transition, operation-check, convergence status, and convergence gate seam for hosts and tests. A valid full-manuscript scope alone does not manufacture a satisfied convergence evaluation; unavailable proof produces `indeterminate` and fails the gate without blocking read-only inspection.

The default creation root contains:

- `state/current.md`, `state/chapters/`, and `state/volumes/` for living story state keyed to source hashes;
- `batches/` for immutable accepted creation batches and resumable commit journals;
- `staging/<batch-id>/` for proposed, rejected, and superseded text outside manuscript inventory.

The Story Bible records author intent; accepted manuscript text establishes observed facts. Keep both visible when they conflict. Rejected staging never enters story state or manuscript scope. Structural validation of derived story state does not prove semantic extraction completeness.

The creation operations are `creation-baseline`, `writing-plan`, `chapter-creation`, `chapter-review`, `creation-commit`, `creation-import`, and `milestone-review`. The repeating loop is `writing-plan`, `chapter-creation`, `chapter-review`, and `creation-commit`. AI, author-written, and mixed batches share the same gates and default to one chapter per plan. Keep one active creation batch per book and one shared pending action. Creation operations remain outside report v2 `stage` and the legacy revision-only stage sequence. Load `skills/write-fiction/references/creation-state.md` before changing creation artifacts, fingerprints, commits, restores, imports, or recovery behavior.

Before creation, the author approves the plan and exact write batch, including paths, actions, context versions, and input hashes. After staging, creation acceptance covers the exact manuscript content, story-state differences, and resulting ordered publication scope, with manuscript and scope approvals recorded separately. `creation-commit` follows acceptance without another gate. A dependency fingerprint determines whether staged content remains current; unrelated scope growth requires a refreshed publication scope but does not alone stale staged text. `creation-import` reconciles external additions, modifications, deletions, and reordering with author confirmation.

### Evidence, reports, and review

Read `references/terminology.md` before changing shared workflow wording or contracts, introducing a shared term, or writing report and tracker statuses. Use its approved English terms, fixed Chinese equivalents, operation identifiers, and exact contract values. Register new shared terms there in the same change; `tests/terminology.test.mjs` checks terminology usage and coverage.

Whole-report evidence reuse requires matching operation, `scope_id`, input versions, requested coverage and subchecks, and dependency state. Changed inputs or dependencies make affected evidence stale; a schema-valid old report is not necessarily current evidence. Scope membership, order, or exclusion changes require a new author-confirmed scope. `pending_action` describes interrupted or awaiting work, not permission to resume a manuscript write.

Workflow reports are immutable Markdown files with human-readable coverage and exactly one report v2 JSON envelope. Reruns create new files. Shared revision and diagnostic work uses finding v2 and report v2. Creation batches, commit journals, story state, coverage artifacts, review jobs, and reader state use separate artifact contracts. Standalone skills retain finding v1 and leave shared state unchanged unless the author explicitly incorporates their output.

The author decision loop, stable finding identity, tracker statuses, stale propagation, evidence reuse, current-draft revision convergence, and approval history are defined in `skills/revise-fiction/references/state-and-findings.md`; that file is the single source for these rules. Read it before writing a shared report or changing finding or approval status. `references/workflow-reporting.md` points to that file, not the reverse.

Coverage units and the living coverage index live beneath the registered reports path. Reuse only full local coverage units whose source-report identity, operation, paths and hashes, requested subchecks, and dependencies match. Keep the unit's original scope for provenance and use the target scope for the composed index and synthesis. Reevaluate affected volume, phase, current-scope, and whole-book syntheses whenever text, membership, order, dependencies, or child coverage changes. Local summaries never extend an old synthesis into a new scope.

`author-review` reads actual manuscript chunks, then volume or story-phase syntheses, then a book synthesis for final review. Intent and standards may run in parallel. Fresh-reader review is sequential within one logical reviewer and carries only that reviewer's isolated reader state. Summaries and story state cannot replace manuscript reading. Claim `full` only for actual target-scope coverage.

## Setup, build, and test commands

Install locked development dependencies from the repository root:

```bash
npm ci
```

There is no compilation or build output. Run the complete repository checks with:

```bash
npm test
npm run validate
```

`npm test` runs every `tests/*.test.mjs` file using `node:test`. `npm run validate` checks all schema definitions, both localized legacy examples, their reports and on-disk state, and workflow fixtures. Run both commands before finishing changes to scripts, schemas, skills, templates, or fixtures.

During development, run a focused test file or test-name pattern:

```bash
node --test tests/v31.test.mjs
node --test --test-name-pattern="migration" tests/migration.test.mjs
```

Validate individual artifacts with the installed CLI:

```bash
node scripts/validate.mjs --help
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --scope-snapshot /path/to/scope.json
node scripts/validate.mjs --inventory-snapshot /path/to/inventory.json
node scripts/validate.mjs --convergence-status /path/to/.author-toolkit/project.json
node scripts/validate.mjs --convergence-gate /path/to/.author-toolkit/project.json
node scripts/validate.mjs --report /path/to/report.md
node scripts/validate.mjs --workflow-fixture /path/to/fixture.json
node scripts/author-project.mjs --help
```

The help output is the source for scope-snapshot, inventory-snapshot, cycle-artifact, convergence-status, convergence-gate, creation-batch, commit-journal, story-state, coverage, review-job, and reader-state option names. Options may be repeated or combined where documented. Manifest validation also checks registered files and the tracker; for v3 with `current_scope`, it checks current manuscript hashes. V3.2 also checks full-manuscript evidence and reports scope identity. Convergence status is read-only and exits successfully for a valid query with any outcome; convergence gate succeeds only for current `satisfied` evidence. Validation failures exit nonzero, and argument or usage errors exit with status 2.

Migrate an actual writing project only when migration is intended:

```bash
node /path/to/author-toolkit/scripts/migrate-v3.mjs --project-root /path/to/writing-project
```

For development, run migration against a disposable copy. Migration converts v2 or v3.0 directly to v3.1 and creates `.author-toolkit/migrations/<stamp>-v2-v3/` or `.author-toolkit/migrations/<stamp>-v3_0-v3_1/`. It preserves manuscripts, reports, creative evidence, and backups. Repeating it against valid v3.1 state is idempotent and creates no snapshot. See `docs/MIGRATION-3.1.md` for conversion details and compatibility limits.

## Testing strategy and conventions

Tests use `node:assert/strict`, shared readers in `tests/helpers.mjs`, and copied fixtures for writes. Filesystem and CLI tests create temporary directories beneath `.test-output/` and register cleanup with `t.after`. `.test-output/` and `tests/.tmp/` are ignored; keep temporary projects and generated output out of commits. There is no configured coverage threshold.

The suite divides into these contract areas:

- Finding, report, manifest, path, tracker, and Markdown contracts, including v2 compatibility, v3.0/v3.1 scopes, v3.2 scope fingerprints and immutable snapshots, approvals, evidence semantics, creation operations, and additive upgrades.
- Creation state, interrupted commits, coverage reuse, review jobs, fresh-reader ordering, on-disk files, scope currency, full-manuscript validation, migration, and validator CLI behavior.
- Current-draft convergence cycle bootstrap, optimistic resume, pending-action boundaries, historical scope references, parallel-change blocking, independent-process transition serialization and lock timeouts, read-only inspection, and truthful `indeterminate` gate results through public project operations and disposable projects.
- Skill metadata, cross-file orchestration, setup and standalone deployment mirrors, controlled terminology, and special-character approval paths.
- Chinese prose, AI-writing, line-editing, review, nonfiction, and length-configuration instructions. These are static language-support contracts, not model-run accuracy evidence.
- `scale.test.mjs` inventories a synthetic million-Chinese-character manuscript and verifies creation-state exclusion and new-file detection. It is not creative-quality evidence.

`npm test` and `npm run validate` verify repository contracts only. They do not prove host skill discovery, installation, a complete creative run in Claude Code or Kimi Code, or creative quality. `docs/VALIDATION.md` separates current 3.1 checks and limited host evidence from historical 3.0 and 2.0 records and unverified paths. Update that record when performing real host validation, and never present fixture reports or scale fixtures as model-run evidence.

## Code and documentation style

- JavaScript uses two-space indentation, double quotes, semicolons, named ESM imports/exports, and `node:` prefixes for built-ins. Match surrounding use of `node:fs/promises`, `node:path`, and URL-based repository path resolution.
- JSON uses two-space indentation and a trailing newline. Keep schema `additionalProperties` and legacy compatibility behavior deliberate; validators are closed contracts, not permissive examples.
- Skill documentation and code are primarily English. Keep user-facing workflow changes synchronized across relevant skill references, `README.md`, `README.zh-CN.md`, schemas, examples, and tests.
- Workflow report headings, tracker columns, and Markdown status values remain English machine contracts for every project language. Chinese explanations, finding text, quotations, and manuscript paths are supported as content. Keep parsers, templates, and tests aligned on the English forms rather than adding localized aliases.
- Preserve exact relative Markdown links from each skill's location. Installed skills must not depend on the repository-root `references/` directory.
- `skills/avoid-ai-writing/` is vendored upstream content with its own license and recorded commit in `ATTRIBUTION.md`. Keep local integration and the Chinese candidate catalog in `references/avoid-ai-writing-adapter.md` and `references/avoid-ai-writing-zh-CN.md`; tests prevent local integration text from entering the upstream skill. Standalone Chinese AI-Isms routes through `prose-mechanics`, while the upstream standalone skill remains English-specific.
- No automated formatter or linter is configured, so follow the existing file's conventions instead of introducing a style tool incidentally.

## Safety and data integrity

- Stored project paths must be portable project-relative paths with forward slashes. Reject absolute paths, home expansion, URI schemes, backslashes, and `..` segments. Resolve registered paths against the selected project root. Apply the same rules to `paths.creation` and exclude the creation root, including staging, from manuscript inventory.
- Before a manuscript edit, require explicit current author approval for the exact operation, scope, paths, actions, and input versions. Back up every existing affected file, recompute SHA-256 hashes immediately before writing, and stop on any mismatch.
- Before creation publication, require every create target to be absent and back up every existing modify, delete, or reorder target. Record expected absence with a null input hash rather than inventing an original backup.
- Write the creation commit journal before touching manuscript content. Publish each file through a verified temporary sibling and atomic rename, updating the journal after every transition. The journal coordinates files; it does not make a multi-file batch one filesystem transaction. Interrupted publication stops pending an explicit author decision.
- Restores require separate explicit approval naming the backup or creation commit and exact files, plus a safety backup of current content. Move files created by the restored batch into the safety backup before removing them from the manuscript. Edit or creation approval is not restore approval.
- Use `creation-import` to reconcile author-added, modified, deleted, or reordered manuscript files. Report changed input and reconcile it with the author instead of silently refreshing scope hashes, story state, or stale evidence.
- Preserve historical reports, findings, approvals, creation batches, commit journals, backups, and migration snapshots. Record later decisions in living state, the tracker, and new reports rather than rewriting history.
- Handoffs contain paths, IDs, approved decision summaries, and next actions, not manuscript excerpts, Story Bible content, draft baselines, reader-state content, or full findings.
- Git is optional for writing projects and is not a substitute for toolkit backups or commit journals. Setup and migration do not alter Git configuration or `.gitignore`.
- The repository has no authentication or secret-management flow. Host credentials and plugin permissions are external to these scripts.

## Distribution and deployment

The repository is installed directly as source; there is no release bundle to build. Installation methods are documented in `README.md`:

- Claude Code uses the `shengchen1998/author-toolkit` marketplace and the `author-toolkit@author-toolkit` plugin.
- Kimi Code uses `/plugins install https://github.com/shengchen1998/author-toolkit`, followed by `/reload` or a new session.
- Generic project or user installation uses `npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli`, with optional `-g`.

Updates are manual through the host or `npx skills check` and `npx skills update`. No CI/CD or publishing workflow is present.

The generic installer deploys each skill directory, including the setup skill's shared-reference payload and each independent skill's local contracts. The repository-root `references/` directory is the canonical development source, not a runtime dependency of installed skills. Keep it byte-identical to `skills/setup-author-toolkit/assets/references/`; keep standalone finding schemas and the `prose-mechanics` AI-writing adapter mirrors synchronized as well. Setup deploys the shared payload into each writing project. `tests/deployment.test.mjs` checks these mirrors, repository-root reference independence, project-local reference coverage, and safe replacement rules.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `shengchen1998/author-toolkit` using `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.
