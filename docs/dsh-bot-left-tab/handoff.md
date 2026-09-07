# dsh-bot-left-tab Handoff

本文件是可直接交给 Codex / Claude / omp / Generic Coding Agent 的交付 Prompt。你的目标不是「按文件改代码」，而是在不破坏业务不变量的前提下，完成 spec 定义的用户可见行为：官方左栏可切成 Bot 模式，点人设在官方中栏开会话，切回后官方会话树原样回来。

> 使用方式：把本文件完整粘贴给执行 Agent，或让 Agent 开工前先读本文件。
> 本文件只做入口导航，不复制 spec 内容；所有规则、任务、验收细节以 `spec.md` 为准。
> 路径纪律：本文件内所有引用一律相对于本包目录（docs/dsh-bot-left-tab）。工作目录取仓根（含 package.json 的 plugin 目录）时先 `cd ../..`。

## 1. 目标

把 `../prototypes/dsh-bot-left-tab.html` 的方向落地为「左栏模式切换 + 名册 + 官方中栏 + 顶栏身份条」：`sidebar.workspaces` 以 `priority: -1` 遮蔽注册，会话模式注销遮蔽让官方树回来；1:1 对话面全部交给官方中栏；小组仍走右栏「DSH Bot」页签。

## 1.1 执行环境假设（--executor generic，最保守）

| 项 | 假设 |
|---|---|
| 执行环境 | generic（omp / Claude / Codex 均适用） |
| 浏览器工具 | 有浏览器 MCP 就用它回放 spec §5.2；没有则邻仓 Playwright（channel chrome）；再没有就按 §5.2 矩阵逐行手动执行并回填截图 |
| 长命令策略 | 改代码后只跑 `pnpm run typecheck` + 相关 vitest；Phase 回归才跑全套 |
| 验证命令输出 | 每条验证命令完整输出写入对应 Phase 的 evidence 目录下 commands.log（结构见 `evidence/README.md`） |
| 网关身份 | loopback :3084、profile `gb`。改了客户端代码要 `pnpm run build` → 用 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份 → `kill <pid>` → `sh env/boot.sh` → 刷新页面 |
| 工作区 | **有在飞未提交改动（session-nav：`../../packages/ui-dsh-bot/src/client/DshBotTab.tsx`、`../../packages/ui-dsh-bot/src/client/session-jump.ts`、`../../packages/workbench-ui/src/App.tsx` 等 21 文件）**。禁止 `git stash` / `checkout` / `restore`；只在这些文件里做最小增量改动 |
| 官方包 / 邻仓 | 零改。`env/profiles/gb/node_modules/@deepseek-ai/*` 只读 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec（唯一事实源） | `spec.md` | found | 业务合同、技术方案、任务详情、验收协议 |
| Tasks CSV（状态板） | `tasks.csv` | found | 21 条任务状态跟踪 |
| Evidence 目录 | `evidence/` | found | 证据归档（结构见 `evidence/README.md`） |
| 原型（只看方向，不照抄） | `../prototypes/dsh-bot-left-tab.html` | found | 10 个分镜；与落地的四条偏差见 spec §2.8 / Task 19 |
| 原型调研 | `../prototypes/left-sidebar-bot-tab.md`、`../prototypes/real-dsh-ui-survey.md` | found | 官方座位真值、真实 DOM 结构 |
| 客户端入口 | `../../packages/ui-dsh-bot/src/client/index.ts` | found | 主要改动点 |
| 官方 slot 契约 | `../../env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts` | found | `sidebar.workspaces` owner props |

缺失资料与假设：

- ASM-601~605（见 spec §1.4）全部由 Task 1 校准；任一证伪即在 Task 1 阻塞并按 spec §1.5 走变更，不带病进 Phase 1。

## 3. 开工上下文

### 架构 Before / After

```text
Before: 左栏=官方会话树 | 中栏=官方对话 | 右栏 better-sidebar「DSH Bot」iframe（名册+自绘对话+小组）
After:  左栏=[sessions] 官方树 / [bot] BotRegion(priority -1: 分段条+名册)  + 底栏「Bot」开关
        中栏=官方对话 + header.actions IdentityBar（仅 bot 会话）
        shell.overlay：新建/编辑/删除人设与小组模态、关系图卡（dsh-bot:overlay）
        右栏 iframe 不变（新增接收 dsh-bot:select-group）
        共享 packages/dsh-bot-shared（roster-sections/avatar/session-binding/类型）
```

### Phase 地图

```text
P0 校准(T1) → P1 模式切换骨架(T2-5) → P2 名册与开会话(T6-15) → P3 身份条(T16-18) → P4 文档/真实场景/收尾(T19-21)
```

### 最关键规则（Top 12，全量见 spec.md 第 2 章）

