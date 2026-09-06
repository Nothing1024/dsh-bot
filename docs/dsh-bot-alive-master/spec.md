# dsh-bot-alive-master Spec

> Version: 0.1.0 | Date: 2026-09-06 | Status: Ready 可执行
>
> 本文件是**母包**唯一事实源：统筹三个子包的执行顺序、共享面冲突规约、跨包联合验收。
> 子包合同各自独立（编号闭环）。引用子包条目时用「路径 + 描述性名称」，不直写其条目编号：
> - 实时包 `../dsh-bot-live-transcript/spec.md`（SSE 桥 / 排队打断 / 思考工具审批卡 / 停三轮询）
> - 同事包 `../dsh-bot-peers/spec.md`（异步互发 / 同事会话 / 礼仪段 / 关系图）
> - 名册包 `../dsh-bot-roster/spec.md`（分组拖拽 / 隐藏静音 / 快捷键）
>
> 填写三态规则：每个表格单元格只允许三种内容——验证过的事实（注明来源命令）/ `ASM-xxx` / `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：要把「工作台活过来」三件事一口气做完的执行方：对话不再整段跳、bot 能跟同事说话、名册能分组整理。
- **做什么**：总控包。顺序固定为先实时、再同事、再名册；定死共享文件谁先改谁后叠；做完后跑只有叠加才出现的联合场景。
- **改哪里**：母包自己不改产品代码；实现全在三个子包任务里。
- **怎么算做完**：三子包各自 5.2 全过且校验 0 FAIL；本包三条联合场景全过；最终四命令全绿；报告如实写止损点。
- **不做什么**：不重复子包矩阵；不在母包加产品功能；不修上一棒 living-master 已登记的忘记→注入滞后与例程未校准缺口。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 协调者定稿：顺序实时 → 同事 → 名册；共享面规约；联合 UF ≥3；完成闸门与诚实止损；executor generic |
| 输入类型 | description（三子包本轮同时生成） |
| Mode | oneclick（母包，多包统筹） |
| 置信度 | 高（三子包 spec 已落盘；共享文件已点名） |
| 输出目录 | `docs/dsh-bot-alive-master/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | infra（执行编排 + 联合验收；不新增产品面） |
| 主要风险 | ① Transcript 被实时包与同事包先后改；② Roster 被同事包关系图入口与名册包布局先后改；③ 同事/名册的实时态依赖实时包那一条 SSE |
| 行号引用策略 | 母包不定位产品代码改造步骤；定位清单指向子包 spec 与共享文件 symbol |
| 必需验收方式 | 子包各自 5.2 + 本包 5.2 联合回放 |
| 必须覆盖用户场景 | 同事回复经 SSE 到达；隐藏 bot 收到同事信计入已隐藏徽标；老路径抽验 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 三子包本轮已生成（spec / tasks.csv / evidence） | `ls docs/dsh-bot-live-transcript docs/dsh-bot-peers docs/dsh-bot-roster` | 三目录齐 |
| 既有母包样板 `../dsh-bot-living-master/spec.md`（顺序 / 共享面 / 闸门 / 纪律） | Read（2026-09-06） | 本包同形 |
| living-master 终报登记：忘记→注入滞后；例程校准两条未真机（grok 503） | `rg -n "Forget" docs/dsh-bot-living-master/evidence/phase-final/report.md` | 本母包不修 |
| 邻仓既有脏视为基线 | `rg -n "邻仓既有脏" docs/dsh-bot-living-master/spec.md` | §1.5 清单 |
| 共享面：`Transcript.tsx`（思考卡 vs 来自标签）、`Roster.tsx`（关系图 vs 分组）、`composePersona`（只同事包追加 behavior）、SSE 只在实时包 | `rg -n "showAuthor\|export function Roster\|export function composePersona\|GET /dsh-bot/events" packages/workbench-ui/src/Transcript.tsx packages/workbench-ui/src/Roster.tsx packages/dsh-bot-host/src/memory.ts docs/dsh-bot-live-transcript/spec.md` | BR-042 依据 |
| 仓库脚本 `pnpm run typecheck / build / test / standard:check`；Playwright 渠道存在 | `grep -n '"typecheck"' package.json`；`ls ../../dsh-genoffice/engine/node_modules/playwright/package.json` | 沿用 |
| 本会话 :3084 未监听（执行棒须先 boot） | `lsof -nP -iTCP:3084 -sTCP:LISTEN` | 空 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-041 | 联合实时场景依赖实时包 SSE 已合入。若实时包止损在「仍用 2s 轮询回退」，同事回复到达与隐藏徽标刷新允许 2s 延迟，并在本包报告写明，不得假装流式 | 实时包未合入却按 SSE 验收会误判失败 | Task 1 读实时包 `evidence/phase-0/calibration.md` 与其收尾备注；Task 5 按实际通道验收 |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| — | — | 首次生成 | — |

