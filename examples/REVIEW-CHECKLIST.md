# author-toolkit 2.0 人工评审检查清单

本清单用于真实运行技能, 不是自动测试的替代品. `fiction-revision-en` 与 `fiction-revision-zh` 是同一原创故事的两个语言版本, 预置报告和会话记录全部是手写 fixture, 不得写成 "模型运行结果".

## 1. 评审准备与证据

- [ ] 在仓库根目录运行 `npm install`, `npm test`, `npm run validate`, 保存命令结果.
- [ ] 将目标样例复制到 `.test-output/manual-<host>-<language>/`, 后续实验只修改副本, 保留原 fixture 作为对照.
- [ ] 记录宿主, 宿主版本, 模型, 日期, 技能版本, 输入文件版本, 以及每份报告的路径.
- [ ] 每次真实生成报告后, 用 `node scripts/validate.mjs --manifest <project.json> --report <report.md>` 验证副本; 不要把生成文本做成固定快照.
- [ ] 区分三类证据: 契约验证通过, 人工写作评价, 作者决定. 前者不能证明文章质量, 模型建议也不能算作作者同意.

## 2. 完整九阶段流程

按 manifest 中的固定顺序逐项执行. 每个阶段先记录输入, 再记录产物, 未决问题和停止点; 验证器不会也不应代替人或宿主推进阶段.

- [ ] **intake**: 确认语言, `manuscript_root`, 三章正文, 路径和作者目标. 检查没有为了缺失章节信息而虚构 `line: 1`.
- [ ] **story-bible**: 先读故事圣经, 确认 Ning/林宁的 Want, Need, Wound, Lie, Han/韩松的合理反对, 以及录音知情同意规则. 列出未决问题, 交作者决定.
- [ ] **structure**: 独立调用 `story-structure` 的 Audit. 定位实际节拍, 检查中点, 第一无归之门, 假高潮和主角造成高潮结果的因果关系; 只提交 findings, 不改正文.
- [ ] **characters**: 以 Character Consultant 视角检查 Ning/林宁和 Tao/林涛. 核对第二章刻薄玩笑的触发, 第三章转变证据, 以及人物决定是否与故事圣经一致.
- [ ] **revision-plan**: 让作者选择结构方案, 再按因果优先级排列修改. 句子润色不得排在中点和高潮返工之前.
- [ ] **chapter-revision**: 只有收到明确修订授权后才改副本. 每次修改记录对应 finding, 作者决定和故事圣经变化; 不自动扩写任务范围.
- [ ] **prose**: 结构稳定后运行 `prose-mechanics`, 一次只跑一种审计. 检查重复句式, 被动构造, 句长变化和中文表达自然度; 不因英文版的判断直接给中文版下结论.
- [ ] **ai-cleanup**: 先用 `avoid-ai-writing` Detect, 单独审阅 "社区持久力量的见证" 等抽象套语. 只有作者明确要求 Rewrite 时才改写, 并保留检测报告.
- [ ] **final-review**: 完成下方三视角终审, 确认作者已处理高优先级 findings, 再决定是否允许 `current_stage: complete`.

## 3. 中间进入已有项目

- [ ] 从 `structure` 的当前 manifest 启动, 不假装从 `intake` 开始, 也不直接跳到容易执行的 `prose`.
- [ ] 先读 `story-bible.md`, `audit-tracker.md`, 最近的 `sessions/` 记录和 `.author-toolkit/project.json`, 再读报告与正文.
- [ ] 核对当前阶段产物是否存在, 报告 inputs 的版本是否能对应当前文件; 无法对应时标为未追踪或要求作者确认, 不伪造 SHA, Git 提交或作者版本.
- [ ] 解释下游 `stale` 的原因, 保留尚未完成的返工, 不因旧报告 schema 有效就把它当作当前正文的有效审计.
- [ ] 用 `node scripts/validate.mjs --manifest <path>` 检查中间状态; 遇到非法阶段顺序, 缺少 stale reason 或未记录 override 时停止推进.

## 4. 跨会话恢复

- [ ] 在第一会话结束时写下已完成工作, 作者决定, 未决问题和停止点, 使用 `sessions/2026-01-19_resume.md` 作为格式示例.
- [ ] 开一个全新的宿主会话, 不依赖上一会话的聊天记忆. 先读持久文件, 再让作者选择两个未决结构问题.
- [ ] 对照 `sessions/rework-resume.fixture.json` 的 `resume-after-interruption` 快照, 确认仍处于 `structure`, 下游状态没有被静默清除.
- [ ] 完成 structure 重跑后才进入 `characters`; 对照 `structure-rerun-and-characters-resume` 快照, 确认 `revision-plan` 及更下游仍为 `stale`.
- [ ] 再次运行 manifest 和 workflow fixture 验证. 记录恢复过程中实际读了哪些文件, 而不是只记录 "已恢复上下文".

## 5. structure 返工与下游失效

- [ ] 从 `before-rework` 快照开始, 模拟作者否定中点和高潮方案, 明确把 `current_stage` 回退到 `structure`.
- [ ] 将此前完成的 `characters`, `revision-plan`, `chapter-revision` 标为 `stale` 并写具体原因; 正在进行的 `prose` 同样失效.
- [ ] 运行 `node scripts/validate.mjs --workflow-fixture <path>`, 确认返工传播, 恢复和重跑序列通过.
- [ ] 另建临时副本, 故意让一个已完成的下游阶段保持 `complete`, 确认验证失败. 若确需保留它, 必须在该阶段记录人工可审查的 `override_reason`, 不能删除历史原因来规避检查.
- [ ] 重跑顺序为 structure -> characters -> revision-plan -> chapter-revision -> prose; 每个阶段只清除自己已经解决的 stale 状态.

