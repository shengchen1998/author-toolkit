# author-toolkit 3.1 人工评审检查清单

本清单用于真实运行技能, 不是自动测试的替代品. `fiction-revision-en` 与 `fiction-revision-zh`
是同一原创故事的两个语言版本, 预置报告和会话记录全部是手写 fixture, 不得写成 "模型运行结果".
其中旧 v2 manifest, 阶段状态快照和 override 样例只用于迁移及 legacy 兼容性验证, 不是 v3.1
项目的操作模板. 只在副本上运行迁移, 不转换仓库内原始 examples.

## 1. 评审准备与证据

- [ ] 在依赖已就绪的仓库根目录运行 `npm test` 和 `npm run validate`, 保存真实命令结果, 不把历史结果写成本次通过.
- [ ] 将目标样例复制到 `.test-output/manual-<host>-<language>/`, 后续实验只修改副本, 保留原 fixture 作为对照.
- [ ] 记录宿主, 宿主版本, 模型, 日期, 技能版本, operation, `scope_id`, 输入文件版本, coverage, 依赖和每份报告路径.
- [ ] 每次真实生成报告后, 用 `node scripts/validate.mjs --manifest <project.json> --report <report.md>` 验证副本; 不要把生成文本做成固定快照.
- [ ] 运行 `node scripts/validate.mjs --help` 确认当前 artifact 参数, 对实际生成的 story state, creation batch, commit journal, coverage unit/index 和 review job 分别使用对应参数验证.
- [ ] 区分三类证据: 契约验证通过, 人工写作评价, 作者决定. 前者不能证明文章质量, 模型建议也不能算作作者同意.

## 2. 统一 setup 与共享项目

- [ ] 对 `write-fiction`, `revise-fiction` 和 `revise-draft` 都先运行同一个 `setup-author-toolkit`; 确认 setup 不接受 workflow 或 entry stage 参数, 三个入口的登记和 intake 行为一致.
- [ ] 确认三个入口使用同一份中性 `.author-toolkit/project.json` (v3.1), 以及共享的 `audit-tracker.md`, `story-bible.md`, `reports/`, `sessions/`, `backups/` 和 `handoffs/`.
- [ ] 检查 v3.1 manifest 只将 `current_scope` 与 `pending_action` 作为可选进度字段, 其余内容用于项目登记, 证据和路径; 不读取或手改 v2 阶段状态.
- [ ] 确认 `paths.creation` 默认指向 `.author-toolkit/creation/`, 自定义路径也按 manifest 解析; `state/current.md`, `state/chapters/`, `state/volumes/`, `batches/` 和 `staging/` 位于该根目录下.
- [ ] 确认 creation root 和 staging 被排除在 manuscript inventory 外, 没有把 story state, batch 或 staged draft 统计为正文.
- [ ] 确认没有策略专属目录或第二套状态. 在三个技能的稳定 operation 门禁之间切换后复用共享产物, 不执行迁移.
- [ ] 登记后核对稿件仍在原路径, 自定义产物路径仍有效; setup 和技能切换都不移动 manuscript, reports 或 backups.
- [ ] 对 v3.0 项目确认 3.1 工具仍可读取; 在创作写入前完成作者确认的增量 `upgrade-v31`, 并核对原有 scope, pending action, findings, approvals 和 backups 未丢失.

## 3. `revise-fiction` 全书九阶段

按 `intake` -> `story-bible` -> `structure` -> `characters` -> `revision-plan` ->
`chapter-revision` -> `prose` -> `ai-cleanup` -> `final-review` 执行. 每项操作先记录输入版本,
范围, coverage 和依赖, 再记录产物, 未决问题与 pending operation.

