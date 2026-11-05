# Creation state and recovery

Load this reference for artifact writes, context fingerprints, commits, restores, imports, or damaged-state recovery.

## Registered layout

Resolve `paths.creation` against the project root. The default is `.author-toolkit/creation/`:

- `state/current.md`: living current summary and records;
- `state/chapters/`: living chapter records keyed to source hashes;
- `state/volumes/`: living volume or story-phase summaries keyed to child hashes;
- `batches/<batch-id>.json`: immutable accepted creation batches;
- `batches/<commit-id>.json`: recovery journals;
- `staging/<batch-id>/`: proposed, rejected, and superseded text outside the manuscript inventory.

Story state uses `story-state-schema.json`, batches use `creation-batch-schema.json`, and commits use `creation-commit-schema.json`. Validate the JSON envelope and human-readable story-state Markdown after every write. The registered creation root is operational and excluded from manuscript inventory.

## State identity

Accepted manuscript text establishes observed facts. Story Bible records author intent. Keep both visible when they conflict and request a decision rather than silently overwriting either source. Draft baseline remains revision evidence; creation state supports continuation.

Before the first accepted manuscript, `state/current.md` uses `scope_id: null` and may cite the Story Bible and approved planning artifacts as sources. Chapter and volume records require an actual scope ID. The first successful commit replaces the null current-state scope with the confirmed manuscript scope.

Each chapter record names its source path and SHA-256, summary, and fact, character, timeline, object, thread, and constraint records. Volume and current records reference child artifacts by path and hash. A changed child invalidates its ancestors until they are rebuilt. Structural validation proves identity and currency, not semantic extraction completeness; reread relevant original passages for consequential decisions.

Rejected staging text never enters story state or manuscript scope. Preserve it until the author explicitly requests cleanup. Require exactly one current chapter-review `creation-rejection` approval for the exact rejected batch paths, with the same batch ID and dependency-fingerprint binding plus the unchanged starting `scope_fingerprint`; manuscript acceptance, scope acceptance, and other approval types do not authorize rejection. Keep one active batch per book.

## Context and dependency fingerprints

Use chapter categories, record text, open threads, adjacent chapters, and host text search to select context. Do not require a vector store or another service. Record the selected inputs in the batch plan.

Compute the fingerprint as SHA-256 over UTF-8 `JSON.stringify` of an object with keys `plan`, `context`, and `files` in that order:

- `plan` is the exact plan summary;
- `context` is the array of `{path, version, version_type}` objects with keys in that order, sorted by `path`, then `version_type`, then `version`;
- `files` is the array of `{path, action, input_sha256}` objects with keys in that order, sorted by `path`.

On resume, recompute the fingerprint from current dependencies. Unrelated manuscript membership changes require a refreshed publication scope but do not invalidate the staged content. A changed included dependency requires re-review or a new approved plan.

## Commit protocol

1. Read the manifest, current scope, accepted batch, and approvals immediately before publication. Require exact operation, paths, input versions, and acceptance. Require exactly one current `creation-manuscript` approval and one current `creation-scope` approval, each with `status: "approved"` and `operation: "chapter-review"`; duplicate or missing types do not authorize publication. The manuscript approval names exactly the batch paths. The scope approval names the complete target paths in author-confirmed reading order and matches the snapshot's confirmation decision ID. In each approval reason, record whitespace-separated `batch_id=<batch-id>`, `dependency_fingerprint=<fingerprint>`, and `scope_fingerprint=<fingerprint>` tokens alongside the human explanation. Recompute the dependency fingerprint from the batch summary, context, actions, and input hashes, and the scope fingerprint from the complete ordered target paths and output hashes. Both approvals must match all three values; an approval for another batch or input version cannot be reused.
2. Recompute the dependency fingerprint and each existing target's hash. Require every create target to remain absent and every modify, delete, or reorder target to match its accepted input. Stop on any mismatch.
3. Invoke `author-project` with `record-backup` for every existing target. New files record expected absence instead of an invented original backup.
4. Write `<paths.creation>/batches/<commit-id>.json` with `status: "in_progress"` and every planned file action, input/output hash, backup ID, and `pending` status. Write the batch and journal atomically before touching manuscript text.
5. For each file, write staged content to a temporary sibling, verify its SHA-256, and rename it atomically. Apply only the accepted action. Mark it `written`, reread it, and then mark `verified`. Update the journal after every transition.
6. Publish accepted story-state differences and the resulting scope. The author's acceptance supplies the exact ordered paths and hashes; actual output must match them. Validate manuscript inventory, state artifacts, tracker, and scope.
7. Mark the journal `committed`, freeze the accepted batch with `status: "committed"`, update pending action and session state, and propagate evidence changes. Link the existing batch and journal to the active cycle through `transition-cycle`, with the complete expanded current scope as target and `revise-increment` as the required strategy. The cycle references their artifact identities and derived change set; it does not duplicate or execute their file-transition protocol. An ordinary creation cycle accepts one committed batch, including an explicitly approved multi-chapter batch, and cannot link another commit or return to `writing-plan` before completion. Local units can be reused only through the coverage rules. Full-book synthesis from the old scope is no longer current for the expanded book.

Multiple files are coordinated by the journal, not claimed as a single filesystem transaction. If the process stops, compare each actual target with its accepted input and output hashes. Report completed, pending, and unexpected actions. Leave `status: "interrupted"` and require an explicit author decision to continue or restore; never silently roll back. Do not link an interrupted or unverified journal as a completed creation publication.

## Restore and repair

A restore approval is distinct from creation and edit approvals. Name the commit and exact files. Preserve current content in a safety backup, including files created by the batch. Restore modified originals, move created files into that safety backup before removing them from the manuscript, reverse accepted state differences, and establish a newly confirmed scope. Record restorations in the backup index and batch history.

For missing, malformed, or stale story state, rebuild only affected chapter records and their ancestors from actual text and immutable batches. Mark extracted differences proposed and obtain author confirmation before restoring the state to active use.

## Evidence changes

New membership, deletion, or reading-order changes require a new scope. Text-only changes can retain the scope ID with new input hashes and, on v3.2, a new scope fingerprint after author confirmation. Creating new paths before or between retained paths changes their absolute indexes but does not by itself create retained-path reorder transitions. Compare retained paths by relative order. An actual change to that relative order requires exact `reorder` actions with matching input and output hashes, plus author confirmation of the complete target reading order; insertion must not weaken that check. Preserve historical reports and their original scope IDs, scope snapshots, and inventory snapshots. Use coverage units and the living coverage index under the registered reports path to compose current local coverage. Recompute every affected whole-book synthesis; milestone and chapter summaries never substitute for final reading of actual manuscript text.
