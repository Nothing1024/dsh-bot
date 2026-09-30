# dsh-bot-group-rounds-v2 Spec

> Version: 0.1.0 | Date: 2026-09-30 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**。在已上线的小组多轮讨论（`fd2be5d` 起：默认 3 轮、单成员重试、房间标题、working 真值）之上补齐四项：引用即点名、轮内排队可取消、继续讨论、删房间。
> 取代：`../archive/dsh-bot-group-rounds/`（旧板面不复用）。设计定案来源：`../remaining-prd-decision.md` §5（2026-09-30 用户拍板）。
> 本包 BR/UF/INV/EVD 编号只在包内唯一，用 0xx 段。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 人话摘要

- **给谁 / 场景**：在工作台小组房间里和多个人设一起讨论的本机用户。
- **做什么**：① 引用某个成员的话，只有他来回答；② 讨论还没结束时再发的话先排队（最多 3 条，可取消），本场结束后自动接着发；③ 用户不说话，点「让他们继续聊」再来一场；④ 房间可以删。
- **怎么算做完**：四项各自从真实入口（工作台小组房间）点通主路径和失败分支；1:1 对话面零变化；已交付的 @点名、多轮、重试、停止不回归；5.2 矩阵全过。
- **不做什么**：成员并行发言、排队持久化（重启即清空）、删房间时归档成员隐藏会话、1:1 的任何群功能。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 2026-09-30 对话：小组四项补齐（引用即点名 / 轮内排队可取消 / 继续讨论 / 删房间），细节见 `../remaining-prd-decision.md` §5 |
| 输入类型 | description（对话上下文 + 已拍板决策表） |
| Mode | oneclick |
| 置信度 | 高（每项行为用户逐条拍板；代码已勘察） |
| 输出目录 | `docs/dsh-bot-group-rounds-v2/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | backend（host RPC / 房间数据）+ frontend（workbench-ui 交互接线） |
| 主要风险 | 改变「讨论中再发一句」的既有语义（现在立即落盘并串行再跑一场）；房间 jsonl 新增 `system` 行需老解析兼容；删房间误删 1:1 数据 |
| 行号引用策略 | 行号只作 hint，以 symbol + rg anchor 为准 |
| 必需验收方式 | vitest 单测 + 真实网关 :3084 上浏览器实点（截图 + console + network） |
| 必须覆盖用户场景 | 引用点名、排队满 / 取消 / 停止、继续讨论忙碌态与空房间、删房间确认 / 取消 / 忙碌拒绝、1:1 零泄漏 |

### 1.3 勘察事实清单

> 每条事实来自 2026-09-30 本会话实际执行的命令（grep 工具等价 `rg`）。

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 回应者只由 `parseMentions` 决定：无 `@` = 全员，`@all` = 全员，否则 = 点名集；未识别点名 → `invalid-mention` | `rg -n "export function parseMentions" packages/dsh-bot-shared/src/mentions.ts` | L17-53；`responderIds` 在 L48 |
| 引擎按 `mention.responderIds` 过滤成员后跑多轮 | `rg -n "mention.responderIds" packages/dsh-bot-host/src/group-engine.ts` | L323 `runGroupRound` 内 |
| 引用只作提示词附加句，不影响回应者 | `rg -n "用户引用" packages/dsh-bot-host/src/group-engine.ts` | L517-519 `askMemberTurn` |
| 引用校验：`replyToSeq` 必须指向本房间非 error 行，否则 `invalid-input` | `rg -n "quoted message does not exist" packages/dsh-bot-host/src/group-inbox.ts` | L145-147 `accept` |
| 讨论中再发送：`accept` 立即 `appendRoomMessage` 落盘用户行，再串到 `tails` 尾部跑一整场 | `rg -n "this.tails.get\(roomId\)" packages/dsh-bot-host/src/group-inbox.ts` | L153-178；无上限、无单条取消 |
| 停止：`cancel` 中止全部 job 并对已落盘用户行打 `cancelledAt` | `rg -n "markRoomCancelled" packages/dsh-bot-host/src/group-inbox.ts` | L49 `stop` |
| 重试进行中 `submit` 抛 `room is busy` | `rg -n "room is busy" packages/dsh-bot-host/src/group-inbox.ts` | L76、L139 |
| 小组房间路由：`peekRoom` 命中即走 `groupInbox`，否则走 1:1 | `rg -n "groupInbox.submit\|groupInbox.cancel" packages/dsh-bot-host/src/index.ts` | L632 `promptSession`、L930 `cancel` |
| 房间 history 返回 `working/speaking/round/rounds`，无队列字段 | `rg -n "private async readHistory" packages/dsh-bot-host/src/index.ts` | L585-619 |
| 默认轮数 3，0 = 不限，上限 99；单场成员发言硬上限 10 | `rg -n "GROUP_ROUNDS_DEFAULT =\|GROUP_MAX_MEMBER_TURNS =" packages/dsh-bot-host/src` | `groups.ts` L19、`group-engine.ts` L39 |
| 房间 speaker 只有 `user/member/error` 三种；未知 kind 解析返回 `undefined`，该行被跳过 | `rg -n "function parseSpeaker" packages/dsh-bot-host/src/groups.ts` | L391-403；`parseRoomFile` L376 `continue` |
| 房间文件 `$DSH_HOME/dsh-bot/rooms/<roomId>.jsonl`；索引 `rooms.json` | `rg -n "ROOMS_DIR\|ROOMS_INDEX_FILE\|function roomFilePath" packages/dsh-bot-host/src/groups.ts` | L23-24、L161-163 |
| `GroupsRuntime` 无删房间方法；删组时按组删全部房间文件 | `rg -n "deleteGroup\|rm\(roomFilePath" packages/dsh-bot-host/src/groups.ts` | L512 `rm`、L520 `deleteGroup` |
| 成员隐藏会话带 `groupRoomMark(roomId)` 标记，按房间复用 | `rg -n "groupRoomMark" packages/dsh-bot-host/src/group-engine.ts` | L269 `ensureMemberTurnSession` |
| workbench RPC 为 `switch (method)` 分发；已有 `renameSession`、`retryMember`、`cancel`，无删房间 / 继续 / 队列 | `rg -n "case '" packages/dsh-bot-host/src/workbench-routes.ts` | L225-436 |
| 前端：回复 pill 状态在 `Conversation`，发送时带 `replyToSeq`；composer 显示「本次回应：…」只按 `parseMentions` 算 | `rg -n "replyToSeq\|composer-recipients" packages/workbench-ui/src` | `Conversation.tsx` L541-547、`Composer.tsx` L488-494 |
| 前端：working 时发送按钮变「停止」，Enter 仍走 `send`（hint「回复中仍可继续输入」） | `rg -n "composer-send\|void send\(\)" packages/workbench-ui/src/Composer.tsx` | L306-308、L475-486、L496 |
| 前端：房间行菜单 = 跳转 + 重命名；删除确认有 `ConfirmDelete` 可复用样式 | `rg -n "session-menu-panel\|function ConfirmDelete" packages/workbench-ui/src` | `SessionList.tsx` L155-173；`Roster.tsx` L556-576 |
| 前端：成员 chips 只有 speaking 态；头部显示「第 r/R 轮」 | `rg -n "memberChip\|conversation-working" packages/workbench-ui/src/Conversation.tsx` | L601-608、L843-862 |
| 房间投影：`projectRoomHistory` 把 user/member/error 投成 message item | `rg -n "export function projectRoomHistory" packages/dsh-bot-host/src/workbench-sessions.ts` | L290-341 |
| 测试基线：`pnpm test` 491 通过，1 个文件（`packages/tool-dsh-bot/tests/tools.spec.ts`）因解析 `dsh-bot-host` 入口失败；`pnpm run typecheck` 3 处既有错误均在 `packages/tool-dsh-bot/` | `pnpm test`；`pnpm run typecheck` | 与本包无关的既有失败，Task 1 记录为基线 |
| 定向测试可跑：`pnpm exec vitest run packages/dsh-bot-host/tests/group-engine.spec.ts packages/workbench-ui/tests/mentions.spec.ts` | 同左 | 2 文件 41 用例通过 |
| 网关当前未启动（:3084 无监听）；启动入口 `sh env/boot.sh`（loopback :3084，profile gb） | `ss -ltnp \| grep ':3084 '`；读 `env/boot.sh` | 计数 0；boot.sh L23、L72 |
| manual-test 覆盖 createGroup / createGroupSession / deleteGroup，不含房间对话 | `rg -n "createGroupSession" scripts/manual-test.sh` | L492-507 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-001 | 真实场景测试用 Playwright/Chrome 驱动 `http://127.0.0.1:3084/dsh-bot/ui`；工作台鉴权（`c012211`）允许本机浏览器登录 Cookie 后访问 | 浏览器登录链路不通则 5.2 只能降级为手动脚本 | Task 1 起网关后用浏览器打开工作台截图 |
| ASM-002 | 至少 2 个可用人设 + 可用模型凭据（`env/.env`），成员能真实回复 | 无凭据时成员只会报错，主路径跑不出 | Task 1 在小组里发一句观察是否有成员回复 |

