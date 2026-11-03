# 审计追踪：《潮汐声音馆》

> **Fixture 说明：**预置观察和结构报告均为手写，描述有意保留的正文缺陷。任何条目都不是模型运行证据，也没有任何审计获得修改正文的作者授权。

## Workflow

- Project root: `.`
- Manifest created at: `2026-01-10T09:00:00Z`
- Main workflow: `revise-fiction`
- Current stage: `structure`
- Next action: 先解决中点和高潮问题，再重跑下游阶段。

## Findings

Allowed statuses: `open`, `resolved`, `deferred`, `dismissed`, `stale`.

| Finding ID | Stage | Audit | Location | Status | Current report | Updated | Decision or stale reason |
|---|---|---|---|---|---|---|---|
| STRUCT-001 | structure | story-structure-audit | `manuscript/chapter-02.md`, chapter 2 | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |
| STRUCT-002 | structure | story-structure-audit | `manuscript/chapter-03.md`, chapter 3 | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |
| STRUCT-003 | structure | story-structure-audit | `manuscript/chapter-02.md`, chapter 2 passage | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |
| STRUCT-004 | structure | story-structure-audit | `manuscript/chapter-01.md`, chapter 1 | open | `reports/structure/2026-01-17_structure.md` | 2026-01-17T18:00:00Z | No author decision recorded. |

## Audit runs

| Stage | Scope | Report | Engine and fallback | Language coverage | Run at | Result |
|---|---|---|---|---|---|---|
| structure | 全部三章及所有 landmark 检查 | `reports/structure/2026-01-17_structure.md` | `scriptorium`, `degraded: true`, no execution | full | 2026-01-17T18:00:00Z | Handwritten fixture; schema validation only; no model run. |

## Open questions

以下 fixture leads 没有对应报告，不是正式 tracker findings:

- `CHAR-001` lead: 第二章林涛从实际安慰突然变成刻薄玩笑，缺少充分触发。先运行人物咨询，再决定是否建立正式 finding。
- `CHAR-002` lead: 林宁声称能够放手，但第三章尚未演出足够困难的行动。结构选择获批后再核对。
- `PROSE-001` lead: 第一至三章的重复句式和长度相近陈述句可能削弱重点。章节修订后运行句长变化审计。
- `PROSE-002` lead: 第二章被动表达可能模糊谁启动发电机、谁搬动磁带。稍后运行主动/被动审计。
- `AI-001` lead: 第三章“社区持久力量的见证”直接解释抽象感情，场景本身尚未赢得这个结论。独立运行 AI-writing 检测。

## Approved decisions

| Decision ID | Approved at | Summary | Source |
|---|---|---|---|

## 当前交接

Fixture 状态表示在中点和高潮诊断后请求结构返工。应回到 `structure`, 不能因为句子问题容易发现就越过结构直接润色。结构选择获批后，重跑 `characters`, 重建 `revision-plan`, 再恢复章节和句子工作。manifest 与 `sessions/rework-resume.fixture.json` 展示下游产物如何变为 `stale`。

## 拒绝修改的边界

结构、人物、句子审计、原型审计和 AI 检测只生成发现。如果在这些阶段收到直接改正文的请求，应暂停并要求明确的修订任务。修改故事圣经或正文前，先在这里记录作者决定。
