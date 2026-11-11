# Author Toolkit 中文快速上手

Author Toolkit 3.1.0 提供增量小说创作, 四个小说修订策略和六个独立写作技能. 创作与修订共享
同一项目证据模型, 支持 Codex, Claude Code 与 Kimi Code. 完整说明见 [英文 README](README.md),
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
| `revise-request` | 从已达到当前草稿修订收敛的全稿基准范围处理存量内容修订请求, 默认只复核请求改动与影响范围, 可选全稿复核. |

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

### Codex

使用下面的通用安装方式. Codex 从项目的 `.agents/skills/` 发现项目级技能, 从
`~/.agents/skills/` 发现用户级技能. 使用 `$` 加准确且不带命名空间的注册技能名调用, 例如
`$setup-author-toolkit`.

### 通用安装

通用安装器需要 Node.js >= 22.20. 默认安装到当前项目:

```bash
npx skills@latest add shengchen1998/author-toolkit -a codex -a claude-code -a kimi-code-cli
```

在命令末尾添加 `-g` 可安装到用户级目录:

```bash
npx skills@latest add shengchen1998/author-toolkit -a codex -a claude-code -a kimi-code-cli -g
```

setup 技能在 `setup-author-toolkit/scripts/` 下提供自包含的安装检查, 预检, manifest 投影, 待处理操作写入, 校验, 状态, 项目导航, 发现项状态和行内字符区间 CLI, 包括运行依赖.
共享工作流直接解析该技能的安装目录, 无需仓库检出, 也无需在写作项目中运行 `npm install`.

运行 `node <setup-skill-root>/scripts/doctor.mjs` 可获得有界安装摘要和失败路径.
它按 `assets/payload-manifest.json` 核对技能的普通载荷文件, 包括 CLI 内部模块.
添加 `--project-root <root>` 可同时核对写作项目的 `AGENTS.md` 和相对符号链接
`CLAUDE.md -> AGENTS.md`; 项目状态校验与宿主命令可见性仍是独立检查.

运行 `node <setup-skill-root>/scripts/preflight.mjs --project-root <root>` 可一次完成载荷和入口文件检查,
项目校验及普通状态汇总; 它复用相同的库实现并输出有界摘要. 默认选择当前范围. 仅在执行门禁场景添加
`--require-execution` 和显式 `--scope-id`; 仅在只读检查通过后需要刷新导航缓存时添加 `--digest`.
文本摘要按 operation 聚合未核对批准, 显示数量与首末批准 ID; 首末端点不代表 ID 连续.

运行 `read.mjs --project-root <root>` 获取有界 manifest 投影; 通过 `set-pending.mjs --help` 查看待处理操作写入参数.

更新需要手动执行:

```bash
npx skills check
npx skills update
```

## 先 setup, 再选择创作或修订入口

根据安装方式选择命令:

| 安装方式 | 宿主 | Setup | 创作 | 全书修订 | 当前草稿修订 | 增量修订 | 请求修订 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 裸技能 | Codex | `$setup-author-toolkit` | `$write-fiction` | `$revise-fiction` | `$revise-draft` | `$revise-increment` | `$revise-request` |
| 插件 | Claude Code | `/author-toolkit:setup-author-toolkit` | `/author-toolkit:write-fiction` | `/author-toolkit:revise-fiction` | `/author-toolkit:revise-draft` | `/author-toolkit:revise-increment` | `/author-toolkit:revise-request` |
| 插件 | Kimi Code | `/skill:author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:write-fiction` | `/skill:author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-draft` | `/skill:author-toolkit:revise-increment` | `/skill:author-toolkit:revise-request` |
| 裸技能 | Claude Code | `/setup-author-toolkit` | `/write-fiction` | `/revise-fiction` | `/revise-draft` | `/revise-increment` | `/revise-request` |
| 裸技能 | Kimi Code | `/skill:setup-author-toolkit` | `/skill:write-fiction` | `/skill:revise-fiction` | `/skill:revise-draft` | `/skill:revise-increment` | `/skill:revise-request` |

`ask-author` 使用相同的命令形式替换技能名.

