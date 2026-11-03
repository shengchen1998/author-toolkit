# Author Toolkit 中文快速上手

Author Toolkit 3.0.0 提供两个共享同一项目证据模型的小说修订策略和六个独立写作技能,
支持 Claude Code 与 Kimi Code. 完整说明见 [英文 README](README.md).

## 包含的 13 个技能

用户入口:

| 技能 | 用途 |
| --- | --- |
| `ask-author` | 读取项目状态, 引导作者选择合适的入口或独立技能. |
| `setup-author-toolkit` | 登记写作项目并初始化两个修订入口共用的项目状态. |
| `revise-fiction` | 面向全书, 通过 Story Bible, 宏观结构, 完整人物弧线和全书终审进行修订. |
| `revise-draft` | 面向当前稿, 通过稿件基线, 局部叙事诊断和当前范围复核进行修订. |

`revise-fiction` 与 `revise-draft` 都必须先运行同一个 `setup-author-toolkit`.
setup 不接受 workflow 名称或 entry stage 参数, 对所有后续工作流使用相同的登记和
intake 规则.

共享编排技能为 `author-project`, `author-handoff`, `author-review`. 它们支撑上述入口,
不是独立的用户工作流. 六个独立技能为 `fiction-workshop`, `character-archetypes`,
`story-structure`, `narrative-nonfiction`, `prose-mechanics`, `avoid-ai-writing`.
合计 13 个技能.

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

## 先 setup, 再选择修订入口

根据安装方式选择命令:

| 安装方式 | 宿主 | Setup | 全书修订 | 当前稿修订 |
| --- | --- | --- | --- | --- |
| 插件 | Claude Code | `/author-toolkit:setup-author-toolkit` | `/author-toolkit:revise-fiction` | `/author-toolkit:revise-draft` |
| 插件 | Kimi Code | `/skill:author-toolkit:setup-author-toolkit` | `/skill:author-toolkit:revise-fiction` | `/skill:author-toolkit:revise-draft` |
| 裸技能 | Claude Code | `/setup-author-toolkit` | `/revise-fiction` | `/revise-draft` |
| 裸技能 | Kimi Code | `/skill:setup-author-toolkit` | `/skill:revise-fiction` | `/skill:revise-draft` |

`ask-author` 使用相同的命令形式替换技能名.

快速流程:

1. 准备单本小说或当前稿的 Markdown 或纯文本文件, 并确认项目目录.
2. 调用 `setup-author-toolkit`, 提供路径并回答项目登记和语言问题. 登记会保留原稿路径,
   并在完成后验证共享 v3 manifest. 不指定 workflow 或 entry stage. 之后由所选修订技能
   建立并确认初始范围.
3. 根据目标选择技能: 需要全书 Story Bible, 结构审查和终审时调用 `revise-fiction`;
   只需处理当前稿, 局部诊断和当前范围复核时调用 `revise-draft`.
4. 在作者确认节点审阅报告, 对发现项作出处理决定或要求返工. 正文修改前需要明确批准,
   并先建立备份和校验当前文件 hash.

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

两个入口共用 characters 能力. 当前稿路径只要求当前弧线和连续性, 完整全书门禁要求更多
人物弧线和全书连续性子检查. 当前稿任务可以直接进入 `prose` 或 `ai-cleanup`. 不需要改稿时,
可记录原因并跳过 `revision-plan` 和 `chapter-revision`.

从零创作请直接调用 `fiction-workshop` 或 `story-structure`. 叙事非虚构请直接调用
`narrative-nonfiction`. 多书籍项目和其他宿主不在 3.0 支持范围内.

## 共享项目产物与证据

两个修订策略共用中性的 `.author-toolkit/project.json` (v3) 和以下产物:

- `project.json`: 项目登记, 产物路径, 以及可选的 `current_scope` 和 `pending_action`.
  不包含 `workflow.name`, `current_stage` 或 `stages`.
- `story-bible.md`: 当前工作需要时使用的共享故事基础, 不为另一个入口另建副本.
- `audit-tracker.md`: 稳定的发现项 ID, 状态, 作者决定, 共享批准记录和报告指针.
- `reports/`: 诊断上下文和机器可读结果. 重新审计生成新报告, 不覆盖已交付报告.
- `sessions/`: 已完成工作, 待决事项, 备份路径和停止位置.
- `backups/`: 获批修改前的稿件备份. 恢复也需要作者批准.
- `handoffs/`: 当前证据和下一操作的交接指针.

