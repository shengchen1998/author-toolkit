# Language Support

Record language coverage in every workflow report under a `Language coverage` heading. Mark each requested rule `full`, `partial`, or `skipped` with a reason. A stage can finish with partial or skipped rules after author review; the report must not imply equivalent coverage across languages.

The reference files were written primarily for English prose. English runs apply their documented rules. Chinese runs use this matrix:

| Audit | Chinese coverage | Rule |
|---|---|---|
| Active/Passive | skipped | English voice patterns do not detect Chinese constructions such as 被、由、让. |
| Parallel Structure | full | Apply the semantic judgment without relying on English morphology. |
| Sentence Variance | partial | Use Chinese sentence segmentation and judgment; English word-count thresholds are not calibrated targets. |
| Readability | partial | Keep paragraph and structural checks; skip Flesch-Kincaid and other English grade-level metrics. |
| Echoes | partial | Detect repeated Chinese words and phrases conversationally; do not apply the English 100-word window as a calibrated measure. |
| Frequency | partial | Report repeated Chinese expressions without claiming equivalent word segmentation or stopword coverage. |
| Crutch Words | full | Use the author's configured Chinese terms and context judgment. |
| Filter Words | skipped | The built-in list is English; an author-supplied Chinese list can enable a project-specific audit. |
| Adverb Audit | skipped | The `-ly` detection rule is English-specific. |
| Dialogue Tags | partial | Review attribution and repetition in Chinese dialogue without applying said-bookism vocabulary mechanically. |
| Sticky Sentences | skipped | The glue-word inventory and density thresholds are English-specific. |
| Sentence Starters | partial | Compare Chinese openings by meaning and syntax rather than English token counts. |
| Tense Consistency | skipped | English tense-inflection checks do not describe Chinese aspect and time expression. |
| Invented-Term Consistency | full | Check spelling, capitalization where applicable, naming, and variant drift. |
| Clichés | skipped | Use the catalog only for English; an author-supplied Chinese catalog can enable a project-specific audit. |
| Pronoun Clarity | full | Check antecedents, omitted subjects, and referent ambiguity. |
| Show vs. Tell | full | Apply the narrative judgment with Chinese examples from the manuscript. |
| POV Consistency | full | Check viewpoint, knowledge, and perception boundaries. |
| AI-Isms | skipped | Use the AI-writing adapter; the upstream pattern catalog is English-specific. |

For other languages, run only rules the author and agent can ground in the manuscript's grammar and the selected reference. Mark the remainder skipped. Never translate the manuscript solely to make an English detector produce a result.
