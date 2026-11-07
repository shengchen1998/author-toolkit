# Validation Status

- **Release:** 4.0.0
- **Date:** 2026-11-07
- **Scope:** Repository contracts, disposable writing projects, generated runtime artifacts, and real generic-installer smoke

The checks below do not prove a complete creative run in Claude Code or Kimi Code, host skill discovery for 4.0.0, editorial judgment, or creative quality. Fixture reports, semantic attestations, and the scale fixture are not model-run evidence.

## 4.0.0 release checks

| Check | Status | Evidence |
| --- | --- | --- |
| Complete repository tests | **Pass** | `npm test`: 421 tests passed, 0 failed. The suite covers the single 4.0.0 manifest, source and isolated installed greenfield rejection, current report/finding v2 and standalone finding v1, current coverage identities, pending and scope commands, typed tracker writes, special-character paths, backup and restore operations, UTC evidence time, dependency exceptions, creation and import lifecycles, empty recovery, independent draft execution, convergence evaluation and completion, cross-file cycle recovery, deployment mirrors, Chinese procedures, and the million-Chinese-character inventory regression. |
| Repository validation | **Pass** | `npm run validate`: 11 checks passed, 0 failures. Explicit `--repository` mode compiled the current schemas and validated both 4.0.0 example manifests, their registered on-disk state, empty trackers and backup indexes, and the English and Chinese handwritten report fixtures. |
| Generated runtime consistency | **Pass** | `npm run check:runtime`: both checked-in self-contained ESM bundles matched a fresh build from source. Old manifest dispatch, migration, workflow fixtures, and legacy recovery are absent from the generated payload. |
| Real generic-installer smoke | **Pass** | `npm run smoke:installed` and the complete test suite ran the real generic installer in an isolated temporary deployment and exercised the installed CLIs without development dependencies. Installed initialization created a 4.0.0 project, pending and scope operations produced current evidence, compact and full reads worked, project validation passed five checks, and usage, schema, missing-reference, and hash-conflict failures returned their documented statuses. |
| Greenfield old-state rejection | **Pass** | `tests/greenfield-400.test.mjs` drove source and isolated installed `init` against v2, v3.0, v3.1, and v3.2 manifests. Every case returned `greenfield-initialization-required`, named manuscript-only initialization in a new project, and preserved the complete old directory byte-for-byte. Source `read`, `status`, and project validation returned the same actionable diagnosis before missing-reference diagnostics. |
| Current artifact boundary | **Pass** | Legacy schema-only report v2 and coverage forms failed with the greenfield next action. Current report v2 with scope and requested-pass identities passed. Current coverage units with source-report hashes and indexes with scope, pass, and unit hashes passed; a non-null synthesis requires its hash, while null synthesis remains valid without one. Standalone finding v1 and the other artifact-family `1.0.0` contracts were not renumbered or removed. |
| Current lifecycle regressions | **Pass** | Existing public-operation tests continued to exercise creation commits, `creation-import`, bootstrap and ordinary cycles, immutable history, independent `cycle_id: null` work, revision preparation and verification, external reconciliation, empty recovery, author decisions, semantic attestations, current-draft revision convergence, explicit completion, and read-only or directed cycle recovery. No compatibility-only migration, workflow, or legacy-recovery fixtures remain. |
| Language and scale regressions | **Pass** | English and Chinese manuscript and report fixtures, Chinese prose and AI-associated-text procedures, operational exclusions, single-file manuscript roots, special-character paths, and the synthetic million-character inventory all retained their checks. Reports still distinguish `full`, `partial`, and `skipped` coverage truthfully. |
| Architecture and release metadata | **Pass** | All four release metadata files, both lockfile root versions, the neutral template, and `project-schema-v4.json` identify 4.0.0. ADR-0002 records the one-time greenfield exception and requires migration by default for future incompatible releases; ADR-0001 retains its lifecycle and evidence architecture with an amendment pointer. |

## Unexercised paths

No 4.0.0 host-driven creative workflow, complete host evaluation, native plugin installation, or creative-quality review was performed for this cutover. Those paths require separate host acceptance and must not be inferred from these repository and installation results.
