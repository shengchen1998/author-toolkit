# Author Toolkit

## Project overview

Author Toolkit 3.2.0 is a source-distributed collection of 16 writing skills for Claude Code and Kimi Code, plus Node.js tools for validating and migrating writing-project contracts. It provides incremental fiction creation and four revision strategies over one shared evidence model.

The production runtime is the host coding agent interpreting `skills/*/SKILL.md` files and their references. There is no web application, server, database, compiled frontend, vector store, or long-running local process. Node.js is used for contract tests, JSON Schema and artifact validation, manuscript inventory, and direct migration from v2, v3.0, or v3.1 to v3.2.

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

Shared workflows support one single-book fiction project per manifest with Markdown or plain-text manuscripts. English and Chinese are the core workflow languages. Narrative nonfiction uses the independent `narrative-nonfiction` skill; multi-book manifests and other hosts are outside the supported 3.2 workflows. Chinese prose has dedicated sentence, segmentation, grammar, and catalog procedures. Chinese AI-associated findings describe textual patterns and never establish AI authorship. Reports must record actual language subchecks and partial or skipped coverage truthfully.

## Technology and configuration

- Development requires Node.js 22 or newer and npm. The generic skills installer documented in `README.md` requires Node.js 22.20 or newer.
- The package uses native ECMAScript modules (`"type": "module"`) and Node's built-in `node:test` runner.
- `ajv` and `ajv-formats` are runtime validation dependencies and development dependencies. Schemas use JSON Schema draft 2020-12; Ajv runs with `allErrors` and `strict` enabled. The pinned `esbuild` development dependency bundles them and their transitive dependencies into the checked-in installed runtime.
- `package.json` defines the development scripts and Node engine. `package-lock.json` is the npm lockfile.
- `kimi.plugin.json` exposes `./skills/` to Kimi Code. `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` contain Claude Code plugin metadata.
- Release metadata is not generated from one source. When changing versions, inspect `package.json`, `kimi.plugin.json`, and both `.claude-plugin` JSON files; all four currently say `3.2.0`. `tests/release.test.mjs` checks those four locations, both lockfile root-version fields, and the neutral project template.
- There is no application compilation, lint, formatter, coverage-threshold, environment-variable, or secrets configuration. `scripts/build-runtime.mjs` generates the self-contained ESM CLI artifacts under `skills/setup-author-toolkit/assets/runtime/`; keep them checked in and current. There are no repository CI workflows or automated deployment scripts.

## Repository layout and module boundaries

| Path | Purpose |
| --- | --- |
| `skills/*/SKILL.md` | Host-executable skill instructions with YAML frontmatter. |
| `skills/*/references/` | Craft rules, operation gates, creation recovery, review procedures, and audit instructions loaded as needed. |
| `skills/*/assets/` | Project, agent-instruction, report, tracker, handoff, baseline, writing-plan, creation-batch, and story-state templates. |
| `scripts/validate.mjs` | CLI for schemas, manifests, on-disk project state, Markdown reports and story state, scope, inventory, cycle, requested-pass, revision-execution, no-edit, review-group, attestation and evaluation artifacts, convergence status and gate queries, creation and coverage artifacts, review jobs, and legacy workflow fixtures. |
| `scripts/author-project.mjs` | Executable facade for shared UTC timestamps, manuscript-only initialization, compact and full project reads and status, cycle start, optimistic transition, cross-file cycle reconciliation, external manuscript reconciliation, cycle-bound and independent draft revision execution preparation and verification, cycle-bound and independent revise-draft evaluation, completion, operation checks, convergence status, and convergence gate operations through one versioned JSON response envelope; it does not invoke strategies. |
| `scripts/build-runtime.mjs` | Pinned-esbuild generator and consistency checker for the checked-in self-contained validator and project-operation ESM artifacts. |
| `scripts/smoke-installed-runtime.mjs` | Real generic-installer smoke in an isolated temporary deployment, followed by installed CLI help, manuscript-only initialization, compact and full project reads and status, project validation, exit-code, and shared-reference checks without development dependencies. |
| `skills/setup-author-toolkit/assets/runtime/` | Checked-in generated `validate.mjs` and `author-project.mjs` bundles with Ajv and all transitive runtime dependencies; schemas resolve from the sibling `assets/references/` payload, and initialization templates resolve from the sibling assets payload. |
| `scripts/migrate-v32.mjs` | CLI for direct v2, v3.0, or v3.1 to v3.2 migration and idempotent v3.2 validation; `scripts/migrate-v3.mjs` is the compatibility wrapper. |
| `scripts/lib/` | Project initialization and compact state composition, validation, scope recording, cycle lifecycle and coordinated recovery, revision execution, convergence evaluation, verified state writes, and migration implementation, exported through `index.mjs` or loaded by the public CLI. |
| `references/` | Canonical shared JSON Schemas, controlled terminology, reporting rules, and AI-writing integration documents. |
| `examples/` | English and Chinese manuscript, report, tracker, and workflow fixtures used by tests and default validation. |
| `tests/` | Node test files and shared fixture helpers. |
| `docs/` | Migration guides and the record of repository and host validation. |