五个策略都是用户入口, 不要求出现在模型侧 Skill 工具列表中. 只有你确认宿主命令可见性后,
setup 才报告 ready: 在当前宿主的命令面板或自动补全中, 五个策略的准确命令都必须可见;
Codex 使用 `$` 自动补全. 没有技能命令的宿主, 则在技能选择器中确认五个准确注册名. 未确认时, setup 将宿主命令可见性
报告为未验证. 仅展示命令字符串或读取插件/技能的 `enabled` 元数据, 都不能确立宿主命令可见性.

快速流程:

1. 确认写作项目目录. 其中可以有 Markdown 或纯文本稿件, 也可以是新小说的目标目录.
2. 调用 `setup-author-toolkit`, 提供路径并回答项目登记和语言问题. 登记会保留原稿路径.
   共享契约保留在 setup 技能安装目录的 `assets/references/` 中并由运行时直接读取, 不部署到写作项目.
   每次 setup 都会用安装模板覆盖项目根目录的 `AGENTS.md`, 并将普通文件或已有符号链接
   `CLAUDE.md` 替换为指向 `AGENTS.md` 的相对符号链接; 模板保留路由和稿件安全指引,
   操作细节留在安装的技能与 references 中; 这两个文件中的自定义内容不会保留.
   不指定工作流或操作参数. 工具包更新后, 已有 v3.1 项目直接使用更新后的安装契约, 无需再次部署.
   初始 `author-project` 读取, 校验和状态调用会将缺失的安装契约或脚本报告为工具包安装不完整,
   不依赖项目内的共享引用副本. 已有项目使用有界的初始化, 校验和状态参考, 不加载备份,
   恢复和创作提交规则. setup 分别汇总安装载荷、项目入口文件、稿件范围、执行证据.
3. setup 验证共享 manifest 后, 根据目标选择 `write-fiction`, `revise-fiction`,
   `revise-draft`, `revise-increment` 或 `revise-request`. 增量修订用于复用未变章节的可复用证据,
   处理新增或受影响章节并恢复目标范围的当前草稿修订收敛. 请求修订用于从已达到当前草稿修订收敛的
   全稿基准范围处理存量内容, 默认只复核改动及影响范围. 只有明确选择全稿复核时才重新验证全稿目标范围的
   当前草稿修订收敛. 需要时由所选策略建立并确认初始目标范围.
4. 在作者门禁审阅证据和提案. agent 每次只提出一个待决项, 让你先讨论证据和备选方案再作决定.
   展示具体修改前, 先完成上下文适配检查: 阅读完整局部场景及必要历史, 核对指代和连续性,
   人物与物品的熟悉程度和既往接触, 词语与动作重复, 语体与搭配, 请求意图及伏笔/揭示依赖,
   并将准确候选文本放回连续正文复读. 这是编辑判断, 不是 lint, 也不会自动扩大修改或复核范围.
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
需要达到该状态时继续运行 `revise-increment`.

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

1. 核对全稿基准范围和当前草稿修订收敛证据. 尚未达到该状态时先回到 `revise-draft`;
   创作或导入扩大范围时先运行 `revise-increment`.
2. 确认请求结果, 约束, 请求集合, 全稿目标范围和初始工作集合. 默认选择请求复核并声明准确改动,
   受影响段落和必要局部上下文; 也可明确选择全目标范围的当前范围复核.
3. 在备份后只执行获批批次. 按实际文本和依赖变化扩大工作集合, 重跑受影响操作并组合目标范围的
   新操作覆盖度和全目标范围综合报告; 匹配的未变完整局部覆盖单元可以复用.
4. 保留全稿基准范围的当前草稿修订收敛证据所要求的适用子检查, 并加入新请求的检查.
   局部请求不会静默缩小当前草稿修订收敛所需覆盖度.
5. 一轮获批修改完成后, 默认通过 `review_mode=request` 以三个视角只复核声明的改动及受影响段落.
   不静默扩展到整章或全稿. 若作者明确选择全稿复核, 则运行全目标范围的当前范围复核, 由新读者顺序阅读全稿.
6. 从 tracker 的 resolved 和 dismissed 发现项生成 `reports/review_brief.md`. 独立复核结束后归并重复观察,
   保留其 ID 和原决定; 只有相关段落, 事实依据, 依赖或底层问题实质变化时才重新请求决定.
   三个独立 reviewer 和新读者都不读取该摘要.
