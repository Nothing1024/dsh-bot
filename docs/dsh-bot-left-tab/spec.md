# dsh-bot-left-tab Spec

> Version: 0.3.1 | Date: 2026-09-08 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**：事实基线、业务合同、技术方案、任务计划、验收协议全部在此。
> 其他文件（handoff.md、tasks.csv）只引用本文件，不复制内容。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：在官方 DSH 前台（http://127.0.0.1:3084）里用「人设」聊天的本机用户。今天人设名册只住在右侧 iframe 工作台里，对话也在 iframe 里另画一套，和官方左栏会话树、官方中栏对话面是两套壳。
- **做什么**：把原型 `docs/prototypes/dsh-bot-left-tab.html` 的方向落地——官方左栏可以切成「Bot 模式」：会话树的位置换成人设名册（分组、未读与「要你决定」红标、悬停预览、新建/编辑/删除人设与小组、关系图、⌘K 跳转），点人设直接在官方中栏打开它绑定的官方会话；中栏顶栏多一个人设身份条（记忆/例程/同事/人设/切对话），例程主动发的那轮对话尾部带「例程触发」标签。切回「会话模式」后官方会话树原样回来。
- **改哪里**：`packages/ui-dsh-bot`（浏览器插件半边，新增左栏区域注册、底栏 Bot 开关、中栏顶栏身份条）；抽一个共享逻辑包给 iframe 工作台和左栏名册共用；`packages/workbench-ui` 只加一个「被宿主选中小组」的消息接收。不改官方 npm 包，不改后端 RPC 契约。
- **怎么算做完**：在真机前台点底栏「Bot」→ 左栏变成分组名册（置顶/工作/生活 + 未读徽章）→ 点「代码审查官」→ 中栏打开它最近的官方会话且顶栏出现身份条 → 点名册顶部「会话」→ 官方会话树完整回来；刷新页面模式保持。
- **不做什么**：不把 1:1 对话再画一遍（对话面全部交官方中栏）；不改官方「+ 新会话」按钮的行为（平台没有接口）；小组房间不进官方中栏（继续在右侧「DSH Bot」页签里，名册点小组只负责跳过去）。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 用户问「原型 `docs/prototypes/dsh-bot-left-tab.html` 是不是没有落地，落地该怎么做」，随后 `/prd-workflow oneclick`；本包按上一轮对话的评估结论（左栏模式切换 + 名册 + 官方中栏 + header.actions 身份条）生成 |
| 输入类型 | description（来自对话上下文 + 原型 HTML + `docs/prototypes/left-sidebar-bot-tab.md`） |
| Mode | oneclick |
| 置信度 | 高（官方 slot 机制、插件现状、RPC 面均已勘察；剩余不确定点登记为 ASM-601~605，P0 校准） |
| 输出目录 | `docs/dsh-bot-left-tab/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | frontend（主：官方壳内插件 UI）+ refactor（抽共享逻辑包）+ infra（客户端 bundle 纯度 / 注册生命周期） |
| 主要风险 | ① `priority` 遮蔽只在 SlotCore 实现与报错文案中出现，`slots.d.ts` 未写成公开契约，升级可能变；② 遮蔽注册若未随 fiber 卸载清理会留下孤儿条目让官方树消失；③ 名册在 280px 左栏与 56px rail 两态都要能用；④ 工作区有在飞未提交改动（session-nav），不能被本包踩坏 |
| 行号引用策略 | 仅 hint（frontend）；共享包抽取部分附 symbol + rg anchor |
| 必需验收方式 | 真机浏览器点击 + 截图 + console；`pnpm run typecheck`；vitest（jsdom）；tsdown build 通过纯度插件 |
| 必须覆盖用户场景 | UF-601 切入 Bot 模式、UF-602 切回会话模式、UF-603 点人设开官方会话、UF-604 收起 rail、UF-605 中栏身份条、UF-606 点小组跳页签、UF-607 未读与已读、UF-608 左栏管理人设与小组、UF-609 关系图与新开房间、UF-610 悬停预览与人设浮层、UF-611 ⌘K、UF-612 红「@」与例程标签 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 原型是纯静态 HTML，数据内联（`bots` / `botSessions` / `groups` / `transcripts`），10 个分镜 | `Read docs/prototypes/dsh-bot-left-tab.html` | L252-L327 内联数据；L239-L250 `SCENES` |
| `ui-dsh-bot` 客户端 `apply()` 只注册 better-sidebar 页签 `dsh-bot:sessions`（iframe `/dsh-bot/ui`），无 `ctx.slots` 调用 | `Read packages/ui-dsh-bot/src/client/index.ts` | L56-L105 `apply`；L61 `ctx.inject(['betterSidebar'], ...)` |
| 客户端硬 inject 只有 `sessions` + `locale` | `Read packages/ui-dsh-bot/src/client/inject.ts` | L5 `export const inject = ['sessions', 'locale']` |
| 全仓源码无 `sidebar.workspaces` / `slots.register` 引用 | `rg -n "sidebar\.workspaces|registerSlot|slots\.register" packages/*/src` | 无命中 |
| 官方 `sidebar` 壳声明 5 个子洞：`sidebar.brand.mark/name`、`sidebar.workspaces`（single/root）、`sidebar.settings`（single）、`sidebar.footer.action`（list/root）；owner props `{ wide, expandSidebar }` | `Read env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts` | L39-L43 workspaces；L58-L62 footer.action；L79-L84 `SidebarSectionOwnerProps` |
| 官方「新会话」按钮是壳自带，直接调 `startSession()`，无 slot | `Read env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js` | L207-L219 `newSession` 按钮 `onClick: () => { startSession(); }` |
| ui-workspace 以默认 priority（未传）注册 `sidebar.workspaces`，用 `ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({...}, WorkspaceBrowser))` | `Read env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` | L2434-L2443 |
| ui-workspace bundle 只导出 `apply` / `inject`，`WorkspaceBrowser` 不可 import | `rg -n "^\s*exports\.\w+ =" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` | L2455-L2456 |
| single 槽渲染取 `host.entriesOfSlot(slotKey)[0]`（第一个活条目） | `rg -n "spec.kind === \"single\"" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js` | L794-L797 |
| SlotCore.register：single 槽同 priority 抛错「register at a different priority to shadow it (lowest renders)」；条目按 `priority ?? 0` 升序排序 | `rg -o -n "lowest renders.{0,400}" env/profiles/gb/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-ClqxG24t.js` | 第 56 行 bundle；排序 `(m,g)=>(m.options.priority??0)-(g.options.priority??0)` |
| `renderSlot` 只能渲染自己 `children` 声明的洞，否则抛 `SlotOwnershipError` | `rg -n "function boundRenderSlot" -A 8 env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js` | L281-L288 |
| 客户端 bundle 纯度插件禁止跨插件 value import（`@deepseek-ai/*` 仅 `CLIENT_EXTERNALS` / `INLINE_SAFE`） | `Read packages/ui-dsh-bot/tsdown.config.ts` | L17-L29 `CLIENT_EXTERNALS`（含 `@deepseek-ai/dsh-client-ui-slots`、`dsh-client-runtime/client`）；L100-L112 purity 插件 |
| 客户端 `SessionSummary` 带 `agentPreset?: string`、`displayTitle`、`running`、`updatedAt`；`SessionListState` 有 `byId` / `current` | `Read env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/service.d.ts` | L30-L60；L66-L74 |
| `conversation.session.header.actions` 是 list / session 作用域，owner props 为空对象，按 `order` 升序渲染 | `Read env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts` | L86-L100；L378 `ConversationHeaderActionOwnerProps {}` |
| better-sidebar 服务有 `registerTab` / `openTab(seed, scope?)` / `activateTab(tabId, scope?)` | `rg -n "registerTab|openTab(|activateTab" env/profiles/gb/node_modules/dsh-better-sidebar/lib/types/client/service.d.ts` | L316 / L360 / L398 |
| 官方 `shell.overlay` 是 list / root 槽：「frame-wide floating layer, above every column」，层本身 click-through，条目自行 opt-in pointer events；是浮层/模态的合法座位 | `rg -n "'shell.overlay'" -B 12 env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/types/client/index.d.ts` | L66-L80 |
| 人设/小组管理 RPC 齐全：`createBot / updateBot / deleteBot / createGroup / updateGroup / deleteGroup / createGroupSession`；删 seed bot 抛 `bot-protected`；小组成员 2–6（`GROUP_MEMBER_MIN/MAX`） | `rg -n "case 'deleteBot'|case 'createGroupSession'" packages/dsh-bot-host/src/workbench-routes.ts`；`rg -n "bot-protected|GROUP_MEMBER_MIN =" packages/dsh-bot-host/src/bots.ts packages/dsh-bot-host/src/groups.ts` | routes L217 / L243；bots L508；groups L15 |
| iframe 工作台已有 `BotForm` / `GroupForm` / `RelationshipGraph` 三个组件，字段与校验可对照（不可跨包 import，见纯度插件） | `rg -n "^export function" packages/workbench-ui/src/BotForm.tsx packages/workbench-ui/src/GroupForm.tsx packages/workbench-ui/src/RelationshipGraph.tsx` | L46 / L28 / L16 |
| 原型悬停预览 400ms 出、120ms 收；预览卡 220px；表单 `formPane` 560px；关系图卡 ≤520×420；确认框 360px | `rg -n "hoverTimer = setTimeout|\.rosterPreviewCard \{|\.formPane \{|\.graphCard \{|\.confirmBox \{" docs/prototypes/dsh-bot-left-tab.html` | L1410 / L1422 / L78 / L166 / L176 / L190 |
| 官方 `SessionSummary.pendingInteraction?: 'approval' \| 'plan-review' \| 'question'`（官方侧栏琥珀点的数据源）可在客户端直接读到；`/dsh-bot/history` 条目已有 `origin?: 'routine'` 与 `seq` | `rg -n "pendingInteraction\?: PendingInteractionStatus" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/service.d.ts`；`rg -n "origin\?: 'routine'|readonly seq: number" packages/workbench-ui/src/api.ts` | service.d.ts L48；api.ts L170 / L171 |
| 官方 `conversation.chat.turnTail` 是 chain / session 槽：条目用 `select(owner)` 决定是否挂载，owner 给 `turn: TurnLocation`（`turn / start / end / status`）与闭合 `seq` | `rg -n "'conversation.chat.turnTail'" -B 6 -A 4 env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`；`rg -n "interface TurnLocation" -A 8 env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/contract/conversation.d.ts` | slots L154-L164 / L440-L450；conversation L67-L75 |
| 宿主 RPC 方法：`listBots createBot updateBot deleteBot createBotSession listBotSessions history prompt reconcile listGroups ... markRead ... updateBotLayout`；`rosterSections` 不在 host 路由里（只在 workbench api.ts 有客户端封装） | `rg -n "case '[a-zA-Z]+':" packages/dsh-bot-host/src/workbench-routes.ts`；`rg -n rosterSections packages/dsh-bot-host/src/` | routes L211-L330；host 无命中 |
| SSE `GET /dsh-bot/events` 只转发 `bot:` / `group-room:` marks 会话 | `Read packages/dsh-bot-host/src/bot-events.ts` | L2；L125 `text/event-stream` |
| `WorkbenchBot` 已有 `unread/pinned/section/hidden/order/muted/presetId`；`CreateBotSessionValue` 有 `sessionId/title/botId/presetId` | `rg -n "export interface WorkbenchBot\b|export interface CreateBotSessionValue" -A 14 packages/workbench-ui/src/api.ts` | L64-L78；L147-L152 |
| 名册逻辑可复用：`groupRosterItems` / `DEFAULT_ROSTER_SECTIONS`、`pickBoundSession` / `readLastSession`、`hashAvatarColor` / `nameInitial` / `relativeTime` | `rg -n "export function|export const" packages/workbench-ui/src/roster-sections.ts packages/workbench-ui/src/session-binding.ts packages/workbench-ui/src/avatar.ts` | roster-sections L28；session-binding L43/L85；avatar L22/L32/L45 |
| iframe → 宿主跳会话桥：`JUMP_MESSAGE_TYPE = 'dsh-bot:jump'`，宿主 `handleJumpMessage` | `rg -n "JUMP_MESSAGE_TYPE|export function handleJumpMessage" packages/workbench-ui/src/jump.ts packages/ui-dsh-bot/src/client/session-jump.ts` | jump.ts L6；session-jump.ts L117 |
| 现有测试形态：jsdom + @testing-library/react，`describe('DshBotTab'` | `sed -n 1,60p packages/ui-dsh-bot/tests/tab.spec.tsx` | L1 `// @vitest-environment jsdom` |
| vitest 根配置：`include: packages/*/tests/**/*.spec.ts(x)`，默认 environment node | `cat vitest.config.ts` | L21-L24 |
| 仓根脚本：`typecheck` / `build`（`pnpm -r --filter './packages/*' run build`）/ `test` / `env:boot` | `cat package.json` | scripts 段 |
| 网关 :3084 正在监听（pid 60108） | `lsof -nP -iTCP:3084 -sTCP:LISTEN` | node 60108 |
| 启动脚本 `sh env/boot.sh`：已起且身份对本仓则直接退出 | `sed -n 1,30p env/boot.sh`；`rg -n "boot" README.md` | README L28 |
| 工作区有未提交改动（session-nav 在飞）：`ui-dsh-bot` DshBotTab/session-jump/tab.spec、`workbench-ui` App/Persona 等 21 文件 | `git status --short`；`git diff --stat` | 21 files changed, 547 insertions |
| 本会话可用浏览器工具：cursor-ide-browser MCP（navigate/snapshot/click/screenshot）；邻仓有 Playwright | 本会话工具目录；`ls ../../dsh-genoffice/engine/node_modules/playwright/package.json`（见 `docs/archive/dsh-bot-roster/spec.md` §1.3） | 可做真机回放 |
| session-nav Task 4 阻塞已于 2026-09-08 解除:根因是 `askBot` 把委托 `~dsh-bot:` 会话**归档**(非隐藏),rc.2 投影会清掉归档 current 且无 unarchive;页签桥现对归档目标回执 `archived`。实测 `~ calib-nav-hidden`(`kind:hidden`,未归档)`sessions.open` 落地 `current` → 本包 BR-605 依赖的「打开 `createBotSession` 建出的 1:1 会话」成立(这些会话不归档) | `python3 ~/.claude/skills/prd-workflow/scripts/board.py docs/dsh-bot-session-nav`;`Read docs/dsh-bot-session-nav/evidence/phase-1/live-jump-rerun.json` | Task 4 已完成;allPass:true |
| session-nav 聚合与推送两条规则（其 spec §2.1「聚合 overview」「SSE 推送」）计划新增 `POST /dsh-bot/overview {}` 聚合接口（bot/group 会话摘要 + lastMessage + working）与 `GET /dsh-bot/events` SSE；对应 Task 9 / Task 10 均「待开始」 | `rg -n "聚合 overview|SSE 推送" docs/dsh-bot-session-nav/spec.md` | 本包 Task 7 数据层应复用而非另写 |
| ASM-601~605 真机校准全部证实：`inject` 加 `slots` 后 fiber `active`、`ctx.slots.snapshot()` 可读；`priority: -1` 遮蔽 `sidebar.workspaces`；dispose 回 `'sessions'` 后官方树+搜索+打开恢复；`sidebar.footer.action` 在 wide/rail 都渲染且收到 `wide`；`header.actions` 能读 `sessionId` + `byId[id].agentPreset` | Task 1 真机 :3084；`docs/dsh-bot-left-tab/evidence/phase-0/calibration.md` | 见 EVD-601 |
| `agentPreset` 取值：默认 DSH Bot 会话是 `dsh-bot`（无 `--slug`）；其他人设是 `dsh-bot--<slug>`；普通会话是 `standard` / `minimal`。BR-607 匹配须同时认 `dsh-bot` 与 `dsh-bot--` 前缀 | `dsh-rpc.sh 3084 session.list` + spike console | 身份条判定补充 |

### 1.4 假设清单

> 假设被证实后：事实回写 1.3 节并从本表删除该行；被证伪后走变更协议。ASM-601~605 已由 Task 1 消解。

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-608 | `/dsh-bot/history` 条目的 `seq` 与官方 `TurnLocation.start/end` 事件的 `seq` 同源（都是 session 事件序号），可直接做区间匹配 | 不同源则 turnTail 的 `select` 改按 `createdAt` 时间窗匹配，精度下降 | Task 19 第一步：在一条例程会话上同时打印两边 seq，写入 `evidence/UF-612/seq-check.log` |
| ASM-607 | 到本包 Task 7 开工时，session-nav Task 9/10（`POST /dsh-bot/overview` + `GET /dsh-bot/events` 脏通知）已落地；Task 7 直接消费 overview 而不是逐 bot `listBotSessions` | 未落地则 Task 7 先按 `listBots` + `listGroups` + 懒拉 `listBotSessions(选中 bot)` 实现，并在 §1.5 登记「待 overview 落地后切换」 | Task 7 开工前 `rg -n "case 'overview'" packages/dsh-bot-host/src/workbench-routes.ts` |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-09-08 | Task 7 走 B 路（`listBots` + `listGroups` + 选中 bot 懒拉 `listBotSessions`），overview 落地后切 A | ASM-607：`rg` `packages/dsh-bot-host/src/workbench-routes.ts` 无 `case 'overview'` | store 形状保持 A/B 兼容，上层不感知 |
| 2026-09-08 | BR-607 v0.3.1：preset 匹配从「仅 `dsh-bot--` 前缀」改为「`dsh-bot` 或 `dsh-bot--` 前缀」；Task 8/17 注意事项补 betterSidebar inject 墙 | Task 1 校准发现默认 DSH Bot 的 agentPreset 是 `dsh-bot`；Phase 1 真机踩到 slot 组件读未 inject 服务崩溃 | Task 17 实现按新文案；Task 8/11/12 的 activateTab 接线走 inject 回调 |
| 2026-09-08 | ASM-601~605 消解（Task 1 校准）：priority -1 遮蔽、dispose 恢复、footer wide/rail、header kit 读 agentPreset 全部证实；默认 DSH Bot 的 preset 是 `dsh-bot` 不是 `dsh-bot--` | 真机 :3084 + `session.list` | 事实回写 §1.3，§1.4 删五行；BR-607 实现时同时匹配 `dsh-bot` 与 `dsh-bot--` 前缀 |
| 2026-09-08 | BR-619~621、UF-611~612、EVD-612~613、ASM-608 新增；§2.8 撤回三条非目标（v0.3.0） | 用户质疑非目标；复核后「@」可用官方 `pendingInteraction`、例程标签可用 `turnTail` chain + history `origin`，⌘K 可用 `shell.overlay` + 焦点分工，均不改 host | 新增 Task 15（⌘K 面板）、Task 19（turnTail 标签）；原 15-21 顺延为 16-18 / 20-23；Task 4/7/8 扩展；5.2 +3 行 |
| 2026-09-08 | BR-613~618、UF-608~610、EVD-609~611 新增；§2.8 增三条非目标（@ 提及 / ⌘K / 例程标签）（v0.2.0） | 用户要求补齐与原型的功能与界面对齐：名册头部三按钮、overlay 表单与删除确认、菜单编辑/删除、新开房间、悬停预览、人设浮层、视觉基准 | 新增 Task 12（overlay 表单）/ 13（关系图 + 新开房间）/ 14（悬停预览）；原 Task 12-18 顺延为 15-21；Task 7 补六个管理 RPC；Task 8/10/17 扩展；5.2 矩阵 +8 行 |
| 2026-09-08 | ASM-606 消解（v0.1.2）：session-nav 重跑证实隐藏未归档会话 open 落地，阻塞根因为归档；事实回写 §1.3，Task 1 去掉 5b，前置改为「已满足」 | 见 §1.3 2026-09-08 行 | Task 1 标题恢复 ASM-601~605；状态板备注同步 |
| 2026-09-08 | ASM-606 / ASM-607 新增（v0.1.1） | 用户确认本包与在飞包 `dsh-bot-session-nav` 的两处耦合：隐藏会话 open 阻塞是 BR-605 前提；overview + SSE 与 Task 7 数据层重叠 | Task 1 增加隐藏会话 open 校准步骤并点名 session-nav Task 4；Task 7 前置增加「先查 overview 是否落地」分支；状态板备注同步 |

### 1.6 质量记录

| 日期 | 命令 | 结果 |
|---|---|---|
| 2026-09-07 | `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab --repo .` | 0 FAIL / 1 WARN（P0 豁免回归留痕）/ 21 PASS；§3.3 全部 21 条 rg anchor 命中；§3.5 的 7 条官方包 anchor 已手动 `rg --count` 逐条命中（1–2 次） |

---

## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。任务、handoff、review 一律引用 ID，不复制表格。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-601 | Bot 模式只通过向 `sidebar.workspaces` 以 `priority: -1` 注册来替换官方会话树；禁止注册 `root` / `sidebar` / `conversation` / `conversation.session` 任何 single 槽 | 注册 `{ name: 'sidebar.workspaces', priority: -1 }` | 注册 `root` 让整页只剩插件 | `packages/ui-dsh-bot/src/client/` | 单测断言 register 参数；真机 DOM 只有 `sidebar.workspaces` 变化 |
| BR-602 | 会话模式对官方零侵入：插件不注册、不复刻、不用 CSS 隐藏官方会话树；切回会话模式 = dispose 遮蔽注册，官方 `WorkspaceBrowser` 原样回来 | 切回后能搜索会话、展开工作区、打开会话 | 会话模式下左栏还残留插件分段条或空白 | 同上 | UF-602 真机回放 |
| BR-603 | 模式持久化在 `localStorage['dsh-bot:sidebar-mode']`（`'sessions'` \| `'bot'`），刷新页面保持；缺省 `'sessions'` | 切到 Bot 后刷新仍是名册 | 刷新后回到会话树 | `sidebar-mode.ts` | 单测 + UF-601 步骤 5 |
| BR-604 | 名册行是身份不是会话：每行 = 头像 + 名字 + 最后一句预览 + 未读徽章 + 会话数；按置顶/工作/生活分组（沿用 `groupRosterItems`，隐藏项进底部「已隐藏 N 个」）；绑定会话只在**当前选中身份**下展开 | 选中审查官后其下挂 ≤8 段会话 | 每个 bot 都展开会话变成第二棵会话树 | `BotRoster.tsx` | 单测 + UF-603 |
| BR-605 | 点人设 = 打开最近绑定会话：先读 `readLastSession(botId)` 命中且仍在列表 → `sessions.open`；否则取 `listBotSessions` 最新非隐藏行；都没有 → `createBotSession` 后 `open`。任何一步失败：行内红字错误 + 可重试，选中态不变 | 无会话的新人设点一下即建会话并打开 | 失败时静默或选中跳到别处 | `BotRoster.tsx` / `roster-rpc.ts` | 单测三分支 + UF-603 失败分支 |
| BR-606 | 1:1 对话面全部交官方中栏：插件不在左栏区域、中栏、浮层里再画 Transcript / composer；中栏只新增 `conversation.session.header.actions` 一个条目 | 打开 bot 会话后中栏是官方对话/轨迹 + 官方 composer | 左栏或浮层里出现插件自己的消息流 | 全部客户端代码 | code review + UF-605 |
| BR-607 | 身份条只对 bot 会话渲染：`agentPreset` 等于 `dsh-bot`（默认 DSH Bot 的 seed preset）或以 `dsh-bot--` 开头，且能在 `listBots` 里按 `presetId` 找到 bot 才显示；否则返回 `null`，不留占位 | 普通「重构 api.ts」会话顶栏没有身份条 | 普通会话顶栏出现空 chip | `IdentityBar.tsx` | 单测 + UF-605 分支 |
| BR-608 | 小组不是官方 session：Bot 模式点小组 → `betterSidebar.activateTab('dsh-bot:sessions')` 并 postMessage `{ type: 'dsh-bot:select-group', groupId }` 给 iframe；不在中栏画房间；better-sidebar 缺席时行内提示「需要右栏 DSH Bot 页签」 | 点「编辑室」右栏页签亮起并选中编辑室 | 中栏出现房间面 | `BotRoster.tsx` / `workbench-ui/src/App.tsx` | UF-606 |
| BR-609 | 官方「+ 新会话」行为不变（平台无接口）；Bot 模式的「新开对话」入口在名册选中身份下方与身份条上，调 `createBotSession` 后 `open` | Bot 模式点官方「+」仍进官方 hero | 插件试图拦截或隐藏官方「+」 | 同上 | UF-603 步骤 6 |
| BR-610 | rail 态（owner `wide === false`）名册退化为头像列：只画可见 bot 头像 + 未读点；点头像 → `expandSidebar()` 再执行 BR-605 | 收起侧栏后仍能一键回到审查官会话 | rail 态空白或溢出 | `BotRoster.tsx` | UF-604 |
| BR-611 | 所有注册（region / footer.action / header.actions / 事件订阅）都走 `ctx.effect` 或 `ctx.slots.inject` 返回的 disposer，插件 fiber 卸载或热重载后 `ctx.slots.entries('sidebar.workspaces')` 只剩官方一条 | HMR 后左栏正常 | 重载后左栏空白或双份分段条 | `index.ts` | 单测 dispose 顺序 + Task 1 校准 |
| BR-613 | 名册头部三个按钮「关系图」「+ 新建人设」「+ 新建小组」；新建/编辑人设、新建小组/编辑成员、删除确认全部是 `shell.overlay` 里的模态（`id: 'dsh-bot:overlay'`，自己 `pointer-events: auto`），不占中栏；表单校验沿用 iframe 工作台：名字与人设文本必填，小组 2–6 名成员；保存调 `createBot/updateBot/createGroup/updateGroup`，成功关模态并让名册刷新且选中新建项 | 点「+ 新建人设」弹表单，保存后名册出现新行并选中 | 表单画在中栏或用 `window.prompt` | `OverlayForms.tsx` | UF-608 |
| BR-614 | 删除走确认框：文案区分人设（「会删掉这个人设和它绑定的对话」）与小组（「会删掉小组和房间记录，成员人设保留」）；`protected` 的 DSH Bot 不显示删除项；删除当前选中项后选中态转到第一可见行，中栏不动 | 删旧助手后选中跳到审查官，中栏仍是原会话 | 无确认直接删；删 DSH Bot | `OverlayForms.tsx` / `BotRoster.tsx` | UF-608 |
| BR-615 | 悬停 400ms 出预览卡（离开 120ms 收）：人设行显示模型标签 / 例程数 / 会话数 / 最后一句；小组行显示成员数 / 轮次 / 最后一句；卡片 `pointer-events: none`，不挡点击；rail 态与触屏不出卡 | 停在审查官 0.4s 见「grok-4.6 · 例行 1 · 会话 2」 | 卡片挡住行的 ⋯ 按钮 | `BotRoster.tsx` | UF-610 |
| BR-616 | 身份条第四枚 pill「人设」：浮层显示 persona 文本 + `preset dsh-bot--<slug>` + 「编辑人设」按钮（打开 BR-613 的编辑模态）；身份 chip 本身点击也打开编辑模态 | 点 chip 直接进编辑 | 人设文本只能去 iframe 看 | `IdentityBar.tsx` | UF-610 |
| BR-617 | 视觉基准：分段条 / 名册行 / 头像 / 未读徽章 / 预览卡 / 浮层 / 表单 / 确认框 / 关系图卡的尺寸、圆角、间距以 `docs/prototypes/dsh-bot-left-tab.html` 对应 class（`.seg` `.rosterRow` `.face` `.unreadBadge` `.rosterPreviewCard` `.floatPanel` `.formPane` `.confirmBox` `.graphCard`）为准，颜色 token 换成宿主 `color-scheme` 变量；实现不得自创另一套间距 | 名册行 36px 头像格 + 三列网格 | 行高、圆角随手写 | 全部 CSS modules | code review + UF-601 截图对照 |
| BR-618 | 小组行选中后下挂「+ 新开房间」：调 `createGroupSession(groupId)` 后按 BR-608 跳右栏页签并选中该房间；「关系图」按钮打开 `shell.overlay` 关系图卡（虚线 = 同组，实线 = 有过传话），点节点 → 关闭卡并 `selectBot` | 点节点「诗人小北」名册选中小北并打开其会话 | 关系图画在中栏 | `RelationshipGraphOverlay.tsx` | UF-609 |
| BR-619 | 「需要你决定」红徽章：某 bot 任一绑定会话在 `ctx.sessions.list.getSnapshot().byId[id].pendingInteraction` 有值（approval / plan-review / question）时，名册徽章改为红色「@」并优先于数字未读；底栏「Bot」行也带红点；pending 消失即回到数字 | 审批卡出现时审查官行变红「@」 | 用 host 新字段实现；红色永不清 | `BotRoster.tsx` / `ModeFooterAction.tsx` | UF-612 |
| BR-620 | 例程触发标签：向 `conversation.chat.turnTail`（chain）注册，`select` 只在该 turn 的 seq 区间内存在 `origin === 'routine'` 的 history 项时匹配，渲染「例程触发 · {例程名}」小标签；其他 turn 一律 `null`（不挂载） | 06:00 巡检那轮尾部有标签 | 每个 turn 都挂一个空组件 | `RoutineTurnTail.tsx` | UF-612 |
| BR-621 | ⌘K 命令面板：`shell.overlay` 里的 palette kind；`window` 级 `keydown` 只在焦点不在 iframe / 输入框时响应；项 = 人设 / 小组 / 当前人设绑定会话 / 切模式；↑↓↵ Esc；不做「分镜」项 | 焦点在官方 composer 外按 ⌘K 出面板 | 焦点在 iframe 内也抢键 | `CommandPalette.tsx` | UF-611 |
| BR-612 | 未读：名册徽章读 `WorkbenchBot.unread`；点人设或身份条出现时调 `markRead(botId)` 清零；数据刷新靠 `/dsh-bot/events` SSE 触发 `listBots` 重拉，SSE 断开退回 2s 轮询（沿用 `rpc.ts` 策略） | 例程说话后徽章 +1，点开后归零 | 徽章永不更新或每秒闪烁 | `roster-rpc.ts` | 单测 + UF-607 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-601 | 官方前台会话模式，左栏是会话树 | 点底栏「Bot」 | 左栏 `sidebar.workspaces` 区域变成分段条「会话 \| Bot」+ 分组名册；刷新后保持 | 用户 | browser | EVD-602 |
| UF-602 | Bot 模式 | 点分段条「会话」 | 官方会话树原样回来，可搜索/打开会话；底栏「Bot」回到未激活态 | 用户 | browser | EVD-602 |
| UF-603 | Bot 模式，名册可见 | 点一个人设 | 中栏打开其最近绑定官方会话；无会话则新建并打开；选中身份下挂绑定会话与「+ 新开对话」 | 用户 | browser | EVD-603 |
| UF-604 | Bot 模式 | 收起侧栏到 56px rail | 名册退化为头像列；点头像展开并打开该人设会话 | 用户 | browser | EVD-604 |
| UF-605 | 打开的是 bot 会话 | 看中栏顶栏 | 出现身份 chip + 记忆/例程/同事 pill + 「对话」切换 + 新开对话；普通会话不出现 | 用户 | browser | EVD-605 |
| UF-606 | Bot 模式 | 点一个小组 | 右栏「DSH Bot」页签激活并选中该小组；中栏不变 | 用户 | browser | EVD-606 |
| UF-607 | Bot 模式，某人设有未读 | 例程/同事说话；随后点开该人设 | 徽章更新；点开后归零 | 用户 | browser + curl | EVD-607 |
| UF-608 | Bot 模式 | 名册头部「+ 新建人设 / + 新建小组」、⋯ 菜单「编辑人设 / 删除人设 / 编辑成员 / 删除小组」 | overlay 模态表单；保存后名册刷新并选中；删除需确认，DSH Bot 不可删 | 用户 | browser | EVD-609 |
| UF-609 | Bot 模式，存在小组 | 点「关系图」；点节点；小组行「+ 新开房间」 | overlay 关系图卡显示同组虚线；点节点回到该人设；新开房间后右栏页签选中新房间 | 用户 | browser | EVD-610 |
| UF-610 | Bot 模式 / bot 会话 | 悬停名册行 0.4s；点身份条「人设」pill 或 chip | 预览卡出现且不挡点击；人设浮层显示 persona + preset，「编辑人设」打开编辑模态 | 用户 | browser | EVD-611 |
| UF-611 | 任一模式，焦点在官方壳 | 按 ⌘K | 面板弹出；输入过滤；↵ 跳到人设/小组/会话或切模式；焦点在 iframe 时不触发 | 用户 | browser | EVD-612 |
| UF-612 | bot 会话触发审批 / 例程主动说话 | 看名册与中栏 | 名册该 bot 红「@」；审批处理后回数字；例程那轮尾部有「例程触发」标签 | 用户 | browser + RPC | EVD-613 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-601: 切入 Bot 模式

**前置状态**：http://127.0.0.1:3084 已打开，左栏展开（wide），`localStorage['dsh-bot:sidebar-mode']` 为空或 `'sessions'`，底栏设置行旁有「Bot」行（`sidebar.footer.action`）。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点底栏「Bot」 | 「Bot」行进入激活态（高亮） | `setMode('bot')` → 写 localStorage → `ctx.slots.register({ name:'sidebar.workspaces', priority:-1 }, BotRegion)` | 官方会话树消失，同位置出现分段条「会话 \| Bot」（Bot 选中）+「加载名册…」 |
| 2 | — | 加载态 ≤1 帧后替换 | `listBots` + `listGroups` 并行请求 | 分组名册：置顶 / 工作 / 生活各节可折叠，行 = 头像 / 名字 / 预览 / 未读 / 会话数；底部「已隐藏 N 个」（N>0 时） |
| 3 | 悬停某行 | 行高亮，右侧出现 ⋯ | — | — |
| 4 | — | — | 若 `readLastSelectedBot` 命中，默认选中该行并展开其绑定会话 | 上次人设已选中（默认第一行） |
| 5 | 按 F5 刷新 | 页面重载 | `apply` 启动时读 localStorage 为 `'bot'` → 立即注册 | 刷新后左栏仍是名册 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 网关拒绝 / 网络错 | `listBots` 非 2xx 或 fetch 抛错 | 名册区域显示「名册加载失败」+「重试」按钮；分段条仍可切回「会话」 | 记录 console.warn，不注销 region | 点「重试」重新拉；或切回「会话」 |
| 空名册 | `listBots` 返回 0 个 bot 且 0 个小组 | 空态文案「还没有人设」+「在右栏 DSH Bot 页签新建」链接（`activateTab`） | — | 新建后 SSE/轮询自动出现 |
| `slots` 服务不可用 | `ctx.slots` undefined（ASM-601 证伪） | 底栏「Bot」行不渲染或禁用并 title「当前宿主不支持」 | `apply` 跳过 region 注册，只保留 better-sidebar 页签 | 无（降级到现状） |

**界面状态机**：

```text
sessions ──点「Bot」──▶ bot.loading ──ok──▶ bot.ready
   ▲                       │                 │
   │                     error ──重试──▶ bot.loading
   └────────点「会话」（任意 bot.* 态可切）────┘
