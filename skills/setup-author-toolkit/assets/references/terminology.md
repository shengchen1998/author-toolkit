# Controlled workflow terminology

Apply this vocabulary to shared creation and revision documentation, reports, trackers, templates, handoffs, and artifact contracts. It adapts the ASD-STE100 principles of one approved term for one meaning, explicit definitions, and consistent word forms. It does not claim ASD-STE100 certification for project prose.

Independent skills keep their craft vocabularies. Register a craft term here before giving it a shared workflow meaning. Preserve historical artifacts without rewriting them to retrofit current terminology; new instructions and artifacts use this vocabulary.

## Writing rules

1. Use the approved English term or its fixed Chinese equivalent for the intended concept. Use one language form consistently within a sentence; machine identifiers remain English.
2. Keep the approved capitalization, hyphenation, and part of speech. A countable noun may take its standard English plural. Do not create abbreviations, adjectives, compounds, or shorthand for a controlled term.
3. Use an operation identifier in code form when naming an operation. Use `stage` only for the literal report v2 property, `current_scope` only for the manifest property, and `pending_action` only for the manifest property or its object.
4. Bind every qualifier to a measurable dimension. `Current` concerns input and dependency identity. `Full` concerns one named coverage dimension. `Complete` concerns one named job or operation. None alone establishes evidence reuse, request completion, or current-draft revision convergence.
5. Define a new shared term before use: approved English term, fixed Chinese equivalent, part of speech, category, distinguishing criterion, operational boundary, and excluded expressions. Register it here and update every affected use in the same change.
6. Keep versioned identifiers and closed enum values unchanged. Chinese prose uses the fixed Chinese equivalents for natural language and preserves English report headings, tracker columns, field names, and status values.
7. When an excluded expression has a different legitimate meaning outside shared workflow terminology, state that meaning explicitly instead of borrowing the workflow term.
8. In shared workflows, resolve the installed `setup-author-toolkit` skill's root as `<setup-skill-root>` and read this file and other shared contracts from `<setup-skill-root>/assets/references/`. Do not deploy them into the writing project. Standalone skills use their skill-local contracts and do not require setup.

## Core terms

