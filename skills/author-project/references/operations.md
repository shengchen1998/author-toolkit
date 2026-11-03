# Project operations

## Paths and manifest identity

Resolve the project root before reading or writing. The canonical manifest is `.author-toolkit/project.json` beneath that root. Treat a file as an author-toolkit manifest only when it has `schema_version: "2.0.0"`, `project_type`, `manuscript_root`, `paths`, and `workflow`.

Keep stored paths relative to the project root and use forward slashes. Resolve them against the root when reading. Reject absolute paths, backslashes, URI schemes, home paths, and `..` segments. One manifest represents one book and one main `revise-fiction` workflow. A separate book needs its own project root and manifest.

The fixed stage order is `intake`, `story-bible`, `structure`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, `final-review`. The manifest stores these as a nine-item `workflow.stages` array in that order.

Stage statuses are `not_started`, `in_progress`, `awaiting_author`, `complete`, `skipped`, `stale`, and `blocked`. Finding statuses live in the tracker, not in finding v2 or the manifest.

## Initialize

1. Read an existing manifest when present. Validate and return it without resetting stages, artifacts, decisions, overrides, or external backup records.
2. For a new manifest, start with `assets/project-template.json`. Replace both sentinel timestamps with the current UTC timestamp and `und` with the detected or author-supplied BCP 47 language. Use supplied paths and retain defaults for omitted paths.
3. Set `workflow.current_stage` to the requested entry stage or `intake`. Leave every stage `not_started` by default. For an intermediate entry, mark earlier stages `complete` only when their gate evidence is present, `skipped` when the author explicitly bypassed them, or `stale` with a reason when their currency is unknown. File existence alone does not establish completion.
4. Write the manifest once, then validate it. If validation fails, report the errors and leave the file available for inspection.
5. Resolve `paths.backups` and create `<paths.backups>/index.json` from `assets/backup-index-template.json` when absent. The default for a new manifest is `.author-toolkit/backups/`; an existing custom directory takes precedence. Keep this operational index outside the manifest because project v2 has no backup properties.

The caller creates directories and empty creative templates. Initialization does not populate manuscript or Story Bible creative content. The next action belongs in the tracker and session note, not in custom manifest fields.

## Read and validate

For every read, parse JSON and check the required fields and additional-property restrictions in [`../../../references/project-schema.json`](../../../references/project-schema.json). Confirm the nine stage names and order, statuses, timestamps, unique artifact paths, `workflow.name: "revise-fiction"`, and safe relative paths.

Also apply the workflow invariants enforced by the installed validator:

- `current_stage` is a stage name or `complete` and points to an actionable stage;
- stages before it are `complete`, `skipped`, or `stale`;
- downstream stages are not active while it points upstream;
- `stale` and `blocked` stages have a `reason`;
- active or completed work downstream of a stale stage has an `override_reason`;
- `current_stage: "complete"` requires every stage to be `complete` or `skipped`.

When the installed toolkit contains `scripts/validate.mjs`, run `node <toolkit-root>/scripts/validate.mjs --manifest <manifest-path>` using the documented Node environment. Report the command, exit status, and diagnostics. Script validation is authoritative. Without the script, perform the checks above and label the result `manual-checks-only`; do not claim full JSON Schema validation.

On read or status operations, report validation failures and missing registered paths. Do not repair them implicitly.

## Status

Return a compact state view containing:

- project root, manifest creation timestamp, project type, language, and manuscript root;
- current stage and its status;
- every stale or blocked stage with its reason;
- the next action recorded in the tracker or latest session note;
- the latest artifact for the current stage;
- validation errors, missing paths, and unresolved approval or restore requirements.

A stage ending its work normally uses `awaiting_author`. The author starts the next stage explicitly. At that later transition, mark the prior stage `complete` only if its gate still holds and set the requested stage `in_progress`. Record the next action in the tracker and session note.

## Write stage state

Read the manifest immediately before each write. Apply only the requested transition and preserve all historical artifact links. Append unique report, plan, handoff, or other artifact paths to the relevant stage's `artifacts`. Include a UTC timestamp in top-level `updated_at` and the changed stage's `updated_at`.

When marking `stale` or `blocked`, retain artifacts and set a specific `reason`. When rerunning a stage, append new artifacts. Never delete an artifact because a finding was resolved or a stage became stale.

Record an author override as a concise `override_reason` on each active or completed downstream stage that needs it. Include the approval timestamp, named scope, unresolved baseline, and reason in that string; put the full decision in the tracker and session note. An override permits the requested downstream pass. It does not make the underlying stage complete or current.

Do not point `current_stage` at a stage whose status is `stale`. To resume stale work, set its status to `in_progress`, update the pointer, and mark or override affected downstream work in the same validated write. If a write fails after the manifest was read, reread before retrying so a concurrent update is not replaced blindly.

## Backup

Before a manuscript edit, resolve the backup root from the manifest's `paths.backups`; use `.author-toolkit/backups/` only when that is the registered path. The orchestrator supplies an approved file list. For each file:

1. Read the complete original text.
2. Write it to `<paths.backups>/<backup-id>/<original-relative-path>`, preserving the relative directory path and exact text.
3. Create `<paths.backups>/<backup-id>/manifest.json` containing the backup ID, UTC timestamp, stage, approval summary, and source/backup path pairs.
4. Append one record to `<paths.backups>/index.json` with the same paths and record manifest path. Add the backup manifest to the current stage's `artifacts` without adding custom fields to project v2.

Use a unique backup ID based on UTC time, stage, and a short scope slug. If it collides, add a suffix. Complete every backup before the first edit to any affected file. A partial backup fails the operation and blocks the edit.

Record the backup ID and paths in the session note. Backups are text snapshots. Do not use Git commits, Git configuration, or `.gitignore` as a substitute.

## Restore

A restore needs separate explicit author approval naming the backup ID and files. Before restoring, back up current versions under a new safety backup ID. Then write the approved snapshot text to the registered source paths.

Append a `restorations` record to the backup index containing the restore timestamp, source backup ID, restored files, approval summary, and safety backup ID. Keep both backup manifests and all records. Record the restore in the current session note, report restored paths, and validate the resulting workflow state after the orchestrator applies stale propagation.
