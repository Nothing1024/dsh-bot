# dsh-bot-living-master Handoff

本文件是可直接交给 Codex / Claude / omp / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码"，而是按顺序执行两个子包、守住共享面规约、通过跨包联合验收，把 DSH Bot 从"被问才存在"变成"有记忆、会主动来消息"。

> 使用方式：把本文件完整粘贴给执行 Agent，或让 Agent 开工前先读本文件。
> 本文件只做入口导航，不复制 spec 内容；所有规则、任务、验收细节以 `spec.md` 与两个子包 spec 为准。
> 路径纪律：本文件内所有引用一律相对于本包目录 `docs/dsh-bot-living-master/`。

## 1. 目标

一口气执行 `../dsh-bot-memory/`（每 bot 跨会话记忆）→ `../dsh-bot-routines/`（cron 例程唤醒 / 未读通知 / 主动提议），再做三条只有两包叠加才会出现的联合场景验收；任何止损点如实写进报告，禁止"全部完成"式概括。

## 1.1 执行环境假设（--executor generic，最保守）

| 项 | 假设 |
|---|---|
| 执行环境 | generic（omp / Claude / Codex 均适用） |
| 浏览器工具 | 优先用 Playwright（`../../../../dsh-genoffice/engine/node_modules/playwright`，`chromium.launch({channel:'chrome'})`，仓内已多次实证）；若不可用，5.2 前端行按「逐步手动脚本 + 用户回填」执行并在 evidence 里注明 |
| 长命令策略 | `sh env/boot.sh` 首次可能超 2 分钟，放后台并轮询 `lsof -nP -iTCP:3084 -sTCP:LISTEN` |
| 验证命令输出 | 每条验证命令保存完整输出到对应 `evidence/` 路径 |
| 网关身份 | 任何 RPC 前先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084`，`DSH_HOME` 必须是本仓 `env/`——插错口 = 对别人的网关做事 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| 母包 Spec（本包唯一事实源） | `spec.md` | found | 顺序 / 共享面规约 / 联合验收 |
| 母包状态板 | `spec.md` §4 内嵌状态表（5 条，不生成 CSV） | found | 母包进度 |
| 记忆包 Spec | `../dsh-bot-memory/spec.md` | found | 子包 1 全部规则与任务 |
| 记忆包状态板 | `../dsh-bot-memory/tasks.csv` | found | 13 条任务 |
| 例程包 Spec | `../dsh-bot-routines/spec.md` | found | 子包 2 全部规则与任务 |
| 例程包状态板 | `../dsh-bot-routines/tasks.csv` | found | 14 条任务 |
| 体验原型（设计意图） | `../prototypes/dsh-bot-grok-parity.html` | found | 记忆面板 / 例程页签 / 主动消息 / 提议卡长什么样 |
| 真实 DSH 壳调研 | `../prototypes/real-dsh-ui-survey.md` | found | 不要再推想官方界面 |
| Evidence 目录 | `evidence/` | found | 母包证据；子包证据在各自 `evidence/` |
| 已搁置包（勿执行） | `../dsh-bot-native-surface/spec.md` | Deferred | 仅供了解为何不走"导航面"路线 |

缺失资料与假设：

- ASM-110：两子包 Task 1 校准的 preset 代际规则互不冲突；记忆包 Task 1 结束后读其 evidence/phase-0/calibration.md（记忆包校准结论），被证伪则暂停并回母包 §1.5 记变更。

## 3. 开工上下文

### 架构 Before / After

```text
Before: bot = preset 文本；换会话即失忆；无用户输入时不存在
After:  bots.json.persona(真源) ──单一组合函数──> preset persona = 基础 + 记忆段 + 行为规范段
        memory/<botId>/ ◀ 轮次闭合抽取（仅用户 prompt 触发）   routines.json → 调度器 → 唤醒会话 → 未读/通知
        工作台：会话头 🧠 记忆 | ⏰ 例程；消息 📌 记住；名册未读徽标；「设成例程」卡
