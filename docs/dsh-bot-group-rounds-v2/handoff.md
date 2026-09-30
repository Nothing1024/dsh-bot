# dsh-bot-group-rounds-v2 Handoff

本文件是可直接交给 Codex / Claude / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码"，而是在不破坏业务不变量的前提下，完成 spec 定义的用户可见行为。

> 使用方式：把本文件完整粘贴给执行 Agent，或让 Agent 开工前先读本文件。
> 本文件只做入口导航，不复制 spec 内容；所有规则、任务、验收细节以 `spec.md` 为准。
> 路径纪律：文件引用相对本包目录 `docs/dsh-bot-group-rounds-v2/`；仓根 = `../..`（即 `dsh-grok-bot/plugin/`）。

## 1. 目标

在工作台小组房间补齐四项：引用某成员即只让他回答；讨论中再发的话进内存队列（≤3，可取消，停止清空）并在本场结束后自动接着发；「让他们继续聊」不追加用户消息再开一场；房间可二次确认后删除（只删房间记录，成员私聊与隐藏会话保留）。1:1 对话零变化，已上线的多轮（默认 3 轮）/ @点名 / 单成员重试 / 停止不回归。

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec（唯一事实源） | `spec.md` | found | 业务合同、技术方案、任务详情、验收协议 |
| Tasks CSV（状态板） | `tasks.csv` | found | 17 条任务状态跟踪 |
| Evidence 目录 | `evidence/` | found | 证据归档，结构见 `evidence/README.md` |
| 拍板记录 | `../remaining-prd-decision.md` | found | §5：四项设计定案、默认 3 轮的来源 |
| 被取代的旧包 | `../archive/dsh-bot-group-rounds/spec.md` | found | 只读参考；不按其 tasks.csv 执行 |
| 仓库说明 | `../../README.md` | found | 小组段需在 Task 15 改写 |

缺失资料与假设：

- ASM-001：浏览器能登录并打开 `http://127.0.0.1:3084/dsh-bot/ui` 做真实点击；不通则 5.2 降级为手动脚本 + 用户回填。Task 1 核实。
- ASM-002：至少 2 个人设 + 可用模型凭据，成员能真实回复。Task 1 核实。
- 既有失败（不是你造成的）：`pnpm test` 中 `../../packages/tool-dsh-bot/tests/tools.spec.ts` 解析 `dsh-bot-host` 入口失败；`pnpm run typecheck` 3 处错误均在 `packages/tool-dsh-bot/`。只要求失败集合不扩大。

## 3. 开工上下文

### 架构 Before / After

```text
Before: prompt(room) → GroupInbox.accept → 立即落盘用户行 → tails 串行 runGroupRound
        回应者 = parseMentions(text)，引用不参与；讨论中再发 = 落盘并排到队尾再跑整场
After:  房间空闲 → start；房间忙 → 校验后进内存队列(≤3) → job 结束 drain 出队再 start
        回应者 = resolveResponders(text, members, quotedBotId)（shared，composer 同用）
        + continueDiscussion(system 行锚点) + cancelQueued + deleteGroupSession
        history(room) += queued[]
```

### Phase 地图

```text
P0 基线与校准(T1-2) ─▶ P1 契约与存储(T3-5) ─▶ P2 host 引擎与 RPC(T6-9)
  ─▶ P3 workbench-ui 交互接线(T10-14) ─▶ P4 文档与真实场景验收(T15-17)
```

### 最关键规则（Top 10，全量见 spec.md 第 2 章）

- BR-001: 回应者优先级 = 显式 @（非 @all）> 被引成员 > 全员；引用自己 / 被引已不在组 → 全员。
- BR-002: 房间忙时提交进内存队列 ≤3，满报 `queue-full`；出队时才落盘；可单条取消；停止清空；重启丢失。
- BR-003: 继续讨论只在 idle 且已有成员发言时可用；写 `system` 行，不追加用户行；首轮也按「有新内容」过滤。
- BR-004: 删房间二次确认，只删 `rooms/<roomId>.jsonl` 与索引行；房间忙拒绝；成员隐藏会话不动。
- BR-005: 默认 3 轮、@点名、多轮、重试、停止、房间标题全部保持；重试中提交仍 `room is busy`，不入队。
- UF-002: 讨论中发两句取消一句 → 剩下一句在本场后自动开新场；第 4 条被拒且草稿保留。
- UF-005: 旧行为回归 + 1:1 面无继续讨论 / 排队行 / 删除房间。
- INV-001: 1:1 路径（`peekRoom` 未命中）行为完全不变。
- INV-002: 排队项出队前绝不写房间文件；取消 / 停止的项永不落盘。
- INV-003: 删房间不动 groups.json、其他房间、成员隐藏会话、人设与 1:1。

### 禁止事项

