# Author Toolkit 中文快速上手

Author Toolkit 3.1.0 提供增量小说创作, 四个小说修订策略和六个独立写作技能. 创作与修订共享
同一项目证据模型, 支持 Claude Code 与 Kimi Code. 完整说明见 [英文 README](README.md).

## 包含的 16 个技能

用户入口:

| 技能 | 用途 |
| --- | --- |
| `ask-author` | 读取项目状态, 引导作者选择合适的入口或独立技能. |
| `setup-author-toolkit` | 登记写作项目并初始化创作与修订入口共用的项目状态. |
| `write-fiction` | 通过可审阅写作批次, staging, 同步 story state 和里程碑复核创作或续写小说. |
| `revise-fiction` | 面向全书, 通过 Story Bible, 宏观结构, 完整人物弧线和全书终审进行修订. |
| `revise-draft` | 面向当前稿, 通过稿件基线, 局部叙事诊断和当前范围复核进行修订. |
| `revise-increment` | 在增量创作后复用未变章节的有效证据, 修订新增或受影响章节并完成 full-target current-scope review. |
| `revise-request` | 在完整当前稿已达到当前草稿修订收敛后处理任意类型的存量内容修订请求, 并恢复全稿的当前草稿修订收敛. |

`write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment` 与 `revise-request` 都必须先运行同一个
`setup-author-toolkit`. setup 不接受 workflow 名称或 entry stage 参数, 对所有后续策略使用
相同的登记和 intake 规则.

共享编排技能为 `author-project`, `author-handoff`, `author-review`. 它们支撑上述入口,
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

更新需要手动执行:

```bash
npx skills check
npx skills update
```

## 先 setup, 再选择创作或修订入口

根据安装方式选择命令:

| 安装方式 | 宿主 | Setup | 创作 | 全书修订 | 当前稿修订 | 增量修订 | 请求修订 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 插件 | Claude Code | `/author-toolkit:setup-author-toolkit` | `/author-toolkit:write-fiction` | `/author-toolkit:revise-fiction` | `/author-toolkit:revise-draft` | `/author-toolkit:revise-increment` | `/author-toolkit:revise-request` |
| 插件 | Kimi Code | `/skill:author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:write-fiction` | `/skill:author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-draft` | `/skill:author-toolkit:revise-increment` | `/skill:author-toolkit:revise-request` |
| 裸技能 | Claude Code | `/setup-author-toolkit` | `/write-fiction` | `/revise-fiction` | `/revise-draft` | `/revise-increment` | `/revise-request` |
| 裸技能 | Kimi Code | `/skill:setup-author-toolkit` | `/skill:write-fiction` | `/skill:revise-fiction` | `/skill:revise-draft` | `/skill:revise-increment` | `/skill:revise-request` |

`ask-author` 使用相同的命令形式替换技能名.

快速流程:

1. 确认写作项目目录. 其中可以有 Markdown 或纯文本稿件, 也可以是新小说的目标目录.
2. 调用 `setup-author-toolkit`, 提供路径并回答项目登记和语言问题. 登记会保留原稿路径.
   新项目根目录没有 `AGENTS.md` 时, setup 会安装项目级 agent 指令模板; 已有指令文件保持不变.
   不指定 workflow 或 entry stage.
3. setup 验证共享 manifest 后, 根据目标选择 `write-fiction`, `revise-fiction`,
   `revise-draft`, `revise-increment` 或 `revise-request`. 增量修订用于复用未变章节的有效证据,
   处理新增或受影响章节并恢复整个目标范围的当前草稿修订收敛. 请求修订用于在全稿已收敛后处理存量内容
   并重新收敛. 需要时由所选策略建立并确认初始 scope.
4. 在作者确认节点审阅证据和提案. agent 每次只提出一个待决项, 让你先讨论证据和备选方案
   再作决定. 计划, 正文写入, 批次验收和 restore 分别需要对应授权.

### `write-fiction`: 增量创作快速路径

创作操作包括:

1. `creation-baseline`: 建立最低限度的创作意图基础和 creation state. 后续情节, 总篇幅,
   人物结局和全书结局可以保持未知.
2. `writing-plan`: 默认一次规划一章, 选择有版本的上下文, 记录准确目标路径和文件动作.
3. `chapter-creation`: 通过 `fiction-workshop` 将 AI 草稿写入 staging, 或暂存作者提供的文本.
4. `chapter-review`: 检查计划执行, 章节衔接和连续性, 由作者验收或拒绝完整批次.
5. `creation-commit`: 发布已验收批次, 更新 story state 和 scope, 保存恢复记录.
6. `creation-import`: reconcile 作者在流程外新增, 修改, 删除或重排的正文文件.
7. `milestone-review`: 汇总作者选择的卷或故事阶段并执行请求的局部检查, 不将其称为全书终审.

