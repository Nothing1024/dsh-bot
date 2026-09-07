# dsh-bot-live-transcript Spec

> Version: 0.1.0 | Date: 2026-09-06 | Status: Done 已验收（状态板 100%，5.2 证据齐全；2026-09-08 梳理时改标）
>
> 本文件是本需求的**唯一事实源**：事实基线、业务合同、技术方案、任务计划、验收协议全部在此。
> 其他文件（tasks.csv）只引用本文件，不复制内容。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：在 DSH Bot 工作台里和人设聊天的本机用户。今天回复是整段跳出来的、工作中输入框锁死、思考和工具调用被丢掉、审批卡把对话卡死。
- **做什么**：给工作台接上平台事件流（同一 :3084、同一 `/dsh-bot` 前缀的 SSE），投递改成可排队/可打断，工作中仍能输入；思考/工具变成可折叠卡，审批和提问变成可点的卡；有增量就逐字刷最后一条气泡。
- **改哪里**：`dsh-bot-host`（SSE 桥、投递改走平台 `sessions.prompt`、审批/提问代答）、`workbench-ui`（Composer 永不禁用、Transcript 卡片、三个轮询在 SSE 连通时停掉）、官方页签客户端（徽标轮询同样停）。
- **怎么算做完**：真机 :3084 工作台里：工作中仍能打字排队或打断；思考/工具卡可见；审批卡能点允许/拒绝并继续；拔网线后 2 秒轮询回落、重连后再停轮询；若帧里有增量则最后一个气泡逐字长，没有就仍按消息刷新。
- **不做什么**：不开新端口、不改官方 npm 包、不改小组轮次语义、不改 `dsh_bot_ask`；同事互发和名册分组是后续包，只预留同一条 SSE。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 协调者定稿：修掉工作台「1 秒整段跳变 / 工作中输入框锁死 / 工具与思考被丢弃 / 审批卡死」四个结构性问题；SSE 桥 `events.mux` + `events.host`；投递改 `sessions.prompt`；三个轮询在 SSE 连通时停 |
| 输入类型 | description（协调者契约 + 已交付记忆/例程/母包 + 原型 `../prototypes/dsh-bot-grok-parity.html`） |
| Mode | oneclick |
| 置信度 | 高（apiProxy 类型、三条轮询、Composer 锁、Transcript `return null` 均已勘察） |
| 输出目录 | `docs/dsh-bot-live-transcript/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | backend（SSE 桥 + 投递/取消/队列 + 审批代答）+ frontend（Composer / Transcript / 停轮询） |
| 主要风险 | ① 现网 `handleDshBotHttp` 对非 POST 一律 405，SSE GET 必须先开豁口；② `ApiProxyDuck` 尚无 `events`/`prompt`/`respond`；③ `assistant/chunk` 类型在，mux 是否对 bot 会话实发需校准；④ 审批回答不是一元 RPC，是 `apiProxy.respond` 回声 rpcId |
| 行号引用策略 | 仅 hint；以 symbol + rg anchor 为准 |
| 必需验收方式 | 真实浏览器对 `http://127.0.0.1:3084/dsh-bot/ui` 回放 + curl SSE + 既有 vitest |
| 必须覆盖用户场景 | 工作中可排队/打断、思考工具卡、审批提问卡、SSE 停轮询与断线回落、增量或消息级刷新 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 平台 `EventsApi` 两路流：`mux`（`session/event`、`session/queue`、`approval/requested\|resolved`、`question/requested\|resolved`、`session/projection`）与 `host`（`host/session-status` 等） | `rg -n "export interface EventsApi\|type: 'session/event'\|type: 'host/session-status'" env/profiles/gb/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/events.d.ts` | L43-60 / L67 / L175 |
| `SessionEventMap` 含 `'assistant/chunk'`（注释：Raw stream chunk）与 `'assistant/message'` | `rg -n "assistant/chunk\|assistant/message" env/profiles/gb/node_modules/@deepseek-ai/dsh-session/lib/types/types.d.ts` | L264 / L279 |
| `sessions.prompt({sessionId, mode:'queue'\|'steer', content})`；另有 `updateQueue`、`cancel` | `rg -n "mode: 'queue' \| 'steer'\|updateQueue\|cancel\(request" env/profiles/gb/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/sessions.d.ts` | L369-371 / L393 / L405 |
| 审批/提问不是一元 method：回答走 `apiProxy.respond(ClientResponse)`，payload 见 `ApprovalResponsePayload` / `QuestionResponsePayload` | `rg -n "respond(message: ClientResponse)" env/profiles/gb/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/index.d.ts`；`rg -n "export interface ApprovalResponsePayload\|export interface QuestionResponsePayload" env/profiles/gb/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/approvals.d.ts env/profiles/gb/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/questions.d.ts` | index L39；approvals L17；questions L16 |
| `ApiProxyDuck` 只有 `sessions.create/rename/list/selectModel` 与 `workspace.archiveSession`，无 events/prompt/cancel/respond | `rg -n "interface ApiProxyDuck" packages/dsh-bot-host/src/platform.ts` | L66 |
| 工作台投递现为 `promptOwnedSession` → `sessionTool.write`，带 `withPromptLock` | `rg -n "export async function promptOwnedSession\|withPromptLock" packages/dsh-bot-host/src/workbench-sessions.ts` | L527 / L48 / L535 |
| `projectWorkbenchHistory` 已投影 `kind:'thinking'\|'tool'`；前端 `Transcript.tsx` 对这两类 `return null` | `rg -n "export function projectWorkbenchHistory\|kind: 'thinking'" packages/dsh-bot-host/src/workbench-sessions.ts`；`rg -n "item.kind === 'thinking'" packages/workbench-ui/src/Transcript.tsx` | L209 / L105；Transcript L260-261 |
| HTTP 挂 `webServer.register({kind:'prefix', path:'/dsh-bot'})`；`handleDshBotHttp` 非 POST → 405 | `rg -n "kind: 'prefix'\|req.method !== 'POST'" packages/dsh-bot-host/src/routes.ts` | L124 / L144 |
| Composer 工作中锁死：`composerLocked = poll.working \|\| awaitingTurn \|\| sending`，传 `disabled={composerLocked}` | `rg -n "composerLocked" packages/workbench-ui/src/Conversation.tsx` | L441 / L740 |
| 三个轮询：`useSessionPoll` idle 2s / working 1s；`App.tsx` 每 2s 扇出 `listBotSessions`；`rpc.ts` `POLL_MS = 2000` 刷页签列表 | `rg -n "const IDLE_MS = 2000\|export function useSessionPoll" packages/workbench-ui/src/useSessionPoll.ts`；`rg -n "listBotSessions" packages/workbench-ui/src/App.tsx`；`rg -n "const POLL_MS = 2000" packages/ui-dsh-bot/src/client/rpc.ts` | L7/L52；App L208/L286；rpc L59 |
| 另有 `App.tsx` 每 2s `listBots`（未读通知）与 30s `RECONCILE_MS`，不在本包「三个轮询」点名内 | `rg -n "RECONCILE_MS\|setInterval" packages/workbench-ui/src/App.tsx` | L58 / L146 / L191 / L286 |
| 所有权标记 `botMark` = `bot:<id>`；房间 `group-room:<id>` | `rg -n "export function botMark\|GROUP_ROOM_MARK_PREFIX" packages/dsh-bot-host/src/marks.ts` | L26 / L37 |
| `dsh_bot_ask` 在 `tool-dsh-bot` 注册，参数 `prompt` + 可选 `title` | `rg -n "name: 'dsh_bot_ask'" packages/tool-dsh-bot/src/index.ts` | L41 |
| 小组轮次入口 `runGroupRound` | `rg -n "export async function runGroupRound" packages/dsh-bot-host/src/group-engine.ts` | L306 |
| 仓库脚本 `typecheck` / `build` / `test` / `standard:check`；host 与 UI 均有 vitest | `rg -n '"typecheck"' package.json`；`ls packages/dsh-bot-host/tests packages/workbench-ui/tests` | package.json L9 |
| Playwright 渠道仍在邻仓 engine | `ls ../../dsh-genoffice/engine/node_modules/playwright/package.json` | 存在 |
| 本会话 `lsof -nP -iTCP:3084 -sTCP:LISTEN` 为空；执行时先 `sh env/boot.sh` | `lsof -nP -iTCP:3084 -sTCP:LISTEN` | 无监听 |
| 运行数据根已 gitignore | `rg -n "env/dsh-bot/" .gitignore` | L14 |
| 原型中栏 `data-impl` 写明 `events.mux → /dsh-bot/events`、composer `sessions.prompt{queue\|steer}` | `rg -n "dsh-bot/events\|sessions.prompt" docs/prototypes/dsh-bot-grok-parity.html` | L242 / L245 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-011 | 对 bot 所有权会话，`events.mux` 会实发 `assistant/chunk`（不只是类型里有）。有则逐 token 刷最后一条气泡；无则保持消息级刷新 | 无 chunk 却按 token 设计会空转 | Task 1：真机抓一条 mux 帧，看有没有 `assistant/chunk` |
| ASM-012 | host 进程内 `ctx.get('apiProxy')` 的 `events.mux` / `events.host` / `sessions.prompt` / `sessions.cancel` / `sessions.updateQueue` / `respond` 可 duck 调用（与现有 `sessions.create` 同一对象） | duck 缺失则 SSE 与新投递都落空，只能 `sessionTool.write` 回退 | Task 1：在 host 日志里对 apiProxy 做一次存在性探测 |
| ASM-013 | `sessions.prompt({mode:'queue'\|'steer'})` 对 marks 含 `bot:<id>` 的工作台会话有效，不会被当成 subagent 拒成 `agent-busy` | 拒单则排队/打断不可用 | Task 1：对打开的 bot 会话各打一条 queue 与一条 steer |
| ASM-014 | 同一 `webServer` prefix `/dsh-bot` 上把 `GET /dsh-bot/events` 从现有 405 豁出，浏览器 `EventSource` 能连上且不新开端口 | 网关对 GET 另有拦路 | Task 1：boot 后 `curl -N` 该 URL，看 `text/event-stream` |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-09-06 | ASM-011 | 真机 `session.history` 阿宁会话 718 条 `assistant/chunk` | BR-015 锁定增量刷末泡；Task 12 走 text-delta |
| 2026-09-06 | ASM-012 | 官方 `session.prompt`/`cancel` 已通；mux 为 in-process 流 | 缺 duck 则 SSE 503、投递 write 回退 |
| 2026-09-06 | ASM-013 | bot 会话 queue/steer/cancel 均 `accepted:true`，无 agent-busy | Task 5 首选 sessions.prompt |
| 2026-09-06 | ASM-014 | 改代码前 GET `/dsh-bot/events` = 405 | Task 2 开豁口 |