---

## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。ID 用 04x 段。子包条目一律用「路径 + 描述名」引用，禁止出现子包三位数编号。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-041 | 执行顺序：实时包 `../dsh-bot-live-transcript/spec.md` → 同事包 `../dsh-bot-peers/spec.md` → 名册包 `../dsh-bot-roster/spec.md`。每个子包推到「全部已完成或诚实已阻塞」；三包 Task 1 真机校准都不得跳过。实时包个别任务阻塞时同事/名册仍可开工，但其「实时到达」验收按 ASM-041 降级为 2s 轮询并在备注写明 | 实时包思考卡阻塞 → 同事包仍注册发送工具 | 名册包先行改 Roster 再让同事包塞关系图；跳过任一校准 | 三子包 | Task 2/3/4 板面 |
| BR-042 | 共享面规约：① `Transcript.tsx` 先由实时包加思考/工具/审批卡，同事包只加「来自 X」标签与 peer 卡，不得把思考卡改回丢弃；② `Roster.tsx` 先由同事包加关系图入口，名册包改分组/拖拽/菜单时必须保留该入口；③ `composePersona` / `renderBehaviorSection` 只由同事包追加礼仪，名册包与实时包不得新建第二组合函数；④ SSE 通道只有实时包一份（`GET /dsh-bot/events` + `bot/status`），同事/名册的 working/unread 都消费它，不新增 `setInterval`；⑤ 三包各自 Phase commit，不混包提交 | 名册包 diff 里关系图按钮仍在 | 名册重写 Roster 丢掉关系图；同事包自建 EventSource | 全仓 | Task 3/4 开工前 diff + Task 5 |
| BR-043 | 完成闸门：母包完成 = 三子包各自 validate 0 FAIL 且其 5.2 全过 + 本包 5.2 联合回放全过 + 最终 `pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` 全绿。任一子包链条止损时，报告必须写明止损点与未执行面，禁止写成「全部完成」 | 报告写「实时包流式止损：无 chunk，按消息级刷新」 | 子包有 FAIL 仍宣称完成 | 全仓 | Task 5/6 |
| BR-044 | 纪律：三子包红线条款（各自 2.1 末条）全程有效；一口一仓 :3084；邻仓 porcelain 与 `../dsh-bot-living-master/spec.md` §1.5 基线一致（不代清）；`env/dsh-bot/` 运行数据不入 git；`rg -i 'anysphere\|sand://' packages/` 为空；唤醒词 / 礼仪 / 文案自写。上一棒 leftover（忘记→注入滞后、例程两条未校准）不在本母包修，终报可复述不得当新 bug 重开 | 终检命令干净 | 顺手改邻仓或重开 living leftover | 全仓 | Task 6 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-041 | 三包合入；阿宁给小北发过一句且小北非静默回复 | 看着阿宁当前会话等回复 | 回复气泡经 SSE（或 ASM-041 的 2s 回退）出现，带「来自」标签；Network 在 SSE 就绪时无新的独立轮询 | 本机用户 | browser + Network | EVD-041 |
| UF-042 | 小北已隐藏且未静音或已静音均可 | 阿宁再给小北发一句 | 主名册无小北行；底部「已隐藏」聚合徽标 +1；展开能进该同事会话 | 本机用户 | browser | EVD-042 |
| UF-043 | 三包全部合入 | 复跑 v1 `dsh_bot_ask`、v2 双人设、三期默认一轮小组；抽验记忆注入与例程唤醒各一条主路径 | 四条老路径与各自包验收时逐步一致；隐藏委托会话不进同事日志、不进名册隐藏计数 | 本机用户 | browser + RPC + cat | EVD-043 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-041: 同事回复经实时通道到达

