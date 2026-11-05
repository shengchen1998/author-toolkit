---
name: revise-fiction
description: Coordinate an existing fiction manuscript through nine evidence-gated revision operations, including mid-workflow resume.
disable-model-invocation: true
---

# Revise Fiction

Coordinate full-book revision from the shared project evidence. This skill supplies sequence, gates, approvals, and persistence; the writing skills supply their craft rules. Use the controlled workflow terminology in `<project-root>/.author-toolkit/references/terminology.md` for shared terms and exact contract values.

## Start or resume

1. Locate `.author-toolkit/project.json` at the selected project root. If it is absent or has `schema_version: "2.0.0"`, display the host command for `setup-author-toolkit` and stop. Use `/author-toolkit:setup-author-toolkit` in Claude Code or `/skill:author-toolkit:setup-author-toolkit` in Kimi Code; bare forms are `/setup-author-toolkit` and `/skill:setup-author-toolkit` respectively. Setup is user-invoked and upgrades v2 projects without resetting their artifacts.
2. Resolve each required callee in the current skill listing only when needed. Copy the actual registered name into the Skill call. Never invent an alias or call a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. These calls check the deployed shared references. If they report missing or mismatched files, display the setup command from step 1 and stop; a valid manifest does not prove reference deployment. Read the shared tracker, relevant session notes, current revision plan, current scope, pending action, and evidence for the requested operation. Report validation errors or missing required inputs before editing.
4. Select the author-requested operation or the earliest operation whose required evidence is missing, incomplete, or stale in the sequence below. Read only the relevant section in [`references/stage-gates.md`](references/stage-gates.md). A report from another orchestration skill is evidence when its operation, scope, input versions, subchecks, and dependencies satisfy the same gate; no report v2 `stage` value alone establishes completion.
5. Invoke `author-project` with `set-pending` to record the operation as `in_progress`. Run the operation and stop at its gate. Record it as `awaiting_author` or `blocked`, update the tracker and session note, and wait for the author. Do not chain operations automatically.

The full-book sequence is `intake`, `story-bible`, `structure`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `final-review`.

## Author interaction

At every author gate, follow the [Author decision loop](references/state-and-findings.md#author-decision-loop) before presenting questions or approval requests. This applies within an operation as well as at its final gate.

## Operation routing

For each diagnostic callee, supply the operation identifier, destination report path, named input list and versions, `scope_id`, BCP 47 language, and tracker path. Require the callee to use `<project-root>/.author-toolkit/references/workflow-reporting.md` and finding v2 for this run, and supply `../revise-fiction/references/state-and-findings.md` resolved from the callee's installed skill directory as the shared state reference. The callee returns findings and proposed creative changes; the orchestrator retains approval, pending-action writes, and backup control.

| Operation | Delegation |
|---|---|
| `intake` | `author-project` plus manuscript inventory |
| `story-bible` | `fiction-workshop`, Story Bible Building |
| `structure` | `story-structure`, Audit mode over the full selected scope |
| `characters` | `character-archetypes` plus `fiction-workshop` Character Consultant and Continuity Tracker |
| `revision-plan` | Consolidate accepted findings using the shared plan template |
| `chapter-revision` | `fiction-workshop`, scoped to the approved plan |
| `prose` | `prose-mechanics`, audits 1-18 in their upstream order; AI-Isms stays in the next operation |
| `ai-cleanup` | Follow `<project-root>/.author-toolkit/references/avoid-ai-writing-adapter.md` |
| `final-review` | `author-review` with `review_mode=final` |

Honor each callee's stopping point. A pause within an operation ends with the same operation `awaiting_author`; the author can then continue it.

## Approval and backup gate

For manuscript changes, first obtain a diagnosis or proposal without editing. Show the affected paths and intended change batch, then obtain explicit author approval. Record the approval in the shared tracker with its `approval_id`, operation, `scope_id`, paths, and reason. After approval and before the first write, invoke `author-project` with `record-backup` for every affected file and that `approval_id`. Apply only the approved batch after every backup succeeds.

A restore requires separate explicit approval naming the backup ID and files. Invoke `author-project` with `record-restore`, which preserves the current text in a safety backup before restoring. Never treat an earlier edit approval as restore approval.

Story Bible changes require author confirmation and remain consistent with the approved plan. `author-project` handles state and backups only; it never supplies creative content.

## Reports and shared state

Before writing any report or changing finding or approval status, read [`references/state-and-findings.md`](references/state-and-findings.md). Every workflow report is Markdown with exactly one JSON envelope conforming to `<project-root>/.author-toolkit/references/report-schema-v2.json` and the finding v2 schema it references. Record `scope_id`, `operation_coverage`, and applicable `subchecks` in `engine.notes`.

Prose is blocked while structure is unstable. The author may explicitly override that block for a named scope; record an approved `prose-override` in the shared tracker with the reason, scope, input versions, and unresolved structural state. The override does not make the structure evidence current. A later structural change exhausts it.

## Strategy switching and evidence reuse

`write-fiction`, `revise-draft`, `revise-increment`, and `revise-request` read and write this same project state. At a stable operation gate, follow the [current-draft convergence cycle rules](../author-project/references/operations.md#current-draft-convergence-cycle). Read-only whole-book work remains available during an active cycle; manuscript changes must follow its exact recovery position and cannot start a parallel cycle. Show the required or selected strategy's exact command and wait. Switching never resets scope, reports, findings, approvals, staged drafts, or backups. Display any pending approval, interrupted write, or commit before starting new work; never resume it merely because another entry was invoked.

Reuse full local coverage units only when source-report identity, operation, paths and hashes, subchecks, and dependencies still match. Keep the unit's original scope for provenance and use the target scope for the composed index and synthesis. Reevaluate every applicable whole-book synthesis after membership, reading-order, text, or dependency changes; unchanged local units do not keep that synthesis current. A current-scope diagnostic does not satisfy the full-book structure gate merely because it exists, and a current-scope review does not satisfy final review. Creation evidence does not satisfy `chapter-revision`. When the author wants current-draft revision convergence after incremental creation, show the `revise-increment` command. When the current scope is a full-manuscript scope that has reached current-draft revision convergence and the author wants a new revision of existing content, show the `revise-request` command.

Standalone calls to the underlying skills leave shared state untouched. If the author explicitly asks to incorporate standalone work, register the source artifact, convert its findings to v2 with stable IDs, and record the author's decision in the shared project.

When the author requests a session transfer, or a long task must stop because context is exhausted, invoke `author-handoff` with `create` after the manifest, tracker, and session note are current. The handoff contains pointers and unresolved decisions, not manuscript or baseline content.

Finish each invocation with the current operation and scope, stale evidence, report or artifact paths, approvals or backups used, unresolved questions, and the exact next action.