---

## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。ID 用 01x 段（记忆 8xx、例程 9xx、living-master 1xx）。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-011 | host 在同一 `webServer` prefix 新增 `GET /dsh-bot/events`（SSE，不开新端口）。桥接 `apiProxy.events.mux` 与 `events.host`：转发 `session/event`、`session/queue`、`approval/requested`、`approval/resolved`、`question/requested`、`question/resolved`、`session/projection`、`host/session-status`。只转发 marks 含 `bot:<id>` 或 `group-room:` 的会话。另发插件帧 `bot/status`（botId、working、unread），供同事/名册消费，避免新开定时器 | 打开工作台后 EventSource 收到 `host/session-status` 与过滤后的 mux 帧 | 开 :3085；转发无 bot 标记的官方闲聊 | dsh-bot-host | curl SSE + vitest |
| BR-012 | 工作台投递改走 `apiProxy.sessions.prompt({sessionId, mode, content})`：空闲或用户选「排队」用 `queue`；用户选「打断」用 `steer`。新增 `cancel({sessionId})` 与 `updateQueue`。`promptOwnedSession` 在 apiProxy 这三项不可用时回退 `sessionTool.write`（现网路径） | 工作中再发一条 → 入队；点停止 → cancel | 工作中再发送仍 405/锁死；回退路径被删 | host + ui | vitest + 真机 |
| BR-013 | Composer 永不 `disabled`。工作中输入框可打字；发送键在工作中变为「停止」（调用 cancel）；停止后若草稿非空可再发。`sending` 只表示本条正在出门，不锁框 | 工作中能打第二个问题并排队 | `disabled={composerLocked}` 仍在 | workbench-ui | 真机 |
| BR-014 | Transcript 渲染 `kind:'thinking'\|'tool'` 为默认可折叠卡（思考收起、工具显示 name/summary）；渲染 `approval/requested` 与 `question/requested` 为可操作卡，经新 RPC `approvalRespond` / `questionRespond`（host 调 `apiProxy.respond` 回声帧上的 rpcId）回答。resolved 后卡变为只读结果 | 思考卡可展开；审批点「允许一次」后会话继续 | thinking 仍 `return null`；审批只能去官方中栏 | ui + host | 真机 |
| BR-015 | 流式：若 `session/event` 的 `event.type === 'assistant/chunk'` 且含文本增量，则更新该会话最后一条 assistant 气泡（未完成带光标）；`assistant/message` 到来后定稿。无 chunk 则仍按 `history` 消息级刷新，不得假装打字 | 有 chunk 时气泡逐字长 | 无 chunk 却用假打字动画 | ui | 真机（以 Task 1 校准为准） |
| BR-016 | SSE `ready` 时停掉三个轮询：`useSessionPoll` 的 timeout 链、`App.tsx` `listBotSessions` 扇出 2s、`rpc.ts` `POLL_MS` 页签列表。断线后三个都回落 2s 轮询并自动重连 SSE（指数退避上限 10s）。`RECONCILE_MS` 30s 补扫保留 | SSE 连通时 Network 无每 2s history；断线后 history 恢复 2s | SSE 通着仍 2s 扇出 | ui + 页签 | 真机 Network |
| BR-017 | 红线：不改官方 npm 包与三邻仓（邻仓既有脏视为基线，见 `../dsh-bot-living-master/spec.md` §1.5）；一口一仓 :3084；运行数据不入 git；`rg -i 'anysphere\|sand://' packages/` 为空；唤醒词/文案自写 | — | 拷参考树文案；新开端口 | 全部 | 收尾命令 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-011 | 工作台打开「校对阿宁」会话，bot 正在回复（工作中） | 输入框打第二句并回车；再点「停止」 | 输入框从未灰掉；第二句入队或作为打断发出；停止后生成停、草稿仍在 | 本机用户 | browser | EVD-011 |
| UF-012 | 一轮含思考或工具调用 | 看 Transcript | 出现可折叠思考卡与工具卡，不再是空白 | 本机用户 | browser | EVD-012 |
| UF-013 | bot 打出一条审批或提问 | 在工作台卡上点允许/拒绝或提交答案 | 卡变为已处理；会话继续；不必去官方中栏 | 本机用户 | browser | EVD-013 |
| UF-014 | 工作台已连上 SSE | 看 Network：三条轮询停；再停网关 5s 后恢复 | 断线期间回落 2s history/listBotSessions/页签 poll；重连后再次停止 | 本机用户 | browser Network | EVD-014 |
| UF-015 | Task 1 已记录「有/无 chunk」 | 发一条会长回复的话 | 有 chunk：最后气泡逐字长；无 chunk：整段到达（允许），不得假打字 | 本机用户 | browser | EVD-015 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-011: 工作中仍能输入（排队 / 打断 / 停止）

