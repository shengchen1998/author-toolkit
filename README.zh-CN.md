# Author Toolkit 中文快速上手

Author Toolkit 2.0.0 提供既有小说修订流程和六个独立写作技能, 支持 Claude
Code 与 Kimi Code. 完整说明见 [英文 README](README.md).

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

## 修订既有小说

根据安装方式选择命令:

| 安装方式 | 宿主 | 命令 |
| --- | --- | --- |
| 插件 | Claude Code | `/author-toolkit:revise-fiction` |
| 插件 | Kimi Code | `/skill:author-toolkit:revise-fiction` |
| 裸技能 | Claude Code | `/revise-fiction` |
| 裸技能 | Kimi Code | `/skill:revise-fiction` |

快速流程:

1. 准备单本既有小说的 Markdown 或纯文本稿件, 并确认项目目录.
2. 调用 `setup-author-toolkit`, 提供路径并回答范围与修订目标问题. 登记会保留原稿路径,
   并在完成后验证 manifest.
3. 再次调用 `revise-fiction`, 从已登记的阶段开始. 依次经过 `intake`, `story-bible`,
   `structure`, `characters`, `revision-plan`, `chapter-revision`, `prose`, `ai-cleanup`,
   `final-review`. 各阶段的完整规则以技能定义为准.
4. 在作者确认节点审阅报告, 对发现项作出处理决定, 或要求返工. 稿件修改前
   需要确认.

从零创作不属于完整编排流程. 请直接调用 `fiction-workshop` 或
`story-structure`. 叙事非虚构请直接调用 `narrative-nonfiction`. 多书籍项目和
其他宿主不在 2.0 支持范围内.

## 主要产物

工作流通过 `.author-toolkit/project.json` 登记状态和各产物路径:

- `project.json`: 项目登记, 当前流程状态和产物路径. 登记不会移动原稿.
- 报告: 默认保存在 `reports/`, 包含诊断上下文和机器可读结果. 重新审计会生成新报告, 不覆盖已交付报告.
- tracker: 默认位于项目根目录的 `audit-tracker.md`, 保存稳定的发现项 ID, 状态, 作者决定和报告指针.
- session notes: 默认保存在 `sessions/`, 记录已完成工作, 待决事项, 备份路径和停止位置.
- backups: 在获批修改稿件前, 将受影响文件保存到 `.author-toolkit/backups/`.

独立技能仍使用各自的 Story Bible, blueprint 和 audit tracker 约定.

## 恢复与返工

在已登记项目中再次调用 `revise-fiction`, 说明要继续, 审阅报告还是返工. 工作流
通过 `project.json`, tracker, 报告和 session notes 恢复上下文.

恢复备份需要明确请求和作者确认. 继续流程或重新生成报告不会自动恢复备份, 也
不会自动改写旧报告.

## 独立技能

六个旧技能保留原名称和触发方式, 可以不进入九阶段流程直接调用:

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

完整流程处理 Markdown 和纯文本, 核心语言为中文和英文. 某项诊断的语言覆盖较窄时,
按技能中的语言规则降级, 并在报告中记录部分执行或跳过项. 其他语言使用文档中的
降级规则, 不把规则覆盖减少报告为等效完整审计.

## 验证状态

当前状态为 **Partial**: 55 项协议测试和 19 项默认检查通过, 六个独立技能的 Kimi
回归和通用项目安装通过. 中英文结构重审已通过, 英文九阶段已在限定范围内完成并生成
最终 handoff. Claude Code 实际调用因未登录而阻塞, Kimi 原生插件安装和 Desktop 人工入口
仍未完成验证. 宿主版本, 实测范围和限制见
[docs/VALIDATION.md](docs/VALIDATION.md). 未列明通过的安装和运行路径不视为已验证.

迁移与兼容性说明见 [docs/MIGRATION-2.0.md](docs/MIGRATION-2.0.md).
