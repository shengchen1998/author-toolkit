# Validation Status

- **Release:** 3.1.0
- **Working tree status:** Repository checks passed; Codex and creative-quality validation not exercised
- **Date:** 2026-11-12

The repository-level checks below cover schemas, validators,
shared-state and creation contracts, review jobs, scale fixtures, and
command-line behavior. They do not verify a complete creative run in a host or
the quality of generated fiction.

## 3.1 working-tree validation

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | `npm test`: 243 tests passed, 0 failed. Coverage includes rejection of older manifest versions, v3.1 manifests, bounded manifest projections and failure diagnostics, existing-project initialization with missing-index creation and recorded-unverified diagnosis, legacy long pending-artifact lists, indexed pending artifacts, creation batches and interrupted commits, story state, coverage reuse, layered review jobs, request-only passage coverage, fresh-reader ordering, review-brief agreement with the tracker, artifact CLI exit statuses, execution receipts and scoped status, fail-closed backups and evidence reconciliation, deterministic complete manuscript writes with generated evidence and receipts, read-only backup index inspection, incremental-revision and request-driven current-draft revision convergence contracts, controlled terminology, self-contained installed doctor, initialization, preflight and its check alias, manifest-projection, pending-action, manuscript-write, validation, status, project-digest, and character-range CLIs, setup and standalone deployment contracts, installed shared-reference resolution without project deployment, host-independent semantic procedure bodies, Codex `$name` command routing, Chinese language-support contracts, and all 16 skill contracts. |
| Default validation | **Pass** | `npm run validate`: 13 checks passed, 0 failures, including every shipped schema, both v3.1 examples, their reports and on-disk state. |
| Finding ID and tracker tools | **Pass (static and installed)** | Finding tests cover a 35-ID block after existing `STANDARD-001`–`009`, duplicate and conflicting report IDs, historical-report conflicts, escaped Chinese paths, preservation of existing decisions, idempotent reimports, and tracker preservation on failure. The installed setup CLI allocates `STRUCT-005`–`006` in a v3.1 project with external runtime packages blocked. No concurrent-process reservation or host-driven review run is claimed. |
| Project digest CLI | **Pass (static and installed)** | Generated a navigation cache of at most 30 lines with a UTC generation timestamp, explicit generation-time project-validation result and preflight-reuse warning, scope, pending action, finding counts, current-scope execution evidence, plan/session/report pointers, next action, and pointers to mechanical status and validation commands. Generation shares preflight's complete project inspection, including current manuscript hashes, tracker, and backup-index execution evidence; it does not claim strict execution or current-draft revision convergence. Tests cover 94 current-scope unverified approvals alongside a withheld `revise-request` next action and a `revise-draft` reconciliation route, a failing strict execution gate, exclusion of historical-scope approvals from that count, timestamp ordering across report directories even when modification times disagree, modification-time fallback for undated files, review-brief exclusion when its modification time is newer than a report, normalized paths, bounded long fields, preservation of an existing cache on invalid manifests, invalid backup indexes, and stale scope hashes, exclusion from manuscript inventory, and generation through an isolated installed setup CLI with external runtime packages blocked. No host resume or measured context reduction is claimed. |
| Bounded read and pending artifact index | **Pass (static and installed)** | The manifest projection preserves current-scope hashes while bounding displayed long fields and artifact pointers. Failed validation emits only failed checks, at most 12 errors per check, omitted-error counts, and operation-grouped unverified-approval summaries; `--details` retains complete failed checks. A regression fixture covers 94 unverified approvals without returning an unvalidated scope projection from ordinary `read`. Explicit `preflight --diagnose` returns a separate `recorded_unverified` projection, bounds 115 legacy pending-artifact pointers to two, preserves the failed exit status, and reports unreadable index counts without hiding the validation failure. Its read-only execution recovery audit discovers and previews project-local evidence, reports reconcilable and unsupported counts, and requires an author decision when the current evidence set has no reconciliation path; regression cases cover zero evidence and partially recoverable approvals without writing receipts. `set-pending` keeps at most eight inline paths, writes longer unique lists to the linked pending artifact index, and rejects missing artifacts and identity mismatches before a successful write. Legacy long inline lists remain valid and unchanged. The installed projection and diagnosis run with external runtime packages blocked. No host-driven setup or measured context reduction is claimed. |
| Character-range helper | **Pass (static and installed)** | Eight tests cover 1-based inclusive ranges in Chinese text, single-character shorthand, Unicode code-point counting, CRLF and leading-BOM handling, trailing-newline line numbering, JSON output, reversed and out-of-range rejection, project-relative path enforcement, missing files, default project root, and help output. The installed setup CLI resolves a Chinese range with external runtime packages blocked. No manifest, shared-state, or manuscript-content validation is claimed. |
| Execution receipts and status CLI | **Pass (static and installed)** | Thirteen receipt/status tests cover edit and restore joins, scope filtering, legacy indexes without `executions`, approval and backup identity, pre-write input-hash agreement, action-specific output hashes, duplicate and orphan records, project-wide stale findings, scope-filtered blocked pending actions, and bounded operation-grouped text with interleaved first/last approval IDs, complete JSON, and explicit `evidence.operation_specific: not_evaluated`. Read-only `check-index --explain` tests cover backup and approval operation mismatches, valid legacy and current indexes, argument rejection, and preservation of the tracker and index. Thirteen write-operation tests cover legacy-debt and create-only gates, rejection of approval operation, scope, and path mismatches without index changes, exact backup hashes, evidence-linked receipts, rejected or tampered evidence, idempotent preview-first reconciliation, and create-only pending state. `complete-write` tests cover exact multi-action content publication, generated immutable evidence and receipts, preflight input/content/backup/path failures, journal validation and transitions, idempotent completion, real injected evidence/index interruptions, create-only recovery, and verified partial-publication recovery without republishing. The installed status, write, and index-inspection CLI entry points pass with external runtime packages blocked. Missing receipts remain valid intermediate state for inspection but block new edit batches; reconciliation accepts only preserved post-write evidence. Index inspection does not migrate history or choose repair values. No inference from current manuscript, operation-specific evidence evaluation, or host-driven creative run is claimed. |
| Million-character structural scale check | **Pass** | `tests/scale.test.mjs` inventoried 250 synthetic Chinese chapters containing one million repeated Han characters plus headings, verified creation-state exclusion, and detected a newly added manuscript file. This is not generated-text quality evidence. |
| Chinese language-support contracts | **Pass (static)** | Seventeen tests cover all 19 Chinese prose procedures, the 12-category local Chinese AI-writing catalog, mixed-language execution and provenance limits, Chinese fiction line editing, Chinese standards review, and Chinese length configuration. English report headings, tracker columns, and Markdown status values remain unchanged. These tests validate instruction and routing contracts, not model-run detection accuracy or creative quality. |
| Setup host command visibility | **Pass (static)** | Contract tests require Codex `$name` commands with unqualified registered names and explicit author confirmation in the `$` autocomplete. They reject inference from model-facing registry metadata or displayed command strings. No current-host setup, command registration, or observation of host command visibility is claimed. |
| Bounded setup and navigation | **Pass (static)** | Contract tests require shallow setup discovery, manifest-driven path checks, and pointer, targeted-read, or count-based navigation without complete session or backup file listings. The always-loaded project template retains language, explicit-entry routing, and approval invariants while deferring detailed strategy routing to `ask-author` and write procedures to `author-project`. Digest generation may still scan directories internally. No host-driven setup or measured context reduction is claimed. |
| Setup payload doctor | **Pass (static and installed)** | The generated payload manifest records SHA-256 hashes for the setup skill's regular payload files, including CLI internals. Tests cover source and isolated installed summaries, missing files, changed content, invalid manifest shapes, optional project-entry mismatches, separately classified payload and entry failures with explicit exit reasons, and bounded failure-only output with external runtime packages blocked. No host-driven setup or project-state validation is claimed. |
| Setup entry-file installation | **Pass (static and installed)** | `install-entry-files.mjs` is the only entry-file replacement implementation; setup no longer supplies a manual shell alternative. Temporary-directory tests cover creation from an unrelated cwd, idempotent preservation of inode identity, replacement of regular files, incorrect and dangling symlinks, directory rejection before either target changes, argument errors, and payload verification. The installed copy runs without external runtime packages; setup's following `check --diagnose` is the final payload, entry-file, and project-state verification without a second doctor call. No host-driven setup is claimed. |
| Setup preflight | **Pass (static and installed)** | Fifteen tests cover bounded ordinary summaries, current-scope selection, explicit strict execution, the equivalent check alias, optional digest generation, separately classified payload and entry-file results, installed-payload and project-validation failures, malformed manifests, and argument errors. Entry-file mismatches continue project inspection but exit 1 and preserve an existing cache instead of generating a digest. Read-only cache checks cover absent and recognized snapshots, legacy caches missing generation and execution fields, unsafe next-action fields, unreadable caches, and validation or strict-gate failure without reproducing recorded routes or rewriting history. Diagnosis tests cover recorded-unverified scope hashes in JSON and bounded text, current-file hash verification when scope validation passes and its absence when scope validation fails, pending artifacts and repeated failures, exact backup/approval operation differences, unreadable pending-artifact indexes, unchanged project state, read-only execution-recovery audits with and without usable evidence, and rejection of `--diagnose --digest`. The installed CLI shares the individual validation, status, projection, reconciliation-preview, and index-inspection functions and runs diagnosis with external runtime packages blocked. No host-driven setup, historical repair, or operation-specific evidence evaluation is claimed. |
| Existing-project initialization | **Pass (static and installed)** | `initialize.mjs` is setup's only existing-project initialization implementation; `author-project` has no corresponding operation or model-executed alternative. Four tests cover missing-index creation and idempotent preservation, registered-path and recorded-unverified projection during invalid execution evidence, missing and unsupported manifests without state creation, the shared backup write lock, and argument errors. The installed copy runs with external runtime packages blocked. Contract tests also require installed-document semantic procedures executed directly by the agent, no host-specific invocation in skill bodies, and no duplicate model-executed deterministic state transitions. No host-driven setup or measured context reduction is claimed. |
| `revise-request` actual run | **Not exercised** | No host run or complete request-driven pass is claimed. Static contracts cover the full-manuscript base-scope precondition, request set and work set, default request-only passage review, optional full-target current-scope review, request-only coverage versus full-file coverage, review-brief agreement with the tracker, and the rule that request completion does not reverify current-draft revision convergence. |
| Codex actual run | **Not exercised** | Static tests require `$name` commands in setup, routing, strategy-switching, and handoff instructions, but no current-host setup or creative run is claimed. |
| Generic installation and 16-skill discovery | **Pass (local source and deployment copy)** | The previous local-source installation check installed all 16 skills into a disposable project. The current deployment regression runs the payload doctor and preflight, validates a v3.1 example with five checks, allocates finding IDs, generates a project digest, returns scoped execution status, and resolves a Chinese character range through an isolated installed setup copy with external runtime-package imports and requires blocked. An unverified approval also makes installed `status --require-execution` and `check --require-execution` exit 1 while ordinary `check` remains successful; the failed preflight gate withholds the stale cache's recorded next action. Shared-reference and standalone-contract mirrors also pass. This verifies the installed payload and CLI behavior, not a new host-driven setup or creative run. |
| Million-character creative quality | **Not exercised** | No real million-character creation, chunked final review, or human quality evaluation is claimed. |
| Flow diagram PNG | **Not regenerated** | `docs/five-entry-flows.mmd` no longer contains the old manifest-upgrade branch. The PNG still needs regeneration with Mermaid CLI; the available renderer was blocked by the current execution-permission policy. |