```

**入口接线清单**：

- 底栏 `sidebar.footer.action` 条目 `dsh-bot:mode` onClick → `setMode('bot')`
- `apply()` 启动时读 localStorage → `'bot'` 则直接注册 region（刷新保持）
- region 顶部分段条「Bot」按钮（已在 Bot 态时为选中态，点击无副作用）

#### UF-602: 切回会话模式

**前置状态**：Bot 模式（region 已注册），名册可见。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点分段条「会话」 | 分段条消失 | `setMode('sessions')` → dispose 遮蔽注册 → 写 localStorage | 官方会话树整块回来（工作区头 / 搜索 / 树 / 未分组） |
| 2 | 在官方搜索框输入 | 官方过滤生效 | 官方 WorkspaceBrowser 逻辑 | 会话过滤正常 |
| 3 | 点一个会话 | 官方高亮 | `sessions.open` | 中栏打开该会话 |
| 4 | 看底栏 | 「Bot」行回到未激活态 | — | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 官方树未恢复 | dispose 后 `[data-slot="sidebar.workspaces"]` 为空（ASM-603 证伪） | 左栏空白 | 校准阶段即阻塞，方案改为保持注册 + 内嵌隐藏 | Task 1 处置，不进入 Phase 1 |
| 名册请求还在飞 | 切回时 `listBots` 未返回 | 无影响 | in-flight 请求结果丢弃（AbortController） | — |

**界面状态机**：见 UF-601（同一状态机，反向边）。

**入口接线清单**：

- region 分段条「会话」按钮 onClick → `setMode('sessions')`
- 底栏「Bot」行在 Bot 态再次点击 → 也切回 `sessions`（toggle 语义）

#### UF-603: 点人设打开绑定官方会话

**前置状态**：Bot 模式，名册就绪；「代码审查官」有 2 段绑定会话，「新人设 X」0 段。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点「代码审查官」行 | 行进入选中态；行下方出现「加载会话…」 | `listBotSessions(botId)`；`readLastSession(botId)` | — |
| 2 | — | 行下方展开 ≤8 段绑定会话 + 「+ 新开对话」 | 命中最近会话 → `sessions.open(sessionId)`；`markRead(botId)`；`writeLastSession` | 中栏打开该官方会话（对话/轨迹 tab、官方 composer），该会话在下挂列表里高亮；未读徽章归零 |
| 3 | 点下挂列表另一段会话 | 高亮切换 | `sessions.open` + `writeLastSession` | 中栏切换 |
| 4 | 点「新人设 X」行 | 选中态；「正在新建对话…」 | `listBotSessions` 空 → `createBotSession(botId)` → `sessions.open` | 中栏打开空的新官方会话，composer 可输入 |
| 5 | 点「+ 新开对话」 | 按钮 loading/禁用 | `createBotSession` → `open` | 新会话出现在下挂列表顶部并打开 |
| 6 | 点官方左栏顶部「+ 新会话」 | 官方行为 | `workspaces.startSession()` | 进入官方「探索未至之境」（BR-609，不拦截） |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 创建失败 | `createBotSession` 返回 `ok:false`（如凭据缺失） | 行下方红字显示 `error.message` + 「重试」；选中态保留 | console.warn；不写 lastSession | 点「重试」 |
| 会话已被归档 | `readLastSession` 的 id 不在 `listBotSessions` 结果里 | 无额外提示 | 回退到最新非隐藏行；仍没有 → 走创建 | — |
| `sessions.open` 缺失 | 宿主 `ctx.sessions.open` undefined | 行下方红字「宿主不支持打开会话」 | 不创建会话 | 无（宿主问题） |
| 网关挂了 | fetch 抛错 | 红字「网关不可达」+ 重试 | — | 网关恢复后重试 |

**界面状态机**（每行）：

```text
idle ──点击──▶ resolving ──有会话──▶ opened
                 │  └──无会话──▶ creating ──ok──▶ opened
                 └──────────────error（红字 + 重试，选中保留）
