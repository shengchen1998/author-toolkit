# AGENTS.md

This file guides coding agents working on the Author Toolkit repository. `CLAUDE.md` is a symbolic link to `AGENTS.md`; edit this file and preserve that link.

## Project overview

Author Toolkit 3.1.0 contains 16 writing skills and Node.js tools for deterministic contracts. The host agent interprets `skills/*/SKILL.md` and selected references; Node.js handles contract tests, JSON Schema validation, manuscript inventory, project-state inspection, and shared-state transactions. There is no server, database, frontend, application build, or long-running process.

Shared workflows support one single-book fiction project per manifest, Markdown or plain-text manuscripts, and English or Chinese. Narrative nonfiction uses the independent `narrative-nonfiction` skill; multi-book manifests are unsupported in 3.1.

The private native-ESM package requires Node.js 22+ (22.20+ for the generic skills installer) and uses Ajv, ajv-formats, and esbuild for development; see `package.json` and `package-lock.json`. No other language toolchains are used.

## Repository map

- `package.json` and `package-lock.json`: the private package's Node.js engine, development dependencies, and test/validation/generation commands. `.github/workflows/validate.yml` is the CI pipeline; there are no other language manifests or build-system configuration files.
- `skills/`: the 16 skill packages. Each has a `SKILL.md`; progressive-disclosure references, templates, and assets live inside the owning skill.
- `scripts/`: repository CLI entry points. `scripts/lib/` contains their shared implementation, and `scripts/lib/index.mjs` is the library export surface.
- `references/`: canonical shared schemas and workflow contracts; not an installed runtime dependency.
- `skills/setup-author-toolkit/`: installed runtime. `assets/references/` mirrors shared contracts; `scripts/` is the generated, self-contained CLI mirror with bundled runtime packages; `assets/payload-manifest.json` records the toolkit version, payload files, and SHA-256 hashes.
- `skills/author-project/assets/project-template.json`: neutral starting manifest for a new v3.1 project.
- `examples/fiction-revision-en/` and `examples/fiction-revision-zh/`: handwritten v3.1 validation fixtures, not model-run evidence.
- `tests/`: Node.js contract, CLI, deployment, language-support, and scale tests. `tests/helpers.mjs` supplies common fixture access.
- `docs/VALIDATION.md`: current verification evidence, historical results, and explicit unverified limits. `docs/agents/` contains issue-tracker, triage-label, and domain-documentation conventions.
- `GLOSSARY.md`: shared domain vocabulary. Read it and any relevant `docs/adr/` entries before domain modeling or terminology changes; the directory may be absent.

## Setup, generation, and verification commands

Install the locked development dependencies:

```bash
npm ci
```

Run the complete contract tests and default validation before finishing changes to scripts, schemas, skills, templates, or fixtures:

```bash
npm test
npm run validate
```

`npm test` runs `node --test tests/*.test.mjs`; default validation checks every shipped schema and both localized v3.1 examples, including reports and on-disk state. Run one test file or a test-name pattern with:

```bash
node --test tests/creation-manifest.test.mjs
node --test --test-name-pattern="schema" tests/manifest.test.mjs
```

There is no lint, formatter, or coverage threshold. CI runs on pushes to `main` and pull requests using Ubuntu, Node.js 22, `npm ci`, `npm test`, and `npm run validate`; see `.github/workflows/validate.yml`. The checked-in setup mirror is the only generated runtime build. After changing `scripts/` or any hashed setup-skill asset, regenerate the mirror and payload manifest before testing:

```bash
npm run sync:setup-runtime
```

Check the mirror without changing it:

```bash
node scripts/sync-setup-runtime.mjs --check
```

The generator copies repository CLIs, bundles `scripts/lib/schemas.mjs` for Node 22 with esbuild, preserves dependency licenses, and regenerates the payload manifest with the `package.json` toolkit version and hashes of installed scripts, shared references, project-entry templates, the setup entry point, and setup branch references. Only Node built-ins may remain external in the schema bundle.

## CLI guide

Use each script's `--help` output as the exact argument contract. Repository scripts and their installed setup-skill mirrors share the same implementation unless noted below.

### Installation, initialization, and preflight

