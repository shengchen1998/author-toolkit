# Author Toolkit 中文快速上手

Author Toolkit 3.2.0 提供增量小说创作, 四个小说修订策略和六个独立写作技能. 创作与修订共享
同一项目证据模型, 支持 Claude Code 与 Kimi Code. 完整说明见 [英文 README](README.md),
共享用语见 [受控术语表](references/terminology.md).

## 包含的 16 个技能

用户入口:

| 技能 | 用途 |
| --- | --- |
| `ask-author` | 读取项目状态, 引导作者选择合适的用户入口或独立技能. |
| `setup-author-toolkit` | 登记写作项目并初始化创作与修订共用的共享项目状态. |
| `write-fiction` | 通过可审阅创作批次, 暂存稿, 同步故事状态和里程碑复核创作或续写小说. |
| `revise-fiction` | 面向全书, 通过故事圣经, 宏观结构, 完整人物弧线和全书终审进行修订. |
| `revise-draft` | 面向当前正文稿件, 通过草稿基线, 局部叙事诊断和目标范围的当前范围复核进行修订. |
| `revise-increment` | 在增量创作后复用未变章节的可复用证据, 修订新增或受影响章节并完成全目标范围的当前范围复核. |
| `revise-request` | 从已达到当前草稿修订收敛的全稿基准范围出发处理存量内容修订请求, 并恢复全稿目标范围的当前草稿修订收敛. |

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment` 与 `revise-request` 都必须先运行同一个
`setup-author-toolkit`. setup 不接受工作流名称或操作参数, 对所有后续策略使用相同的登记和 `intake` 规则.

共享编排技能为 `author-project`, `author-handoff`, `author-review`. 它们支撑上述用户入口,
不是独立的用户工作流. 六个独立技能为 `fiction-workshop`, `character-archetypes`,
`story-structure`, `narrative-nonfiction`, `prose-mechanics`, `avoid-ai-writing`.
合计 16 个技能.

## 安装

### Claude Code 插件

```bash
claude plugin marketplace add shengchen1998/author-toolkit
claude plugin install author-toolkit@author-toolkit
```

### Kimi Code 插件

```text
/plugins install https://github.com/shengchen1998/author-toolkit
```

然后执行 `/reload`, 或用 `/new` 开始新会话.

### 通用安装

通用安装器需要 Node.js >= 22.20. 默认安装到当前项目:

```bash
npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli
```

在命令末尾添加 `-g` 可安装到用户级目录:

```bash
npx skills@latest add shengchen1998/author-toolkit -a claude-code -a kimi-code-cli -g
```

安装后的 setup 技能包含自包含的 ESM 校验和项目操作 CLI. 它们已打包 Ajv 及全部运行时依赖, 只从该技能的 `assets/references/` 载荷加载 schema, 使用时不需要仓库检出, 项目内运行时副本, npm 安装或网络. 将 `<setup-skill>` 解析为已安装的 `setup-author-toolkit` 目录后运行:

```bash
node <setup-skill>/assets/runtime/validate.mjs --project-root <project-root>
node <setup-skill>/assets/runtime/author-project.mjs --help
```

项目根目录校验先用真实 JSON Schema 校验器检查所选项目, 并在读取项目状态前核对所有已部署共享引用的哈希. 两个 CLI 无参数时都显示帮助. 校验成功退出码为 0, 校验失败为 1, 参数或用法错误为 2.

更新需要手动执行:

```bash
npx skills check
npx skills update
```

## 先 setup, 再选择创作或修订入口

根据安装方式选择命令:

| 安装方式 | 宿主 | Setup | 创作 | 全书修订 | 当前草稿修订 | 增量修订 | 请求修订 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 插件 | Claude Code | `/author-toolkit:setup-author-toolkit` | `/author-toolkit:write-fiction` | `/author-toolkit:revise-fiction` | `/author-toolkit:revise-draft` | `/author-toolkit:revise-increment` | `/author-toolkit:revise-request` |
| 插件 | Kimi Code | `/skill:author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:write-fiction` | `/skill:author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-draft` | `/skill:author-toolkit:revise-increment` | `/skill:author-toolkit:revise-request` |
| 裸技能 | Claude Code | `/setup-author-toolkit` | `/write-fiction` | `/revise-fiction` | `/revise-draft` | `/revise-increment` | `/revise-request` |
| 裸技能 | Kimi Code | `/skill:setup-author-toolkit` | `/skill:write-fiction` | `/skill:revise-fiction` | `/skill:revise-draft` | `/skill:revise-increment` | `/skill:revise-request` |

`ask-author` 使用相同的命令形式替换技能名.

快速流程:

1. 确认写作项目目录. 其中可以有 Markdown 或纯文本稿件, 也可以是新小说的目标目录.
2. 调用 `setup-author-toolkit`, 提供路径并回答项目登记和语言问题. 登记会保留原稿路径.
   setup 将随技能提供的共享契约部署到 `.author-toolkit/references/`; 匹配文件保持不变,
   版本冲突会阻止共享工作流, 经作者批准的替换会先把原文件保存到登记的备份路径下.
   新项目根目录没有 `AGENTS.md` 时, setup 会安装项目级 agent 指令模板; 已有指令文件保持不变.
   不指定工作流或操作参数. 工具包更新后, 已有 v3 项目可能需要再次运行 setup 部署新的共享引用.
   初始 `author-project` 读取, 校验和状态调用会逐个检查随技能提供的文件; 缺失或哈希不匹配时重新引导至 setup,
   不会仅凭有效 manifest 认定共享引用已部署.
3. setup 验证共享 manifest 后, 根据目标选择 `write-fiction`, `revise-fiction`,
   `revise-draft`, `revise-increment` 或 `revise-request`. 增量修订用于复用未变章节的可复用证据,
   处理新增或受影响章节并恢复目标范围的当前草稿修订收敛. 请求修订用于从已达到当前草稿修订收敛的
   全稿基准范围处理存量内容, 并恢复全稿目标范围的同一状态. 需要时由所选策略建立并确认初始目标范围.
4. 在作者门禁审阅证据和提案. agent 每次只提出一个待决项, 让你先讨论证据和备选方案再作决定.
   计划, 正文写入, 创作批次验收和恢复分别需要对应批准.

### `write-fiction`: 增量创作快速路径

创作操作包括:

1. `creation-baseline`: 建立最低限度的创作意图基础和创作状态. 后续情节, 总篇幅,
   人物结局和全书结局可以保持未知.
2. `writing-plan`: 默认一次规划一章, 选择有版本的上下文, 记录准确目标路径和文件动作.
3. `chapter-creation`: 通过 `fiction-workshop` 将 AI 草稿写入 staging, 或暂存作者提供的文本.
4. `chapter-review`: 检查计划执行, 章节衔接和连续性, 由作者验收或拒绝完整创作批次.
5. `creation-commit`: 发布已验收创作批次, 更新故事状态和发布范围, 保存恢复记录.
6. `creation-import`: 协调作者在流程外新增, 修改, 删除或重排的正文文件.
7. `milestone-review`: 汇总作者选择的卷或故事阶段并执行请求的局部检查, 不将其称为全书终审.

重复循环为 `writing-plan` -> `chapter-creation` -> `chapter-review` -> `creation-commit`.
AI, 作者和混合创作使用相同门禁. 每本书只保留一个活动创作批次.

写前必须同时批准章节计划和准确写入批次, 包括路径, 动作和输入版本. staging 后, 一次创作批次
验收覆盖确定的正文内容, 故事状态差异和有序发布范围; 正文与范围批准分别记录. 验收后
`creation-commit` 不再增加作者门禁. 发布本身不代表发布范围已达到当前草稿修订收敛;
首次创作引导的首次非空发布续接同一周期的 `revise-draft`, 建立初始全稿评估;
普通创作后继续运行 `revise-increment`.

### `revise-fiction`: 全书修订

九项操作依次为:

1. `intake`: 明确范围并使用已登记项目.
2. `story-bible`: 建立故事基础和稿件基线.
3. `structure`: 审查宏观结构.
4. `characters`: 审查完整人物弧线和连续性.
5. `revision-plan`: 按发现项和作者决定组织修订计划.
6. `chapter-revision`: 在备份后执行获批的章节修订.
7. `prose`: 进行句子层审查和获批修改.
8. `ai-cleanup`: 按作者要求检测或修改 AI 写作模式.
9. `final-review`: 以三个独立视角完成全书终审并准备交接.

只读结构分析与全书终审无需建立周期即可使用. 正文变更或会使所需证据失效的工作必须从当前
`satisfied` 的全稿起始评估进入已链接的 `revise-fiction` 周期, 保留每项全书门禁,
并在作者明确决定完成周期前恢复全稿的当前草稿修订收敛.

### `revise-draft`: 当前草稿修订

对应的九项操作依次为:

1. `intake`: 明确当前范围并使用同一个已登记项目.
2. `draft-baseline`: 记录现有稿件, 输入版本和目标范围. 允许未完本, 无大纲和无结局.
3. `diagnostics`: 诊断现有文本中的局部叙事问题, 不评价全书完成百分比, 也不把尚未写到的
   未来节拍报告为缺失.
4. `characters`: 只审查目标范围内的人物弧线和连续性.
5. `revision-plan`: 需要改稿时组织发现项和作者决定.
6. `chapter-revision`: 在备份后修改获批的目标范围.
7. `prose`: 进行句子层审查和获批修改.
8. `ai-cleanup`: 按作者要求检测或修改 AI 写作模式.
9. `current-scope-review`: 以三个独立视角复核目标范围, 全书不适用项记录为 `skipped`
   并说明范围理由.

四个修订用户入口共用 `characters` 能力. 当前草稿, 增量与请求路径只要求当前弧线和连续性,
完整全书门禁要求更多人物弧线和全书连续性子检查. 当前草稿任务可以直接进入 `prose` 或
`ai-cleanup`. 不需要改稿时, 可记录原因并跳过 `revision-plan` 和 `chapter-revision`.
直接进入或收窄的请求修订轮次本身不代表已达到当前草稿修订收敛.

独立的局部, 诊断, 直接句子层, AI 关联表达处理和收窄的当前草稿工作可以不建周期,
但不得宣称全稿达到当前草稿修订收敛, 也不会降低最近一次 `satisfied` 全稿轮次的子检查基线. 若稿件尚未达到当前草稿修订收敛,
其他正文变更入口保持阻断, 直到独立全稿 `evaluate-draft` 产生当前 `satisfied` 评估.
该恢复中的已解决发现项必须在改稿前运行 `prepare-draft-revision-execution`, 随后运行
`verify-draft-revision-execution`, 形成 `cycle_id: null` 且实际输入输出经过核对的执行记录.
已激活周期中的当前草稿恢复则链接并评估同一周期. 所有跨入口路由只显示准确的宿主命令并等待作者.

### `revise-increment`: 增量创作后的修订

当前一范围已达到当前草稿修订收敛, 创作或导入新增或影响章节时使用此入口. 例如, 前五章已达到
当前草稿修订收敛后新增第六章, 需要为第六章及受影响的旧文本补齐证据, 不能把创作复核当作修订完成.

增量流程使用相同的九项当前草稿操作和共享项目状态:

1. 确认前一范围, 目标范围, 变化集合和工作集合.
2. 更新全部目标范围的草稿基线, 对工作集合执行诊断, 人物检查, `prose` 和 `ai-cleanup`.
   只有操作, 来源报告, 路径和 hash, 子检查及依赖全部匹配的未变完整局部覆盖单元才能复用.
   缺少可复用覆盖单元的旧章节会加入工作集合.
3. 在备份后只执行获批的工作集合修改, 再组合目标范围的新操作覆盖度和全目标范围综合报告.
4. 运行全目标范围的当前范围复核, 以三个独立视角复核目标范围的全部路径. 新读者顺序阅读
   目标范围的全部路径; 限制修改范围不限制复核阅读范围.
5. 处理复核发现项; 获批修改后重跑受影响操作和复核. 只有证据, 发现项, 批准, 覆盖度和
   复核条件均为当前状态时才声明当前草稿修订收敛.

### `revise-request`: 全稿基准范围达到当前草稿修订收敛后的请求驱动修订

当全稿基准范围已经从 `revise-draft` 视角达到当前草稿修订收敛, 作者对存量内容提出任意类型的
修订请求时使用此入口. 请求可以涉及情节, 场景, 人物, 连续性, 视角, 句子或 `ai-cleanup`;
宏观结构请求可额外使用 `story-structure` Audit, 但不会因此改走 `revise-fiction` 的全书终审门禁.

1. 核对全稿基准范围和当前草稿修订收敛证据. 尚未达到该状态或首次创作引导刚完成首次发布时先回到
   `revise-draft`; 普通创作或导入扩大范围时先运行 `revise-increment`.
2. 确认请求结果, 约束, 请求集合, 全稿目标范围和初始工作集合. 请求集合决定改什么,
   全稿目标范围决定需要重新证明什么.
3. 在备份后只执行获批批次. 按实际文本和依赖变化扩大工作集合, 重跑受影响操作并组合目标范围的
   新操作覆盖度和全目标范围综合报告; 匹配的未变完整局部覆盖单元可以复用.
4. 保留全稿基准范围的当前草稿修订收敛证据所要求的适用子检查, 并加入新请求的检查.
   局部请求不会静默缩小当前草稿修订收敛所需覆盖度.
5. 任何正文修改后重新运行全目标范围的当前范围复核, 新读者顺序阅读目标范围的全部路径.
   处理复核发现项和返工, 分别报告请求完成以及全稿目标范围是否重新达到当前草稿修订收敛;
   请求批次完成本身不等于当前草稿修订收敛.

叙事非虚构请直接调用 `narrative-nonfiction`. 多书籍项目和其他宿主不在 3.2 支持范围内.

## 共享项目产物与证据

五个策略共用中性的 `.author-toolkit/project.json` 和同一组登记路径. 新项目使用
schema 3.2.0; v3.0 和 v3.1 manifest 仍可读取. `scripts/migrate-v32.mjs` 将 v2, v3.0 和
v3.1 项目直接迁移到 v3.2. 现有 `scripts/migrate-v3.mjs` 命令和 `migrateProjectToV3`
函数是具有相同目标的兼容包装.

- `project.json`: 项目登记, 产物路径, 以及可选的 `current_scope` 和 `pending_action`.
  不包含 `workflow.name`, `current_stage` 或 `stages`.
- `.author-toolkit/references/`: setup 从随技能载荷部署的共享运行时契约. 该固定运行目录没有
  manifest 字段. 匹配文件保持不变; 替换冲突文件需要单独批准并先备份.
- `story-bible.md`: 记录作者意图. 已验收正文建立观察事实; 两者冲突时不能静默覆盖任一来源.
- `audit-tracker.md`: 稳定的发现项 ID, 状态, 作者决定, 共享批准记录和报告指针.
- `reports/`: 诊断上下文和机器可读结果. 重新审计生成新报告, 不覆盖已交付报告. 可复用
  覆盖单元和持续更新的覆盖索引也保存在登记的 reports 路径下.
- `sessions/`: 已完成工作, 待决事项, 备份路径和停止位置.
- `backups/`: 获批修改前的稿件备份. 恢复也需要作者批准.
- `handoffs/`: 当前证据和下一操作的交接指针.
- `paths.creation`: 创作产物路径, 默认 `.author-toolkit/creation/`, 包含
  `state/current.md`, `state/chapters/`, `state/volumes/`, `batches/` 和 `staging/`.
- v3.2 的收敛状态根目录默认为 `.author-toolkit/convergence/`. 确认范围后在此保存不可变
  范围快照和正文清单快照. 范围指纹覆盖有序路径/哈希对和排序后的排除项, 不覆盖记录元数据和时间戳.

项目迁移保留正文稿件, 报告, 发现项, 批准, 范围, session, 暂存稿, 备份, 创作批次,
提交日志和待处理操作. 只有精确的旧范围确认才能支持已确认范围快照; 其他旧已确认范围转为
待重新确认的 proposed 范围. 旧报告和待处理操作不会生成 satisfied 评估或已激活的当前草稿收敛周期.
依赖周期的工作必须先协调中断的提交日志和写入. 旧暂存稿只能明确拒绝, 或在当前 satisfied
起始评估存在后进入新周期并精确重新批准. 无法重新验证的旧修订基准通过当前全稿 `revise-draft`
恢复, 覆盖证据仅按正常复用规则处理. 迁移矩阵和恢复规程见 [3.2 迁移指南](docs/MIGRATION-3.2.md).

章节和卷故事状态从已验收正文和有版本的来源派生, 用于续写; 它不能替代故事圣经的意图或正文事实.
被拒绝的暂存稿不会进入故事状态或正文范围.

实际路径以 manifest 登记为准, 包括自定义位置. 在稳定操作门禁处, 可在 `write-fiction`,
`revise-fiction`, `revise-draft`, `revise-increment` 与 `revise-request` 之间切换并复用这些产物,
无需第二套项目目录或迁移. 已激活的当前草稿收敛周期要求正文变更执行其恢复位置指定的下一步,
并阻止并行正文变更周期. 只读检查保持可用, 切换不会自动恢复待处理写入.

### 当前草稿收敛周期

v3.2 在 `<convergence-state-root>/active-cycle.json` 中至多保存一个已激活的当前草稿收敛周期,
已完成记录不可变地保存在 `<convergence-state-root>/cycles/`. 版本化契约记录发起与当前策略,
首次创作引导, 起始与目标范围引用, 请求修订轮次, 恢复位置, 关联产物, 变化集合, 工作集合,
收敛评估引用和完成决定. 请求修订的基准范围与增量修订的前一范围映射到同一个 `starting_scope` 角色.
执行, 复核, 评估和完成引用用于连接后续证据, 引用本身不证明当前草稿修订收敛.

首次创作引导只适用于正文清单实际为空且没有现有范围的 `write-fiction` 项目. 它使用空起始范围,
但不把空正文视为已达到当前草稿修订收敛. 首次非空提交保留暂存, 精确批准, 备份, 提交日志和故事状态规则,
以 null `scope_before_id` 关联首个创作批次, 并续接同一周期的 `revise-draft`. 初始全稿修订轮次关联首次发布,
复核证据, `satisfied` 评估和显式完成决定. 空正文永远不能通过评估或完成周期. 后续创作只能走普通 satisfied
起始门禁和单提交规则, 不能再次使用首次创作引导.

普通启动要求当前 `satisfied` 的起始收敛评估. 有效全稿范围, 待处理操作或调用方声明都不能伪造该结果;
证据缺失时以 `starting-evaluation-indeterminate` 阻止启动. 只有最新的已完成周期评估或独立评估可以作为起点;
较新的收窄, `not_satisfied` 或 `indeterminate` 独立评估会阻止启动, 不能再回退到较早的 `satisfied` 记录开门.
之后取得当前 `satisfied` 评估即可恢复普通启动.

通过可执行 `author-project` 门面运行周期操作:

```bash
node <setup-skill>/assets/runtime/author-project.mjs start-cycle --project-root <project-root> --input <request.json>
node <setup-skill>/assets/runtime/author-project.mjs transition-cycle --project-root <project-root> --input <transition.json>
node <setup-skill>/assets/runtime/author-project.mjs reconcile-cycle --project-root <project-root> [--input <direction.json>]
node <setup-skill>/assets/runtime/author-project.mjs prepare-draft-revision-execution --project-root <project-root> --input <independent-preparation.json>
node <setup-skill>/assets/runtime/author-project.mjs verify-draft-revision-execution --project-root <project-root> --input <independent-verification.json>
node <setup-skill>/assets/runtime/author-project.mjs prepare-revision-execution --project-root <project-root> --input <preparation.json>
node <setup-skill>/assets/runtime/author-project.mjs verify-revision-execution --project-root <project-root> --input <verification.json>
node <setup-skill>/assets/runtime/author-project.mjs evaluate-cycle --project-root <project-root> --input <evaluation-request.json>
node <setup-skill>/assets/runtime/author-project.mjs evaluate-draft --project-root <project-root> --input <independent-evaluation.json>
node <setup-skill>/assets/runtime/author-project.mjs complete-cycle --project-root <project-root> --input <completion.json>
node <setup-skill>/assets/runtime/author-project.mjs cycle-status --project-root <project-root>
node <setup-skill>/assets/runtime/author-project.mjs cycle-gate --project-root <project-root>
```

第二个正文变更周期返回 `active-cycle-exists`, 并给出当前周期要求的策略, 操作和命令.
续接先获取跨进程锁目录, 在锁内重新读取并核对周期 ID 和预期 revision, 再核对引用产物哈希并原子更新.
同一预期 revision 只能有一个写入成功, 后续写入返回 `cycle-revision-conflict`. 锁超时或异常不会报告成功,
崩溃遗留的锁目录必须核对 owner 后明确恢复.

依赖操作先记录 manifest `cycle_operation`, 再发布产物并推进 active cycle, 最后在 manifest 收尾时清除协调记录.
完成操作先写 completed history 和 `last_completed_cycle`, 再删除内容符合预期的 active 记录. 中断会以具体周期,
revision, 操作, 范围或产物错配阻断依赖工作, 只读状态查询仍可用. 不带 direction 运行 `reconcile-cycle` 只做只读诊断.
恢复方向只接受, 挂接, 续接, 放弃或完成同一项预期工作, 不改写评估, 批准, 提交日志, 备份或 verified 执行.
待处理操作仍只描述当前操作和作者门禁, 其周期, revision, 操作和范围指纹字段仅是协调引用, 不拥有周期,
也不授权正文写入, 发布, 恢复或完成. 这些文件通过协调恢复保持一致, 不构成多文件文件系统事务.

请求驱动修改在 `executions/` 下保存修订执行记录. 准备操作核对已有作者决定, 准确编辑批准, 备份清单及字节和当前输入哈希,
不会伪造批准或写入正文. 计划决定与编辑批准绑定计划和批次身份及哈希, 操作, 输入范围指纹, 完整有序路径, 动作,
输入哈希和获批输出; 相同范围 ID 不能让旧批准授权新内容. 验证操作按准备阶段的哈希重读实际输出字节,
并绑定最终请求修订轮次和全稿目标范围. 最终轮次保留准备阶段的全部操作和子检查, 只能增加要求.
纯插入和删除不会误报保留路径重排; 真实保留路径重排仍需准确的获批动作. `prepared` 不能满足当前草稿修订收敛.
已解决发现项要求当前 verified 执行; defer 和 dismiss 保留作者决定, 获批的复核返工需要新的受影响覆盖度和全目标范围的当前范围复核.
后续获批批次保留先前 verified 执行作为历史证据.

全稿无修改跳过路径记录请求修订轮次指纹, 继承与新增子检查, 带哈希的覆盖证据, 无修改作者决定,
三视角复核组, 完整新读者链和语义证明. `evaluate-cycle` 根据证据推导结果并生成不可变证据图,
调用方不能直接填写结果. 评估器可以复用前一轮符合要求的局部覆盖单元, 但当前轮次仍需新的全目标范围索引,
综合报告和复核组. satisfied 后更换请求修订轮次会使旧目标评估在状态, 门禁和完成检查中失效.
只要周期的发起或当前策略为 `revise-fiction`, 包括 request→fiction 和 draft→fiction 工作,
就必须让故事圣经, 结构和全书终审证据绑定当前轮次与范围; 只有当前范围复核不能满足全书操作门禁.
链接修订执行后, 活跃周期必须先满足全书证据并明确完成, 才能切换到其他策略.

完成需要单独明确的作者完成决定. 操作先把决定追加到 tracker, 再根据变化后的 tracker 哈希重新计算并保存评估,
先发布 completed history 和已完成周期指针, 再删除 active 状态; 只有新评估仍为 `satisfied` 时才完成周期.
确定性检查验证证据身份和结构, 但实际阅读与编辑判断仍以宿主和逻辑读者的
语义证明以及记录的作者决定为信任边界. 状态查询还独立返回 `request_completion`: 请求批次和决定可以已经完成,
而全稿证据尚未达到 `satisfied`.

独立收敛状态和收敛门禁查询均为只读:

```bash
node <setup-skill>/assets/runtime/validate.mjs --convergence-status <manifest-path>
node <setup-skill>/assets/runtime/validate.mjs --convergence-gate <manifest-path>
```

有效状态查询对 `satisfied`, `not_satisfied` 或 `indeterminate` 都正常退出. 门禁只有当前证据为
`satisfied` 时才通过. 证据缺失返回 `indeterminate`, `current: false` 和结构化阻断原因,
不妨碍状态查询, 诊断或复核.

### 证据复用与待处理操作

证据是否可以复用, 由 `operation`, `scope_id`, 输入版本, 覆盖度, 子检查和依赖共同判断.
新范围需要作者确认. 输入或依赖变化时, 受影响证据标为 `stale`; 旧报告符合 schema 并不代表
它是当前证据. 创作批次验收不等于当前草稿修订收敛; 增量修订完成后仍按当前草稿操作门禁重新判断.

创作批次还记录计划, 所选上下文和目标输入的依赖指纹. 返回暂存稿时重新计算依赖指纹.
纳入的依赖变化需要重新复核或规划; 无关正文增长只要求刷新发布范围, 不会单独使暂存内容失效.

`pending_action` 只记录一个待执行或等待作者决定的待处理操作. 可选周期, revision, 操作和范围指纹字段
只用于协调同一项工作, 不是周期历史, 也不是正文写入, 发布, 恢复, 完成或续作的许可.

### 暂存, 提交与恢复

AI 草稿先写入 `staging/<batch-id>/`, 作者和混合批次也遵守相同的暂存与验收规则. 提交时,
每个新文件必须仍不存在, 每个已有目标必须匹配已验收输入 hash, 且每个已有目标必须先备份.

提交日志在发布正文前写入. 每个文件通过临时同目录文件校验和原子 rename 发布, 并在每次
状态转换后更新提交日志. 提交日志协调多文件批次, 但不声称整个批次是一个文件系统事务. 中断时
记录已完成和待处理动作, 停止自动发布.

恢复需要单独明确批准, 指明提交或备份以及准确文件. 先为当前内容建立安全备份. 对该批次新建的
文件, 先移入安全备份再从正文稿件移除. 作者外部改动通过 `creation-import` 协调, 不能静默刷新
hash 或故事状态.

`author-project reconcile-manuscript` 核对 tracker 中准确的导入决定, 当前正文清单,
已确认范围或空目标以及故事状态来源, 并保存不可变的正文协调记录. 活跃周期内,
它扩展同一周期的目标范围, 变化集合和工作集合, 不改写起始快照. 只有前一全稿范围的
`satisfied` 证据仍可证明时才使用 `revise-increment`; 否则执行全稿 `revise-draft`.
全部删除不能满足或完成周期; 必须经过批准的非空恢复或导入, 再执行全稿 `revise-draft`.
该命令不写正文, 也不替代备份, 恢复或输入 hash 批准. 首次创作引导中,
活跃周期允许空起始范围, 因此首份经过批准的非空导入可以不经过创作提交,
直接提供首次发布证据, 但仍须通过 initial full-manuscript `revise-draft` 评估和完成.
空 bootstrap 批次被拒绝后, 没有这种导入或发布证据就不能完成.
后续 bootstrap 导入和修订仍保留空累计起点, 并形成统一有序事件链.
真实创作提交的 scope_before 必须衔接起始范围或空起点, scope_after 必须通过现有批次,
提交日志, 批准和已验证文件转换检查; 后续导入或执行不能省略该提交事件.
每个协调记录的前一范围或执行输入范围必须衔接前一事件的目标范围, 每个事件都重新验证一次,
最终目标必须与当前范围一致. 空协调是等待非空恢复的合法中间状态, 不是完成目标.
链缺口, 跳过空状态和伪造目标仍会阻断当前草稿修订收敛.
所有周期外协调都必须显式提供 previous_scope; 只有经过验证的空稿恢复才能显式设为 null,
省略该字段会在任何写入前被拒绝.

### 覆盖度与分块复核

只有来源报告身份, 操作, 准确路径和 hash, 请求的子检查及依赖全部匹配的完整局部覆盖单元才能复用.
原范围保持与来源报告绑定, 组合后的覆盖索引和新综合报告使用目标范围. `partial`, `skipped`,
`stale` 的覆盖单元和综合报告单元都不能复用. 无关修改可保留未受影响的局部覆盖单元, 但受影响的卷,
故事阶段, 当前范围或全书综合报告必须按当前输入重新评价.

大稿件的 `author-review` 先阅读实际正文 chunks, 再综合卷或故事阶段, 最后综合全书. `intent` 与
`standards` 可以并行. 新读者按阅读顺序由同一个逻辑 reviewer 推进, 只携带自己的隔离读者状态.
摘要和提取的故事状态不能替代正文阅读. 只有实际覆盖目标范围时才报告 `full`.

Finding v2 和 report v2 的版本保持不变, 创作操作不加入封闭的报告 v2 `stage` 枚举.
共享工作流从 `.author-toolkit/references/` 读取这些契约; 独立技能从各自技能目录读取 finding v1.
创作批次, 提交日志, 故事状态, 覆盖单元和覆盖索引, 复核任务和读者状态使用独立产物契约.
外部变化使用封闭的 `references/manuscript-reconciliation-schema.json` 产物契约,
manifest 的可选 `manuscript_reconciliation` 字段指向最新不可变正文协调记录.
项目登记的源契约为 `references/project-schema-v3.2.json`, setup 将其与其他共享契约一起部署到写作项目;
v3.0 和 v3.1 schema 保留用于读取和升级旧项目.

迁移说明见 [docs/MIGRATION-3.2.md](docs/MIGRATION-3.2.md). 历史说明保留在
[docs/MIGRATION-3.1.md](docs/MIGRATION-3.1.md), [docs/MIGRATION-3.0.md](docs/MIGRATION-3.0.md) 和
[docs/MIGRATION-2.0.md](docs/MIGRATION-2.0.md).

随仓库提供的中英文 examples 有意保留 legacy v2 manifests 和 workflow fixtures 用于兼容性测试,
不要为了显得最新而原地迁移它们.

## 恢复, 切换与返工

在已登记项目中再次调用 `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`
或 `revise-request`, 说明要继续, 审阅报告, 切换策略还是返工. 五个用户入口通过同一份 manifest,
tracker, 故事圣经, 报告, session notes, 备份, handoff 和适用的创作状态恢复上下文,
并根据当前范围, 待处理操作, 证据和依赖决定下一步.

只读工作或当前周期要求的修订策略执行期间可以保留暂存稿, 并行正文变更周期仍被阻止.
返回后根据依赖指纹和当前项目状态决定重新复核还是重新规划. 策略切换和待处理操作都不会自动发布它.

恢复备份需要明确请求和作者确认. 继续流程, 切换技能或重新生成报告不会自动恢复备份, 也不会自动
改写旧报告.

## 独立技能

六个旧技能保留原名称, 触发方式和独立行为, 可以不进入共享创作或修订流程直接调用:

| 技能 | 用途示例 |
| --- | --- |
| `fiction-workshop` | "以发展编辑视角分析第 3 章." |
| `character-archetypes` | "分析这个角色的原型组合." |
| `story-structure` | "审计这份稿件的宏观结构." |
| `narrative-nonfiction` | "设计这本书的读者转变弧线." |
| `prose-mechanics` | "对第 7 章运行 echoes 审计." 共 19 项独立审计, 中文 AI-Isms 也走这里. |
| `avoid-ai-writing` | "仅检测这一章英文文本的 AI 写作模式, 不改写." 上游独立目录保留英文规则. |

独立技能的命令模式:

| 安装方式 | 命令模式 |
| --- | --- |
| Claude Code 插件 | `/author-toolkit:<skill-name>` |
| Kimi Code 插件 | `/skill:author-toolkit:<skill-name>` |
| Claude Code 裸技能 | `/<skill-name>` |
| Kimi Code 裸技能 | `/skill:<skill-name>` |

中文 AI 写作检测或改写请调用 `prose-mechanics` 的 AI-Isms 审计. 它使用本地中文目录;
独立上游 `avoid-ai-writing` 保持英文专用. 共享 `ai-cleanup` 会按实际中英文片段选择对应程序.
AI 关联发现只描述文本模式, 不能证明文本由 AI 生成.

## 语言与格式支持

共享流程处理 Markdown 和纯文本, 核心语言为中文和英文. 中文 `prose` 审计使用
`skills/prose-mechanics/references/chinese-rules.md`, 包括中文分句, 字符计数, 分词方法声明,
中文语法规则及本地词表. 中文 `full` 表示请求的中文子检查已完整执行, 不表示英文指标或
英文检测器获得了等价结果. 未实际执行的片段和子检查仍须记录为 `partial` 或 `skipped`.

工作流报告标题, tracker 列名和状态值继续固定使用英文, 作为机器可读 Markdown 契约.
中文说明, 发现项文本, 引文和稿件路径可正常使用中文. JSON 字段, 机器键和封闭枚举
继续遵循原有版本契约. 其他语言使用文档中的降级规则. 自然语言使用
[受控术语表](references/terminology.md) 中的固定中文用语.

## 验证状态

当前 3.2.0 的仓库检查已通过: 339 项协议测试和 19 项默认校验, 详见
[docs/VALIDATION.md](docs/VALIDATION.md). 通用本地源安装已发现并复制全部 16 个技能, setup 共享载荷,
项目内 schema 和独立技能本地契约均已验证. Kimi Code 2.4.1 已在一次性项目验证 setup, 首次创作基线,
写作计划, staging, 章节复核, 首次发布与中断提交恢复, 普通创作基线, 发布后阻断, 增量与当前草稿 intake, 请求修订 intake 和迁移路由;
四个长时间调用在有效产物写入后超时. 完整宿主评估与周期完成, 请求和增量端到端恢复, Claude Code,
原生插件安装及百万字稿件的创作质量仍未验证. 3.1, 3.0 和 2.0 的历史结果单独保留,
不能作为 3.2 已通过宿主或质量验证的证据.

## 开发与产物校验

开发包需要 Node.js >= 22, 通用技能安装器需要 Node.js >= 22.20. 安装依赖后, 在源码变更时重新生成已纳入版本控制的运行时, 检查生成结果是否最新, 运行真实安装器 smoke, 再执行完整协议测试和仓库校验:

```bash
npm run build:runtime
npm run check:runtime
npm run smoke:installed
npm test
npm run validate
```

`npm test` 已包含生成运行时一致性检查和隔离真实安装器 smoke. smoke 在一次性目录中运行通用安装器, 删除临时源副本后不依赖仓库依赖执行安装后的 CLI; 它不证明宿主技能发现或创作质量.

仓库校验必须显式使用 `--repository`, 项目校验必须显式使用 `--project-root`. 无参数调用只显示帮助, 不检查隐式状态; 两种模式不能互相组合, 也不能与单项检查组合. 可用对应 CLI 参数直接校验 manifest, report 和新产物. 新参数包括范围快照, 正文清单快照, 创作批次, 提交日志, 故事状态, 覆盖产物和复核任务; 准确参数名以 `--help` 为准:

```bash
node scripts/validate.mjs --help
node scripts/validate.mjs --repository
node scripts/validate.mjs --project-root /path/to/writing-project
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --scope-snapshot /path/to/scope.json
node scripts/validate.mjs --inventory-snapshot /path/to/inventory.json
node scripts/validate.mjs --report /path/to/report.md
```

这些命令只覆盖仓库级契约, 不代表宿主运行验证或创作质量. 宿主版本, 已完成检查和限制见
[docs/VALIDATION.md](docs/VALIDATION.md).