---

## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。任务、handoff、review 一律引用 ID，不复制表格。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-001 | 引用即点名：回应者 = 显式 `@成员`（非 `@all`）> 被引成员 > 全员。被引成员由引用行的 `botId` 决定；引用的是用户行、error 行，或被引成员已不在组内 / 已删除 → 回退全员。`@all` / `@everyone` 仍是全员。服务端与 composer「本次回应」用同一解析函数 | 引用诗人小北 → 只有小北发言，且提示词带被引句；引用 + `@DSH Bot` → 只有 DSH Bot | 引用小北后全员都来答；composer 显示「本次回应：全员」而实际只有小北答 | dsh-bot-shared + dsh-bot-host + workbench-ui | Task 3/8 单测 + UF-001 |
| BR-002 | 轮内排队：房间讨论进行中（inbox 有 job）时新提交不落盘，进 host 内存 FIFO，每房间 ≤3 条；满则拒绝 `queue-full`（草稿保留）。`@` 与引用在入队时校验，非法立即报错不入队。本场结束后逐条出队：此时才 append 用户行并按 BR-001 开新一场。同 `requestId` 重复提交返回同一队列项。可单条取消；「停止」同时清空该房间队列；网关重启队列清空 | 讨论中发第二问 → 底部出现「排队中」行 → 本场结束后该问落盘并开下一场 | 排队消息插进当前轮；取消后仍被发送；第 4 条被接受 | dsh-bot-host + workbench-ui | Task 4/9 单测 + UF-002 |
| BR-003 | 继续讨论：房间 idle（无 job、队列空、不在重试）且至少有 1 条成员发言时可触发；append 一条 `speaker:{kind:'system'}`、`text:'继续讨论'` 分隔行作锚点，不追加用户行；回应者 = 全部在组成员，轮数 = 组设置；每轮只让「上次发言后房间有新内容」的成员开口（首轮也按此过滤），一整轮无人发言即结束；分隔行不以「用户:」形式进入成员提示词，改用自写自然语言提示「请接着刚才的讨论继续」 | 点「让他们继续聊」→ 出现灰色分隔线 → 成员接着上文各说一句 | 继续讨论重复注入上一条用户消息；讨论中还能点；空房间点了开始一场空讨论 | dsh-bot-host + workbench-ui | Task 5/10 单测 + UF-003 |
| BR-004 | 删房间：房间行菜单「删除房间」→ 二次确认 → 删除 `rooms/<roomId>.jsonl` 与 `rooms.json` 对应行；成员隐藏轮次会话、人设、1:1、小组行、其他房间全部保留；房间忙（有 job / 队列非空 / 重试中）时拒绝 `room is busy`，提示先停止；删后若当前选中该房间，切到剩余最新房间，无房间则空态；房间不存在 → `group-not-found`「房间不存在」 | 删「周会」房间 → 列表少一行、其他房间和私聊都在 | 删房间后成员私聊消失；讨论中能删；取消确认后仍被删 | dsh-bot-host + workbench-ui | Task 6/11 单测 + UF-004 |
| BR-005 | 兼容：默认轮数 3（取代旧包「默认 1 轮」）；无 `@` 无引用 → 全员；`@` 点名语义、多轮轮转、单成员重试、停止、房间自动标题与重命名均不变；重试进行中再提交仍拒绝 `room is busy`（不入队） | 老小组照常三轮讨论；重试中发消息仍提示忙 | 升级后老小组变一轮；重试中消息被排队 | dsh-bot-host | 既有 `group-engine.spec.ts` 全绿 + UF-005 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-001 | 两人小组房间里诗人小北已发过言 | 在小北气泡上点「回复」并发送一句不含 `@` 的话 | composer 显示「本次回应：诗人小北」；只有小北发言且回应被引句；刷新后引用条仍在 | 本机用户 | browser | EVD-003 |
| UF-002 | 房间讨论进行中 | 再发两句，取消其中一句 | 底部出现两条「排队中」，取消的一条消失；本场结束后剩下一条落盘并开新一场；第 4 条被拒绝且草稿保留 | 本机用户 | browser | EVD-004 |
| UF-003 | 房间 idle，已有成员发言 | 点「让他们继续聊」 | 出现灰色「继续讨论」分隔线，成员接着上文发言，无新用户气泡；讨论中按钮禁用 | 本机用户 | browser | EVD-005 |
| UF-004 | 小组有两个房间 | 在其中一个房间行菜单点「删除房间」并确认 | 该房间从列表消失，其他房间、成员私聊、人设都在；取消确认不删；讨论中删除被拒绝 | 本机用户 | browser | EVD-006 |
| UF-005 | 已有小组、1:1 人设 | 按旧方式 `@` 点名、不点名、重试失败成员、停止讨论；打开 1:1 对话 | 行为与 `fd2be5d` 以来一致；1:1 面没有继续讨论 / 排队行 / 删除房间 | 本机用户 | browser + vitest | EVD-007 |

> 五条均为用户可见，全部在 2.3 节有流程脚本。

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-001: 引用即点名

**前置状态**：工作台 → 左侧名册选中小组「编辑室」（成员：诗人小北、DSH Bot）→ 当前房间 idle，房间里已有小北的一条发言。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 悬停小北气泡，点「⋯」→「回复」 | composer 上方出现引用卡「回复: 诗人小北: …」，焦点进入输入框 | — | — |
| 2 | 输入「这句改短一点」 | composer 下方「本次回应：诗人小北」 | 前端用与服务端相同的解析（含被引成员） | — |
| 3 | 回车发送 | 输入框清空，气泡带「→ 诗人小北」引用条，头部「工作中」 | `prompt` 带 `replyToSeq`；host 解析回应者 = [小北]，落盘用户行 | — |
| 4 | — | 小北 chip 进入发言态 | 只唤醒小北，提示词含被引句 | 小北的回复上屏；DSH Bot 未发言 |
| 5 | 刷新页面 | — | history 返回 `replyTo` | 引用条仍显示 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 显式 `@` 覆盖 | 引用小北，同时输入 `@DSH Bot` | 「本次回应：DSH Bot」 | 只唤醒 DSH Bot | — |
| 引用自己的消息 | 在自己的用户气泡上点「回复」 | 「本次回应：诗人小北、DSH Bot」（全员） | 回退全员 | — |
| 被引成员已移出小组 | 引用后编辑小组移除小北再发送 | 提示「本次回应」为剩余全员 | 回退全员，不报错 | — |
| 被引消息不存在 | 引用行被其他标签页删房间 / 非法 seq | 错误提示「引用的消息不存在」，草稿与引用卡保留 | 返回 `invalid-input`，不落盘 | 清除引用卡后重发 |
| 点名无效 | 输入 `@幽灵` | 「点名未确认：幽灵」，不发送 | — | 重新选择成员 |

**界面状态机**：

```text
idle → quoting(引用卡) → sending → working(被引成员发言) → idle
                |              |
                v              v
          cleared(Esc/✕)   error(草稿+引用卡保留)
```

