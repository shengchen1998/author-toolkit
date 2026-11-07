# Author Toolkit

## Project overview

Author Toolkit 4.0.0 is a source-distributed collection of 16 writing skills for Claude Code and Kimi Code, plus Node.js tools for validating and operating one current writing-project contract. It provides incremental fiction creation and four revision strategies over one shared evidence model.

The production runtime is the host coding agent interpreting `skills/*/SKILL.md` files and their references, plus self-contained project and validator CLIs installed with the setup skill. There is no web application, server, database, compiled frontend, vector store, or long-running local process. Node.js is used for contract tests, JSON Schema and artifact validation, manuscript inventory, and verified shared-state operations.

The seven explicit user entries are `ask-author`, `setup-author-toolkit`, `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`. They have `disable-model-invocation: true`; routers display their exact host commands instead of invoking them through the Skill tool. `author-project`, `author-handoff`, and `author-review` are shared orchestration capabilities, not separate author-selected strategies.

The six independent skills are `fiction-workshop`, `character-archetypes`, `story-structure`, `narrative-nonfiction`, `prose-mechanics`, and `avoid-ai-writing`. They work without setup and retain their standalone output contracts. Every skill directory name must match its frontmatter `name`; `tests/skills.test.mjs` checks the inventory and invocation modes.

Shared workflows support one single-book fiction project per manifest with Markdown or plain-text manuscripts. English and Chinese are the core workflow languages. Chinese prose has dedicated sentence, segmentation, grammar, and catalog procedures. Chinese AI-associated findings describe textual patterns and never establish AI authorship. Reports must record actual language subchecks and partial or skipped coverage truthfully.

## Current contract and greenfield boundary

The only supported project manifest uses `schema_version: "4.0.0"`. Old manifests and old shared artifacts receive `greenfield-initialization-required` with an actionable manuscript-only initialization requirement. Setup checks the manifest before deploying references or making any other project write, so missing or conflicting references cannot hide that diagnosis and old projects remain unchanged. No 3.x-to-4.0 migration, legacy dispatch, legacy recovery, workflow-fixture mode, or old shared-state import exists.

This is a one-time greenfield exception. `docs/adr/0002-greenfield-4-0.md` amends only the additive/multi-version and migration portions of ADR-0001 and requires migration by default for every future incompatible release. ADR-0001's current-draft convergence cycle, immutable evidence, author decisions, revision execution, coordinated recovery, independent evaluation, bootstrap/import, and semantic-attestation architecture remain in force.

Report v2 and shared finding v2 remain current. Independent skills retain finding v1. Other artifact families keep their own schema versions. Current `creation-import` reconciles manuscript changes inside a 4.0.0 project; it is not an old-state import. Current cycle recovery, empty recovery, immutable history, independent skills, English and Chinese procedures, and truthful coverage remain supported.

## Technology and configuration

- Development requires Node.js 22 or newer and npm. The generic skills installer requires Node.js 22.20 or newer.
- The package uses native ECMAScript modules and Node's built-in `node:test` runner.
- `ajv` and `ajv-formats` are runtime validation dependencies and development dependencies. Schemas use JSON Schema draft 2020-12; Ajv runs with `allErrors` and `strict` enabled. Pinned `esbuild` bundles the installed runtime.
- `package.json` defines scripts and the Node engine. `package-lock.json` is the npm lockfile.
- Release metadata lives in `package.json`, `kimi.plugin.json`, and both `.claude-plugin` JSON files. All four, both lockfile root-version fields, and `skills/author-project/assets/project-template.json` say `4.0.0`; `tests/release.test.mjs` checks them.
- There is no application compilation, lint, formatter, coverage threshold, environment-variable, or secrets configuration. `scripts/build-runtime.mjs` generates checked-in self-contained ESM CLIs under `skills/setup-author-toolkit/assets/runtime/`. Keep them current. There are no repository CI workflows or automated deployment scripts.

## Repository layout and module boundaries