7. 分别报告请求完成和当前草稿修订收敛. 请求复核不能满足全稿复核要求; 仅执行请求复核后,
   明确说明全稿目标范围的当前草稿修订收敛尚未重新验证.

叙事非虚构请直接调用 `narrative-nonfiction`. 多书籍项目和其他宿主不在 3.1 支持范围内.

## 共享项目产物与证据

五个策略共用中性的 `.author-toolkit/project.json` 和同一组登记路径. 仅支持 schema 3.1.0;
其他 manifest 版本会被拒绝且不会被自动转换.

`author-project read` 通过 `read.mjs` 返回经过校验的有界投影, 包含解析后的路径, 完整当前范围哈希和待处理产物计数.
存在时先读 `PROJECT_STATE.md`; 缓存只用于导航, 不是证据或批准.
`validate` 检查注册文件和当前哈希; `status` 报告当前范围, 待处理操作, 已记录阻塞和执行回执;
`status --digest` 生成发现项计数, 最新指针和下一操作等导航信息. `--scope-id` 筛选未核对批准和
`blocked` 待处理操作, 但 stale 发现项始终覆盖全项目, 因为 tracker 发现项行没有 scope ID.
增加 `--require-execution` 后, 所选范围存在未核对批准时命令退出 1; 这只检查执行证据,
不代表当前草稿修订收敛的其他条件已满足. 不带此标志时, 未核对批准不改变成功退出状态.
`status` 不判断特定操作的证据完整性, 可复用性或当前草稿修订收敛; 这些仍由当前策略按操作门禁评估.
策略在每次判定或声明当前草稿修订收敛, 以及进入要求 previous/base scope 已达到该状态的策略前,
必须运行 strict 检查. 已记录的该状态声明或 `current-scope-review` 待处理操作不能替代该检查. strict 失败时将受影响的
待处理操作记录为 `blocked`; 不会改写批准状态或虚构执行回执.

安装版 `preflight.mjs --project-root <root>` 将一次载荷与入口文件检查, 同一套项目校验和普通状态规则组合执行.
只有显式提供 `--digest` 时才写入项目状态.

- `project.json`: 项目登记, 产物路径, 以及可选的 `current_scope` 和 `pending_action`.
  不包含 `workflow.name`, `current_stage` 或 `stages`.
- 新待处理操作最多内联 8 个产物路径. 更长的完整列表保存在 `.author-toolkit/pending-artifacts.json`,
  由 `pending_action.artifact_index` 指向, 并通过 `set-pending.mjs` 校验和写入.
  没有索引的既有长列表继续有效; setup 和检查不会自动迁移或截断它们.
- 共享运行时契约: 保留在已安装 setup 技能的 `assets/references/` 中并直接读取,
  没有 manifest 字段, 也不复制到写作项目.
- `story-bible.md`: 记录作者意图. 已验收正文建立观察事实; 两者冲突时不能静默覆盖任一来源.
- `audit-tracker.md`: 稳定的发现项 ID, 状态, 作者决定, 共享批准记录和报告指针.
  `author-project next-finding-id` 根据 tracker 和报告历史分配未占用的连续 ID 区段;
  `record-findings` 校验并以原子方式批量更新报告对应的发现项行, 保留已有作者决定和时间戳,
  不再手工追加 Markdown 行.
- `PROJECT_STATE.md`: 生成的导航缓存. 调用 `author-project` 的 `status --digest`, 在共享状态写入后及恢复时重新生成.
  它指向当前范围及哈希, 待处理操作, 发现项计数, 当前计划, 最新会话与报告和下一操作.
  manifest, tracker 和当前证据仍是权威来源; 缓存不提供批准, 也不替代证据读取, 且不读取备份索引.
  常规导航使用缓存指针, 按需读取目标产物或计数, 不输出已登记会话或备份目录的完整文件清单.
  在最新会话中记录 `- Active plan: <project-relative-path>` 和 `- Next action: <concise action>`, 供缓存定位.
  旧 tracker 中的 `Next action` 保留为回退. 最新文件优先使用文件名开头的 UTC 时间戳,
  无时间戳文件使用修改时间. 最新报告扫描排除可丢弃的 `review_brief.md` 决定摘要.
  Read next 部分指向 `author-project status` 以查看已记录阻塞和执行证据,
  并指向 `validate` 以检查当前哈希和缺失路径; `status` 不把缓存作为数据源.