**入口接线清单**：

- 小组房间 → 成员/用户气泡「⋯」菜单「回复」→ `Conversation` `onReplyTo` → Composer 引用卡
- Composer「本次回应」提示 → 共享解析函数（带被引成员）
- 发送 → `prompt` RPC `replyToSeq` → `GroupInbox.accept` → `runGroupRound` 回应者

#### UF-002: 轮内排队可取消

**前置状态**：小组房间正在讨论（头部「第 1/3 轮 · 诗人小北 正在发言」），composer 发送键显示「停止」。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 输入「再想想标题」回车 | 输入框清空；transcript 底部出现排队行「再想想标题 · 排队中 · 取消」 | `prompt` 返回 `{queued:true, queueId}`；不写房间文件 | — |
| 2 | 再输入「顺便起个副标题」回车 | 第二条排队行出现在下方 | 入队，队列长度 2 | — |
| 3 | 点第二条的「取消」 | 按钮 loading → 该行消失 | `cancelQueued` 出队 | 只剩一条排队行 |
| 4 | — | 本场结束，排队行变为正式用户气泡，头部重新「工作中」 | 出队 → append 用户行 → 按 BR-001 开新一场 | 新一场成员回复上屏 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 队列已满 | 已有 3 条排队再发第 4 条 | 错误提示「排队已满（最多 3 条），请等当前讨论结束或取消一条」，草稿保留 | 返回 `queue-full`，不入队 | 取消一条后重发 |
| 停止讨论 | 有排队时点「停止」 | 当前讨论停止；排队行全部消失；toast「已停止，排队的 N 条未发送」 | `cancel` 中止 job 并清空该房间队列 | 需要时重新发送 |
| 排队项已出队 | 点「取消」时该条恰好已开始 | toast「这条已开始讨论，无法取消」；列表刷新 | `cancelQueued` 返回 `not-found` | 用「停止」中断 |
| 点名无效 | 讨论中发 `@幽灵 …` | 「点名未确认」，不入队 | 入队前校验失败 | 重新选择成员 |
| 网关重启 | 排队中重启网关 | 刷新后排队行消失 | 内存队列丢失（README 写明） | 重新发送 |

**界面状态机**：

```text
working → queued(1..3) → dequeued(变正式气泡) → working → idle
   |          |
   |          v
   |     cancelled(行消失)
   v
stopped(队列清空)
```

**入口接线清单**：

- 讨论中 composer 回车 / 发送（Enter；发送按钮在 working 时仍是「停止」）→ `prompt` RPC → `GroupInbox` 入队
- history 响应 `queued[]` → `useSessionPoll` → Transcript 底部排队行
- 排队行「取消」按钮 → `cancelQueued` RPC
- 「停止」→ `cancel` RPC → 清空队列

#### UF-003: 继续讨论

**前置状态**：小组房间 idle，已有至少一条成员发言，队列为空。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点房间头部「让他们继续聊」 | 按钮 loading 并禁用 | `continueDiscussion` RPC | — |
| 2 | — | transcript 出现灰色分隔线「继续讨论」；头部「第 1/3 轮」 | append `system` 行；全员按「有新内容」过滤后开一场 | — |
| 3 | — | 成员 chip 依次发言 | 无新用户行 | 成员接着上文的发言上屏；讨论结束后按钮恢复可点 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 讨论进行中 | working / 队列非空 / 重试中 | 按钮 disabled，title「讨论进行中」 | 服务端同样拒绝 `room is busy` | 等结束或停止 |
| 房间还没有成员发言 | 空房间 / 只有用户行 | 按钮 disabled，title「先发一条消息开始讨论」 | 服务端拒绝 `invalid-input` | 先发消息 |
| 成员都没新内容 | 所有成员都已回应过最后一条 | 分隔线出现后头部很快回到 idle，无新发言 | 首轮无人发言即结束 | — |
| 停止 | 继续讨论中点「停止」 | 讨论停止，分隔线保留 | `cancel` 中止 | 可再次继续 |

**界面状态机**：

```text
idle(可点) → continuing → working → idle
   |disabled: working / 无成员发言
```

**入口接线清单**：

- 小组房间头部（`conversationHead` `headActions`）按钮「让他们继续聊」→ `continueDiscussion` RPC → `GroupInbox.continueDiscussion`
- history 投影 `system` 行 → Transcript 分隔线

#### UF-004: 删房间

**前置状态**：小组有房间 A（当前选中）和房间 B，均 idle。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 打开房间切换器，点房间 A 行「⋯」→「删除房间」 | 弹出确认框「删除房间「A」？成员人设和他们的私聊都会保留。」 | — | — |
| 2 | 点「删除」 | 按钮 loading，禁用 | `deleteGroupSession` RPC | — |
| 3 | — | 确认框关闭；toast「已删除房间」 | 删 `rooms/A.jsonl` 与 `rooms.json` 行 | 列表只剩 B，自动选中 B |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 取消 | 确认框点「取消」或 Esc | 确认框关闭，焦点回到菜单按钮 | 无请求 | — |
| 房间忙 | 房间讨论中 / 有排队 / 重试中 | 确认框内错误「房间正在讨论，先停止再删除」，不关闭 | 返回 `invalid-input` `room is busy` | 停止后重试 |
| 删最后一个房间 | 小组只剩 A | 删除后显示空态「还没有发言」 | 同主路径 | 发消息自动建新房间 |
| 房间已不存在 | 另一标签页已删 | toast「房间不存在」，列表刷新 | 返回 `group-not-found` | — |

**界面状态机**：

```text
menu → confirming → deleting → deleted(切换到最新房间 / 空态)
           |            |
           v            v
       cancelled    error(确认框保留)
```

**入口接线清单**：

- 房间切换器（`session-select`）→ `SessionList` 行菜单（仅 `groupMode`）「删除房间」→ 确认框 → `deleteGroupSession` RPC
- 删除成功 → `Conversation.loadSessions` 刷新并选中

#### UF-005: 旧行为零回归与 1:1 零泄漏

**前置状态**：已有小组（默认 3 轮）与 1:1 人设。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 小组里发一句不带 `@` 的话 | 「本次回应：全员」 | 全员多轮讨论 | 头部「第 r/3 轮」，成员依次发言 |
| 2 | 发 `@诗人小北 …` | 「本次回应：诗人小北」 | 只唤醒小北 | 只有小北发言 |
| 3 | 在成员错误行点「重试该成员」 | 「重试中」 | `retryMember` | 该成员补一句 |
| 4 | 打开任一 1:1 人设对话 | — | — | 无「让他们继续聊」、无排队行、会话菜单无「删除房间」 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 重试中再发送 | 重试进行中回车 | 错误「room is busy」，草稿保留 | 不入队（BR-005） | 等重试结束 |
| 老房间文件 | 打开 v2 之前创建的房间 | 历史正常显示 | 无 `system` 行也能解析 | — |

**界面状态机**：沿用既有（idle → sending → working → idle）。

**入口接线清单**：既有入口，不新增。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-001 | 1:1 路径（`peekRoom` 未命中）行为不变：不入组队列、不出现继续讨论 / 删除房间 / 排队行 | BR-005 / UF-005 | 既有 1:1 测试全绿 + UF-005 步骤 4 截图 |
| INV-002 | 排队项在出队前绝不写进房间文件；取消 / 停止的排队项永不落盘 | BR-002 / UF-002 | Task 4 单测断言房间 messages |
| INV-003 | 删房间只删目标 jsonl 与索引行；`groups.json`、其他房间、成员隐藏会话、人设与 1:1 会话不动 | BR-004 / UF-004 | Task 6 单测 + UF-004 前后文件对比 |
| INV-004 | 含 `system` 行的房间文件被旧解析跳过而非报错；新解析读得出旧文件 | BR-003 / UF-005 | Task 5 单测 |
| INV-005 | 不改官方 npm 包与邻仓；运行数据（`env/dsh-bot/`）不入 git；仍只用 :3084 | 全部 | `git status --porcelain` + `rg -i 'anysphere\|sand://' packages/` 为空 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-001 | log | 开工基线：`pnpm test` / `pnpm run typecheck` 输出与既有失败说明 | `evidence/phase-0/baseline.log` |
| EVD-002 | log | 各 Phase 定向 vitest 输出 | `evidence/phase-{N}/commands.log` |
| EVD-003 | screenshot/log | UF-001 主路径与分支截图 + console | `evidence/UF-001/` |
| EVD-004 | screenshot/log | UF-002 排队 / 取消 / 满 / 停止截图 + network | `evidence/UF-002/` |
| EVD-005 | screenshot | UF-003 分隔线、禁用态截图 | `evidence/UF-003/` |
| EVD-006 | screenshot/log | UF-004 删除前后截图 + `rooms/` 目录列表前后对比 | `evidence/UF-004/` |
| EVD-007 | screenshot/log | UF-005 回归截图 + 最终全量命令输出 | `evidence/UF-005/`、`evidence/phase-final/` |

