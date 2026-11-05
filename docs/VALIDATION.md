# Validation Status

- **Release:** 3.1.0
- **Working tree status:** Repository checks and a limited Kimi Code host run passed with noted process timeouts; other hosts and creative-quality validation not exercised
- **Date:** 2026-11-06

The repository-level checks below cover schemas, validators, migration,
shared-state and creation contracts, review jobs, scale fixtures, and
command-line behavior. They do not verify a complete creative run in a host or
the quality of generated fiction.

## 3.2 cycle working-tree validation

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | `npm test`: 185 tests passed, 0 failed. This includes 10 no-edit full-manuscript tests and 12 current-draft convergence cycle tests over real disposable-project disk state, plus all prior contract regressions. Coverage includes actual satisfied evaluation and completion, baseline inheritance, eligible local-unit reuse, all three outcomes, evidence invalidation, deferred and dismissed decisions, fresh reader-chain completeness, closed artifact contracts, unsafe-path rejection, and independent-process transition, evaluation, and completion serialization. |
| Default validation | **Pass** | `npm run validate`: 19 checks passed, 0 failures, including every shipped schema, both legacy v2 examples, their reports and on-disk state, and workflow fixtures. |
| Executable lifecycle operations | **Pass (disposable projects)** | Real `scripts/author-project.mjs` calls exercised bootstrap and ordinary satisfied starts, content-checked transitions, evaluation, completion, and read-only status and gate queries. Eight independent processes concurrently transitioned one `expected_revision`: exactly one succeeded and seven returned `cycle-revision-conflict`. Independent evaluation and completion races also produced exactly one winner each. A preexisting lock directory produced `cycle-transition-lock-timeout` without changing active state. No strategy was invoked automatically. |
| Full evaluator and ordinary satisfied starts | **Pass (disposable projects)** | Actual report, coverage, no-edit, three-perspective review, reader-state, tracker, and semantic-attestation artifacts produced `satisfied` through the public evaluator, followed by explicit author completion. Completion changed the tracker hash, generated a new satisfied evaluation, preserved the old evaluation, and completed the cycle. Open findings and degraded coverage produced `not_satisfied`; missing attestations and changed artifact hashes produced `indeterminate`. Non-satisfied completion was rejected without recording a decision. These are contract fixtures, not evidence of actual host reading or creative quality. |
| Host lifecycle run | **Not exercised** | No Claude Code or Kimi Code host run is claimed for cycle routing, bootstrap creation, revision, evaluation, or completion. The executable facade and disposable-project tests are repository contract evidence, not creative-quality or complete host-run evidence. |

## 3.1 working-tree validation

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | `npm test`: 137 tests passed, 0 failed. Coverage includes v2 compatibility, v3.0/v3.1 manifests and upgrades, creation batches and interrupted commits, story state, coverage reuse, layered review jobs, fresh-reader ordering, artifact CLI exit statuses, incremental-revision and request-driven current-draft revision convergence contracts, controlled terminology, setup and standalone deployment contracts, existing-project shared-reference checks, Chinese language-support contracts, and all 16 skill contracts. |
| Default validation | **Pass** | `npm run validate`: 19 checks passed, 0 failures, including every shipped schema, both legacy v2 examples, their reports and on-disk state, and workflow fixtures. |
| Real migration CLI | **Pass** | Copied projects exercised direct v2-to-v3.1 migration and additive v3.0-to-v3.1 upgrade through the real CLI, including preserved snapshots, unchanged manuscript/tracker/evidence content, and idempotent v3.1 reruns with `snapshot: null`. |
| Million-character structural scale check | **Pass** | `tests/scale.test.mjs` inventoried 250 synthetic Chinese chapters containing one million repeated Han characters plus headings, verified creation-state exclusion, and detected a newly added manuscript file. This is not generated-text quality evidence. |
| Chinese language-support contracts | **Pass (static)** | Seventeen tests cover all 19 Chinese prose procedures, the 12-category local Chinese AI-writing catalog, mixed-language execution and provenance limits, Chinese fiction line editing, Chinese standards review, and Chinese length configuration. English report headings, tracker columns, and Markdown status values remain unchanged. These tests validate instruction and routing contracts, not model-run detection accuracy or creative quality. |
| Kimi Code actual run | **Pass (limited scope)** | Kimi Code 2.4.1 with `--skills-dir` completed setup, creation baseline and planning, staged drafting, an atomically published first chapter and commit finalization, `revise-draft` intake, and a return `writing-plan` for batch-002. Final host checks passed for the committed artifacts, intake, and return plan. Several 600-second processes timed out after writing valid artifacts and required subsequent invocations; completed invocations also emitted a post-run `runtime.not_found` checkpoint warning. No full nine-operation revision, `revise-fiction` run, or layered model review is claimed. |
| `revise-increment` actual run | **Pass (routing only)** | Kimi Code 2.4.0 with `--skills-dir` received `/skill:revise-increment` in an empty disposable project, read the new `SKILL.md`, stopped at the missing manifest, and displayed the exact setup command. This does not verify registered skill discovery, creative quality, or a complete five-chapter-plus-one pass reaching current-draft revision convergence. Static contracts separately cover change-set selection, unchanged-unit reuse, full-target current-scope review, and revision after review findings. |
| `revise-request` actual run | **Not exercised** | No host run or complete request-driven pass reaching current-draft revision convergence is claimed. Static contracts cover the full-manuscript base-scope precondition, request set and work set, resume after request-induced stale evidence, unchanged-unit reuse, full-target current-scope review, and separate request-completion and current-draft revision convergence states. |
| Claude Code actual run | **Not exercised** | The 3.1 working tree has not been exercised through Claude Code host runs. |
| Generic installation and 16-skill discovery | **Pass (local source and deployment copy)** | `npx skills@latest add <local-repository> -a claude-code -a kimi-code-cli --copy -y` installed all 16 skills into a disposable project. The installed setup payload contained all 18 shared reference files, including 14 JSON Schemas. After the documented setup copy into `.author-toolkit/references/`, all 14 schemas compiled and the project template validated as a manifest; all five standalone finding schemas also compiled. A scan of installed skills checked 43 relative Markdown links with 0 failures. This verifies installation and reference deployment, not a host-driven setup or creative run. |
| Million-character creative quality | **Not exercised** | No real million-character creation, chunked final review, or human quality evaluation is claimed. |

Historical 3.0 and 2.0 evidence does not verify `write-fiction`, v3.1 creation
artifacts, coverage reuse, review jobs, the new migration paths, or 3.1 host
entry points.

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