Historical 3.0 and 2.0 evidence does not verify current `write-fiction`, v3.1 creation
artifacts, coverage reuse, review jobs, or 3.1 host entry points. Older manifest
versions and conversion behavior are not supported by the current runtime.

## Historical 3.0 working-tree validation

- **Historical release:** 3.0.0
- **Historical test date:** 2026-11-03

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | `npm test`: 74 tests passed, 0 failed. Coverage includes v2 compatibility, v3 scopes and pending actions, approvals, evidence reports, legacy ID collisions, single-file and project-root manuscript layouts, operational-file exclusion, special-character approval paths, changed and added manuscript detection, and both revision-skill contracts. |
| Default validation | **Pass** | `npm run validate`: 19 checks passed, 0 failures, including both legacy v2 examples and workflow fixtures. |
| Real migration CLI | **Pass** | A copied Chinese v2 project migrated to v3 with a preserved snapshot. Explicit manifest validation passed 4 checks with 0 failures, including `#scope`; a second migration was idempotent with `snapshot: null`. |
| Generic installation and 13-skill discovery | **Not exercised** | No 3.0 installation or discovery result is claimed. |

Historical 2.0 evidence does not verify the 3.0 shared evidence model,
`revise-draft`, v2-to-v3 migration, or 3.0 host entry points.

