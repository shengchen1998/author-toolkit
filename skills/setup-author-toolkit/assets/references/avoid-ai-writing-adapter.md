# Avoid AI Writing adapter

Use this reference for an `ai-cleanup` operation explicitly called by `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request`, and for the AI-Isms audit in `prose-mechanics`. It connects the English upstream `avoid-ai-writing` skill and the local [Chinese AI-writing candidate catalog](avoid-ai-writing-zh-CN.md) to the appropriate finding format, scope, and approval gates. It is not a skill and does not change standalone upstream invocation or output.

The audit reports AI-associated textual patterns. It does not determine whether text was AI-generated, identify its author, or establish generation provenance.

## Route and scope

For a shared `ai-cleanup` operation, use the confirmed `current_scope` and its input versions. Do not route through `prose-mechanics`; that would duplicate the pass and add nesting. Run the language paths below directly and return shared report v2 evidence.

For a direct standalone AI-Isms request, use `prose-mechanics` audit 19. Its Chinese path loads this adapter and the local Chinese catalog, retains finding v1, and preserves the standalone state boundary below. In particular, route a standalone Chinese AI-writing audit to `prose-mechanics` AI-Isms rather than asking the English upstream skill to handle Chinese. An independent upstream `avoid-ai-writing` invocation remains English-only and unchanged.

When English prose is in scope, read the installed upstream `SKILL.md` and applicable references, then execute its procedure directly. Pure Chinese detection and rewriting do not read upstream and do not depend on its availability.

Use the confirmed files and input versions. Partition each file into actual English, Chinese, other-language, and non-prose spans before detection; a file-level language guess is not enough for mixed text. Record span boundaries by real line or character ranges. Do not translate or transliterate text to make another language's catalog appear applicable.

Run a full audit across P0, P1, and P2. English spans use every upstream category and tolerance rule. Select the upstream context profile that best fits the English text and record it; use `blog` when no more specific profile fits. Chinese spans use every `ZH-01` through `ZH-12` category in the local catalog. Upstream profiles, exemptions, and tolerances do not silently rewrite the Chinese rules. Quoted examples, code, and explicitly illustrative passages retain their documented exemptions in their own language path.

## Language execution and coverage

| Requested text | Execution | Coverage and degradation |
|---|---|---|
| Chinese only | Run all local Chinese categories conversationally on every requested Chinese span; upstream is not required | `full` only after every category and span is actually evaluated. A complete conversational Chinese run may set `engine.degraded` to `false`. |
| English only | Run the complete upstream catalog in `detect` mode on every requested English span | `full` only after the complete upstream pass. Scriptorium coverage is English coverage only. |
| Mixed English and Chinese | Run upstream on English spans and the local catalog on Chinese spans, with actual span identities in the report | `full` only when both language paths and every requested span complete; otherwise `partial` and degraded. |
| Text including another language | Evaluate supported language spans separately; identify each unsupported span and its unevaluated rules | `partial` when another requested span or category remains unevaluated; `skipped` when no requested pass ran. |

In the report's `Language coverage` section, use only the workflow labels `full`, `partial`, and `skipped`:

- `full` means every requested prose span received every applicable catalog category. An empty findings array after those scans can be a clean result within that stated coverage.
- `partial` names each covered file and span, each omitted span, and every category not evaluated. Missing a category, skipping a requested span, or relying on English-only Scriptorium output for Chinese means the Chinese coverage is not `full`.
- `skipped` means the requested pass was not executed. Give the operational or language reason. Neither `partial` nor `skipped` is a clean bill of health.

Apply language-neutral formatting checks only where their meaning is clear in context, and attribute each result to the span actually read. Do not count one formatting observation as proof that another language path ran. Split reports when one BCP 47 language tag cannot describe the evaluated text truthfully, while retaining the requested operation's aggregate coverage.

Set `engine.degraded` to `true` whenever requested coverage is partial or skipped or a requested engine fails. A deliberately selected complete conversational run may be non-degraded; never claim equivalent results across engines. Scriptorium's English-only analysis must not be reported as Chinese coverage even when Chinese text was present in its input.

If upstream is unavailable or fails, an English-only requested operation is blocked with `skipped` coverage. For mixed text, mark the affected English spans blocked or `skipped`, still complete the local Chinese spans, and report the whole requested operation as `partial` and degraded; the partial Chinese evidence remains usable but does not complete the requested mixed operation. Write no clean result for the unevaluated English text. When report v2 can be produced, write an operational report with failure notes and only the findings actually supported by completed spans.

## Detect