## 6. 审计阶段拒绝修改正文

- [ ] 修改前记录三章正文的 SHA-256, 在 structure Audit, Character Consult, archetype Audit, prose 单项审计和 AI Detect 后重新计算, 确认正文未变.
- [ ] 在每种审计中提出一个直接改写请求, 检查技能是否停在诊断边界并要求明确修订任务; 记录实际回应.
- [ ] 确认报告中的 recommendation 只是建议, 不会自动变成正文, 故事圣经或作者决定.
- [ ] 明确授权一次 chapter-revision 后再允许修改. 核对修改范围仅限授权章节和选定 finding, 未顺手进行 AI Rewrite 或其他阶段工作.

## 7. 六个底层 skill 独立调用

每项都单独启动, 单独给输入, 单独保存结果. 不能用一个总控工作流或一次 fiction-workshop 调用冒充其他技能已经运行.

- [ ] **fiction-workshop**: 独立调用 Developmental Editor 或 Character Consultant, 限定一个范围; 确认它在该 persona 的停止点结束.
- [ ] **story-structure**: 独立对完整三章运行 Audit, 检查 11 个标志节拍, Inciting/Key/FPP 区分和 Faux Climax, 不用人物或句子审计代替.
- [ ] **character-archetypes**: 独立运行 Analyzer 或 Audit, 再把原型判断与 Want/Need/Wound/Lie 对照, 避免把原型标签当作完整人物分析.
- [ ] **narrative-nonfiction**: 使用评审人另行提供且有权使用的短篇叙事非虚构样本独立调用, 检查 transformation arc 或其他适用模式. 不要把小说样例硬套进该技能, 也不要把这次结果写入 fiction 报告.
- [ ] **prose-mechanics**: 独立选择一种审计运行; 若需覆盖多种, 分次运行并分别生成 findings, 保持句子诊断在结构稳定之后.
- [ ] **avoid-ai-writing**: 独立运行 Detect; 如评估 Rewrite, 另发明确请求并保留前后文本供作者审阅, 不把检测与改写合并成静默修改.

## 8. 双宿主运行

- [ ] 在 **Claude Code** 的新会话中使用一份干净项目副本, 完成目标技能调用, 报告验证和恢复测试, 记录宿主版本与不支持的能力.
- [ ] 在 **Kimi Code** 的新会话中对另一份干净副本执行相同任务, 同样记录证据; 不要复用第一宿主的聊天上下文或生成结果.
- [ ] 比较两宿主是否读取同一持久状态, 是否遵守审计停止点, 是否产生可验证 envelope, 是否正确处理 stale, 而不是比较逐字输出.
- [ ] 对宿主特有的斜杠命令, 插件发现或文件权限差异分别记录, 不引入中央 workflow runner 来掩盖差异.
- [ ] 任一宿主失败时保留失败报告和复现步骤; 另一宿主通过不能抵消该失败.

## 9. 三视角终审

三位评审尽可能使用独立上下文; 至少 fresh reader 不得先读故事圣经或预置报告.

- [ ] **Intent and consistency / 意图与一致性**: 独立评审读取正文, Story Bible 和已批准修订计划, 检查创作意图, 人物弧线, 时间线, 物品, 知识状态和知情同意规则是否一致. 核对中英文版本事实, 不把此前的自我评价当成证据.
- [ ] **Writing standards / 写作标准**: 独立评审只读正文和写作标准清单, 检查结构因果, 高潮赢得方式, 人物声音, 视角和句子节奏. 不得读取 Story Bible, 修订计划, 预置报告或其他评审结论.
- [ ] **Fresh reader / 新读者**: 只读正文和目标读者说明, 复述情节, 人物动机和 stakes; 指出失去兴趣, 困惑或情绪未落地的位置, 评价结尾是否由主角行动赢得.
- [ ] 汇总三种视角的分歧, 交作者决定. 终审不能只检查 schema, 也不能由同一次生成同时自封三种视角均已通过.

## 10. 人工写作质量评价

每次修订前后都记录具体引文和理由, 可用 1-5 分帮助比较, 但分数没有自动通过阈值, 也不设固定生成文本.

- [ ] **结构与因果**: 中点是否改变行动, 关键选择是否造成下一幕, 巧合是否替代了主角决定.
- [ ] **高潮与结局**: 外部结果是否由有代价的选择赢得, 转变是否通过行动证明, 是否仍属于假高潮或口号式结局.
- [ ] **人物**: Ning/林宁的 Lie 是否持续制造问题, Tao/林涛的语气变化是否有触发, Han/韩松是否保持合理反对.
- [ ] **场景与情绪**: 目标-冲突-结果是否清楚, 私人悲痛和公共记忆是否通过细节落地, consent 后果是否被认真处理.
- [ ] **句子与声音**: 句长, 主动/被动, 具体意象和对话区分是否服务场景; 套语删除后是否仍保留作者意图.
- [ ] **双语独立质量**: 事实和人物弧线一致, 但中文不是逐字翻译, 英文也不是中文的机械回译; 分别请熟练读者评价自然度.
- [ ] 把作者接受, 拒绝和暂缓的 recommendations 写回 audit tracker. 自动测试只验证契约与状态, 永不断言某段新生成文字应当逐字出现.