**前置状态**：三包合入；工作台打开阿宁；实时包校准已记录「SSE 通 / 不通」。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 让阿宁给小北捎一句 | 工具立刻 accepted | 同事包投递；实时包转发该会话事件 | 阿宁不卡死 |
| 2 | 等小北开口 | 阿宁当前会话出现带「来自 诗人小北」的泡 | 回写 + SSE `session/event`（或 2s 回退） | 标签在，思考卡若该轮有思考仍在 |
| 3 | 看 Network | SSE 就绪则无每 2s history 扇出 | 不新开同事专用定时器 | 只有实时包那条 EventSource |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| SSE 未合入 | 实时包止损 | 约 2s 后出现回复 | ASM-041 | 报告写明，不算假装流式 |
| 小北静默 | 只回约定静默词 | 阿宁无新泡 | 不写回 | 正常 |

**界面状态机**：沿两子包 2.3，本包只核对接线叠加。

**入口接线清单**：同事包 `dsh_bot_send` → 同事会话 write；回写发件当前会话；工作台 `Transcript.tsx` 标签；事件来自实时包 `GET /dsh-bot/events`。本包不新增入口。

#### UF-042: 隐藏 bot 收到同事信计入已隐藏徽标

**前置状态**：名册里小北已隐藏；阿宁可见。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 确认底栏「已隐藏 N 个」 | N≥1 | 名册包 hidden | 主列无小北 |
| 2 | 让阿宁给小北发一句 | 工具 accepted | 同事会话仍建；unread++ | — |
| 3 | 看底栏 | 已隐藏聚合徽标 +1 | 名册包聚合 unread；实时包 `bot/status` 或 2s listBots | 展开可见小北未读 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 小北已静音 | muted=true | 无系统通知，徽标仍 +1 | 名册包静音门闩 | 正常 |
| 隐藏被当成删除 | bots.json 丢行 | 发送失败 | 违反名册包「隐藏≠删除」 | 回名册包字段任务 |

**界面状态机**：`hidden-visible-in-tray → unread-aggregated`

**入口接线清单**：名册包 Roster 底栏；同事包 send；未读源 host `unread` Map。本包只核对。

#### UF-043: 老路径与记忆/例程抽验

**前置状态**：三包全部合入；上一棒记忆/例程仍在。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 官方会话调 `dsh_bot_ask` | 工具卡完成 | v1 链 | 答案返回；该隐藏会话不进 `peers.jsonl`、不进名册隐藏计数 |
| 2 | v2 双人设各聊一句 + 切草稿 | 隔离如旧 | v2 链 | 历史 / 口吻 / 草稿三隔离 |
| 3 | 老小组发「你们是谁？」 | 全员一轮各一句 | 三期 `runGroupRound` | 与三期验收一致 |
| 4 | 抽验：打开带记忆的 bot 新会话；等一条已有例程唤醒 | 新会话仍记得；例程线程仍主动开口 | 记忆注入 + 例程调度 | 不要求重跑两包全矩阵；主路径各一条即可 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 小组语义变了 | 默认变成多轮 | 违反实时包不变量 | 回实时包 | — |
| 记忆段丢失 | 同事礼仪覆盖组合函数 | 新会话不记得 | 违反 BR-042 ③ | 回同事包礼仪任务 |
| 例程 leftover | 唤醒 503 / 忘记滞后 | 与 living-master 终报一致 | 不新开修复 | 终报复述 |

**界面状态机**：沿 v1/v2/三期/记忆/例程。