1. Create the file/span coverage ledger before scanning. For Chinese spans, work through the local catalog's execution protocol and scan every category `ZH-01` through `ZH-12`, including categories that produce no findings. For English spans, run the upstream procedure in explicit `detect` mode with the selected profile and full P0/P1/P2 scope.
2. When `scriptorium` is available for English, run `scriptorium prose prepare ai-isms <chapter>` only on the English input it supports, judge the candidates against the complete upstream catalog, and submit the judged findings through the engine. Without it, perform the complete conversational upstream audit. The fallback is the full catalog, not a shortened word scan. Chinese findings always come from the local Chinese catalog, never from relabeling Scriptorium's English matches.
3. Treat matches as candidates until their context and exceptions have been assessed. Each retained finding needs the narrowest truthful location, a short verbatim excerpt from the manuscript, the catalog category, a specific `reason` explaining the problem in context, and an actionable `recommendation`. Do not use "sounds like AI" as the reason or "make it more specific" as the entire recommendation. Never invent facts, sources, or replacements to complete a rewrite.
4. Map severity exactly: P0 to `warning`, P1 to `suggestion`, P2 to `note`. Preserve the original P-tier and Chinese `ZH` identifier in the finding's existing `technique` text or tracker note. Add no extra finding property. P0/P1/P2 express revision priority, not AI probability.
5. Every Chinese finding uses `confidence: "judgment"`, including a finding initiated by direct string matching. A string match can locate text but cannot prove AI origin. English findings may use `confidence: "deterministic"` only for direct code-detected textual evidence and `judgment` for contextual assessment; neither value asserts authorship or generation provenance.
6. In workflow mode, convert results to report v2 and finding v2 with stable IDs and bind the report to the confirmed scope ID and input versions. Add findings to the shared living tracker and write a new immutable report for each run. Finding status remains in the tracker. Detection does not advance `pending_action` or approve a rewrite.

Set `engine.name` to `scriptorium` when that engine ran and `conversational` otherwise. Record its actual version or `unknown`. Put the upstream skill name and version when used, the local Chinese catalog identity when used, English profile, per-language full-catalog or limited mode, fallback, span coverage, scope ID, and degradation in `engine.notes`. For mixed runs, identify both execution paths rather than letting one engine name imply coverage of the other language.

## Approved rewrite

Detection is the default. For a rewrite:

1. Read `<setup-skill-root>/assets/references/context-fit.md` and complete the context-fit check before presenting the exact rewrite candidates. Then present detected issues, proposed rewrite scope, language spans, and exact affected files. Obtain explicit author approval for that change batch and record it in the shared tracker's `Approvals` section with its approval ID, operation, scope ID, paths, status, reason, and timestamp.
2. Before any write, have the calling `revise-fiction`, `revise-draft`, `revise-increment`, or `revise-request` orchestrator complete `author-project` backup for every affected file. The backup record must cite the same `approval_id` and `scope_id` and contain the original input hashes. Proceed only after all backups succeed and the current hashes still match.
3. Rewrite only the approved spans in registered manuscript files. English spans use upstream `rewrite` mode with the same profile and full English rules. Chinese spans use the local catalog's context-aware revision directions; upstream availability is irrelevant to a pure Chinese rewrite. Preserve meaning, voice, facts, quotations, and justified exceptions rather than mechanically replacing every candidate.
4. Run a separate second detection pass over the resulting text. Re-scan every rewritten Chinese span against all `ZH-01` through `ZH-12` categories and every rewritten English span against the complete upstream second-pass checks. Write a new immutable report with remaining findings, stable IDs, actual coverage, and engine details. Record the backup ID, approval ID, and scope ID in `engine.notes` and the session note.
5. Return remaining findings to the author. Another rewrite requires its own approval and backup. Claim a clean result only when second detection finds no remaining issues in the stated full coverage; a partial or skipped second pass cannot establish a clean requested operation.

These gates surround both orchestrated detection and rewriting. They do not rewrite the upstream skill, modify its normal response format, or intercept an independent invocation.

## Standalone boundary

A standalone `prose-mechanics` AI-Isms audit may use the complete Chinese catalog without upstream. It retains finding v1 and the skill's normal standalone report and tracker behavior. Do not add report-v2-only fields to finding v1, write shared report v2 evidence, or modify `.author-toolkit/project.json`, the shared tracker, or shared reports unless a calling revision strategy explicitly supplies workflow context. Its Chinese findings still use `confidence: "judgment"`, and any approved edits and second detection follow the standalone skill's stopping and author-confirmation rules.

An independent upstream `avoid-ai-writing` run remains English-only and leaves `.author-toolkit/project.json`, the shared tracker, and shared reports unchanged. The local catalog does not alter or extend that upstream skill. If the author asks to incorporate standalone output, preserve it, convert a copy to the required report format with stable finding IDs and the confirmed scope ID when in workflow mode, and record the author's incorporation decision. Never silently update shared state from an independent run.
