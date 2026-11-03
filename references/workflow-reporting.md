# Workflow Reporting

Use this mode only when `revise-fiction` or `revise-draft` explicitly supplies an operation, confirmed `scope_id`, report path, versioned input list, language, and shared tracker path. Standalone calls retain finding v1 and their existing prose output behavior.

## Diagnostic boundary

Read the manifest, named inputs, and shared tracker. Apply the calling skill's diagnostic method within the requested scope and language. Record full, partial, or skipped coverage instead of presenting it as completed. Return findings and proposed creative changes without advancing `pending_action` or creating an approval. Switching between the two calling strategies does not change the scope or authorize a pending write.

Before writing a report or changing finding status, read [`../skills/revise-fiction/references/state-and-findings.md`](../skills/revise-fiction/references/state-and-findings.md). It is the single source for the report envelope, stable IDs, tracker statuses, stale propagation, and shared evidence writes. Use the supplied report path and validate the result when the toolkit validator is available. Keep the report bound to the supplied scope ID and input versions.

Deliver the report as context and stop for author review through the [Author decision loop](../skills/revise-fiction/references/state-and-findings.md#author-decision-loop) in the calling orchestrator. For an approved manuscript batch, return the affected file list to the calling `revise-fiction` or `revise-draft` orchestrator and wait for its backup confirmation. That orchestrator owns approvals, backups, and restoration through `author-project`; the diagnostic skill applies only the approved targeted edits after confirmation that every backup succeeded and the input hashes still match.
