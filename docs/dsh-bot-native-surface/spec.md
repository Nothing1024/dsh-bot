# dsh-bot-native-surface Spec

> Version: 0.1.0 | Date: 2026-09-06 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**：事实基线、业务合同、技术方案、任务计划、验收协议全部在此。
> 其他文件（handoff.md、tasks.csv）只引用本文件，不复制内容。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：在 DSH 官方界面里用多个人设（bot）聊天的本机用户。今天 bot 只活在右栏「DSH Bot」页签的 iframe 里，官方左栏、标题栏、设置里看不到它的存在，感觉像一个外挂。
- **做什么**：让 bot 长进 DSH 官方壳的**真实空座位**里——左栏底部一个「DSH Bot」入口（带未读/工作中徽标）；打开 bot 会话时标题栏显示人设头像和名字，旁边一个「人设」按钮能跳到该人设；工作台颜色跟随宿主明暗主题。
- **改哪里**：`ui-dsh-bot` 客户端插件（往官方 slot 注册三个小控件 + 把主题传给 iframe）、`dsh-bot-host`（新增一个「这些会话属于哪个人设」的查询接口）、`workbench-ui`（嵌在页签里时变成**纯导航面**：点会话直接在官方中栏打开，不再在 iframe 里自己画一套对话；浅色主题）。
- **怎么算做完**：在真实 :3084 GUI 里：左栏底部能看到并点开 DSH Bot；打开一个 bot 会话，标题栏有它的头像名字；页签里点任意 1:1 会话，官方中栏切到该会话；把系统切成浅色，页签内工作台也变浅色；小组房间在页签里照常能聊。
- **不做什么**：不做记忆、例程/定时唤醒、bot 互发消息、会话树里的身份 chip（官方会话树是整块占据的座位，加不进去）——这些另立包。浏览器直开 `/dsh-bot/ui` 仍保留完整对话面作为调试入口，但不再宣称"与页签功能等价"。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 用户 2026-09-06 逐轮确认："把对话面交还官方，插件只做身份/名册/记忆/例程"；本包承接其中**可在官方座位上落地的表面层**（身份、入口、导航、主题），原型为 `../prototypes/dsh-bot-on-real-shell.html`，真实壳调研为 `../prototypes/real-dsh-ui-survey.md` |
| 输入类型 | description（对话上下文 + 原型 + 调研报告） |
| Mode | oneclick |
| 置信度 | 高（需求、对象、约束、真实界面 DOM 均已核实） |
| 输出目录 | `docs/dsh-bot-native-surface/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | frontend（主）+ backend（一个只读 RPC）+ refactor（workbench 嵌入模式收窄） |
| 主要风险 | ① slot 注册面在 `.d.ts` 里有、但客户端 ctx 是否给 `ui-dsh-bot` 注入 `slots` 服务未实测；② better-sidebar `openTab/activateTab` 对既有 tab id 的行为未实测；③ 主题来源属性未实测 |
| 行号引用策略 | 仅 hint；以 symbol + rg anchor 为准 |
| 必需验收方式 | 真实浏览器（Playwright channel chrome）在 :3084 官方 GUI 上逐步回放 + DOM `data-slot` 断言 + 截图 |
| 必须覆盖用户场景 | 入口徽标、身份标、页签导航跳转、主题跟随、小组房间回归 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 官方壳为三栏 `.pI_x6G_frame`，右栏 `details` 默认 0 宽；better-sidebar 是 overlay 层 `[data-dsh-better-sidebar]` 的 IDE 页签条（Files / DSH Bot / +） | Playwright 抓 `http://127.0.0.1:3084` DOM（omp worker，2026-09-06） | `../prototypes/real/dom-summary.md` §顶层 frame / §better-sidebar |
| 会话打开后存在 `data-slot`：`sidebar.footer.action`（**空**）、`conversation.session.header.actions`（官方预设标）、`conversation.session.header.utilities`（Session log）、`conversation.input.left`（空）、`conversation.chat.assistant-actions`、`settings.trigger` | 同上 | `../prototypes/real/dom-summary.md` §会话打开后 data-slot；`real-dsh-ui-survey.md` A2/A3/A7 |
| 官方左栏底部只有「设置」，无 DSH Bot 入口；品牌为「deepseek HARNESS」；hero 文案「探索未至之境」；视图 tab「对话／轨迹」 | 同上 + Vision OCR | `real-dsh-ui-survey.md` A2/A4/A5 |
| 官方字体 16px system-ui/PingFang SC；暗色底 `rgb(21,21,23)`；明暗两套跟系统 | 同上 `theme` 字段 | `real/pw-session-open.dom.json` `theme` |
| 拟用 slot 的 kind/scope：`sidebar.footer.action` list/root；`conversation.session.header.actions` list/session；`conversation.session.header.utilities` list/session；`conversation.input.left` list/session；`conversation.chat.assistant-actions` list/session；`settings.section` list/root；`conversation.hero.agentPreset` **single**/root | `grep -A3 "'<slot>': {" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-*/lib/types/client/contract/slots.d.ts` | 见本次会话勘察输出 A 段 |
| `sidebar.footer.action` owner props 只有 `{ wide: boolean }`（false = 56px rail） | `grep -n "interface SidebarFooterActionOwnerProps" -A6 .../dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts` | L94-97 |
| header.actions/utilities 座位注释：注册者从框架 session kit 拿 `sessionId / useSession / useInput / inputActions`，owner 不传业务数据 | `sed -n 85-100p .../dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts` | L86-95 |
| `sidebar.workspaces` 是 **single** 座位，由 ui-sidebar 会话树占据；注册会**替换**整棵树 | `sed -n 20-95p .../dsh-client-ui-layout/lib/types/client/index.d.ts` + sidebar slots.d.ts L39-43 | 因此"会话树行内身份 chip"不可加法实现 → 列为非目标 |
| better-sidebar 服务面有 `openTab(seed: OpenTabSeed, scope?)` 与 `activateTab(tabId, scope?)` | `grep -rn "openTab\|activateTab" env/profiles/gb/node_modules/dsh-better-sidebar/lib/types/client/service.d.ts` | L296、L360、L398 |
| `ui-dsh-bot` 客户端目前只注入 `['sessions','locale']`，betterSidebar 经 `ctx.inject` 软依赖；未注入 `slots` | `cat packages/ui-dsh-bot/src/client/inject.ts`；`grep -n "inject\|registerTab" packages/ui-dsh-bot/src/client/index.ts` | inject.ts L5；index.ts L61-104 |
| 邻仓 vibee 客户端注入 `['slots','sessions','locale']` 并用 `ctx.slots.inject('<slot>', () => ctx.slots.register({ name, id, order, label, children?, store?, inject? }, Component))` 注册 list 座位 | `cat ../../vibee/plugin/packages/ui-vibee/src/client/inject.ts`；`sed -n 130-175p .../ui-vibee/src/client/index.ts` | 注册形状可照抄（只读参考，不拷代码） |
| 页签内容是 iframe `src='/dsh-bot/ui'`；跳转靠 iframe→宿主 postMessage 桥 + `sessions.open` | `grep -n "iframe\|postMessage\|WORKBENCH_SRC" packages/ui-dsh-bot/src/client/DshBotTab.tsx packages/ui-dsh-bot/src/client/session-jump.ts` | DshBotTab.tsx L99/L190-196；session-jump.ts L36 |
| workbench 判断嵌入：`isStandaloneWorkbench()` = `window.parent === window` | `grep -n "isStandaloneWorkbench" packages/workbench-ui/src/jump.ts` | L16-17 |
| workbench 主题硬编码 `color-scheme: dark`，无 `prefers-color-scheme`、无 `data-theme` | `grep -n "color-scheme\|prefers-color-scheme" packages/workbench-ui/src/styles.css` | L2 唯一命中 |
| v1 `POST /dsh-bot/listSessions` 行含 `tags`（marks），可解析 `bot:<id>` | `sed -n 5-20p packages/ui-dsh-bot/src/client/rpc.ts`；`grep -n "export function" packages/dsh-bot-host/src/marks.ts` | `DshBotSessionRow.tags`；`parseBotMark` L39 |
| 官方客户端 sessions manager 提供每会话 `running` 位与"完成未读"提醒 | `grep -rn "running" .../dsh-client-runtime/lib/types/client/sessions/*.d.ts` | lineage.d.ts L15/L28 |
| 官方 ui-conversation 已消费 `session/event` 流式、`cancel`、`steer/queue`、`input.attachments`、`approval/requested`、`question/requested` | `grep -rl -- "<key>" env/profiles/gb/node_modules/@deepseek-ai/*/lib/*.js` | 本次会话勘察输出：每项命中 dsh-client-ui-conversation / ui-attachment / ui-user-questions |
| 仓库脚本：`pnpm run typecheck` / `pnpm run build` / `pnpm test`(vitest) / `pnpm run standard:check` | `grep -n '"typecheck"\|"build"\|"test"\|"standard:check"' package.json` | L9-13 |
| :3084 网关已起且身份为本仓 `env/`；Playwright 可复用 `../../dsh-genoffice/engine/node_modules/playwright`，`launch({channel:'chrome'})` 可用 | `lsof -nP -iTCP:3084 -sTCP:LISTEN`；worker 报告 `dsh-rpc-who.sh 3084`；本会话 4 次无头渲染零报错 | pid 32077，`DSH_HOME=…/dsh-grok-bot/plugin/env` |
| 既有测试目录：`packages/ui-dsh-bot/tests/{apply-sidebar,jump-bridge,rpc,tab}.spec.*`；`packages/workbench-ui/tests/{app,conversation,jump,keyboard,...}.spec.*` | `ls packages/ui-dsh-bot/tests packages/workbench-ui/tests` | 新增测试沿用同目录 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-701 | 在 `ui-dsh-bot` 的 `inject` 加入 `'slots'` 后，客户端 ctx 提供与 vibee 同形的 `ctx.slots.inject/register` | 若 `slots` 非平台核心服务，三个 slot 控件全部落空 | Task 1：加 inject 后 boot，浏览器 console `document.querySelector('[data-slot="sidebar.footer.action"]').children.length` |
| ASM-702 | `betterSidebar.activateTab('dsh-bot:sessions', scope)` 能激活已注册的 DSH Bot 页签；页签未打开时 `openTab({ type: 'dsh-bot:sessions' })` 能打开 | 签名/type 语义不符则入口点击无效 | Task 1：读 `service.d.ts` L296-398 `OpenTabSeed`/`SessionScope` 定义 + 真机点击 |
| ASM-703 | 官方 hero 的 Agent 预设下拉已列出 `dsh-bot--<slug>` 生成的人设 preset（它们是真实 preset 目录） | 若不列出，"新会话选人设"需另做 | Task 1：真机打开 hero 下拉截图 |
| ASM-704 | 宿主明暗主题可从 `document.documentElement` 的 `color-scheme` 计算样式或某 `data-*` 属性读到，并可 `MutationObserver` 监听变化 | 读不到则主题跟随退化为 `prefers-color-scheme` | Task 1：真机 `getComputedStyle(document.documentElement).colorScheme` + 切换系统主题观察属性变化 |
| ASM-705 | v1 `listSessions` 在会话数 ≤ 100 时单次响应 < 300ms，可作为身份查询的临时数据源；否则需 Task 2 的批量 `identity` 接口 | 慢则标题栏身份标闪烁 | Task 2 实测 curl 耗时 |