- BR-601：只向 `sidebar.workspaces` 以 `priority: -1` 注册；禁注册 `root` / `sidebar` / `conversation*` single 槽。
- BR-602：会话模式 = 注销遮蔽，官方树原样回来；不复刻、不 CSS 隐藏。
- BR-603：模式存 `localStorage['dsh-bot:sidebar-mode']`，刷新保持，缺省 `sessions`。
- BR-605：点人设 = last-session → 最新非隐藏 → createBotSession，三分支；失败行内红字 + 重试。
- BR-606：对话面全部交官方中栏，插件不画消息流 / composer。
- BR-607：身份条只对 `agentPreset` 以 `dsh-bot--` 开头且能匹配 bot 的会话渲染。
- BR-608：小组 → `activateTab('dsh-bot:sessions')` + postMessage，不进中栏。
- BR-609：不拦截官方「+ 新会话」。
- BR-613/614：人设与小组的新建/编辑/删除走 `shell.overlay` 模态 + 确认框，不占中栏；DSH Bot 不可删。
- BR-617：尺寸/圆角/间距以 `../prototypes/dsh-bot-left-tab.html` 对应 class 为准，只换颜色 token。
- BR-611：所有注册 disposer 化，卸载后 `entries('sidebar.workspaces')` 只剩官方。
- INV-604：在飞未提交改动零丢失。

### 禁止事项

- 不得为了通过测试删除现有业务分支。
- 不得只修改 mock/fixture，不修改真实路径。
- 不得把失败状态吞掉。
- 不得只按行号修改；必须用 symbol/rg anchor 校验（三段式定位见 spec.md §3.3）。
- 不得只实现组件/函数而不接线到真实入口——接线清单见 spec.md §2.3 每条 UF。
- 不得跳过交互反馈（loading、禁用、错误提示、成功反馈）；它们是需求本体。
- 不得只跑单测就宣称完成——完成的唯一标准是 spec.md §5.2 真实场景全套测试。
- 不得 import `@deepseek-ai/dsh-client-ui-workspace` 等官方 UI 包的 value（tsdown 纯度插件会拒绝）。
- 不得改 `packages/dsh-bot-host` 路由契约、官方 npm 包、邻仓。

## 4. 开工前初始化

1. 通读 `spec.md` §1、§2（重点 §1.3 事实、§1.4 假设、§2.3 流程脚本）。
2. 预读 `spec.md` §5——先知道完成标准（§5.2 真实场景），再开工。
3. 打开 `tasks.csv`，从 Task 1 开始。
4. `cd ../..`，把 `git status --short` 的输出保存为本包 evidence/phase-0 下的 git-status-before.txt（Task 1 第一步，INV-604 基线）。
5. 基线命令：`pnpm run typecheck && pnpm test`（记录通过数到 evidence/phase-0 下 calibration.md 顶部）。

## 5. 核心执行循环

```text
WHILE 存在待开始或进行中的任务:
    1. 找到下一条前置任务已完成的任务（tasks.csv 前置任务列）
    2. 读 spec.md §4 对应 Task 详情
    3. 回答：关联 BR/UF/INV/EVD 是什么？哪些行为不能变？
    4. tasks.csv 状态更新为「进行中」
    5. 按三段式定位校验文件位置（rg anchor 优先于行号）
    6. 执行具体操作
    7. 运行验证命令并保存 evidence
    8. 通过 → 状态「已完成」；失败 → 排障，最多主动修复 3 次
    9. 仍失败 → 标记「已阻塞:{原因}」，继续不依赖该任务的后续任务
   10. Phase 回归通过后，写 evidence/phase-N/phase-summary.md，再进入下一 Phase
   11. 每个语义单元 commit 一次，message 点名 Task/BR 编号（只 add 本包相关文件，不要 `git add -A` 把在飞改动带进去）
```

不要中途问「是否继续」。除非所有剩余任务都被阻塞，否则继续推进。Task 1 证伪 ASM-602/603 是唯一允许停下来汇报的点。

## 6. 排障顺序

1. 查 spec.md §4 当前任务的注意事项。
2. 查 spec.md §2 关联 BR/UF/INV。
3. slot 注册报错先看文案：`already has a registration at priority ...` = priority 撞车；`is not declared` = 应该用 `ctx.slots.inject(name, ...)` 等声明；`SlotOwnershipError` = 试图 renderSlot 非自家洞。
4. 按错误类型定位：import 纯度 → tsconfig / tsdown externals；类型 → 鸭子类型接口；UI 状态 → §2.3 状态机；测试 fixture → jsdom 头注释。
5. 最多主动修复 3 次，仍失败则阻塞并继续其他任务。

## 7. 完成标准与汇报

所有任务「已完成」后：

1. 运行最终验收命令：`pnpm run typecheck && pnpm test && pnpm run build && pnpm run standard:check`（命令级，入场券）。
2. **执行 spec.md §5.2 真实场景全套测试**：启动真实前台，按 §2.3 流程脚本逐条回放主路径和失败分支，截图 / console / RPC 样例落到 §5.2 矩阵写明的 `evidence/` 路径。任何一行失败 = 未完成，回去修。
3. 重跑 `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab`（仓根执行）——它会审计真实场景任务的证据是否落盘。
4. 对照 spec.md §2 逐条核对 BR/UF/INV/EVD；对照 §5.4 专项清单自检。
5. `git status --short` 与 Task 1 保存的 git-status-before.txt 对比，确认在飞改动仍在。
6. 输出最终总结：

```markdown
## 完成总结
- 完成范围：...
- 修改文件：...
- 通过的 BR/UF：...（真实场景执行矩阵 N/N 行通过）
- 未破坏的不变量：INV-601~607 ...
- Evidence：evidence/...
- 剩余风险：priority 遮蔽非公开契约（升级 DSH 时用 dsh-upgrade-compat 复查 spec §3.5「lowest renders」行）...
```