| Path | Purpose |
| --- | --- |
| `skills/*/SKILL.md` | Host-executable skill instructions with YAML frontmatter. |
| `skills/*/references/` | Craft rules, operation gates, creation recovery, review procedures, and audit instructions loaded as needed. |
| `skills/*/assets/` | Project, instruction, report, tracker, handoff, baseline, writing-plan, creation-batch, story-state, backup, and reference templates. |
| `scripts/validate.mjs` | Explicit repository, project-root, manifest, Markdown, artifact, scope, backup, coverage, review, convergence-status, and convergence-gate validation CLI. |
| `scripts/author-project.mjs` | Versioned-JSON facade for UTC timestamps, manuscript-only initialization, compact/full reads and status, pending and scope writes, typed tracker writes, backups/restores, cycles, manuscript reconciliation, revision execution, evaluation, completion, and recovery. It does not invoke strategies. |
| `scripts/build-runtime.mjs` | Generator and consistency checker for the two installed runtime bundles. |
| `scripts/smoke-installed-runtime.mjs` | Real generic-installer smoke in an isolated deployment without development dependencies. |
| `.githooks/pre-commit` | Tracked opt-in fast validation, generated-runtime consistency, and focused public CLI and evidence-contract checks. Setup and installation never enable it or change Git configuration. |
| `scripts/lib/` | Current project initialization, validation, state composition, scope, tracker, backup, cycle, recovery, execution, evaluation, and verified-write implementation, exported through `index.mjs`. |
| `references/` | Canonical shared JSON Schemas, controlled terminology, reporting rules, and AI-writing integration documents. The only project schema is `project-schema-v4.json`. |
| `examples/` | Current English and Chinese manuscript, report, tracker, and on-disk fixtures with empty operational evidence. |
| `tests/` | Node test files and shared current-contract fixture helpers. |
| `docs/` | Architecture decisions and the record of repository and host validation. |

Important JavaScript boundaries are:

- `schemas.mjs` loads the current schemas and configures Ajv. `manifest.mjs` accepts only 4.0.0 and returns the greenfield diagnostic for every other project version.
- `project-state.mjs` initializes fresh projects, validates current state, verifies deployed references after the manifest check, and composes compact/full views. `project-files.mjs` checks registered paths, pending artifacts, scope hashes, and new manuscript files.
- `manuscript.mjs` inventories `.md`, `.markdown`, and `.txt` files and excludes operational paths, including creation, staging, backups, and the convergence state root. Single-file manuscript roots and project-root inventories use the same exclusions.
- `scope.mjs` computes deterministic scope and inventory fingerprints, records proposed and confirmed scopes, preserves immutable snapshots, diffs manuscript transitions, and validates full-manuscript membership, order, exclusions, and current hashes.
- `tracker.mjs` validates living finding, approval, completion, and typed-decision tables. `tracker-commands.mjs` rejects duplicate identities before publication and preserves special-character paths without automatic merge, renumbering, deletion, or repair.
- `backup.mjs` implements approved backup and restore operations, closed index validation, original bytes, create absence, safety backups, and current-input checks.
- `cycles.mjs`, `cycle-coordination.mjs`, and `cycle-recovery.mjs` implement the active cycle, expected revisions, coordinated writes, read-only diagnosis, explicit-direction recovery, completed pointers, and owner-verified abandoned locks. Legacy recovery is not part of this boundary.
- `reconciliation.mjs` verifies exact `creation-import` decisions, current inventory, target scope or empty target, and story-state sources. It writes no manuscript and never refreshes scope hashes by caller claim.
- `revision-execution.mjs` separates preparation from actual-output verification and binds plans, batches, approvals, backups, scope fingerprints, ordered actions, and hashes.
- `evaluation-*.mjs` validates requested passes and artifacts, computes evidence and event chains, publishes immutable evaluations, and implements read-only status and gates. Dependency exceptions remain bounded to attested draft-baseline or revision-plan copyedits and never chain or rewrite historical units.
- `state-io.mjs` provides verified temporary-sibling writes, atomic replacement and readback, no-clobber publication, verified removal, and owner-verified lock directories. Coordinated writes are not a multi-file filesystem transaction.
- `time.mjs` owns the shared UTC clock, JSON and filename timestamp forms, and the 60-second future-evidence check with an injectable test clock.

## Runtime architecture and shared state

All five creation and revision strategies require the same user-invoked `setup-author-toolkit`. Setup deploys every shared contract from `skills/setup-author-toolkit/assets/references/` to `<project-root>/.author-toolkit/references/`. It creates missing files and preserves matching files. A mismatch produces `reference-version-conflict`; replacement requires separate exact-file approval and preservation beneath `<paths.backups>/reference-updates/<UTC-stamp>/`.