The main JavaScript boundaries are:

- `schemas.mjs` loads the shared schemas and configures Ajv; `manifest.mjs` dispatches v2, v3.0, v3.1, and v3.2 validation, while `workflow.mjs` retains legacy v2 sequence invariants. `time.mjs` owns the shared UTC clock, JSON and filename timestamp forms, and the 60-second future-evidence check; runtime writes and current artifact validators use its injectable clock instead of independent time sources or filenames.
- `project-state.mjs` initializes fresh manuscript-only projects from packaged templates, validates existing projects without resetting evidence, verifies deployed references, and composes compact or explicit-full project views from the existing manifest, tracker, scope, and evaluation validators. `shared-references.mjs` resolves and verifies the installed reference payload. Compact status omits full manifests, ordered path hashes, evidence graphs, and history.
- `manuscript.mjs` inventories `.md`, `.markdown`, and `.txt` files and excludes registered operational paths, including creation, staging, and the convergence state root. `project-files.mjs` checks registered files, artifacts, scope hashes, and newly added manuscript files.
- `scope.mjs` records v3.2 scopes, computes deterministic scope and inventory fingerprints, preserves immutable snapshots, diffs created, modified, deleted, and retained-path reordered files, and validates full-manuscript membership, order, exclusions, and current disk hashes.
- `cycles.mjs` starts and transitions the authoritative current-draft convergence cycle, checks parallel manuscript changes and unreconciled external changes, and prevents a revise-fiction cycle with linked revision executions from switching strategy before whole-book evidence and explicit completion. `cycle-coordination.mjs` orders manifest `cycle_operation`, active-cycle, pending, and final-manifest writes; `cycle-recovery.mjs` provides read-only diagnosis and explicit-direction reconciliation without rewriting history. `reconciliation.mjs` verifies exact import decisions and story state, preserves immutable manuscript reconciliations, and derives recovery routes without writing manuscript. `revision-execution.mjs` prepares approved batches against exact plan, batch, operation, scope-fingerprint, ordered-path, action, input-hash, and approved-output decisions, plus backups and current inputs, then verifies actual output bytes under the same cycle lock and expected revision. It preserves prepared operations and subchecks during final-pass expansion and shares retained-path diff semantics with `scope.mjs`. `state-io.mjs` provides verified temporary-sibling writes, atomic replacement and readback, no-clobber publication, verified active removal, and owner-verified cross-process lock directories for living state.
- `evaluation-contracts.mjs` owns requested-pass and evidence-artifact identity and validation. `evaluation-artifacts.mjs` reads project, cycle, and evaluation artifacts. `evaluation-chains.mjs` validates ordered creation, reconciliation, and execution scope events. `evaluation-evaluator.mjs` computes full-manuscript evidence, including whole-book operation gates whenever the cycle's initiating or current strategy is revise-fiction. `evaluation-recompute.mjs` compares stored evaluations with requested pass, scope, and evidence identities. `evaluation-operations.mjs` publishes evaluations and coordinates post-decision completion. `evaluation-status.mjs` implements read-only status, gate, and latest-evaluation starting queries. The pre-existing public evaluator facade re-exports these boundaries through `index.mjs`.
- `markdown.mjs` extracts and validates the single JSON report envelope and language/evidence coverage. `tracker.mjs` validates living finding and approval tables; `approval-paths.mjs` parses paths containing commas, pipes, and backticks.
- `artifacts.mjs` validates story state, creation batches, commit journals, coverage units and indexes, and coverage-reuse semantics.
- `review.mjs` validates review-job source ranges, chunk/volume/book completion, fresh-reader sequencing, and reader-state continuity.
- `migration.mjs` performs direct v3.2 preflight and conversion, preserves original manifests and provable scope/inventory snapshots, creates the creation skeleton and the convergence state root skeleton, and uses verified atomic writes without an intermediate v3.1 state. `legacy-recovery.mjs` diagnoses nonterminal journals, in-progress legacy pending work, and unresolved legacy staging without creating a cycle or approval; cycle start, operation checks, migration summaries, and `cycle-recovery.mjs` share those blockers.