### 2.6 角色与权限矩阵

单一角色（本机工作台用户），无权限差异。工作台 RPC 鉴权沿用 `c012211` 的 Host/Origin + 浏览器 Cookie 校验，本包新增的三个 RPC 走同一 `/dsh-bot/*` 路由，不另开入口。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 重复提交 | 讨论中同一 `requestId` 提交两次 | 第二次 `prompt` | 返回同一排队项，队列长度不变 | EVD-004 |
| 空数据 | 空房间 | 点继续讨论 / 删房间 | 继续讨论 disabled；删房间正常删除 | EVD-005、EVD-006 |
| 网络/依赖失败 | 出队后成员报错 | 新一场执行 | 写 error 行，可「重试该成员」，队列继续下一条 | EVD-004 |
| 旧数据兼容 | v2 之前的房间文件 | 打开、继续讨论、删除 | 均正常 | EVD-007 |

### 2.8 非目标

- 成员并行发言（保持串行）。
- 排队持久化 / 网关重启后恢复（用户 2026-09-30 选内存队列）。
- 删房间时归档成员隐藏会话（用户选保留）。
- 1:1 对话的继续讨论、排队、删除。
- 排队项编辑 / 重排（只支持取消）。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
prompt(room) → GroupInbox.accept → append 用户行 → tails 串行 runGroupRound
                                   └ 回应者 = parseMentions(text)（引用不参与）
讨论中再发 = 立即落盘 + 串到队尾再跑一整场（无上限、不可单条取消）
删房间：无；继续讨论：无

After:
prompt(room) ─ 房间空闲 → start: append 用户行 → runGroupRound
             └ 房间忙   → 校验 @/引用 → queues[roomId]（≤3，内存）→ {queued, queueId}
job 结束 → drain: 出队 → start
回应者 = resolveResponders(text, members, quotedBotId)   (shared，composer 同用)
continueDiscussion(room) → append {kind:'system'} → runGroupRound(continuation)
cancelQueued(room, queueId) → 出队；cancel(room) → 停 job + 清队列
deleteGroupSession(room) → 忙则拒；否则删 jsonl + rooms.json 行
history(room) += queued[]
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `dsh-bot-shared` `mentions.ts` | 收件人规则单一实现 | 新增 `resolveResponders(text, members, quotedBotId?)`：`parseMentions` 无点名且 `quotedBotId` 在成员内 → 只返回被引成员；其余同 `parseMentions` |
| `dsh-bot-shared` `types.ts` | wire 类型 | `HistoryValue.queued?`；`WorkbenchHistoryItem.kind` 加 `'system'`；`PromptValue` 加 `queued?/queueId?` |
| `dsh-bot-shared` `wire-error.ts` | 错误文案 | 新增 `queue-full` 文案 |
| `dsh-bot-host` `groups.ts` | 房间存储 | `RoomSpeaker` 加 `{kind:'system'}` 与解析；新增 `deleteGroupSession({roomId})`：只删 `rooms.json` 中登记过的 roomId |
| `dsh-bot-host` `group-engine.ts` | 讨论引擎 | `RunGroupRoundRequest` 加 `quotedBotId?`、`continuation?`；回应者走 `resolveResponders`；continuation 时全员且首轮也按「有新内容」过滤；`formatRoomLine` 把 system 行写成「主持提示：请接着刚才的讨论继续。」 |
| `dsh-bot-host` `group-inbox.ts` | 房间准入 | 抽出 `start()`；忙时入队（≤3，`requestId` 去重）；job 结束 `drain()`；新增 `cancelQueued`、`continueDiscussion`、`queued(roomId)`、`busy(roomId)`；`stop` 清空队列并返回 `dropped` |
| `dsh-bot-host` `errors.ts` | 错误码 | 加 `'queue-full'` |
| `dsh-bot-host` `workbench-sessions.ts` | 投影 | `projectRoomHistory` 投出 system 行；`PromptResult`/`HistoryResult` 加字段 |
| `dsh-bot-host` `index.ts` / `workbench-routes.ts` | RPC 门面 | 新增 `continueDiscussion`、`cancelQueued`、`deleteGroupSession` 三个 case 与 face 方法；history 带 `queued` |
| `workbench-ui` `api.ts` / `useSessionPoll.ts` | 前端数据 | 三个 RPC 包装；poll 暴露 `queued` |
| `workbench-ui` `Composer.tsx` / `Conversation.tsx` | 发送与头部 | `ComposerReplyTo.botId?`；「本次回应」用 `resolveResponders`；入队结果清 pending；头部「让他们继续聊」；删房间确认框；停止后 toast 丢弃数 |
| `workbench-ui` `Transcript.tsx` / `SessionList.tsx` | 展示 | 排队行 + 取消；system 分隔线；`groupMode` 行菜单加「删除房间」 |

### 3.3 三段式定位清单

