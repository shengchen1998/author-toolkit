# Validation Status

- **Release:** 3.1.0
- **Working tree status:** Repository checks and a limited Kimi Code host run passed with noted process timeouts; other hosts and creative-quality validation not exercised
- **Date:** 2026-11-10

The repository-level checks below cover schemas, validators,
shared-state and creation contracts, review jobs, scale fixtures, and
command-line behavior. They do not verify a complete creative run in a host or
the quality of generated fiction.

## 3.1 working-tree validation

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | `npm test`: 162 tests passed, 0 failed. Coverage includes rejection of older manifest versions, v3.1 manifests, creation batches and interrupted commits, story state, coverage reuse, layered review jobs, request-only passage coverage, fresh-reader ordering, review-brief agreement with the tracker, artifact CLI exit statuses, execution receipts and scoped status, incremental-revision and request-driven current-draft revision convergence contracts, controlled terminology, self-contained installed validation, status, project-digest, and character-range CLIs, setup and standalone deployment contracts, installed shared-reference resolution without project deployment, Chinese language-support contracts, and all 16 skill contracts. |
| Default validation | **Pass** | `npm run validate`: 13 checks passed, 0 failures, including every shipped schema, both v3.1 examples, their reports and on-disk state. |
| Finding ID and tracker tools | **Pass (static and installed)** | Finding tests cover a 35-ID block after existing `STANDARD-001`–`009`, duplicate and conflicting report IDs, historical-report conflicts, escaped Chinese paths, preservation of existing decisions, idempotent reimports, and tracker preservation on failure. The installed setup CLI allocates `STRUCT-005`–`006` in a v3.1 project with external runtime packages blocked. No concurrent-process reservation or host-driven review run is claimed. |
| Project digest CLI | **Pass (static and installed)** | Generated a navigation cache of at most 30 lines with scope, pending action, finding counts, plan/session/report pointers, next action, and pointers to mechanical status and validation commands. Tests cover timestamp ordering across report directories even when modification times disagree, modification-time fallback for undated files, normalized paths, bounded long fields, preservation of an existing cache on invalid manifests, exclusion from manuscript inventory, and generation through an isolated installed setup CLI with external runtime packages blocked. No host resume or measured context reduction is claimed. |
| Character-range helper | **Pass (static and installed)** | Eight tests cover 1-based inclusive ranges in Chinese text, single-character shorthand, Unicode code-point counting, CRLF and leading-BOM handling, trailing-newline line numbering, JSON output, reversed and out-of-range rejection, project-relative path enforcement, missing files, default project root, and help output. The installed setup CLI resolves a Chinese range with external runtime packages blocked. No manifest, shared-state, or manuscript-content validation is claimed. |
| Execution receipts and status CLI | **Pass (static and installed)** | Eight tests cover edit and restore joins, scope filtering, legacy indexes without `executions`, approval and backup identity, pre-write input-hash agreement, action-specific output hashes, duplicate and orphan records, project-wide stale findings, scope-filtered blocked pending actions, and bounded text with complete JSON and explicit `evidence.operation_specific: not_evaluated`. The installed status CLI passes with external runtime packages blocked. Missing receipts remain valid intermediate state and are reported as unverified; no automatic historical backfill, operation-specific evidence evaluation, or host-driven creative run is claimed. |
| Million-character structural scale check | **Pass** | `tests/scale.test.mjs` inventoried 250 synthetic Chinese chapters containing one million repeated Han characters plus headings, verified creation-state exclusion, and detected a newly added manuscript file. This is not generated-text quality evidence. |
| Chinese language-support contracts | **Pass (static)** | Seventeen tests cover all 19 Chinese prose procedures, the 12-category local Chinese AI-writing catalog, mixed-language execution and provenance limits, Chinese fiction line editing, Chinese standards review, and Chinese length configuration. English report headings, tracker columns, and Markdown status values remain unchanged. These tests validate instruction and routing contracts, not model-run detection accuracy or creative quality. |
| Kimi Code actual run | **Pass (limited scope)** | Kimi Code 2.4.1 with `--skills-dir` completed setup, creation baseline and planning, staged drafting, an atomically published first chapter and commit finalization, `revise-draft` intake, and a return `writing-plan` for batch-002. Final host checks passed for the committed artifacts, intake, and return plan. Several 600-second processes timed out after writing valid artifacts and required subsequent invocations; completed invocations also emitted a post-run `runtime.not_found` checkpoint warning. No full nine-operation revision, `revise-fiction` run, or layered model review is claimed. |
| `revise-increment` actual run | **Pass (routing only)** | Kimi Code 2.4.0 with `--skills-dir` received `/skill:revise-increment` in an empty disposable project, read the new `SKILL.md`, stopped at the missing manifest, and displayed the exact setup command. This does not verify registered skill discovery, creative quality, or a complete five-chapter-plus-one pass reaching current-draft revision convergence. Static contracts separately cover change-set selection, unchanged-unit reuse, full-target current-scope review, and revision after review findings. |
| `revise-request` actual run | **Not exercised** | No host run or complete request-driven pass is claimed. Static contracts cover the full-manuscript base-scope precondition, request set and work set, default request-only passage review, optional full-target current-scope review, request-only coverage versus full-file coverage, review-brief agreement with the tracker, and the rule that request completion does not reverify current-draft revision convergence. |
| Claude Code actual run | **Not exercised** | The 3.1 working tree has not been exercised through Claude Code host runs. |
| Generic installation and 16-skill discovery | **Pass (local source and deployment copy)** | The previous local-source installation check installed all 16 skills into a disposable project. The current deployment regression validates a v3.1 example with five checks, allocates finding IDs, generates a project digest, returns scoped execution status, and resolves a Chinese character range through an isolated installed setup copy with external runtime-package imports and requires blocked. Shared-reference and standalone-contract mirrors also pass. This verifies the installed payload and CLI behavior, not a new host-driven setup or creative run. |
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
| Kimi Code actual run | **Not exercised** | The 3.0 working tree has not been exercised through Kimi Code host runs. |
| Claude Code actual run | **Not exercised** | The 3.0 working tree has not been exercised through Claude Code host runs. |
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