The examples under `examples/fiction-revision-en/` and `examples/fiction-revision-zh/` intentionally retain legacy v2 manifests and workflow fixtures for compatibility testing. Do not migrate them in place. The neutral v3.2 starting point is `skills/author-project/assets/project-template.json`.

## Runtime architecture and shared state

All five creation and revision strategies require the same user-invoked `setup-author-toolkit`. Setup registers existing paths without imposing a manuscript layout and deploys every shared contract from `skills/setup-author-toolkit/assets/references/` to `<project-root>/.author-toolkit/references/`. It creates missing files and preserves matching files. A mismatched existing file produces `reference-version-conflict` and blocks shared work; replacement requires separate exact-file author approval and preservation beneath `<paths.backups>/reference-updates/<UTC-stamp>/`.

For a new writing project, setup also copies `skills/setup-author-toolkit/assets/AGENTS.md` to the project root only when no `AGENTS.md` exists. That template routes work inside a writing project; this repository-root `AGENTS.md` documents toolkit development. Setup preserves existing agent instructions.

Every shared `read`, `validate`, and `status` operation through `author-project` checks all packaged references before using project state. Missing files or hash mismatches route the author through setup; a valid v3 manifest alone does not prove reference deployment. Each strategy then runs one evidence-gated operation at a time and stops at its author gate. Exact sequences, delegation, and gates live in the strategies' `SKILL.md` and `references/stage-gates.md` files. At a stable operation gate, an active current-draft convergence cycle permits its exact recovery work and read-only inspection, and blocks a parallel manuscript-changing cycle. Strategy switches wait for the author's exact command and never invoke another user entry automatically.

Every public project command returns `response_contract_version: "1.0"`, `command`, boolean `valid`, command-specific `result`, and structured `errors`. Success and valid read-only status queries exit 0, project or operation validation failures exit 1, and argument, input-file, or input-shape usage errors exit 2. Ordinary `not_satisfied` and `indeterminate` status outcomes are valid queries; gates fail unless evidence is current and satisfied. Default `read` and `status` return compact project status with project and reference validation, scope identity and file count, pending action, active cycle and recovery position, evaluation outcome and blockers, decision counts, and exact next action. Complete manifests, ordered path hashes, evaluation identities, evidence graphs, and history require explicit `--full` or dedicated queries. Public `init` creates fresh operational evidence from manuscript-only input without importing findings, approvals, evaluations, or current-draft revision convergence claims, and validates existing projects without resetting them.

The canonical manifest is `<project-root>/.author-toolkit/project.json`. A v3.1 manifest stores registration, `manuscript_root`, seven operational paths, and optional `current_scope` and `pending_action`. V3.2 adds the convergence state root, scope identity, current-draft convergence cycle, optional interrupted `cycle_operation`, and the `last_completed_cycle` coordination pointer. The manifest has no `workflow.name`, `current_stage`, `stages`, or shared-reference path state. The neutral template uses schema 3.2.0. The runtime still reads valid v3.0 and v3.1 manifests; creation from either legacy version first uses direct setup migration to v3.2. The separate `upgrade-v31` operation remains only for legacy v3.1 compatibility. Recognize v2 only for setup migration. `author-project` owns state, paths, validation, cycle transitions and recovery, backups, commits, and restores; creative content belongs to the writing skills.

Resolve operational files through the manifest's registered `paths`, including custom report, backup, handoff, creation, and convergence state root locations. Shared runtime contracts always resolve from the fixed `.author-toolkit/references/` directory. Shared artifacts include the Story Bible, audit tracker, reports, sessions, backups, handoffs, creation state, scope snapshots, inventory snapshots, and cycle records. New manifests default backups, handoffs, creation, and the convergence state root to locations beneath `.author-toolkit/`; existing projects may retain other registered locations. The convergence state root contains `active-cycle.json`, `cycles/<cycle-id>.json`, `scopes/<scope-id>-<scope-fingerprint>.json`, `inventories/<inventory-fingerprint>.json`, `reconciliations/<reconciliation-id>.json`, requested passes, revision executions, no-edit skips, review groups, semantic attestations, and evaluations. Active state uses a cross-process `active-cycle.lock/` directory, an in-lock expected-revision check, and verified atomic replacement; lock timeouts and leftover lock directories block dependent writes for diagnosis and owner-verified explicit recovery, never silent lock stealing. Completed cycles, scopes, inventories, manuscript reconciliations, passes, verified executions, skips, attestations, and evaluations are immutable. `last_completed_cycle` points to completed history before active removal; it is not a permanent current-draft revision convergence flag.