**前置状态**：`sh env/boot.sh` 已起；浏览器打开 `http://127.0.0.1:3084/dsh-bot/ui`；「校对阿宁」存在；发一条会跑几秒的问题让它进入工作中。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 看输入框 | 输入框可点、可打字；发送键文案为「停止」 | `composerLocked` 不再绑 `disabled`；`working` 只切按钮模式 | 框不灰 |
| 2 | 打第二句，回车（默认 queue） | 第二句立刻出现在队列/气泡；框不清锁 | `sessions.prompt({mode:'queue'})`；失败则 `sessionTool.write` 回退 | 两条用户消息都在 |
| 3 | 点「停止」 | 按钮回「发送」；生成停 | `sessions.cancel` | 不再继续长回复；草稿若未发仍在框里 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| apiProxy 无 prompt | duck 缺失 | toast「已用旧通道发送」 | `promptOwnedSession` 回退 write | 仍能说话，只是不能入队 |
| cancel 失败 | 平台拒 cancel | toast「停止失败」；键仍为「停止」 | 不假装已停 | 再点或等轮次自然结束 |
| 空内容点停止 | 框空且工作中 | 只 cancel，不发空消息 | `cancel` only | — |

**界面状态机**：

```text
idle(发送) → (prompt) sending → working(停止, 框可输入)
working → (queue/steer) queued-or-steered → working
working → (cancel ok) idle
working → (cancel fail) working + toast
```

**入口接线清单**：

- `Conversation.tsx` 去掉 `disabled={composerLocked}`，改为把 `working` 传给 Composer 切按钮
- `Composer.tsx` 工作中主按钮走 `onStop` → `api.cancel`
- `api.ts` 新增 `promptQueued` / `promptSteer` / `cancel` / `updateQueue`；host `dispatchWorkbenchApi` 旁加 case；`promptOwnedSession` 改首选 apiProxy