- [ ] **intake**: 确认语言, `manuscript_root`, 三章正文, 路径和作者目标. 检查没有为了缺失章节信息而虚构 `line: 1`.
- [ ] **story-bible**: 先读共享故事圣经, 确认 Ning/林宁的 Want, Need, Wound, Lie, Han/韩松的合理反对, 以及录音知情同意规则. 列出未决问题, 交作者决定.
- [ ] **structure**: 独立调用 `story-structure` 的 Audit. 定位实际节拍, 检查中点, 第一无归之门, 假高潮和主角造成高潮结果的因果关系; 只提交 findings, 不改正文.
- [ ] **characters**: 以 Character Consultant 视角检查 Ning/林宁和 Tao/林涛. 核对第二章刻薄玩笑的触发, 第三章转变证据, 人物决定与故事圣经的一致性, 以及完整全书门禁要求的额外线索和连续性子检查.
- [ ] **revision-plan**: 让作者选择结构方案, 再按因果优先级排列修改. 句子润色不得排在中点和高潮返工之前.
- [ ] **chapter-revision**: 只有收到明确修订授权后才改副本. 每次修改记录对应 finding, 作者决定和故事圣经变化; 不自动扩写任务范围.
- [ ] **prose**: 结构稳定后运行 `prose-mechanics`, 一次只跑一种审计. 检查重复句式, 被动构造, 句长变化和中文表达自然度; 不因英文版的判断直接给中文版下结论.
- [ ] **ai-cleanup**: 先用 `avoid-ai-writing` Detect, 单独审阅 "社区持久力量的见证" 等抽象套语. 只有作者明确要求 Rewrite 时才改写, 并保留检测报告.
- [ ] **final-review**: 完成下方三视角全书终审, 确认作者已处理高优先级 findings, 记录全书范围内的结论和后续 pending operation.

## 4. `revise-draft` 镜像九阶段

按 `intake` -> `draft-baseline` -> `diagnostics` -> `characters` -> `revision-plan` ->
`chapter-revision` -> `prose` -> `ai-cleanup` -> `current-scope-review` 执行. 使用与全书入口
相同的项目, tracker, 故事圣经和证据目录.

- [ ] **intake**: 明确当前稿范围和作者目标, 不要求把任务改写成全书修订.
- [ ] **draft-baseline**: 用一份未完本, 无大纲, 无结局的稿件建立基线, 记录现有输入的 SHA-256 和范围; 不虚构后续章节, 大纲或结局.
- [ ] **diagnostics**: 只诊断现有文本的局部叙事因果, 场景, 人物动机和连续性; 不评价全书完成百分比, 不报告缺失的未来节拍, 不以全书门禁阻断当前范围工作.
- [ ] **characters**: 确认与 `revise-fiction` 共用 characters 能力, 但这里只要求当前弧线和连续性; 不伪称已经完成完整全书人物门禁的额外子检查.
- [ ] **revision-plan**: 仅在需要改稿时为当前范围组织计划; 无改稿请求时记录允许跳过的原因.
- [ ] **chapter-revision**: 仅在获得当前范围的明确批准后修改, 先备份并校验 hash; 无改稿请求时与计划一起跳过.
- [ ] **prose**: 验证可以直接进入句子层审计, 证据仍记录 operation, scope, 输入版本, coverage 和依赖.
- [ ] **ai-cleanup**: 验证可以直接进入 Detect 或明确授权的 Rewrite, 不强制先完成全书结构或人物门禁.
- [ ] **current-scope-review**: 以三个独立视角复核当前范围, 全书不适用项明确记录为 `skipped` 和范围理由, 不把 `skipped` 当作全书通过.

## 5. `write-fiction` 创作循环与 story state