```

**入口接线清单**：

- 名册行 onClick → `selectBot(botId)`（BR-605 三分支）
- 下挂会话行 onClick → `sessions.open`
- 「+ 新开对话」按钮 onClick → `createBotSession` → `open`
- rail 头像 onClick → `expandSidebar()` → `selectBot`（UF-604 复用）

#### UF-604: 收起侧栏为 rail

**前置状态**：Bot 模式，名册就绪，侧栏展开。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点官方「收起侧边栏」 | 侧栏动画收到 56px | 壳传 `wide=false` | region 只画可见 bot 头像竖列（≤ 可视高度，超出可滚动）+ 未读红点；分段条隐藏 |
| 2 | 点某头像 | 头像高亮 | `expandSidebar()`；`selectBot(botId)` | 侧栏展开成名册且该人设选中，中栏打开其会话 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 名册未加载 | rail 态时 `listBots` 失败 | 头像列位置显示一个警示图标，title「名册加载失败」 | — | 展开后按 UF-601 重试 |
| 无可见 bot | 全部隐藏 | 只显示一个「Bot」图标 | 点击展开 | — |

**界面状态机**：`wide ⇄ rail`（由壳驱动，插件只读 `wide`）。

**入口接线清单**：

- 官方壳的 `wide` owner prop → `BotRegion` 分支渲染 `RailAvatars`
- rail 头像 onClick → `expandSidebar()` + `selectBot`

#### UF-605: 中栏身份条

**前置状态**：中栏打开了一个 bot 会话（`agentPreset` 为 `dsh-bot--<slug>`）。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 打开 bot 会话 | 顶栏标题右侧出现身份 chip（头像 + 名字，working 时绿点） | `header.actions` 条目读 `sessionId` → `byId[sessionId].agentPreset` → 在 `listBots` 里匹配 `presetId` | chip 右侧三枚 pill：「记忆 N」「例程 N」「同事 N」，再右「对话 ▾ {标题}」「新开对话」 |
| 2 | 点「记忆 N」 | pill 激活；浮层从 pill 下方弹出 | `memoryList(botId)` | 浮层列出记忆条目（只读）+「关闭」 |
| 3 | 点「对话 ▾」 | 浮层列出该 bot 全部绑定会话（当前高亮） | `listBotSessions` | 点一条 → `sessions.open` 切换，浮层关 |
| 4 | 点「新开对话」 | 按钮禁用 | `createBotSession` → `open` | 中栏切到新会话，身份条仍在 |
| 5 | 切到普通会话 | 身份条消失 | 条目返回 `null` | 顶栏与官方一致 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| preset 找不到 bot | `agentPreset` 是 `dsh-bot--` 前缀但 `listBots` 无匹配（bot 已删） | 不渲染身份条（BR-607） | — | — |
| 浮层请求失败 | `memoryList` 等返回错误 | 浮层内红字 + 重试 | — | 重试 |
| 名册尚未加载 | `listBots` 未返回 | 身份条不渲染直到数据到 | 订阅 rosterStore | 自动出现 |

**界面状态机**：

```text
hidden（非 bot 会话）──数据匹配──▶ chip.idle ──点 pill──▶ pill.open ──Esc/点外/关闭──▶ chip.idle
```

**入口接线清单**：

- `ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name, id:'dsh-bot:identity', order: 50 }, IdentityBar))`
- pill onClick → 浮层；「对话」项 onClick → `sessions.open`；「新开对话」onClick → `createBotSession` → `open`

#### UF-606: 点小组跳右栏页签

**前置状态**：Bot 模式；名册含小组「编辑室」；better-sidebar 已加载。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点「编辑室」行 | 行选中态 | `betterSidebar.activateTab('dsh-bot:sessions')`；iframe 就绪后 `postMessage({ type:'dsh-bot:select-group', groupId }, origin)` | 右栏「DSH Bot」页签激活，iframe 工作台选中「编辑室」房间；中栏不变 |
| 2 | — | 小组未读归零 | iframe 工作台自身 markRead 逻辑 | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| better-sidebar 缺席 | `ctx.get('betterSidebar')` undefined | 行下方灰字「需要右栏 DSH Bot 页签」 | 不 postMessage | 无（宿主组合问题） |
| iframe 未就绪 | 页签刚打开，iframe 还没 load | 无 | 消息缓存到 `load` 后重发一次（最多 8s） | 超时放弃，行下方灰字「工作台未就绪，请再点一次」 |

**界面状态机**：`idle → activating → done | unavailable`。

**入口接线清单**：

- 小组行 onClick → `openGroup(groupId)`（activateTab + postMessage）
- `workbench-ui/src/App.tsx` 增加 `message` 监听 `dsh-bot:select-group` → 选中该小组（接收端接线）

#### UF-607: 未读与已读

**前置状态**：Bot 模式；「运维夜班」有例程；名册显示其 unread=0。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 用 `dsh-rpc.sh` / curl 触发 `routineRunNow` 或 `sendToPeer` 让该 bot 说话 | — | SSE `/dsh-bot/events` 推送 → 重拉 `listBots` | 「运维夜班」行出现未读徽章「1」，预览更新为最后一句 |
| 2 | 点该行 | 选中 + 徽章消失 | `markRead(botId)` 后重拉 | 徽章归零，中栏打开会话 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| SSE 断开 | `EventSource` onerror | 无提示 | 退回 2s 轮询 `listBots`（BR-612） | SSE 重连成功后停轮询 |
| markRead 失败 | RPC 非 ok | 徽章保留，console.warn | — | 下次点击再试 |

**界面状态机**：`unread(n) ──说话──▶ unread(n+1) ──点开──▶ unread(0)`。

**入口接线清单**：

- `roster-rpc.ts` 订阅 `/dsh-bot/events`（`EventSource`）→ `refresh()`
- 名册行 onClick → `markRead`

#### UF-608: 在左栏新建 / 编辑 / 删除人设与小组

**前置状态**：Bot 模式，名册就绪；名册含 protected 的「DSH Bot」、普通人设「旧助手」、小组「编辑室」。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点名册头部「+ 新建人设」 | `shell.overlay` 弹出模态：遮罩 + 表单（名字 / 人设 / 头像 emoji+颜色 / 可选模型），焦点落在「名字」 | — | 背后官方壳不可点 |
| 2 | 填名字「左栏测试」+ 人设文本，点「保存」 | 保存按钮 loading/禁用，字段只读 | `createBot({ name, persona, avatar })` | 成功：模态关闭，名册刷新出现「左栏测试」并选中，中栏不变（未自动开会话） |
| 3 | 在「左栏测试」行 ⋯ → 「编辑人设」 | 同一模态，字段预填 | `updateBot` | 成功后行名字/头像即时更新 |
| 4 | ⋯ → 「删除人设」 | 确认框「删除「左栏测试」？会删掉这个人设和它绑定的对话」 | — | — |
| 5 | 点「删除」 | 按钮禁用 | `deleteBot(id)` | 行消失；若它是选中项，选中转到第一可见行；中栏不动 |
| 6 | 点「+ 新建小组」 | 模态：名字 + 成员多选（勾选框列出可见人设） | — | 少于 2 人时「保存」禁用并提示「小组至少两名成员」 |
| 7 | 勾 2 人保存 | loading | `createGroup({ name, memberIds })` | 名册出现小组行（马赛克头像）并选中 |
| 8 | 小组行 ⋯ → 「编辑成员」/「删除小组」 | 同形态模态 / 确认框「会删掉小组和房间记录，成员人设和他们的私聊都会保留」 | `updateGroup` / `deleteGroup` | 相应更新 |
| 9 | 按 Esc 或点遮罩 | 模态关闭，表单内容丢弃 | — | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 校验失败 | 名字或人设为空 / 小组成员 <2 | 字段下红字，保存禁用 | 不发请求 | 补填 |
| RPC 失败 | `createBot` 等返回 `ok:false`（如名字重复 `invalid-input`） | 模态内顶部红字显示 `error.message`，表单保留可改 | console.warn | 改后再保存 |
| 删除受保护 | 对 DSH Bot 调 `deleteBot`（菜单本不显示，防御性） | 确认框内红字「the default DSH Bot cannot be deleted」 | host 返回 `bot-protected` | 关闭 |
| 网关不可达 | fetch 抛错 | 模态内红字「网关不可达」+ 重试 | — | 重试 |

**界面状态机**：

```text
closed ──打开──▶ editing ──保存──▶ submitting ──ok──▶ closed(+名册刷新/选中)
                    ▲                  │
                    └──────error（红字，表单保留）
confirm: closed ──删除项──▶ confirming ──确认──▶ deleting ──ok──▶ closed(+选中转移)
                                                  └──error──▶ confirming(红字)