A current-draft convergence cycle records initiating and current strategies, bootstrap, starting and target scope references, requested-pass and related-artifact references, recovery position and operation ID, change set, work set, evaluation references, and completion. Pending action remains operation-scoped and does not own the cycle; its optional cycle, revision, operation, and scope-fingerprint fields are coordination references, never write, publication, restore, or completion approval. Dependent operations write manifest `cycle_operation`, any immutable artifact, the intended active revision, and final manifest state in that order. Completion publishes completed history and the completed-cycle pointer before verified active removal. `scripts/author-project.mjs` and the public exports in `scripts/lib/index.mjs` provide the shared start, transition, `reconcile-cycle`, external manuscript reconciliation, operation-check, revision execution prepare/verify, cycle-bound and independent revise-draft evaluation, completion, convergence status, and convergence gate seam for hosts and tests. Reconciliation without a direction only diagnoses; repairs require explicit author direction with exact cycle and operation identities and never rewrite evaluations, approvals, journals, backups, or verified executions. These coordinated writes are not a multi-file filesystem transaction. The evaluator combines deterministic disk checks with structured semantic attestations, returns `satisfied`, `not_satisfied`, or `indeterminate` with concrete blockers, and stores an immutable evidence graph containing every referenced artifact hash. A valid full-manuscript scope or caller-supplied outcome alone cannot manufacture satisfaction. Independent local or narrowed revise-draft work may finish without a cycle or full-manuscript claim; independent full-manuscript evaluations record `cycle_id: null`, while active recovery must link the same cycle. Read-only revise-fiction work remains available without a cycle; manuscript-changing or required-evidence-invalidating revise-fiction work needs a satisfied start, whole-book gates, verified executions, and restored current-draft revision convergence for the full target. Completion records the author decision, recomputes and saves an evaluation with the changed tracker hash, and completes only when that evaluation remains satisfied. Request completion is reported independently and never replaces that gate. Actual reading and editorial judgment remain bounded by trust in the host attestations and recorded author decisions.

External additions, modifications, deletions, and retained-path reorder transitions require `reconcile-manuscript` before dependent manuscript-changing operations. The operation verifies a real tracker `creation-import` decision, current inventory, target scope or null empty target, and story-state sources; caller confirmation booleans and replacement change sets do not authorize it. An active cycle derives its cumulative change set from the untouched starting snapshot and never opens a parallel cycle. Without an active cycle, reconciliation creates no cycle and records a manifest reference for an eligible later start. Use `revise-increment` only with provable satisfied previous full-manuscript evidence; otherwise use `revise-draft`. Empty inventory blocks satisfaction and completion, and approved nonempty recovery from empty always requires full-manuscript `revise-draft`. Reconciliation writes no manuscript and does not replace backup, restore, approval, or execution safety checks.

The default creation root contains:

- `state/current.md`, `state/chapters/`, and `state/volumes/` for living story state keyed to source hashes;
- `batches/` for immutable accepted creation batches and resumable commit journals;
- `staging/<batch-id>/` for proposed, rejected, and superseded text outside manuscript inventory.

The Story Bible records author intent; accepted manuscript text establishes observed facts. Keep both visible when they conflict. Rejected staging never enters story state or manuscript scope. Structural validation of derived story state does not prove semantic extraction completeness.

The creation operations are `creation-baseline`, `writing-plan`, `chapter-creation`, `chapter-review`, `creation-commit`, `creation-import`, and `milestone-review`. The repeating loop is `writing-plan`, `chapter-creation`, `chapter-review`, and `creation-commit`. AI, author-written, and mixed batches share the same gates and default to one chapter per plan. First-time bootstrap starts only from an actually empty manuscript with no current scope, a null starting scope, and an explicit bootstrap marker. Its first nonempty committed publication links the batch and journal to the same cycle and routes to `revise-draft` for the initial full-manuscript evaluation. A first approved nonempty external import may instead supply that publication evidence through manuscript reconciliation with a null previous scope and no creation commit; it likewise requires initial full-manuscript `revise-draft`. Across the active bootstrap, cumulative change sets retain the null origin while reconciliation previous scopes and execution input scopes form one ordered event chain. Each event's previous or input scope must match the preceding event's target or output scope, every event must be verified exactly once, and the final target must equal current scope. A real creation commit is an event whose scope_before matches the starting scope or null bootstrap origin and whose scope_after is proved through the existing batch, journal, approval, and verified-file transition checks. Creation commit→import and creation commit→edit→import follow the same rules. Missing commit events and forged output scopes block the chain. Empty reconciliation is a legal intermediate state awaiting nonempty recovery, never a satisfied or completed target. Chain gaps, skipped empty predecessors, and forged final targets block current-draft revision convergence. Cycle-external reconciliation always requires an explicit `previous_scope`; only a verified empty recovery may use an explicit null value, and omitting the field is a usage error before any state write. Empty manuscript state never satisfies evaluation or completion, including a rejected bootstrap batch with no subsequent approved import. Ordinary creation starts from a current satisfied full-manuscript evaluation and permits one accepted creation commit per cycle; one explicitly approved batch may contain multiple chapters. After ordinary publication, `revise-increment` resumes the same cycle for the complete expanded manuscript, and another writing plan waits for explicit cycle completion. Rejected staging remains unpublished and may complete as no-change after ordinary starting-scope revalidation; a rejected bootstrap batch leaves an empty manuscript and cannot complete. Keep one active creation batch per book and one shared pending action. Creation operations remain outside report v2 `stage` and the legacy revision-only stage sequence. Load `skills/write-fiction/references/creation-state.md` before changing creation artifacts, fingerprints, commits, restores, imports, or recovery behavior.

