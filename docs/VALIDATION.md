# Validation Status

- **Release:** 2.0.0
- **Overall status:** Partial
- **Tested revision:** `b5e15ef` plus the uncommitted 2.0 working tree
- **Test date:** 2026-11-03

This page separates repository checks from actual host runs. A pass covers only the commands and modes listed below. Pending means the check has not finished; blocked means the standard runtime path could not start.

## Release checks

| Check | Status | Evidence |
| --- | --- | --- |
| Protocol tests | **Pass** | Node.js 22.23.4: 55 tests passed, 0 failed; default validation passed 19 checks with 0 failures; project template validation passed 3 checks with 0 failures. |
| Kimi Code actual run | **Pass (limited scope)** | Kimi Code 2.4.1 completed all six independent skill invocations, valid English and Chinese structure reruns, and the English nine-stage revision workflow with explicit limited audit and revision scope. Desktop user-entry and native plugin installation remain unverified. |
| Claude Code actual run | **Blocked** | Claude Code 2.1.316 starts, but invocation returns `Not logged in`. No Claude manuscript run or native marketplace installation was completed. `plugin validate .` passed with the pre-existing missing-icon warning. |
| Six independent skill regression | **Pass** | One real Kimi invocation per independent skill passed its requested scope and stopping point. This does not cover every persona, audit, or mode. |
| Generic skills installation | **Pass** | `skills` 1.7.5 discovered 12 skills and installed all 12 into isolated `.claude/skills/` and `.agents/skills/` project directories. Project `list` reported all 12 as tracked. |

## Host and tool versions

| Host or tool | Tested version | Status |
| --- | --- | --- |
| Claude Code | 2.1.316 | **Static validation passed; runtime blocked by authentication** |
| Kimi Code | 2.4.1 | **Actual CLI calls and limited nine-stage workflow passed; Desktop entry and native plugin installation remain unverified** |
| Node.js | 22.23.4 | **Pass** |
| `skills` installer | 1.7.5 | **Local discovery and project installation passed** |

## Independent skill regression

All rows used Kimi Code 2.4.1 with the repository loaded through `--skills-dir`.

| Skill | Status | Exercised scope |
| --- | --- | --- |
| `fiction-workshop` | **Pass** | Developmental Editor on Chapter 2, followed by an explicit v1 JSON output recheck. Other personas were not exercised. |
| `character-archetypes` | **Pass** | Analyzer for Ning Lin with Hero + Ruler recommendation and Want/Need/Wound/Lie comparison. Audit, Conformance, and Ensemble were not exercised. |
| `story-structure` | **Pass** | Standalone Midpoint placement and content audit with finding v1 JSON. The separate workflow rerun covered the full three-chapter structure audit. |
| `narrative-nonfiction` | **Pass** | Content Editor on a supplied teaching excerpt, including source-verification limits. Other modes were not exercised. |
| `prose-mechanics` | **Pass** | Standalone Echoes audit on Chapter 1 with finding v1 JSON and no manuscript changes. The other 18 audits were not exercised. |
| `avoid-ai-writing` | **Pass** | Detect-only audit of a short English sample. Rewrite mode was not exercised. |

## Workflow evidence

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

## Unverified limitations

- Claude authentication, native marketplace installation, skill invocation, report generation, and resume remain unverified.
- Kimi native plugin installation through `/plugins install` and the Desktop `/skill:revise-fiction` user entry remain unverified. The Desktop attempt stopped without bypassing the editor guard.
- The completed English workflow used explicit limited audit and revision scope. It did not run every prose audit on every file, approve every finding as resolved, exercise AI rewrite, or restore a backup.
- Chinese structure and handoff behavior passed, but the remaining Chinese stages and `partial` / `skipped` language-rule behavior were not exercised.
- Native plugin update behavior and remote GitHub `skills check` / `skills update` remain unverified.
- Multi-book projects and other hosts are outside the supported 2.0 workflow. They are support boundaries, not pending test cases.

Temporary validation projects live under `.test-output/` and are not release artifacts. The example manuscripts and prewritten reports under `examples/` are fixtures, not evidence of a model run.