## Historical 2.0 validation

The remainder of this page is preserved historical evidence for the 2.0 working
tree. It is not a 3.0 test report.

- **Historical release:** 2.0.0
- **Historical overall status:** Partial
- **Tested revision:** `b5e15ef` plus the uncommitted 2.0 working tree
- **Historical test date:** 2026-11-03

### Historical release checks

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | Node.js 22.23.4: 55 tests passed, 0 failed; default validation passed 19 checks with 0 failures; project template validation passed 3 checks with 0 failures. |
| Generic skills installation | **Pass** | `skills` 1.7.5 discovered 12 skills and installed all 12 into an isolated `.agents/skills/` project directory. Project `list` reported all 12 as tracked. |

### Historical host and tool versions

| Host or tool | Tested version | Status |
| --- | --- | --- |
| Node.js | 22.23.4 | **Pass** |
| `skills` installer | 1.7.5 | **Local discovery and project installation passed** |

### Historical independent skill regression

These historical checks exercised the independent skills in isolation.

| Skill | Status | Exercised scope |
| --- | --- | --- |
| `fiction-workshop` | **Pass** | Developmental Editor on Chapter 2, followed by an explicit v1 JSON output recheck. Other personas were not exercised. |
| `character-archetypes` | **Pass** | Analyzer for Ning Lin with Hero + Ruler recommendation and Want/Need/Wound/Lie comparison. Audit, Conformance, and Ensemble were not exercised. |
| `story-structure` | **Pass** | Standalone Midpoint placement and content audit with finding v1 JSON. The separate workflow rerun covered the full three-chapter structure audit. |
| `narrative-nonfiction` | **Pass** | Content Editor on a supplied teaching excerpt, including source-verification limits. Other modes were not exercised. |
| `prose-mechanics` | **Pass** | Standalone Echoes audit on Chapter 1 with finding v1 JSON and no manuscript changes. The other 18 audits were not exercised. |
| `avoid-ai-writing` | **Pass** | Detect-only audit of a short English sample. Rewrite mode was not exercised. |