- `reports/`: 诊断上下文和机器可读结果. 重新审计生成新报告, 不覆盖已交付报告. 可复用
  覆盖单元和持续更新的覆盖索引也保存在登记的 reports 路径下. `review_brief.md` 是从 tracker 的
  resolved 和 dismissed 发现项派生的可丢弃摘要, 用于复用决定, 不作为 reviewer 输入或权威决定记录.
  使用 `node <setup-skill-root>/scripts/validate.mjs --review-brief <path> --tracker <path>` 对照 tracker 校验.
- `sessions/`: 已完成工作, 待决事项, 备份路径和停止位置.
- `backups/`: 获批修改前的稿件备份. 其索引还保存 edit 批准的写后执行回执和 restore 批准的完成恢复记录.
  `author-project status` 按范围报告未核对批准, 不读取正文内容, 也不把历史输出与后续文本比较.
  备份本身不能证明执行; 历史回执必须核对后补录, 不能自动推断. 恢复也需要作者批准.
- `handoffs/`: 当前证据和下一操作的交接指针.
- `paths.creation`: 创作产物路径, 默认 `.author-toolkit/creation/`, 包含
  `state/current.md`, `state/chapters/`, `state/volumes/`, `batches/` 和 `staging/`.

章节和卷故事状态从已验收正文和有版本的来源派生, 用于续写; 它不能替代故事圣经的意图或正文事实.
被拒绝的暂存稿不会进入故事状态或正文范围.

实际路径以 manifest 登记为准, 包括自定义位置. 在稳定操作门禁处, 可在 `write-fiction`,
`revise-fiction`, `revise-draft`, `revise-increment` 与 `revise-request` 之间切换并复用这些产物,
无需第二套项目目录或共享状态重置. 切换不会自动恢复待处理写入.

证据是否可以复用, 由 `operation`, `scope_id`, 输入版本, 覆盖度, 子检查和依赖共同判断.
新范围需要作者确认. 输入或依赖变化时, 受影响证据标为 `stale`; 旧报告符合 schema 并不代表
它是当前证据. 创作批次验收不等于当前草稿修订收敛; 增量修订完成后仍按当前草稿操作门禁重新判断.

创作批次还记录计划, 所选上下文和目标输入的依赖指纹. 返回暂存稿时重新计算依赖指纹.
纳入的依赖变化需要重新复核或规划; 无关正文增长只要求刷新发布范围, 不会单独使暂存内容失效.

`pending_action` 只记录一个待执行或等待作者决定的待处理操作, 不是发布或恢复正文写入的许可.

### 暂存, 提交与恢复

AI 草稿先写入 `staging/<batch-id>/`, 作者和混合批次也遵守相同的暂存与验收规则. 提交时,
每个新文件必须仍不存在, 每个已有目标必须匹配已验收输入 hash, 且每个已有目标必须先备份.

提交日志在发布正文前写入. 每个文件通过临时同目录文件校验和原子 rename 发布, 并在每次
状态转换后更新提交日志. 提交日志协调多文件批次, 但不声称整个批次是一个文件系统事务. 中断时
记录已完成和待处理动作, 停止自动发布.

恢复需要单独明确批准, 指明提交或备份以及准确文件. 先为当前内容建立安全备份. 对该批次新建的
文件, 先移入安全备份再从正文稿件移除. 作者外部改动通过 `creation-import` 协调, 不能静默刷新
hash 或故事状态.

### 覆盖度与分块复核

只有来源报告身份, 操作, 准确路径和 hash, 请求的子检查及依赖全部匹配的完整局部覆盖单元才能复用.
原范围保持与来源报告绑定, 组合后的覆盖索引和新综合报告使用目标范围. `partial`, `skipped`,
`stale` 的覆盖单元和综合报告单元都不能复用. 无关修改可保留未受影响的局部覆盖单元, 但受影响的卷,
故事阶段, 当前范围或全书综合报告必须按当前输入重新评价.