---
## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。任务、handoff、review 一律引用 ID，不复制表格。ID 用 7xx 段，避免与 mvp（001-）/ workbench（2xx）/ group-chat（3xx）/ session-nav（4xx）/ group-rounds（5xx）/ interaction-master（6xx）撞号。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-701 | 左栏入口：`ui-dsh-bot` 向官方 `sidebar.footer.action`（list/root）注册一条「DSH Bot」行；`wide=false` 时只画图标；徽标 = 有 bot 会话 `running` 时黄点、有「完成未读」时数字；点击 → `betterSidebar.activateTab(DSH_BOT_SESSIONS_TAB_ID)`，页签未开则 `openTab({ type: DSH_BOT_SESSIONS_TAB_ID })` | 折叠侧栏后仍有 🤖 图标，点击右侧页签条切到 DSH Bot | 注册到 `sidebar.workspaces`（single 座位，会替换会话树）；betterSidebar 缺失时抛错导致 fiber PENDING | ui-dsh-bot | 真机 DOM `[data-slot="sidebar.footer.action"]` 子节点 + 点击回放 |
| BR-702 | 会话身份标：当前会话 marks 含 `bot:<id>` 且该 id 在 `listBots` 中时，`conversation.session.header.actions` 渲染「头像 + 人设名」（order 排在官方预设标之后）；`header.utilities` 渲染「人设」按钮，点击 = BR-701 的打开页签 + 向 iframe 发 `focusBot(botId)`；非 bot 会话两处**都不渲染**（返回 null，不占位） | 打开 `v1 leftover t18` 见 D 头像 + 「DSH Bot」；打开 `重构 api.ts…` 标题栏与官方完全一致 | 非 bot 会话渲染空 pill；身份查询失败时显示「未知」占位 | ui-dsh-bot + dsh-bot-host | 真机截图 + DOM 断言 |
| BR-703 | 页签导航模式：workbench 在**嵌入宿主**（`!isStandaloneWorkbench()`）时，1:1 人设的会话行点击 → 经既有桥 `sessions.open`，iframe 内**不渲染** 1:1 `Conversation`（改为空态提示「对话在左侧官方面板」+「新开对话」）；小组房间仍在 iframe 内完整渲染（房间不是官方 session）；直开 `/dsh-bot/ui` 行为不变 | 页签里点「九月」→ 官方中栏切到该会话，iframe 右侧不出现第二套对话 | 嵌入时仍轮询 1:1 history 并画气泡；直开时把对话面也去掉 | workbench-ui | 真机：点击后 `document.title` 变为该会话标题 + iframe 内无 `.transcript` |
| BR-704 | 主题跟随：宿主（ui-dsh-bot）读取 `getComputedStyle(document.documentElement).colorScheme`（ASM-704 校准后可换更稳的属性），首帧与每次变化都 `postMessage({type:'dsh-bot/theme', scheme})` 给 iframe；workbench 收到后设 `html[data-theme]`；直开时按 `prefers-color-scheme` | 宿主切浅色 ≤500ms 内 iframe 变浅色 | iframe 仍硬编码 `color-scheme: dark`；用 iframe 自己的 `prefers-color-scheme` 代替宿主实际主题 | ui-dsh-bot + workbench-ui | 真机切换系统外观截图两张 |
| BR-705 | 身份查询接口：host 新增只读 `POST /dsh-bot/sessionIdentity`，args `{ sessionIds: string[] }`（≤50），返回 `{ [sessionId]: { botId, name, avatar } \| null }`；仅读 marks + `bots.json`，**不打标、不建会话** | 传 3 个 id，1 个是 bot 会话 → 该项有值其余 null | 顺手做 reconcile 补标；返回 500 而非 `{ok:false}` | dsh-bot-host | curl + vitest |
| BR-706 | 红线：不改官方 npm 包与三邻仓；不注册任何 single 座位（`sidebar`/`sidebar.workspaces`/`conversation`/`details`/`conversation.hero.agentPreset`）；不开新端口（仍只 :3084）；`slots`/`betterSidebar` 任一缺失时插件软降级（该能力不出现），不得让客户端 fiber PENDING；参考树只读，`rg -i 'anysphere\|sand://' packages/` 为空 | `ctx.inject(['slots'], …)` 内注册，缺失时 warn 一条 | 把 `slots` 写进硬 `inject` 数组 | 全部 | `git status` 邻仓 + rg + 拔掉 better-sidebar 起 boot 不报错 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-701 | 官方 GUI :3084 已开，插件装载 | 看左栏底部；折叠侧栏；点击「DSH Bot」 | 底部有 🤖 DSH Bot 行（折叠后仅图标）；有 bot 会话运行时黄点；点击后右侧页签条 DSH Bot 激活 | 本机用户 | browser | EVD-701 |
| UF-702 | 打开一个 bot 会话（如 `v1 leftover t18`） | 看标题栏；点「人设」按钮 | 标题栏预设标旁出现人设头像+名；点按钮后页签打开且名册滚到/高亮该人设 | 本机用户 | browser | EVD-702 |
| UF-703 | DSH Bot 页签已开 | 点名册下某个 1:1 会话行 | 官方中栏切到该会话（title 变化）；iframe 内不出现对话面，显示导航空态 | 本机用户 | browser | EVD-703 |
| UF-704 | 页签已开，宿主为暗色 | 切换系统外观为浅色再切回 | iframe 内工作台随之变浅/变暗，无需刷新 | 本机用户 | browser | EVD-704 |
| UF-705 | 页签已开，存在小组「编辑室」 | 点小组行，发一条消息 | 页签内房间完整渲染，成员轮次照旧（三期语义不变） | 本机用户 | browser | EVD-705 |