重复循环为 `writing-plan` -> `chapter-creation` -> `chapter-review` -> `creation-commit`.
AI, 作者和混合创作使用相同门禁. 每本书只保留一个 active creation batch.

写前必须同时批准章节计划和准确写入批次, 包括路径, 动作和输入版本. staging 后, 一次批次
验收覆盖确定的正文内容, story state 差异和有序 scope; 正文与 scope 批准分别记录. 验收后
`creation-commit` 不再增加作者门禁. 发布本身不代表扩大后的 scope 已完成 revision 收敛;
需要收敛时继续运行 `revise-increment`.

### `revise-fiction`: 全书修订

九阶段依次为:

1. `intake`: 明确范围并使用已登记项目.
2. `story-bible`: 建立故事基础和稿件基线.
3. `structure`: 审查宏观结构.
4. `characters`: 审查完整人物弧线和连续性.
5. `revision-plan`: 按发现项和作者决定组织修订计划.
6. `chapter-revision`: 在备份后执行获批的章节修订.
7. `prose`: 进行句子层审查和获批修改.
8. `ai-cleanup`: 按作者要求检测或修改 AI 写作模式.
9. `final-review`: 以三个独立视角完成全书终审并准备 handoff.

### `revise-draft`: 当前稿修订

镜像九阶段依次为:

1. `intake`: 明确当前范围并使用同一个已登记项目.
2. `draft-baseline`: 记录现有稿件, 输入版本和选定范围. 允许未完本, 无大纲和无结局.
3. `diagnostics`: 诊断现有文本中的局部叙事问题, 不评价全书完成百分比, 也不把尚未写到的
   未来节拍报告为缺失.
4. `characters`: 只审查当前范围内的人物弧线和连续性.
5. `revision-plan`: 需要改稿时组织发现项和作者决定.
6. `chapter-revision`: 在备份后修改获批的当前稿范围.
7. `prose`: 进行句子层审查和获批修改.
8. `ai-cleanup`: 按作者要求检测或修改 AI 写作模式.
9. `current-scope-review`: 以三个独立视角复核当前范围, 全书不适用项记录为 `skipped`
   并说明范围理由.

四个修订入口共用 characters 能力. 当前稿, 增量与请求路径只要求当前弧线和连续性, 完整全书门禁要求
更多人物弧线和全书连续性子检查. 当前稿任务可以直接进入 `prose` 或 `ai-cleanup`. 不需要改稿时,
可记录原因并跳过 `revision-plan` 和 `chapter-revision`. 直接或有限范围任务本身不代表当前稿
已完全收敛.

### `revise-increment`: 增量创作后的修订

当原有 scope 已达到当前草稿修订收敛, 创作或导入新增或影响章节时使用此入口. 例如, 前五章收敛后
新增第六章, 需要为第六章及受影响的旧文本补齐证据, 不能把创作复核当作修订完成.

增量流程使用相同的九项当前稿操作和共享状态:

1. 确认原收敛 scope, 完整目标 scope, change set 和 work set.
2. 更新完整目标基线, 对 work set 执行诊断, 人物检查, prose 和 AI cleanup. 只有 operation,
   source report, 路径和 hash, subchecks 及依赖全部匹配的未变 full local units 才能复用.
   缺少可复用单元的旧章节会加入 work set.
3. 在备份后只执行获批的 work set 修改, 再组合新的目标范围 coverage 和 syntheses.
4. 运行 full-target current-scope review, 以三个独立视角复核完整 target scope. fresh reader 顺序阅读
   完整 target scope; 限制修改范围不限制复核阅读范围.
5. 处理复核 findings; 获批修改后重跑受影响操作和复核. 只有证据, findings, 批准, coverage 和
   复核条件均为当前状态时才声明当前草稿修订收敛.

### `revise-request`: 已收敛全稿的请求驱动修订

当完整当前稿已经从 `revise-draft` 视角达到当前草稿修订收敛, 作者对存量内容提出任意类型的修订请求时使用此入口.
请求可以涉及情节, 场景, 人物, 连续性, 视角, 句子或 AI cleanup; 宏观结构请求可额外使用
`story-structure` Audit, 但不会因此改走 `revise-fiction` 的全书终审门禁.

