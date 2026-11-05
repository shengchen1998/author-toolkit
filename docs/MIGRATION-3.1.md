# Migrating to Author Toolkit 3.1

Author Toolkit 3.1.0 adds `write-fiction` and creation state to the shared
project evidence model. `write-fiction`, `revise-fiction`, `revise-draft`,
`revise-increment`, and `revise-request` use one manifest and can switch at
stable operation gates without another migration. All five still require
`setup-author-toolkit` first.

The migration is additive for v3.0 projects. It registers creation storage and
preserves manuscripts, reports, findings, approvals, scopes, pending work, and
backups. A v2 project migrates directly to the same v3.1 terminal state; do not
run a separate historical 3.0 conversion first.

## Upgrade a v3.0 project

Use the existing migration CLI from the 3.1 toolkit:

```bash
node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>
```

Here, `<toolkit-root>` is the Author Toolkit 3.1 installation or repository root,
and `<project-root>` is the writing project containing
`.author-toolkit/project.json`. Run setup first when the writing project has not
been registered.

The v3.0-to-v3.1 upgrade:

- changes `schema_version` to `3.1.0` and updates `updated_at`;
- adds `paths.creation`, defaulting to `.author-toolkit/creation/`;
- updates an existing manifest `$schema` pointer to the v3.1 schema;
- creates `state/chapters/`, `state/volumes/`, `batches/`, and `staging/`
  beneath the registered creation path;
- preserves every existing registered path, current scope, pending action,
  creative artifact, approval, report, and backup.

The original manifest and a migration record are preserved under:

```text
.author-toolkit/migrations/<stamp>-v3_0-v3_1/
```

The upgrade creates operational directories only. It does not write manuscript
chapters, populate the Story Bible, invent story facts, or mark creation
evidence current. Creation baselines and initial story-state differences still
require their author gates.

## Migrate v2 directly to v3.1

The same command now converts a valid v2 manifest directly to v3.1:

```bash
node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>
```

The conversion retains the established v2 migration behavior and adds the v3.1
creation registration:

- removes active `workflow`, `current_stage`, and `stages` state while retaining
  the original manifest in the snapshot;
- inventories the existing manuscript into a `proposed` scope with SHA-256
  hashes, requiring later author confirmation;
- converts unfinished current-stage work to an `awaiting_author` pending action;
- converts old overrides to deferred `LEGACY` approvals rather than current edit
  approval;
- adds `paths.creation` and the creation directory skeleton;
- preserves manuscript, report, and backup contents and their registered paths.

The v2 snapshot and migration record are stored under:

```text
.author-toolkit/migrations/<stamp>-v2-v3/
```

The directory name is retained for compatibility even though the terminal
manifest schema is now 3.1.0. If no manuscript is available, migration fails
before changing project state. Do not treat a failed attempt as a registered
v3.1 project.

## Idempotence and snapshots

Repeating migration against a valid v3.1 project validates and returns the
current state without another conversion, a new snapshot, or duplicate legacy
approvals. The CLI reports `snapshot: null` for this idempotent path.

Migration snapshots preserve historical state; they do not automatically restore
a project. A manuscript restore still needs its own explicit approval and safety
backup. Keep the snapshots, historical reports, findings, approvals, and backups
after migration.

## Shared reference deployment

Running `setup-author-toolkit` after installation or migration deploys the shared runtime contracts from the setup skill's bundled `assets/references/` into `.author-toolkit/references/` beneath the writing project. This fixed operational directory is separate from the seven registered manifest paths and requires no schema or manifest change. Shared workflows resolve terminology, reporting rules, schemas, and AI-writing integration from that project-local directory.

Setup creates missing files and preserves files whose SHA-256 hashes match the packaged payload. A mismatch produces `reference-version-conflict` and blocks shared workflows. Replacing a mismatched file requires separate author approval for that exact file and preservation of the existing file beneath `<paths.backups>/reference-updates/<UTC-stamp>/`. Existing manuscripts, reports, findings, approvals, scopes, and pending work are not changed by reference deployment.

The six independent skills do not require setup for standalone use. Their finding v1 schemas and standalone Chinese AI-writing adapter files are deployed within their own skill directories.

## Evidence and artifact compatibility

Finding v2 and report v2 retain their schema versions and locations. Creation
operations do not expand the closed report v2 `stage` enumeration. Creation
batches, commit journals, story state, coverage units and indexes, review jobs,
and reader state use separate artifact contracts.

Existing reports and findings remain historical evidence. Migration does not
make them current for new creation work. Whole-report reuse still requires
matching operation, scope, input versions, requested coverage and subchecks, and
dependencies. A full local coverage unit can compose into a new scope when its
source identity, operation, paths and hashes, subchecks, and dependencies match;
its original scope remains unchanged for provenance. New chapter membership or
reading order requires a newly confirmed scope; affected whole-book synthesis
must be reevaluated.

The six independent skills retain their standalone behavior and require no
project migration. Their existing finding v1 outputs and creative artifacts are
not converted automatically.

## Older tools and project boundaries

Use the 3.1 toolkit to read and upgrade v3.0 manifests and to work with v3.1
creation paths, operations, and artifacts. Older 3.0 tools do not implement the
new creation contracts and may reject a v3.1 manifest. Keep a snapshot before
using an older tool, and do not remove `paths.creation` or rename the schema
version merely to force compatibility.

A v3.0 manifest remains readable by the 3.1 runtime until the additive upgrade
is confirmed. Switching among creation and revision strategies does not itself
require migration. One manifest still represents one book; a separate book needs
its own project root.

The shipped fixtures under `examples/fiction-revision-en/` and
`examples/fiction-revision-zh/` intentionally remain v2 compatibility inputs.
Run migration only on disposable copies during development, not on the shipped
examples.

See [VALIDATION.md](VALIDATION.md) for current repository-check status and the
separate historical 3.0 and 2.0 records. Repository validation does not
constitute a real host run or evidence of creative quality.