> 五条 UF 均用户可见，均在 2.3 有流程脚本。

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-701: 左栏入口与徽标

**前置状态**：`sh env/boot.sh` 已起 :3084；浏览器打开 `http://127.0.0.1:3084`；至少有一个 bot 会话。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 页面加载 | 左栏底部「设置」上方出现「🤖 DSH Bot」行 | `ctx.slots.register('sidebar.footer.action', …)` 生效；控件订阅 `sessions` 快照与 v1 `listSessions`（或 BR-705）计算徽标 | 行右侧无徽标（无运行/未读时） |
| 2 | 在另一个 bot 会话发一条消息后切回 | 行右侧出现黄点 | `sessions` 快照该会话 `running=true` | 黄点脉动 |
| 3 | 点击左栏折叠钮 | 行只剩 🤖 图标，徽标仍在 | owner `wide=false` | 56px rail 内可点 |
| 4 | 点击「DSH Bot」 | 右侧页签条 DSH Bot 高亮 | `activateTab(DSH_BOT_SESSIONS_TAB_ID)`；无此 tab 则 `openTab` | 页签内容出现 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| better-sidebar 未装 | `ctx.inject(['betterSidebar'])` 回调不触发 | 入口行仍显示，点击后 toast「需要 dsh-better-sidebar」 | console warn 一条，不抛错 | 装插件后刷新 |
| slots 服务缺失 | ASM-701 证伪 | 左栏无入口行，其他功能正常 | `ctx.inject(['slots'])` 回调不触发，warn | 见 Task 1 降级决策 |
| 身份/会话查询失败 | :3084 host 500 或网络断 | 入口行显示但徽标隐藏 | 请求 `ok:false` 被吞为「无徽标」，不 toast | 下次轮询恢复 |

**界面状态机**：

```text
absent(slots 缺) → mounted(无徽标) → badge:running → badge:unread → mounted
                                   ↘ click → tab-active / toast(no-sidebar)
```

**入口接线清单**：

- `packages/ui-dsh-bot/src/client/index.ts` `apply()` 内新增 `ctx.inject(['slots'], …)` → `ctx.slots.register({ name:'sidebar.footer.action', id:'dsh-bot', order:… }, FooterAction)`
- `FooterAction` onClick → `betterSidebar.activateTab` / `openTab`（已在 `ctx.inject(['betterSidebar'])` 闭包内拿到的服务）

#### UF-702: bot 会话标题栏身份标与「人设」按钮

**前置状态**：官方 GUI 打开 `v1 leftover t18`（marks 含 `bot:dsh-bot`）。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 打开该会话 | 标题栏官方预设标右侧短暂空白（≤300ms） | 控件从 kit 取 `sessionId`，调 `sessionIdentity`（BR-705）或读缓存 | 出现 `D` 头像 + 「DSH Bot」 |
| 2 | — | `header.utilities` 出现「🤖 人设」按钮（Session log 左侧） | 同一身份结果驱动 | — |
| 3 | 点「人设」 | 右侧页签条 DSH Bot 激活 | `activateTab/openTab` + `iframe.contentWindow.postMessage({type:'dsh-bot/focus-bot', botId})` | 页签名册高亮 DSH Bot 行并滚入视口 |
| 4 | 切到 `重构 api.ts…`（非 bot 会话） | 身份标与按钮消失 | identity 为 null → 返回 null | 标题栏与官方原生一致 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 身份接口失败 | host `ok:false` / 超时 2s | 两处都不渲染（不显示「未知」） | console warn，按 null 处理 | 切会话再回来重查 |
| bot 已被删除 | marks 有 `bot:x` 但 `bots.json` 无 x | 不渲染 | host 返回 null | — |
| 页签未注册（无 better-sidebar） | 按钮点击 | toast「需要 dsh-better-sidebar」 | 同 UF-701 | — |

**界面状态机**：

```text
loading → identified(头像+名, 按钮可点) | anonymous(不渲染)
              ↘ 切换会话 → loading
```

**入口接线清单**：

- `ctx.slots.register({ name:'conversation.session.header.actions', id:'dsh-bot-identity', order:10 }, IdentityBadge)`
- `ctx.slots.register({ name:'conversation.session.header.utilities', id:'dsh-bot-open', order:0 }, OpenBotButton)`
- 两者共用 `useSessionIdentity(sessionId)`（内部调 `POST /dsh-bot/sessionIdentity`，per-session 缓存）

#### UF-703: 页签内会话行 → 官方中栏打开（导航模式）

**前置状态**：DSH Bot 页签已开（iframe 已加载），名册下「诗人小北」有会话「九月」。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 页签加载 | 右侧对话区显示导航空态「选一个会话，在左侧官方面板打开」，无 composer | `isStandaloneWorkbench()===false` → `App` 走 `embedded` 布局 | 页签只有名册 + 空态 |
| 2 | 点「九月」行 | 行高亮，空态文案变「已在左侧打开：九月」 | 复用 `requestSessionJump` 桥 → 宿主 `sessions.open(id)`；成功 ACK 回 iframe | 官方中栏切到「九月」，`document.title` 含「九月」 |
| 3 | 点「＋ 新开对话」 | 按钮 loading | `createBotSession` → 得 sessionId → 桥 `sessions.open` | 官方中栏出现该新会话（空对话） |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 桥 ACK 超时 | 宿主 1.5s 未回 | 空态显示「打开失败，复制会话 ID」按钮 | 既有 `jump.ts` 超时分支 | 手动粘贴 ID |
| 会话是隐藏会话 | 点 `~dsh-bot:` 前缀行 | 同主路径；若官方不落地 `list.current`，行旁提示「隐藏会话需在设置开启显示」 | 复用 session-nav 阻塞项结论（Task 1 复测） | 见 session-nav 序号 4 |
| 直开 `/dsh-bot/ui` | `window.parent===window` | 完整对话面照旧 | 不进导航模式 | — |

**界面状态机**：

```text
embedded.idle → jumping(行 loading) → opened(文案更新) | failed(复制 ID)
standalone → 原对话面（不在本包改动范围）
```

**入口接线清单**：

- `packages/workbench-ui/src/App.tsx` 布局分叉：`isStandaloneWorkbench() ? <Conversation/> : <EmbeddedNav/>`
- `Roster.tsx` `BoundSessions` 行 onClick → `requestSessionJump(sessionId)`（既有 `jump.ts`）
- `Roster.tsx`「新开对话」onClick → `createBotSession` → `requestSessionJump`

#### UF-704: 主题跟随宿主

