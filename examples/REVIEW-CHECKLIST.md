# author-toolkit 3.0 人工评审检查清单

本清单用于真实运行技能, 不是自动测试的替代品. `fiction-revision-en` 与 `fiction-revision-zh`
是同一原创故事的两个语言版本, 预置报告和会话记录全部是手写 fixture, 不得写成 "模型运行结果".
其中旧 v2 manifest, 阶段状态快照和 override 样例只用于迁移及 legacy 兼容性验证, 不是 v3
项目的操作模板.

## 1. 评审准备与证据

- [ ] 在依赖已就绪的仓库根目录运行 `npm test` 和 `npm run validate`, 保存真实命令结果, 不把历史结果写成本次通过.
- [ ] 将目标样例复制到 `.test-output/manual-<host>-<language>/`, 后续实验只修改副本, 保留原 fixture 作为对照.
- [ ] 记录宿主, 宿主版本, 模型, 日期, 技能版本, operation, `scope_id`, 输入文件版本, coverage, 依赖和每份报告路径.
- [ ] 每次真实生成报告后, 用 `node scripts/validate.mjs --manifest <project.json> --report <report.md>` 验证副本; 不要把生成文本做成固定快照.
- [ ] 区分三类证据: 契约验证通过, 人工写作评价, 作者决定. 前者不能证明文章质量, 模型建议也不能算作作者同意.

## 2. 统一 setup 与共享项目

- [ ] 对 `revise-fiction` 和 `revise-draft` 都先运行同一个 `setup-author-toolkit`; 确认 setup 不接受 workflow 或 entry stage 参数, 两个入口的登记和 intake 行为一致.
- [ ] 确认两个入口使用同一份中性 `.author-toolkit/project.json` (v3), 以及共享的 `audit-tracker.md`, `story-bible.md`, `reports/`, `sessions/`, `backups/` 和 `handoffs/`.
- [ ] 检查 v3 manifest 只将 `current_scope` 与 `pending_action` 作为可选进度字段, 其余内容用于项目登记, 证据和路径; 不读取或手改 v2 阶段状态.
- [ ] 确认没有 `revise-draft` 专属目录或第二套状态. 在两个技能之间切换后直接复用共享产物, 不执行迁移.
- [ ] 登记后核对稿件仍在原路径, 自定义产物路径仍有效; setup 和技能切换都不移动 manuscript, reports 或 backups.

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

## 5. 证据复用与依赖失效

- [ ] 对同一操作重跑时, 同时核对 `operation`, `scope_id`, 输入版本, coverage 和依赖; 只有这些条件匹配时才复用证据.
- [ ] 改变正文, Story Bible, 已批准计划或其他依赖后, 确认直接受影响的证据标为 `stale`, 并沿依赖传播到下游操作.
- [ ] 保留旧报告作为历史证据, 重新运行生成新报告; 不因旧报告 schema 有效就把它当作当前正文的有效审计.
- [ ] 新 scope 必须由作者确认后再使用. 检查 scope 的 SHA-256 对应实际输入, 不伪造 SHA, Git 提交或作者版本.
- [ ] 缩减, 扩大或切换 scope 时重新判断 coverage 和依赖, 不把局部诊断扩展解释为全书结论.
- [ ] 用 `node scripts/validate.mjs --manifest <path>` 检查项目契约; 遇到无法解释的证据来源, 缺失依赖或未确认 scope 时停止推进.

## 6. 批准, 备份与写入保护

- [ ] 确认两个入口的批准记录都写入共享 `audit-tracker.md`, 并能追溯到 operation, scope, 输入版本和作者决定.
- [ ] 修改前记录正文 SHA-256. 在 structure Audit, draft diagnostics, Character Consult, archetype Audit, prose 单项审计和 AI Detect 后重新计算, 确认正文未变.
- [ ] 在每种审计中提出一个直接改写请求, 检查技能是否停在诊断边界并要求明确修订任务; 记录实际回应.
- [ ] 确认报告中的 recommendation 只是建议, 不会自动变成正文, 故事圣经或作者决定.
- [ ] 每次正文修改前先取得作者批准并建立 backups, 再在写入前校验当前 hash; hash 已变化时停止并要求重新确认证据和范围.
- [ ] 明确授权一次 chapter-revision 后再允许修改. 核对修改范围仅限授权章节和选定 finding, 未顺手进行 AI Rewrite 或其他操作.
- [ ] 恢复备份另取明确作者批准; resume, 切换技能或重跑报告不自动恢复备份.