| Approved English | 中文固定用语 | Kind | Approved meaning and operational boundary | Excluded expressions |
| --- | --- | --- | --- | --- |
| `strategy` | 策略 | Noun | One of the five author-selected shared creation or revision procedures. A strategy is not an operation or persisted shared project state. | |
| `user entry` | 用户入口 | Noun | A skill that the author invokes explicitly. The five strategies and the setup and routing skills are user entries. | |
| `semantic skill` | 语义技能 | Noun | A skill that owns author choices, editorial judgment, manuscript reading or synthesis, or operation sequencing. Its installed `SKILL.md` and applicable references define one procedure, which the agent executes directly. It is not an alternative implementation of an installed deterministic CLI. | |
| `deterministic transaction` | 确定性事务 | Noun | A mechanical validation or shared-state transition with one installed CLI implementation. A semantic skill may supply its decided inputs and interpret its results, but no model-executed counterpart performs the same transaction. | |
| `host command visibility` | 宿主命令可见性 | Noun | The author-observed presence of every exact strategy command in the current host's command palette or autocomplete, including Codex's `$` autocomplete, or of every exact registered strategy name in its skill picker when skill commands are unavailable. It requires an explicit author decision and cannot be inferred from model-facing registry metadata or displayed command strings. | `command visibility`<br>`command-visibility` |
| `operation` | 操作 | Noun | One named unit of work in an operation sequence, pending action, or revision report. Use the exact operation identifier; one invocation runs one operation. | |
| `shared project state` | 共享项目状态 | Noun | The manifest and registered artifacts shared by all five strategies. It is not owned by one strategy. | `workflow state` |
| `manuscript` | 正文稿件 | Noun | Creative Markdown or plain-text files included by manuscript inventory. Operational artifacts and staging are not manuscript. | |
| `current manuscript` | 当前正文稿件 | Noun | The complete manuscript inventory at the time of evaluation, including every included path in reading order. | `full current draft`<br>`full current manuscript`<br>`current draft` |
| `manuscript inventory` | 正文清单 | Noun | The observed ordered manuscript paths, SHA-256 hashes, and exclusions. It is evidence about manuscript, not a scope confirmation. | |
| `scope` | 范围 | Noun | A versioned record containing a scope ID, ordered manuscript paths and hashes, exclusions, and proposed or confirmed status. | |
| `current scope` | 当前范围 | Noun | The scope stored in manifest `current_scope`. The phrase does not mean whichever scope an operation happens to use. | |
| `previous scope` | 前一范围 | Noun | For `revise-increment`, the scope verified as having reached current-draft revision convergence before manuscript growth. It is historical evidence after the increment edits begin. | |
| `base scope` | 基准范围 | Noun | For `revise-request`, the full-manuscript scope verified as having reached current-draft revision convergence before the request. It is historical evidence after request edits begin. | |
| `target scope` | 目标范围 | Noun | The confirmed scope whose paths, evidence, review, and completion state the active strategy must address. It is not the work set. | |
| `full-manuscript scope` | 全稿范围 | Noun | A scope that includes every current manuscript path exactly once in reading order. Combine it with a role, as in full-manuscript base scope or full-manuscript target scope. | `full current draft`<br>`full-manuscript current draft` |
| `publication scope` | 发布范围 | Noun | The target scope accepted for a creation commit, with exact ordered output paths and hashes. Unrelated growth can require a new publication scope without staling staged text. | |
| `requested pass` | 请求修订轮次 | Noun | The explicitly requested operations, paths, and subchecks for one revision effort. Its coverage can be full, narrowed, partial, or skipped. | `current pass`<br>`full pass` |
| `narrowed requested pass` | 收窄的请求修订轮次 | Noun | A requested pass whose author explicitly reduced its requested coverage. Record the reduced boundary and gaps; it does not establish unrestricted current-draft revision convergence. | `limited pass`<br>`converged pass`<br>`converging pass` |
| `change set` | 变化集合 | Noun | The observed created, modified, deleted, reordered, evidence-affected, and dependency-affected paths between two manuscript states. It records difference, not author intent or required work. | |
| `request set` | 请求集合 | Noun | The existing text and checks the author asked a request-driven revision to address. It does not include every dependency or required evidence path by itself. | |
| `work set` | 工作集合 | Noun | The target-scope paths that need new evidence or approved edits after evaluating the request set, change set, dependencies, and reusable evidence. | |
| `operation gate` | 操作门禁 | Noun | The evidence conditions required to finish one operation. Satisfying it does not imply that another operation or the requested pass is complete. | |
| `author gate` | 作者门禁 | Noun | A stop at which the author makes one explicit decision. Discussion, a report, or a pending action does not satisfy it. | |
| `stable operation gate` | 稳定操作门禁 | Noun | An operation gate with shared project state reconciled and no unresolved write or commit interruption, so an author-selected strategy switch can occur safely. | |
| `current evidence` | 当前证据 | Noun | Evidence whose operation, scope, input versions, requested subchecks, and dependencies match the present evaluation. Current evidence is not necessarily reusable in another scope. | |
| `reusable evidence` | 可复用证据 | Noun | Current evidence that also satisfies the whole-report or full local coverage unit reuse rule for the requested work. Schema validity alone is insufficient. | `valid evidence`<br>`有效证据` |
| `stale evidence` | 失效证据 | Noun | Historical evidence invalidated for the present evaluation by changed inputs, scope, reading order, or dependencies. Preserve it as history. | |
| `whole-report evidence` | 整份报告证据 | Noun | Evidence reused as one report only when its operation, scope ID, every input version, requested coverage and subchecks, and dependency state match. It cannot expand into another scope. | `whole-scope report` |
| `coverage unit` | 覆盖单元 | Noun | An artifact recording source report, operation, original scope, exact paths and hashes, subchecks, dependencies, kind, and actual coverage. | |
| `full local coverage unit` | 完整局部覆盖单元 | Noun | A coverage unit with `kind: "local"` and `coverage: "full"` for its recorded paths and subchecks. Reuse additionally requires current identity and dependency matches. | `full local unit`<br>`full local units`<br>`full local coverage`<br>`local proof`<br>`full local proof` |
| `coverage index` | 覆盖索引 | Noun | The living artifact that associates an operation and target scope with coverage units and a synthesis report. It does not make stale units current. | |
| `synthesis` | 综合报告 | Noun | A report that combines required child coverage for a volume, story phase, scope, or book. A synthesis is not a full local coverage unit. | |
| `full-target synthesis` | 全目标范围综合报告 | Noun | A synthesis composed for every target-scope path and required subcheck of one operation. Create a new one after relevant input, membership, order, dependency, or child-coverage changes. | `target synthesis`<br>`target syntheses`<br>`target-scope synthesis`<br>`target-scope syntheses` |
| `operation coverage` | 操作覆盖度 | Noun | The `full`, `partial`, or `skipped` execution result for an operation and its requested subchecks. It is distinct from language coverage and review coverage. | |
| `language coverage` | 语言覆盖度 | Noun | The `full`, `partial`, or `skipped` execution result for each requested language rule or category. It is distinct from operation coverage. | |
| `review coverage` | 复核覆盖度 | Noun | The actual manuscript units and applicable syntheses covered by a review perspective. In request review, full coverage concerns the declared review units, not every path in the target scope. Summaries do not count as manuscript reading. | |
| `subcheck` | 子检查 | Noun | One named check within an operation, language procedure, or review perspective. Record only subchecks actually performed. | |
| `current-scope review` | 当前范围复核 | Noun | The `current-scope-review` operation over one confirmed scope with intent, standards, and fresh-reader perspectives. It is not final review. | |
| `full-target current-scope review` | 全目标范围的当前范围复核 | Noun | A current-scope review whose scope ID is the target scope and whose three perspectives cover every target-scope path. It is an application of `current-scope-review`, not another operation. | `target review`<br>`target reviews`<br>`target-scope review`<br>`full-target review`<br>`full target-scope review`<br>`full-scope review` |
| `base-scope review` | 基准范围复核 | Noun | The current-scope review bound to the base scope before a request. It is reusable only while its inputs and dependencies remain current. | `base review` |
| `final review` | 全书终审 | Noun | The `final-review` operation over the whole book with three independent perspectives. Current-scope review and milestone review do not satisfy it. | |
| `review job` | 复核任务 | Noun | The resumable artifact for one perspective, scope, review mode, ordered sources, units, syntheses, and reviewer identity. | |
| `request review` | 请求复核 | Noun | A current-scope review with `review_mode=request` over only declared changed and dependency-affected manuscript units. Its full coverage does not establish current-draft revision convergence for the target scope. | `diff review` |
| `review brief` | 复核决定摘要 | Noun | A disposable summary of resolved and dismissed tracker findings and their reasons, used after independent review to reuse finding identities and author decisions. It is not reviewer input or authoritative state. | `prior-decision brief` |
| `reader-state` | 读者状态 | Noun | The fresh reader's isolated resumable reading state. It is not a summary shared with another perspective. | |
| `fresh reader` | 新读者 | Noun | The sequential review perspective that reads actual manuscript text through one logical reviewer and only that reviewer's reader-state. | |
| `finding` | 发现项 | Noun | A stable, located observation with a recommendation. Finding status lives in the tracker, not in finding v2. | |
| `finding ID allocation` | 发现项 ID 分配 | Noun | The selection of an unused consecutive ID block after all tracker and report-history occupancy for one prefix. It is not a persisted cross-process reservation or permission to reuse an ID for a different issue. | `fixed review-pass block` |
| `finding batch upsert` | 发现项批量更新 | Noun | The validated atomic insertion or update of tracker finding rows from immutable reports. New findings enter as `open`; existing author decisions and timestamps remain unchanged. It does not replace finding identity reconciliation or an author decision. | `tracker append` |
| `author decision` | 作者决定 | Noun | An explicit author choice recorded for one active item. A model recommendation is not an author decision. | |
| `author decision loop` | 作者决定循环 | Noun | The procedure that presents one active decision, records its explicit outcome, and then advances to the next decision. | |
| `context-fit check` | 上下文适配检查 | Noun | The editorial judgment applied to exact edit candidates against local continuity, history, repetition, voice, request intent, and narrative dependencies before proposal presentation. It neither approves an edit nor expands its scope or coverage. | `context-fit checklist` |
| `confirmation` | 确认 | Noun | An author decision for host command visibility, a scope, baseline, request plan, or creative foundation. Confirmation of host command visibility does not validate the manifest or installed payload; confirmation alone does not authorize a manuscript write. | |
| `approval` | 批准 | Noun | A tracked authorization for an exact operation, scope, paths, actions, and input versions. Edit and restore approvals are separate. | |
| `execution receipt` | 执行回执 | Noun | A post-write record linking one edit approval to its backups and verified per-file input and output hashes. A completed restoration record is the execution receipt for a restore. Neither an approval nor a backup proves execution. | |
| `preserved post-write evidence` | 已保存写入后证据 | Noun | An immutable project-local `execution-evidence-schema.json` record of one exact completed batch, its backups, input and output hashes, and completion timestamp. Current manuscript text and a backup are not substitutes. | |
| `execution reconciliation` | 执行对账 | Noun | The evidence-driven addition of missing execution receipts. It leaves unsupported approvals unverified and does not rewrite approvals or infer historical outputs from current text. | |
| `backup index inspection` | 备份索引检查 | Noun | The read-only explanation of backup-index errors and differences between cited backup and approval identities. It does not migrate historical records, choose a repair value, or add execution receipts. | |
| `unverified approval` | 未核对批准 | Noun | An approved edit or restore approval in the selected scope without its execution receipt. It is valid intermediate state, does not establish that no write occurred, and blocks gates that require verified execution. | |
| `recorded blocker` | 已记录阻塞 | Noun | A stale tracker finding or blocked pending action surfaced by `status`. Stale findings are project-wide because finding rows have no scope ID; this record is not a complete operation-specific evidence evaluation. | |
| `creation acceptance` | 创作批次验收 | Noun | The author decision accepting one exact staged creation batch, its story-state differences, and its publication scope. Record manuscript and scope approvals separately. | |
| `publication` | 发布 | Noun | The creation-commit transition that writes accepted staged content into manuscript and synchronizes story state and publication scope. It does not establish current-draft revision convergence. | |
| `request completion` | 请求完成 | Noun | The state in which every approved request batch and request decision is finished, including the selected request review and its finding decisions. It is evaluated separately from current-draft revision convergence. | |
| `current-draft revision convergence` | 当前草稿修订收敛 | Noun | The derived state in which every condition of the shared definition of this state holds for a confirmed target scope after the latest manuscript change. It is not a stored flag, creation acceptance, publication, operation completion, or request completion. | `converged`<br>`converging`<br>`convergence`<br>`revision-converged`<br>`revision-convergence`<br>`current-draft-converged`<br>`收敛` |
| `operation completion` | 操作完成 | Noun | The state in which one operation satisfies its operation gate. It does not imply that the requested pass is complete or that the target scope has reached current-draft revision convergence. | |
| `creation batch` | 创作批次 | Noun | The immutable record of one planned and reviewed set of manuscript actions, context, outputs, approvals, and story-state differences. | |
| `staged draft` | 暂存稿 | Noun | Proposed, rejected, or superseded text beneath `staging/<batch-id>/`. It is outside manuscript inventory until publication. | |
| `commit journal` | 提交日志 | Noun | The resumable record coordinating file actions and verification during creation commit and restore. It is not a multi-file filesystem transaction. | |
| `story state` | 故事状态 | Noun | Living chapter, volume, and current records derived from accepted manuscript and versioned sources. It does not replace Story Bible intent or actual manuscript reading. | |
| `Story Bible` | 故事圣经 | Noun | The record of author intent. Observed manuscript facts and Story Bible intent remain distinct when they conflict. | |
| `dependency fingerprint` | 依赖指纹 | Noun | The SHA-256 identity of a creation plan, selected context, and file inputs. It determines whether staged content still matches its included dependencies. | |
| `input version` | 输入版本 | Noun | The declared content identity of an input, normally a SHA-256 hash for current manuscript. A schema-valid artifact does not prove that its input version is current. | |
| `immutable report` | 不可变报告 | Noun | A historical report preserved without rewrite. Later decisions and reruns create living tracker updates and new reports. | |
| `living artifact` | 持续更新产物 | Noun | An artifact intentionally updated as shared project state changes, such as the tracker, coverage index, or story state. Historical reports and accepted batches are not living artifacts. | |
| `navigation cache` | 导航缓存 | Noun | The generated `PROJECT_STATE.md` index of pointers to the current scope, pending action, current-scope execution evidence, active plan, latest session and report, and next action. It is disposable and regenerated through `author-project status --digest` after complete project validation. Its UTC timestamp and generation-time validation result do not establish current health, an execution gate, or current-draft revision convergence; rerun preflight before reuse. Preflight marks older formats and caches invalidated by failed checks stale and withholds their recorded route. A new cache withholds a dependent route when strict execution would fail; otherwise the recorded next action remains unevaluated by strategy gates. The manifest, tracker, and current evidence remain authoritative. It grants no approval and does not replace evidence reading. | |
| `pending artifact index` | 待处理产物索引 | Noun | The living `.author-toolkit/pending-artifacts.json` list of the current pending action's artifacts when more than eight paths are needed. The manifest retains at most eight inline paths and points to the index; historical inline lists without an index remain valid. | |
| `pending action` | 待处理操作 | Noun | The manifest `pending_action` object describing requested, interrupted, or awaiting work. It is not permission to write or publish. Use `pending_action.operation` for its operation field. | `pending operation`<br>`pending operations` |
| `pending backup` | 待核对备份 | Noun | A `pending_backups` record preserving an approved batch's input before its execution receipt. It includes create-only absence evidence and moves existing-file records to `backups` after reconciliation. | |
| `restoration source` | 恢复来源 | Noun | The `backup` or `creation_commit` identity used by a restoration record. It does not replace separate restore approval. | |
| `restoration file action` | 恢复文件动作 | Noun | `restore`: restore preserved content; `remove_created`: preserve and remove content created by the restored batch. | |
| `report stage` | 报告 `stage` 字段 | Noun | The literal report v2 `stage` property containing one revision operation identifier. It is not a strategy, progress state, or creation operation. | `workflow stage`<br>`report stages`<br>`entry stage`<br>`stage status`<br>`stage progress` |
| `no-edit skip` | 无修改跳过 | Noun | The recorded decision to skip `revision-plan` and `chapter-revision` because no accepted finding requires an edit. It is not missing evidence. | |

