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

Rejected staging text never enters story state or manuscript scope. Preserve it until the author explicitly requests cleanup. Keep one active batch per book.

## Context and dependency fingerprints

Use chapter categories, record text, open threads, adjacent chapters, and host text search to select context. Do not require a vector store or another service. Record the selected inputs in the batch plan.

Compute the fingerprint as SHA-256 over UTF-8 `JSON.stringify` of an object with keys `plan`, `context`, and `files` in that order:

- `plan` is the exact plan summary;
- `context` is the array of `{path, version, version_type}` objects with keys in that order, sorted by `path`, then `version_type`, then `version`;
- `files` is the array of `{path, action, input_sha256}` objects with keys in that order, sorted by `path`.

On resume, recompute the fingerprint from current dependencies. Unrelated manuscript membership changes require a refreshed publication scope but do not invalidate the staged content. A changed included dependency requires re-review or a new approved plan.

## Commit protocol

1. Read the manifest, current scope, accepted batch, and approvals immediately before publication. Require exact operation, paths, input versions, and acceptance. Resolve every earlier unverified edit or restore approval through its execution evidence before starting publication.
2. Recompute the dependency fingerprint and each existing target's hash. Require every create target to remain absent and every modify, delete, or reorder target to match its accepted input. Stop on any mismatch.
3. Invoke `author-project` once with `record-backup` for the complete accepted batch, including create targets with null input hashes. Its project-wide gate refuses publication while another unverified approval remains. New files record expected absence instead of an invented original backup.
4. Write `<paths.creation>/batches/<commit-id>.json` with `status: "in_progress"` and every planned file action, input/output hash, backup ID, and `pending` status. Write the batch and journal atomically before touching manuscript text.
5. For each file, write staged content to a temporary sibling, verify its SHA-256, and rename it atomically. Apply only the accepted action. Mark it `written`, reread it, and then mark `verified`. Update the journal after every transition.
6. Publish accepted story-state differences and the resulting scope. The author's acceptance supplies the exact ordered paths and hashes; actual output must match them. Validate manuscript inventory, state artifacts, tracker, and scope.
7. Mark the journal `committed`, freeze the accepted batch with `status: "committed"`, update pending action and session state, and propagate evidence changes. Local units can be reused only through the coverage rules. Full-book synthesis from the old scope is no longer current for the expanded book.
8. Preserve the verified batch and commit as the structured post-write evidence required by `execution-evidence-schema.json`, then invoke `author-project` with `record-execution` for the manuscript edit approval. A create-only batch has no backup IDs; an existing-file batch cites all of its backups. The resulting scope approval is separate and is not an edit execution receipt.

Multiple files are coordinated by the journal, not claimed as a single filesystem transaction. If the process stops, compare each actual target with its accepted input and output hashes. Report completed, pending, and unexpected actions. Leave `status: "interrupted"` and require an explicit author decision to continue or restore; never silently roll back.

## Restore and repair

A restore approval is distinct from creation and edit approvals. Name the commit and exact files. Preserve current content in a safety backup, including files created by the batch. Restore modified originals, move created files into that safety backup before removing them from the manuscript, reverse accepted state differences, and establish a newly confirmed scope. Record restorations in the backup index and batch history.

For missing, malformed, or stale story state, rebuild only affected chapter records and their ancestors from actual text and immutable batches. Mark extracted differences proposed and obtain author confirmation before restoring the state to active use.

## Evidence changes

New membership, deletion, or reading-order changes require a new scope. Text-only changes can retain the scope ID with new input hashes. Preserve historical reports and their original scope IDs. Use coverage units and the living coverage index under the registered reports path to compose current local coverage. Recompute every affected whole-book synthesis; milestone and chapter summaries never substitute for final reading of actual manuscript text.