## 7. 跨会话恢复与技能切换

- [ ] 会话结束时在共享 `sessions/` 记录已完成工作, 作者决定, 未决问题, 当前 scope, pending operation 和停止点.
- [ ] 开一个全新的宿主会话, 不依赖上一会话的聊天记忆. 先读持久文件, 再根据证据和依赖恢复下一操作.
- [ ] 从 `revise-fiction` 切换到 `revise-draft`, 再反向切换, 确认读取同一 manifest, tracker, Story Bible, reports, sessions, backups 和 handoffs, 没有迁移或目录分叉.
- [ ] 切换后重新判断 operation, scope, coverage 和依赖; 可复用证据继续复用, 不匹配证据标为 stale 或要求新审计, 不清空历史记录.
- [ ] 记录恢复过程中实际读了哪些文件, 以及 pending operation 的依据, 而不是只记录 "已恢复上下文".

## 8. 三独立视角复核

三位评审尽可能使用独立上下文; 至少 fresh reader 不得先读故事圣经或预置报告. 全书终审和
当前范围复核都不能由同一次生成同时自封三种视角均已通过.

- [ ] **Intent and consistency / 意图与一致性**: 独立评审读取正文和该操作允许使用的故事基础与已批准计划, 检查创作意图, 人物弧线, 时间线, 物品, 知识状态和知情同意规则是否一致.
- [ ] **Writing standards / 写作标准**: 独立评审只读正文和写作标准清单, 检查结构因果, 人物声音, 视角和句子节奏. 不读取 Story Bible, 修订计划, 预置报告或其他评审结论.
- [ ] **Fresh reader / 新读者**: 只读正文和目标读者说明, 复述现有情节, 人物动机和 stakes; 指出失去兴趣, 困惑或情绪未落地的位置.
- [ ] 对 `revise-fiction` 的 `final-review`, 额外检查高潮是否由主角有代价的行动赢得, 完整人物弧线和全书连续性是否闭合.
- [ ] 对 `revise-draft` 的 `current-scope-review`, 把完整结局, 全书节拍和完整弧线等不适用项记为 `skipped`; 不因无结局而给当前稿判定全书失败.
- [ ] 汇总三种视角的分歧, 交作者决定. 复核不能只检查 schema, 也不能把当前范围结论表述为全书结论.

## 9. v2 迁移与 legacy 验证

只在旧 v2 fixture 的副本上执行本节. 旧阶段快照用于核对转换结果, 不用于指导 v3 日常操作.

- [ ] 分别验证统一 `setup-author-toolkit` 路径和 `node <toolkit-root>/scripts/migrate-v3.mjs --project-root <project-root>` 命令路径.
- [ ] 确认迁移前快照位于 `.author-toolkit/migrations/<stamp>-v2-v3/`, 且 manuscript, reports 和 backups 保持原路径, 原报告不被改写.
- [ ] 确认旧 stage 只保留为历史证据, 旧 current stage 转为 `awaiting_author` pending operation; v3 不延续 v2 阶段状态机.
- [ ] 确认旧 override 转为共享 tracker 中的 `LEGACY` approval, deferred 项仍等待作者确认, 未被当成当前批准.
- [ ] 确认迁移生成的 scope 为 `proposed`, 含可复算的 SHA-256, 并由作者确认后才用于后续工作.
- [ ] 在无稿件副本上验证迁移失败且原 manifest 保持不变; 不通过手工修补 manifest 掩盖失败.
- [ ] 重复执行迁移, 确认幂等, 不重复转换或重复写入 legacy approvals.
- [ ] 确认 report v2 和 finding v2 版本不变, 仅 stage 枚举允许 `draft-baseline`, `diagnostics`, `current-scope-review`; 六个独立技能无需迁移.
- [ ] 对 legacy v1 findings 和独立技能产物验证原有读取行为, 不把它们批量改写成 v2 或搬入新目录.