## Operation identifiers

Use these identifiers exactly in pending actions and their permitted artifact contracts. The report v2 `stage` enum contains only the twelve revision identifiers; creation operations use their own artifacts.

| Operation identifier | 中文固定用语 | Approved meaning and operational boundary |
| --- | --- | --- |
| `intake` | 接收与盘点 | Inventory manuscript and establish or confirm scope and author goals. Produce no manuscript edit. |
| `story-bible` | 故事圣经建立 | Establish author intent and the full-book foundation. It is distinct from `draft-baseline`. |
| `draft-baseline` | 草稿基线 | Describe existing text as observed, inferred, or unknown. It does not replace Story Bible intent. |
| `structure` | 全书结构审计 | Audit full-book landmarks and signposts in existing manuscript. It is distinct from local `diagnostics`. |
| `diagnostics` | 局部叙事诊断 | Diagnose causality, scenes, chapters, information release, and transitions in existing text without scoring an imagined complete book. |
| `characters` | 人物与连续性审计 | Perform the character and continuity subchecks required by the active strategy and requested pass. Current-arc and full-arc coverage are distinct. |
| `revision-plan` | 修订计划 | Convert accepted findings and confirmed requests into exact batches with paths, actions, versions, and constraints. It does not edit manuscript. |
| `chapter-revision` | 章节修订 | Apply only approved manuscript batches after current hash verification and backups. Creation acceptance does not satisfy this operation. |
| `prose` | 句子层审计 | Run requested sentence-level audits and approved fixes, recording actual audit and language coverage. |
| `ai-cleanup` | AI 关联表达处理 | Detect AI-associated textual patterns or apply approved rewrites through the language-appropriate catalog. It does not establish AI authorship. |
| `current-scope-review` | 当前范围复核 | Run intent, standards, and fresh-reader review over one confirmed scope and produce findings only. |
| `final-review` | 全书终审 | Run intent, standards, and fresh-reader review over the whole book and produce findings only. |
| `creation-baseline` | 创作基线 | Establish minimum author intent and creation state without requiring a complete outline or ending. |
| `writing-plan` | 写作计划 | Define the exact write batch, context package, and dependency fingerprint before staging. |
| `chapter-creation` | 章节创作 | Write proposed manuscript and continuity patches only to staging before creation acceptance. |
| `chapter-review` | 创作章节复核 | Check the exact staged batch and obtain creation acceptance or rejection. It is not current-scope review. |
| `creation-commit` | 创作提交 | Publish the accepted batch through the commit journal and synchronize story state and publication scope. It does not establish current-draft revision convergence. |
| `creation-import` | 创作导入 | Reconcile author-added, modified, deleted, or reordered manuscript with explicit confirmation and story-state reconciliation. |
| `milestone-review` | 里程碑复核 | Summarize and check an author-selected volume or story phase. It is not final review or current-scope review. |