> 行号只是 hint（2026-09-30 勘察）；漂移时以 symbol + rg anchor 为准。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-shared/src/mentions.ts` | `export function parseMentions` | `rg -n "export function parseMentions" packages/dsh-bot-shared/src/mentions.ts` | L17-53 | 在其后加 `resolveResponders` |
| `packages/dsh-bot-shared/src/types.ts` | `export interface HistoryValue` / `WorkbenchHistoryItem` | `rg -n "export interface HistoryValue\|export interface WorkbenchHistoryItem" packages/dsh-bot-shared/src/types.ts` | L93-123 | 加 `queued` / `'system'` |
| `packages/dsh-bot-shared/src/wire-error.ts` | `const COPY: Record<string, Copy>` | `rg -n "const COPY" packages/dsh-bot-shared/src/wire-error.ts` | L38 起 | 加 `queue-full` |
| `packages/dsh-bot-host/src/errors.ts` | `export type DshBotErrorCode` | `rg -n "export type DshBotErrorCode" packages/dsh-bot-host/src/errors.ts` | L8-32 | 加 `'queue-full'` |
| `packages/dsh-bot-host/src/groups.ts` | `export type RoomSpeaker` / `function parseSpeaker` / `const renameGroupSession` | `rg -n "export type RoomSpeaker\|function parseSpeaker\|const renameGroupSession" packages/dsh-bot-host/src/groups.ts` | L73-76、L391-403、L560-571 | system speaker；新增 `deleteGroupSession` 放在 `renameGroupSession` 后，导出表 L689-703 |
| `packages/dsh-bot-host/src/group-engine.ts` | `export async function runGroupRound` / `function formatRoomLine` / `async function askMemberTurn` | `rg -n "export async function runGroupRound\|function formatRoomLine\|async function askMemberTurn" packages/dsh-bot-host/src/group-engine.ts` | L304-371、L165-170、L487-585 | 回应者 L321-325；首轮过滤 L348 |
| `packages/dsh-bot-host/src/group-inbox.ts` | `export class GroupInbox` / `private async accept` / `private async stop` | `rg -n "private async accept\|private async stop" packages/dsh-bot-host/src/group-inbox.ts` | L121-180、L37-51 | 入队 / drain / 清队列 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function projectRoomHistory` / `export interface PromptResult` | `rg -n "export function projectRoomHistory\|export interface PromptResult" packages/dsh-bot-host/src/workbench-sessions.ts` | L290-341、L137-141 | system 投影 |
| `packages/dsh-bot-host/src/index.ts` | `private async readHistory` / `async retryMember` / `async cancel` | `rg -n "private async readHistory\|retryMember\(input\|groupInbox.cancel" packages/dsh-bot-host/src/index.ts` | L585-619、L581-583、L929-931 | 新 face 方法放在 `retryMember` 后 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `export interface WorkbenchBotsFace` / `case 'retryMember'` | `rg -n "case 'retryMember'" packages/dsh-bot-host/src/workbench-routes.ts` | L66-100、L279-284 | 三个新 case 放其后 |
| `packages/workbench-ui/src/api.ts` | `export function retryMember` | `rg -n "export function retryMember" packages/workbench-ui/src/api.ts` | L288-294 | 三个新包装放其后 |
| `packages/workbench-ui/src/useSessionPoll.ts` | `export function useSessionPoll` | `rg -n "return \{ items, working" packages/workbench-ui/src/useSessionPoll.ts` | L84-208 | 暴露 `queued` |
| `packages/workbench-ui/src/Composer.tsx` | `export interface ComposerReplyTo` / `composer-recipients` | `rg -n "export interface ComposerReplyTo\|composer-recipients" packages/workbench-ui/src/Composer.tsx` | L16-20、L488-494 | 加 `botId?`；换 `resolveResponders` |
| `packages/workbench-ui/src/Conversation.tsx` | `const send` / `const stopGeneration` / `onReplyTo` / `headActions` | `rg -n "const send = async\|const stopGeneration\|onReplyTo:\|className=\"headActions\"" packages/workbench-ui/src/Conversation.tsx` | L498-569、L582-593、L949-955、L634 | 入队 / toast / 继续讨论按钮 / 删房间 |
| `packages/workbench-ui/src/Transcript.tsx` | `export function Transcript` / `const messages = props.items` | `rg -n "const messages = props.items" packages/workbench-ui/src/Transcript.tsx` | L63、L140-142 | 排队行 + system 分隔线 |
| `packages/workbench-ui/src/SessionList.tsx` | `export interface SessionListProps` / `SessionRename` 行菜单 | `rg -n "export interface SessionListProps\|<SessionRename" packages/workbench-ui/src/SessionList.tsx` | L26-38、L165-171 | `onDeleteRoom?` + 菜单项 |
| `packages/workbench-ui/src/Roster.tsx` | `function ConfirmDelete` | `rg -n "function ConfirmDelete" packages/workbench-ui/src/Roster.tsx` | L556-576 | 复用 `confirmMask`/`confirmBox` 样式 |
| `packages/dsh-bot-host/tests/group-engine.spec.ts` | `describe('runGroupRound'` + `GroupInbox` 用例 | `rg -n "describe\('runGroupRound'" packages/dsh-bot-host/tests/group-engine.spec.ts` | L392 起 | 新用例同文件 |
| `README.md` | 小组「一轮语义」段 | `rg -n "一轮语义" README.md` | L85 | 改为多轮 + 排队 + 继续 + 删房间 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 是 | 新增 RPC `continueDiscussion {sessionId}`、`cancelQueued {sessionId, queueId}`、`deleteGroupSession {sessionId}`；`prompt` 对忙房间返回 `{sessionId, queued:true, queueId}`；`history` 房间响应加 `queued:[{queueId,text,replyTo?,createdAt}]` | 只加字段；空闲房间 `prompt` 响应不变 |
| 数据 | 是 | 房间 jsonl 新增 `speaker.kind='system'` 行；删房间删 jsonl 与索引行 | 旧文件无 system 行照常读；旧代码读新文件跳过 system 行（INV-004） |
| 权限 | 否 | 走既有 `/dsh-bot/*` 鉴权（2.6） | — |
| 路由 | 否 | 仍是 `POST /dsh-bot/<method>` 分发 | — |

---

## 4. Phase 计划与任务详情

> Phase 依赖链：

```text
P0 基线与校准 ─▶ P1 契约与存储(shared 类型 / 错误码 / system 行 / 删房间存储)
                    ─▶ P2 host 引擎与 RPC(点名 / 排队 / 继续 / 删房间)
                         ─▶ P3 workbench-ui 交互接线
                              ─▶ P4 文档与真实场景验收
```

> 任务状态跟踪：同目录 `tasks.csv`（17 条）。任务标题 `### Task {N}: {标题}`，N 与 CSV 序号一致。

### Phase 0: 基线与校准

> 你在哪里：代码已勘察（§1.3），网关未起。
> 做完之后：基线命令输出已存档；ASM-001/002 已确认或降级方案已定。

### Task 1: 记录基线并校准真实场景环境

- **关联**：EVD-001 / ASM-001 / ASM-002 / INV-005（UF 写 NA：环境校准，非用户功能）
- **前置任务**：无
- **风险等级**：P1

**为什么做**：`tool-dsh-bot` 有既有测试 / typecheck 失败，不先记下会被误算成本包回归；5.2 依赖浏览器与模型凭据。

**涉及文件与定位**：

- `env/boot.sh`：`exec node "$DSH_JS"`，`rg -n "GW_PORT=" env/boot.sh`，L23（hint）

**具体操作**：

1. `pnpm test` 与 `pnpm run typecheck` 输出存 `evidence/phase-0/baseline.log`，列出既有失败文件。
2. `git status --porcelain` 记录开工基线。
3. `sh env/boot.sh`（hub 常驻），浏览器打开 `http://127.0.0.1:3084/dsh-bot/ui` 截图；建一个两人小组（或复用），发一句确认成员有真实回复。
4. 任一步不通 → 在 `evidence/phase-0/calibration.md` 写明，并把 5.2 改为「手动脚本 + 用户回填」。

**验证**：`ls docs/dsh-bot-group-rounds-v2/evidence/phase-0/baseline.log docs/dsh-bot-group-rounds-v2/evidence/phase-0/calibration.md` → 两个文件存在

**Evidence**：`evidence/phase-0/`

**注意事项**：易错点：别人的 :3084 先用 `env/gateway-id.sh` 核 `DSH_HOME`；禁止为测试清空 `env/dsh-bot/`。

### Task 2: 执行 Phase 0 回归验证

- **关联**：本 Phase 全部（EVD-001）
- **前置任务**：1

**验证**：`pnpm exec vitest run packages/dsh-bot-host/tests/group-engine.spec.ts packages/workbench-ui/tests/mentions.spec.ts` → 41 通过（与 §1.3 一致）

**Evidence**：`evidence/phase-0/commands.log`

### Phase 1: 契约与存储

> 你在哪里：只有 user/member/error 三种房间行；无删房间存储；回应者不看引用。
> 做完之后：共享解析 `resolveResponders`、wire 类型、错误码、system 行、`deleteGroupSession` 存储全部就绪并有单测。

### Task 3: 共享回应者解析与 wire 类型

- **关联**：BR-001 / BR-002 / BR-003 / UF-001 / INV-004 / EVD-002
- **前置任务**：2
- **风险等级**：P1

**为什么做**：服务端与 composer「本次回应」必须同一规则（BR-001），否则提示与实际不符。

**涉及文件与定位**：

- `packages/dsh-bot-shared/src/mentions.ts`：`export function parseMentions`，`rg -n "export function parseMentions" packages/dsh-bot-shared/src/mentions.ts`，L17-53
- `packages/dsh-bot-shared/src/types.ts`：`export interface HistoryValue`，L116-123
- `packages/dsh-bot-shared/src/wire-error.ts`：`const COPY`，L38 起

**具体操作**：