#### UF-012: 思考与工具卡

**前置状态**：当前模型一轮会出 thinking 或 tool-call（可用会调工具的问题，如「现在几点」若工具可用；否则用已投影的历史会话）。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 发一条会出思考/工具的话 | 先出折叠「思考」卡，再出工具卡 | `projectWorkbenchHistory` 已有 kind；Transcript 不再 `return null` | 卡可点开看全文/name |
| 2 | 点折叠 | 展开/收起，无整页刷新 | 纯前端 | 正文仍在下方 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 本轮无 thinking/tool | 模型直接答 | 只有气泡，无空卡 | 不渲染空 kind | 正常 |
| 旧历史已投影 | 打开旧会话 | 卡仍在（history RPC 已带 kind） | 不依赖 SSE | — |

**界面状态机**：`hidden(null) → collapsed → expanded`

**入口接线清单**：`Transcript.tsx` 对 `kind==='thinking'\|'tool'` 走折叠卡组件，不再 `return null`。

#### UF-013: 审批 / 提问卡

**前置状态**：能触发平台审批的工具调用，或 host 用测试夹具推一帧 `approval/requested`（Task 1 记下触发法）。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 等卡出现 | Transcript 底部出现审批卡（工具名 + 允许一次 / 拒绝）或提问卡 | SSE 转发 `approval/requested` / `question/requested` | 不必去官方中栏 |
| 2 | 点「允许一次」或提交答案 | 卡进入 submitting | RPC → `apiProxy.respond` 回声 rpcId | 卡变 resolved；会话继续 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 已在官方栏答过 | 再点工作台卡 | 卡显示「已处理」 | respond 得到 not-pending | 只读 |
| respond 失败 | duck 缺失或网络错 | toast「提交失败」，卡可再点 | 不改会话 | 重试或去官方中栏（逃生口） |
| 无待办 | 刷新后已 resolved | 只读结果行 | 用 `approval/resolved` 帧对齐 | — |

**界面状态机**：`absent → pending → submitting → resolved | failed`

**入口接线清单**：Transcript 认 SSE/history 里的 approval/question 条目；`api.approvalRespond` / `api.questionRespond` → host case → `apiProxy.respond`。

#### UF-014: SSE 停轮询与断线回落

**前置状态**：工作台打开且 SSE `ready`。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | DevTools Network 滤 Fetch/XHR | 无每 2s 的 `history` / `listBotSessions` / 页签 `listSessions` | 三个定时器 clear | SSE 一条长连接 |
| 2 | `sh env/boot.sh` 重启网关（或 kill 再起） | 徽标/历史在 ≤4s 内改走 2s 轮询 | EventSource onerror → 回落 + 重连 | 不空白死等 |
| 3 | 网关恢复 | SSE 再 ready，三个轮询再停 | 自动重连 | Network 恢复为一条 SSE |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 首连失败 | boot 后 events 405/404 | 保持 2s 轮询，不锁 UI | 回退路径即主路径 | 修 GET 豁口 |
| 重连风暴 | 网关持续挂 | 退避至 10s，轮询保持 2s | 不上报崩溃 | 网关起来即收敛 |

**界面状态机**：`polling → sse-live → polling (retrying) → sse-live`

**入口接线清单**：共享 `useBotEvents()`（EventSource `/dsh-bot/events`）供 Conversation / App / 页签 rpc；三处 timer 认 `sseReady`。

#### UF-015: 增量或消息级刷新

**前置状态**：Task 1 校准记录已写明本机 mux 有或无 `assistant/chunk`。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 发一条会长回复 | 有 chunk：最后气泡带光标逐字长；无 chunk：等消息完整出现 | 按校准分支走 BR-015 | 与校准结论一致，无假打字 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| chunk 乱序 | seq 回退 | 忽略旧 seq | 按 seq 丢弃 | — |
| 切会话 | 流到一半点另一个 bot | 旧流不再写当前气泡 | 按 sessionId 过滤 | 回来看定稿 |

**界面状态机**：`idle → streaming(cursor) → finalized` 或 `idle → message-refresh`

**入口接线清单**：`useBotEvents` 把 chunk 交给当前 `Transcript` 最后一条 assistant；`useSessionPoll` 在 sse-live 时不 `pull`。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-011 | `runGroupRound` 小组轮次语义不变（默认一轮、提及、skip） | BR-017 | `pnpm test` `group-engine` |
| INV-012 | `dsh_bot_ask` 名称、参数、隐藏委托会话、返回 `{session_id, answer}` 不变 | BR-017 | `pnpm test` ask + 工具注册 |
| INV-013 | 直开工作台与官方页签看到的同一 bot 会话 working / 标题 / 未读一致（页签仍走 `listSessions`，只是 SSE 活着时不 2s 刷） | BR-016 | 真机对照 |
| INV-014 | 一口一仓 :3084；邻仓 porcelain 与开工基线一致（清单见 `../dsh-bot-living-master/spec.md` §1.5）；`rg -i 'anysphere\|sand://' packages/` 为空；`env/dsh-bot/` 不入 git | BR-017 | 收尾命令 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-010 | log | Task 1 校准 ASM-011~014 | `evidence/phase-0/calibration.md` |
| EVD-011 | screenshot | 工作中输入框未灰；停止键；第二条入队 | `evidence/UF-011/` |
| EVD-012 | screenshot | 思考卡 + 工具卡 | `evidence/UF-012/` |
| EVD-013 | screenshot | 审批/提问卡操作前后 | `evidence/UF-013/` |
| EVD-014 | screenshot+har | Network：SSE 活着无 2s poll；断线回落 | `evidence/UF-014/` |
| EVD-015 | screenshot | 有 chunk 的光标泡或无 chunk 的消息级刷新（以校准为准） | `evidence/UF-015/` |
| EVD-016 | api | curl SSE 首帧 + prompt/cancel 各一例 | `evidence/API-016/` |
| EVD-017 | log | 各 Phase 命令输出 | `evidence/phase-0/` |