1. 核对完整当前稿的 base scope 和当前草稿修订收敛证据. 未收敛时先回到 `revise-draft`; 创作或导入扩大范围时
   先运行 `revise-increment`.
2. 确认请求结果, 约束, request set, 完整 target scope 和初始 work set. request set 决定改什么,
   完整 target scope 决定需要重新证明什么.
3. 在备份后只执行获批批次. 按实际文本和依赖变化扩大 work set, 重跑受影响操作并组合新的 full-target
   coverage 和 syntheses; 匹配的未变 full local units 可以复用.
4. 保留原收敛 pass 的适用 subchecks, 并加入新请求的检查. 局部请求不会静默缩小收敛所需 coverage.
5. 任何正文修改后重新运行 full-target current-scope review, fresh reader 顺序阅读完整 target scope.
   处理复核 findings 和返工, 分别报告请求是否完成以及完整 target scope 是否重新达到当前草稿修订收敛;
   请求批次完成本身不等于当前草稿修订收敛.

叙事非虚构请直接调用 `narrative-nonfiction`. 多书籍项目和其他宿主不在 3.1 支持范围内.

## 共享项目产物与证据

五个策略共用中性的 `.author-toolkit/project.json` 和同一组登记路径. 新项目和迁移终态使用
schema 3.1.0; v3.0 manifest 仍可读取, 并可进行增量 3.1 升级.

- `project.json`: 项目登记, 产物路径, 以及可选的 `current_scope` 和 `pending_action`.
  不包含 `workflow.name`, `current_stage` 或 `stages`.
- `story-bible.md`: 记录作者意图. 已验收正文建立 observed facts; 两者冲突时不能静默覆盖任一
  来源.
- `audit-tracker.md`: 稳定的发现项 ID, 状态, 作者决定, 共享批准记录和报告指针.
- `reports/`: 诊断上下文和机器可读结果. 重新审计生成新报告, 不覆盖已交付报告. 可复用
  coverage units 和 living coverage index 也保存在登记的 reports 路径下.
- `sessions/`: 已完成工作, 待决事项, 备份路径和停止位置.
- `backups/`: 获批修改前的稿件备份. 恢复也需要作者批准.
- `handoffs/`: 当前证据和下一操作的交接指针.
- `paths.creation`: 创作产物路径, 默认 `.author-toolkit/creation/`, 包含
  `state/current.md`, `state/chapters/`, `state/volumes/`, `batches/` 和 `staging/`.

chapter/volume story state 从已验收正文和有版本的来源派生, 用于续写; 它不能替代 Story Bible
的意图或正文事实. 被拒绝的 staging 文本不会进入 story state 或 manuscript scope.

实际路径以 manifest 登记为准, 包括自定义位置. 在稳定 operation 门禁处, 可在 `write-fiction`,
`revise-fiction`, `revise-draft`, `revise-increment` 与 `revise-request` 之间切换并复用这些产物,
无需第二套项目目录或迁移. 切换不会自动恢复 pending write.

证据是否可以复用, 由 `operation`, `scope_id`, 输入版本, coverage, subchecks 和依赖共同判断.
新 scope 需要作者确认. 输入或依赖变化时, 受影响证据标为 `stale`; 旧报告符合 schema 并不代表
它仍适用于当前稿件. 创作验收不等于 revision 收敛; 增量修订完成后仍按当前稿门禁重新判断.

创作批次还记录计划, 所选上下文和目标输入的 dependency fingerprint. 返回 staged draft 时重新
计算 fingerprint. 纳入的依赖变化需要重新复核或规划; 无关正文增长只要求刷新发布 scope, 不会
单独使 staged content 失效.

`pending_action` 只记录一个待执行或等待作者决定的下一操作, 不是发布或恢复正文写入的许可.

### Staging, commit 与 restore

AI 草稿先写入 `staging/<batch-id>/`, 作者和混合批次也遵守相同的 staging 与验收规则. 提交时,
每个新文件必须仍不存在, 每个已有目标必须匹配已验收输入 hash, 且每个已有目标必须先备份.

commit journal 在发布正文前写入. 每个文件通过临时同目录文件校验和原子 rename 发布, 并在每次
状态转换后更新 journal. journal 协调多文件批次, 但不声称整个批次是一个文件系统事务. 中断时
记录已完成和待处理动作, 停止自动发布.

restore 需要单独明确批准, 指明 commit 或 backup 以及准确文件. 先为当前内容建立安全备份. 对
该批次新建的文件, 先移入安全备份再从 manuscript 移除. 作者外部改动通过 `creation-import`
reconcile, 不能静默刷新 hash 或 story state.

