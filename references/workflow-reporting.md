# Workflow Reporting

Use this mode only when `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` explicitly supplies an operation, confirmed `scope_id`, report path, versioned input list, language, and shared tracker path. Standalone calls retain finding v1 and their existing prose output behavior.

## Diagnostic boundary

Read the manifest, named inputs, and shared tracker. Apply the calling skill's diagnostic method within the requested scope and language. Record full, partial, or skipped coverage instead of presenting it as completed. Return findings and proposed creative changes without advancing `pending_action` or creating an approval. Read-only diagnostics remain available during an active current-draft convergence cycle; they do not authorize a parallel manuscript-changing cycle or a pending write. Switching among the five calling strategies at a stable operation gate does not change the scope. Creation operations keep their own artifact identity and never enter report v2 `stage`.

Before writing a report or changing finding status, read the [controlled workflow terminology](terminology.md) and the `state-and-findings.md` reference identified by the calling orchestrator. The terminology defines shared names and boundaries; the state reference is the single source for the report envelope, stable IDs, tracker statuses, stale propagation, and shared evidence writes. Use the supplied report path and validate the result when the toolkit validator is available. Keep the report bound to the supplied scope ID and input versions.

Deliver the report as context and stop for author review through the author decision loop identified by that state reference in the calling orchestrator. For an approved manuscript batch, return the affected file list to the calling `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` orchestrator and wait for its backup confirmation. That orchestrator owns approvals, backups, and restoration through `author-project`; the diagnostic skill applies only the approved targeted edits after confirmation that every backup succeeded and the input hashes still match.