**入口接线清单**：v1 工具卡、工作台 roster、小组房间、记忆面板、例程页——既有入口，本包只复跑。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-041 | 子包互不回归：后包合入后，前包 5.2 已过行为保持（Composer 不锁、思考卡在、发送异步、隐藏例程仍跑） | BR-041, BR-042, UF-043 | Task 5 |
| INV-042 | 全仓只有一条工作台 SSE；同事/名册不得新增轮询定时器 | BR-042 ④, UF-041 | Task 5 Network |
| INV-043 | 一口一仓 :3084；邻仓 porcelain 与 living-master §1.5 基线一致；`rg -i 'anysphere\|sand://' packages/` 为空；`env/dsh-bot/` 不入 git | BR-044 | Task 6 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-041 | screenshot+har | 同事回复到达 + Network（SSE 或 2s 回退备注） | `evidence/UF-041/` |
| EVD-042 | screenshot | 隐藏底栏徽标 +1；展开可见 | `evidence/UF-042/` |
| EVD-043 | screenshot+log | v1/v2/三期 + 记忆/例程各一条 | `evidence/UF-043/` |
| EVD-044 | log | 三子包二次校验 + 四命令 + 总报告 | `evidence/phase-final/` |

### 2.6 角色与权限矩阵

单一本机用户，loopback，无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 依赖失败 | 实时包 SSE 阻塞 | 同事/名册开工 | 按 BR-041 / ASM-041 降级，报告写明 | EVD-044 |
| 旧数据 | 无 pinned/section、无 peers.jsonl | 首次启动 | 子包各自填默认 / 懒创建 | EVD-043 |
| 破坏性 | 删除一个做过互发的 bot | — | 名册行消失；jsonl 历史保留；对方关系图少一条实线 | EVD-043 |

### 2.8 非目标

- 不重复三子包执行矩阵；不在母包新增产品功能。
- 不修 living-master leftover（忘记→注入滞后、例程未校准）。
- 不广播、不接外部渠道、不跨用户。
- 搁置中的 native-surface 不在范围。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
三个子包各自可执行；Transcript / Roster / composePersona / 轮询无人协调

After:
母包 → 顺序：live-transcript(全部) → peers(全部) → roster(全部) → 联合回放 → 终检
       共享面：Transcript = 实时卡片 + 同事标签
               Roster = 同事关系图入口 + 名册分组
               persona behavior 只由同事包追加
               SSE 只有实时包一份，同事/名册消费 bot/status
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| 本包 | 编排 + 联合验收 | 不改产品代码 |
| `../dsh-bot-live-transcript/` | 实时通道 | 按其 tasks.csv |
| `../dsh-bot-peers/` | 同事互发 | 按其 tasks.csv；礼仪只叠组合函数 |
| `../dsh-bot-roster/` | 名册产品化 | 按其 tasks.csv；保留关系图入口 |

### 3.3 三段式定位清单