实际路径以 manifest 登记为准, 包括自定义位置. 没有 `revise-draft` 专属目录, 也不维护两套
流程状态. 在 `revise-fiction` 与 `revise-draft` 之间切换会复用这些产物, 无需迁移.

证据是否可以复用, 由 `operation`, `scope_id`, 输入版本, coverage 和依赖共同判断.
新 scope 需要作者确认. 输入或依赖变化时, 受影响证据标为 `stale`, 并沿依赖传播; 旧报告
符合 schema 并不代表它仍适用于当前稿件. `pending_action` 记录待执行或等待作者决定的下一
操作, 不再按技能分别保存阶段进度.

共享 tracker 保存批准记录. 正文修改前必须获得明确批准并建立备份, 写入前还要校验当前文件
hash, 避免覆盖记录证据或批准之后发生的变化.

Finding v2 和 report v2 的版本保持不变, 仅 stage 枚举新增 `draft-baseline`, `diagnostics`
和 `current-scope-review`. 独立技能仍可使用 finding v1. 项目登记使用
`references/project-schema.json` 中的 v3 schema.

迁移说明见 [docs/MIGRATION-3.0.md](docs/MIGRATION-3.0.md). 历史 2.0 说明保留在
[docs/MIGRATION-2.0.md](docs/MIGRATION-2.0.md).

## 恢复, 切换与返工

在已登记项目中再次调用 `revise-fiction` 或 `revise-draft`, 说明要继续, 审阅报告, 切换修订
策略还是返工. 两个入口通过同一份 manifest, tracker, Story Bible, 报告, session notes,
备份和 handoff 恢复上下文, 并根据当前 scope, pending operation, 证据和依赖决定下一步.

恢复备份需要明确请求和作者确认. 继续流程, 切换技能或重新生成报告不会自动恢复备份, 也不会
自动改写旧报告.

## 独立技能

六个旧技能保留原名称, 触发方式和独立行为, 可以不进入任一共享修订流程直接调用:

| 技能 | 用途示例 |
| --- | --- |
| `fiction-workshop` | "以发展编辑视角分析第 3 章." |
| `character-archetypes` | "分析这个角色的原型组合." |
| `story-structure` | "审计这份稿件的宏观结构." |
| `narrative-nonfiction` | "设计这本书的读者转变弧线." |
| `prose-mechanics` | "对第 7 章运行 echoes 审计." 共 19 项独立审计. |
| `avoid-ai-writing` | "仅检测这一章的 AI 写作模式, 不改写." |

独立技能的命令模式:

| 安装方式 | 命令模式 |
| --- | --- |
| Claude Code 插件 | `/author-toolkit:<skill-name>` |
| Kimi Code 插件 | `/skill:author-toolkit:<skill-name>` |
| Claude Code 裸技能 | `/<skill-name>` |
| Kimi Code 裸技能 | `/skill:<skill-name>` |

## 语言与格式限制

共享流程处理 Markdown 和纯文本, 核心语言为中文和英文. 某项诊断的语言覆盖较窄时,
按技能中的语言规则降级, 并在报告中记录部分执行或跳过项. 其他语言使用文档中的降级规则,
不把规则覆盖减少报告为等效完整审计.

## 验证状态

3.0.0 当前工作树通过 74 项协议测试和 19 项默认校验. 中文 v2 副本的真实迁移通过
4 项 manifest 检查, 重复迁移保持幂等. 宿主实际运行和 13 技能安装发现尚未验证.
详见 [docs/VALIDATION.md](docs/VALIDATION.md). 2.0 的历史实测结果单独保留, 不能作为
3.0 已通过宿主验证的证据. 未列明通过的安装和运行路径不视为已验证.

## 开发

开发包需要 Node.js >= 22, 通用技能安装器需要 Node.js >= 22.20. 安装依赖后在仓库根目录运行:

```bash
npm test
npm run validate
```

这些命令只覆盖仓库级检查, 不代表宿主运行验证. 宿主版本, 已完成检查和限制见
[docs/VALIDATION.md](docs/VALIDATION.md).
