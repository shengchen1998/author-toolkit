# Workflow Reporting

Use this mode only when `revise-fiction` explicitly supplies a workflow stage, report path, input list, language, and tracker path. Standalone calls retain finding v1 and their existing prose output behavior.

## Diagnostic boundary

Read the manifest, named inputs, and tracker. Apply the calling skill's diagnostic method within the requested scope and language. Record partial or skipped coverage instead of presenting it as completed. Return findings and proposed creative changes without advancing the workflow or approving them.

Before writing a report or changing finding status, read [`../skills/revise-fiction/references/state-and-findings.md`](../skills/revise-fiction/references/state-and-findings.md). It is the single source for the report envelope, stable IDs, tracker statuses, stale propagation, and state writes. Use the supplied report path and validate the result when the toolkit validator is available.

Deliver the report and stop for author review. For an approved manuscript batch, return the affected file list to `revise-fiction` and wait for its backup confirmation. The orchestrator owns backups and restoration through `author-project`; the diagnostic skill applies only the approved targeted edits after that confirmation.