Before creation, the author approves the plan and exact write batch, including paths, actions, context versions, and input hashes. After staging, creation acceptance covers the exact manuscript content, story-state differences, and resulting ordered publication scope, with exactly one `creation-manuscript` approval for batch paths and one `creation-scope` approval for the complete ordered target paths. Both bind the batch ID, recomputed dependency fingerprint, and target scope fingerprint; rejected staging instead requires exactly one `creation-rejection` decision bound to that batch and unchanged starting scope. `creation-commit` follows acceptance without another gate. Cycles reference the existing batch and commit journal without duplicating their file transitions. A later accepted or committed reference with the same batch ID replaces the earlier staged or awaiting-author reference and hash instead of appending a second batch. A dependency fingerprint determines whether staged content remains current; unrelated scope growth requires a refreshed publication scope but does not alone stale staged text. Pure create insertion does not require retained-path reorder records when retained relative order is unchanged; actual retained reorder requires exact journal transitions and the approved complete target order. `creation-import` reconciles external additions, modifications, deletions, and reordering with author confirmation.

### Evidence, reports, and review

Read `references/terminology.md` before changing shared workflow wording or contracts, introducing a shared term, or writing report and tracker statuses. Use its approved English terms, fixed Chinese equivalents, operation identifiers, and exact contract values. Register new shared terms there in the same change; `tests/terminology.test.mjs` checks terminology usage and coverage.

Whole-report evidence reuse requires matching operation, `scope_id`, input versions, requested coverage and subchecks, and dependency state. Changed inputs or dependencies make affected evidence stale; a schema-valid old report is not necessarily current evidence. Scope membership, order, or exclusion changes require a new author-confirmed scope. `pending_action` describes interrupted or awaiting work, not permission to resume a manuscript write, publication, restore, or completion.

Workflow reports are immutable Markdown files with human-readable coverage and exactly one report v2 JSON envelope. Reruns create new files. Shared revision and diagnostic work uses finding v2 and report v2. Creation batches, commit journals, story state, coverage artifacts, review jobs, and reader state use separate artifact contracts. Standalone skills retain finding v1 and leave shared state unchanged unless the author explicitly incorporates their output.

The author decision loop, stable finding identity, tracker statuses, stale propagation, evidence reuse, current-draft revision convergence, and approval history are defined in `skills/revise-fiction/references/state-and-findings.md`; that file is the single source for these rules. Read it before writing a shared report or changing finding or approval status. `references/workflow-reporting.md` points to that file, not the reverse.

Coverage units and the living coverage index live beneath the registered reports path. Reuse only full local coverage units whose source-report identity, operation, paths and hashes, requested subchecks, and dependencies match. Keep the unit's original scope for provenance and use the target scope for the composed index and synthesis. Reevaluate affected volume, phase, current-scope, and whole-book syntheses whenever text, membership, order, dependencies, or child coverage changes. Local summaries never extend an old synthesis into a new scope.

`author-review` reads actual manuscript chunks, then volume or story-phase syntheses, then a book synthesis for final review. Intent and standards may run in parallel. Fresh-reader review is sequential within one logical reviewer and carries only that reviewer's isolated reader state. Summaries and story state cannot replace manuscript reading. Claim `full` only for actual target-scope coverage.

## Setup, build, and test commands

Install locked development dependencies from the repository root:

```bash
npm ci
```

Regenerate the checked-in installed runtime after changing runtime source, then run the complete repository checks:

```bash
npm run build:runtime
npm run check:runtime
npm test
npm run validate
```

`npm test` runs every `tests/*.test.mjs` file using `node:test`, including generated-runtime consistency and real generic-installer isolation smoke. `npm run validate` explicitly selects `--repository` and checks all schema definitions, both localized legacy examples, their reports and on-disk state, and workflow fixtures. Run the complete commands before finishing changes to scripts, schemas, skills, templates, or fixtures. Use `npm run smoke:installed` for a standalone installer smoke and `node scripts/build-runtime.mjs --check /path/to/runtime` to check an installed artifact directory.