**前置状态**：页签已开，系统外观为深色。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 页签加载 | iframe 首帧即为深色 | 宿主 `DshBotTab` 在 iframe `load` 后立即 `postMessage({type:'dsh-bot/theme', scheme:'dark'})`；iframe `html[data-theme=dark]` | 与宿主一致 |
| 2 | 系统切浅色 | ≤500ms iframe 变浅色 | 宿主 `MutationObserver`/`matchMedia` 感知 → 再发一次 theme 消息 | 左栏、名册、空态全部浅色 |
| 3 | 切回深色 | 同步变回 | 同上 | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 消息来源校验失败 | 非同源 `event.origin` | 忽略 | workbench 只接受 `location.origin` 且 `source===window.parent` | — |
| 宿主属性读不到（ASM-704 证伪） | `colorScheme` 为空 | iframe 按 `prefers-color-scheme` 跟系统 | 宿主降级发 `matchMedia` 结果 | — |
| 直开 | 无 parent | 按 `prefers-color-scheme` | 不等消息 | — |

**界面状态机**：

```text
theme:unknown(首帧 prefers) → theme:dark ⇄ theme:light（由宿主消息驱动）
```

**入口接线清单**：

- `packages/ui-dsh-bot/src/client/DshBotTab.tsx` iframe `onLoad` + 主题监听 → `postMessage`
- `packages/workbench-ui/src/main.tsx` 注册 `message` 监听 → `document.documentElement.dataset.theme`
- `styles.css` 增 `:root[data-theme="light"]` 变量组

#### UF-705: 小组房间在页签内回归

**前置状态**：页签已开，小组「编辑室」存在。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点小组行 | 右侧渲染房间对话面（非导航空态） | `embedded` 布局对 `kind==='group'` 例外，走原 `Conversation` | 成员 chips、房间历史 |
| 2 | 发一条消息 | composer 锁定、typing 指示 | `prompt` → `runGroupRound` | 成员依次回复（三期语义） |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 成员轮次失败 | 某成员超时 | 房间落一条 error 行，其他成员继续 | 三期既有行为 | 重发 |
| 点小组行旁的「在 DSH 打开」 | 不应出现 | 小组行无该菜单项 | `enableJump:false` 保持 | — |

**界面状态机**：沿三期 group-chat spec §2.3（不重复）。

**入口接线清单**：

- `App.tsx` `embedded` 分叉需保留 `current.kind==='group'` → `<Conversation/>`

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-701 | 官方中栏行为零改动：流式/停止/排队/附件/审批全由官方提供，本包不注册 `conversation.view`/`composer`/`chat.node` | BR-706 | `rg "conversation.view\|conversation.composer\|chat.node" packages/ui-dsh-bot/src` 为空 |
| INV-702 | 直开 `http://127.0.0.1:3084/dsh-bot/ui` 的完整工作台（roster/对话/人设 CRUD/小组）行为与三期一致 | BR-703 | 既有 `packages/workbench-ui/tests/*.spec.*` 全过 + 5.2 直开抽验 |
| INV-703 | v1 `dsh_bot_ask`、`dsh-bot.model` override、marks CLI、`listSessions/createSession` 契约不变 | BR-705 | `pnpm test` 既有 `ask.spec.ts`/`rpc.spec.ts` 全过 |
| INV-704 | 一口一仓 :3084、邻仓 porcelain 干净（vibee 既有 `?? .vibee/` 除外）、`rg -i 'anysphere\|sand://' packages/` 为空、运行数据不入 git | BR-706 | 收尾命令 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-700 | log+screenshot | Task 1 校准：ASM-701~704 各一条实测结论 + hero 预设下拉截图 | `evidence/phase-0/calibration.md`、`evidence/phase-0/hero-preset-menu.png` |
| EVD-701 | screenshot+dom | 左栏入口宽/折叠两态、黄点态、点击后页签激活；`footer.action` DOM 子节点 json | `evidence/UF-701/` |
| EVD-702 | screenshot+dom | bot 会话标题栏身份标 + 按钮；非 bot 会话对照；点按钮后名册高亮 | `evidence/UF-702/` |
| EVD-703 | screenshot+console | 页签空态、点击后 `document.title`、桥 ACK console 行 | `evidence/UF-703/` |
| EVD-704 | screenshot | 暗/浅两张同位置截图 | `evidence/UF-704/` |
| EVD-705 | screenshot | 小组房间一轮回复 | `evidence/UF-705/` |
| EVD-706 | api | `sessionIdentity` curl request/response 三例（bot/非 bot/不存在） | `evidence/API-705/` |
| EVD-707 | log | 各 Phase 命令输出、最终四命令 | `evidence/phase-{N}/` |

### 2.6 角色与权限矩阵

单一本机用户，loopback，无权限差异（沿各期 §2.6）。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 依赖缺失 | 从 profile 移除 dsh-better-sidebar 后 boot | 打开 GUI | 无入口/按钮、无 PENDING、console 一条 warn；官方界面正常 | EVD-707 `phase-1/no-sidebar.log` |
| 空数据 | `bots.json` 只有种子 bot、无会话 | 打开 GUI | 入口行显示无徽标；任意会话无身份标 | EVD-701 |
| 网络/依赖失败 | host 停掉 :3084 后端 RPC（GUI 仍在） | 切换会话 | 身份标不渲染、不 toast；恢复后再查 | EVD-702 `fail-host.png` |
| 重复点击 | 快速连点「人设」按钮 5 次 | — | 页签只激活一次，无重复 postMessage 副作用 | EVD-702 console |
| 旧数据兼容 | v1 只有 `kind:dsh-bot` 无 `bot:` 的会话 | 打开 | 身份归默认 bot（沿二期对账规则）→ 显示 DSH Bot | EVD-702 |

### 2.8 非目标

- **记忆、例程/定时唤醒、bot 互发消息、关系图**：需要 host 新能力，另立包（`dsh-bot-memory`、`dsh-bot-routines`）。
- **官方会话树行内身份 chip**：`sidebar.workspaces` 是 single 座位，加法不可达（1.3 已勘察）。
- **hero 人设卡墙 / 替换 `conversation.hero.agentPreset`**：single 座位不注册；若 ASM-703 成立，官方下拉已够用。
- **`conversation.input.left` 的 @/表情按钮**：官方 composer 无 bot 语义可挂，本包不加（等 bot 互发消息包）。
- **iframe 迁为原生 React 页签**：本包保留 iframe，只收窄其嵌入模式；原生化另评估。
- **token 流式/附件/搜索/审批 UI**：官方已提供，本包不做也不再列为"后续"——各期 §2.8 中"token 级流式留后续包"表述由 Task 11 改写。

---
## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
官方壳 ──better-sidebar 页签──> iframe /dsh-bot/ui（名册 + 自绘对话面 + 轮询）
        官方左栏/标题栏/主题 与插件无关；跳转靠 postMessage 桥；iframe 永远深色

After:
官方壳
 ├─ sidebar.footer.action ──> 「DSH Bot」入口 + 徽标 ──activateTab──┐
 ├─ header.actions ─────────> 人设头像+名（bot 会话才有）              │
 ├─ header.utilities ───────> 「人设」按钮 ──activateTab + focusBot──┤
 └─ better-sidebar 页签 ────> iframe /dsh-bot/ui（嵌入模式）<─────────┘
                               ├─ 名册（点行 → 桥 sessions.open → 官方中栏）
                               ├─ 小组房间（仍在 iframe 内渲染）
                               └─ 主题由宿主 postMessage 驱动