1. 新增 `resolveResponders(text, members, quotedBotId?)`：先 `parseMentions`；`unmatched` 或有显式点名（非 all）→ 原样；否则 `quotedBotId` 在 `members` 内 → `responderIds=[quotedBotId]`；否则原样。
2. `HistoryValue` 加 `queued?: readonly {queueId; text; replyTo?; createdAt}[]`；`WorkbenchHistoryItem.kind` 加 `'system'`；前端 `PromptValue` 加 `queued?`、`queueId?`。
3. `COPY['queue-full']`：标题「排队已满（最多 3 条）」，提示「等当前讨论结束或取消一条排队」。
4. 单测：引用 / 引用 + @ / 引用 + @all / 引用自己（无 quotedBotId）/ 被引不在组。

**验证**：`pnpm exec vitest run packages/workbench-ui/tests/mentions.spec.ts packages/dsh-bot-shared/tests/wire-error.spec.ts` → 通过

**Evidence**：`evidence/phase-1/commands.log`

**注意事项**：禁止在前端另写一份规则；`parseMentions` 现有签名与行为不改（INV-001）。

### Task 4: 房间 system 行与删房间存储

- **关联**：BR-003 / BR-004 / INV-003 / INV-004 / EVD-002
- **前置任务**：2
- **风险等级**：P1

**为什么做**：继续讨论需要锚点行；删房间需要只动目标房间的存储原语。

**涉及文件与定位**：

- `packages/dsh-bot-host/src/groups.ts`：`export type RoomSpeaker` L73-76、`function parseSpeaker` L391-403、`const renameGroupSession` L560-571、返回表 L689-703
- `packages/dsh-bot-host/src/workbench-sessions.ts`：`export function projectRoomHistory` L290-341
- `packages/dsh-bot-host/src/errors.ts`：`export type DshBotErrorCode` L8-32

**具体操作**：

1. `RoomSpeaker` 加 `{ kind: 'system' }`；`parseSpeaker` 识别 `system`（无需 botId）。
2. `appendRoomMessage` 对 system 行不触发自动起题（现逻辑只对 user，确认保持）。
3. 新增 `deleteGroupSession({roomId})`（`withLock` 包裹）：roomId 不在 `rooms.json` → `group-not-found`「房间不存在」；否则删 `rooms/<roomId>.jsonl`（`rm force`）并写回索引。
4. `projectRoomHistory`：system 行投成 `{kind:'system', text}`。
5. `DshBotErrorCode` 加 `'queue-full'`。
6. 单测（`groups.spec.ts` / `workbench-sessions.spec.ts`）：system 行往返；旧文件兼容；删除只删目标、兄弟房间与 `groups.json` 不变；不存在 → group-not-found。

**验证**：`pnpm exec vitest run packages/dsh-bot-host/tests/groups.spec.ts packages/dsh-bot-host/tests/workbench-sessions.spec.ts` → 通过

**Evidence**：`evidence/phase-1/commands.log`

**注意事项**：只接受索引里登记过的 roomId，防止路径穿越删任意文件；不触碰成员隐藏会话（用户拍板）。

### Task 5: 执行 Phase 1 回归验证

- **关联**：本 Phase 全部 + INV-001
- **前置任务**：3;4

**验证**：`pnpm exec vitest run packages/dsh-bot-host packages/dsh-bot-shared packages/workbench-ui/tests/mentions.spec.ts` → 通过；`pnpm run typecheck` 只剩 Task 1 基线里的既有错误

**Evidence**：`evidence/phase-1/`

### Phase 2: host 引擎与 RPC

> 你在哪里：存储与共享规则就绪，引擎仍按旧语义。
> 做完之后：四项行为在 host 侧可经 RPC 触发并有单测；1:1 路径不变。

### Task 6: 引擎接入引用点名与继续讨论语义

- **关联**：BR-001 / BR-003 / BR-005 / UF-001 / UF-003 / INV-001 / EVD-002
- **前置任务**：5
- **风险等级**：P1

**为什么做**：回应者选择和首轮过滤是引擎内逻辑。

**涉及文件与定位**：

- `packages/dsh-bot-host/src/group-engine.ts`：`export async function runGroupRound` L304-371（回应者 L321-325，首轮过滤 L348）；`function formatRoomLine` L165-170

**具体操作**：

1. `RunGroupRoundRequest` 加 `quotedBotId?: string`、`continuation?: boolean`。
2. 回应者：`resolveResponders(text, members, quotedBotId)`；`continuation` 时 = 全员、不解析文本。
3. `continuation` 时首轮也执行 `hasNew` 过滤（L348 条件改为 `(round > 0 \|\| continuation) && !hasNew`）；锚点 message 用 system 行。
4. `formatRoomLine`：system 行 → 「主持提示：请接着刚才的讨论继续。」；不以「用户:」出现。
5. 单测：引用小北只唤醒小北；引用 + @DSH Bot 只唤醒 DSH；被引不在组回退全员；continuation 不新增 user 行、跳过无新内容成员、prompt 不含「用户: 继续讨论」。

**验证**：`pnpm exec vitest run packages/dsh-bot-host/tests/group-engine.spec.ts` → 通过（含既有全部用例）

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：禁止改默认轮数（BR-005）；上限 10 条仍生效。

### Task 7: GroupInbox 排队、取消与忙碌判定

- **关联**：BR-002 / BR-003 / BR-004 / BR-005 / UF-002 / INV-002 / EVD-002
- **前置任务**：6
- **风险等级**：P0

**为什么做**：改变讨论中再发送的语义，是本包风险最高的点。

**涉及文件与定位**：

- `packages/dsh-bot-host/src/group-inbox.ts`：`private async accept` L121-180、`private async stop` L37-51、`acceptRetry` L67-104

**具体操作**：

1. 抽出 `start(roomId, input, quote)`：append 用户行 + 建 job + 串 `tails` 跑 `runGroupRound({quotedBotId})`；job 结束 `finally` 调 `drain(roomId)`。
2. `accept`：校验 `@` 与引用（同现逻辑）；`retrying` → `room is busy`；`working(roomId)` → 入队：`requestId` 已在队列 → 返回同项；长度 ≥3 → `queue-full`；否则 push `{queueId, text, replyToSeq, requestId, createdAt}` 返回 `{sessionId, queued:true, queueId}`；空闲 → `start`。
3. `drain`：无 job 时 shift 一条 → `start`（replyToSeq 失效则写 error 行并继续下一条）。
4. `cancelQueued(roomId, queueId)` → 移除；不存在 → `not-found`「这条已开始讨论，无法取消」。
5. `stop`：清空队列，返回 `{accepted:true, dropped:n}`。
6. `continueDiscussion(roomId)`：`busy()`（job / 队列 / retrying / tracker.working）→ `room is busy`；房间无 member 行 → `invalid-input`「先发一条消息开始讨论」；否则 append system 行 → job → `runGroupRound({continuation:true, message: systemLine})`。
7. 公开 `queued(roomId)`、`busy(roomId)`。
8. 单测：排队不落盘；FIFO 出队；第 4 条 queue-full；requestId 去重；取消后不发；stop 清空；重试中提交仍 busy；continue 忙 / 空房间拒绝。

**验证**：`pnpm exec vitest run packages/dsh-bot-host/tests/group-engine.spec.ts` → 通过；既有「keeps each accepted message in its own round…」用例按新语义改写断言（排队后仍各自成场），不得删除

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：所有入口仍经 `admit` 串行，防竞态；队列只在内存，不写文件（INV-002）。

### Task 8: RPC 门面与 history 队列字段

- **关联**：BR-002 / BR-003 / BR-004 / UF-002 / UF-003 / UF-004 / INV-001 / INV-003 / EVD-002
- **前置任务**：7
- **风险等级**：P1

**为什么做**：前端只通过 `/dsh-bot/<method>` 调用；三个新 RPC 与 history 字段要接到 GroupInbox。

**涉及文件与定位**：

- `packages/dsh-bot-host/src/index.ts`：`retryMember(input` L581-583、`private async readHistory` L585-619、`groupInbox.cancel` L929-931
- `packages/dsh-bot-host/src/workbench-routes.ts`：`export interface WorkbenchBotsFace` L66-100、`case 'retryMember'` L279-284
- `packages/dsh-bot-host/src/workbench-sessions.ts`：`export interface PromptResult` L137-141、`export interface HistoryResult` L120-127