```

**入口接线清单**：

- 名册头部「+ 新建人设」「+ 新建小组」onClick → `openOverlay({ kind:'create-bot' | 'create-group' })`
- ⋯ 菜单「编辑人设」「删除人设」「编辑成员」「删除小组」→ `openOverlay(...)`
- 身份条 chip / 「人设」浮层「编辑人设」→ `openOverlay({ kind:'edit-bot', id })`（UF-610）
- `ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name:'shell.overlay', id:'dsh-bot:overlay', order: 50 }, OverlayHost))`；`OverlayHost` 订阅 overlayStore，无内容时返回 null（保持层 click-through）

#### UF-609: 关系图与新开房间

**前置状态**：Bot 模式；小组「编辑室」（小北 + 审查官）、「校对组」（审查官 + DSH Bot）；better-sidebar 已加载。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点名册头部「关系图」 | `shell.overlay` 弹出关系图卡（`graphCard` 尺度：≤520×420 居中） | 由 `groups` + `peerLog` 计算节点与边 | 可见 bot 为节点，同组虚线、有过传话实线；底部图例「编辑室：小北 · 审查官；校对组：…」 |
| 2 | 点节点「诗人小北」 | 卡关闭 | `selectBot('poet')`（BR-605） | 名册选中小北并打开其会话 |
| 3 | 选中「编辑室」小组行 | 下挂「+ 新开房间」 | — | — |
| 4 | 点「+ 新开房间」 | 按钮禁用 | `createGroupSession(groupId)` → `activateTab('dsh-bot:sessions')` → postMessage `{ type:'dsh-bot:select-group', groupId, roomId }` | 右栏页签选中该小组的新房间；中栏不变 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 无小组 | `groups` 为空 | 关系图卡显示「还没有小组，节点之间没有连线」+ 「新建小组」按钮 | — | 进 UF-608 |
| 新开房间失败 | `createGroupSession` 非 ok | 行下红字 + 重试 | — | 重试 |
| better-sidebar 缺席 | 见 UF-606 | 房间已建但行下灰字「需要右栏 DSH Bot 页签」 | — | 无 |

**界面状态机**：`graph: closed ⇄ open`；`room: idle → creating → jumped | error`。

**入口接线清单**：

- 名册头部「关系图」onClick → `openOverlay({ kind:'graph' })`
- 关系图节点 onClick → `closeOverlay()` + `selectBot`
- 小组行下挂「+ 新开房间」onClick → `createGroupSession` → `openGroup(groupId, roomId)`（复用 Task 11）

#### UF-610: 悬停预览与人设浮层

**前置状态**：Bot 模式名册就绪；中栏打开审查官会话。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 鼠标停在「代码审查官」行 400ms | 行右侧浮出预览卡（`rosterPreviewCard` 尺度，220px） | 读 rosterStore 已有数据，不发请求 | 「grok-4.6 · 例行 1 · 会话 2 · PR #142 有两处要你决定」 |
| 2 | 移到 ⋯ 按钮并点击 | 卡不挡点击（`pointer-events:none`）；菜单打开时卡收起 | — | 菜单正常 |
| 3 | 移开行 120ms | 卡收起 | — | — |
| 4 | 停在小组行 | 卡：「小组 · 2 人 · 第 1 轮 · 最后一句」 | — | — |
| 5 | 中栏点身份条「人设」pill | 浮层：persona 文本 + `preset dsh-bot--reviewer` + 「编辑人设」 | 读 rosterStore | — |
| 6 | 点「编辑人设」或点身份 chip | 浮层关，UF-608 编辑模态打开并预填 | — | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| rail 态 / 触屏 | `wide === false` 或 `pointer: coarse` | 不出预览卡（头像 `title` 兜底） | — | — |
| 名册数据缺字段 | 旧 bot 无 `modelOverride` | 模型标签显示「默认模型」，其余照常 | — | — |
| 侧栏底部空间不足 | 行靠近视口底 | 卡向上翻转显示 | 位置计算 | — |

**界面状态机**：`idle ──hover 400ms──▶ shown ──leave 120ms / 菜单打开──▶ idle`。

**入口接线清单**：

- 名册行 `onPointerEnter/Leave` → hover 计时器 → `previewId`
- 身份条「人设」pill onClick → `personaPanel`；「编辑人设」/ chip onClick → `openOverlay({ kind:'edit-bot', id })`

#### UF-611: ⌘K 命令面板

**前置状态**：官方前台任一模式，焦点在页面上（不在 iframe、不在输入框）。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 按 ⌘K（Win/Linux Ctrl+K） | `shell.overlay` 弹出面板（560px、顶距 16vh），输入框获焦 | `openOverlay({ kind:'palette' })` | 列表：可见人设 / 小组 / 当前人设的绑定会话 /「切到 Bot 模式」或「切到会话模式」 |
| 2 | 输入「审」 | 列表即时过滤（名字 + 预览） | — | 只剩「代码审查官」及其会话 |
| 3 | ↓ 到会话项，↵ | 面板关闭 | 若当前是会话模式先 `mode.set('bot')`；`sessions.open(id)` | 左栏 Bot 名册选中审查官，中栏打开该会话 |
| 4 | 再按 ⌘K，选「切到会话模式」↵ | 面板关闭 | `mode.set('sessions')` | 官方树回来 |
| 5 | 按 Esc 或点遮罩 | 面板关闭 | — | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 焦点在 iframe 内 | 右栏工作台 iframe 获焦时按 ⌘K | 宿主面板不出现；iframe 自己的 ⌘K 出现 | 监听器判 `activeElement.tagName === 'IFRAME'` 放行 | 点回官方壳再按 |
| 焦点在输入框 | 官方 composer 内按 ⌘K | 不触发 | 放行 | — |
| 空结果 | 过滤词无匹配 | 「没有匹配」 | — | 改词 |
| 名册未加载 | `listBots` 未返回 | 面板只列「切模式」项 + 「名册加载中…」 | — | 自动补齐 |

**界面状态机**：`closed ──⌘K──▶ open(filter, sel) ──↵──▶ closed(+动作) / ──Esc──▶ closed`。

**入口接线清单**：

- `apply` 里 `ctx.effect(() => window.addEventListener('keydown', onKey))`（随 fiber 卸载）
- 面板项 onClick / ↵ → `selectBot` / `openGroup` / `sessions.open` / `mode.set`

#### UF-612: 「需要你决定」红徽章与「例程触发」标签

**前置状态**：Bot 模式；审查官会话正在跑一个要审批的工具；运维夜班有 06:00 例程。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 审查官会话进入审批等待 | 名册审查官行徽章变红「@」；底栏「Bot」行红点 | `ctx.sessions.list` 的 `byId[id].pendingInteraction === 'approval'` 变化触发重渲染 | 与官方侧栏琥珀点同步出现 |
| 2 | 点该行 → 中栏批准 | 红「@」消失，回到数字未读（或无） | `pendingInteraction` 清空 | — |
| 3 | 用 RPC 触发运维夜班的 `routineRunNow` | 名册该行未读 +1 | 例程 wake 写入其会话 | — |
| 4 | 点该行打开会话 | 中栏例程那轮的尾部出现「例程触发 · 早间巡检」小标签 | turnTail `select` 命中 `origin:'routine'` 的 history 项 | 其他轮无标签 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| seq 不同源（ASM-608 证伪） | history seq 与官方 turn seq 对不上 | 标签不出现 | Task 19 改为 `createdAt` 时间窗匹配 | — |
| 同一 bot 多会话 pending | 两条会话都在等 | 红「@」一个，悬停预览卡列「2 条待决定」 | — | 逐条处理 |
| history 未加载 | 刚打开会话 | 标签延迟到 history 到达后出现 | store 更新触发链重选 | 自动 |

**界面状态机**：`badge: number ──pending──▶ mention(@) ──resolved──▶ number`；`tail: unmounted ──select 命中──▶ shown`。

**入口接线清单**：

- `BotRoster` / `ModeFooterAction` 订阅 `ctx.sessions.list`（`useSyncExternalStore`）计算 pending 集合
- `ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name, select }, RoutineTurnTail))`

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-601 | better-sidebar「DSH Bot」页签（id `dsh-bot:sessions`，iframe `/dsh-bot/ui`）与 iframe 工作台功能不变 | BR-608 / UF-606 | `./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/tab.spec.tsx packages/workbench-ui/tests` 通过；真机页签仍可打开 |
| INV-602 | `dsh-bot-host` RPC 契约不变：不改任何现有 `case` 的入参/出参，本包不新增 host 路由 | 全部 | `git diff --stat packages/dsh-bot-host/src` 为空（本包） |
| INV-603 | `ui-dsh-bot` 客户端 bundle 纯度：无跨插件 value import；`pnpm --filter ui-dsh-bot run build` 通过 purity 插件 | BR-601 / BR-606 | build 命令 |
| INV-604 | 工作区在飞未提交改动（session-nav：DshBotTab/session-jump/App 等）零丢失；本包不 `stash` / `checkout` / `restore` | 全部 | 开工与收尾各一次 `git status --short` 对比 |
| INV-605 | 官方 npm 包（`env/profiles/gb/node_modules/@deepseek-ai/*`）零改动 | BR-601 | `git status` 不含 env/profiles（本就 ignore）+ 不写入该目录 |
| INV-606 | 现有 `pnpm run typecheck` 与 `pnpm test` 保持全绿 | 全部 | 两条命令 |
| INV-607 | 会话模式下官方左栏 DOM 与未装本插件时一致（除底栏多一行「Bot」） | BR-602 | UF-602 截图对照 `docs/prototypes/real/pw-landing.png` |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-601 | log + screenshot | Task 1 校准：ASM-601~605 逐条结论、`ctx.slots.entries('sidebar.workspaces')` 输出、遮蔽/恢复两张截图 | `evidence/phase-0/calibration.md`、`evidence/phase-0/shadow-on.png`、`evidence/phase-0/shadow-off.png` |
| EVD-602 | screenshot + console | UF-601 名册态、刷新后保持；UF-602 官方树恢复 | `evidence/UF-601/bot-mode.png`、`evidence/UF-601/after-reload.png`、`evidence/UF-601/load-error.png`、`evidence/UF-602/sessions-restored.png`、`evidence/UF-602/console.log` |
| EVD-603 | screenshot + api | UF-603 打开已有会话、新建会话、创建失败红字 | `evidence/UF-603/open-existing.png`、`evidence/UF-603/create-new.png`、`evidence/UF-603/create-failed.png`、`evidence/UF-603/createBotSession.json` |
| EVD-604 | screenshot | UF-604 rail 头像列、点头像展开 | `evidence/UF-604/rail.png`、`evidence/UF-604/expanded.png` |
| EVD-605 | screenshot | UF-605 身份条、记忆浮层、对话切换、普通会话无身份条 | `evidence/UF-605/identity-bar.png`、`evidence/UF-605/memory-popover.png`、`evidence/UF-605/plain-session.png` |
| EVD-606 | screenshot | UF-606 右栏页签激活并选中小组；缺席提示 | `evidence/UF-606/group-jump.png`、`evidence/UF-606/no-sidebar.png` |
| EVD-607 | screenshot + log | UF-607 徽章出现与归零；SSE 断开轮询日志 | `evidence/UF-607/unread.png`、`evidence/UF-607/read.png`、`evidence/UF-607/poll-fallback.log` |
| EVD-608 | log | 各 Phase 命令级输出（typecheck / vitest / build） | `evidence/phase-{N}/commands.log` |
| EVD-609 | screenshot + api | UF-608 新建人设模态、保存后选中、删除确认、校验红字、RPC 失败红字 | `evidence/UF-608/create-bot.png`、`evidence/UF-608/created-selected.png`、`evidence/UF-608/delete-confirm.png`、`evidence/UF-608/validation.png`、`evidence/UF-608/rpc-error.png`、`evidence/UF-608/createBot.json` |
| EVD-610 | screenshot | UF-609 关系图卡、点节点后选中、新开房间后右栏、无小组空态 | `evidence/UF-609/graph.png`、`evidence/UF-609/node-select.png`、`evidence/UF-609/new-room.png`、`evidence/UF-609/no-groups.png` |
| EVD-612 | screenshot | UF-611 面板、过滤、iframe 获焦不触发 | `evidence/UF-611/palette.png`、`evidence/UF-611/filtered.png`、`evidence/UF-611/iframe-focus-no-palette.png` |
| EVD-613 | screenshot + log | UF-612 红「@」、处理后回数字、例程标签、seq 核对日志 | `evidence/UF-612/mention-badge.png`、`evidence/UF-612/badge-cleared.png`、`evidence/UF-612/routine-tag.png`、`evidence/UF-612/seq-check.log` |
| EVD-611 | screenshot | UF-610 预览卡、小组预览卡、人设浮层、rail 无卡 | `evidence/UF-610/hover-bot.png`、`evidence/UF-610/hover-group.png`、`evidence/UF-610/persona-panel.png`、`evidence/UF-610/rail-no-card.png` |

### 2.6 角色与权限矩阵

单一角色（本机用户），无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 网关重启 | Bot 模式名册就绪 | 杀 :3084 再 boot | 名册进 error 态显示重试；网关回来点重试恢复；官方壳自身重连不受影响 | EVD-602 |
| 空数据 | 删光 bots.json | 切 Bot 模式 | 空态文案 + 新建入口，不报错 | EVD-602 |
| 热重载 | Bot 模式 | 重建 ui-dsh-bot 并触发 HMR / 重载页面 | 左栏只有一份 region，无双分段条；切会话模式官方树回来 | EVD-601 |
| 旧数据兼容 | localStorage 无 `dsh-bot:sidebar-mode` | 首次打开 | 缺省会话模式，与未装插件一致 | EVD-602 |
| 重复点击 | 快速连点「新开对话」 | — | 只创建一段（按钮禁用期间忽略） | EVD-603 |
| 权限不足 | 不适用：本机 loopback 单用户，无权限体系 | — | — | — |

### 2.8 非目标

- 不在同一组件内渲染官方会话树（`renderSlot` 不允许，且 `WorkspaceBrowser` 不可 import）；会话模式 = 注销遮蔽。
- 不改官方「+ 新会话」行为，不拦截 `startSession`。
- 不把小组房间搬进官方中栏，不把房间做成官方 session。
- 不改 `dsh-bot-host` RPC 契约，不新增 host 路由。
- 不实现名册拖拽排序（右键菜单里的置顶/移组沿用 `updateBotLayout` 即可）。
- ⌘K 面板不做原型里的「分镜」项；「@」徽章只表达官方 `pendingInteraction`（审批 / 计划评审 / 提问），不做小组内成员互相 @ 的提及（host 无此数据）。
- 不动官方 npm 包与邻仓。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
官方左栏 ─ sidebar.workspaces ─ ui-workspace WorkspaceBrowser（会话树）
官方中栏 ─ conversation（对话/轨迹/composer）
右栏 better-sidebar ─ 「DSH Bot」页签 ─ iframe /dsh-bot/ui ─ workbench-ui（名册 + 自绘对话 + 小组房间）
ui-dsh-bot client: apply() → registerTab(iframe) 仅此

After:
官方左栏 ─ sidebar.workspaces ─ [sessions 模式] WorkspaceBrowser（官方，未动）
                               [bot 模式]      BotRegion(priority -1)：分段条 + BotRoster / RailAvatars
         ─ sidebar.footer.action ─ 「Bot」开关行（dsh-bot:mode）
官方中栏 ─ conversation（官方，未动）
         ─ conversation.session.header.actions ─ IdentityBar（仅 bot 会话）
右栏 better-sidebar ─ 「DSH Bot」页签 iframe（不变；新增接收 dsh-bot:select-group）
共享：packages/dsh-bot-shared（roster-sections / avatar / session-binding / RPC 类型）← ui-dsh-bot 与 workbench-ui 共用
数据：ui-dsh-bot roster-rpc.ts → POST /dsh-bot/{listBots,listGroups,listBotSessions,createBotSession,markRead,updateBotLayout,memoryList,routineList,peerLog} + GET /dsh-bot/events
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/ui-dsh-bot/src/client/index.ts` | 客户端入口 | `inject` 加 `slots`、`workspaces`；`apply` 增加 sidebar-mode 驱动的 region 注册/注销、footer.action 注册、header.actions 注册；全部经 `ctx.effect` / `ctx.slots.inject` |
| `packages/ui-dsh-bot/src/client/sidebar-mode.ts`（新） | 模式存储 | localStorage `dsh-bot:sidebar-mode` + 可订阅 observable；`setMode` / `getSnapshot` / `subscribe` |
| `packages/ui-dsh-bot/src/client/BotRegion.tsx`（新） | `sidebar.workspaces` 占位组件 | 分段条、loading/error/empty、wide→`BotRoster`，rail→`RailAvatars` |
| `packages/ui-dsh-bot/src/client/BotRoster.tsx`（新） | 名册 | 分组/行/搜索/已隐藏/下挂会话/新开对话/⋯ 菜单/小组跳转 |
| `packages/ui-dsh-bot/src/client/ModeFooterAction.tsx`（新） | 底栏开关 | wide 显示「Bot」+ 总未读；rail 显示图标 |
| `packages/ui-dsh-bot/src/client/IdentityBar.tsx`（新） | 中栏身份条 | chip + 四枚 pill（记忆/例程/同事/人设）+ 对话切换 + 新开对话；非 bot 会话返回 null；chip 点击进编辑模态 |
| `packages/ui-dsh-bot/src/client/OverlayHost.tsx` + `OverlayForms.tsx`（新） | `shell.overlay` 模态层 | 新建/编辑人设、新建小组/编辑成员、删除确认；overlayStore 驱动，空时返回 null |
| `packages/ui-dsh-bot/src/client/RelationshipGraphOverlay.tsx`（新） | 关系图卡 | 节点/边计算沿用 workbench-ui `RelationshipGraph.tsx` 的思路，SVG 自绘，点节点 `selectBot` |
| `packages/ui-dsh-bot/src/client/CommandPalette.tsx`（新） | ⌘K 面板（overlay 的一种 kind） | `window` keydown 监听，焦点在 iframe / 输入框时放行 |
| `packages/ui-dsh-bot/src/client/RoutineTurnTail.tsx`（新） | `conversation.chat.turnTail` 链条目 | `select` 查 history seq 索引，命中才挂载 |
| `packages/ui-dsh-bot/src/client/roster-rpc.ts`（新） | 数据层 | 沿用 `rpc.ts` 的 `observable` + 轮询/SSE 模式；bots/groups/sessions 三个 store |
| `packages/ui-dsh-bot/src/client/locales.ts` | 词条 | 新增 `mode.*` / `roster.*` / `identity.*` zh/en |
| `packages/dsh-bot-shared`（新包） | 共享逻辑 | 从 workbench-ui 迁出 `roster-sections.ts`、`avatar.ts`、`session-binding.ts` 与 `api.ts` 的类型；两侧改 import；无 React、无 CSS |
| `packages/workbench-ui/src/App.tsx` | iframe 工作台 | 新增 `message` 监听 `dsh-bot:select-group` → 选中小组 |
| `README.md` | 文档 | 新增「左栏 Bot 模式」一节 |

### 3.3 三段式定位清单

> 行号只是 hint；漂移时以 symbol + rg anchor 为准。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/ui-dsh-bot/src/client/index.ts` | `export function apply` | `rg "export function apply" packages/ui-dsh-bot/src/client/index.ts` | L56 | 加 region / footer / header 注册 |
| `packages/ui-dsh-bot/src/client/index.ts` | `interface BetterSidebarService` | `rg "interface BetterSidebarService" packages/ui-dsh-bot/src/client/index.ts` | L19 | 补 `activateTab` 鸭子类型 |
| `packages/ui-dsh-bot/src/client/inject.ts` | `export const inject` | `rg "export const inject" packages/ui-dsh-bot/src/client/inject.ts` | L5 | 加 `slots`、`workspaces` |
| `packages/ui-dsh-bot/src/client/rpc.ts` | `export function createRpcDshBot` | `rg "export function createRpcDshBot" packages/ui-dsh-bot/src/client/rpc.ts` | L129 | observable / 轮询 / SSE 模式参照 |
| `packages/ui-dsh-bot/src/client/observable.ts` | `export function observable` | `rg "export function observable" packages/ui-dsh-bot/src/client/observable.ts` | L15 | Task 2 从 rpc.ts 抽出共用 |
| `packages/ui-dsh-bot/src/client/locales.ts` | `export const zh` | `rg "export const zh" packages/ui-dsh-bot/src/client/locales.ts` | L6 | 新词条 |
| `packages/ui-dsh-bot/src/client/tab-id.ts` | `DSH_BOT_SESSIONS_TAB_ID` | `rg "DSH_BOT_SESSIONS_TAB_ID" packages/ui-dsh-bot/src/client/tab-id.ts` | L2 | activateTab 目标 |
| `packages/ui-dsh-bot/src/client/session-jump.ts` | `export function handleJumpMessage` | `rg "export function handleJumpMessage" packages/ui-dsh-bot/src/client/session-jump.ts` | L117 | 反向消息 `dsh-bot:select-group` 参照 |
| `packages/ui-dsh-bot/src/client/DshBotTab.tsx` | `export function DshBotTab` | `rg "export function DshBotTab" packages/ui-dsh-bot/src/client/DshBotTab.tsx` | L113 | 不改；CSS modules 用法参照 |
| `packages/ui-dsh-bot/tsdown.config.ts` | `dsh-client-bundle-purity` | `rg "dsh-client-bundle-purity" packages/ui-dsh-bot/tsdown.config.ts` | L101 | 共享包必须是 workspace 内相对源（`noExternal`） |
| `packages/ui-dsh-bot/tests/tab.spec.tsx` | `describe('DshBotTab'` | `rg "describe\('DshBotTab'" packages/ui-dsh-bot/tests/tab.spec.tsx` | L36 | 新测试形态参照（jsdom 头注释） |
| `packages/workbench-ui/src/roster-sections.ts` | `export function groupRosterItems` | `rg "export function groupRosterItems" packages/workbench-ui/src/roster-sections.ts` | L28 | 迁入共享包 |
| `packages/workbench-ui/src/avatar.ts` | `export function hashAvatarColor` | `rg "export function hashAvatarColor" packages/workbench-ui/src/avatar.ts` | L22 | 迁入共享包 |
| `packages/workbench-ui/src/session-binding.ts` | `export function pickBoundSession` | `rg "export function pickBoundSession" packages/workbench-ui/src/session-binding.ts` | L85 | 迁入共享包 |
| `packages/workbench-ui/src/api.ts` | `export interface WorkbenchBot` | `rg "export interface WorkbenchBot" packages/workbench-ui/src/api.ts` | L64 | 类型迁入共享包，函数留下 |
| `packages/workbench-ui/src/jump.ts` | `JUMP_MESSAGE_TYPE` | `rg "JUMP_MESSAGE_TYPE" packages/workbench-ui/src/jump.ts` | L6 | 消息命名参照 |
| `packages/workbench-ui/src/BotForm.tsx` | `export function BotForm` | `rg "export function BotForm" packages/workbench-ui/src/BotForm.tsx` | L46 | 字段与校验规则参照（不 import） |
| `packages/workbench-ui/src/GroupForm.tsx` | `export function GroupForm` | `rg "export function GroupForm" packages/workbench-ui/src/GroupForm.tsx` | L28 | 成员多选参照 |
| `packages/workbench-ui/src/RelationshipGraph.tsx` | `export function RelationshipGraph` | `rg "export function RelationshipGraph" packages/workbench-ui/src/RelationshipGraph.tsx` | L16 | 节点/边计算参照 |
| `packages/dsh-bot-host/src/groups.ts` | `GROUP_MEMBER_MIN` | `rg "GROUP_MEMBER_MIN" packages/dsh-bot-host/src/groups.ts` | L15 | 小组成员 2–6 校验来源 |
| `packages/workbench-ui/src/api.ts` | `origin?: 'routine'` | `rg "origin\?: 'routine'" packages/workbench-ui/src/api.ts` | L170 | history 项的例程来源标记（BR-620） |
| `packages/workbench-ui/src/CommandPalette.tsx` | `export function CommandPalette` | `rg "export function CommandPalette" packages/workbench-ui/src/CommandPalette.tsx` | L66 | iframe 版 ⌘K 参照（不 import） |
| `docs/prototypes/dsh-bot-left-tab.html` | `.palette {` | `rg "\.palette \{" docs/prototypes/dsh-bot-left-tab.html` | L193 | ⌘K 面板尺寸；`.wakeTag` L150 例程标签样式 |
| `packages/dsh-bot-host/src/bots.ts` | `bot-protected` | `rg "bot-protected" packages/dsh-bot-host/src/bots.ts` | L508 | DSH Bot 不可删的错误码 |
| `docs/prototypes/dsh-bot-left-tab.html` | `.rosterRow {` | `rg "\.rosterRow \{" docs/prototypes/dsh-bot-left-tab.html` | L61 | BR-617 视觉基准（`.seg` L34、`.face` L88、`.unreadBadge` L68、`.rosterPreviewCard` L78、`.floatPanel` L121、`.formPane` L166、`.graphCard` L176、`.confirmBox` L190） |
| `packages/workbench-ui/src/App.tsx` | `export function App` | `rg "export function App" packages/workbench-ui/src/App.tsx` | L99 | 加 select-group 监听（文件有在飞未提交改动，开工时以 anchor 重新定位） |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `case 'listBotSessions'` | `rg "case 'listBotSessions'" packages/dsh-bot-host/src/workbench-routes.ts` | L224 | 只读契约 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `case 'markRead'` | `rg "case 'markRead'" packages/dsh-bot-host/src/workbench-routes.ts` | L330 | 只读契约 |
| `packages/dsh-bot-host/src/bot-events.ts` | `text/event-stream` | `rg "text/event-stream" packages/dsh-bot-host/src/bot-events.ts` | L125 | SSE 端点 |
| `packages/dsh-bot-host/src/marks.ts` | `BOT_MARK_PREFIX` | `rg "BOT_MARK_PREFIX" packages/dsh-bot-host/src/marks.ts` | L34 | `bot:<id>` 约定 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 否 | 只消费现有 `/dsh-bot/*` RPC 与 `/dsh-bot/events`；不新增、不改签名（INV-602） | — |
| 数据 | 否（浏览器侧新增） | 新增 `localStorage['dsh-bot:sidebar-mode']`；沿用 `dsh-bot:last-session:*` | 缺失即缺省 `sessions` |
| 权限 | 否 | 单用户 loopback | — |
| 路由 | 否 | 不新增 HTTP 路由；新增 5 个 slot 注册（`sidebar.workspaces` priority -1、`sidebar.footer.action` id `dsh-bot:mode`、`conversation.session.header.actions` id `dsh-bot:identity`、`shell.overlay` id `dsh-bot:overlay`、`conversation.chat.turnTail` chain 条目）+ 1 个 `window` keydown 监听 | 全部 disposer 化（BR-611） |

### 3.5 官方包只读参照（人工核验）

> 以下文件在 `env/profiles/gb/node_modules/`（被 `.gitignore` 忽略，路径含 `@`），校验脚本的 `--repo` 自动核验够不着，开工时由执行者手动跑一遍下列 rg 命令确认仍命中。全部为只读参照，本包不修改这些文件（INV-605）。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts` | `'sidebar.workspaces'` | `rg "'sidebar.workspaces'" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts` | L39 | owner `{ wide, expandSidebar }` |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` | `ctx.slots.inject("sidebar.workspaces"` | `rg "ctx.slots.inject\(\"sidebar.workspaces\"" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` | L2434 | 注册写法参照 |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js` | `spec.kind === "single"` | `rg "spec.kind === \"single\"" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js` | L794 | 取第一个活条目 |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-ClqxG24t.js` | `lowest renders` | `rg "lowest renders" env/profiles/gb/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-ClqxG24t.js` | 第 56 行 | priority 规则唯一文字依据（升级复查点） |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/service.d.ts` | `agentPreset?: string` | `rg "agentPreset\?: string" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/service.d.ts` | L42 | 身份条判定字段 |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts` | `'conversation.session.header.actions'` | `rg "'conversation.session.header.actions'" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts` | L96 | list / session |
| `env/profiles/gb/node_modules/dsh-better-sidebar/lib/types/client/service.d.ts` | `activateTab(tabId` | `rg "activateTab\(tabId" env/profiles/gb/node_modules/dsh-better-sidebar/lib/types/client/service.d.ts` | L398 | 小组跳转 |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts` | `'conversation.chat.turnTail'` | `rg "'conversation.chat.turnTail'" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts` | L160 | chain / session；owner `{ turn, seq, openFile }`（L440） |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/service.d.ts` | `pendingInteraction?: PendingInteractionStatus` | `rg "pendingInteraction\?: PendingInteractionStatus" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/service.d.ts` | L48 | 红「@」数据源（BR-619）；取值见 `sessions/pending.d.ts` L14 |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/contract/conversation.d.ts` | `interface TurnLocation` | `rg "interface TurnLocation" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/contract/conversation.d.ts` | L67 | `turn / start / end / status` |
| `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/types/client/index.d.ts` | `'shell.overlay'` | `rg "'shell.overlay'" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/types/client/index.d.ts` | L77 | list / root；层本身 click-through，条目自行 opt-in pointer events |

---

## 4. Phase 计划与任务详情

> Phase 依赖链：

```text
P0 校准（Task 1）
 └─▶ P1 左栏模式切换骨架（Task 2-5）
      └─▶ P2 名册内容与打开会话（Task 6-16）
           └─▶ P3 中栏身份条（Task 17-20）
                └─▶ P4 文档、真实场景与收尾（Task 21-23）
```

> 任务状态跟踪：实现任务 18 条 ≥ 8，使用同目录 `tasks.csv`。
> 状态列严格枚举：待开始 / 进行中 / 已完成 / 已阻塞:{原因}；每完成一条立即更新。

### Phase 0: 校准

> 你在哪里：方案建立在 5 个未在真机验证的假设上（ASM-601~605），其中 ASM-602/603 决定方案是否成立。
> 做完之后：五条假设各有结论；证伪任一条即在此阻塞并改方案，不带病进 Phase 1。

### Task 1: 校准 ASM-601~605（priority 遮蔽 spike）

- **关联**：BR-601 / BR-602 / BR-611 / UF-601 / UF-602 / INV-604 / INV-605 / EVD-601（校准任务，UF 只做可达性验证）
- **前置任务**：无（跨包前提 session-nav Task 4 已于 2026-09-08 解除，见 §1.3）
- **风险等级**：P0

**为什么做**：`priority` 遮蔽只见于 SlotCore 实现文字，没有公开 d.ts；方案成立与否取决于真机行为。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/inject.ts`：`export const inject`，`rg "export const inject" packages/ui-dsh-bot/src/client/inject.ts`，L5
- `packages/ui-dsh-bot/src/client/index.ts`：`export function apply`，`rg "export function apply" packages/ui-dsh-bot/src/client/index.ts`，L56
- `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js`：`ctx.slots.inject("sidebar.workspaces"`，L2434（写法参照）

**具体操作**：

1. `git status --short > docs/dsh-bot-left-tab/evidence/phase-0/git-status-before.txt`（INV-604 基线）。
2. `inject` 加 `'slots'`；在 `apply` 里以 `localStorage['dsh-bot:sidebar-mode'] === 'bot'` 为门，`ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({ name: 'sidebar.workspaces', priority: -1, locale: NS }, SpikeRegion))`，`SpikeRegion` 只渲染「Bot 名册（占位）」+ 一个「会话」按钮（点击写 `'sessions'` 并 `location.reload()`）。
3. 同一 effect 内向 `sidebar.footer.action` 注册 `{ id: 'dsh-bot:mode' }` 一行「Bot」（点击写 `'bot'` 并 reload）；向 `conversation.session.header.actions` 注册 `{ id: 'dsh-bot:identity-spike', order: 50 }` 一个组件，`console.info('[spike]', sessionId, ctx.sessions.list.getSnapshot().byId[sessionId]?.agentPreset)` 后返回 null。
4. `pnpm --filter ui-dsh-bot run build`；`kill 60108`（先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份）；`sh env/boot.sh`；浏览器打开 http://127.0.0.1:3084。
5. 逐条记录：ASM-601（无 PENDING、footer 行出现）、ASM-602（点「Bot」后 `[data-slot="sidebar.workspaces"]` 内是占位；截图 `shadow-on.png`）、ASM-603（点「会话」后官方树完整；搜索一次；截图 `shadow-off.png`）、ASM-604（收起侧栏看 footer 行 rail 态）、ASM-605（打开一个 bot 会话与一个普通会话，抄 console 两行）。
6. 在 DevTools 里 `document.querySelectorAll('[data-slot="sidebar.workspaces"]').length` 与 HMR/重载后是否仍为 1，写进 calibration.md。
7. 证实的假设：事实回写 §1.3 并从 §1.4 删行；证伪：按 shared-rules §12 变更，状态板本任务标 `已阻塞:{原因}`，停在此。
8. 去掉 reload 式 spike 代码（Phase 1 会写成正式实现），保留 inject 变更。

**验证**：`ls docs/dsh-bot-left-tab/evidence/phase-0/calibration.md docs/dsh-bot-left-tab/evidence/phase-0/shadow-on.png docs/dsh-bot-left-tab/evidence/phase-0/shadow-off.png` → 三个文件存在，calibration.md 五条 ASM（601~605）各有「证实/证伪」

**Evidence**：`evidence/phase-0/calibration.md`、`evidence/phase-0/shadow-on.png`、`evidence/phase-0/shadow-off.png`、`evidence/phase-0/git-status-before.txt`

**注意事项**：易错点：spike 若注册 priority 0 会直接抛「already has a registration」；禁止 `git stash`/`checkout`（INV-604）；禁止改 `env/profiles/gb/node_modules`（INV-605）。豁免回归:单任务校准 Phase，回归并入本任务验证。

### Phase 1: 左栏模式切换骨架

> 你在哪里：假设已校准，`inject` 已含 `slots`。
> 做完之后：底栏「Bot」↔ 分段条「会话」可以来回切，刷新保持，rail 态不炸；名册区域还是占位。

### Task 2: 模式存储与 region 注册生命周期

- **关联**：BR-601 / BR-602 / BR-603 / BR-611 / UF-601 / UF-602 / INV-603 / INV-606 / EVD-608
- **前置任务**：1
- **风险等级**：P0

**为什么做**：模式是整个方案的开关；注册/注销必须跟 fiber 生命周期绑死，否则留孤儿。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/sidebar-mode.ts`（新建）
- `packages/ui-dsh-bot/src/client/index.ts`：`export function apply`，`rg "export function apply" packages/ui-dsh-bot/src/client/index.ts`，L56
- `packages/ui-dsh-bot/src/client/observable.ts`：`export function observable`，`rg "export function observable" packages/ui-dsh-bot/src/client/observable.ts`，L15（Task 2 从 rpc.ts 抽出）

**具体操作**：

1. 新建 `sidebar-mode.ts`：`type SidebarMode = 'sessions' | 'bot'`；`createSidebarMode(storage = localStorage)` 返回 `{ getSnapshot, subscribe, set }`，key `dsh-bot:sidebar-mode`，非法值按 `'sessions'`；storage 抛错（隐私模式）时退化为内存。
2. 新建 `region-registration.ts`：`bindBotRegion(ctx, mode, Component)`：订阅 mode，`'bot'` 时 `ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({ name: 'sidebar.workspaces', priority: -1, locale: NS, inject: () => ({ open, expandHint }) }, Component))`，保存 disposer；`'sessions'` 时调用 disposer；返回总 disposer（先退订再 dispose）。在 `apply` 里用 `ctx.effect(() => bindBotRegion(...), 'ui-dsh-bot: bot region')` 挂载。
3. `ctx.slots` 缺失（鸭子类型判断）时 `apply` 跳过所有 slot 注册并 `console.info`，保留 better-sidebar 页签。
4. 单测 `tests/sidebar-mode.spec.ts`：缺省 sessions、写读、非法值、storage 抛错；`tests/region-registration.spec.ts`：用假 `slots`（记录 register 参数与 dispose 次数）断言 `priority === -1`、切换两次只剩 0 个活注册、总 disposer 后再 set 不再注册。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/sidebar-mode.spec.ts packages/ui-dsh-bot/tests/region-registration.spec.ts` → 通过；`pnpm run typecheck` → 通过

**Evidence**：`evidence/phase-1/commands.log`

**注意事项**：易错点：`ctx.slots.inject` 的回调本身返回的是 effect disposer，注意与我们自己的 mode disposer 两层；禁止在 `'sessions'` 态保留注册再用 CSS 隐藏（BR-602）。

### Task 3: BotRegion 壳（分段条 / 三态 / wide-rail）

- **关联**：BR-602 / BR-610 / UF-601 / UF-602 / UF-604 / EVD-602 / EVD-604
- **前置任务**：2
- **风险等级**：P1

**为什么做**：这是用户切到 Bot 模式后看到的第一屏，加载/错误/空态与 rail 态都是需求本体。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/BotRegion.tsx`（新建）+ `BotRegion.module.css`（新建，参照 `DshBotTab.module.css`）
- `packages/ui-dsh-bot/src/client/locales.ts`：`export const zh`，`rg "export const zh" packages/ui-dsh-bot/src/client/locales.ts`，L6

**具体操作**：

1. `BotRegion({ wide, expandSidebar, t, ...injected })`：`wide` 为真渲染顶部分段条（「会话」按钮 → `mode.set('sessions')`，「Bot」为 `aria-pressed=true`），下方 `children` 插槽（Task 8 填名册）；`wide` 为假渲染 `RailAvatars` 占位（Task 8 填头像）。
2. 三态：`loading`（「加载名册…」）、`error`（文案 + 「重试」按钮，`data-testid="dsh-bot-region-retry"`）、`empty`（「还没有人设」+ 链接按钮 → `betterSidebar.activateTab`，缺席则隐藏链接）。状态来源为 Task 7 的 rosterStore；本任务先用 props 注入。
3. 词条：`mode.sessions` 会话 / `mode.bot` Bot / `roster.loading` / `roster.error` / `roster.retry` / `roster.empty` / `roster.emptyHint`，zh + en。
4. 单测 `tests/bot-region.spec.tsx`（jsdom）：wide 三态渲染；点「会话」调用 `set('sessions')`；rail 态不渲染分段条。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/bot-region.spec.tsx` → 通过

**Evidence**：`evidence/phase-1/commands.log`

**注意事项**：样式跟宿主 `color-scheme`，字号 16px 基线（`docs/prototypes/real-dsh-ui-survey.md` A9）；分段条尺寸对照原型 `.seg`（L34）——BR-617；禁止硬编码暗色 `#12151a`。

### Task 4: 底栏「Bot」开关行（sidebar.footer.action）

- **关联**：BR-603 / BR-611 / UF-601 / UF-602 / EVD-602
- **前置任务**：2 / 3
- **风险等级**：P1

**为什么做**：会话模式下这是进入 Bot 模式的唯一入口（接线）。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/ModeFooterAction.tsx`（新建）
- `packages/ui-dsh-bot/src/client/index.ts`：`export function apply`，L56

**具体操作**：

1. `ModeFooterAction({ wide, t })`：订阅 mode；wide 渲染一行按钮「Bot」（激活态 `aria-pressed`）+ 总未读徽章（来源 Task 7，先留 props；任一 bot 会话 pending 时徽章变红「@」，BR-619，Task 8 接）；rail 渲染 `DshBotIcon`（已有）+ 红点。onClick：`mode.set(mode === 'bot' ? 'sessions' : 'bot')`（UF-602 toggle 语义）。
2. `apply`：`ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-bot:mode', order: 10, locale: NS }, ModeFooterAction))`，经 `ctx.effect`。
3. 单测 `tests/mode-footer-action.spec.tsx`：点击 toggle；rail 态只有图标。
4. 真机：build → 重启网关 → 点「Bot」看 region 出现、再点回到会话树；F5 保持。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/mode-footer-action.spec.tsx` → 通过；`pnpm --filter ui-dsh-bot run build` → 通过（INV-603）

**Evidence**：`evidence/phase-1/commands.log`、`evidence/phase-1/toggle.png`

**注意事项**：list 槽必须给 `id`，否则 register 抛错；不要把这一行做成「页签」样式（它只是开关，产品面在 region）。

### Task 5: 执行 Phase 1 回归验证

- **关联**：BR-601 / BR-602 / BR-603 / BR-610 / BR-611 / UF-601 / UF-602 / INV-603 / INV-606
- **前置任务**：4

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/ui-dsh-bot/tests && pnpm --filter ui-dsh-bot run build` → 全过；真机 UF-601 步骤 1/5 与 UF-602 步骤 1-3 手动走通并截图

**Evidence**：`evidence/phase-1/phase-summary.md`、`evidence/phase-1/commands.log`

### Phase 2: 名册内容与打开会话

> 你在哪里：模式切换可用，region 是占位。
> 做完之后：名册按分组显示真实人设与小组，点人设在官方中栏打开绑定会话，点小组跳右栏页签，⋯ 菜单可置顶/移组/隐藏/静音/标已读/编辑/删除；头部可新建人设、新建小组、看关系图；悬停出预览卡。

### Task 6: 抽共享逻辑包 dsh-bot-shared

- **关联**：BR-604 / BR-605 / INV-601 / INV-603 / INV-606 / UF-603（NA：纯重构，无用户可见变化；由 UF-603 消费）
- **前置任务**：5
- **风险等级**：P1

**为什么做**：名册分组、头像、绑定会话选择在 iframe 工作台和左栏名册必须一套逻辑；`ui-dsh-bot` 只能打包 workspace 内源码。

**涉及文件与定位**：

- `packages/workbench-ui/src/roster-sections.ts`：`export function groupRosterItems`，L28
- `packages/workbench-ui/src/avatar.ts`：`export function hashAvatarColor`，L22
- `packages/workbench-ui/src/session-binding.ts`：`export function pickBoundSession`，L85
- `packages/workbench-ui/src/api.ts`：`export interface WorkbenchBot`，L64（只迁类型）
- `packages/ui-dsh-bot/tsdown.config.ts`：`dsh-client-bundle-purity`，L101

**具体操作**：

1. 新建 `packages/dsh-bot-shared/`（`package.json` private、`src/index.ts`、tsconfig 继承 base；无 React 依赖）。移入 `roster-sections.ts`、`avatar.ts`、`session-binding.ts` 与 `api.ts` 中的类型（`WorkbenchBot`、`WorkbenchSessionRow`、`ListBotsValue`、`ListGroupsValue`、`CreateBotSessionValue`、`RosterSection` 等）到 `src/`；`api.ts` 的 fetch 函数留在 workbench-ui 并 `import type` 自共享包。
2. workbench-ui 原三个文件改为 `export * from 'dsh-bot-shared/...'` 转发（或直接改 import），对应测试 `roster-sections.spec.ts` / `avatar.spec.ts` / `session-binding.spec.ts` 迁到共享包 `tests/`。
3. `pnpm-workspace.yaml` 已含 `packages/*`，`pnpm install` 让 `ui-dsh-bot` 与 `workbench-ui` 加 `"dsh-bot-shared": "workspace:*"`；`vitest.config.ts` 的 include 已覆盖 `packages/*/tests`。
4. 确认 tsdown `noExternal` 把 `dsh-bot-shared` 内联进 `lib/client.js`（不是 `@deepseek-ai/` 前缀，纯度插件放行）。

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/workbench-ui/tests packages/dsh-bot-shared/tests` → 全过；`pnpm --filter workbench-ui run build && pnpm --filter ui-dsh-bot run build` → 通过

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：零行为变更（INV-601）；`workbench-ui/src/App.tsx` 与 `Persona.tsx` 有在飞未提交改动，只改 import 行，不重排文件（INV-604）。