For a new project, setup also copies `skills/setup-author-toolkit/assets/AGENTS.md` to the project root only when no `AGENTS.md` exists. That template routes work inside a writing project and directs old manifests to separate manuscript-only initialization. This repository-root `AGENTS.md` documents toolkit development. Setup preserves existing agent instructions.

Every public project command returns `response_contract_version: "1.0"`, `command`, boolean `valid`, command-specific `result`, and structured `errors`. Success and valid read-only status queries exit 0, validation failures exit 1, and usage errors exit 2. Ordinary `not_satisfied` and `indeterminate` status outcomes are valid queries. Default `read` and `status` are compact; explicit `--full` and dedicated queries expose complete identities and evidence graphs.

The canonical manifest is `<project-root>/.author-toolkit/project.json`. It stores registration, `manuscript_root`, eight operational paths, optional `current_scope` and `pending_action`, manuscript-reconciliation and cycle-operation coordination, and the completed-cycle pointer. New manifests default backups, handoffs, creation, and the convergence state root beneath `.author-toolkit/`; existing current projects may retain other registered paths. Shared runtime contracts always resolve from the fixed `.author-toolkit/references/` directory.

The convergence state root contains `active-cycle.json`, immutable completed cycles, scopes, inventories, reconciliations, requested passes, revision executions, no-edit skips, review groups, semantic attestations, and evaluations. Active state uses an in-lock expected-revision check and verified atomic replacement. Lock timeouts and leftover lock directories block dependent writes for diagnosis and owner-verified recovery, never silent lock stealing. Completed cycles, scopes, inventories, reconciliations, passes, verified executions, skips, attestations, and evaluations are immutable. `last_completed_cycle` coordinates active-record removal and is not a permanent current-draft revision convergence flag.

A current-draft convergence cycle connects initial full-manuscript evaluation to a later target evaluation and explicit completion. Pending action remains operation-scoped and never supplies write, publication, restore, evaluation, or completion approval. The evaluator combines deterministic disk checks with semantic attestations and returns `satisfied`, `not_satisfied`, or `indeterminate` with concrete blockers. Independent full-manuscript `revise-draft` evaluations and executions use `cycle_id: null`; active recovery must link the same cycle. Completion records the author decision, recomputes evaluation with the changed tracker hash, and completes only when still satisfied.

External additions, modifications, deletions, and retained-path reorder transitions require `reconcile-manuscript`. Empty inventory never satisfies evaluation or completion, and approved nonempty recovery from empty requires full-manuscript `revise-draft`. Bootstrap null starting scopes, independent work, creation commits, imports, and execution inputs form one ordered event chain without rewriting historical evidence.

## Evidence, reports, and review

Read `references/terminology.md` before changing shared wording or contracts, introducing a shared term, or writing report and tracker statuses. Register new shared terms there and update the mirror in the same change; `tests/terminology.test.mjs` checks terminology and schema enum coverage.

Workflow reports are immutable Markdown files with human-readable coverage and exactly one report v2 JSON envelope. Every current report includes `scope_id`, `scope_fingerprint`, and the complete `requested_pass` reference. Reruns create new files. Shared revision and diagnostic work uses finding v2 and report v2. Creation, coverage, review, backup, and reader artifacts use separate contracts. Standalone skills retain finding v1.

The author decision loop, stable finding identity, tracker statuses, stale propagation, evidence reuse, current-draft revision convergence, and approval history are defined in `skills/revise-fiction/references/state-and-findings.md`. Read it before writing a shared report or changing finding or approval status.

Coverage units require source-report hashes; indexes require scope and requested-pass identities, hashed unit references, and a synthesis hash whenever the synthesis report is non-null. Null synthesis remains legal. Ordinary reuse requires exact current identities and dependencies. A dependency exception applies only to a complete attested copyedit case and creates a new unit version without rewriting history. Current-index validation does not force unrelated historical units to become current.

`author-review` reads actual manuscript chunks, then volume or story-phase syntheses, then a book synthesis for final review. Fresh-reader review is sequential within one logical reviewer and carries only that reviewer's isolated reader state. Summaries and story state cannot replace manuscript reading. Claim `full` only for actual target-scope coverage.

## Setup, build, and test commands

Install locked development dependencies from the repository root:

```bash
npm ci
```

Regenerate installed bundles after runtime changes, then run all release checks:

```bash
npm run build:runtime
npm run check:runtime
npm run smoke:installed
npm test
npm run validate
```

`npm test` runs every `tests/*.test.mjs` file, including generated-runtime consistency and real installer isolation smoke. `npm run validate` explicitly selects `--repository` and checks schemas, current English and Chinese examples, their reports, and on-disk state. No-argument validator invocation prints help without inspecting implicit state.

Useful focused commands are:

```bash
node --test tests/current-contract.test.mjs
node --test --test-name-pattern="greenfield|old manifest" tests/greenfield-400.test.mjs
node scripts/validate.mjs --help
node scripts/validate.mjs --repository
node scripts/validate.mjs --project-root /path/to/writing-project
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --scope-snapshot /path/to/scope.json
node scripts/validate.mjs --inventory-snapshot /path/to/inventory.json
node scripts/validate.mjs --backup-index /path/to/backups/index.json
node scripts/validate.mjs --convergence-status /path/to/.author-toolkit/project.json
node scripts/validate.mjs --convergence-gate /path/to/.author-toolkit/project.json
node scripts/author-project.mjs --help
node scripts/author-project.mjs timestamp
node scripts/author-project.mjs init --project-root /path/to/writing-project --language en
node scripts/author-project.mjs read --project-root /path/to/writing-project [--full]
node scripts/author-project.mjs status --project-root /path/to/writing-project [--full]
node scripts/author-project.mjs set-pending --project-root /path/to/writing-project --input /path/to/pending.json
node scripts/author-project.mjs record-scope --project-root /path/to/writing-project --input /path/to/scope.json
node scripts/author-project.mjs record-finding --project-root /path/to/writing-project --input /path/to/finding.json
node scripts/author-project.mjs record-finding-decision --project-root /path/to/writing-project --input /path/to/decision.json
node scripts/author-project.mjs record-approval --project-root /path/to/writing-project --input /path/to/approval.json
node scripts/author-project.mjs record-backup --project-root /path/to/writing-project --input /path/to/backup.json
node scripts/author-project.mjs record-restore --project-root /path/to/writing-project --input /path/to/restoration.json
node scripts/author-project.mjs reconcile-cycle --project-root /path/to/writing-project [--input /path/to/direction.json]
node scripts/author-project.mjs reconcile-manuscript --project-root /path/to/writing-project --input /path/to/reconciliation.json
node scripts/author-project.mjs prepare-draft-revision-execution --project-root /path/to/writing-project --input /path/to/preparation.json
node scripts/author-project.mjs verify-draft-revision-execution --project-root /path/to/writing-project --input /path/to/verification.json
node scripts/author-project.mjs prepare-revision-execution --project-root /path/to/writing-project --input /path/to/preparation.json
node scripts/author-project.mjs verify-revision-execution --project-root /path/to/writing-project --input /path/to/verification.json
node scripts/author-project.mjs evaluate-cycle --project-root /path/to/writing-project --input /path/to/evaluation.json
node scripts/author-project.mjs evaluate-draft --project-root /path/to/writing-project --input /path/to/evaluation.json
node scripts/author-project.mjs complete-cycle --project-root /path/to/writing-project --input /path/to/completion.json
```

The CLI help output is the source for all artifact option names. Manifest validation checks registered files, tracker, backups, and current scope. Convergence status is read-only and exits successfully for a valid query with any outcome; convergence gate succeeds only for current `satisfied` evidence.

## Testing strategy and conventions

Tests use `node:assert/strict`, shared readers in `tests/helpers.mjs`, and copied fixtures for writes. Filesystem and CLI tests create temporary directories beneath `.test-output/` or the OS temporary directory and register cleanup with `t.after`. `.test-output/` and `tests/.tmp/` are ignored; keep generated output out of commits. There is no configured coverage threshold.

The current suite covers:

- The single 4.0.0 manifest, greenfield old-state rejection through source and isolated installed CLIs, no setup writes, reference-diagnostic precedence, and current report/coverage identity contracts.
- Finding v2, report v2, standalone finding v1, safe paths, Markdown envelopes, current English and Chinese reports, tracker duplicates, special-character paths, and typed tracker commands.
- Scope fingerprints, immutable snapshots, full-manuscript validation, single-file manuscript roots, operational exclusions, custom paths, current-input hashes, pending actions, backups/restores, and UTC timestamp boundaries.
- Current-draft revision convergence, bootstrap and ordinary creation, increment, request and independent draft execution, external reconciliation, empty recovery, review jobs, no-edit skips, dependency exceptions, and cross-file cycle recovery through public operations and real disk state.
- Self-contained generated bundles and real generic installation without repository dependencies.
- Skill metadata, routing, mirrors, terminology, independent-skill boundaries, Chinese prose and AI-writing procedures, and truthful coverage.
- A synthetic million-Chinese-character manuscript inventory, creation-state exclusion, and new-file detection. Scale fixtures and handwritten reports are not creative-quality evidence.