```

### Phase 地图

```text
母包 P0 前置检查(T1) → P1 记忆包全量(T2) → P2 例程包全量(T3) → P3 联合回放(T4) → 收尾(T5)
记忆包内部：校准 → 存储与注入 → 抽取 → RPC 与面板 → 收尾（13 任务）
例程包内部：校准 → 存储与调度 → 唤醒投递 → RPC 与工作台 → 收尾（14 任务）
```

### 最关键规则（Top 8，全量见 spec.md 第 2 章与子包第 2 章）

- BR-101：先记忆包后例程包；两包 Task 1 真机校准不得跳过；记忆包组合函数阻塞时例程包降级为「基础 + 规范段」并备注。
- BR-102：persona 只有**一个**组合函数，顺序固定「基础 + 记忆段 + 规范段」；`isPlatformInjection` 只做加法；会话头 🧠 在 ⏰ 左且不新增定时器；routes case 各自成段；不混包 commit。
- BR-103：例程唤醒**不**触发记忆抽取（唤醒直接 `sessionTool.write`，不经 `promptOwnedSession`）；📌 仍可记；唤醒会话建会话时照常注入记忆。
- BR-104：完成 = 两子包 validate 0 FAIL 且各自 5.2 全过 + 本包 5.2 全过 + 四命令全绿；止损点必须写明。
- 记忆包核心（`../dsh-bot-memory/spec.md` §2.1）：`bots.json.persona` 是真源、preset 文件是派生物；寒暄（<40 字且无问号）不抽取；explicit 行永不被自动 remove。
- 例程包核心（`../dsh-bot-routines/spec.md` §2.1）：bot 只输出 `(silent)` 则不落消息不亮未读；系统通知仅 `document.hidden` 且 5s 节流；提议被拒后 `declined` 不再提。
- INV-102：任何注入 / 规范段追加后 `bots.json.persona` 不变。
- INV-103：一口一仓 :3084；邻仓零改；`env/dsh-bot/{memory,routines.json}` 不入 git；`rg -i 'anysphere|sand://' packages/` 为空；唤醒词 / 抽取提示词 / 规范段文案自写。

### 禁止事项

- 不得先做例程包或并行改同一共享文件。
- 不得为让抽取"更完整"把钩子挂到唤醒链路上。
- 不得各写一份 persona 重写逻辑；例程包只在记忆包的组合函数上追加。
- 不得从 `../../../../reference` 参考树拷提示词、cue 前缀、文案（红线）。
- 不得只跑单测就宣称完成——每个子包与母包都要过各自 5.2 真实场景。
- 不得只实现组件而不接线（面板按钮、📌、提议卡、徽标都要从真实入口可达）。
- 不得吞错：抽取失败 / 唤醒 error 要落日志与状态，不弹 toast 也不阻塞对话。
- 不得改官方 npm 包与三邻仓；不得开新端口。

## 4. 开工前初始化

1. 通读 `spec.md` §0–§2；通读两子包 `spec.md` §0、§2、§4。
2. 预读三份 spec 的 §5.2——先知道完成标准。
3. `git status` 确认工作区；记录 `git log --oneline -1` 到本包 evidence/phase-final/baseline.md。
4. 基线命令：`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py ../dsh-bot-memory --repo ../..` 与 `... ../dsh-bot-routines --repo ../..` → 均 0 FAIL（母包 T1）。
5. `sh env/boot.sh`（在仓根执行）并核 :3084 身份。

## 5. 核心执行循环

```text
FOR 子包 IN [dsh-bot-memory, dsh-bot-routines]:
    WHILE 子包 tasks.csv 存在待开始/进行中:
        1. 取下一条前置满足的任务；读该子包 spec §4 对应 Task
        2. 回答：关联 BR/UF/INV 是什么？共享面（BR-102）会不会被碰？
        3. 状态板 → 进行中
        4. 三段式定位校验（symbol + rg anchor，行号只是 hint）
        5. 实现 + 接线 + 交互反馈
        6. 验证命令 + evidence 落盘到该任务写明的路径
        7. 通过 → 已完成；失败 → 排障最多 3 次；仍失败 → 已阻塞:原因，继续不依赖它的任务
        8. Phase 回归通过 → 按该子包纪律 commit（message 点名 Task/BR ID，不混包）
    子包收尾：其 5.2 全过 → 重跑其 validate（证据审计）→ 板面快照到本包 evidence/phase-final/
    母包状态表对应行 → 已完成 / 已阻塞:原因
母包 T4：按 spec.md §5.2 联合回放；T5：终检 + report.md
```

不要中途问"是否继续"。除非所有剩余任务都被阻塞，否则继续推进。

## 6. 排障顺序

1. 查当前任务 spec 的「注意事项」与关联 BR/UF/INV。
2. 共享面冲突（persona 组合丢段、`isPlatformInjection` 判定变化、定时器叠加）优先查 `spec.md` BR-102 / BR-103。
3. 平台层问题查两子包 §1.3 勘察事实（代际规则、`sessionTool` 链路、`turnIsOpen`）。
4. 按错误类型：import → 类型 → RPC 契约 → 文件权限 → UI 状态 → 测试 fixture。
5. 最多主动修复 3 次，仍失败则阻塞并继续其他任务。

## 7. 完成标准与汇报

1. 四命令：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` 全绿。
2. 两子包各自 5.2 全过；本包 `spec.md` §5.2 三条联合场景全过，evidence 落盘。
3. 重跑三次校验（证据审计）：`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py ../dsh-bot-memory --repo ../..`、`... ../dsh-bot-routines --repo ../..`、`... . --repo ../..` → 全部 0 FAIL。
4. INV-103 终检：`rg -i 'anysphere|sand://' ../../packages/ ../../env/ ../../scripts/` 为空；`git status --porcelain | rg "env/dsh-bot"` 为空；三邻仓 `git status --porcelain` 干净（vibee 既有 `?? .vibee/` 除外）。
5. 对照三份 spec §5.4 自检。
6. 输出总报告到本包 evidence/phase-final/report.md 并在对话中给出：

```markdown
## 完成总结
- 记忆包：N/13 已完成；阻塞：Task x（原因）…
- 例程包：N/14 已完成；阻塞：…
- 母包联合回放：UF-101 / 102 / 103 各 N/N 行通过
- 修改文件：…
- 未破坏的不变量：INV-101 / 102 / 103 …
- Evidence：evidence/phase-final/…、../dsh-bot-memory/evidence/…、../dsh-bot-routines/evidence/…
- 剩余风险 / 止损点：…
```