大稿件的 `author-review` 先阅读实际正文 chunks, 再综合卷或故事阶段, 最后综合全书. `intent` 与
`standards` 可以并行. 新读者按阅读顺序由同一个逻辑 reviewer 推进, 只携带自己的隔离读者状态.
摘要和提取的故事状态不能替代正文阅读. 请求复核只按顺序读取声明的改动及受影响行段,
不能据此建立全稿新读者阅读链. `full` 只表示所选复核模式要求的单元均完成, 不表示未读的目标范围文本已覆盖.

Finding v2 和 report v2 的版本保持不变, 创作操作不加入封闭的报告 v2 `stage` 枚举.
共享工作流从已安装 setup 技能的 `assets/references/` 直接读取这些契约; 独立技能从各自技能目录读取 finding v1.
创作批次, 提交日志, 故事状态, 覆盖单元和覆盖索引, 复核任务和读者状态使用独立产物契约.
项目登记的源契约为 `references/project-schema-v3.1.json`, 它与其他共享契约一起镜像到已安装 setup 技能中.

随仓库提供的中英文 examples 使用 v3.1 manifests, 保留手写的报告和恢复会话作为校验 fixture.

## 恢复, 切换与返工

在已登记项目中再次调用 `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`
或 `revise-request`, 说明要继续, 审阅报告, 切换策略还是返工. 五个用户入口通过同一份 manifest,
tracker, 故事圣经, 报告, session notes, 备份, handoff 和适用的创作状态恢复上下文,
并根据当前范围, 待处理操作, 证据和依赖决定下一步.

使用其他策略时可以保留暂存稿. 返回后根据依赖指纹和当前项目状态决定重新复核还是重新规划.
策略切换和待处理操作都不会自动发布它.

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
| Codex | `$<skill-name>` |
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

3.1.0 工作树的仓库检查已通过: 176 项协议测试和 13 项默认校验, 详见
[docs/VALIDATION.md](docs/VALIDATION.md). 新增的宿主命令可见性以及有界盘点与导航检查仅为静态契约验证,
不代表新的宿主 setup 运行, 实际宿主命令可见性观察或上下文降噪实测. 通用本地源安装已发现全部 16 个技能, setup 共享载荷,
自包含安装检查与校验 CLI, 项目内 schema 和独立技能本地契约均已验证. Kimi Code 已完成有限范围的创作提交和双向切换验证;
完整宿主流程, `revise-increment` 与 `revise-request` 端到端运行和百万字稿件的创作质量仍未验证.
历史结果单独保留, 不能作为当前版本已通过宿主或质量验证的证据.

## 开发与产物校验

开发包需要 Node.js >= 22, 通用技能安装器需要 Node.js >= 22.20. 修改校验实现后,
重新生成纳入版本控制的 setup 运行镜像:

```bash
npm run sync:setup-runtime
```

安装依赖后在仓库根目录运行以下检查. 部署测试会核对镜像, 并在禁止加载外部运行包的环境中执行安装版载荷, 校验和项目状态 CLI:

```bash
npm test
npm run validate
```

可用对应 CLI 参数直接校验 manifest, report 和新产物. 新参数包括创作批次, 提交日志,
故事状态, 覆盖产物和复核任务; 准确参数名以当前安装的 `--help` 为准:

```bash
node scripts/validate.mjs --help
node scripts/doctor.mjs --project-root /path/to/writing-project
node scripts/preflight.mjs --project-root /path/to/writing-project
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --report /path/to/report.md
node scripts/status.mjs --manifest /path/to/.author-toolkit/project.json --scope-id scope-001
node scripts/range.mjs --project-root /path/to/writing-project "manuscript/1.md:1:56-71"
```

`range.mjs` 解析作者给出的行内字符区间; 行号和字符位置均从 1 开始且包含端点, 字符按 Unicode 码点计数.

这些命令只覆盖仓库级契约, 不代表宿主运行验证或创作质量. 宿主版本, 已完成检查和限制见
[docs/VALIDATION.md](docs/VALIDATION.md).