- [ ] **creation-baseline**: 分别用新项目和无完整大纲的现有稿运行, 只要求 target reader, core premise, protagonist, central conflict 和 narrative constraints; 未写情节和结局保持 unknown.
- [ ] 确认 Story Bible 记录 intent, 已验收正文建立 observed facts, chapter/volume/current story state 从有版本的来源派生. 制造一处 intent 与正文冲突, 检查系统保留两种来源并交作者决定, 不静默覆盖.
- [ ] **writing-plan**: 默认一次一章, 记录目的, POV, 目标与冲突, 信息释放, 连续性约束, source mode, 准确目标路径和动作, 以及 context versions 与 dependency fingerprint.
- [ ] 分别运行 AI, 作者和混合创作批次, 确认三者使用相同的计划, staging, 验收和状态同步门禁.
- [ ] 写前明确批准计划和准确 write batch; 单独批准计划但未批准写入时, 确认没有正文或 staging 发布动作.
- [ ] **chapter-creation**: 确认 AI 文本先进入 `staging/<batch-id>/`, 作者文本也暂存相同版本; 被拒绝和 superseded drafts 不进入 manuscript scope 或 current story state.
- [ ] 确认每本书只有一个 active creation batch, manifest 只有一个 shared pending action; 第二批次不能覆盖未决批次.
- [ ] **chapter-review**: 核对计划执行, 章节衔接, 人物知识, 时间线和世界规则. 一次验收完整批次的正文, story state 差异和有序 scope, 并分别记录 manuscript 与 scope approvals.
- [ ] 拒绝一个批次, 确认 manuscript, current story state 和 scope 均未变化, staging 文本仍保留供作者处理.
- [ ] **creation-commit**: 验收后无需第二个写入门禁, 但只能发布已验收输出; 完成后核对 batch, journal, story state, scope, tracker 和 session note 一致.
- [ ] **milestone-review**: 在作者选择的卷或故事阶段边界运行局部检查并记录 full/partial/skipped coverage; 不把里程碑摘要称为全书终审.

## 6. 发布保护, restore 与外部导入

- [ ] commit 前重新计算 dependency fingerprint 和每个已有目标的 SHA-256. 对 create 目标确认 expected absent 且 input hash 为 null; 对 modify/delete/reorder 目标确认原 hash 匹配并已备份.
- [ ] 在批准后制造一个目标 hash 变化和一个新文件意外出现, 分别确认发布停止, 不覆盖外部改动.
- [ ] 确认 commit journal 在首次正文写入前存在, 每个文件通过临时同目录文件, hash 校验和原子 rename 发布, 并在 written/verified 等每次转换后更新 journal.
- [ ] 模拟多文件批次中断, 核对 journal 准确区分 completed, pending 和 unexpected actions; 不声称整个批次具备单文件系统事务, 也不自动回滚或继续发布.
- [ ] restore 另取明确批准, 指明 commit 或 backup 和准确文件. 先安全备份当前内容; 对该批次新建的文件, 先移入安全备份再从 manuscript 移除, 并核对 bytes 与记录的路径.
- [ ] restore 后确认 story state 差异被反向处理, 新 scope 由作者确认, 受影响证据标为 stale; creation/edit approval 不能代替 restore approval.
- [ ] **creation-import**: 分别由作者在流程外新增, 修改, 删除和重排正文文件. 确认每项都被盘点, proposed state differences 和 reading-order/evidence 影响经作者确认, 没有静默刷新 hash.

## 7. 证据复用, coverage 与依赖失效

- [ ] 对同一操作重跑时, 同时核对 `operation`, `scope_id`, 输入版本, coverage, subchecks 和依赖; 只有这些条件匹配时才复用证据.
- [ ] 改变正文, Story Bible, 已批准计划或其他依赖后, 确认直接受影响的证据标为 `stale`, 并沿依赖传播到下游操作.
- [ ] 保留旧报告作为历史证据, 重新运行生成新报告; 不因旧报告 schema 有效就把它当作当前正文的有效审计.
- [ ] 新 scope 必须由作者确认后再使用. 检查 scope 的 SHA-256 对应实际输入, 不伪造 SHA, Git 提交或作者版本.
- [ ] 确认 coverage units 和 living coverage index 位于登记的 reports 路径下. 只有 full local unit 且 source report 身份, operation, paths/hashes, subchecks 和 dependencies 全部匹配时才复用; 原 scope 保留在来源单元, 新组合与 synthesis 使用新 scope.
- [ ] 修改无关局部文本, 确认未受影响的 local units 可保留; 修改已纳入 staged batch 的依赖后, 确认 fingerprint 变化并要求 re-review 或重新规划.
- [ ] 只增加无关正文范围时, 确认发布 scope 会刷新, 但不单凭这一变化使 staged content 失效.
- [ ] 新增, 删除或重排正文后, 重新评价所有受影响的 volume/phase/current-scope/book synthesis; 不因 local units 仍匹配就沿用旧全书 synthesis.
- [ ] 用 `node scripts/validate.mjs --manifest <path>` 检查项目契约; 遇到无法解释的证据来源, 缺失依赖或未确认 scope 时停止推进.

