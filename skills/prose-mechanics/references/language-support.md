# Language Support

Record language coverage in every workflow report under a `Language coverage` heading. Mark each requested rule `full`, `partial`, or `skipped` with a reason. A stage can finish with partial or skipped rules after author review; the report must not imply equivalent coverage across languages.

The audit reference files were written primarily for English prose. English runs apply their documented rules.

For Chinese, also load [`chinese-rules.md`](chinese-rules.md). Its Chinese procedures replace the English vocabulary lists, morphology, token windows, word-count thresholds, and grade-level formulas in the individual audit references. For AI-Isms, load the toolkit root's `references/avoid-ai-writing-adapter.md` and its Chinese catalog as directed there.

`full` Chinese coverage means that every requested subcheck in the Chinese procedure was actually applied to every requested Chinese span. It does not mean that an English metric was translated or that an English-only engine produced a result. A deliberate complete conversational run can be full and non-degraded. Record the actual segmentation method and any unavailable input or subcheck; omissions are `partial`, and an unexecuted audit is `skipped`.

| Audit | Chinese procedure |
|---|---|
| Active/Passive | Identify 被、由、让、受、遭 and 为…所… constructions, causative/passive ambiguity, and whether agency is actually obscured. |
| Parallel Structure | Compare Chinese predicates, phrases, clauses, and semantic roles without relying on English morphology. |
| Sentence Variance | Segment Chinese sentences, measure character-based length distributions, and inspect rhythm in context. |
| Readability | Inspect sentence load, paragraph load, nesting, terminology, and reference distance. English grade-level formulas are inapplicable and are not replaced with an invented Chinese score. |
| Echoes | Detect repeated Chinese words and phrases within sentences, adjacent sentences, and paragraphs; judge intentional motif and emphasis. |
| Frequency | Use declared Chinese segmentation and project terms to profile repeated expressions; label conversational counts as approximate. |
| Crutch Words | Apply the built-in Chinese candidate list plus the author's configured terms, frequency, and context. |
| Filter Words | Identify Chinese perception and cognition filters and preserve passages where the act of perceiving matters. |
| Adverb Audit | Inspect 地 constructions, degree/manner adverbs, weak-verb combinations, and repetition without treating every adverb as an error. |
| Dialogue Tags | Parse Chinese quotation and attribution forms, speaker clarity, action beats, and repetitive or ornate tags. |
| Sticky Sentences | Inspect 的 chains, function-word stacking, nominal style, and clause load without an English glue-word threshold. |
| Sentence Starters | Compare the first meaningful Chinese syntactic constituent and opening pattern rather than an English token count. |
| Tense Consistency | Check 着、了、过, time expressions, aspect, and timeline consistency without requiring English-style inflection. |
| Invented-Term Consistency | Check Chinese names, transliterations, script and width variants, aliases, and applicable Latin capitalization. |
| Clichés | Apply the Chinese candidate catalog with contextual judgment; a stock phrase is a candidate, not an automatic replacement order. |
| Pronoun Clarity | Check 他、她、它、其、此、彼 and omitted-subject reference in Chinese discourse. |
| Show vs. Tell | Judge named emotion, dramatization, action, sensation, and thought in Chinese narrative context. |
| POV Consistency | Check Chinese viewpoint, omitted subjects, knowledge, and perception boundaries. |
| AI-Isms | Apply the local Chinese catalog in the AI-writing adapter. Never use it to infer authorship or AI provenance. |

For other languages, run only rules the author and agent can ground in the manuscript's grammar and the selected reference. Mark the remainder skipped. Never translate the manuscript solely to make an English detector produce a result.