### Task 7: roster-rpc 数据层（bots / groups / sessions + SSE）

- **关联**：BR-605 / BR-612 / UF-603 / UF-607 / INV-602 / EVD-607
- **前置任务**：6（跨包：先查 session-nav Task 9/10 是否已落地 `overview` / `events`，见 ASM-607）
- **风险等级**：P1

**为什么做**：名册、footer 徽章、身份条共用一份数据源；SSE 触发刷新避免每 2s 轮询。session-nav 正在为 iframe 工作台做同一件事（其 spec §2.1「聚合 overview」+「SSE 推送」，Task 9/10），本包不能再造一套。

**开工前分叉（ASM-607）**：`rg -n "case 'overview'" packages/dsh-bot-host/src/workbench-routes.ts` 有命中 → 走 A：`refresh()` 只打 `POST /dsh-bot/overview`，bots/groups/sessionsByBot 三个 store 全部从它派生；无命中 → 走 B：`listBots` + `listGroups` + 选中 bot 时懒拉 `listBotSessions`，并在 §1.5 登记「overview 落地后切 A」。两条路的 store 形状相同，上层组件不感知。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/roster-rpc.ts`（新建）
- `packages/ui-dsh-bot/src/client/rpc.ts`：`export function createRpcDshBot`，L129（POST `{args}` 约定、`POLL_MS`、SSE 回退参照）
- `packages/dsh-bot-host/src/bot-events.ts`：`text/event-stream`，L125

**具体操作**：

1. `createRosterRpc({ fetch, EventSource })` 返回 `bots`、`groups`、`sessionsByBot` 三个 observable store + 方法 `refresh()`、`sessionsOf(botId)`、`createBotSession(botId)`、`createGroupSession(groupId)`、`markRead(botId)`、`updateBotLayout(input)`、`createBot/updateBot/deleteBot/createGroup/updateGroup/deleteGroup`（Task 12 用）、`memoryList/routineList/peerLog(botId)`、`historyOf(sessionId)`（按会话懒拉 `history`，维护 `seq → item` 索引供 Task 19 的 `select` 同步查表，SSE 刷新）、`setActive(bool)`（Bot 模式或身份条可见时才拉）、`dispose()`。
2. 请求走 `POST /dsh-bot/<method>`，body `{ args }`，与 `rpc.ts` 同 `RpcResult` 折叠；错误进 store 的 `error` 字段。
3. `EventSource('/dsh-bot/events')`：任一事件 → 300ms 去抖 `refresh()`；`onerror` → 关闭并启动 2s 轮询；重连成功后停轮询（沿用 rpc.ts 策略）。
4. 单测 `tests/roster-rpc.spec.ts`：mock fetch 记录 URL/body；SSE 事件触发刷新；error 回退轮询；`markRead` 后本地 unread 立即置 0（乐观更新）。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/roster-rpc.spec.ts` → 通过

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：`rosterSections` 不在 host 路由（§1.3），分组名用 `DEFAULT_ROSTER_SECTIONS` + `updateBotLayout` 响应里的 `sections`；禁止新增 host 路由（INV-602）——`overview` 若缺失也由 session-nav 补，不在本包动 host。