During development, run a focused test file or test-name pattern:

```bash
node --test tests/v31.test.mjs
node --test --test-name-pattern="migration" tests/migration.test.mjs
```

Validate repository or project state explicitly, or select individual artifacts with the source CLI. In an installed skill, replace `scripts/validate.mjs` and `scripts/author-project.mjs` with `<setup-skill>/assets/runtime/validate.mjs` and `<setup-skill>/assets/runtime/author-project.mjs`:

```bash
node scripts/validate.mjs --help
node scripts/validate.mjs --repository
node scripts/validate.mjs --project-root /path/to/writing-project
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --scope-snapshot /path/to/scope.json
node scripts/validate.mjs --inventory-snapshot /path/to/inventory.json
node scripts/validate.mjs --convergence-status /path/to/.author-toolkit/project.json
node scripts/validate.mjs --convergence-gate /path/to/.author-toolkit/project.json
node scripts/validate.mjs --requested-pass /path/to/pass.json
node scripts/validate.mjs --revision-execution /path/to/execution.json
node scripts/validate.mjs --manuscript-reconciliation /path/to/reconciliation.json
node scripts/validate.mjs --no-edit-skip /path/to/skip.json
node scripts/validate.mjs --review-group /path/to/review-group.json
node scripts/validate.mjs --semantic-attestation /path/to/attestation.json
node scripts/validate.mjs --convergence-evaluation /path/to/evaluation.json
node scripts/validate.mjs --report /path/to/report.md
node scripts/validate.mjs --workflow-fixture /path/to/fixture.json
node scripts/author-project.mjs --help
node scripts/author-project.mjs timestamp
node scripts/author-project.mjs init --project-root /path/to/writing-project --language en
node scripts/author-project.mjs read --project-root /path/to/writing-project [--full]
node scripts/author-project.mjs status --project-root /path/to/writing-project [--full]
node scripts/author-project.mjs reconcile-cycle --project-root /path/to/writing-project [--input /path/to/direction.json]
node scripts/author-project.mjs reconcile-manuscript --project-root /path/to/writing-project --input /path/to/reconciliation.json
node scripts/author-project.mjs prepare-draft-revision-execution --project-root /path/to/writing-project --input /path/to/independent-preparation.json
node scripts/author-project.mjs verify-draft-revision-execution --project-root /path/to/writing-project --input /path/to/independent-verification.json
node scripts/author-project.mjs prepare-revision-execution --project-root /path/to/writing-project --input /path/to/preparation.json
node scripts/author-project.mjs verify-revision-execution --project-root /path/to/writing-project --input /path/to/verification.json
node scripts/author-project.mjs evaluate-cycle --project-root /path/to/writing-project --input /path/to/evaluation-request.json
node scripts/author-project.mjs evaluate-draft --project-root /path/to/writing-project --input /path/to/independent-evaluation.json
node scripts/author-project.mjs complete-cycle --project-root /path/to/writing-project --input /path/to/completion.json
```

The help output is the source for scope-snapshot, inventory-snapshot, cycle-artifact, requested-pass, revision-execution, manuscript-reconciliation, no-edit-skip, review-group, semantic-attestation, convergence-evaluation, convergence-status, convergence-gate, creation-batch, commit-journal, story-state, coverage, review-job, and reader-state option names. No-argument invocation prints help without inspecting implicit state. `--repository` and `--project-root` are explicit, mutually exclusive modes and cannot be combined with individual checks. Project-root validation verifies all deployed shared-reference hashes before using the real schema validators, manifest, registered files, and tracker. Other options may be repeated or combined where documented. Manifest validation also checks registered files and the tracker; for v3 with `current_scope`, it checks current manuscript hashes. V3.2 also checks full-manuscript evidence and reports scope identity. Convergence status is read-only and exits successfully for a valid query with any outcome; convergence gate succeeds only for current `satisfied` evidence. Validation failures exit 1, and argument or usage errors exit with status 2.

Migrate an actual writing project only when migration is intended:

```bash
node /path/to/author-toolkit/scripts/migrate-v32.mjs --project-root /path/to/writing-project
```

For development, run migration against a disposable copy. Migration converts v2, v3.0, and v3.1 directly to v3.2 and creates `.author-toolkit/migrations/<stamp>-v2-v3_2/`, `<stamp>-v3_0-v3_2/`, or `<stamp>-v3_1-v3_2/`. It preserves manuscripts, reports, findings, approvals, scopes, sessions, staging, backups, batches, journals, and pending work. It creates no satisfied evaluation or active cycle and saves only provable scope and inventory snapshots. Repeating it against valid v3.2 state is idempotent and creates no snapshot. The older `scripts/migrate-v3.mjs` command and `migrateProjectToV3` export are compatibility wrappers. See `docs/MIGRATION-3.2.md` for the migration matrix and legacy recovery requirements.