### 2.6 角色与权限矩阵

单一本机用户，loopback，无权限差异。SSE 不对外网暴露。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 空数据 | 新会话无历史 | 打开 | 空 Transcript + 可输入 Composer | EVD-011 |
| 依赖失败 | apiProxy.events 不可用 | 打开工作台 | 保持 2s 轮询，功能不锁死 | EVD-014 |
| 重复提交 | 同一审批点两次 | 第二次 | 只读「已处理」，不 500 | EVD-013 |
| 旧数据兼容 | 升级前已打开的工作台页 | 刷新 | EventSource 新握手；旧 history RPC 仍可用 | EVD-014 |
| 破坏性 | cancel 进行中的轮次 | — | 已写出的 assistant 前缀保留（平台 `interrupted`），不删会话 | EVD-011 |

### 2.8 非目标

- 不开新端口、不改官方 npm、不改 `dsh_bot_ask` / 小组轮次。
- 同事互发、名册置顶分组：后续包；本包 SSE 的 `bot/status` 供它们消费。
- 附件图片、slash command 执行面：平台 `sessions.prompt` 已能带 `PromptContentPart`，本包 UI 不新做拖拽上传。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
Composer disabled=working
promptOwnedSession → sessionTool.write
useSessionPoll 1-2s + App listBotSessions 2s + rpc listSessions 2s
Transcript: thinking/tool → null；无审批卡
回复：整段 history 刷新

After:
GET /dsh-bot/events (SSE, same prefix)
  └─ apiProxy.events.mux/host 过滤 bot:<id>|group-room:
  └─ bot/status {botId,working,unread}
prompt → sessions.prompt(queue|steer) ；cancel/updateQueue ；write 回退
Composer 永不 disabled；工作中按钮=停止
Transcript: thinking/tool 折叠卡；approval/question 可操作卡 → respond
三个轮询：sse-live 停 / 断线 2s 回落 / 自动重连
流式：有 assistant/chunk 则刷末泡，否则消息级
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/dsh-bot-host/src/routes.ts` | GET `/dsh-bot/events` 豁出 405 | 仅该 path 走 SSE handler |
| `packages/dsh-bot-host/src/platform.ts` | ApiProxyDuck 加 events/prompt/cancel/updateQueue/respond | 缺失时方法返回不可用，供回退 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `promptOwnedSession` 首选 prompt；保留 write 回退 | 不删 lock |
| `packages/dsh-bot-host/src/workbench-routes.ts` | cancel / updateQueue / approvalRespond / questionRespond | 旁加 case |
| `packages/dsh-bot-host/src/bot-events.ts`（新） | 订阅 mux+host、按 marks 过滤、写 SSE、发 bot/status | vitest 用假 mux |
| `packages/workbench-ui/src/useBotEvents.ts`（新） | EventSource + sseReady | App/Conversation 共用 |
| `packages/workbench-ui/src/Composer.tsx` | 停止键、永不 disabled | — |
| `packages/workbench-ui/src/Transcript.tsx` | 思考/工具/审批/提问卡 | 不再 return null |
| `packages/workbench-ui/src/useSessionPoll.ts` / `App.tsx` | sseReady 时停 timer | — |
| `packages/ui-dsh-bot/src/client/rpc.ts` | sseReady 时停 POLL_MS | 页签与工作台同一 URL |

### 3.3 三段式定位清单

> 全部 anchor 已于 2026-09-06 用 `rg -c` 核验命中。含 `@` 的平台 `.d.ts` 只写在 §1.3，不进本表（校验器 path 不含 `@`）。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-host/src/routes.ts` | `export function attachDshBotHttp` | `rg "export function attachDshBotHttp" packages/dsh-bot-host/src/routes.ts` | L114 | 挂 prefix |
| `packages/dsh-bot-host/src/routes.ts` | `kind: 'prefix'` | `rg "kind: 'prefix'" packages/dsh-bot-host/src/routes.ts` | L124 | 同端口 |
| `packages/dsh-bot-host/src/routes.ts` | `req.method !== 'POST'` | `rg "req.method !== 'POST'" packages/dsh-bot-host/src/routes.ts` | L144 | GET 豁口 |
| `packages/dsh-bot-host/src/platform.ts` | `interface ApiProxyDuck` | `rg "interface ApiProxyDuck" packages/dsh-bot-host/src/platform.ts` | L66 | 加 duck |
| `packages/dsh-bot-host/src/platform.ts` | `export function createPlatform` | `rg "export function createPlatform" packages/dsh-bot-host/src/platform.ts` | L129 | — |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function promptOwnedSession` | `rg "export async function promptOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L527 | 投递改道 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `withPromptLock` | `rg "withPromptLock" packages/dsh-bot-host/src/workbench-sessions.ts` | L48 | 保留 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function projectWorkbenchHistory` | `rg "export function projectWorkbenchHistory" packages/dsh-bot-host/src/workbench-sessions.ts` | L209 | 已投影 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `kind: 'thinking'` | `rg "kind: 'thinking'" packages/dsh-bot-host/src/workbench-sessions.ts` | L105 | — |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `export async function dispatchWorkbenchApi` | `rg "export async function dispatchWorkbenchApi" packages/dsh-bot-host/src/workbench-routes.ts` | L188 | 旁加 case |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `case 'prompt':` | `rg "case 'prompt':" packages/dsh-bot-host/src/workbench-routes.ts` | L211 | — |
| `packages/dsh-bot-host/src/index.ts` | `class DshBotService extends Service` | `rg "class DshBotService extends Service" packages/dsh-bot-host/src/index.ts` | L256 | unread 源 |
| `packages/dsh-bot-host/src/index.ts` | `private readonly unread` | `rg "private readonly unread" packages/dsh-bot-host/src/index.ts` | L288 | bot/status |
| `packages/dsh-bot-host/src/marks.ts` | `export function botMark` | `rg "export function botMark" packages/dsh-bot-host/src/marks.ts` | L26 | 过滤 |
| `packages/dsh-bot-host/src/marks.ts` | `GROUP_ROOM_MARK_PREFIX` | `rg "GROUP_ROOM_MARK_PREFIX" packages/dsh-bot-host/src/marks.ts` | L37 | 过滤 |
| `packages/dsh-bot-host/src/group-engine.ts` | `export async function runGroupRound` | `rg "export async function runGroupRound" packages/dsh-bot-host/src/group-engine.ts` | L306 | INV-011 |
| `packages/tool-dsh-bot/src/index.ts` | `name: 'dsh_bot_ask'` | `rg "name: 'dsh_bot_ask'" packages/tool-dsh-bot/src/index.ts` | L41 | INV-012 |
| `packages/workbench-ui/src/useSessionPoll.ts` | `export function useSessionPoll` | `rg "export function useSessionPoll" packages/workbench-ui/src/useSessionPoll.ts` | L52 | 停轮询 |
| `packages/workbench-ui/src/useSessionPoll.ts` | `const IDLE_MS = 2000` | `rg "const IDLE_MS = 2000" packages/workbench-ui/src/useSessionPoll.ts` | L7 | — |
| `packages/workbench-ui/src/App.tsx` | `listBotSessions` | `rg "listBotSessions" packages/workbench-ui/src/App.tsx` | L208 | 扇出 |
| `packages/workbench-ui/src/Conversation.tsx` | `composerWorking` | `rg "composerWorking" packages/workbench-ui/src/Conversation.tsx` | L463 | 工作中切停止，不锁框 |
| `packages/workbench-ui/src/Transcript.tsx` | `item.kind === 'thinking'` | `rg "item.kind === 'thinking'" packages/workbench-ui/src/Transcript.tsx` | L260 | 现 return null |
| `packages/workbench-ui/src/api.ts` | `export function prompt` | `rg "export function prompt" packages/workbench-ui/src/api.ts` | L203 | 旁加 |
| `packages/ui-dsh-bot/src/client/rpc.ts` | `export function createRpcDshBot` | `rg "export function createRpcDshBot" packages/ui-dsh-bot/src/client/rpc.ts` | L129 | 页签 |
| `packages/ui-dsh-bot/src/client/rpc.ts` | `const POLL_MS = 2000` | `rg "const POLL_MS = 2000" packages/ui-dsh-bot/src/client/rpc.ts` | L59 | 徽标 |
| `.gitignore` | `env/dsh-bot/` | `rg "env/dsh-bot/" .gitignore` | L14 | 数据不入 git |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 是 | GET `/dsh-bot/events`；RPC 增 cancel / updateQueue / approvalRespond / questionRespond；`prompt` 增 mode | 旧 `prompt({text})` 仍当 queue |
| 数据 | 否 | 不落新文件；队列是平台内存 | — |
| 权限 | 否 | loopback | — |
| 路由 | 是 | 同一 prefix，仅 GET events 豁出 | 其他 method 仍 POST |