## 10. 六个底层 skill 独立调用

每项都单独启动, 单独给输入, 单独保存结果. 不能用一个总控工作流或一次 fiction-workshop
调用冒充其他技能已经运行. 确认 3.0 没有改变它们的名称, 触发方式, 停止点和独立行为.

- [ ] **fiction-workshop**: 独立调用 Developmental Editor 或 Character Consultant, 限定一个范围; 确认它在该 persona 的停止点结束.
- [ ] **story-structure**: 独立对完整三章运行 Audit, 检查 11 个标志节拍, Inciting/Key/FPP 区分和 Faux Climax, 不用人物或句子审计代替.
- [ ] **character-archetypes**: 独立运行 Analyzer 或 Audit, 再把原型判断与 Want/Need/Wound/Lie 对照, 避免把原型标签当作完整人物分析.
- [ ] **narrative-nonfiction**: 使用评审人另行提供且有权使用的短篇叙事非虚构样本独立调用, 检查 transformation arc 或其他适用模式. 不把小说样例硬套进该技能, 也不把这次结果写入 fiction 报告.
- [ ] **prose-mechanics**: 独立选择一种审计运行; 若需覆盖多种, 分次运行并分别生成 findings, 保持句子诊断在结构稳定之后.
- [ ] **avoid-ai-writing**: 独立运行 Detect; 如评估 Rewrite, 另发明确请求并保留前后文本供作者审阅, 不把检测与改写合并成静默修改.

## 11. 双宿主运行

- [ ] 在 **Claude Code** 的新会话中使用一份干净项目副本, 完成目标技能调用, 报告验证和恢复测试, 记录宿主版本与不支持的能力.
- [ ] 在 **Kimi Code** 的新会话中对另一份干净副本执行相同任务, 同样记录证据; 不复用第一宿主的聊天上下文或生成结果.
- [ ] 比较两宿主是否读取同一持久状态, 是否遵守审计停止点, 是否产生可验证 envelope, 是否按依赖处理 stale, 而不是比较逐字输出.
- [ ] 对宿主特有的斜杠命令, 插件发现或文件权限差异分别记录, 不引入中央 workflow runner 来掩盖差异.
- [ ] 任一宿主失败时保留失败报告和复现步骤; 另一宿主通过不能抵消该失败. 未实际运行的 3.0 宿主路径明确标为未验证.

## 12. 人工写作质量评价

每次修订前后都记录具体引文和理由, 可用 1-5 分帮助比较, 但分数没有自动通过阈值, 也不设固定
生成文本. 对未完当前稿只评价已经存在的范围, 不补写假想结局后评分.

- [ ] **结构与因果**: 中点是否改变行动, 关键选择是否造成下一幕, 巧合是否替代了主角决定; 当前稿只评价已有因果链.
- [ ] **高潮与结局**: 对全书检查外部结果是否由有代价的选择赢得; 对无结局当前稿将此项标为不适用, 不虚构缺失结局.
- [ ] **人物**: Ning/林宁的 Lie 是否持续制造问题, Tao/林涛的语气变化是否有触发, Han/韩松是否保持合理反对; 当前稿只要求已有弧线证据.
- [ ] **场景与情绪**: 目标-冲突-结果是否清楚, 私人悲痛和公共记忆是否通过细节落地, consent 后果是否被认真处理.
- [ ] **句子与声音**: 句长, 主动/被动, 具体意象和对话区分是否服务场景; 套语删除后是否仍保留作者意图.
- [ ] **双语独立质量**: 事实和人物弧线一致, 但中文不是逐字翻译, 英文也不是中文的机械回译; 分别请熟练读者评价自然度.
- [ ] 把作者接受, 拒绝和暂缓的 recommendations 写回共享 audit tracker. 自动测试只验证契约与状态, 永不断言某段新生成文字应当逐字出现.