## Testing strategy and conventions

Tests use `node:assert/strict`, shared readers in `tests/helpers.mjs`, and copied fixtures for writes. Filesystem and CLI tests create temporary directories beneath `.test-output/` and register cleanup with `t.after`. `.test-output/` and `tests/.tmp/` are ignored; keep temporary projects and generated output out of commits. There is no configured coverage threshold.

The suite divides into these contract areas:

- Finding, report, manifest, path, tracker, and Markdown contracts, including v2 compatibility, v3.0/v3.1 scopes, v3.2 scope fingerprints and immutable snapshots, approvals, evidence semantics, creation operations, and additive upgrades.
- Creation state, interrupted commits, coverage reuse, review jobs, fresh-reader ordering, on-disk files, scope currency, full-manuscript validation, migration, and validator CLI behavior.
- Installed-runtime tests execute checked-in bundles outside the repository, detect stale and missing generated artifacts, and run the real generic installer in an isolated temporary deployment. `tests/project-cli-responses.test.mjs` uses the installed project CLI and disposable projects to cover manuscript-only initialization, fresh empty evidence, idempotent reentry, unified response envelopes and exit statuses, compact and full reads, decision counts, active-cycle recovery summaries, damaged state, and reference conflicts. The installed smoke covers no-argument help, real schema success and failure, usage errors, and missing or mismatched shared references without development dependencies; it is packaging and CLI evidence, not host or creative-quality evidence.
- `tests/evidence-time.test.mjs` uses fixed clocks, real disposable-project evidence, and installed CLIs to cover the timestamp response and every current artifact family's timestamp fields at current time, the 60-second boundary, and beyond-tolerance rejection with concrete paths and no filename inference. Runtime lock writes are observed through a public transition checkpoint.
- Migration CLI tests in `tests/migration-v32.test.mjs` cover direct v2, v3.0, and v3.1 sources, exact legacy scope confirmation, byte-preserved evidence, idempotent v3.2 reruns, pending and staging decisions, batch-bound legacy rejection approval checks against missing and mismatched decisions, interrupted journal and write recovery through public operations, full-manuscript `revise-draft` routing, and the absence of inferred current-draft revision convergence or cycle ownership.
- Current-draft convergence cycle bootstrap, staged-to-committed batch-reference replacement, optimistic resume, pending-action boundaries, historical scope references, parallel-change blocking, independent-process transition/preparation/evaluation/completion serialization and lock timeouts, read-only inspection, and truthful gate results through public project operations and disposable projects. No-edit tests establish real satisfied evidence, baseline inheritance and local-unit reuse, all three outcomes, evidence invalidation, deferred and dismissed decisions, fresh reader-chain completeness, and post-decision reevaluation. Request-driven tests cover verified edited executions, approved-unexecuted batches, output tampering, historical base preservation, cumulative change sets, accepted review-finding rework, eligible evidence reuse, no-change requests, independent request completion, and target invalidation without treating fixture reports as creative-quality evidence. Ordinary creation/increment tests cover satisfied entry, one multi-chapter commit, blocked continuation, full-target recovery and local-unit reuse, verified review rework, missing or mistyped approvals and commit evidence, batch/action/input binding, pure insertion before and between retained paths, retained reorder consistency, and rejected no-change completion. Draft and whole-book boundary tests cover independent narrowed evaluation, satisfied baseline preservation, protected-entry blocking, active-cycle recovery, read-only whole-book work, and verified revise-fiction execution through completion. Independent draft execution tests cover real accepted edits, prepared and verified `cycle_id: null` records, duplicate preparation and verification, changed inputs, output tampering, resolved-finding recovery, subsequent cycle starts, and active-cycle rejection. External reconciliation tests use real manuscript changes and public operations before and during cycles, covering additions, modifications, deletions, retained reorder, exact import decisions, story-state checks, preserved starting snapshots, historical evidence invalidation, empty-manuscript blocking, nonempty full-draft recovery, and reconciliation/story-state evidence-graph invalidation.
- Additional evaluator regression tests cover latest independent outcome precedence, requested-pass identity invalidation after satisfaction, prepared-check extension, exact revision-approval reuse rejection, full Story Bible, structure, and final-review evidence, request→fiction and draft→fiction execution, blocked post-execution strategy switches, and retained insertion, deletion, and reorder behavior. Shared evaluator test helpers own CLI input and tracker fixture writes.
- Cross-file recovery tests in `tests/cycle-recovery.test.mjs` drive public operations with real disk writes and checkpoint exceptions plus actual completed-file state injection. They cover interruptions before and after manifest and cycle updates, publication, evaluation, execution, external reconciliation, completed history, final manifest, and active removal; request, draft, fiction, creation, bootstrap, external-import, and independent-evaluation paths; pending/scope/operation/artifact identity mismatches; immutable-history preservation; and owner-verified abandoned-lock recovery. Checkpoints inject failures at the public-operation seam, not internal evaluator substitutes or mocked filesystem results.
- Skill metadata, cross-file orchestration, setup and standalone deployment mirrors, controlled terminology, and special-character approval paths.
- Chinese prose, AI-writing, line-editing, review, nonfiction, and length-configuration instructions. These are static language-support contracts, not model-run accuracy evidence.
- `scale.test.mjs` inventories a synthetic million-Chinese-character manuscript and verifies creation-state exclusion and new-file detection. It is not creative-quality evidence.