### Task 8: 名册渲染（分组 / 行 / 搜索 / 已隐藏 / rail 头像列）

- **关联**：BR-604 / BR-610 / BR-619 / UF-601 / UF-604 / UF-612 / EVD-602 / EVD-604 / EVD-613
- **前置任务**：7
- **风险等级**：P1

**为什么做**：Bot 模式的主视图。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/BotRoster.tsx`（新建）+ `BotRoster.module.css`
- `packages/ui-dsh-bot/src/client/BotRegion.tsx`（Task 3 产物，接入 store）
- `packages/dsh-bot-shared/src/roster-sections.ts`：`groupRosterItems`（Task 6 迁入后）

**具体操作**：

1. `BotRoster`：头部「人设」+ 搜索框（按名字/预览过滤）；`groupRosterItems(bots ∪ groups)` 按 section 渲染可折叠节（折叠状态存 `localStorage['dsh-bot:roster-folded']`）；行：头像（`hashAvatarColor` + `nameInitial` 或 emoji）/ 名字 / 预览（`rowPreview`）/ 未读徽章（`muted` 时灰；该 bot 任一绑定会话 `pendingInteraction` 有值时改红色「@」，BR-619）/ 会话数；小组行画马赛克头像。pending 集合来自 `useSyncExternalStore(ctx.sessions.list)` 与 `sessionsByBot` 的交集。
2. 底部「已隐藏 N 个」可展开，行内「取消隐藏」→ `updateBotLayout({ bots:[{id, hidden:false}] })`。
3. `RailAvatars`：可见 bot 头像竖列 + 未读红点；onClick → `expandSidebar()` 后调 `onSelect(botId)`（Task 9）。
4. `BotRegion` 接 rosterStore 驱动三态；`ModeFooterAction` 接总未读。
5. 单测 `tests/bot-roster.spec.tsx`：分组渲染顺序、隐藏进底部、搜索过滤、rail 只画头像。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/bot-roster.spec.tsx packages/ui-dsh-bot/tests/bot-region.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/commands.log`、`evidence/phase-2/roster.png`

**注意事项**：空态「在右栏 DSH Bot 页签新建」与小组跳转都要用到 `betterSidebar.activateTab`，该服务只能在 `ctx.inject(['betterSidebar'], …)` 回调内取到，再经 props/闭包传给 BotRegion——slot 组件渲染期直接读 `client.betterSidebar` 会抛 `cannot get property "betterSidebar" without inject`（Phase 1 真机已踩）；280px 宽度下名字/预览要 ellipsis；不要给每个 bot 都展开会话（BR-604）；行/头像/徽章尺寸对照原型 `.rosterRow`（L61）`.face`（L88）`.unreadBadge`（L68）——BR-617；头部三个按钮（关系图 / 新建人设 / 新建小组）的接线在 Task 12 / 13，本任务先留位。

### Task 9: 点人设打开绑定会话 / 下挂会话 / 新开对话 / 标已读

- **关联**：BR-605 / BR-609 / BR-612 / UF-603 / UF-607 / EVD-603 / EVD-607
- **前置任务**：8
- **风险等级**：P0

**为什么做**：这是「对话交还官方中栏」的核心接线。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/BotRoster.tsx`（Task 8）
- `packages/dsh-bot-shared/src/session-binding.ts`：`pickBoundSession` / `readLastSession` / `writeLastSession`
- `packages/ui-dsh-bot/src/client/session-jump.ts`：`export function jumpToSession`，`rg "export function jumpToSession" packages/ui-dsh-bot/src/client/session-jump.ts`，L36

**具体操作**：

1. `selectBot(botId)`：行进 `resolving`；`sessionsOf(botId)`；`pickBoundSession(readLastSession(botId), rows)` → 有则 `jumpToSession(ctx.sessions, id)`；无则 `creating` → `createBotSession(botId)` → open；成功 `writeLastSession` + `markRead(botId)` + 写 `localStorage['dsh-bot:last-bot']`；失败进 `error` 行内红字 + 「重试」（保持选中）。
2. 选中行下方渲染 ≤8 段绑定会话（`nestedSessionSlice`），当前会话高亮（读 `ctx.sessions.list.getSnapshot().current`），点击 → open + `writeLastSession`；末行「+ 新开对话」→ `createBotSession` → open，按钮请求期间禁用（2.7 重复提交）。
3. Bot 模式启动时若 `dsh-bot:last-bot` 命中则默认选中（不自动 open，避免抢中栏）。
4. 单测 `tests/bot-roster-select.spec.tsx`：三分支（命中 last / 回退最新 / 创建）、失败红字与重试、连点只创建一次、`sessions.open` 缺失提示。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/bot-roster-select.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/commands.log`、`evidence/phase-2/open-session.png`

**注意事项**：不要拦截官方「+ 新会话」（BR-609）；`sessions.open` 用 `jumpToSession` 的 open-only 语义，不要走 `openSubagent`（session-jump.ts 注释 ASM-401）。

### Task 10: 行菜单 ⋯（置顶 / 移组 / 标已读 / 隐藏 / 静音）

- **关联**：BR-604 / BR-612 / UF-601 / EVD-602
- **前置任务**：8
- **风险等级**：P2