host: + POST /dsh-bot/sessionIdentity（只读 marks + bots.json）
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/ui-dsh-bot` | 官方客户端插件 | `apply()` 内 `ctx.inject(['slots'])` 软依赖，注册三个 list 座位控件；`DshBotTab` 增主题广播与 `focusBot` 转发；新增 `identity.ts`（身份查询 + 缓存）、`slots/*.tsx` |
| `packages/dsh-bot-host` | host RPC | `workbench-routes.ts` 新增 `sessionIdentity` 分派；实现放 `workbench-sessions.ts`（复用 `parseBotMark` + bots 注册表） |
| `packages/workbench-ui` | iframe 工作台 | `App.tsx` 按 `isStandaloneWorkbench()` 分叉出 `EmbeddedNav`；`main.tsx` 接 theme/focus 消息；`styles.css` 加浅色变量 |
| `docs/` + `README.md` | 文档 | 改写"两个入口功能等价"；给二期「独立面等价性」规则加注；撤各期 §2.8 "流式留后续"表述 |

### 3.3 三段式定位清单

> 行号只是 hint；漂移时以 symbol + rg anchor 为准。全部 anchor 已于 2026-09-06 用 `rg -c` 核验命中。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/ui-dsh-bot/src/client/inject.ts` | `export const inject` | `rg "export const inject" packages/ui-dsh-bot/src/client/inject.ts` | L5 | 保持 `['sessions','locale']`，`slots` 走软 inject |
| `packages/ui-dsh-bot/src/client/index.ts` | `registerTab` 调用块 | `rg "registerTab" packages/ui-dsh-bot/src/client/index.ts` | L61-104 | 在同一 `apply()` 内新增 `ctx.inject(['slots'], …)` |
| `packages/ui-dsh-bot/src/client/DshBotTab.tsx` | `WORKBENCH_SRC` | `rg "WORKBENCH_SRC" packages/ui-dsh-bot/src/client/DshBotTab.tsx` | L99/L190-196 | iframe onLoad 后发 theme；暴露 `focusBot` |
| `packages/ui-dsh-bot/src/client/session-jump.ts` | `export function jumpToSession` | `rg "export function jumpToSession" packages/ui-dsh-bot/src/client/session-jump.ts` | L36 | 复用 |
| `packages/ui-dsh-bot/src/client/rpc.ts` | `DshBotSessionRow` | `rg "DshBotSessionRow" packages/ui-dsh-bot/src/client/rpc.ts` | L7-15 | 同文件加 `sessionIdentity` 调用 |
| `packages/ui-dsh-bot/src/client/tab-id.ts` | `DSH_BOT_SESSIONS_TAB_ID` | `rg "DSH_BOT_SESSIONS_TAB_ID" packages/ui-dsh-bot/src/client/tab-id.ts` | L1-10 | activateTab/openTab 用同一 id |
| `packages/ui-dsh-bot/src/client/locales.ts` | `export const NS` | `rg "export const NS" packages/ui-dsh-bot/src/client/locales.ts` | L49 | 新文案 key 加入 zh/en |
| `packages/ui-dsh-bot/package.json` | `dsh-client-ui-sidebar` 注入声明 | `rg "dsh-client-ui-sidebar" packages/ui-dsh-bot/package.json` | — | 视 Task 1 结论增 `dsh-client-ui-settings`（如需） |
| `packages/dsh-bot-host/src/marks.ts` | `export function parseBotMark` | `rg "export function parseBotMark" packages/dsh-bot-host/src/marks.ts` | L39 | 身份接口复用 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `listBotSessions` 分派 | `rg "listBotSessions" packages/dsh-bot-host/src/workbench-routes.ts` | L177-227 | 旁加 `sessionIdentity` case |
| `packages/dsh-bot-host/src/ask.ts` | `listBotSessions` 实现 | `rg "listBotSessions" packages/dsh-bot-host/src/ask.ts` | — | 参考其 marks 读取路径 |
| `packages/dsh-bot-host/src/bots.ts` | `MANAGED_PRESET_PREFIX` / bots 注册表导出 | `rg "MANAGED_PRESET_PREFIX" packages/dsh-bot-host/src/bots.ts` | L20 | 身份接口读 name/avatar |
| `packages/workbench-ui/src/jump.ts` | `export function isStandaloneWorkbench` | `rg "export function isStandaloneWorkbench" packages/workbench-ui/src/jump.ts` | L16-17 | 嵌入分叉依据 |
| `packages/workbench-ui/src/App.tsx` | `listBotSessions` 轮询 / 布局 | `rg "listBotSessions" packages/workbench-ui/src/App.tsx` | L180-216 | 嵌入模式停掉 1:1 history 轮询、换 `EmbeddedNav` |
| `packages/workbench-ui/src/Conversation.tsx` | `composerLocked` | `rg "composerLocked" packages/workbench-ui/src/Conversation.tsx` | L395 | 嵌入模式仅小组路径渲染本组件 |
| `packages/workbench-ui/src/Roster.tsx` | `BoundSessions` | `rg "BoundSessions" packages/workbench-ui/src/Roster.tsx` | L342 | 行 onClick 接桥；接收 `focusBot` 高亮 |
| `packages/workbench-ui/src/SessionList.tsx` | `SessionJumpMenuItem` | `rg "SessionJumpMenuItem" packages/workbench-ui/src/SessionList.tsx` | L45 | 嵌入模式下菜单项文案改为主动作 |
| `packages/workbench-ui/src/styles.css` | `color-scheme` | `rg "color-scheme" packages/workbench-ui/src/styles.css` | L2 | 改为 `:root[data-theme]` 两组变量 |
| `docs/dsh-bot-workbench/spec.md` | 二期「独立面等价性」规则行 | `rg "独立面等价性" docs/dsh-bot-workbench/spec.md` | — | 加"已由 native-surface BR-703 收窄"注 |
| `README.md` | 「两个入口功能等价」 | `rg "两个入口功能等价" README.md` | L58 | 改写 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 是 | 新增 `POST /dsh-bot/sessionIdentity`（只读）；既有方法不变 | 加法；未知方法仍走既有 `{ok:false}` |
| 数据 | 否 | 只读 marks / bots.json，不写 | — |
| 权限 | 否 | loopback 单用户 | — |
| 路由 | 否 | 仍 `/dsh-bot/*` prefix，不开新端口 | — |

---

## 4. Phase 计划与任务详情

```text
P0 校准(1) ─┬─> P1 host 身份接口(2,3) ─┬─> P2 客户端 slot 控件(4,5,6,7,8) ─┬─> P4 收尾(12,13,14)
            └─────────────────────────> P3 workbench 嵌入模式(9,10,11) ───┘
```

> 实现任务 8 条（2,4,5,6,7,9,10,12）≥ 8 → 状态板用同目录 `tasks.csv`。

### Phase 0: 校准假设

> 你在哪里：四条 ASM 只有 `.d.ts` 依据，未在真机验证。
> 做完之后：每条 ASM 有实测结论，证伪者已按 shared-rules §12 变更本 spec。

### Task 1: 校准 ASM-701~704 与隐藏会话 open 行为

- **关联**：ASM-701 / ASM-702 / ASM-703 / ASM-704 / EVD-700 / UF NA（内部校准）
- **前置任务**：无
- **风险等级**：P0

**为什么做**：三个 slot 控件全部建立在"客户端 ctx 会给本插件 `slots` 服务"上；`activateTab` 语义与主题属性决定 BR-701/704 的实现分支。

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/index.ts`：`registerTab`，`rg "registerTab" packages/ui-dsh-bot/src/client/index.ts`，L61-104
- `env/profiles/gb/node_modules/dsh-better-sidebar/lib/types/client/service.d.ts`：`openTab` / `activateTab`，L296-398（只读）

**具体操作**：

1. 在 `apply()` 临时加 `ctx.inject(['slots'], s => console.info('dsh-bot slots ok', Object.keys(s.slots)))`，`pnpm run build` 后 `sh env/boot.sh`，浏览器 console 观察是否打印（ASM-701）。
2. console 执行 `document.querySelector('[data-dsh-better-sidebar]')` 所在 React 树里的 `activateTab('dsh-bot:sessions')`（经 vibee 同款 `ctx.inject(['betterSidebar'])` 闭包临时挂到 `window.__dshBotSidebar`），观察页签是否激活（ASM-702）。
3. 打开 hero，截图 Agent 预设下拉是否列出 `dsh-bot--*` 人设（ASM-703）→ `evidence/phase-0/hero-preset-menu.png`。
4. console：`getComputedStyle(document.documentElement).colorScheme`、`document.documentElement.getAttributeNames()`；切系统外观后重查（ASM-704）。
5. 复测 session-nav 阻塞项：对一个 `~dsh-bot:` 隐藏会话调 `sessions.open`，记录 `list.current` 是否落地。
6. 结论写 `evidence/phase-0/calibration.md`；证伪的 ASM 按 §12 改第 2 章并在 1.5 建变更记录；证实的回写 1.3 并从 1.4 删除。移除临时代码。

**验证**：`ls evidence/phase-0/calibration.md evidence/phase-0/hero-preset-menu.png` → 两文件存在；`git diff --stat packages/` → 无残留临时代码

**Evidence**：`evidence/phase-0/`

**注意事项**：禁止在此任务顺手实现控件；`豁免回归:单任务校准 Phase，验证已含命令与 evidence`。

### Phase 1: host 身份查询接口

> 你在哪里：客户端只能靠 v1 `listSessions` 全量拉 tags 反推身份。
> 做完之后：一个批量只读接口按 sessionId 给出 bot 身份。

### Task 2: 实现 POST /dsh-bot/sessionIdentity

- **关联**：BR-705 / INV-703 / EVD-706 / UF NA（供 UF-701/702 消费）
- **前置任务**：1
- **风险等级**：P1

**为什么做**：标题栏身份标每次切会话都要查一次，不能拉全量列表。

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-routes.ts`：`listBotSessions` 分派，`rg "listBotSessions" packages/dsh-bot-host/src/workbench-routes.ts`，L177-227
- `packages/dsh-bot-host/src/marks.ts`：`parseBotMark`，`rg "export function parseBotMark" packages/dsh-bot-host/src/marks.ts`，L39
- `packages/dsh-bot-host/src/bots.ts`：bots 注册表读取，`rg "MANAGED_PRESET_PREFIX" packages/dsh-bot-host/src/bots.ts`，L20

**具体操作**：

1. 在 `workbench-sessions.ts` 新增 `resolveSessionIdentity(sessionIds)`：读 marks（复用 `listBotSessions` 的 marks 读取路径）→ `parseBotMark` → 查 bots 注册表 → `{ botId, name, avatar } | null`；v1 只有 `kind:dsh-bot` 无 `bot:` 的归 `SEED_BOT_ID`（沿二期对账规则，不写标）。
2. `workbench-routes.ts` 加 `case 'sessionIdentity'`；参数校验：数组、≤50、字符串；越界返回 `{ok:false, error}`。
3. `packages/dsh-bot-host/tests/workbench-sessions.spec.ts` 加 3 例：bot 会话 / 非 bot / bot 已删。
4. 实测 ASM-705：`time curl -s -X POST http://127.0.0.1:3084/dsh-bot/sessionIdentity -H 'content-type: application/json' -d '{"args":{"sessionIds":["<真实 id>"]}}'`，三例 request/response 存 `evidence/API-705/`。

**验证**：`pnpm test -- workbench-sessions` → 新增 3 例通过；curl 三例返回 `ok:true` 且形状正确

**Evidence**：`evidence/API-705/identity-bot.json`、`identity-plain.json`、`identity-missing.json`

**注意事项**：禁止在此接口内调 reconcile 补标（BR-705）；错误一律 `{ok:false}` 而非 HTTP 500。

### Task 3: 执行 Phase 1 回归验证

- **关联**：BR-705 / INV-703
- **前置任务**：2

**验证**：`pnpm run typecheck && pnpm test` → 全过；`bash scripts/manual-test.sh --no-write` → v1 链路仍通

**Evidence**：`evidence/phase-1/`

### Phase 2: 客户端 slot 控件（ui-dsh-bot）

> 你在哪里：插件在官方壳里零存在感，只有 better-sidebar 页签。
> 做完之后：左栏入口 + 标题栏身份 + 主题广播三件都长在官方座位上，且缺依赖时软降级。

### Task 4: 注入 slots 软依赖与注册骨架

- **关联**：BR-706 / INV-701 / UF NA（基础设施，被 UF-701/702 依赖）
- **前置任务**：1
- **风险等级**：P1

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/index.ts`：`registerTab`，`rg "registerTab" packages/ui-dsh-bot/src/client/index.ts`，L61-104
- `packages/ui-dsh-bot/src/client/inject.ts`：`export const inject`，`rg "export const inject" packages/ui-dsh-bot/src/client/inject.ts`，L5

**具体操作**：

1. 新建 `packages/ui-dsh-bot/src/client/slots/register.ts`：`registerSlots(ctx, deps)`，内部 `ctx.slots.inject('<slot>', () => ctx.slots.register({ name, id:'dsh-bot-…', order }, Component))`，形状对齐 vibee（只读参考）。
2. `index.ts` `apply()` 内 `ctx.inject(['slots'], raw => registerSlots(raw, { sidebarRef, sessions, locale }))`；`inject.ts` 不变（BR-706）。
3. `sidebarRef` 由既有 `ctx.inject(['betterSidebar'])` 闭包写入，控件点击时若为空则 toast「需要 dsh-better-sidebar」。
4. `packages/ui-dsh-bot/tests/apply-sidebar.spec.ts` 加：无 `slots` 时 apply 不抛；有 `slots` 时 register 被调三次（footer.action / header.actions / header.utilities）。

**验证**：`pnpm test -- apply-sidebar` → 通过；`rg "conversation.view|conversation.composer|chat.node" packages/ui-dsh-bot/src` → 无命中（INV-701）

**Evidence**：`evidence/phase-2/task4-tests.log`

**注意事项**：禁止把 `slots` 加进硬 `inject` 数组；禁止注册任何 single 座位。

### Task 5: 左栏「DSH Bot」入口与徽标

- **关联**：BR-701 / UF-701 / EVD-701
- **前置任务**：2；4
- **风险等级**：P1

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/slots/register.ts`（Task 4 新建）
- `packages/ui-dsh-bot/src/client/tab-id.ts`：`DSH_BOT_SESSIONS_TAB_ID`，`rg "DSH_BOT_SESSIONS_TAB_ID" packages/ui-dsh-bot/src/client/tab-id.ts`
- `packages/ui-dsh-bot/src/client/rpc.ts`：`DshBotSessionRow`，`rg "DshBotSessionRow" packages/ui-dsh-bot/src/client/rpc.ts`，L7-15

**具体操作**：

1. 新建 `slots/FooterAction.tsx`：props `{ wide }`；`wide=false` 只画 🤖。
2. 徽标：订阅 `sessions` 快照（`running` 位，1.3 已勘察）∩ bot 会话集合（v1 `listSessions` tags 含 `bot:`，2s 轮询沿既有 `rpc.ts`）→ 黄点；官方"完成未读"位 → 数字。
3. onClick：`sidebarRef.activateTab(DSH_BOT_SESSIONS_TAB_ID)`；抛错或无 tab → `openTab({ type: DSH_BOT_SESSIONS_TAB_ID })`（按 Task 1 结论调整）；`sidebarRef` 为空 → toast。
4. `locales.ts` 加 `footer.label`、`footer.needSidebar` zh/en。
5. `tests/footer-action.spec.tsx`：wide/rail 两态渲染、徽标三态、点击调用。

**验证**：`pnpm test -- footer-action` → 通过；真机 `document.querySelector('[data-slot="sidebar.footer.action"]').textContent` 含「DSH Bot」

**Evidence**：`evidence/UF-701/footer-wide.png`、`footer-rail.png`、`footer-running.png`、`footer-dom.json`

**注意事项**：徽标请求失败静默（UF-701 失败分支）；禁止 O(N) 按 bot 扇出请求，只用一次 `listSessions`。

### Task 6: 标题栏身份标与「人设」按钮

- **关联**：BR-702 / UF-702 / EVD-702 / EVD-706
- **前置任务**：2；4
- **风险等级**：P1

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/slots/register.ts`（Task 4）
- `packages/ui-dsh-bot/src/client/rpc.ts`：`DshBotSessionRow` 同文件新增 `sessionIdentity()` 调用
- `packages/ui-dsh-bot/src/client/DshBotTab.tsx`：`WORKBENCH_SRC`，`rg "WORKBENCH_SRC" packages/ui-dsh-bot/src/client/DshBotTab.tsx`，L99

**具体操作**：

1. 新建 `identity.ts`：`useSessionIdentity(sessionId)`，调 `sessionIdentity`（BR-705），per-session Map 缓存，2s 超时按 null。
2. 新建 `slots/IdentityBadge.tsx`（`header.actions`, order 10）：null → 返回 null；否则头像色块（复用 workbench `avatar` 生成规则的 emoji/首字+色）+ 名。
3. 新建 `slots/OpenBotButton.tsx`（`header.utilities`, order 0）：null → null；onClick = Task 5 的 activate/open + `DshBotTab` 暴露的 `focusBot(botId)`（向 iframe `postMessage({type:'dsh-bot/focus-bot', botId})`，同源）。连点去抖 300ms（2.7 重复点击）。
4. `DshBotTab.tsx` 用 ref/事件总线暴露 `focusBot`，iframe 未就绪时缓存最近一次并在 `load` 后补发。
5. `tests/identity-badge.spec.tsx`：bot/非 bot/接口失败三态。

**验证**：`pnpm test -- identity-badge` → 通过；真机打开 `v1 leftover t18`，`[data-slot="conversation.session.header.actions"]` 含 DSH Bot；打开非 bot 会话不含

**Evidence**：`evidence/UF-702/bot-session-header.png`、`plain-session-header.png`、`focus-bot.png`、`fail-host.png`

**注意事项**：失败态不渲染「未知」（BR-702 反例）；order 排在官方预设标之后。

### Task 7: 宿主主题广播

- **关联**：BR-704 / UF-704（宿主半边）
- **前置任务**：4
- **风险等级**：P2

**涉及文件与定位**：

- `packages/ui-dsh-bot/src/client/DshBotTab.tsx`：`WORKBENCH_SRC` 处的 iframe，L190-196

**具体操作**：

1. 按 Task 1 结论选主题源（`colorScheme` 计算样式 / `data-*` 属性 / 降级 `matchMedia`）。
2. iframe `onLoad` 立即 `postMessage({type:'dsh-bot/theme', scheme}, location.origin)`；`MutationObserver`（或 `matchMedia.change`）监听变化再发。
3. `tests/tab.spec.tsx` 加：load 后发送一次、主题变化再发一次。

**验证**：`pnpm test -- tab` → 通过

**Evidence**：`evidence/phase-2/task7-tests.log`

### Task 8: 执行 Phase 2 回归验证

- **关联**：BR-701 / BR-702 / BR-704 / BR-706 / INV-701
- **前置任务**：5；6；7

**验证**：`pnpm run typecheck && pnpm test && pnpm run build` → 全过；`sh env/boot.sh` 后真机：入口行、身份标出现；从 profile 临时移除 dsh-better-sidebar 再 boot → GUI 正常、console 仅 warn（2.7 依赖缺失）

**Evidence**：`evidence/phase-2/`（含 `no-sidebar.log`）

### Phase 3: workbench 嵌入导航模式与主题接收

> 你在哪里：iframe 在页签里画了第二套对话面，且永远深色。
> 做完之后：嵌入时 1:1 只导航、小组仍在页签内聊；颜色跟宿主。

### Task 9: 嵌入导航模式 EmbeddedNav 与会话行接线

- **关联**：BR-703 / UF-703 / UF-705 / INV-702 / EVD-703 / EVD-705
- **前置任务**：1
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/App.tsx`：`listBotSessions` 轮询/布局，`rg "listBotSessions" packages/workbench-ui/src/App.tsx`，L180-216
- `packages/workbench-ui/src/jump.ts`：`isStandaloneWorkbench`，L16-17
- `packages/workbench-ui/src/Roster.tsx`：`BoundSessions`，L342
- `packages/workbench-ui/src/SessionList.tsx`：`SessionJumpMenuItem`，L45
- `packages/workbench-ui/src/Conversation.tsx`：`composerLocked`，L395（小组路径保留）

**具体操作**：

1. 新建 `EmbeddedNav.tsx`：空态「选一个会话，在左侧官方面板打开」/ 跳转中 / 已打开「已在左侧打开：`{title}`」/ 失败「复制会话 ID」（复用 `jump.ts` 超时分支）。
2. `App.tsx`：`embedded = !isStandaloneWorkbench()`；`embedded && current.kind==='bot'` → 渲染 `EmbeddedNav`，并**停用**该分支的 1:1 `useSessionPoll`；`current.kind==='group'` 仍渲染 `Conversation`。
3. `Roster.tsx` `BoundSessions` 行：嵌入时 onClick 直接 `requestSessionJump(sessionId)`（不再先在 iframe 内选中）；「＋新开对话」→ `createBotSession` → `requestSessionJump`。
4. `SessionList.tsx`：嵌入时 `SessionJumpMenuItem` 变为默认动作文案「打开」，小组行保持 `enableJump:false`。
5. 接收 `dsh-bot/focus-bot` 消息（同源 + `source===window.parent` 校验）→ 选中该 bot 并滚动高亮名册行。
6. 测试：`tests/app.spec.tsx` 加嵌入/直开两分叉；`tests/jump.spec.ts` 加 focus-bot 校验。

**验证**：`pnpm test -- app jump` → 通过；真机页签点「九月」→ `document.title` 含「九月」且 iframe 内无 `.transcript`

**Evidence**：`evidence/UF-703/embedded-idle.png`、`embedded-opened.png`、`bridge-console.log`；`evidence/UF-705/room-round.png`

**注意事项**：直开路径零改动（INV-702）；禁止在嵌入模式仍轮询 1:1 history。

### Task 10: 主题接收与浅色变量

- **关联**：BR-704 / UF-704 / EVD-704
- **前置任务**：7；9
- **风险等级**：P2

**涉及文件与定位**：

- `packages/workbench-ui/src/styles.css`：`color-scheme`，`rg "color-scheme" packages/workbench-ui/src/styles.css`，L2
- `packages/workbench-ui/src/main.tsx`：入口挂载点

**具体操作**：

1. `styles.css`：`:root[data-theme="dark"]` 保留现值；新增 `:root[data-theme="light"]` 变量组（参考官方浅色：中栏白、左栏 `#f9fafb`，1.3 已勘察）；去掉全局 `color-scheme: dark` 硬编码。
2. `main.tsx`：首帧 `data-theme` 按 `prefers-color-scheme`；监听 `message`，校验 `event.origin===location.origin && event.source===window.parent && type==='dsh-bot/theme'` 后设 `data-theme`。
3. `tests/app.spec.tsx` 加：非同源消息被忽略、同源消息切换 `data-theme`。

**验证**：`pnpm test -- app` → 通过；`rg "color-scheme: dark" packages/workbench-ui/src/styles.css` → 无命中

**Evidence**：`evidence/UF-704/dark.png`、`light.png`

### Task 11: 执行 Phase 3 回归验证

- **关联**：BR-703 / BR-704 / INV-702
- **前置任务**：9；10

**验证**：`pnpm run typecheck && pnpm test && pnpm run build` → 全过；直开 `http://127.0.0.1:3084/dsh-bot/ui` 走一遍 roster→对话→人设编辑（INV-702）

**Evidence**：`evidence/phase-3/`

### Phase 4: 文档同步、真实场景与收尾

### Task 12: 同步文档与各期非目标表述

- **关联**：BR-703 / BR-706 / UF NA（文档）
- **前置任务**：8；11
- **风险等级**：P2

**涉及文件与定位**：

- `README.md`：「两个入口功能等价」，`rg "两个入口功能等价" README.md`，L58
- `docs/dsh-bot-workbench/spec.md`：二期「独立面等价性」规则行，`rg "独立面等价性" docs/dsh-bot-workbench/spec.md`

**具体操作**：

1. README「日常使用」改为：页签 = 导航面 + 小组房间；直开 = 完整工作台（调试）；新增左栏入口/身份标说明。
2. 二期「独立面等价性」规则行加注「v0.x：页签模式已由 `../dsh-bot-native-surface/spec.md#BR-703` 收窄」，不改其正文。
3. workbench/group-chat/group-rounds/session-nav 四期 §2.8 中「token 级流式留后续包」类表述各加一句「官方 ui-conversation 已提供，不再列为后续（见 native-surface INV-701）」。
4. `docs/dsh-bot-native-experience/spec.md` §「未闭合面」补一行：`useGlobalKeyboard` 吞 Cmd+K 的嵌入场景由本包 Task 9 收窄后覆盖面变化，需复测。

**验证**：`rg "两个入口功能等价" README.md` → 无命中；`rg -n "native-surface" docs/dsh-bot-workbench/spec.md docs/dsh-bot-group-chat/spec.md docs/dsh-bot-group-rounds/spec.md docs/dsh-bot-session-nav/spec.md` → 各 ≥1 命中

**Evidence**：`evidence/phase-4/docs-diff.md`

### Task 13: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-701 / UF-702 / UF-703 / UF-704 / UF-705（全部用户可见 UF）
- **前置任务**：8；11

**验证**：按 5.2 执行矩阵逐行回放（Playwright channel chrome 对 :3084），全部通过；截图 + console + DOM 断言落盘

**Evidence**：`evidence/UF-701/` ~ `evidence/UF-705/`

### Task 14: 执行 Phase 4 回归验证

- **关联**：全部 BR / INV-704
- **前置任务**：12；13

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/ env/ scripts/` → 空；三邻仓 `git status --porcelain` 干净（vibee `?? .vibee/` 除外）；`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-native-surface --repo .` → 0 FAIL

**Evidence**：`evidence/phase-4/final-commands.log`

---
## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 用户可见的需求必须通过 5.2 真实场景全套测试才算完成——单元测试全绿但界面点不动 = 未完成。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| typecheck | `pnpm run typecheck` | exit 0 | EVD-707 |
| build | `pnpm run build` | exit 0 | EVD-707 |
| unit | `pnpm test` | 全过，含新增 footer-action / identity-badge / app 嵌入分叉 / workbench-sessions identity 用例 | EVD-707 |
| standard | `pnpm run standard:check` | exit 0 | EVD-707 |
| 红线 | `rg -i 'anysphere\|sand://' packages/ env/ scripts/` | 空输出 | EVD-707 |
| 座位纪律 | `rg "conversation.view\|conversation.composer\|chat.node\|sidebar.workspaces" packages/ui-dsh-bot/src` | 空输出（INV-701/BR-706） | EVD-707 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（loopback :3084，已起且身份为本仓则直接退出；先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份） |
| 访问入口 | 官方 GUI `http://127.0.0.1:3084`（UF-701~705）；直开 `http://127.0.0.1:3084/dsh-bot/ui`（INV-702 抽验） |
| 测试账号/数据 | 本机单用户；需存在：≥1 个非默认人设（如「诗人小北」）、≥1 个小组（如「编辑室」）、bot 会话 `v1 leftover t18`、非 bot 会话任意一条；缺失则先用 `/dsh-bot/ui` 直开创建 |
| 干净状态定义 | 每条 UF 前刷新页面；主题测试前系统外观置为深色 |
| 可用测试工具 | Playwright（`../../dsh-genoffice/engine/node_modules/playwright`，`chromium.launch({channel:'chrome'})`，1.3 已实测）；主题切换用 `page.emulateMedia({colorScheme})` + 宿主属性触发（按 Task 1 结论）；DOM 断言用 `data-slot` 选择器，不认 hash class |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-701 主路径 | browser | 2.3 UF-701 步骤 1-4 | `[data-slot="sidebar.footer.action"]` 含「DSH Bot」；折叠后仅图标；有 running 会话时黄点；点击后 better-sidebar `.tabActive` 文本为 DSH Bot | `evidence/UF-701/footer-wide.png`、`footer-rail.png`、`footer-running.png`、`footer-dom.json` |
| UF-701 失败分支 better-sidebar 未装 | browser | 2.3 UF-701 失败分支 1 | 入口行仍在，点击 toast；console 仅 warn 无 error | `evidence/UF-701/no-sidebar.png` + `evidence/phase-2/no-sidebar.log` |
| UF-701 失败分支 查询失败 | browser | 停 host RPC 后刷新 | 入口行在、无徽标、无 toast | `evidence/UF-701/query-fail.png` |
| UF-702 主路径 | browser | 2.3 UF-702 步骤 1-4 | bot 会话 `header.actions` 含头像+名、`header.utilities` 含「人设」；点按钮后页签激活且名册高亮该 bot；切非 bot 会话两处消失 | `evidence/UF-702/bot-session-header.png`、`plain-session-header.png`、`focus-bot.png`、`header-dom.json` |
| UF-702 失败分支 接口失败 | browser | 停 host RPC | 两处不渲染，无「未知」 | `evidence/UF-702/fail-host.png` |
| UF-702 失败分支 bot 已删 | browser | 删一个人设后打开其旧会话 | 两处不渲染 | `evidence/UF-702/deleted-bot.png` |
| UF-703 主路径 | browser | 2.3 UF-703 步骤 1-3 | 页签内无 `.transcript`、有空态；点「九月」后 `document.title` 含「九月」；空态文案更新；「新开对话」建会话并打开 | `evidence/UF-703/embedded-idle.png`、`embedded-opened.png`、`new-session.png`、`bridge-console.log` |
| UF-703 失败分支 桥超时 | browser | 阻断 postMessage ACK（宿主 handler 临时移除） | 出现「复制会话 ID」 | `evidence/UF-703/bridge-timeout.png` |
| UF-703 失败分支 直开 | browser | 直开 `/dsh-bot/ui` | 完整对话面照旧（INV-702） | `evidence/UF-703/standalone.png` |
| UF-704 主路径 | browser | 2.3 UF-704 步骤 1-3 | 深→浅→深，iframe `html[data-theme]` 同步，≤500ms | `evidence/UF-704/dark.png`、`light.png` |
| UF-704 失败分支 非同源消息 | browser | console 向 iframe postMessage 伪造 theme（origin 不同） | 主题不变 | `evidence/UF-704/spoof-ignored.log` |
| UF-705 主路径 | browser | 2.3 UF-705 步骤 1-2 | 页签内房间渲染、成员依次回复 | `evidence/UF-705/room-round.png` |
| UF-705 失败分支 成员失败 | browser | 把 `askTimeoutMs` 调小触发超时 | error 行、其他成员继续 | `evidence/UF-705/member-timeout.png` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。任何一行失败 = 本需求未完成，回到对应任务修复后重跑。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-0/        # calibration.md、hero-preset-menu.png
  phase-1/ ~ phase-4/   # 各 Phase 命令输出；phase-2 含 no-sidebar.log；phase-4 含 final-commands.log、docs-diff.md
  UF-701/ ~ UF-705/     # 截图 + dom json + console log
  API-705/        # sessionIdentity 三例 request/response
```

- EVD ID 必须能在第 2.5 节找到。
- 截图命名含 UF 编号与状态；DOM 断言存 `*-dom.json`。

### 5.4 Review 专项检查清单

- [ ] `packages/ui-dsh-bot/src/client/inject.ts` 仍为 `['sessions','locale']`，`slots`/`betterSidebar` 均经 `ctx.inject` 软依赖（BR-706）
- [ ] 未注册任何 single 座位；三个 list 座位 id 以 `dsh-bot-` 前缀（避免与 ui-jobs / ui-agent-preset 撞 id）
- [ ] `sessionIdentity` 无写副作用（无 mergeBotMarks / reconcile 调用）
- [ ] 嵌入模式下 `useSessionPoll` 对 1:1 不再启动；小组路径保留
- [ ] 直开 `/dsh-bot/ui` 与三期行为一致（INV-702）
- [ ] 5.2 执行矩阵全部通过，evidence 齐全且与 2.5 一致
- [ ] 2.3 每条流程的「入口接线清单」从真实入口可达
- [ ] 所有 BR/UF/INV 可对照第 2 章逐条核销