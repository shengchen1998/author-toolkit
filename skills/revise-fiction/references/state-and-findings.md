# State, findings, and reports

## Report envelope

Use the toolkit root's `references/report-schema-v2.json` as the authoritative envelope contract and resolve its reference to `finding-schema-v2.json`. Read both schemas before writing. Do not infer v2 from the legacy `finding-schema.json`.

Write each report beneath the registered `reports/` path using a stage directory and a unique UTC-stamped filename. Include human-readable context, a `Language coverage` heading, and exactly one fenced `json` block containing one report v2 object. Do not add another JSON block or an appended status log.

Populate the actual v2 fields:

- `skill.name` and `skill.version` identify the executing skill; use its declared version or `unversioned`.
- `language` is the BCP 47 tag for the report's evaluated text. Split reports by file or language when one tag cannot describe mixed coverage truthfully.
- `inputs` lists every manuscript, Story Bible, plan, or prior-report input. Record an available content hash or Git revision, an author-supplied version label, or `version: "untracked"` with `version_type: "untracked"`. Git and hashing tools are optional.
- `engine.name` is exactly `conversational` or `scriptorium`. Record the actual engine version or `unknown`, a truthful `degraded` boolean, and detailed `notes` containing the execution path, fallback, context profile, mode, and degradation. Do not invent compound engine names.
- Under the Markdown `Language coverage` heading, mark each requested rule or category `full`, `partial`, or `skipped` with a reason. Repeat the concise coverage summary in `engine.notes` so the envelope remains self-describing.
- Every finding has an uppercase audit-specific ID prefix and at least three digits, a nonempty `recommendation`, and the narrowest truthful `location.scope`. File scope has no chapter, line, or quote; chapter scope requires a chapter; line scope requires a line; passage scope requires a quote. Do not invent a line or quotation for a broad issue.

Use `confidence: "judgment"` for editorial interpretation and `deterministic` only for direct code-detected evidence. Finding status is tracker state and is not a finding v2 property. Preserve P-tiers and other upstream evidence in existing text fields such as `technique` or in tracker notes, never in additional JSON properties.

Run `node <toolkit-root>/scripts/validate.mjs --report <report-path>` when the installed validator is available and retain its result in the session note. Without it, check required fields, types, enums, conditional location rules, and additional-property restrictions against both schemas and label the result as manual validation. If the v2 schemas are missing or the payload does not conform, mark the stage `blocked` with a reason. Never emit a legacy payload as a substitute.

Historical reports are immutable. Author decisions, stale marks, later locations, and rerun results go into the living audit tracker and new reports. Never edit a prior report in place, even to correct its status.

## Finding identity across reruns

Read the latest prior reports for the same stage, audit, and scope before assigning IDs. Reuse an existing finding ID when the rerun describes the same underlying issue. Match in this order:

1. An upstream stable ID already associated with the finding.
2. The same audit, technique, file, normalized quotation when present, and normalized issue, ignoring line movement.
3. The same audit, technique, file, and issue with a clearly overlapping location after nearby text changed.

If the match is ambiguous, assign a new ID and link the possible predecessor in tracker notes. Never merge two distinct issues to make a report look cleaner. Allocate the next unused number padded to at least three digits for the uppercase audit prefix and never reuse an ID belonging to a different issue.

A finding absent from an equivalent complete rerun becomes `stale` in the tracker, not `resolved`, unless the author confirmed and the new text verifies the fix. When a finding remains present, its new report evidence retains the existing ID and the tracker retains its current decision status. New findings enter the tracker as `open`.

## Living tracker

Use only these finding statuses:

| Status | Meaning |
|---|---|
| `open` | A current finding awaits an author decision or verified resolution |
| `resolved` | The author accepted a resolution and the current text or artifact verifies it |
| `deferred` | The author chose to address it later; record the consequence |
| `dismissed` | The author judged it inapplicable or intentional; record the reason |
| `stale` | Its input or scope changed, or an equivalent rerun no longer observes it without verified resolution |

For each status change, update the tracker row with UTC time, current report path, and reason. Keep historical report paths in the audit-run table and stage `artifacts`. Do not restate full findings in session notes or handoffs; link their IDs and report paths.

## Stale propagation

Apply stale state to the smallest affected dependency set. Keep old reports readable as historical evidence.

| Change | State to mark stale |
|---|---|
| Sentence-level wording, punctuation, or formatting with no fact or structural change | Prose and AI-cleanup results for the affected text, plus final review covering that text. Structure and character audits remain current |
| Copy edits to Story Bible or plan with no meaning change | Final review that used the edited artifact; earlier craft audits remain current |
| Plot event, beat order, chapter order, ending, POV strategy, or other structural fact | Structure, revision plan, affected chapter revision and downstream prose/AI results, and final review. Also stale character audits when the changed beat affects an arc or relationship |
| Character want, need, wound, lie, arc, relationship, voice rule, knowledge state, timeline fact, or world rule | Characters, revision plan, affected chapter revision and downstream prose/AI results, and final review. Also stale structure when the fact changes a structural beat |
| Manuscript files added, removed, replaced, or reordered | Intake and every audit whose scope or reading order changed, plus final review |
| Approved revision-plan action or priority change | Affected unexecuted batches and downstream results, plus final review that used the plan |

A final review depends on all of its inputs, so any later manuscript, Story Bible, or plan change makes its affected coverage stale. Sentence edits still leave structure and character results current unless they change the facts those audits evaluated.

Record each stale `reason` with the changed path and decision or edit batch. Record the earliest stale stage as the next action in the tracker. Do not point `current_stage` at a stale stage. When the author resumes it, set that stage `in_progress`, move the pointer, and mark or explicitly override affected downstream work in the same validated write. A later valid rerun can return that stage to `awaiting_author`; downstream stale stages remain stale until their own dependencies and gates are satisfied.

An author override for unstable prose is scoped to the stated files and structural baseline. Write it to the prose stage's `override_reason`. Any active or completed downstream stage after a stale stage also needs an `override_reason` under the project validator. A later structural change exhausts the override and requires new explicit approval.

## Stage and session writes

At each pass or stage stop, update the manifest through `author-project`, then update the tracker and a short note in the registered `sessions/` directory. Record work performed, approved decisions, report and backup paths, open questions, stale propagation, and the next action. Set the stage to `awaiting_author` whenever the author must continue.

On the author's explicit next-stage request, verify the prior gate and then mark the prior stage `complete` and the requested stage `in_progress`. If the gate no longer holds, mark it `stale` with a reason and explain the required rerun instead. After the author accepts final review, set every stage `complete` or explicitly `skipped` before using `current_stage: "complete"`.

## Main and standalone work

Each book has one manifest with `workflow.name: "revise-fiction"`. Do not create parallel main trackers for different agents or sessions. Read the latest state before writing and include all historical artifacts.

Standalone use of `story-structure`, `character-archetypes`, `fiction-workshop`, `prose-mechanics`, or `avoid-ai-writing` has no effect on main workflow state. Incorporate a standalone artifact only after the author explicitly requests it. Preserve the original output, create a new immutable v2 report for the main workflow, continue finding IDs where identity matches, and record the incorporation decision and source path in the tracker and session note.