## Contract values

Machine values remain English and case-sensitive. Qualify a value by its artifact and field when natural-language context could make it ambiguous.

| Artifact and field | Approved values and meanings |
| --- | --- |
| Scope `status` | `proposed`: recorded and awaiting confirmation; `confirmed`: the author confirmed the exact scope record. |
| Pending action `status` | `in_progress`: execution is active; `awaiting_author`: execution stopped for an author decision; `blocked`: a concrete validation, dependency, or execution blocker prevents progress. |
| Finding tracker `Status` | `open`: awaiting decision or verified resolution; `resolved`: accepted resolution verified by current evidence; `deferred`: author postponed action; `dismissed`: author judged the finding inapplicable or intentional; `stale`: inputs changed or an equivalent rerun no longer observes it without verified resolution. |
| Approval `Status` | `approved`: current authorization for the exact recorded batch; `deferred`: decision postponed and no write authorized; `cancelled`: withdrawn and no write authorized; `superseded`: replaced by a newer recorded decision. |
| Coverage `coverage` and `synthesis_coverage` | `full`: every requested item in this coverage dimension was executed; `partial`: some requested items were executed and gaps are named; `skipped`: no execution for the named item, with a reason. |
| Coverage unit `kind` | `local`: independently covered source paths; `synthesis`: composed child coverage. |
| Review job `mode` | `final`: whole-book review; `current-scope`: review of the confirmed scope; `request`: review of only the declared changed and affected manuscript units within the confirmed scope. |
| Review `perspective` | `intent`: intent and consistency; `standards`: writing standards; `fresh`: sequential fresh-reader reading. |
| Review job `status` | `prepared`: sources and units recorded; `in_progress`: review execution active; `interrupted`: review stopped before completion; `complete`: every required unit and applicable synthesis is complete. |
| Review unit `status` | `pending`: not started; `in_progress`: active; `interrupted`: stopped before completion; `complete`: its report and required coverage validate. |
| Creation batch `source_mode` | `ai`: AI-authored staged text; `author`: author-supplied staged text; `mixed`: both sources in one batch. |
| Creation batch `status` | `proposed`: planned; `in_progress`: execution active; `awaiting_author`: stopped for an author decision; `accepted`: exact batch accepted; `committed`: publication finished; `rejected`: batch rejected and retained outside manuscript; `blocked`: a concrete blocker prevents progress; `restored`: its publication was restored through a separate approval. |
| Creation context `version_type` and report input `version_type` | `sha256`: content hash; `git`: recorded Git identity; `author`: author-supplied version; `untracked`: declared without a tracked version. None alone establishes current evidence. |
| Manuscript file `action` | `create`: create an absent path; `modify`: change existing content; `delete`: remove an existing path; `reorder`: change reading order. |
| Creation batch file `status` | `pending`: planned; `staged`: proposed output written to staging; `accepted`: output accepted; `written`: published output written; `verified`: published output reread and hash-verified; `restored`: publication reversed through the restore procedure. |
| Commit journal `status` | `prepared`: journal initialized; `in_progress`: publication active; `interrupted`: publication stopped and reconciliation required; `committed`: every output verified; `restore_pending`: restore approved but not finished; `restored`: restore finished. |
| Commit journal file `status` | `pending`: planned; `written`: output written; `verified`: output reread and hash-verified; `restored`: file restored through the approved procedure. |
| Story state `level` | `chapter`: chapter record; `volume`: volume or story-phase record; `current`: current whole-scope index. |
| Story-state record `category` | `fact`: observed story fact; `character`: character state; `timeline`: temporal fact; `object`: object state; `thread`: open narrative thread; `constraint`: governing constraint. |
| Story-state record `status` | `active`: currently applicable; `open`: unresolved narrative question; `resolved`: narrative question resolved in accepted text; `superseded`: replaced by a newer derived record. |
| Finding `severity` | `note`: observation; `suggestion`: recommended improvement; `warning`: significant issue requiring attention. Severity does not supply an author decision. |
| Finding `location.scope` | `file`: whole file; `chapter`: identified chapter; `line`: identified line; `passage`: quoted passage. Use the narrowest truthful location. |
| Finding `confidence` | `deterministic`: direct code-detected evidence; `judgment`: editorial interpretation. |
| Report `engine.name` | `conversational`: model-led execution; `scriptorium`: scriptorium execution path. Record the actual path and degradation. |