### Coverage 与分块终审

只有 source report 身份, operation, 准确路径和 hash, 请求的 subchecks 及依赖全部匹配的 full local
coverage unit 才能复用. 原 scope 保持与来源报告绑定, 组合后的 coverage index 和新 synthesis 使用请求的
新 scope. partial, skipped, stale 和 synthesis unit 都不能作为可复用的局部证明. 无关修改可保留未受影响
的 local units, 但受影响的卷, 故事阶段, 当前范围或全书 synthesis 必须按当前输入重新评价.

大稿件的 `author-review` 先阅读实际正文 chunks, 再综合卷或故事阶段, 最后综合全书. intent 与
standards 可以并行. fresh reader 按阅读顺序由同一个逻辑 reviewer 推进, 只携带自己的隔离
reader-state. 摘要和提取的 story state 不能替代正文阅读. 只有实际覆盖请求范围时才报告 `full`.

Finding v2 和 report v2 的版本保持不变, creation operations 不加入封闭的 report v2 `stage`
枚举. creation batches, commit journals, story state, coverage units/index, review jobs 和
reader state 使用独立产物契约. 项目登记使用 `references/project-schema-v3.1.json`; v3.0 schema
保留用于读取和升级旧项目.

迁移说明见 [docs/MIGRATION-3.1.md](docs/MIGRATION-3.1.md). 历史说明保留在
[docs/MIGRATION-3.0.md](docs/MIGRATION-3.0.md) 和
[docs/MIGRATION-2.0.md](docs/MIGRATION-2.0.md).

随仓库提供的中英文 examples 有意保留 legacy v2 manifests 和 workflow fixtures 用于兼容性测试,
不要为了显得最新而原地迁移它们.

## 恢复, 切换与返工

在已登记项目中再次调用 `write-fiction`, `revise-fiction`, `revise-draft`, `revise-increment`
或 `revise-request`, 说明要继续, 审阅报告, 切换策略还是返工. 五个入口通过同一份 manifest,
tracker, Story Bible, 报告, session notes, 备份, handoff 和适用的 creation state 恢复上下文,
并根据当前 scope, pending operation, 证据和依赖决定下一步.

使用其他策略时可以保留 staged draft. 返回后根据 dependency fingerprint 和当前项目状态决定重新
复核还是重新规划. 策略切换和 pending action 都不会自动发布它.

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

共享流程处理 Markdown 和纯文本, 核心语言为中文和英文. 中文 prose 审计使用
`skills/prose-mechanics/references/chinese-rules.md`, 包括中文分句, 字符计数, 分词方法声明,
中文语法规则及本地词表. 中文 `full` 表示请求的中文子检查已完整执行, 不表示英文指标或
英文检测器获得了等价结果. 未实际执行的片段和子检查仍须记录为 `partial` 或 `skipped`.

工作流报告标题, tracker 列名和状态值继续固定使用英文, 作为机器可读 Markdown 契约.
中文说明, finding 文本, 引文和稿件路径可正常使用中文. JSON 字段, 机器键和封闭枚举
继续遵循原有版本契约. 其他语言使用文档中的降级规则.

## 验证状态

3.1.0 工作树的仓库检查已通过: 125 项协议测试和 19 项默认校验, 详见
[docs/VALIDATION.md](docs/VALIDATION.md). Kimi Code 已完成有限范围的创作提交和双向切换验证; 完整宿主流程,
`revise-increment` 与 `revise-request` 端到端运行, 16 技能安装发现和百万字稿件的创作质量仍未验证.
3.0 和 2.0 的历史结果单独保留, 不能作为 3.1 已通过宿主或质量验证的证据.

## 开发与产物校验

开发包需要 Node.js >= 22, 通用技能安装器需要 Node.js >= 22.20. 安装依赖后在仓库根目录运行:

```bash
npm test
npm run validate
```

可用对应 CLI 参数直接校验 manifest, report 和新产物. 新参数包括 creation batches, commit
journals, story state, coverage artifacts 和 review jobs; 准确参数名以当前安装的 `--help` 为准:

```bash
node scripts/validate.mjs --help
node scripts/validate.mjs --manifest /path/to/.author-toolkit/project.json
node scripts/validate.mjs --report /path/to/report.md
```

这些命令只覆盖仓库级契约, 不代表宿主运行验证或创作质量. 宿主版本, 已完成检查和限制见
[docs/VALIDATION.md](docs/VALIDATION.md).