- `doctor.mjs` checks installation; repeat `--require-sibling NAME` to check required files in `author-project`, `revise-fiction`, or `revise-draft`, not project state. Setup requests only the seven `author-project` files; strategies declare their own startup siblings.
- `inspect-root.mjs --project-root DIR` performs bounded, read-only new-project discovery without following symlinks. By default it reads no file contents. When the author has not supplied a language, `--language-sample` explicitly samples at most 300 Unicode code points from one unomitted candidate using strict UTF-8; non-unique or empty selections return no sample. Existing v3.1 projects use `initialize.mjs`, not repeated root discovery.
- `install-entry-files.mjs --project-root DIR` verifies the payload and atomically installs both root agent entries. It preserves correct entries and any existing `START_HERE.md`, and rejects directories and special files.
- `setup-report.mjs begin --project-root DIR` checks only whether the manifest exists, returns the `new` or `existing` project branch and the `setup-report` terminology preset, and creates a private temporary store. `capture` records doctor, initialize-or-scaffold, entry-file, and final-check results, relaying their JSON and exit statuses; `render` produces the deterministic four-section setup report without another project inspection and removes the store. `cleanup` handles early stops. Host-specific strategy commands and current-draft revision convergence routing remain semantic setup decisions.
- `scaffold-project.mjs --project-root DIR [--author-project-root DIR]` is the sole new-project scaffolding implementation. It resolves the sibling skill's four templates by default, accepts an explicit root for nonstandard layouts, creates only missing content under the shared write lock, refuses an existing manifest, applies one timestamp, and validates the complete project before succeeding.
- `initialize.mjs --project-root DIR` is the sole existing-project initialization implementation. It preserves the manifest, history, and existing paths, restores missing registered directories, and creates only a missing backup index under the shared write lock. A file where a required directory belongs is preserved and fails validation. Project-state failures return a bounded `recorded_unverified` diagnosis (exit 3); invalid schemas create nothing (exit 1); argument errors exit 2.
- `check.mjs --project-root DIR` aliases `preflight.mjs`: payload, requested-sibling, and entry-file checks, project validation, and status. Repeat `--require-sibling NAME` for the active strategy's declared dependencies; failures fail installation, overall validation, and digest generation. Ordinary status uses current scope and leaves unverified approvals non-blocking; standalone `--require-execution` requires a scope ID. `--full` enforces strict execution and read-only evidence validation. Missing review brief or coverage index and zero selected review jobs are non-blocking `not_applicable`; invalid existing or missing linked artifacts and a selected scope without an immutable evidence report fail. `--digest` is a separate post-check opt-in, incompatible with `--full` and `--diagnose`; with `--json`, it refreshes the cache and returns the validated bounded manifest projection. `--diagnose` returns bounded read-only diagnoses and an execution-recovery preview without repairs; `--details` restores complete JSON details.

The final `check --diagnose` verifies the installed payload and both project agent entries without another doctor call or requiring `START_HERE.md` to match; the renderer consumes only the four captured results. Entry-file and requested-sibling failures fail preflight and digest generation but not project inspection. Installation, project state, and strategy gate are independent; setup assumes the five strategy entries are installed without checking host visibility.

### Project inspection, validation, and writes

```bash
node scripts/validate.mjs --project-root /path/to/writing-project
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --report /path/to/report.md
node scripts/validate.mjs --draft-baseline /path/to/draft-baseline-proposal.md
node scripts/status.mjs --manifest /path/to/.author-toolkit/project.json --scope-id scope-001
node scripts/read.mjs --project-root /path/to/writing-project
```

The validator also accepts creation batches, commit journals, draft-baseline proposals, story state, coverage units and indexes, review jobs, review briefs, and reader state. Draft-baseline validation checks required Observed subsections, final assertion-ID coverage, review rows, dispositions, and recorded destinations without judging atomicity or manuscript support. A review-brief check requires the tracker for decision comparison. Report validation rejects duplicate report IDs; repeated reports, `--tracker`, or `--manifest` enable batch or historical identity checks. Manifest validation also checks registered files, the tracker, and execution receipts; a v3.1 manifest with `current_scope` additionally checks current manuscript hashes. Validation failures exit nonzero and argument errors exit 2.

`read.mjs` returns a bounded validated manifest projection. Long displayed scope descriptions and pending artifact paths are capped without changing authoritative on-disk values. Failed validation returns bounded failed checks and diagnostics unless `--details` is supplied. `set-pending.mjs` validates pending-action updates; new actions retain at most eight unique inline artifacts and put longer complete lists in `.author-toolkit/pending-artifacts.json`. Legacy long inline lists remain valid without migration.