**为什么做**：原型分镜 3 的名册操作；数据面 `updateBotLayout` 已存在。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/BotRoster.tsx`
- `packages/workbench-ui/src/api.ts`：`export function updateBotLayout`，`rg "export function updateBotLayout" packages/workbench-ui/src/api.ts`，L483（入参形状参照）

**具体操作**：

1. 行 hover 出 ⋯ 按钮；菜单项：置顶/取消置顶、移到「工作/生活」、标已读、隐藏、静音/取消静音；「编辑人设」「删除人设」两项由 Task 12 接线（本任务先留菜单位，`protected` bot 不显示删除）。
2. 每项调用 `updateBotLayout` 或 `markRead`，乐观更新后以响应为准；失败 toast 式行内提示 2.4s。
3. Esc / 点外关闭菜单。
4. 单测 `tests/bot-roster-menu.spec.tsx`：各项调用参数；失败回滚。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/bot-roster-menu.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：菜单要在 280px 内不溢出；隐藏当前选中 bot 时选中态转到第一可见行。

### Task 11: 点小组跳右栏「DSH Bot」页签并选中

- **关联**：BR-608 / UF-606 / INV-601 / EVD-606
- **前置任务**：8
- **风险等级**：P1

**为什么做**：小组没有官方中栏座位，名册里的小组行必须有去处。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/BotRoster.tsx`
- `packages/ui-dsh-bot/src/client/index.ts`：`interface BetterSidebarService`，L19（加 `activateTab?`）
- `packages/ui-dsh-bot/src/client/DshBotTab.tsx`：`export function DshBotTab`，L113（拿 iframe `contentWindow`）
- `packages/workbench-ui/src/App.tsx`：`export function App`，`rg "export function App" packages/workbench-ui/src/App.tsx`，L99（文件有在飞改动，以 anchor 为准）
- `packages/workbench-ui/src/jump.ts`：`JUMP_MESSAGE_TYPE`，L6（命名参照）

**具体操作**：

1. 共享包新增常量 `SELECT_GROUP_MESSAGE_TYPE = 'dsh-bot:select-group'`。
2. `openGroup(groupId)`：`betterSidebar?.activateTab(DSH_BOT_SESSIONS_TAB_ID)`；通过一个模块级 `workbenchFrame` 引用（`DshBotTab` 挂载时登记 `contentWindow`，卸载清空）`postMessage({ type, groupId }, location.origin)`；iframe 未就绪则等待 `load` 后重发一次（≤8s），超时行内灰字提示；`betterSidebar` 缺席行内灰字「需要右栏 DSH Bot 页签」。
3. `workbench-ui/src/App.tsx` 增加 `window.addEventListener('message')`：校验 `event.origin === location.origin` 且 type 匹配 → 选中该小组（沿用 App 现有选中逻辑）。
4. 单测：`tests/bot-roster-group.spec.tsx`（activateTab 调用、postMessage 载荷、缺席提示）；`packages/workbench-ui/tests/app.spec.tsx` 增一例（收到消息选中小组）。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/bot-roster-group.spec.tsx packages/workbench-ui/tests/app.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：`App.tsx` 有未提交改动，改动限于新增监听 hook，先 `rg "export function App" packages/workbench-ui/src/App.tsx` 重新定位（INV-604）。

### Task 12: shell.overlay 模态层：新建 / 编辑 / 删除人设与小组 + 名册头部按钮

- **关联**：BR-611 / BR-613 / BR-614 / BR-617 / UF-608 / INV-602 / INV-603 / EVD-609
- **前置任务**：8 / 10
- **风险等级**：P1

**为什么做**：原型分镜 0 / 3 的人设与小组管理在左栏就能做完，不必跑去右栏 iframe；`shell.overlay` 是官方留给浮层的 list 槽，是唯一不占中栏又能盖住全页的合法座位。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/OverlayHost.tsx` + `OverlayForms.tsx` + `OverlayForms.module.css`（新建）
- `packages/ui-dsh-bot/src/client/index.ts`：`export function apply`，L56
- `packages/ui-dsh-bot/src/client/BotRoster.tsx`（Task 8 / 10 产物：头部按钮、菜单项）
- `packages/workbench-ui/src/BotForm.tsx`：`export function BotForm`，`rg "export function BotForm" packages/workbench-ui/src/BotForm.tsx`，L46（字段与校验参照，不 import）
- `packages/workbench-ui/src/GroupForm.tsx`：`export function GroupForm`，L28
- `packages/dsh-bot-host/src/bots.ts`：`bot-protected`，L508
- `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-layout/lib/types/client/index.d.ts`：`'shell.overlay'`，L77

**具体操作**：

1. `overlay-store.ts`：observable `{ kind: null | 'create-bot' | 'edit-bot' | 'create-group' | 'edit-group' | 'confirm-delete' | 'graph', id?, busy, error }` + `openOverlay/closeOverlay`。
2. `apply`：`ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dsh-bot:overlay', order: 50, locale: NS, inject: () => ({ overlay, roster }) }, OverlayHost))`。`OverlayHost` kind 为 null 时返回 `null`（层保持 click-through）；否则渲染遮罩 + 卡片，根元素 `pointer-events: auto`，`role="dialog"`，Esc / 点遮罩关闭，打开时焦点进首字段，关闭时焦点回触发按钮。
3. `OverlayForms`：人设表单（名字 / 人设 / 头像 emoji + 颜色 / 可选模型，字段与 `BotForm.tsx` 一致）、小组表单（名字 + 可见人设勾选，2–6 人，来源 `GROUP_MEMBER_MIN/MAX`）、删除确认（文案按 BR-614 分人设/小组）。提交调 `roster-rpc` 的 `createBot/updateBot/deleteBot/createGroup/updateGroup/deleteGroup`（Task 7 补这六个方法）；成功 → `closeOverlay` + `refresh()` + 选中新项；失败 → 卡内红字保留表单。
4. `BotRoster` 头部加「+ 新建人设」「+ 新建小组」（「关系图」留 Task 13）；⋯ 菜单加「编辑人设」「删除人设」（`protected` 不显示删除）、小组菜单「编辑成员」「删除小组」；删除当前选中项后选中转到第一可见行。
5. 样式按 BR-617 对照原型 `.formPane` / `.confirmBox` / `.checks`。
6. 单测 `tests/overlay-forms.spec.tsx`：kind null 渲染 null；校验禁用保存；成功关闭并调 refresh；RPC 失败红字保留；Esc 关闭；删除受保护红字。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/overlay-forms.spec.tsx` → 通过；`pnpm --filter ui-dsh-bot run build` → 通过

**Evidence**：`evidence/phase-2/commands.log`、`evidence/phase-2/overlay-form.png`

**注意事项**：list 槽必须给 `id`；`OverlayHost` 空态一定返回 null，否则整页被透明层挡住（层是 click-through，但条目不是）；不要在中栏画表单（BR-613）。

### Task 13: 关系图 overlay + 小组「+ 新开房间」

- **关联**：BR-608 / BR-613 / BR-617 / BR-618 / UF-609 / EVD-610
- **前置任务**：11 / 12
- **风险等级**：P2

**为什么做**：原型分镜 9 与分镜 3 的小组下挂动作。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/RelationshipGraphOverlay.tsx`（新建）
- `packages/workbench-ui/src/RelationshipGraph.tsx`：`export function RelationshipGraph`，L16（节点/边算法参照）
- `packages/ui-dsh-bot/src/client/BotRoster.tsx`（小组行下挂）
- `packages/dsh-bot-host/src/workbench-routes.ts`：`case 'createGroupSession'`，`rg "case 'createGroupSession'" packages/dsh-bot-host/src/workbench-routes.ts`，L243

**具体操作**：

1. `openOverlay({ kind:'graph' })`：可见 bot 均匀布环（原型 `graphHtml` 的极坐标布法），同组两两虚线，`peerLog` 里有过传话实线；底部图例列各小组成员；无小组时空态 + 「新建小组」按钮 → `create-group`。点节点 → `closeOverlay()` + `selectBot(id)`。
2. `BotRoster` 头部加「关系图」按钮；小组行选中后下挂「+ 新开房间」→ `createGroupSession(groupId)` → `openGroup(groupId, roomId)`（Task 11 的 `openGroup` 增加可选 `roomId`，postMessage 载荷带上）；`workbench-ui/src/App.tsx` 的 select-group 监听按 `roomId` 选房间。
3. 单测 `tests/relationship-graph-overlay.spec.tsx`（边数、点节点回调、空态）；`tests/bot-roster-group.spec.tsx` 增「新开房间」一例。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/relationship-graph-overlay.spec.tsx packages/ui-dsh-bot/tests/bot-roster-group.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/commands.log`、`evidence/phase-2/graph.png`

**注意事项**：SVG 用 `currentColor` 与宿主主题变量；`graphCard` 尺寸对照原型 L176。

### Task 14: 悬停预览卡

- **关联**：BR-615 / BR-617 / UF-610 / EVD-611
- **前置任务**：8
- **风险等级**：P2

**为什么做**：原型分镜 3 的悬停信息密度，让 280px 左栏不用展开也能看到模型 / 例程数 / 会话数。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/BotRoster.tsx`
- `docs/prototypes/dsh-bot-left-tab.html`：`.rosterPreviewCard {`，`rg "\.rosterPreviewCard \{" docs/prototypes/dsh-bot-left-tab.html`，L78（尺寸）；`hoverTimer = setTimeout`，L1410（400ms / 120ms）

**具体操作**：

1. 行 `onPointerEnter` 起 400ms 计时 → `previewId`；`onPointerLeave` 120ms 后清；菜单打开时清；`wide === false` 或 `matchMedia('(pointer: coarse)')` 不启用。
2. 卡内容：人设行 = 模型标签（`modelOverride?.model ?? '默认模型'`）/ 例行 N（`routineList` 计数，来自 rosterStore 懒加载）/ 会话 N / 最后一句；小组行 = 成员数 / 轮次 / 最后一句。`pointer-events: none`；靠近视口底部向上翻转。
3. 单测 `tests/bot-roster-preview.spec.tsx`（fake timers：400ms 出、120ms 收、rail 不出、菜单打开即收）。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/bot-roster-preview.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/commands.log`

**注意事项**：不要为预览卡发新请求（数据全部来自 rosterStore）；卡是 `position:absolute` 挂在行上，侧栏 `overflow` 需允许水平溢出或改用 portal。

### Task 15: shell.overlay 命令面板（⌘K）

- **关联**：BR-613 / BR-617 / BR-621 / UF-611 / EVD-612
- **前置任务**：12 / 9
- **风险等级**：P2

**为什么做**：原型的 ⌘K 跳转；官方没有 palette 座位但 `shell.overlay` 能放，`keydown` 挂 `window`，iframe 只在自己获焦时吃键，两套面板按焦点分工。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/CommandPalette.tsx`（新建，作为 `OverlayHost` 的一种 kind）
- `packages/ui-dsh-bot/src/client/overlay-store.ts`（Task 12 产物）
- `docs/prototypes/dsh-bot-left-tab.html`：`.palette {`，`rg "\.palette \{" docs/prototypes/dsh-bot-left-tab.html`，L193（尺寸：560px、16vh 顶距）
- `packages/workbench-ui/src/CommandPalette.tsx`：`export function CommandPalette`，`rg "export function CommandPalette" packages/workbench-ui/src/CommandPalette.tsx`，L66（iframe 版参照，不 import）

**具体操作**：

1. `apply` 里 `ctx.effect` 挂 `window.addEventListener('keydown')`：`(meta||ctrl) + k` 且 `document.activeElement` 不在 iframe / 输入框内 → `openOverlay({ kind:'palette' })`；再按一次或 Esc 关闭。
2. 面板项：可见人设（→ `selectBot`）、小组（→ `openGroup`）、当前人设的绑定会话（→ `sessions.open`）、「切到会话模式 / Bot 模式」（→ `mode.set`）。输入即过滤（名字 + 预览），↑↓ 选择，↵ 执行，Esc 关。不做原型的「分镜」项。
3. 会话模式下也可用（打开面板时若选人设则先 `mode.set('bot')`）。
4. 样式对照原型 `.palette` / `.palItem` / `.palFoot`（BR-617）。
5. 单测 `tests/command-palette.spec.tsx`：⌘K 开关、焦点在 input 内不触发、过滤、键盘导航、执行回调。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/command-palette.spec.tsx` → 通过

**Evidence**：`evidence/phase-2/commands.log`、`evidence/phase-2/palette.png`

**注意事项**：监听器随 fiber 卸载（BR-611）；不要在 iframe 获焦时抢键（`document.activeElement?.tagName === 'IFRAME'` 直接放行）。

### Task 16: 执行 Phase 2 回归验证

- **关联**：BR-604 / BR-605 / BR-608 / BR-609 / BR-610 / BR-612 / BR-613 / BR-614 / BR-615 / BR-618 / BR-619 / BR-621 / UF-601 / UF-603 / UF-604 / UF-606 / UF-607 / UF-608 / UF-609 / UF-610 / UF-611 / UF-612 / INV-601 / INV-602 / INV-603 / INV-606
- **前置任务**：9 / 12 / 13 / 14 / 15

**验证**：`pnpm run typecheck && pnpm test && pnpm run build` → 全过；`git diff --stat packages/dsh-bot-host/src` → 空（INV-602）；真机 UF-603 步骤 1-6 与 UF-608 步骤 1-2 走通并截图

**Evidence**：`evidence/phase-2/phase-summary.md`、`evidence/phase-2/commands.log`

### Phase 3: 中栏身份条

> 你在哪里：名册可用，bot 会话在官方中栏打开，但顶栏与普通会话无异。
> 做完之后：bot 会话顶栏有身份 chip、记忆/例程/同事浮层、对话切换、新开对话；普通会话不受影响。

### Task 17: header.actions 身份 chip（仅 bot 会话）

- **关联**：BR-606 / BR-607 / BR-611 / UF-605 / EVD-605
- **前置任务**：16
- **风险等级**：P1

**为什么做**：让用户在官方中栏知道「我在和谁说话」，而不重画对话面。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/IdentityBar.tsx`（新建）+ `IdentityBar.module.css`
- `packages/ui-dsh-bot/src/client/index.ts`：`export function apply`，L56
- `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/sessions/service.d.ts`：`agentPreset?: string`，L42

**具体操作**：

1. `apply`：`ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-bot:identity', order: 50, locale: NS, inject: () => ({ roster, sessions: ctx.sessions }) }, IdentityBar))`。
2. `IdentityBar({ sessionId, roster, sessions })`：`useSyncExternalStore` 订阅 `sessions.list` 与 `roster.bots`；`preset = byId[sessionId]?.agentPreset`；`preset?.startsWith('dsh-bot--')` 且 `bots.find(b => b.presetId === preset)` 命中才渲染 chip（头像 + 名字 + `running` 绿点）；否则 `return null`。
3. chip 出现时若该 bot `unread > 0` 调 `markRead`（BR-612）。
4. 单测 `tests/identity-bar.spec.tsx`：bot 会话渲染 / 普通会话 null / preset 无匹配 null / 名册未加载 null。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/identity-bar.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/commands.log`

**注意事项**：session 作用域条目会随会话切换重挂载，副作用要幂等；禁止在此渲染任何消息流（BR-606）；preset 匹配同时认 `dsh-bot` 与 `dsh-bot--`（Task 1 校准结论）；slot 组件渲染期不得读 `ctx.betterSidebar` 等未 inject 的服务（会抛 `cannot get property … without inject`，Phase 1 已踩）——需要 better-sidebar 的动作一律在 `ctx.inject(['betterSidebar'], …)` 回调里拿到引用后经 props 传入。

### Task 18: 记忆 / 例程 / 同事 / 人设 pill 浮层 + 对话切换 + 新开对话

- **关联**：BR-605 / BR-606 / BR-609 / BR-616 / BR-617 / UF-605 / UF-610 / EVD-605 / EVD-611
- **前置任务**：17
- **风险等级**：P1

**为什么做**：原型分镜 8 的顶栏浮层与「对话」切换器。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/IdentityBar.tsx`
- `packages/ui-dsh-bot/src/client/roster-rpc.ts`（Task 7：`memoryList/routineList/peerLog`）

**具体操作**：