---

## 4. Phase 计划与任务详情

```text
P0 校准(1) → P1 SSE(2,3,4) → P2 投递与 Composer(5,6,7) → P3 卡片(8,9,10) → P4 轮询与流式(11,12,13) → P5 收尾(14,15,16)
```

> 实现任务 8 条（2,3,5,6,8,9,11,12）≥ 8 → `tasks.csv`。

### Phase 0: 校准

### Task 1: 校准 ASM-011~014

- **关联**：ASM-011 / ASM-012 / ASM-013 / ASM-014 / EVD-010 / UF NA（内部校准）
- **前置任务**：无
- **风险等级**：P0

**为什么做**：chunk 有无、duck 是否在、prompt 是否吃 bot 会话、GET 能否出 SSE，决定后面怎么写，不得跳过。

**涉及文件与定位**：

- `packages/dsh-bot-host/src/routes.ts`：`req.method !== 'POST'`，`rg "req.method !== 'POST'" packages/dsh-bot-host/src/routes.ts`，L144
- `packages/dsh-bot-host/src/platform.ts`：`interface ApiProxyDuck`，`rg "interface ApiProxyDuck" packages/dsh-bot-host/src/platform.ts`，L66

**具体操作**：

1. `sh env/setup.sh && sh env/boot.sh`；`~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份。
2. ASM-012：在 host 临时日志打印 `ctx.get('apiProxy')` 上 `events` / `sessions.prompt` / `respond` 是否为函数；打完还原。
3. ASM-011：对一个 bot 会话发长回复，抓 mux（能连官方 GUI 或临时脚本），记录有无 `assistant/chunk`。
4. ASM-013：对同一 bot 会话调 `sessions.prompt` queue 与 steer 各一次，记录 accepted / 错码。
5. ASM-014：在改代码前 `curl -N -D - http://127.0.0.1:3084/dsh-bot/events` 记 405；本任务只记录基线，豁口在 Task 2。
6. 结论写入 `evidence/phase-0/calibration.md`；证伪按变更协议改第 2 章（无 chunk → BR-015 固定消息级）。

**验证**：`ls evidence/phase-0/calibration.md` → 存在；`git status --porcelain env/.agent-presets` → 干净

**Evidence**：`evidence/phase-0/`

**注意事项**：`豁免回归:单任务校准 Phase，验证已含 evidence`。

### Phase 1: SSE 通道

### Task 2: GET /dsh-bot/events 豁口与桥

- **关联**：BR-011 / ASM-014 / UF-014
- **前置任务**：1
- **风险等级**：P0

