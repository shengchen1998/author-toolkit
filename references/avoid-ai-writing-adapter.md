# Avoid AI Writing adapter

Use this reference for an `ai-cleanup` operation explicitly called by `revise-fiction` or `revise-draft`, and for the AI-Isms audit in `prose-mechanics`. It adapts the upstream `avoid-ai-writing` skill to shared project reports, scope, and approval gates. It is not a skill and does not change standalone `avoid-ai-writing` invocation or output.

## Resolve and scope

Resolve the current skill listing and copy the registered upstream name exactly. Supported registrations are `avoid-ai-writing` and `author-toolkit:avoid-ai-writing`. Invoke that name directly through the Skill tool. During either orchestrated `ai-cleanup` call, do not route through `prose-mechanics`; that would duplicate the pass and add nesting. A direct AI-Isms audit within `prose-mechanics` remains supported.

Use the confirmed shared `current_scope` and its input versions. Determine language and scope for each file before detection. Use a full audit across P0, P1, and P2, with every upstream category and tolerance rule in force. Select the upstream context profile that best fits the text and record it; use `blog` when no more specific profile fits. Quoted examples and other upstream exemptions retain their upstream meaning.

## Language coverage

| Text | Execution | Adapter outcome |
|---|---|---|
| English | Run the complete upstream catalog in `detect` mode | `full` |
| Mixed English and Chinese or another language | Run English rules only on English spans and apply a language-neutral rule only when its meaning is clear in context | `partial` |
| Chinese or another language for which the English catalog does not apply | Skip the unsupported pass and explain that the catalog was not evaluated for that language | `skip` |

In the report's `Language coverage` section, use the workflow labels `full`, `partial`, and `skipped`; the adapter's `skip` outcome maps to `skipped`. Do not transliterate, translate, or mechanically apply English vocabulary lists, sentence-length bands, punctuation limits, or English transition rules to Chinese or other unsupported prose. A `partial` result must name covered spans and unevaluated rules. `skip` and `partial` are coverage outcomes, not clean bills of health. Set `engine.degraded` to `true` when requested coverage is partial or skipped.

## Detect

1. Invoke upstream `avoid-ai-writing` in explicit `detect` mode with the selected profile and full P0/P1/P2 scope.
2. When `scriptorium` is available, run `scriptorium prose prepare ai-isms <chapter>` for code-detected candidates, judge them against the complete upstream catalog, and submit the judged findings through the engine. Without it, perform the complete conversational audit from the upstream rules. The fallback is the full catalog, not a shortened word scan.
3. Convert results to report v2 and finding v2. Use the narrowest truthful location scope and include a nonempty recommendation. Use `confidence: "deterministic"` only for direct code-detected evidence and `judgment` for contextual assessment. Bind the report to the confirmed scope ID and input versions.
4. Map severity exactly: P0 to `warning`, P1 to `suggestion`, P2 to `note`. Preserve the original P-tier in the finding's existing `technique` text or tracker note. Add no extra finding property.
5. Add findings to the shared living tracker with stable IDs and write a new immutable report for each run. Finding status remains in the tracker. Detection does not advance `pending_action` or approve a rewrite.

Set `engine.name` to `scriptorium` when that engine ran and `conversational` otherwise. Record its actual version or `unknown`. Put the upstream skill name and version, profile, full-catalog or limited mode, fallback, language coverage, scope ID, and degradation in `engine.notes`. Set `degraded` truthfully: reduced requested coverage or a failed requested engine is degraded; a deliberately selected full conversational run may be non-degraded. Never claim equivalent results across engines.

If the upstream skill is unavailable or fails, write no clean result. When report v2 can be produced, write an operational report with no findings, `degraded: true`, failure notes, and `skipped` coverage explaining the failure. Return blocked evidence with its reason to the calling orchestrator. Do not interpret an empty findings array from a failed run as a clean audit.

## Approved rewrite

Detection is the default. For a rewrite:

1. Present detected issues, proposed rewrite scope, and exact affected files. Obtain explicit author approval for that change batch and record it in the shared tracker's `Approvals` section with its approval ID, operation, scope ID, paths, status, reason, and timestamp.
2. Before invoking any rewrite that writes text, have the calling `revise-fiction` or `revise-draft` orchestrator complete `author-project` backup for every affected file. The backup record must cite the same `approval_id` and `scope_id` and contain the original input hashes. Proceed only after all backups succeed and the current hashes still match.
3. Invoke upstream `avoid-ai-writing` in `rewrite` mode with the same profile and full rules. Apply only the approved rewrite to registered manuscript files.
4. Run a separate upstream `detect` pass over resulting text, including the upstream second-pass checks. Write a new report with remaining findings, stable IDs, and actual engine details. Record the backup ID, approval ID, and scope ID in `engine.notes` and the session note.
5. Return remaining findings to the author. Another rewrite requires its own approval and backup. Claim a clean result only when second detection finds no remaining issues in the stated coverage.

The adapter adds these gates around either orchestrated run. It does not rewrite the upstream skill, modify its normal response format, or intercept an independent invocation.

## Standalone boundary

An independent `avoid-ai-writing` run leaves `.author-toolkit/project.json`, the shared tracker, and shared reports unchanged. If the author asks to incorporate it, preserve standalone output, convert a copy to report v2 with stable finding IDs and the confirmed scope ID, and record the author's incorporation decision. Never silently update shared state from an independent run.