**具体操作**：

1. face 加 `continueDiscussion({sessionId})`、`cancelQueued({sessionId, queueId})`、`deleteGroupSession({sessionId})`；非房间 id → `not-found`（1:1 不可用，INV-001）。
2. `deleteGroupSession`：`groupInbox.busy` → `room is busy`；否则 `groupsRuntime.deleteGroupSession`。
3. `readHistory` 房间分支加 `queued: groupInbox.queued(roomId)`（只 `text/replyTo/queueId/createdAt`）。
4. `routes` 三个 case，参数校验沿用 `asString(...).trim()`，空值 → `invalid-input`。
5. `cancel` 房间分支把 `dropped` 透传。
6. 单测（`workbench-routes.spec.ts`）：三个方法分发、参数缺失报错、1:1 sessionId 拒绝。

**验证**：`pnpm exec vitest run packages/dsh-bot-host/tests/workbench-routes.spec.ts packages/dsh-bot-host/tests/routes.spec.ts` → 通过

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：不新增 HTTP 路由，只加 method case（2.6 鉴权不变）。

### Task 9: 执行 Phase 2 回归验证

- **关联**：本 Phase 全部 + BR-005 + INV-001
- **前置任务**：8

**验证**：`pnpm exec vitest run packages/dsh-bot-host` → 通过；网关重启后 `bash scripts/manual-test.sh --no-write` 小组段全过；对真实网关 curl 三个 RPC（本机 loopback 非浏览器免 Cookie）各一发正常 + 一发参数错

**Evidence**：`evidence/phase-2/`（含 `api-samples.md`）

### Phase 3: workbench-ui 交互接线

> 你在哪里：host 行为就绪，界面看不到排队、没有继续 / 删除入口，「本次回应」不认引用。
> 做完之后：2.3 节四条流程的每步界面反馈和入口接线全部可点通。

### Task 10: 前端数据层与引用点名接线

- **关联**：BR-001 / UF-001 / EVD-002
- **前置任务**：9
- **风险等级**：P1

**为什么做**：UF-001 步骤 2「本次回应：诗人小北」与发送结果必须一致。

**涉及文件与定位**：

- `packages/workbench-ui/src/api.ts`：`export function retryMember` L288-294
- `packages/workbench-ui/src/useSessionPoll.ts`：`export function useSessionPoll` L84-208
- `packages/workbench-ui/src/Composer.tsx`：`export interface ComposerReplyTo` L16-20、`composer-recipients` L488-494
- `packages/workbench-ui/src/Conversation.tsx`：`onReplyTo:` L949-955

**具体操作**：

1. `api.ts` 加 `continueDiscussion(roomId)`、`cancelQueued(roomId, queueId)`、`deleteGroupSession(roomId)`。
2. `useSessionPoll` 读 `outcome.value.queued`，返回 `queued`（默认 `[]`）。
3. `ComposerReplyTo` 加 `botId?`；`onReplyTo` 从 `item.author?.botId` 填（用户行不填）。
4. Composer「本次回应」改用 `resolveResponders(text, members, replyTo?.botId)`。
5. 单测（`composer.spec.tsx`）：有引用卡且无 @ 时显示被引成员名；加 @ 后显示点名成员。

**验证**：`pnpm exec vitest run packages/workbench-ui/tests/composer.spec.tsx packages/workbench-ui/tests/session-poll.spec.tsx packages/workbench-ui/tests/api.spec.ts` → 通过

**Evidence**：`evidence/phase-3/commands.log`

**注意事项**：1:1 不传 members，`recipients` 仍为 null（INV-001）。

### Task 11: 排队行与停止反馈接线

- **关联**：BR-002 / UF-002 / INV-002 / EVD-004
- **前置任务**：10
- **风险等级**：P1

**为什么做**：UF-002 的排队行、取消、满、停止 toast 全是界面本体。

**涉及文件与定位**：

- `packages/workbench-ui/src/Conversation.tsx`：`const send = async` L498-569、`const stopGeneration` L582-593
- `packages/workbench-ui/src/Transcript.tsx`：`const messages = props.items` L140-142

**具体操作**：

1. `send`：`prompt` 返回 `queued:true` → 清 pending、清引用卡、清草稿、`poll.refresh()`；`queue-full` → 错误提示（`describeWireError`），草稿与引用卡保留。
2. Transcript 新 prop `queued` + `onCancelQueued`：底部渲染「{text} · 排队中 · 取消」行（`data-testid="queued-row-{queueId}"`，取消按钮 busy 时 disabled）。
3. 取消：`cancelQueued` 成功刷新；`not-found` → toast「这条已开始讨论，无法取消」。
4. `stopGeneration` 房间：`dropped>0` → toast「已停止，排队的 N 条未发送」。
5. 单测（`conversation.spec.tsx` / `transcript.spec.tsx`）：queued 响应渲染排队行、取消调用 RPC、queue-full 保留草稿。

**验证**：`pnpm exec vitest run packages/workbench-ui/tests/conversation.spec.tsx packages/workbench-ui/tests/transcript.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/commands.log`

**注意事项**：排队行不是消息气泡，不进 `messages` 过滤；只在 `groupMode` 渲染。

### Task 12: 继续讨论按钮与分隔线接线

- **关联**：BR-003 / UF-003 / EVD-005
- **前置任务**：10
- **风险等级**：P2

**为什么做**：UF-003 入口在房间头部，分隔线在 transcript。

**涉及文件与定位**：

- `packages/workbench-ui/src/Conversation.tsx`：`className="headActions"` L634
- `packages/workbench-ui/src/Transcript.tsx`：`export function Transcript` L63

**具体操作**：

1. `isGroup && sessionId !== null` 时在 `headActions` 加按钮「让他们继续聊」（`data-testid="group-continue"`）；disabled 条件：`working \|\| queued.length>0 \|\| 无 author 的 assistant 行`；title 按 2.3 分支文案。
2. 点击：loading → `continueDiscussion` → 成功 `poll.refresh()`；失败 toast 错误文案。
3. Transcript 渲染 `kind:'system'` 为居中灰色分隔线（`role="separator"`，`data-testid="system-divider"`）。
4. 单测：disabled 三态；点击调用 RPC；system item 渲染分隔线。

**验证**：`pnpm exec vitest run packages/workbench-ui/tests/conversation.spec.tsx packages/workbench-ui/tests/transcript.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/commands.log`

**注意事项**：1:1 不渲染按钮（INV-001）。

### Task 13: 删房间菜单与确认框接线

- **关联**：BR-004 / UF-004 / INV-003 / EVD-006
- **前置任务**：10
- **风险等级**：P1

**为什么做**：UF-004 入口在房间切换器行菜单，删除必须二次确认。

**涉及文件与定位**：

- `packages/workbench-ui/src/SessionList.tsx`：`export interface SessionListProps` L26-38、`<SessionRename` L165-171
- `packages/workbench-ui/src/Roster.tsx`：`function ConfirmDelete` L556-576（样式参考）
- `packages/workbench-ui/src/Conversation.tsx`：`SessionList` 调用处 L767-791

**具体操作**：

1. `SessionListProps` 加 `onDeleteRoom?: (id) => void`；`groupMode` 行菜单加「删除房间」（`data-testid="session-delete-{id}"`）。
2. Conversation 持有确认框状态：`confirmMask`/`confirmBox` 结构、`role="dialog"`、Esc 与取消关闭并还原焦点；删除中按钮 loading；`room is busy` 在框内显示「房间正在讨论，先停止再删除」。
3. 成功：toast「已删除房间」→ `loadSessions()`；若删的是当前房间，选中剩余最新房间或进入空态。
4. 单测：1:1 菜单无删除项；取消不调用 RPC；成功后列表刷新；busy 错误留在框内。

**验证**：`pnpm exec vitest run packages/workbench-ui/tests/session-list.spec.tsx packages/workbench-ui/tests/conversation.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/commands.log`

**注意事项**：Escape 走既有 `useEscapeLayer` 分层（`c012211`），不新增全局监听。