**涉及文件与定位**：

- `packages/dsh-bot-host/src/routes.ts`：`attachDshBotHttp` / `req.method !== 'POST'`，L114 / L144
- `packages/dsh-bot-host/src/platform.ts`：`ApiProxyDuck`，L66
- `packages/dsh-bot-host/src/bot-events.ts`（新建）

**具体操作**：

1. `handleDshBotHttp`：path `events` 且 GET → SSE（`text/event-stream`，禁缓冲），否则保持原 POST 纪律。
2. 订阅 `events.mux` + `events.host`，按 BR-011 白名单转发；写 `bot/status`。
3. vitest：假 mux 推一帧无 bot 标记 → 不写；有 `bot:` 标记 → 写。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/bot-events.spec.ts packages/dsh-bot-host/tests/routes.spec.ts` → 通过

**Evidence**：`evidence/phase-1/task2-tests.log`

### Task 3: marks 过滤与 bot/status

- **关联**：BR-011 / INV-013 / UF-014
- **前置任务**：2
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/marks.ts`：`botMark` / `GROUP_ROOM_MARK_PREFIX`，L26 / L37
- `packages/dsh-bot-host/src/index.ts`：`private readonly unread`，L288

**具体操作**：

1. 过滤实现：`bot:<id>` 或 `group-room:`；hidden 抽取/例程会话可转发但不进 1:1 列表（列表过滤保持原样）。
2. `bot/status` 在 unread 变或 `host/session-status` 变时推一次。
3. 单测覆盖过滤正反例。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/bot-events.spec.ts` → 通过

**Evidence**：`evidence/phase-1/task3-tests.log`

### Task 4: 执行 Phase 1 回归验证

- **关联**：BR-011 / INV-014
- **前置任务**：3

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/dsh-bot-host/tests` → 全过

**Evidence**：`evidence/phase-1/`

### Phase 2: 投递与 Composer

### Task 5: sessions.prompt / cancel / updateQueue

- **关联**：BR-012 / ASM-013 / UF-011
- **前置任务**：3
- **风险等级**：P0

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-sessions.ts`：`promptOwnedSession`，L527
- `packages/dsh-bot-host/src/workbench-routes.ts`：`case 'prompt':`，L211
- `packages/workbench-ui/src/api.ts`：`export function prompt`，L203

**具体操作**：

1. `promptOwnedSession`：apiProxy.sessions.prompt 可用则走 `mode`（缺省 queue）；否则 write 回退。
2. routes 增 `cancel` / `updateQueue`；`prompt` args 增 `mode`。
3. vitest：duck 在 / 缺两种。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/workbench-sessions.spec.ts packages/dsh-bot-host/tests/workbench-routes.spec.ts` → 通过

**Evidence**：`evidence/phase-2/task5-tests.log`

### Task 6: Composer 永不禁用，发送键变停止

- **关联**：BR-013 / UF-011
- **前置任务**：5
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Conversation.tsx`：`composerWorking`，L463
- `packages/workbench-ui/src/Composer.tsx`：现 `disabled={locked}`

**具体操作**：

1. 输入框不再因 working 而 disabled；主按钮 working →「停止」→ `onStop`。
2. 测试：working 时 textarea 可输入；空内容点停止不发空消息。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/composer.spec.tsx packages/workbench-ui/tests/conversation.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/task6-tests.log`

### Task 7: 执行 Phase 2 回归验证

- **关联**：BR-012 / BR-013 / INV-012
- **前置任务**：6

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/dsh-bot-host/tests packages/workbench-ui/tests` → 全过

**Evidence**：`evidence/phase-2/`

### Phase 3: Transcript 卡片

### Task 8: 思考与工具折叠卡

- **关联**：BR-014 / UF-012
- **前置任务**：6
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Transcript.tsx`：`item.kind === 'thinking'`，L260
- `packages/dsh-bot-host/src/workbench-sessions.ts`：`projectWorkbenchHistory`，L209

**具体操作**：

1. 去掉 `return null`；思考默认折叠，工具显示 name/summary。
2. transcript 单测加 thinking/tool 各一条。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/transcript.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/task8-tests.log`

### Task 9: 审批与提问可操作卡

- **关联**：BR-014 / UF-013
- **前置任务**：8
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-routes.ts`：`dispatchWorkbenchApi`，L188
- `packages/dsh-bot-host/src/platform.ts`：`createPlatform`，L129
- `packages/workbench-ui/src/Transcript.tsx`：`showAuthor` 旁动作栏

**具体操作**：

1. host RPC `approvalRespond` / `questionRespond` → `apiProxy.respond`。
2. Transcript 渲染 pending 卡；失败 toast。
3. 单测：respond 回声 rpcId；not-pending → 只读。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/workbench-routes.spec.ts packages/workbench-ui/tests/transcript.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/task9-tests.log`

### Task 10: 执行 Phase 3 回归验证

- **关联**：BR-014 / INV-011
- **前置任务**：9

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/workbench-ui/tests/transcript.spec.tsx packages/dsh-bot-host/tests/group-engine.spec.ts` → 通过

**Evidence**：`evidence/phase-3/`

### Phase 4: 停轮询与流式

### Task 11: 三个轮询在 SSE 连通时停，断线回落

- **关联**：BR-016 / UF-014 / INV-013
- **前置任务**：3
- **风险等级**：P0

**涉及文件与定位**：

- `packages/workbench-ui/src/useSessionPoll.ts`：`useSessionPoll`，L52
- `packages/workbench-ui/src/App.tsx`：`listBotSessions`，L208
- `packages/ui-dsh-bot/src/client/rpc.ts`：`createRpcDshBot` / `POLL_MS`，L129 / L59

**具体操作**：