### Historical workflow evidence

- The English structure rerun created `reports/structure/2026-11-02T184141Z_structure-v2.md` in the isolated run. It reused `STRUCT-001` through `STRUCT-004`, added `STRUCT-005` through `STRUCT-008`, preserved the fixture report, and left all three manuscript hashes unchanged.
- The Chinese structure rerun created `reports/structure/2026-11-02T191829Z_structure.md`, reused four IDs, added three, and passed manifest, file, tracker, and report validation with unchanged manuscript hashes.
- Three English character reports passed six combined checks. The limited revision plan passed three manifest checks and contains one approved-for-planning batch limited to Chapter 2.
- Backup `20261102T193844Z-chapter-revision-b01` preserved the exact original Chapter 2 hash before the two approved replacements. The resulting diff contains only those replacements, and the revision report plus manifest passed four combined checks.
- The post-edit structure rerun verified `STRUCT-003` as resolved and passed report, manifest, and tracker validation.
- The limited prose run covered only `invented-term-consistency` on Chapter 1 with an explicit author override. Its report and manifest passed four combined checks.
- AI cleanup ran detect-only on Chapter 3 with the complete English catalog. `AI-001` and `AI-002` remained open for author review, and the report plus manifest passed four combined checks.
- Three independent final-review reports produced 22 findings: 10 intent and consistency, 5 writing standards, and 7 fresh reader. All three reports and the manifest passed six combined checks. Their input exclusions were recorded explicitly.
- Affected character and continuity checks were rerun after B01. The final manifest reached `current_stage: complete` only after all nine stages met their limited-scope gates. The two new reports plus the final manifest passed five combined checks.
- The final pointer-only handoff at `.author-toolkit/handoffs/2026-11-02T204648Z_complete.md` had 45 validated path references with 0 missing. A separate Chinese handoff used the registered custom `handoffs/` directory, and a fresh session restored the correct stage and next action.
- Generic project installation used `--copy`; no global skill installation was performed.
- Local-source `check` and `update` reported no project skills to update. Remote GitHub update behavior remains untested.

### Historical unverified limitations

- The completed English workflow used explicit limited audit and revision scope. It did not run every prose audit on every file, approve every finding as resolved, exercise AI rewrite, or restore a backup.
- Chinese structure and handoff behavior passed, but the remaining Chinese stages and `partial` / `skipped` language-rule behavior were not exercised.
- Remote GitHub `skills check` / `skills update` remain unverified.
- Multi-book projects and other hosts are outside the supported 2.0 workflow. They are support boundaries, not pending test cases.

Temporary validation projects live under `.test-output/` and are not release
artifacts. The example manuscripts and prewritten reports under `examples/` are
fixtures, not evidence of a model run.