`record-scope.mjs` records ordered current manuscript hashes as a proposed scope under the shared write lock, then confirms only the exact unchanged record after explicit author confirmation. It validates the complete candidate project, writes the manifest atomically, and treats `--exclude` as current non-manuscript inventory exclusions. Membership, reading-order, or exclusion changes require a new scope ID; text-only changes can retain it through a new proposal.

`status.mjs` joins edit approvals to execution receipts and restore approvals to restoration records without reading manuscript content. Missing receipts are `unverified`, not malformed state. `--scope-id` with `--require-execution` enables the target-scope execution gate; `--json` returns the complete list. Strict status exits 1 for unverified approvals in the selected scope, but does not evaluate the other current-draft revision convergence conditions.

`writes.mjs` owns fail-closed backups, exact complete manuscript writes with generated evidence-linked receipts, recovery receipt recording, preview-first execution reconciliation, and read-only `check-index --explain` backup-index inspection. New edit batches, including create-only batches, stop while another approval is unverified. Reconciliation accepts only preserved post-write evidence; it never infers historical outputs from current manuscript text. Index inspection reports exact backup and approval differences without migrating history or selecting repair values.

Generate the bounded, disposable `PROJECT_STATE.md` navigation cache for a valid v3.1 project with:

```bash
node scripts/project-digest.mjs --project-root /path/to/writing-project
```

`author-project status --digest` uses the installed setup CLI. Regenerate once after each logical shared-state operation. At routine strategy start or resume, use `author-project check --digest` for projection, validation, ordinary status, and cache refresh. Generation requires complete project validation and records a UTC snapshot. Rerun preflight before reusing the cache; the manifest, tracker, and current evidence remain authoritative.

### Evidence and navigation helpers

- `node scripts/intake-inventory.mjs --project-root DIR` or `--manifest FILE` returns read-only JSON containing every manuscript path, Unicode code-point count, raw-byte SHA-256 hash, and non-manuscript exclusion. Files must be valid UTF-8. Its deterministic inventory order does not establish reading order or scope confirmation; `record-scope` still computes fresh hashes under the shared write lock.
- `node scripts/findings.mjs next-finding-id STANDARD --manifest FILE --count 35` allocates a consecutive unused ID block from tracker and report history. `node scripts/findings.mjs record-findings --manifest FILE --report FILE` validates a complete report batch and, under the shared write lock, atomically upserts finding rows and one Audit runs row per report while preserving existing decisions and timestamps. Clean reports record an audit run without adding findings. Neither transaction replaces semantic finding reconciliation or author decisions.
- `node scripts/scaffold-report.mjs --help` describes create-only report v2 generation. The CLI fills `skill.version` from the executing skill's installed `SKILL.md` declaration and rejects conflicts. An optional stage preset fills deterministic fields and recorded current-scope hashes; omitted findings become `findings: []`. A `revise-draft` intake preset requires every bullet label and level-two heading from its installed intake template in any order, checks current scope currency, and requires exactly one accurate manuscript table row per current-scope file in reading order. It rejects `--input` subsets while preserving additional non-scope inputs. Other presets retain recorded-hash rather than current-hash semantics. The complete report is validated before writing and existing reports are preserved. The semantic skill supplies actual findings, non-scope input versions, coverage, and synthesis dependencies.
- `node scripts/review-brief.mjs --project-root DIR [--tracker PATH] [--out PATH] [--updated-at TIMESTAMP] [--json]` regenerates the disposable resolved/dismissed decision summary from a valid v3.1 tracker. It preserves complete locations, reasons, and current reports, validates the result, and atomically replaces only the brief.
- `node scripts/coverage-index.mjs --manifest FILE --entry FILE [--updated-at TIMESTAMP] [--json]` registers one complete operation entry in the living coverage index. It validates full local coverage units, source and synthesis reports, confirmed current scope, and the complete index before an atomic replacement under the shared write lock. Other operations are preserved. Argument errors exit 2; validation and filesystem failures exit 1.
- `node scripts/evidence-retention.mjs --project-root DIR [--operation ID] [--enable --apply]` previews or applies explicitly bounded audit-evidence retention. First migration requires `--enable --apply`; current and recovery references are protected. Backups, batches, creation records, execution evidence, and manuscript are never candidates.
- `node scripts/range.mjs --project-root DIR "manuscript/1.md:1:56-71"` resolves an author-supplied character range. Positions are 1-based and inclusive and count Unicode code points. It reads one project-relative file, writes nothing, and does not inspect shared state.
- `node scripts/terminology.mjs --section NAME [--section NAME]...` prints selected level-two sections from the installed controlled terminology. `--preset setup-report` reads the bounded rows used by setup report interpretation and entry routing; `--preset setup` retains the complete setup selection for diagnostics that need more definitions. The helper writes nothing and does not inspect project state.