1. chip 右侧三枚 pill：「记忆 N」「例程 N」「同事 N」，N 来自各只读接口（懒加载：首次点开才请求，之后缓存 30s）；点开浮层（portal 到 `document.body`，定位到 pill 下方），只读列表 + 关闭；Esc / 点外关闭；请求失败浮层内红字 + 重试。
2. 「对话 ▾ {displayTitle}」：浮层列出 `sessionsOf(botId)`（当前高亮），点一条 → `jumpToSession`；末行「+ 新开对话」→ `createBotSession` → open，请求期间禁用。
3. 第四枚 pill「人设」（BR-616）：浮层显示 persona 全文 + `preset dsh-bot--<slug>` + 「编辑人设」按钮 → `openOverlay({ kind:'edit-bot', id })`（Task 12）；身份 chip 本身 onClick 同样打开编辑模态。
4. 样式按 BR-617 对照原型 `.floatPanel`（L121）/ `.memoryPill`。
5. 单测 `tests/identity-bar-popovers.spec.tsx`：pill 计数、浮层开合、对话切换调用 open、新开对话禁用期间不重复、人设浮层与 chip 点击调用 openOverlay。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/identity-bar-popovers.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/commands.log`、`evidence/phase-3/popover.png`

**注意事项**：浮层 z-index 需高于官方 header 但低于官方 `shell.overlay`；浮层内不做记忆增删（只读）。

### Task 19: turnTail「例程触发」标签

- **关联**：BR-606 / BR-611 / BR-620 / UF-612 / EVD-613
- **前置任务**：17 / 7
- **风险等级**：P2

**为什么做**：原型分镜 6 在例程主动发的那轮对话上打「例程触发」标签；官方 `conversation.chat.turnTail`（chain）就是给完成的 turn 挂尾巴的座位，`/dsh-bot/history` 条目已有 `origin: 'routine'`。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/RoutineTurnTail.tsx`（新建）
- `packages/ui-dsh-bot/src/client/index.ts`：`export function apply`，L56
- `packages/workbench-ui/src/api.ts`：`origin?: 'routine'`，`rg "origin\?: 'routine'" packages/workbench-ui/src/api.ts`，L170
- `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`：`'conversation.chat.turnTail'`，L160；`TurnTailOwnerProps`，L440
- `env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/contract/conversation.d.ts`：`interface TurnLocation`，L67

**具体操作**：

1. `apply`：`ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', select: (owner) => matchRoutineTurn(owner), inject: () => ({ roster }) }, RoutineTurnTail))`。
2. `matchRoutineTurn({ turn, seq })`：从 roster-rpc 的 `historyOf(sessionId)`（Task 7 补一个按 session 懒拉、SSE 刷新的 history store）里找 `origin === 'routine'` 且 `seq` 落在 `[turn.start.seq, turn.end.seq]` 的项；命中返回 `{ routineName }`，否则 `null`（链条声明不匹配、不挂载）。ASM-608：history `seq` 与官方 turn 事件 `seq` 同源（都是 session 事件序号）——第一步先在一条例程会话上打印两边 seq 核对，不同源则改为按 `createdAt` 时间窗匹配。
3. `RoutineTurnTail`：一枚小标签「例程触发 · {routineName}」，样式对照原型 `.wakeTag`（L150）；非 bot 会话永不命中（history 只对 bot 会话有）。
4. 单测 `tests/routine-turn-tail.spec.tsx`：命中/不命中 select；标签文案。

**验证**：`./node_modules/.bin/vitest run packages/ui-dsh-bot/tests/routine-turn-tail.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/commands.log`、`evidence/phase-3/routine-tag.png`

**注意事项**：chain 槽的 `select` 会对每个 turn 调用，必须是同步、O(1) 查表（history 预建 seq 索引）；不要在 select 里发请求。

### Task 20: 执行 Phase 3 回归验证

- **关联**：BR-606 / BR-607 / BR-611 / BR-616 / BR-620 / UF-605 / UF-610 / UF-612 / INV-603 / INV-606
- **前置任务**：18 / 19

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/ui-dsh-bot/tests && pnpm --filter ui-dsh-bot run build` → 全过；真机 UF-605 步骤 1-5 走通并截图

**Evidence**：`evidence/phase-3/phase-summary.md`、`evidence/phase-3/commands.log`

### Phase 4: 文档、真实场景与收尾

> 你在哪里：三条产品面都已实现并各自回归。
> 做完之后：README 说清左栏 Bot 模式；5.2 执行矩阵全部行通过并有证据；全仓命令级全绿；在飞改动完好。

### Task 21: 同步 README「左栏 Bot 模式」与原型文档状态

- **关联**：BR-601 / BR-602 / BR-608 / BR-609 / UF-601（NA：文档任务，无新交互）
- **前置任务**：20
- **风险等级**：P3

**涉及文件与定位**：

- `README.md`：`右栏页签`，`rg "右栏页签" README.md`，L71
- `docs/prototypes/left-sidebar-bot-tab.md`：`源码核对`，`rg "源码核对" docs/prototypes/left-sidebar-bot-tab.md`，L94

**具体操作**：

1. README「入口」表新增一行「左栏 Bot 模式」：底栏「Bot」→ 名册 → 官方中栏；说明官方「+」不变、小组仍在右栏页签、`localStorage['dsh-bot:sidebar-mode']`。
2. `left-sidebar-bot-tab.md` 末尾追加「落地记录（日期）」：链接本 spec；写明与原型的四条偏差（分段条只在 Bot 态 / 官方「+」不变 / 小组不进中栏 / 会话态不复刻官方树）。

**验证**：`rg -n "左栏 Bot 模式" README.md` → 命中；`rg -n "落地记录" docs/prototypes/left-sidebar-bot-tab.md` → 命中

**Evidence**：`evidence/phase-4/commands.log`

**注意事项**：不改 `docs/prototypes/dsh-bot-left-tab.html`。

### Task 22: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-601 ~ UF-612 / 全部 BR / INV-601 / INV-604 / INV-607 / EVD-602~EVD-607 / EVD-609~EVD-613
- **前置任务**：21
- **风险等级**：P0

**具体操作**：按 5.2 环境准备启动；按执行矩阵逐行回放（浏览器工具优先，退而 Playwright，再退手动脚本 + 回填）；每行截图 + console + 必要的 RPC 样例落到矩阵写明的路径；任一行失败回到对应 Task 修复后重跑。

**验证**：5.2 执行矩阵全部行通过；`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-left-tab` → 0 FAIL（证据审计）

**Evidence**：`evidence/UF-601/` ~ `evidence/UF-612/`（见 5.2 矩阵）

### Task 23: 执行 Phase 4 回归验证

- **关联**：全部 BR / UF / INV
- **前置任务**：22

**验证**：`pnpm run typecheck && pnpm test && pnpm run build && pnpm run standard:check` → 全过；`git status --short` 与 `evidence/phase-0/git-status-before.txt` 对比，在飞文件仍在且无被回退（INV-604）

**Evidence**：`evidence/phase-4/final-summary.md`、`evidence/phase-4/commands.log`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 用户可见的需求必须通过 5.2 真实场景全套测试才算完成。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| typecheck | `pnpm run typecheck` | 退出码 0 | EVD-608 |
| unit（本包） | `./node_modules/.bin/vitest run packages/ui-dsh-bot/tests packages/dsh-bot-shared/tests packages/workbench-ui/tests` | 全过 | EVD-608 |
| unit（全仓） | `pnpm test` | 全过（INV-606） | EVD-608 |
| build + 纯度 | `pnpm run build` | 全过，`ui-dsh-bot` purity 插件无报错（INV-603） | EVD-608 |
| 标准检查 | `pnpm run standard:check` | 通过 | EVD-608 |
| host 零改动 | `git diff --stat packages/dsh-bot-host/src` | 空（INV-602） | EVD-608 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm run build && sh env/boot.sh`（:3084 已由本仓网关占用时 boot 直接退出；改了客户端代码需先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份、`kill <pid>` 再 `sh env/boot.sh`） |
| 访问入口 | 官方前台 http://127.0.0.1:3084 ；右栏「DSH Bot」页签 iframe http://127.0.0.1:3084/dsh-bot/ui |
| 测试账号/数据 | 本仓 `env/dsh-bot/bots.json` 现有人设（含 protected 的 DSH Bot）与 `groups.json` 小组；需要一个 0 会话新人设时在右栏页签「新建人设」建 `左栏测试` 并在收尾删除 |
| 干净状态定义 | DevTools 清 `localStorage['dsh-bot:sidebar-mode']`、`dsh-bot:last-bot`、`dsh-bot:roster-folded`；刷新页面 |
| 可用测试工具 | cursor-ide-browser MCP（navigate / snapshot / click / screenshot / cdp console）；备选邻仓 Playwright（channel chrome）；RPC 用 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh 3084 <method>` 或 `curl -X POST http://127.0.0.1:3084/dsh-bot/<method>`；无浏览器工具时按本表逐步手动执行并回填截图 |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-601 主路径 | browser | 2.3 UF-601 步骤 1-5 | 「Bot」行激活；`[data-slot="sidebar.workspaces"]` 内为分段条 + 名册；F5 后保持；console 无新增 error | `evidence/UF-601/bot-mode.png`、`evidence/UF-601/after-reload.png`、`evidence/UF-601/console.log` |
| UF-601 失败分支 网关拒绝 | browser | 杀网关后切 Bot | 「名册加载失败」+ 重试；重启网关后重试恢复 | `evidence/UF-601/load-error.png` |
| UF-601 失败分支 空名册 | browser | 临时把 bots.json 备份为空数组后重启（测完还原） | 空态文案 + 新建入口 | `evidence/UF-601/empty.png` |
| UF-602 主路径 | browser | 2.3 UF-602 步骤 1-4 | 官方树回来；搜索可用；点会话打开；「Bot」行未激活；DOM 与 `docs/prototypes/real/pw-landing.png` 结构一致（INV-607） | `evidence/UF-602/sessions-restored.png`、`evidence/UF-602/console.log` |
| UF-603 主路径 | browser + RPC | 2.3 UF-603 步骤 1-6 | 已有会话被打开且下挂高亮；0 会话人设创建并打开；「+ 新开对话」新建；官方「+」仍进 hero | `evidence/UF-603/open-existing.png`、`evidence/UF-603/create-new.png`、`evidence/UF-603/createBotSession.json` |
| UF-603 失败分支 创建失败 | browser | 临时移除模型凭据或断网关后点 0 会话人设 | 行内红字 + 重试，选中保留 | `evidence/UF-603/create-failed.png` |
| UF-603 失败分支 会话已归档 | browser | 在官方树归档 last-session 后点该人设 | 回退到最新会话，无报错 | `evidence/UF-603/archived-fallback.png` |
| UF-604 主路径 | browser | 2.3 UF-604 步骤 1-2 | rail 头像列 + 红点；点头像展开并打开会话 | `evidence/UF-604/rail.png`、`evidence/UF-604/expanded.png` |
| UF-604 失败分支 名册未加载 | browser | rail 态下网关不可达 | 警示图标 title | `evidence/UF-604/rail-error.png` |
| UF-605 主路径 | browser | 2.3 UF-605 步骤 1-5 | chip + 三 pill + 对话切换 + 新开对话；记忆浮层；切普通会话消失 | `evidence/UF-605/identity-bar.png`、`evidence/UF-605/memory-popover.png`、`evidence/UF-605/plain-session.png` |
| UF-605 失败分支 preset 无匹配 | browser | 删除一个 bot 后打开其旧会话 | 不渲染身份条 | `evidence/UF-605/orphan-preset.png` |
| UF-606 主路径 | browser | 2.3 UF-606 步骤 1-2 | 右栏页签激活；iframe 选中该小组；中栏不变 | `evidence/UF-606/group-jump.png` |
| UF-606 失败分支 页签未就绪 | browser | 右栏页签关闭状态下点小组 | 页签打开后自动选中（≤8s）或灰字提示 | `evidence/UF-606/tab-cold.png` |
| UF-607 主路径 | browser + RPC | 2.3 UF-607 步骤 1-2；用 `dsh-rpc.sh 3084` 或 curl 调 `routineRunNow` / `sendToPeer` | 徽章 +1 与预览更新；点开归零 | `evidence/UF-607/unread.png`、`evidence/UF-607/read.png` |
| UF-607 失败分支 SSE 断开 | browser | DevTools 阻断 `/dsh-bot/events` | console 出现轮询回退日志；徽章仍能更新 | `evidence/UF-607/poll-fallback.log` |
| UF-608 主路径 | browser + RPC | 2.3 UF-608 步骤 1-9 | 模态盖住全页、焦点进首字段；保存后名册刷新并选中；编辑即时更新；删除确认文案分人设/小组；删选中项后选中转移、中栏不动；Esc 关闭 | `evidence/UF-608/create-bot.png`、`evidence/UF-608/created-selected.png`、`evidence/UF-608/delete-confirm.png`、`evidence/UF-608/createBot.json` |
| UF-608 失败分支 校验 | browser | 空名字保存 / 小组 1 人 | 红字 + 保存禁用，不发请求（network 无 POST） | `evidence/UF-608/validation.png` |
| UF-608 失败分支 RPC 失败 | browser | 重名或断网关后保存 | 模态内红字，表单保留 | `evidence/UF-608/rpc-error.png` |
| UF-609 主路径 | browser | 2.3 UF-609 步骤 1-4 | 关系图虚线/实线/图例正确；点节点选中并开会话；新开房间后右栏页签选中新房间 | `evidence/UF-609/graph.png`、`evidence/UF-609/node-select.png`、`evidence/UF-609/new-room.png` |
| UF-609 失败分支 无小组 | browser | 删光小组后点关系图 | 空态 + 新建小组按钮 | `evidence/UF-609/no-groups.png` |
| UF-610 主路径 | browser | 2.3 UF-610 步骤 1-6 | 400ms 出卡、120ms 收、不挡 ⋯ 点击；小组卡；人设浮层 + 编辑入口进模态 | `evidence/UF-610/hover-bot.png`、`evidence/UF-610/hover-group.png`、`evidence/UF-610/persona-panel.png` |
| UF-610 失败分支 rail 态 | browser | 收起侧栏后悬停头像 | 不出卡，只有 title | `evidence/UF-610/rail-no-card.png` |
| UF-611 主路径 | browser | 2.3 UF-611 步骤 1-5 | 面板出现且输入框获焦；过滤；↵ 切模式并打开会话；Esc 关 | `evidence/UF-611/palette.png`、`evidence/UF-611/filtered.png` |
| UF-611 失败分支 iframe 获焦 | browser | 点进右栏工作台后按 ⌘K | 宿主面板不出现，iframe 的 ⌘K 出现 | `evidence/UF-611/iframe-focus-no-palette.png` |
| UF-612 主路径 | browser + RPC | 2.3 UF-612 步骤 1-4 | 审批等待时红「@」与官方琥珀点同步；处理后回数字；例程那轮尾部有标签、其他轮无 | `evidence/UF-612/mention-badge.png`、`evidence/UF-612/badge-cleared.png`、`evidence/UF-612/routine-tag.png`、`evidence/UF-612/seq-check.log` |
| BR-617 视觉对照 | browser | 名册态与原型分镜 3 并排 | 行高 / 头像 36px 格 / 徽章 18px / 分段条一致，只允许颜色 token 差异 | `evidence/UF-601/visual-diff.png` |
| 2.7 热重载 | browser | 重建 ui-dsh-bot 并重载 | `document.querySelectorAll('[data-slot="sidebar.workspaces"]').length === 1`，无双分段条 | `evidence/phase-0/calibration.md`（复用）+ `evidence/phase-4/hmr.png` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。任何一行失败 = 本需求未完成。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  README.md
  phase-0/  calibration.md shadow-on.png shadow-off.png git-status-before.txt
  phase-1/  commands.log toggle.png phase-summary.md
  phase-2/  commands.log roster.png open-session.png overlay-form.png graph.png palette.png phase-summary.md
  phase-3/  commands.log popover.png routine-tag.png phase-summary.md
  phase-4/  commands.log hmr.png final-summary.md
  UF-601/ … UF-612/   # 5.2 矩阵所列文件名
```

### 5.4 Review 专项检查清单

- [ ] `ctx.slots.register` 对 `sidebar.workspaces` 只出现一次且 `priority: -1`；无对 `root` / `sidebar` / `conversation*` single 槽的注册（BR-601）
- [ ] 会话模式下 `ctx.slots.entries('sidebar.workspaces')` 只剩官方一条；无 CSS 隐藏官方树（BR-602 / BR-611）
- [ ] 客户端代码里没有消息流 / composer 渲染（BR-606）
- [ ] 官方「+ 新会话」未被拦截（BR-609）
- [ ] `shell.overlay` 条目在无模态时返回 null；模态根元素 `pointer-events:auto`、`role="dialog"`、Esc 可关（BR-613）
- [ ] 删除有确认框且 protected 的 DSH Bot 无删除项（BR-614）
- [ ] 名册 / 分段条 / 浮层 / 表单尺寸与原型 class 一致，只有颜色 token 差异（BR-617）
- [ ] turnTail 条目的 `select` 同步、无请求，非命中 turn 不挂载（BR-620）
- [ ] ⌘K 监听在 iframe / 输入框获焦时放行（BR-621）
- [ ] `git diff --stat packages/dsh-bot-host/src` 为空；`env/profiles` 未被写入（INV-602 / INV-605）
- [ ] session-nav 在飞改动仍在工作区（INV-604）
- [ ] 5.2 执行矩阵全部通过，evidence 齐全且与第 2.5 节 EVD 清单一致
- [ ] 2.3 节每条流程的「入口接线清单」已实现——从真实入口可达，不是只有孤立组件
- [ ] 界面交互与 2.3 节脚本逐步一致（loading、禁用态、错误提示、成功反馈都存在）
- [ ] 所有 BR/UF/INV 状态可对照第 2 章逐条核销