1. `useBotEvents`：`EventSource('/dsh-bot/events')`，`ready` / `onerror` 退避重连。
2. 三处 timer 认 `sseReady`；false 时 2s 回落。
3. 单测用假 EventSource。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/session-poll.spec.tsx packages/workbench-ui/tests/app.spec.tsx` → 通过

**Evidence**：`evidence/phase-4/task11-tests.log`

### Task 12: 按校准接 assistant/chunk 或消息级刷新

- **关联**：BR-015 / ASM-011 / UF-015
- **前置任务**：11
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Transcript.tsx`：气泡渲染
- `packages/workbench-ui/src/useSessionPoll.ts`：`sseReady` 时不 pull

**具体操作**：

1. 读 `evidence/phase-0/calibration.md`：有 chunk 则刷末泡 + 光标；无则只吃 `assistant/message` / history。
2. 禁止无 chunk 时的假打字。
3. 单测两条分支（用校准开关 fixture）。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/transcript.spec.tsx packages/workbench-ui/tests/session-poll.spec.tsx` → 通过

**Evidence**：`evidence/phase-4/task12-tests.log`

### Task 13: 执行 Phase 4 回归验证

- **关联**：BR-015 / BR-016
- **前置任务**：12

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/workbench-ui/tests` → 通过

**Evidence**：`evidence/phase-4/`

### Phase 5: 文档、真实场景与收尾

### Task 14: 同步 README 工作台实时说明

- **关联**：BR-017 / UF NA（文档）
- **前置任务**：13
- **风险等级**：P2

**具体操作**：README 加「工作台实时」：SSE 路径、工作中可输入、思考/工具/审批卡、断线回落。

**验证**：`rg -n "dsh-bot/events" README.md` → ≥1 命中

**Evidence**：`evidence/phase-5/docs-diff.md`

### Task 15: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-011 / UF-012 / UF-013 / UF-014 / UF-015
- **前置任务**：13

**验证**：按 5.2 执行矩阵逐行回放，全部通过

**Evidence**：`evidence/UF-011/` ~ `evidence/UF-015/`

### Task 16: 执行 Phase 5 回归验证

- **关联**：全部 BR / INV-014
- **前置任务**：14;15

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/` → 空；`git status --porcelain` 不含 `env/dsh-bot`；邻仓 porcelain 与开工基线一致（见 `../dsh-bot-living-master/spec.md` §1.5）；`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-live-transcript --repo .` → 0 FAIL

**Evidence**：`evidence/phase-5/final-commands.log`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 用户可见的需求必须通过 5.2 真实场景全套测试才算完成。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| typecheck | `pnpm run typecheck` | exit 0 | EVD-017 |
| build | `pnpm run build` | exit 0 | EVD-017 |
| unit | `pnpm test` | 全过 | EVD-017 |
| standard | `pnpm run standard:check` | exit 0 | EVD-017 |
| 红线 | `rg -i 'anysphere\|sand://' packages/` | 空 | EVD-017 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（loopback :3084；先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份） |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui`；官方 GUI `http://127.0.0.1:3084`（INV-013 页签对照） |
| 测试账号/数据 | 本机单用户；人设「校对阿宁」；Task 1 校准记录在 `evidence/phase-0/calibration.md` |
| 干净状态定义 | 每条 UF 前刷新工作台；UF-014 前确认 SSE 已 ready |
| 可用测试工具 | Playwright（`../../dsh-genoffice/engine/node_modules/playwright`，`channel:'chrome'`）；curl SSE；Chrome DevTools Network |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-011 主路径 | browser | 2.3 UF-011 步骤 1-3 | 框不灰；第二条入队；停止生效 | `evidence/UF-011/composer-queue.png` |
| UF-011 失败分支 回退 write | browser + log | 临时摘掉 prompt duck | toast 旧通道；仍能发送 | `evidence/UF-011/write-fallback.md` |
| UF-011 失败分支 空停 | browser | 框空点停止 | 无空 user 泡 | `evidence/UF-011/empty-stop.png` |
| UF-012 主路径 | browser | 2.3 UF-012 | 思考卡+工具卡可见可折 | `evidence/UF-012/cards.png` |
| UF-012 失败分支 无思考 | browser | 短答一轮 | 无空卡 | `evidence/UF-012/no-empty-card.png` |
| UF-013 主路径 | browser | 2.3 UF-013 | 卡上允许/拒绝后继续 | `evidence/UF-013/approve.png` |
| UF-013 失败分支 重复点 | browser | 已处理后再点 | 只读已处理 | `evidence/UF-013/already-done.png` |
| UF-014 主路径 | browser Network | 2.3 UF-014 | SSE 活着无 2s poll；重启后回落再停 | `evidence/UF-014/network-sse.png`、`evidence/UF-014/reconnect.md` |
| UF-014 失败分支 首连失败 | browser | events 未部署的旧 build | 2s 轮询仍工作 | `evidence/UF-014/poll-fallback.png` |
| UF-015 主路径 | browser | 2.3 UF-015 | 与 calibration 分支一致 | `evidence/UF-015/stream-or-message.png` |
| UF-015 失败分支 切会话 | browser | 流到一半切 bot | 旧流不污染新泡 | `evidence/UF-015/switch-bot.png` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-0/ calibration.md
  phase-1/ ~ phase-5/
  UF-011/ ~ UF-015/
  API-016/
```

### 5.4 Review 专项检查清单

- [ ] GET `/dsh-bot/events` 未开新端口（BR-011）
- [ ] Composer 工作中可输入，发送键为停止（BR-013）
- [ ] thinking/tool 不再 `return null`（BR-014）
- [ ] 三个点名轮询在 sse-live 时停止（BR-016）
- [ ] 无 chunk 时无假打字（BR-015）
- [ ] `dsh_bot_ask` 与 `runGroupRound` 单测仍绿（INV-011 / INV-012）
- [ ] 5.2 全过；P0 校准未跳过