### Task 14: 执行 Phase 3 回归验证

- **关联**：本 Phase 全部 + UF-005 + INV-001
- **前置任务**：11;12;13

**验证**：`pnpm test` 与 `pnpm run typecheck` 失败集合不超过 Task 1 基线；`pnpm run build` 通过；重启网关后浏览器点一遍 UF-001~004 主路径冒烟

**Evidence**：`evidence/phase-3/`

### Phase 4: 文档与真实场景验收

> 你在哪里：功能已接线，命令级验证通过。
> 做完之后：README 与 manual-test 同步；5.2 矩阵逐行真实回放通过并存证。

### Task 15: 同步 README 与 manual-test

- **关联**：BR-002 / BR-005 / INV-005 / EVD-007（UF 写 NA：文档与脚本）
- **前置任务**：14
- **风险等级**：P2

**为什么做**：README 还写「一轮语义」；排队重启即丢需要写明（BR-002）。

**涉及文件与定位**：

- `README.md`：「一轮语义」段，`rg -n "一轮语义" README.md`，L85
- `scripts/manual-test.sh`：小组段，`rg -n "createGroupSession" scripts/manual-test.sh`，L492-507

**具体操作**：

1. README 小组段改为：默认 3 轮讨论；引用即点名优先级；讨论中排队 ≤3 可取消、停止清空、网关重启丢失；「让他们继续聊」；删房间只删房间记录、成员私聊保留。
2. manual-test 小组段在 `deleteGroup` 前加 `createGroupSession` → `deleteGroupSession` → 再 `listGroupSessions` 不含该房间。

**验证**：`bash scripts/manual-test.sh --no-write` → 小组段全部 PASS；`rg -n "一轮语义" README.md` → 无命中

**Evidence**：`evidence/phase-4/manual-test.log`

### Task 16: 执行 spec 5.2 真实场景全套测试

- **关联**：全部用户可见 UF（UF-001~005）
- **前置任务**：15
- **风险等级**：P0

**验证**：按 5.2 执行矩阵逐行回放，全部通过；复跑 `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-rounds-v2` 证据审计 0 FAIL

**Evidence**：`evidence/UF-001/` ~ `evidence/UF-005/`

**注意事项**：从工作台真实入口点击，禁止直接调 RPC 代替；测试结束按 roomId 清理本次建的房间与小组，不按标题模糊删。

### Task 17: 执行 Phase 4 回归验证

- **关联**：全部 BR/UF/INV
- **前置任务**：16

**验证**：`pnpm run build && pnpm test && pnpm run typecheck && pnpm run standard:check` → 失败集合不超过 Task 1 基线；`rg -i 'anysphere|sand://' packages/` 为空；`git status --porcelain` 不含 `env/dsh-bot/`

**Evidence**：`evidence/phase-final/final-commands.log`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 必须通过 5.2 真实场景全套测试才算完成。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| host 定向单测 | `pnpm exec vitest run packages/dsh-bot-host` | 通过 | EVD-002 |
| 前端定向单测 | `pnpm exec vitest run packages/workbench-ui` | 通过 | EVD-002 |
| 全量单测 | `pnpm test` | 失败集合 ⊆ Task 1 基线（`tool-dsh-bot/tests/tools.spec.ts`） | EVD-007 |
| 类型检查 | `pnpm run typecheck` | 错误集合 ⊆ Task 1 基线（均在 `packages/tool-dsh-bot/`） | EVD-007 |
| 构建 | `pnpm run build` | 通过 | EVD-007 |
| 社区标准 | `pnpm run standard:check` | 通过 | EVD-007 |
| CLI 冒烟 | `bash scripts/manual-test.sh --no-write` | 小组段全 PASS | EVD-007 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm run build && sh env/boot.sh`（hub 常驻；先 `env/gateway-id.sh` 核 `DSH_HOME` 为本仓 `env/`） |
| 访问入口 | `http://127.0.0.1:3084/dsh-bot/ui`（浏览器直开工作台）；官方壳内嵌工作台作抽验 |
| 测试账号/数据 | 本机单用户；建临时小组 `v2-test-<时间戳>`（成员：DSH Bot + 一个临时人设），ASM-002 |
| 干净状态定义 | 只清理本次建的小组 / 房间 / 临时人设（按 id）；不动 `env/dsh-bot/` 其他数据 |
| 可用测试工具 | 浏览器自动化（Playwright / Chrome DevTools，ASM-001）；不可用时按 2.3 脚本写手动步骤请用户回填 |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-001 主路径 | browser | 2.3 UF-001 成功主路径 | 「本次回应」= 被引成员；只有被引成员发言；刷新后引用条在 | `evidence/UF-001/success.png` + `evidence/UF-001/console.log` |
| UF-001 显式 @ 覆盖 | browser | 2.3 UF-001 分支「显式 @ 覆盖」 | 只有 @ 的成员发言 | `evidence/UF-001/mention-override.png` |
| UF-001 引用自己 | browser | 2.3 UF-001 分支「引用自己的消息」 | 全员回应 | `evidence/UF-001/quote-self.png` |
| UF-002 主路径 | browser | 2.3 UF-002 成功主路径 | 排队行出现 / 取消消失 / 本场后自动开新场；network 无失败 | `evidence/UF-002/queued.png` + `evidence/UF-002/network.log` |
| UF-002 队列已满 | browser | 2.3 UF-002 分支「队列已满」 | 错误文案，草稿保留 | `evidence/UF-002/queue-full.png` |
| UF-002 停止清空 | browser | 2.3 UF-002 分支「停止讨论」 | 排队行全消失 + toast 条数；房间文件无被丢弃文本 | `evidence/UF-002/stop.png` |
| UF-003 主路径 | browser | 2.3 UF-003 成功主路径 | 分隔线出现；无新用户气泡；成员接着发言 | `evidence/UF-003/success.png` |
| UF-003 禁用态 | browser | 2.3 UF-003 分支「讨论进行中」「房间还没有成员发言」 | 按钮 disabled + title | `evidence/UF-003/disabled.png` |
| UF-004 主路径 | browser | 2.3 UF-004 成功主路径 | 列表少一行，自动选中剩余房间；`rooms/` 目录前后对比只少目标文件 | `evidence/UF-004/success.png` + `evidence/UF-004/rooms-diff.txt` |
| UF-004 取消 | browser | 2.3 UF-004 分支「取消」 | 无请求；焦点回菜单 | `evidence/UF-004/cancel.png` |
| UF-004 房间忙 | browser | 2.3 UF-004 分支「房间忙」 | 框内错误，房间仍在 | `evidence/UF-004/busy.png` |
| UF-005 回归 | browser | 2.3 UF-005 主路径 + 分支 | 多轮 / @ / 重试 / 重试中 busy 与旧版一致；1:1 无新控件 | `evidence/UF-005/regression.png` + `evidence/UF-005/one-on-one.png` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。任何一行失败 = 未完成，回到对应任务修复后重跑。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-0/ phase-1/ phase-2/ phase-3/ phase-4/ phase-final/
  UF-001/ UF-002/ UF-003/ UF-004/ UF-005/
```

- EVD ID 必须能在第 2.5 节找到。

### 5.4 Review 专项检查清单

- [ ] 服务端与 composer 用同一个 `resolveResponders`，无第二份规则
- [ ] 排队项出队前从不写房间文件；停止 / 取消的项从不落盘（INV-002）
- [ ] `deleteGroupSession` 只接受索引内 roomId，无路径穿越；成员隐藏会话未被触碰（INV-003）
- [ ] system 行不以「用户:」进入成员提示词
- [ ] 1:1 面无任何新控件与新 RPC 可达（INV-001）
- [ ] 5.2 执行矩阵全部通过，evidence 齐全且与第 2.5 节 EVD 清单一致
- [ ] 2.3 节每条流程的「入口接线清单」已实现——从真实入口可达
- [ ] 界面交互与 2.3 节脚本逐步一致（loading、禁用态、错误提示、成功反馈都存在）
- [ ] 所有 BR/UF/INV 状态可对照第 2 章逐条核销