`npm test` and `npm run validate` verify repository contracts only. They do not prove host skill discovery, installation, a complete creative run in Claude Code or Kimi Code, or creative quality. `docs/VALIDATION.md` separates current 3.2 checks and limited host evidence from historical 3.1, 3.0, and 2.0 records and unverified paths. Update that record when performing real host validation, and never present fixture reports or scale fixtures as model-run evidence.

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
- Use `creation-import` and the public `reconcile-manuscript` operation to reconcile author-added, modified, deleted, or reordered manuscript files. Require exact inventory, story-state, and tracker decision evidence. Report changed input and reconcile it with the author instead of silently refreshing scope hashes, story state, or stale evidence. Reconciliation writes no manuscript and never bypasses backup, restore, approval, or input-hash checks.
- Use public `reconcile-cycle` for interrupted cross-file cycle state. Without a direction it must remain read-only. A repair direction requires exact cycle and operation IDs, rechecked scope/artifact paths and hashes, and the existing lock and expected-revision protections. `discard-interrupted-operation` must refuse and preserve the operation handle whenever artifact identity/hash damage or another remaining consistency contradiction would destroy the usable recovery path. Pending action never supplies write, publication, restore, or completion approval. Remove a leftover lock only after its recorded PID is confirmed not running and its exact owner token is supplied.
- Preserve historical reports, findings, approvals, completed cycles, scopes, inventories, evaluations, verified executions, creation batches, commit journals, backups, and migration snapshots. Record later decisions in living state, the tracker, and new reports rather than rewriting history.
- Handoffs contain paths, IDs, approved decision summaries, and next actions, not manuscript excerpts, Story Bible content, draft baselines, reader-state content, or full findings.
- Git is optional for writing projects and is not a substitute for toolkit backups or commit journals. Setup and migration do not alter Git configuration or `.gitignore`.
- The repository has no authentication or secret-management flow. Host credentials and plugin permissions are external to these scripts.

## Distribution and deployment

The repository and its checked-in generated runtime are installed directly as source; there is no separate release package. Installation methods are documented in `README.md`:

- Claude Code uses the `shengchen1998/author-toolkit` marketplace and the `author-toolkit@author-toolkit` plugin.
- Kimi Code uses `/plugins install https://github.com/shengchen1998/author-toolkit`, followed by `/reload` or a new session.
- Generic project or user installation uses `npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli`, with optional `-g`.

Updates are manual through the host or `npx skills check` and `npx skills update`. No CI/CD or publishing workflow is present.

The generic installer deploys each skill directory, including the setup skill's shared-reference payload, self-contained validation and project-operation runtime, initialization templates, and each independent skill's local contracts. The installed runtime bundles Ajv and all transitive dependencies, resolves schemas from `skills/setup-author-toolkit/assets/references/`, and requires no repository checkout or project-local dependency installation. The repository-root `references/` directory is the canonical development source, not a runtime dependency of installed skills. Keep it byte-identical to `skills/setup-author-toolkit/assets/references/`; keep the four setup initialization templates byte-identical to `skills/author-project/assets/`; keep standalone finding schemas and the `prose-mechanics` AI-writing adapter mirrors synchronized as well. Setup deploys the shared payload into each writing project but does not copy runtime code or dependencies into that project. `tests/deployment.test.mjs` checks the reference and initialization-template mirrors, repository-root reference independence, project-local reference coverage, and safe replacement rules; `tests/packaged-runtime.test.mjs` and `tests/installed-runtime.test.mjs` check generated artifacts and real installation behavior.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `shengchen1998/author-toolkit` using `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.
