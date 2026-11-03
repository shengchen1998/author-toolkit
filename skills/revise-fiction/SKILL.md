---
name: revise-fiction
description: Coordinate an existing fiction manuscript through the nine-stage revision workflow, including mid-workflow resume.
disable-model-invocation: true
---

# Revise Fiction

Coordinate one main revision workflow for a fiction book. The existing writing skills supply their own craft rules; this skill supplies sequence, state, approvals, and persistence.

## Start or resume

1. Locate `.author-toolkit/project.json` at the selected project root. If it is absent, display the host command for `setup-author-toolkit` and stop. Use `/author-toolkit:setup-author-toolkit` in Claude Code or `/skill:author-toolkit:setup-author-toolkit` in Kimi Code; bare forms are `/setup-author-toolkit` and `/skill:setup-author-toolkit` respectively. Setup is user-invoked.
2. Resolve each required callee in the current skill listing only when needed. Copy the actual registered name into the Skill call: both `story-structure` and `author-toolkit:story-structure` forms are valid when that is how the host lists them. Apply the same rule to every callee. Never invent an alias or call a user-invoked entry through the Skill tool.
3. Invoke `author-project` in separate calls with `read`, `validate`, and `status`. Read the registered audit tracker, relevant session notes, and current revision plan. Report validation errors or missing required inputs before editing.
4. Select the author-requested stage or the earliest stale or unfinished stage. Read only the relevant stage section in [`references/stage-gates.md`](references/stage-gates.md). Mid-workflow entry is allowed when its listed inputs exist; earlier stages retain their evidence-based status.
5. Invoke `author-project` with `set-stage` to mark the selected stage `in_progress`. Run the stage work and stop at its gate. Set it to `awaiting_author`, record the next action, and wait for the author to start the next pass or stage.

The nine stages are `intake`, `story-bible`, `structure`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`, and `final-review`.

## Stage routing

For each diagnostic callee, supply the workflow stage, destination report path, named input list and versions, BCP 47 language, and tracker path. Require the callee to use `../../references/workflow-reporting.md` and finding v2 for this run. The callee returns findings and proposed creative changes; the orchestrator retains approval, state advancement, and backup control.

| Stage | Delegation |
|---|---|
| `intake` | `author-project` plus manuscript inventory |
| `story-bible` | `fiction-workshop`, Story Bible Building |
| `structure` | `story-structure`, Audit mode |
| `characters` | `character-archetypes` plus `fiction-workshop` Character Consultant and Continuity Tracker |
| `revision-plan` | Consolidate accepted findings using the local plan template |
| `chapter-revision` | `fiction-workshop`, scoped to the approved plan |
| `prose` | `prose-mechanics`, audits 1-18 in their upstream order; AI-Isms stays in the next stage |
| `ai-cleanup` | Follow [`../../references/avoid-ai-writing-adapter.md`](../../references/avoid-ai-writing-adapter.md) |
| `final-review` | `author-review` |

Honor each callee's stopping point. A pause within a stage ends with the same stage `awaiting_author`; the author can then continue that stage. Do not chain stages automatically.

## Approval and backup gate

For manuscript changes, first obtain a diagnosis or proposal without editing. Show the affected paths and intended change batch, then obtain explicit author approval. After approval and before the first write, invoke `author-project` with `record-backup` for every affected file. Apply only the approved batch after every backup succeeds.

A restore requires separate explicit approval naming the backup ID and files. Invoke `author-project` with `record-restore`, which preserves the current text in a safety backup before restoring. Never treat an earlier edit approval as restore approval.

Story Bible changes require author confirmation and remain consistent with the approved plan. `author-project` handles state and backups only; it never supplies creative content.

## Reports and state

Before writing any report or changing finding status, read [`references/state-and-findings.md`](references/state-and-findings.md). Every workflow report is Markdown with exactly one JSON envelope conforming to `../../references/report-schema-v2.json` and the finding v2 schema it references. Use the schema's actual properties and validate with the provided script when available. Never label a v1 payload as v2.

Use finding statuses `open`, `resolved`, `deferred`, `dismissed`, and `stale` in the living audit tracker. Preserve historical reports, continue finding IDs across reruns, and propagate stale state by dependency rather than invalidating every earlier audit after a sentence edit.

Prose is blocked while structure is unstable. The author may explicitly override that block for a named scope; record the approval, reason, scope, and unresolved structural state in the manifest and tracker. The override does not mark structure current.

## Workflow boundary

Keep one `main` workflow per book project. Standalone calls to the underlying skills leave the manifest, main tracker, and main reports untouched. If the author explicitly asks to incorporate standalone work, resume at the matching stage, register the source artifact, convert its findings to v2 with stable IDs, and record the author's incorporation decision.

When the author requests a session transfer, or a long task must stop because context is exhausted, invoke `author-handoff` with `create` after the manifest, tracker, and session note are current. This adds at most two nesting levels: `revise-fiction` to `author-handoff` to `author-project`. The handoff contains pointers and unresolved decisions, not manuscript or Story Bible content.

Finish each invocation with the current stage, stale stages, report or artifact paths, approvals or backups used, unresolved questions, and the exact next action. Every completed pass ends `awaiting_author`; the stage becomes `complete` only when the author starts the next stage and its gate still holds.