## 8. 修订批准, 备份与写入保护

- [ ] 确认三个入口的批准记录都写入共享 `audit-tracker.md`, 并能追溯到 operation, scope, 输入版本和作者决定.
- [ ] 修改前记录正文 SHA-256. 在 structure Audit, draft diagnostics, Character Consult, archetype Audit, prose 单项审计和 AI Detect 后重新计算, 确认正文未变.
- [ ] 在每种审计中提出一个直接改写请求, 检查技能是否停在诊断边界并要求明确修订任务; 记录实际回应.
- [ ] 确认报告中的 recommendation 只是建议, 不会自动变成正文, 故事圣经或作者决定.
- [ ] 每次修订正文前先取得作者批准并建立 backups, 再在写入前校验当前 hash; hash 已变化时停止并要求重新确认证据和范围.
- [ ] 明确授权一次 chapter-revision 后再允许修改. 核对修改范围仅限授权章节和选定 finding, 未顺手进行 AI Rewrite 或其他操作.
- [ ] 恢复修订备份另取明确作者批准; resume, 切换技能或重跑报告不自动恢复备份.

## 9. 跨会话恢复与技能切换

- [ ] 会话结束时在共享 `sessions/` 记录已完成工作, 作者决定, 未决问题, 当前 scope, pending operation 和停止点.
- [ ] 开一个全新的宿主会话, 不依赖上一会话的聊天记忆. 先读持久文件, 再根据证据和依赖恢复下一操作.
- [ ] 在 `write-fiction`, `revise-fiction` 和 `revise-draft` 的稳定 operation 门禁之间逐对双向切换, 确认读取同一 manifest 和共享产物, 没有迁移, 目录分叉或自动恢复写入.
- [ ] 在 staged draft 存在时切换到修订入口再返回, 核对 dependency fingerprint 和当前项目状态; 可复用时重新复核, 依赖不匹配时重新规划, 不直接发布.
- [ ] 切换后重新判断 operation, scope, coverage 和依赖; 可复用证据继续复用, 不匹配证据标为 stale 或要求新审计, 不清空历史记录.
- [ ] 记录恢复过程中实际读了哪些文件, 以及 pending operation 的依据, 而不是只记录 "已恢复上下文". pending action 本身不能作为发布许可.

## 10. 分块终审与三独立视角

三位评审尽可能使用独立上下文; 至少 fresh reader 不得先读故事圣经或预置报告. 全书终审和
当前范围复核都不能由同一次生成同时自封三种视角均已通过.