This historical record separates repository checks from actual host runs. A
pass covers only the commands and modes listed below. Pending means the check
has not finished; blocked means the standard runtime path could not start.

### Historical release checks

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | Node.js 22.23.4: 55 tests passed, 0 failed; default validation passed 19 checks with 0 failures; project template validation passed 3 checks with 0 failures. |
| Kimi Code actual run | **Pass (limited scope)** | Kimi Code 2.4.1 completed all six independent skill invocations, valid English and Chinese structure reruns, and the English nine-stage revision workflow with explicit limited audit and revision scope. Desktop user-entry and native plugin installation remain unverified. |
| Claude Code actual run | **Blocked** | Claude Code 2.1.316 starts, but invocation returns `Not logged in`. No Claude manuscript run or native marketplace installation was completed. `plugin validate .` passed with the pre-existing missing-icon warning. |
| Six independent skill regression | **Pass** | One real Kimi invocation per independent skill passed its requested scope and stopping point. This does not cover every persona, audit, or mode. |
| Generic skills installation | **Pass** | `skills` 1.7.5 discovered 12 skills and installed all 12 into isolated `.claude/skills/` and `.agents/skills/` project directories. Project `list` reported all 12 as tracked. |

### Historical host and tool versions

| Host or tool | Tested version | Status |
| --- | --- | --- |
| Claude Code | 2.1.316 | **Static validation passed; runtime blocked by authentication** |
| Kimi Code | 2.4.1 | **Actual CLI calls and limited nine-stage workflow passed; Desktop entry and native plugin installation remain unverified** |
| Node.js | 22.23.4 | **Pass** |
| `skills` installer | 1.7.5 | **Local discovery and project installation passed** |

### Historical independent skill regression

All rows used Kimi Code 2.4.1 with the repository loaded through `--skills-dir`.

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

- Claude authentication, native marketplace installation, skill invocation, report generation, and resume remain unverified.
- Kimi native plugin installation through `/plugins install` and the Desktop `/skill:revise-fiction` user entry remain unverified. The Desktop attempt stopped without bypassing the editor guard.
- The completed English workflow used explicit limited audit and revision scope. It did not run every prose audit on every file, approve every finding as resolved, exercise AI rewrite, or restore a backup.
- Chinese structure and handoff behavior passed, but the remaining Chinese stages and `partial` / `skipped` language-rule behavior were not exercised.
- Native plugin update behavior and remote GitHub `skills check` / `skills update` remain unverified.
- Multi-book projects and other hosts are outside the supported 2.0 workflow. They are support boundaries, not pending test cases.

Temporary validation projects live under `.test-output/` and are not release
artifacts. The example manuscripts and prewritten reports under `examples/` are
fixtures, not evidence of a model run.