- 不得为了通过测试删除现有业务分支；既有用例「keeps each accepted message in its own round…」按新语义改写断言，不得删除。
- 不得绕过 `/dsh-bot/*` 鉴权或新开 HTTP 路由；只加 RPC method case。
- 不得只修改 mock/fixture，不修改真实路径。
- 不得把失败状态吞掉（`queue-full`、`room is busy`、`not-found` 都要有界面提示）。
- 不得只按行号修改；必须用 symbol/rg anchor 校验（三段式定位见 spec.md 第 3.3 节）。
- 不得只实现组件/函数而不接线到真实入口——接线清单见 spec.md 第 2.3 节每个 UF 末尾。
- 不得跳过交互反馈（loading、禁用、错误提示、成功反馈）；它们是需求本体。
- 不得在前端另写一份点名规则；只用 shared 的 `resolveResponders`。
- 不得改官方 npm 包与邻仓；不得清空 `env/dsh-bot/`；测试数据按 id 清理，不按标题模糊删。
- 不得只跑单测就宣称完成——完成的唯一标准是 spec.md 第 5.2 节真实场景全套测试。

## 4. 开工前初始化

1. 通读 `spec.md` 第 1、2 章（事实基线 + 业务合同，重点读 2.3 节五条流程脚本）。
2. 预读 `spec.md` 第 5 章验收协议——先知道完成标准（5.2 共 12 行执行矩阵），再开工。
3. 打开 `tasks.csv`，结合 spec 第 4 章找到第一条可执行任务（Task 1）。
4. 在仓根运行 `git status --short` 确认工作区状态并记录。
5. 在仓根运行基线命令：`pnpm test; pnpm run typecheck`，输出存 evidence/phase-0/baseline.log（Task 1 新建）。
6. 起网关：先用 `../../env/gateway-id.sh` 核 :3084 属于本仓 `env/`，再 `sh env/boot.sh`（常驻进程，不要阻塞前台）。

## 5. 核心执行循环

```text
WHILE 存在待开始或进行中的任务:
    1. 找到下一条前置任务已完成的任务
    2. 读 spec.md 第 4 章对应 Task 详情
    3. 回答：关联 BR/UF/INV/EVD 是什么？哪些行为不能变？
    4. 状态板更新为「进行中」
    5. 按三段式定位校验文件位置
    6. 执行具体操作
    7. 运行验证命令并保存 evidence
    8. 通过 → 状态「已完成」；失败 → 排障，最多主动修复 3 次
    9. 仍失败 → 标记「已阻塞:{原因}」，继续不依赖该任务的后续任务
   10. Phase 回归通过后，输出 Phase summary（evidence/phase-{N}/），再进入下一 Phase
```

不要中途问"是否继续"。除非所有剩余任务都被阻塞，否则继续推进。

Task 7（GroupInbox 排队）风险最高：所有入口仍经 `admit` 串行；先写失败用例再改实现。

## 6. 排障顺序

1. 查 spec.md 第 4 章当前任务的注意事项。
2. 查 spec.md 第 2 章关联 BR/UF/INV。
3. 按错误类型定位：import、类型、RPC 分发、房间文件解析、UI 状态、测试 fixture。
4. 前端改动后浏览器看不到效果：先 `pnpm run build`，再重启网关（hub restart），再刷新。
5. 最多主动修复 3 次，仍失败则阻塞并继续其他任务。

## 7. 完成标准与汇报

所有任务「已完成」后：

1. 运行最终验收命令：`pnpm run build && pnpm test && pnpm run typecheck && pnpm run standard:check`（命令级，入场券；失败集合 ⊆ Task 1 基线），以及 `bash scripts/manual-test.sh --no-write`。
2. **执行 spec.md 第 5.2 节真实场景全套测试**：在真实网关上按 2.3 节流程脚本逐条回放主路径和失败分支，保存截图 / console / network 到 5.2 矩阵写明的 evidence/UF-001/ ~ evidence/UF-005/ 路径。任何一行失败 = 未完成，回去修。
3. 重跑 `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-rounds-v2`——它会审计真实场景任务的证据是否落盘（evidence 缺失 = FAIL，不得宣称完成）。
4. 对照 spec.md 第 2 章逐条核对 BR/UF/INV/EVD。
5. 对照 spec.md 第 5.4 节专项检查清单自检（含入口接线可达性、无路径穿越、1:1 零泄漏）。
6. 按 spec 各 Phase 的语义单元提交（中文 message，点名 Task / BR 编号），不要一个 commit 塞全部。
7. 输出最终总结：

```markdown
## 完成总结
- 完成范围：...
- 修改文件：...
- 通过的 BR/UF：...（真实场景执行矩阵 N/12 行通过）
- 未破坏的不变量：...
- Evidence：evidence/...
- 剩余风险：...
```