- [ ] 用超过单次上下文容量的稿件验证 review job 按实际正文 chunks 阅读, 再完成 volume/story-phase synthesis, 最后完成 book synthesis; 每一层都能追溯到源路径, hash 和行范围.
- [ ] 中断并恢复一个 review job, 确认从未完成的 chunk 继续, 已完成正文范围没有漏读或重复计数; 摘要不替代未读正文.
- [ ] **Intent and consistency / 意图与一致性**: 独立评审读取正文和该操作允许使用的故事基础与已批准计划, 检查创作意图, 人物弧线, 时间线, 物品, 知识状态和知情同意规则是否一致.
- [ ] **Writing standards / 写作标准**: 独立评审只读正文和写作标准清单, 检查结构因果, 人物声音, 视角和句子节奏. 不读取 Story Bible, 修订计划, 预置报告或其他评审结论.
- [ ] intent 与 standards 可并行运行; 核对两者没有互相读取结论.
- [ ] **Fresh reader / 新读者**: 按阅读顺序由同一个逻辑 reviewer 阅读, 只携带自己的隔离 reader-state 和目标读者说明; 复述现有情节, 人物动机和 stakes, 指出失去兴趣, 困惑或情绪未落地的位置.
- [ ] 确认 fresh reader 的 reader-state 不含 Story Bible, plans, prior reports, author explanations 或其他 reviewer 的结论; chapter/volume 摘要不能替代实际正文.
- [ ] 只有请求 scope 的实际正文和适用检查全部覆盖时才标记 `full`; 遗漏 chunk 或只做摘要时标记 partial, 不以覆盖率声明弥补.
- [ ] 对 `revise-fiction` 的 `final-review`, 额外检查高潮是否由主角有代价的行动赢得, 完整人物弧线和全书连续性是否闭合.
- [ ] 对 `revise-draft` 的 `current-scope-review`, 把完整结局, 全书节拍和完整弧线等不适用项记为 `skipped`; 不因无结局而给当前稿判定全书失败.
- [ ] 汇总三种视角的分歧, 交作者决定. 复核不能只检查 schema, 也不能把当前范围或里程碑结论表述为全书结论.

## 11. v2/v3.0 迁移与 legacy 验证

只在旧 fixture 的副本上执行本节. 旧阶段快照用于核对转换结果, 不用于指导 v3.1 日常操作.

- [ ] 分别验证统一 `setup-author-toolkit` 路径和 `node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>` 命令路径.
- [ ] 对 v3.0 副本确认增量终态为 schema 3.1.0, 只新增 `paths.creation` 和 creation skeleton 并更新版本字段; 原有 manuscript, reports, findings, approvals, scopes, pending work 和 backups 保持不变.
- [ ] 确认 v3.0 快照位于 `.author-toolkit/migrations/<stamp>-v3_0-v3_1/`; 对 v2 副本确认直达 v3.1, 快照仍位于 `.author-toolkit/migrations/<stamp>-v2-v3/`.
- [ ] 对 v2 副本确认旧 stage 只保留为历史证据, 旧 current stage 转为 `awaiting_author` pending operation; v3.1 不延续 v2 阶段状态机.
- [ ] 确认旧 override 转为共享 tracker 中的 deferred `LEGACY` approval, 未被当成当前批准; 迁移生成的 scope 为 `proposed`, 含可复算 SHA-256, 并由作者确认后才使用.
- [ ] 在无稿件 v2 副本上验证迁移失败且原 manifest 保持不变; 不通过手工修补 manifest 掩盖失败.
- [ ] 对有效 v3.1 项目重复执行迁移, 确认幂等且 `snapshot: null`, 不重复转换或重复写入 legacy approvals.
- [ ] 确认 report v2 和 finding v2 版本不变, creation operations 未加入 report v2 `stage`; 新 creation/review artifacts 使用各自独立契约.
- [ ] 用旧 3.0 工具边界做兼容性说明: 3.1 工具可读取 v3.0, 旧工具可能拒绝 v3.1 或不理解 creation contracts; 不删除 `paths.creation` 或伪造版本号强行兼容.
- [ ] 对 legacy v1 findings 和六个独立技能产物验证原有读取行为, 不把它们批量改写成 v2 或搬入新目录.

## 12. 六个底层 skill 独立调用

每项都单独启动, 单独给输入, 单独保存结果. 不能用一个总控工作流或一次 fiction-workshop
调用冒充其他技能已经运行. 确认 3.1 没有改变它们的名称, 触发方式, 停止点和独立行为.

