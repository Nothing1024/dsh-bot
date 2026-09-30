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