> 母包只定位子包 spec 与共享文件 symbol；全部 anchor 于 2026-09-06 用 `rg -c` 核验命中。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `docs/dsh-bot-live-transcript/spec.md` | SSE 合同 | `rg "GET /dsh-bot/events" docs/dsh-bot-live-transcript/spec.md` | — | 实时包通道 |
| `docs/dsh-bot-live-transcript/spec.md` | 插件状态帧 | `rg "bot/status" docs/dsh-bot-live-transcript/spec.md` | — | 供后两包消费 |
| `docs/dsh-bot-peers/spec.md` | 发送工具 | `rg "dsh_bot_send" docs/dsh-bot-peers/spec.md` | — | 同事包 |
| `docs/dsh-bot-peers/spec.md` | 单一组合函数 | `rg "composePersona" docs/dsh-bot-peers/spec.md` | — | 礼仪只追加 |
| `docs/dsh-bot-roster/spec.md` | 布局 RPC | `rg "updateBotLayout" docs/dsh-bot-roster/spec.md` | — | 名册包 |
| `docs/dsh-bot-live-transcript/tasks.csv` | 状态板 | `rg "P0:校准" docs/dsh-bot-live-transcript/tasks.csv` | L2 | Task 2 推进 |
| `docs/dsh-bot-peers/tasks.csv` | 状态板 | `rg "P0:校准" docs/dsh-bot-peers/tasks.csv` | L2 | Task 3 推进 |
| `docs/dsh-bot-roster/tasks.csv` | 状态板 | `rg "P0:校准" docs/dsh-bot-roster/tasks.csv` | L2 | Task 4 推进 |
| `packages/dsh-bot-host/src/routes.ts` | `export function attachDshBotHttp` | `rg "export function attachDshBotHttp" packages/dsh-bot-host/src/routes.ts` | — | SSE 挂口 |
| `packages/dsh-bot-host/src/memory.ts` | `export function composePersona` | `rg "export function composePersona" packages/dsh-bot-host/src/memory.ts` | — | 共享面 ③ |
| `packages/dsh-bot-host/src/routine-behavior.ts` | `export function renderBehaviorSection` | `rg "export function renderBehaviorSection" packages/dsh-bot-host/src/routine-behavior.ts` | — | 同事包只追加 |
| `packages/dsh-bot-host/src/bots.ts` | `export interface BotRegistryRow` | `rg "export interface BotRegistryRow" packages/dsh-bot-host/src/bots.ts` | — | 名册字段 |
| `packages/dsh-bot-host/src/bots.ts` | `export function replacePersonaText` | `rg "export function replacePersonaText" packages/dsh-bot-host/src/bots.ts` | — | 不新建组合 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `kind: 'thinking'` | `rg "kind: 'thinking'" packages/dsh-bot-host/src/workbench-sessions.ts` | — | 实时卡片数据已在 |
| `packages/workbench-ui/src/Transcript.tsx` | `showAuthor` | `rg "showAuthor" packages/workbench-ui/src/Transcript.tsx` | — | 共享面 ① |
| `packages/workbench-ui/src/Roster.tsx` | `export function Roster` | `rg "export function Roster" packages/workbench-ui/src/Roster.tsx` | — | 共享面 ② |
| `packages/workbench-ui/src/Conversation.tsx` | `composerWorking` | `rg "composerWorking" packages/workbench-ui/src/Conversation.tsx` | — | 实时包解锁 |
| `packages/workbench-ui/src/useSessionPoll.ts` | `export function useSessionPoll` | `rg "export function useSessionPoll" packages/workbench-ui/src/useSessionPoll.ts` | — | SSE 停轮询 |
| `packages/workbench-ui/src/useGlobalKeyboard.ts` | `export function useGlobalKeyboard` | `rg "export function useGlobalKeyboard" packages/workbench-ui/src/useGlobalKeyboard.ts` | — | 名册快捷键加法 |

### 3.4 API / 数据 / 权限 / 路由影响

均无母包自身影响——全部影响由子包各自 3.4 承担。

---

## 4. Phase 计划与任务详情

```text
P0 前置(1) → P1 实时包全量(2) → P2 同事包全量(3) → P3 名册包全量(4) → P4 联合验收(5) → 收尾(6)
```

> 实现任务 < 8 → 用下方内嵌状态表，不生成 tasks.csv。

### 内嵌状态表

| 序号 | 任务 | 前置 | 验证命令 | 状态 | 备注 |
|---|---|---|---|---|---|
| 1 | 前置检查与共享面基线 | 无 | 三子包 `validate_package.py --repo .` 均 0 FAIL；`git status --porcelain packages/` 记录基线 | 待开始 | 豁免回归:P0 单实现任务 |
| 2 | 执行子包 dsh-bot-live-transcript 全量 | 1 | 其子包 tasks.csv 全部已完成或诚实已阻塞且 validate 0 FAIL | 待开始 | 豁免回归:单任务 Phase，回归即子包自身收尾 |
| 3 | 执行子包 dsh-bot-peers 全量 | 2 | 其子包 tasks.csv 全部已完成或诚实已阻塞且 validate 0 FAIL | 待开始 | 豁免回归:单任务 Phase，回归即子包自身收尾 |
| 4 | 执行子包 dsh-bot-roster 全量 | 3 | 其子包 tasks.csv 全部已完成或诚实已阻塞且 validate 0 FAIL | 待开始 | 豁免回归:单任务 Phase，回归即子包自身收尾 |
| 5 | 执行 spec 5.2 真实场景全套测试（跨包联合回放） | 4 | 5.2 执行矩阵三条联合场景全行通过并落 evidence | 待开始 | |
| 6 | 执行母包总回归验证（收尾） | 5 | 四命令全绿 + 红线空 + 总报告落盘 | 待开始 | |