For `author-project` operations, use `skills/author-project/references/read-operations.md` for `read`, `validate`, `status`, `check --full`, `check --digest`, `status --digest`, and `check-index`; for other operations, follow the operation reference routes in `skills/author-project/SKILL.md`, including the whole-reference rule for noncontiguous ranges and the exception for an active strategy's explicit bounded multi-section route. Scaffolding and initialization use their CLIs, not `author-project` operations.

## Architecture

### Implementation and host independence

Give each capability one authoritative implementation. Semantic skills own author choices, editorial judgment, manuscript reading and synthesis, and operation sequencing. Installed CLIs own deterministic validation and shared-state transactions. When a CLI implements an operation, remove the equivalent model-executed procedure and its skill-operation entry; do not maintain a manual alternative. Skills compose those CLIs rather than reimplementing their algorithms.

Skill documents define one procedure, which the agent executes directly; no host-specific tool invocation is part of the runtime contract. Read the installed `SKILL.md` and only its applicable references. Do not create alternative procedures for different loading mechanisms. Explicit user entries remain author-invoked. Keep detailed semantic procedures progressively disclosed in skill-local references and shared runtime contracts in the installed setup payload.

When adding or changing a capability, classify it under this boundary and update the relevant skill, installed CLI, documentation, schemas or examples when applicable, and contract tests together. Semantic judgment stays in a skill; a fully deterministic state transition gets one CLI instead of a second skill procedure. Do not add a CLI merely to wrap editorial judgment or an arbitrary sequence of skill calls.

The skills have three invocation modes:

