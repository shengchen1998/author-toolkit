# Use a one-time greenfield cutover for the 4.0.0 project contract

## Status

Accepted, 2026-11-07. This decision amends the additive multi-version compatibility and project-migration policy in [ADR-0001](0001-current-draft-convergence-cycles.md).

## Context

The 3.x runtime accepted several project manifest generations and retained migration plus legacy-recovery paths. That compatibility produced parallel meanings for schema-valid old evidence and current evidence. The approved 4.0.0 direction instead has no existing author project state to preserve: the sole writing project will be rebuilt from manuscript files. A coherent single contract is more valuable for this release than runtime compatibility.

This is an exceptional constraint, not a new general upgrade policy. Removing migration would be harmful for later authors who do have current projects and immutable evidence to preserve.

## Decision

Author Toolkit 4.0.0 supports only the 4.0.0 project manifest and current shared-artifact forms. It ships no v2, v3.0, v3.1, or v3.2 manifest dispatch, migration command, legacy recovery, or old shared-state import. Old manifests and artifacts fail with `greenfield-initialization-required` and an actionable instruction to create a separate project through manuscript-only initialization. Setup checks this contract before deploying references or making any other project write, and reference validation cannot obscure the old-state diagnosis.

The 4.0.0 project starts with empty operational evidence. It does not inherit findings, approvals, evaluations, current-draft revision convergence claims, or other shared state. Report v2, shared finding v2, standalone finding v1, and the current artifact-family schema versions remain independent contracts and are not renumbered to 4.0.0.

This no-migration decision is a one-time greenfield exception limited to 4.0.0. Every future incompatible release must provide migration by default. A later exception requires its own explicit architecture decision and author-approved specification; maintainers must not cite this release as a standing policy of migration-free incompatible upgrades.

ADR-0001's statements about additive v3.2 state and direct migration from earlier projects are superseded. Its other decisions remain in force: the current-draft convergence lifecycle, immutable evidence and evidence graphs, explicit author decisions and completion, prepared and verified revision execution, coordinated cycle recovery, independent revise-draft evaluation, bootstrap and current-project `creation-import`, empty recovery, and host semantic attestation. Current `creation-import` reconciles manuscript changes inside a 4.0.0 project and is not an old shared-state import.

## Consequences

Old projects remain untouched and require a separate manuscript-only start. Within a 4.0.0 project, historical reports, scopes, inventories, evaluations, executions, backups, journals, and author decisions remain immutable, and current recovery procedures continue to apply. English and Chinese procedures, independent skills, and truthful coverage reporting are unchanged.

The repository removes compatibility-only fixtures and migration guides. Future incompatible work must include migration design, implementation, evidence-preservation tests, and documentation as release requirements rather than optional follow-up work.