### Phase 0: 前置检查

### Task 1: 前置检查与共享面基线

- **关联**：BR-041 / BR-044 / ASM-041 / EVD-044 / UF NA
- **前置任务**：无
- **风险等级**：P0

**具体操作**：

1. 三子包校验均 0 FAIL；输出写入 `evidence/phase-final/pre-validate.log`。
2. `git status --porcelain packages/` 与 `git log --oneline -1` 记入 `evidence/phase-final/baseline.md`。
3. 核 :3084 身份（本仓 env）；未起则执行棒再 boot。
4. 读 `../dsh-bot-living-master/spec.md` §1.5 邻仓基线，不要代清。

**验证**：三次 validate 均 0 FAIL；`ls evidence/phase-final/baseline.md`

**Evidence**：`evidence/phase-final/`

### Phase 1: 实时包

### Task 2: 执行子包 dsh-bot-live-transcript 全量

- **关联**：BR-041 / BR-042 / INV-041 / INV-042
- **前置任务**：1

**具体操作**：按 `../dsh-bot-live-transcript/spec.md` §4 与其 tasks.csv 逐条推进（其 Task 1 真机校准不得跳过）；每 Phase 按其纪律 commit。结束时读其校准：有无增量帧、SSE 是否通，写入本包 `evidence/phase-final/live-board.md`，供 ASM-041 使用。

**验证**：其子包 tasks.csv 全部「已完成」或「已阻塞:原因」；对该目录跑 validate → 0 FAIL

**Evidence**：子包 `../dsh-bot-live-transcript/evidence/`；本包 `evidence/phase-final/live-board.md`

### Phase 2: 同事包

### Task 3: 执行子包 dsh-bot-peers 全量

- **关联**：BR-041 / BR-042 / INV-041
- **前置任务**：2

**具体操作**：

1. 开工前 diff `Transcript.tsx`：确认实时包思考/工具/审批卡在位；本包只加标签，不删卡。
2. 按 `../dsh-bot-peers/spec.md` §4 推进；礼仪只追加到 `composePersona` 的 behavior。
3. 实时包 SSE 若阻塞：同事页实时到达按 ASM-041 降级，备注写明。

**验证**：其子包 tasks.csv 全部「已完成」或「已阻塞:原因」；validate 0 FAIL

**Evidence**：子包 `../dsh-bot-peers/evidence/`；本包 `evidence/phase-final/peers-board.md`

### Phase 3: 名册包

### Task 4: 执行子包 dsh-bot-roster 全量

- **关联**：BR-041 / BR-042 / INV-041
- **前置任务**：3

**具体操作**：

1. 开工前 diff `Roster.tsx`：确认同事包关系图入口在位；分组/拖拽/菜单不得丢掉该入口。
2. 按 `../dsh-bot-roster/spec.md` §4 推进；不新开定时器。
3. 快捷键不改既有命令面板与 Esc。

**验证**：其子包 tasks.csv 全部「已完成」或「已阻塞:原因」；validate 0 FAIL

**Evidence**：子包 `../dsh-bot-roster/evidence/`；本包 `evidence/phase-final/roster-board.md`

### Phase 4: 联合验收与收尾

### Task 5: 执行 spec 5.2 真实场景全套测试（跨包联合回放）

- **关联**：UF-041 / UF-042 / UF-043 / INV-041 / INV-042
- **前置任务**：4