- Seven explicit user entries: `setup-author-toolkit`, `ask-author`, and the five shared strategies `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, and `revise-request`. Their frontmatter sets `disable-model-invocation: true`. Routers display exact host commands, or exact registered skill names for hosts with only a skill picker, rather than starting them internally.
- Three shared orchestration capabilities: `author-project` owns state, paths, validation, backups, execution receipts, commits, and restores; `author-handoff` preserves resumable context; `author-review` performs manuscript reading and synthesis.
- Six independent skills: `fiction-workshop`, `character-archetypes`, `story-structure`, `narrative-nonfiction`, `prose-mechanics`, and `avoid-ai-writing`. They work without setup, retain their standalone contracts, and leave shared state unchanged unless the author incorporates their output.

`tests/skills.test.mjs` checks skill inventory, names, declared versions, invocation modes, and host-independent procedures. It also contract-tests this root guide's implementation-boundary wording; `tests/terminology.test.mjs` checks its controlled vocabulary and terminology pointer. Skill discovery and author-facing invocation follow the selected host.

### Validation and module boundaries

Ajv and ajv-formats provide strict JSON Schema draft 2020-12 validation. The main `scripts/lib/` boundaries are:

- `schemas.mjs` loads schemas and configures Ajv. `manifest.mjs` accepts only schema 3.1.0; other versions are rejected without conversion.
- `project-scaffold.mjs` implements template-driven, create-only new-project scaffolding and final validation. `project-initialization.mjs` implements existing-project schema validation, registered-directory restoration, missing-index creation, bounded projection, and failure diagnosis. `scope.mjs` implements proposed-scope recording and exact-record confirmation with current hashes and complete candidate validation. `write-lock.mjs` owns the common backup-root write lock. `atomic-json.mjs` and `state-files.mjs` support shared-state persistence.
- `manuscript.mjs` inventories `.md`, `.markdown`, and `.txt` files while excluding registered operational paths and creation staging. `intake-inventory.mjs` adds strict UTF-8 decoding, Unicode code-point counts, and raw-byte hashes. `project-files.mjs` checks registered files, artifacts, scope hashes, pending artifact indexes, and newly added manuscript files. `pending-artifacts.mjs` implements bounded inline artifacts and atomic pending-index writes.
- `markdown.mjs` extracts the single report JSON envelope and validates language and evidence coverage. `finding-identity.mjs` allocates unused ID blocks and checks identity conflicts; `findings.mjs` batches validated report findings into the living tracker. `tracker.mjs` parses and validates living finding and approval tables; `approval-paths.mjs` handles paths containing commas, pipes, and backticks.
- `execution-receipts.mjs` validates post-write receipts and derives scoped unverified approvals without comparing historical output hashes to current manuscript. `write-operations.mjs` implements backups, exact writes, evidence, and receipts. `execution-recovery.mjs` audits recoverable evidence. `backup-index-diagnostics.mjs` supports read-only index inspection.
- `artifacts.mjs` validates story state, creation batches, commit journals, coverage artifacts, and coverage reuse. `review.mjs` validates review-job ranges, chunk/volume/book completion, request-only passage coverage, fresh-reader ordering, and reader-state continuity.
- `review-brief.mjs` generates the resolved/dismissed summary and checks it against the living tracker. `draft-baseline.mjs` checks required Observed subsections, final assertion-ID coverage, review dispositions, and recorded destinations while leaving atomicity and manuscript support to semantic review. `coverage-index.mjs` composes and updates operation coverage. `evidence-inspection.mjs` composes validators for preflight `--full` without inferring evidence currency or operation completion.
- `digest.mjs` generates the bounded navigation cache after the same complete project validation used by preflight. `navigation-fields.mjs` shares the manifest-field rendering between generation and inspection. `navigation-cache.mjs` performs read-only cache-format checks, compares generation time with manifest `created_at`/`updated_at` and cached scope/pending fields with the current manifest, and withholds stale recorded routes without rewriting the cache. The cache is disposable, never authoritative, and neither an execution gate nor a current-draft revision convergence claim.
- `setup-payload.mjs` verifies installed payload files, requested sibling dependencies, and optional project entries. `setup-entry-files.mjs` implements entry-file installation. `project-inspection.mjs` and `read-projection.mjs` provide shared validation, status, and bounded output for the CLI composition layers.

### Shared project state

All five creation and revision strategies require the same user-invoked `setup-author-toolkit`. Setup registers existing paths without imposing a manuscript layout. On every setup it overwrites the writing project's root `AGENTS.md` with `skills/setup-author-toolkit/assets/AGENTS.md` and replaces `CLAUDE.md` with a relative symlink to `AGENTS.md`. That installed template routes work inside a writing project; this repository-root file documents toolkit development.

Shared runtime contracts live in the installed setup skill's `assets/references/`; self-contained CLIs live in its `scripts/`. Setup runs the installed scaffolding and existing-project initialization CLIs directly. `author-project` resolves shared operations from `<setup-skill-root>`. Missing required files indicate an incomplete installation and stop shared work. Setup never copies shared contracts into the writing project or relies on project-side copies.

The canonical manifest is `<project-root>/.author-toolkit/project.json`. A v3.1 manifest records registration, `manuscript_root`, seven operational paths, and optional `current_scope` and `pending_action`. It has no `workflow.name`, `current_stage`, `stages`, or shared-reference path. Resolve artifacts through its registered `paths`, including custom report, backup, handoff, and creation locations. New manifests default backups, handoffs, and creation beneath `.author-toolkit/`; existing projects may retain registered locations.

All strategies share the manifest, tracker, reports, sessions, backups, handoffs, and creation state. Switching at a stable operation gate requires no second project tree or shared-state reset and does not authorize a pending write. Read the strategy's `SKILL.md` and `references/stage-gates.md` before changing its operation sequence or author gates. Run one evidence-gated operation at a time and stop at its author gate.

### Creation, evidence, and review

The creation loop is `writing-plan` -> `chapter-creation` -> `chapter-review` -> `creation-commit`, with `creation-baseline`, `creation-import`, and `milestone-review` around it. AI-written, author-written, and mixed batches share the gates and default to one chapter per plan. Keep one active creation batch and one shared pending action per book. Creation operations have their own artifacts and remain outside report v2 `stage` and the revision operation sequence.

The registered creation root contains `state/current.md`, `state/chapters/`, and `state/volumes/` for living story state keyed to source hashes; `batches/` for immutable accepted batches and resumable commit journals; and `staging/<batch-id>/` for proposed, rejected, and superseded text outside manuscript inventory. The Story Bible records author intent; accepted manuscript text establishes observed facts. Keep both visible when they conflict. Rejected staging never enters story state or manuscript scope.

Read `skills/write-fiction/references/creation-state.md` before changing creation artifacts, fingerprints, commits, restores, imports, or recovery. Before staging, approve the plan and exact write batch, including paths, actions, context versions, and input hashes. Creation acceptance covers the exact staged content, story-state differences, and ordered publication scope, recording manuscript and scope approvals separately. A dependency fingerprint determines whether staged content remains current; unrelated scope growth requires a refreshed publication scope but does not alone stale staged text.

Read `references/context-fit.md` before changing edit-proposal or manuscript-rewrite procedures. It is the shared proposal-time check for local continuity, character and object history, repetition, voice, request intent, and narrative dependencies; it does not replace approval, backup, or review gates. Keep its installed setup, `fiction-workshop`, and `prose-mechanics` copies byte-identical.

Read `references/terminology.md` before changing shared workflow wording, contracts, or report and tracker statuses. Register new shared terms there in the same change; `tests/terminology.test.mjs` checks usage and coverage. Machine identifiers, report headings, tracker columns, field names, and enum values stay English and case-sensitive in every project language. Chinese explanations, quotations, findings, and paths are content. Chinese prose has dedicated sentence, segmentation, grammar, and catalog procedures; record actual language subchecks and partial or skipped coverage truthfully. AI-associated findings describe textual patterns and never establish AI authorship.

Shared revision and diagnostic work uses finding v2 and immutable Markdown reports with exactly one report v2 JSON envelope. Reruns create new files. Standalone skills retain finding v1. The author decision loop, finding identity, tracker statuses, stale propagation, evidence reuse, current-draft revision convergence, and approval history have one source: `skills/revise-fiction/references/state-and-findings.md`. Before writing a shared report, changing finding or approval status, propagating stale evidence, or recording a stopping point, follow the applicable `Task-based reading` route, including its rule for noncontiguous ranges and the exception for an active strategy's explicit bounded multi-section route.

Evidence reuse requires matching operation, scope, input versions, requested coverage and subchecks, and dependency state. Changed inputs or dependencies make affected evidence stale; schema validity does not establish current evidence. Scope membership, order, or exclusion changes require a new author-confirmed scope. `pending_action` describes interrupted or awaiting work, not permission to resume a manuscript write.

Coverage units and the living coverage index live beneath the registered reports path. Reuse only full local coverage units whose source-report identity, operation, paths and hashes, requested subchecks, and dependencies match. Preserve the unit's original scope for provenance and use the target scope for the composed index and synthesis. Reevaluate affected volume, story-phase, current-scope, and whole-book syntheses whenever text, membership, order, dependencies, or child coverage changes. Local summaries never extend an old synthesis into a new scope.

`author-review` reads actual manuscript chunks, then volume or story-phase syntheses, then a book synthesis for final review. Intent and standards may run in parallel. One logical fresh reader reads sequentially and carries only that reviewer's isolated reader state. Request review reads only its declared changed and affected passages. Summaries and story state cannot replace manuscript reading. Claim `full` only for actual target-scope coverage required by the selected review mode.

## Code style and change conventions

Use native ESM with named imports, two-space indentation, double quotes, semicolons, and `node:` prefixes for built-in modules. Keep CLI entry points thin and place reusable behavior in `scripts/lib/`; export shared library behavior through `scripts/lib/index.mjs` when other entry points consume it.

Preserve closed JSON Schema contracts and their `additionalProperties` rules. Stored machine identifiers, field names, report headings, tracker columns, and enum values are versioned contracts, not prose to localize. Keep exact relative links valid from each skill's installed location.

Keep user-facing workflow changes synchronized across skill references, `README.md`, `README.zh-CN.md`, schemas, examples, and tests. Update `docs/VALIDATION.md` after real host validation, not after merely running repository fixtures. Release metadata lives in `package.json`; when changing versions, update every first-party skill's declared version to match and regenerate the payload manifest. Vendored skills retain their independent versions.

Issues and specs live in GitHub Issues for `shengchen1998/author-toolkit`; use `gh` and follow `docs/agents/issue-tracker.md`. Preserve the canonical triage-label strings in `docs/agents/triage-labels.md`. Use `GLOSSARY.md` and relevant ADRs as described by `docs/agents/domain.md`.

## Testing strategy and verification limits

Tests use `node:test`, `node:assert/strict`, and `tests/helpers.mjs`. Filesystem tests create temporary directories beneath `.test-output/` and register `t.after` cleanup. `.test-output/`, `node_modules/`, and `tests/.tmp/` are ignored; keep generated output out of commits.

`tests/deployment.test.mjs` proves the installed CLI mirror is self-contained; `tests/scale.test.mjs` uses a synthetic million-character fixture for structural behavior, not creative-quality evidence.

`npm test` and `npm run validate` verify repository contracts, not host discovery, a complete creative run, or creative quality. `docs/VALIDATION.md` separates current 3.1 checks and limited host evidence from historical and unverified paths. Fixture reports and the synthetic scale fixture are not model-run evidence.

## Data integrity and security

- Stored project paths are portable project-relative paths with forward slashes. Reject absolute paths, home expansion, URI schemes, backslashes, and `..` segments. Resolve registered paths against the selected project root and exclude the entire creation root from manuscript inventory.
- Before a manuscript edit, require explicit current approval for the exact operation, scope, paths, actions, and input versions. Back up every affected existing file, recompute SHA-256 hashes immediately before writing, and stop on mismatch. Before creation publication, require every create target to remain absent and represent its original input hash as null.
- After backup, publish the exact approved batch through `complete-write`; it verifies every output, preserves evidence, and appends one linked execution receipt in the same invocation. Keep the approval `approved`; the receipt proves execution. A missing receipt is an unverified approval, not proof that no write occurred. Do not infer historical receipts from backups alone.
- Write the creation commit journal before touching manuscript content. Publish each file through a verified temporary sibling and atomic rename, updating the journal after every transition. The journal coordinates files; it is not a multi-file filesystem transaction. Interrupted publication stops for an explicit author decision.
- Restores require separate approval naming the backup or creation commit and exact files, plus a safety backup of current content. Move files created by the restored batch into that safety backup before removing them. Edit or creation approval is not restore approval.
- Use `creation-import` to reconcile externally added, modified, deleted, or reordered manuscript. Report changed inputs instead of silently refreshing scope hashes, story state, or stale evidence.
- Preserve historical findings, approvals, creation batches, commit journals, backups, and migration snapshots. Default projects preserve historical reports; explicitly bounded projects retire only validated unreferenced audit artifacts through the retention transaction, with finding identities retained in the tracker. Record later decisions in living state, the tracker, and new reports.
- Handoffs contain paths, IDs, approved decision summaries, and next actions, not manuscript excerpts, Story Bible content, draft baselines, reader-state content, or full findings.
- Git is optional for writing projects and does not replace toolkit backups or commit journals. Setup does not alter Git configuration or `.gitignore`.

## Distribution and deployment

The repository is installed directly as source; there is no release bundle or native plugin manifest. Install through the generic skills installer and follow its host-selection prompts:

```bash
npx skills@latest add shengchen1998/author-toolkit
npx skills@latest add shengchen1998/author-toolkit -g
```

The second command installs at user level. Authors invoke user entries through the current host's skill command or skill picker with the exact unqualified registered skill name. Updates are manual through the host or:

```bash
npx skills check
npx skills update
```

Keep `references/` byte-identical to `skills/setup-author-toolkit/assets/references/`; also synchronize independent skills' finding schemas, the `prose-mechanics` AI-writing adapter mirror, and the `context-fit.md` copies in `fiction-workshop` and `prose-mechanics`. Installed skills must not depend on repository-root `references/`. Deployment tests enforce these mirrors and installed-reference independence.

`skills/avoid-ai-writing/` is vendored upstream content with its own license and recorded commit in `ATTRIBUTION.md`. Keep local integration in `references/avoid-ai-writing-adapter.md` and `references/avoid-ai-writing-zh-CN.md`; the vendored skill must not absorb local integration text. Standalone Chinese AI-Isms routes through `prose-mechanics`, while the upstream standalone skill remains English-specific.