- [ ] **fiction-workshop**: 独立调用 Developmental Editor 或 Character Consultant, 限定一个范围; 确认它在该 persona 的停止点结束.
- [ ] **story-structure**: 独立对完整三章运行 Audit, 检查 11 个标志节拍, Inciting/Key/FPP 区分和 Faux Climax, 不用人物或句子审计代替.
- [ ] **character-archetypes**: 独立运行 Analyzer 或 Audit, 再把原型判断与 Want/Need/Wound/Lie 对照, 避免把原型标签当作完整人物分析.
- [ ] **narrative-nonfiction**: 使用评审人另行提供且有权使用的短篇叙事非虚构样本独立调用, 检查 transformation arc 或其他适用模式. 不把小说样例硬套进该技能, 也不把这次结果写入 fiction 报告.
- [ ] **prose-mechanics**: 独立选择一种审计运行; 若需覆盖多种, 分次运行并分别生成 findings, 保持句子诊断在结构稳定之后.
- [ ] **avoid-ai-writing**: 独立运行 Detect; 如评估 Rewrite, 另发明确请求并保留前后文本供作者审阅, 不把检测与改写合并成静默修改.

## 13. 双宿主运行

- [ ] 在 **Claude Code** 的新会话中使用一份干净项目副本, 完成目标技能调用, 报告验证和恢复测试, 记录宿主版本与不支持的能力.
- [ ] 在 **Kimi Code** 的新会话中对另一份干净副本执行相同任务, 同样记录证据; 不复用第一宿主的聊天上下文或生成结果.
- [ ] 比较两宿主是否读取同一持久状态, 是否遵守审计停止点, 是否产生可验证 envelope, 是否按依赖处理 stale, 而不是比较逐字输出.
- [ ] 对宿主特有的斜杠命令, 插件发现或文件权限差异分别记录, 不引入中央 workflow runner 来掩盖差异.
- [ ] 验证 14 个技能的安装与发现, 特别是 `write-fiction` 的 user-entry 调用模式; 静态 frontmatter 检查不能替代真实宿主发现.
- [ ] 任一宿主失败时保留失败报告和复现步骤; 另一宿主通过不能抵消该失败. 未实际运行的 3.1 宿主路径明确标为未验证.

## 14. 人工写作质量与规模评价

每次修订或创作批次前后都记录具体引文和理由, 可用 1-5 分帮助比较, 但分数没有自动通过阈值,
也不设固定生成文本. 对未完当前稿只评价已经存在的范围, 不补写假想结局后评分.

- [ ] **结构与因果**: 中点是否改变行动, 关键选择是否造成下一幕, 巧合是否替代了主角决定; 当前稿只评价已有因果链.
- [ ] **高潮与结局**: 对全书检查外部结果是否由有代价的选择赢得; 对无结局当前稿将此项标为不适用, 不虚构缺失结局.
- [ ] **人物**: Ning/林宁的 Lie 是否持续制造问题, Tao/林涛的语气变化是否有触发, Han/韩松是否保持合理反对; 当前稿只要求已有弧线证据.
- [ ] **场景与情绪**: 目标-冲突-结果是否清楚, 私人悲痛和公共记忆是否通过细节落地, consent 后果是否被认真处理.
- [ ] **句子与声音**: 句长, 主动/被动, 具体意象和对话区分是否服务场景; 套语删除后是否仍保留作者意图.
- [ ] **续写一致性**: 新章是否执行已批准计划, 衔接上一章, 尊重人物知识和 open threads; story state 提取遗漏是否影响后续创作.
- [ ] **双语独立质量**: 事实和人物弧线一致, 但中文不是逐字翻译, 英文也不是中文的机械回译; 分别请熟练读者评价自然度.
- [ ] **百万字规模**: 将结构 scale test 与真实百万字稿件的人工质量评价分开记录. 未实际阅读全部正文 chunks, 未完成分层 synthesis 或未做人工评价时, 明确保留未验证状态.
- [ ] 把作者接受, 拒绝和暂缓的 recommendations 写回共享 audit tracker. 自动测试只验证契约与状态, 永不断言某段新生成文字应当逐字出现.