**验证**：按 5.2 执行矩阵逐行回放，全部通过

**Evidence**：`evidence/UF-041/` ~ `evidence/UF-043/`

### Task 6: 执行母包总回归验证（收尾）

- **关联**：BR-043 / BR-044 / INV-043
- **前置任务**：5

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/` → 空；`git status --porcelain` 不含 `env/dsh-bot`；邻仓 porcelain 与 living-master §1.5 同类；三子包 validate 二次 0 FAIL；本包 validate 0 FAIL；总报告 `evidence/phase-final/report.md` 写明每个子包完成/止损点

**Evidence**：`evidence/phase-final/final-commands.log`、`evidence/phase-final/report.md`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 母包完成 = 三子包 5.2 全过 + 本包 5.2 联合回放全过。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 四命令 | `pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` | 全绿 | EVD-044 |
| 子包校验 ×3（二次运行） | 对 `docs/dsh-bot-live-transcript`、`docs/dsh-bot-peers`、`docs/dsh-bot-roster` 各跑一次 validate `--repo .` | 0 FAIL | EVD-044 |
| 红线 | `rg -i 'anysphere\|sand://' packages/` | 空 | EVD-044 |
| 数据不入 git | `git status --porcelain` 检索 `env/dsh-bot` | 空 | EVD-044 |

### 5.2 真实场景全套测试（Real-Run，跨包联合回放）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（loopback :3084；先核本仓身份） |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui`；官方 GUI `http://127.0.0.1:3084`（UF-043 v1 委托用） |
| 测试账号/数据 | 本机单用户；人设「校对阿宁」「诗人小北」与一个老小组；测试前可备份再改布局/peers |
| 干净状态定义 | 每条 UF 前刷新；UF-042 前先隐藏小北 |
| 可用测试工具 | Playwright（`../../dsh-genoffice/engine/node_modules/playwright`，channel chrome）；`cat` / curl；Network 面板 |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-041 主路径 | browser + Network | 2.3 UF-041 | 回复带「来自」标签；SSE 就绪则无新定时器 | `evidence/UF-041/peer-reply.png`、`evidence/UF-041/network.md` |
| UF-041 失败分支 静默 | browser | 小北只回静默词 | 阿宁无新泡 | `evidence/UF-041/silent.md` |
| UF-042 主路径 | browser | 2.3 UF-042 | 已隐藏徽标 +1；展开能进 | `evidence/UF-042/hidden-badge.png`、`evidence/UF-042/expand.png` |
| UF-042 失败分支 静音 | browser | 隐藏且静音后再发 | 无通知，徽标仍 +1 | `evidence/UF-042/muted.png` |
| UF-043 主路径 | browser + RPC + cat | 2.3 UF-043 | v1/v2/三期 + 记忆一条 + 例程一条 | `evidence/UF-043/v1-ask.png`、`evidence/UF-043/v2-isolation.png`、`evidence/UF-043/group-round.png`、`evidence/UF-043/memory-routine.md` |
| UF-043 失败分支 隐藏委托 | cat | `dsh_bot_ask` 后 | `peers.jsonl` 无该隐藏会话 | `evidence/UF-043/ask-not-peer.md` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全；任一行失败 → 回对应子包任务修复后重跑。SSE 未合入时 UF-041 按 ASM-041 记 2s 回退，不算流式完成。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-final/   pre-validate.log baseline.md live-board.md peers-board.md roster-board.md final-commands.log report.md
  UF-041/ ~ UF-043/
```

### 5.4 Review 专项检查清单

- [ ] 顺序实时 → 同事 → 名册，校准未跳过（BR-041）
- [ ] Transcript 卡片 + 标签并存；Roster 关系图入口仍在；单一组合函数（BR-042）
- [ ] 只有一条 SSE，无新增定时器（INV-042）
- [ ] 报告写明每个子包完成/止损点（BR-043）
- [ ] 三子包二次 validate 0 FAIL；邻仓未代清
- [ ] living leftover 未被当新 bug 重开（BR-044）