`npm test` and `npm run validate` verify repository contracts only. They do not prove host discovery, a complete creative run, or creative quality. `docs/VALIDATION.md` records actual 4.0.0 checks and distinguishes unexercised host paths.

## Code and documentation style

- JavaScript uses two-space indentation, double quotes, semicolons, named ESM imports/exports, and `node:` prefixes for built-ins.
- JSON uses two-space indentation and a trailing newline. Keep `additionalProperties` and closed-contract behavior deliberate.
- Skill documentation and code are primarily English. Keep user-facing changes synchronized across relevant skill references, both READMEs, schemas, examples, and tests.
- Report headings, tracker columns, and Markdown status values remain English machine contracts for every project language. Chinese explanations, findings, quotations, and manuscript paths are supported as content.
- Preserve exact relative Markdown links from each skill. Installed skills must not depend on repository-root `references/`.
- `skills/avoid-ai-writing/` is vendored upstream content with its own license and recorded commit in `ATTRIBUTION.md`. Keep local integration and Chinese catalogs in the adapter references and mirrors; do not edit upstream compatibility history as part of project cutover.
- No automated formatter or linter is configured, so follow the existing file's conventions.

## Safety and data integrity

- Stored project paths must be portable project-relative paths with forward slashes. Reject absolute paths, home expansion, URI schemes, backslashes, and `..` segments. Apply the same rules to the creation root and convergence state root and exclude them from manuscript inventory.
- Before a manuscript edit, require exact current author approval, back up every existing affected file through public `record-backup`, verify create absence, and recompute SHA-256 hashes immediately before writing. Stop on any mismatch.
- Write the creation commit journal before touching manuscript content. Publish each file through a verified temporary sibling and atomic rename, updating the journal after every transition. Interrupted publication stops for explicit author direction.
- Restores require separate exact approval and current safety backups. Move files created by a restored batch into the safety backup before removing them. Edit or creation approval is not restore approval.
- Use `creation-import` and public `reconcile-manuscript` for external manuscript changes. Require exact inventory, story-state, and tracker evidence. Reconciliation writes no manuscript and never bypasses approval, backup, restore, or hash checks.
- Use public `reconcile-cycle` for interrupted current cross-file state. Without a direction it remains read-only. Repairs require exact cycle and operation identities and preserve evaluations, approvals, journals, backups, and verified executions. Remove a leftover lock only after its PID is confirmed not running and its exact owner token is supplied.
- Preserve historical reports, findings, approvals, completed cycles, scopes, inventories, evaluations, verified executions, creation batches, commit journals, and backups. Record later decisions in living state, the tracker, and new reports rather than rewriting history.
- Handoffs contain paths, IDs, approved decision summaries, and next actions, not manuscript excerpts, Story Bible content, draft baselines, reader-state content, or full findings.
- Git is optional for writing projects and is not a substitute for toolkit backups or commit journals. Setup does not alter Git configuration or `.gitignore`.

## Distribution and deployment

The repository and checked-in generated runtime are installed directly as source. Claude Code uses the marketplace plugin, Kimi Code uses the plugin URL followed by `/reload` or a new session, and generic installation uses `npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli`, with optional `-g`. Updates are manual through the host or `npx skills check` and `npx skills update`.

The generic installer deploys each skill directory, including the setup skill's shared references, self-contained runtime, initialization templates, and each independent skill's local contracts. The repository-root `references/` directory is canonical development source, not an installed-runtime dependency. Keep it byte-identical to `skills/setup-author-toolkit/assets/references/`; keep the four setup initialization templates byte-identical to `skills/author-project/assets/`; keep standalone finding schemas and the `prose-mechanics` AI-writing adapter mirrors synchronized. Setup deploys shared payloads into each writing project but does not copy runtime code or dependencies there.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `shengchen1998/author-toolkit` using `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.
