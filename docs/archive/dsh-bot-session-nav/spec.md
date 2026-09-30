# dsh-bot-session-nav Spec

> Version: 0.2.2 | Date: 2026-09-30 | Status: Done 收缩交付（P1 跳转已交付；T5–T14 收纳/起题/归档/overview 由用户 2026-09-30 拍板不做，见 `../../remaining-prd-decision.md` §5）
>
> 本文件是本需求的**唯一事实源**。四期包:在工作台(`../dsh-bot-workbench/spec.md`,Done)与小组对话(`../archive/dsh-bot-group-chat/spec.md`,Done)之上做「会话导航与展示」。
> 由母包 `../dsh-bot-interaction-master/spec.md` 统筹(先本包后 `../dsh-bot-group-rounds/`)。
> 调研输入:2026-09-01 会话调研(参考产品交互清单 + 插件现状盘点);参考树 `../../../reference` 只读,禁拷代码/文案/品牌。
>
> 填写三态规则:每个表格单元格只允许三种内容——
> 1. 验证过的事实(注明来源命令);2. 显式假设 `ASM-xxx`;3. `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**:DSH Bot 工作台用户。现在 bot 的会话有三个痛点:① 工作台里看到一堆「新对话」分不清谁是谁;② 工作台建的会话全部堆进 DSH 官方侧栏,把用户自己的会话淹了;③ 想看某条会话在官方视图里的完整细节(工具卡/统计)时,没有任何入口跳过去。
- **做什么**:交付「会话导航」:
  1. **点击跳转**:工作台里任何一条 bot 会话可以「在 DSH 打开」——页签内一键切到官方 conversation 视图(隐藏会话也能跳);
  2. **收纳**:工作台新建的 1:1 会话默认从 DSH 官方侧栏收起(标题 `~` 隐藏约定),官方侧栏只留用户自己的会话;设置可关;
  3. **标题**:会话首轮结束后自动用首条用户消息起题(不再满屏「新对话」),支持手动重命名、归档;
  4. **实时 roster**:把「每 2 秒对每个 bot 各发一次请求」的轮询换成单个聚合接口 + SSE 推送,发消息后名单预览/工作中点即时更新。
- **改哪里**:只改本仓——`dsh-bot-host`(起题/收纳/聚合/SSE)、`workbench-ui`(跳转入口/会话行动作/EventSource)、`ui-dsh-bot` 页签(postMessage 桥)。
- **怎么算做完**:页签里点会话行「在 DSH 打开」官方视图直达该会话;开关开着时新会话不再出现在官方侧栏;新会话首轮后自动有标题;两个 bot 同时生成时 roster 状态 ≤2s 更新且网络面板只有 overview/events 两类请求;5.2 矩阵全过且 v1/v2/v3 零回归。
- **不做什么**:token 级流式(后续包)、官方前端 URL 深链(平台无此机制,不硬造)、存量会话批量迁移隐藏(只影响新会话 + 提供单会话手动切换)。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 「涉及到 session 的能否有更好的展示:bot 当前的 session 可以点击触发到 dsh 的对应 session 中(dsh 内是隐藏的);bot 能否切换到属于 bot 的历史 session 而不是一大堆都堆在这里了」+ 调研结论(2026-09-01 会话) |
| 输入类型 | description(用户反馈 + 本会话调研报告) |
| Mode | oneclick(新包;v1/v2/v3 包保持 Done 不改) |
| 置信度 | 高(跳转通道 v1 已用过;隐藏约定 v2/v3 已实证;ASM-401~405 已由 Task 1 消解,见 1.3/1.4) |
| 输出目录 | `docs/dsh-bot-session-nav/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | frontend(跳转入口/会话行动作/SSE 接入)+ backend(起题/收纳/聚合/SSE 通道)+ infra(页签桥) |
| 主要风险 | 归档会话 `sessions.open` 不能落地(工作台默认列表排除即可);iframe 桥必须三重校验 |
| 行号引用策略 | 既有文件 symbol+rg,行号仅 hint;新建文件标「新建」 |
| 必需验收方式 | browser 真实点击(chrome-devtools MCP,v2/v3 已实证)+ 官方 GUI 截图 + RPC/CLI 取证 + 单测 |
| 必须覆盖用户场景 | UF-401 跳转、UF-402 收纳、UF-403 起题与重命名、UF-404 归档、UF-405 实时 roster |

### 1.3 勘察事实清单

> 本轮实际执行命令(2026-09-01 本会话)。路径相对本仓根。

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| v1 页签曾实现「点行跳官方 conversation」:`jumpToSession(sessions, id)` 优先 `sessions.subagentAddress/openSubagent`,回退 `sessions.open(id)`;页签 ctx 注入 `sessions` face(`SessionCwdFace extends SessionJumpFace`) | `git show 8ec18e8:packages/ui-dsh-bot/src/client/DshBotTab.tsx`(head);Read `packages/ui-dsh-bot/src/client/session-jump.ts` | 跳转通道存在,v2 改 iframe 后未再引用但文件保留 |
| `session-jump.ts` 仍在当前树,`DshBotTab.tsx` 现为 iframe 宿主(`iframeRef` L115、`<iframe` L175),tab id `dsh-bot:sessions` 常量在 `tab-id.ts` L2 | `ls packages/ui-dsh-bot/src/client`;`rg -n 'DSH_BOT_SESSIONS_TAB_ID\|iframe' packages/ui-dsh-bot/src/client/DshBotTab.tsx packages/ui-dsh-bot/src/client/tab-id.ts` | 桥接落点明确 |
| 官方 Web 前端静态壳无 URL 会话路由:`location.hash/URLSearchParams/pushState` 与字符串 `session` 在 dist 资产中零匹配(应用 bundle 由网关按 profile 组装) | `rg -a -o 'location\.hash\|URLSearchParams\|pushState' env/profiles/gb/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/*.js`(无匹配);`rg -a -c 'session' …/index-ClqxG24t.js` → rc=1 | 浏览器直开无深链可用,跳转只能在页签内做 |
| 工作台 1:1 创建标题逻辑:显式标题走 `visibleBotTitle`(剥 `~`),否则固定「新对话」;rename 双通道 `platform.renameSession`(L374)与 `sessionTool.rename`(L377)都已在用 | `rg -n 'title' packages/dsh-bot-host/src/workbench-sessions.ts`(L361-362、374、377、385) | 起题/收纳的改造点即此函数 |
| `listOwnedSessions` 隐藏判定 = `kind:hidden` mark 或标题 `~` 前缀(`isTitleHidden(meta.title, ['~'])` L435);默认排除,`includeHidden` 才含;无分页 | `rg -n 'visibleBotTitle\|HIDDEN_KIND\|~' packages/dsh-bot-host/src/workbench-sessions.ts` | 收纳后需给「工作台自建隐藏会话」开例外通道(BR-402) |
| platform 面已有 `createSession`(L207)、`renameSession`(L245)、`archiveSession`(L118)、`listSessions`(L267) | `rg -n 'renameSession\|createSession\|async' packages/dsh-bot-host/src/platform.ts` | 起题/归档零新增网关通道 |
| sessionTool 服务面含 `wait`(L395)、`rename`(L420);marks 面经 `listByKind`(README L12) | `rg -n 'rename(\|archive(\|wait(\|listByKind' ../../session-tool/plugin/packages/session-tool/src/index.ts` | rename 有 CLI caller 通道;marks 摘除=put 整集替换(见 1.3 Task 1 行) |
| 每会话写锁已存在:`promptLocks` Map + `withPromptLock`(L42-47) | `rg -n -i 'lock' packages/dsh-bot-host/src/workbench-sessions.ts` | 起题 rename 可复用同款防抖形状 |
| roster 轮询是 O(N):`App.tsx` 每 2s 对**每个** bot `listBotSessions`、每个 group `listGroupSessions`(L163-260 tick);transcript 轮询 2s idle/1s working(`useSessionPoll.ts` L7-8) | Read `packages/workbench-ui/src/App.tsx`;`rg -n 'POLL\|1000\|2000' packages/workbench-ui/src/useSessionPoll.ts` | 聚合 overview + SSE 的改造对象 |
| SSE 同通道先例:vibee `rpc-http.ts` L137 `res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')`(host webServer 注入面) | `rg -n 'text/event-stream' ../../vibee/plugin/packages/vibee-viz/src/rpc-http.ts` | `/dsh-bot/events` 可走同形状,不开新口 |
| 网关进程内事件总线存在:dsh-session 文档「插件订阅 `session/event`,在 `session/flush` 时刷新」 | `rg -n -i 'event\|subscribe' packages/dsh-bot-host/node_modules/@deepseek-ai/dsh-session/README.zh.md`(L11、L91) | SSE 事件源采用候选①(Task 1 已冒烟);候选②内部扫描仅兜底 |
| host 服务:`static inject = ['sessionTool']`(L225),webServer 可选注入(L277),settings 面 `installSettingsSection`(L271,命名空间 `dsh-bot`) | `rg -n 'inject\|Service\|webServer' packages/dsh-bot-host/src/index.ts` | 收纳开关放 `dsh-bot` settings 命名空间 |
| workbench API dispatch 现有 15 个 case(`listBots`…`listGroupSessions`,L183-220) | `rg -n "case '" packages/dsh-bot-host/src/workbench-routes.ts` | 新方法并列追加 |
| marks helpers:`DSH_BOT_KIND`/`DSH_BOT_HIDDEN_KIND`(L12-14)、`botMark` L24、`groupRoomMark` L62、`mergeBotMarks`(merge 语义,L112) | `rg -n 'export function\|KIND' packages/dsh-bot-host/src/marks.ts` | 新增 mark 常量放这里 |
| 官方 GUI 隐藏 `~` 标题会话、`kind:hidden` 默认不进列表——v2/v3 已验收事实(委托 `~dsh-bot:`、轮次 `~dsh-bot-group:` 均实证不出现在官方侧栏) | `../dsh-bot-workbench/spec.md` 1.3 与其官方栏不变量、`../archive/dsh-bot-group-chat/spec.md` 1.3(实机行);README「隐藏轮次会话」节 | 收纳 = 复用同一约定,零新平台机制 |
| 会话切换 UI 已有两处:Header `sessionSwitchBtn` 弹出 `SessionList` + roster 嵌套列表(≤8 条);`sessionDisplayTitle` 已做 `~` 剥离显示 | Read `packages/workbench-ui/src/Conversation.tsx`、`SessionList.tsx`、`session-binding.ts` | 跳转/重命名/归档动作挂在 SessionList 行与 Header 菜单 |
| Task 1 ASM-401:`sessions.open` 对可见与 `~`+`kind:hidden` 会话均可把 `list.getSnapshot().current` 切到目标;对 archived 调用不抛但 current 不落地。三条校准会话 `subagentAddress` 均为 undefined,`jumpToSession` 走 `open` | Playwright `calib-jump.mjs`(who 3084 后);证据 `evidence/phase-0/calib-jump.json` + `asm401-*-open.png` | BR-401:隐藏直接开;归档不直开 |
| Task 1 ASM-402:同源 iframe `/dsh-bot/ui` 内 `window.parent.postMessage({type:'dsh-bot:calib-402'}, location.origin)` 被页签 window 收到,`sourceIsIframe:true`,`origin=http://127.0.0.1:3084` | 临时 tab `message` 监听(已撤);`calib-browser.json` step `asm402-iframe-fn` + `asm402-tab.png` | 桥用 postMessage;必须 origin+source+type 三重校验 |
| Task 1 ASM-403:无名会话 `session.rename` 钉 `calib-nav-pinned-403` 后再发首轮,history 仍仅一条 `session/title`(source.kind=user),标题未被 first-prompt 覆盖 | `dsh-rpc.sh 3084 session.rename` + `POST /dsh-bot/prompt` + `session.history`;`asm403-rename-turn.json` overwritten=false | 自动起题只碰占位标题 |
| Task 1 ASM-404:`session.list` 行键无 archived/title(题在 projections.values.title);`listBotSessions`/SessionToolListRow 无 archived;`workspace.list.archivedSessionIds` 是归档集,`workspace.archiveSession` 有效。session-marks 摘除面=`put` 整集替换(`get/put/listByKind/gc`),无 delete/removeTag | who 后 `session.list`/`workspace.list`/`workspace.archiveSession`;host 进程内 `session-marks` put/get;`asm404-*.json` `marks-rewrite.json` | BR-404:真归档+archivedSessionIds 排除,不降级隐藏;隐藏 toggling=标题 `~`+put |
| Task 1 ASM-405:host plugin ctx `ctx.on('session/event')` 可收到只读事件`{sessionId,type,seq,time}`(plugin 与 root 双份);样例含 assistant/chunk/message、step/end、turn/end | 临时订阅+GET `/dsh-bot/calib-405`(已撤);`asm405-events.json` subscribed=true count=80 | BR-406:SSE 源用 session/event 只读;内部扫描仅兜底。Task 10 只订 plugin ctx 一次 |

| 委托会话 `~dsh-bot:` 由 `askBot` 创建后**立即归档**(`platform.archiveSession`),所以工作台 includeHidden 列出的委托行全部在 `archivedSessionIds` 里;Phase 1 首轮把它当成「隐藏会话」是误判 | `rg -n "archiveSession" packages/dsh-bot-host/src/ask.ts`;`dsh-rpc.sh 3084 workspace.list` 对照 `listBotSessions(includeHidden)` | ask.ts L268;`~dsh-bot:` / `~dsh-bot-group:` / `~dsh-bot-memory:` 行均 archived |
| rc.2 客户端投影会在 `current` 落入 `archivedSessionIds` 时立刻 `sessions.clear()`;官方 UI **没有任何归档会话的查看或取消归档面**(ui-workspace README 明示) | `rg -n "archivedSessionIds.includes(sessions.current)" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js`;`rg -n -i "unarchive" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-ui-workspace/README.md` | runtime client.js L10065;README L34「No Session deletion or unarchive control」 |
| 页签桥可读 `ctx.workspaces.list.getSnapshot().archivedSessionIds`,能在 open 前判归档 | `rg -n "archivedSessionIds" env/profiles/gb/node_modules/@deepseek-ai/dsh-client-runtime/lib/types/client/workspaces/service.d.ts` | service.d.ts L18 |
| 2026-09-08 重跑页签实测:可见 / `~ calib-nav-hidden`(kind:hidden,未归档)两条 `current` 均落地;委托归档行回执 `{ok:false, reason:"archived"}`,current 不动 | `node evidence/phase-1/live-jump-rerun.mjs <out>`(Playwright channel chrome) | `evidence/phase-1/live-jump-rerun.json` allPass:true;`jump-hidden.png` / `jump-archived.png` |

### 1.4 假设清单

ASM-401~405 已由 Task 1 消解(结论见 1.3 末行与 `evidence/phase-0/calibration.md`)。2026-09-08 新增 ASM-406(未消解,Task 7 开工前处置):

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-406 | UF-404 / BR-404 的「归档后官方 GUI 归档区可寻回」在 rc.2 **不成立**:ui-workspace README 明示无归档查看/取消归档面,投影会清掉归档 current(§1.3 2026-09-08 行)。假设:产品接受「归档 = 工作台与官方双向不可见、平台升级前不可恢复」,否则 Task 7 的「归档」动作应改为「隐藏」或增加二次确认文案「归档后当前版本无法再查看」 | 用户按「可寻回」预期归档后丢会话 | Task 7 开工前由用户拍板;若接受则改 BR-404 正例与 UF-404 Then,若不接受则 Task 7 去掉归档只留隐藏 |


ASM-401/402/403/405 为**证实**(合同已写分支,不走变更协议)。ASM-404 **证伪**了降级触发「`sessionTool.list`/`session.list` 行无 archived 字段 ⇒ 归档必须降级为隐藏」:行确实无该字段,但 `workspace.archiveSession` + `workspace.list.archivedSessionIds` 可识别可归档。UF-404 Then「官方可寻回」不变。按 shared-rules §12 改第 2 章降级触发(见 1.5)。

| 原假设 | 结论(已消解) | 选定分支 |
|---|---|---|
| ASM-401 | 可见与 `~`+hidden:`sessions.open` 落地 current;archived:open 不落地 | BR-401 隐藏 **直接开**;归档会话不提供直开(列表排除 / 先 unarchive) |
| ASM-402 | iframe `parent.postMessage` 可达页签,`source` 为 iframe contentWindow | 实现页签桥(origin+source+type);不退回 v1 列表直跳 |
| ASM-403 | 显式 rename 钉题,随后首轮不覆盖 | 自动起题只对占位标题;不必等 DSH first-prompt 再改 |
| ASM-404 | list 行无 archived 字段;**识别面**在 `archivedSessionIds`;`archiveSession` 可用;marks 用 put 重写。「无行字段⇒降级隐藏」已证伪 | 真归档+`archivedSessionIds` 排除;toggleHidden = `~` 标题 + put(±`kind:hidden`);仅 `archive-unavailable` 才降级隐藏 |
| ASM-405 | 网关内只读 `session/event` 订阅可用 | SSE 事件源用总线订阅;内部 ≤1s 扫描仅失败/断线兜底 |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-09-01 | 初版 | — | — |
| 2026-09-01 | Task 1 校准回写 **1.3 事实 + 1.4 ASM 消解**:BR-401 隐藏直接 `sessions.open`、归档不直开;BR-406 `session/event` 只读订阅。ASM-401/402/403/405 证实,第 2 章那些条目不改 | P0 勘察;证据 `evidence/phase-0/calibration.md` | Task 2/5/6/10 按选定分支实现 |
| 2026-09-08 | **变更协议 BR-401 / UF-401**(§12;Version 0.2.0→0.2.1):Task 4 阻塞根因不是隐藏标题而是**归档**——`askBot` 把委托会话归档,rc.2 投影会清掉归档 current 且平台无 unarchive。BR-401 增「归档目标桥端拒绝,reason `archived`」;UF-401 步骤 3 限定为「未归档的隐藏会话」,失败分支增「目标已归档」;5.2 增归档行。**连带发现**:UF-404 / BR-404 里「官方 GUI 归档区可寻回」与 rc.2 事实冲突(官方无查看面),归档在当前平台等于工作台可见性单向消失,Task 7 开工前需重议(记 ASM-406) | Phase 1 重跑实测 `evidence/phase-1/live-jump-rerun.json` | Task 4 解除阻塞→已完成;Task 7 备注加 ASM-406 前提;ui-dsh-bot `session-jump.ts` + workbench `jump.ts` 已实现 archived 分支(单测 3 例) |
| 2026-09-01 | **变更协议 BR-404 / UF-404**(§12;Version 0.1.0→0.2.0):ASM-404 证伪「list 行无 archived 字段 ⇒ 归档降级为隐藏」。`workspace.archiveSession` 与 `archivedSessionIds` 实测可用(`asm404-fields.json` / `asm404-membership.json`)。UF-404 Then「官方 GUI 可寻回」与 BR-404 正例「归档后列表消失、官方仍能找回」**不变**;BR-404 规则句与 UF-404 失败分支的降级触发改为「仅 `archiveSession` 抛 `archive-unavailable`」;list 行无 archived 字段不再构成降级。marks 显示/隐藏走 `put` 整集 ±`kind:hidden` | P0 review p1:1.4 选真归档却宣称不改第 2 章,Task 7 仍按「无行字段→toggleHidden+degraded」实现会破坏 UF-404 寻回 | Task 7 按真归档接线(仍待开始,不回退);Task 1 校准事实保持已完成;handoff BR-404 一行摘要同步 |

---

## 2. 业务合同

> BR/UF/INV/EVD 唯一定义处。引用既有包合同时用路径 + 描述(本包编号闭环)。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-401 | 跳转桥:工作台会话行/Header 菜单提供「在 DSH 打开」;iframe 内经 `postMessage({type:'dsh-bot:jump', sessionId}, location.origin)` 投递,页签宿主校验 `event.origin === location.origin` 且 type 白名单后调 `jumpToSession(ctx.sessions, id)`;隐藏(`~` / `kind:hidden`,未归档)会话直接 `open`(ASM-401 证实);目标在 `ctx.workspaces.list.archivedSessionIds` 内(委托 `~dsh-bot:` 会话默认归档)时桥端**不调 open**,回执 `reason:"archived"`,工作台 toast「该会话已归档(委托会话默认归档),官方界面无法查看」——rc.2 无 unarchive,不得假装可达;**浏览器直开**(无宿主,`window.parent === window`)该按钮降级为「复制会话 ID」+ 提示去页签打开 | 页签内点一下,官方视图切到该会话 | 直开时点了没反应也不提示;不校验 origin 就执行任意消息 | ui-dsh-bot + workbench-ui | Task 2/3 + UF-401 矩阵 |
| BR-402 | 收纳:settings `dsh-bot.workbench.hiddenSessions`(boolean,**默认 true**,热生效)。开启时 `createOwnedSession` 起标题 `~ 新对话` + marks 追加 `kind:hidden` 与 `kind:dsh-bot-wb`(新常量,标识"工作台自建");`listOwnedSessions` 默认列表 = 可见会话 + 带 `kind:dsh-bot-wb` 的隐藏会话(即自家会话永远可见于工作台),「包含隐藏」开关只再放开委托 `~dsh-bot:` 会话;关闭开关后新会话回 v2 可见行为;**存量会话不自动迁移** | 开着时官方侧栏看不到新建的 bot 会话,工作台里照常可见可聊 | 收纳后工作台自己也看不到该会话;把存量会话批量改名 | dsh-bot-host | Task 6 单测 + UF-402 矩阵 |
| BR-403 | 自动起题:会话首轮闭合后,若标题仍是占位(「新对话」/空/裸 `~`),host 用首条用户消息派生标题(去空白/换行/@提及,≤20 字,超长截断加 `…`);隐藏会话保留 `~ ` 前缀;起题幂等(只对占位标题执行一次),**永不覆盖**用户手动改的名或 DSH 已落的 first-prompt 标题(ASM-403 结论落地);起题失败静默保留占位并记 host log | 问「帮我写首诗」→ 会话列表显示「帮我写首诗」 | 用户手动改名后被自动起题覆盖;对旧会话批量改名 | dsh-bot-host | Task 5 单测 + UF-403 矩阵 |
| BR-404 | 会话行动作:每行菜单含「重命名」(host rename,隐藏态自动保 `~` 前缀)、「在 DSH 显示/隐藏」(切换标题 `~` 前缀;marks 经 session-marks `put` 整集重写同步 ±`kind:hidden`)、「归档」(=`platform.archiveSession`,工作台默认列表按 `workspace.list.archivedSessionIds` 排除,官方 GUI 归档区可寻回)。`sessionTool.list`/`session.list` 行无 archived 字段**不**构成降级(识别面是 `archivedSessionIds`,ASM-404 已消解)。仅当 `archiveSession` 抛 `archive-unavailable` 时菜单降级为「隐藏」并注明。归档当前打开的会话自动切到该 bot 下一条;所有动作乐观更新失败回滚 + 错误条 | 归档后列表即刻消失;官方 GUI 仍能找回 | 因 list 行无 archived 字段就把归档做成隐藏;物理删除会话数据;归档失败但列表已删行 | dsh-bot-host + workbench-ui | Task 7 + UF-404 矩阵 |
| BR-405 | 聚合 overview:新增 `POST /dsh-bot/overview {}` 一次返回全部 bot/group 的 `{sessions 摘要(含 title/updatedAt/working/hidden), lastMessage 预览, working}`;roster 轮询只打这一个接口(替换 App 每 owner 一请求的 tick);选中会话的 transcript 轮询不变 | 5 个 bot 时 roster 每拍只有 1 个 HTTP 请求 | overview 与 listBotSessions 字段语义漂移 | dsh-bot-host + workbench-ui | Task 9 单测 + UF-405 矩阵(network 证据) |
| BR-406 | SSE 推送:host 经既有 webServer 提供 `GET /dsh-bot/events`(`text/event-stream`,vibee 同形状,仍走 :3084);事件为脏通知 `{kind:'session'\|'roster', sessionId?, ownerId?}`,UI 收到才拉增量(overview / history sinceSeq);事件源按 ASM-405 结论:候选① 网关 `session/event` 订阅(只读,不写),候选② host 内部 ≤1s 聚合扫描,两者对外行为等价;EventSource 断线自动重连,重连期间回落 2s 轮询,不白屏不丢草稿 | 发消息后 roster 预览 ≤2s 更新;SSE 断开页面照常可用 | 为推送另开端口;事件里塞整段 transcript;断线后页面死掉 | dsh-bot-host + workbench-ui | Task 10 + UF-405 矩阵 |
| BR-407 | 红线与兼容:v1 `dsh_bot_ask`/`dsh-bot.model` override/marks CLI、v2 工作台 1:1 全链、v3 小组一轮语义零回归;`~` 隐藏约定与既有 marks 语义不变;不拷参考树代码/文案/品牌(`rg -i 'anysphere\|sand://' packages/` 为空);全部面 loopback :3084;运行数据不入 git | v1/v2/v3 spec 5.2 主路径抽验全过 | 改坏隐藏轮次会话的过滤;新开端口 | 全仓 | Task 14 终检 |

### 2.2 UF 用户验收场景(索引)

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-401 | 页签内工作台,某 bot 有可见与隐藏会话各 ≥1 | 会话行菜单点「在 DSH 打开」 | 官方 conversation 视图切到该会话;隐藏会话也可达(直接或显形后);浏览器直开时按钮降级为复制 ID | 本机用户 | browser | EVD-401 |
| UF-402 | 收纳开关默认开 | 新建会话并对话;再关闭开关新建一条 | 开着:新会话不出现在官方侧栏,工作台正常;关闭:新会话官方侧栏可见 | 本机用户 | browser + 官方 GUI 截图 | EVD-402 |
| UF-403 | 新会话(占位标题) | 发「帮我写一首关于秋天的诗」,首轮结束 | 会话列表标题变为「帮我写一首关于秋天的诗」(≤20 字截断);手动重命名后不再被覆盖 | 本机用户 | browser + RPC 取证 | EVD-403 |
| UF-404 | 某 bot 有 ≥2 条会话 | 归档当前打开的会话 | 列表移除该行并自动切到下一条;官方 GUI 可寻回;工作台不再列出 | 本机用户 | browser + RPC 取证 | EVD-404 |
| UF-405 | 两个 bot 同时生成中 | 观察 roster 与网络面板 | 两行 working 点/预览/时间 ≤2s 更新;网络请求只有 overview/events(+选中会话 history);SSE 断开自动回落轮询 | 本机用户 | browser + network 面板截图 | EVD-405 |

### 2.3 核心业务流程(步骤级交互脚本)

#### UF-401: 在 DSH 打开会话

**前置状态**:官方 GUI(:3084)右栏「DSH Bot」页签打开工作台;默认 bot 有一条可见会话与一条隐藏会话(收纳开关产物)。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 展开 Header「对话」下拉或 roster 嵌套列表 | 会话行出现 ⋯ 菜单 | — | 菜单含「在 DSH 打开」 |
| 2 | 点「在 DSH 打开」 | 菜单收起 | iframe `postMessage({type:'dsh-bot:jump', sessionId})` → 页签校验 origin/type → `jumpToSession(ctx.sessions, id)` | 官方 conversation 视图切到该会话,历史与工具卡完整可见 |
| 3 | 对**未归档**的隐藏会话(`~` 标题 + `kind:hidden`,如收纳开关产物)重复步骤 2 | 同上 | 直接 `open`(ASM-401 证实,不需显形) | 官方视图达到该隐藏会话(空会话显示为「新会话」hero,`list.current` 已是该 id) |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 浏览器直开 | `window.parent === window`(无页签宿主) | 菜单项变为「复制会话 ID」,tooltip 说明「在右栏页签内可直接跳转」 | 复制到剪贴板 + toast | 用户去页签操作 |
| 宿主无 sessions face | 官方 GUI 未注入该服务(异常态) | 点了出 toast「当前页签不支持跳转」 | 页签回 `{ok:false}` 消息 | 记录 host log;不静默 |
| 跳转目标已被删除 | 会话被外部清理 | toast「会话不存在或已删除」 | open 失败被捕获 | 刷新会话列表 |
| 跳转目标已归档 | 目标在 `archivedSessionIds`(委托 `~dsh-bot:` 会话默认归档) | toast「该会话已归档(委托会话默认归档),官方界面无法查看」,列表不变 | 桥端不调 open,回执 `reason:"archived"` | 无(rc.2 无 unarchive);在工作台内查看 |

**界面状态机**:

```text
菜单 idle → 跳转请求中(≤1s) → 成功(官方视图切换) | 失败 toast(列表不变)
直开入口:菜单项固定为「复制会话 ID」
```

**入口接线清单**:

- `SessionList.tsx` 行 ⋯ 菜单「在 DSH 打开」(Task 3)
- `Conversation.tsx` Header 当前会话菜单同项(Task 3)
- `DshBotTab.tsx` message 监听 → `session-jump.ts`(Task 2)

#### UF-402: 会话收纳(官方侧栏不再堆积)

**前置状态**:收纳开关默认开(`dsh-bot.workbench.hiddenSessions=true`);官方 GUI 主界面与工作台都可见。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 工作台某 bot「新开对话」并发一句 | 新会话正常出现在工作台并回复 | `createOwnedSession` 起 `~ 新对话` + `kind:hidden` + `kind:dsh-bot-wb` | 工作台会话列表含该会话(带隐藏徽标) |
| 2 | 切到官方 GUI 主界面会话侧栏 | — | 官方按 `~` 约定不列出 | 官方侧栏**没有**这条新会话,老会话不受影响 |
| 3 | 在 `env/settings.yaml` 或设置面把开关关掉,再新建会话 | — | 新会话走 v2 可见路径 | 官方侧栏出现这条(且工作台也有) |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 收纳后工作台丢会话 | `kind:dsh-bot-wb` 例外通道缺陷 | (禁止发生,P0 缺陷) | listOwnedSessions 默认列表必须含自家隐藏会话 | 修复后回归 |
| 设置值非法 | settings 写了非 boolean | 沿 v1 settings 校验:fail loud 报错 | schema 校验拒绝 | 改回合法值 |
| 存量误迁移 | — | 老会话标题被改 | (禁止发生:只影响新会话) | — |

**界面状态机**:

```text
开关 on:新会话 → 隐藏(官方不可见,工作台可见)
开关 off:新会话 → v2 可见行为
存量:不动
```

**入口接线清单**:

- host `createOwnedSession` 分支 + settings 键(Task 6)
- 工作台会话行隐藏徽标沿用 `sessionDisplayTitle` 的 `~` 展示(已有,Task 7 核对)
- README「收纳开关」文档(Task 12)

#### UF-403: 自动起题与重命名

**前置状态**:某 bot 新开会话(标题占位「新对话」或 `~ 新对话`)。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 发「帮我写一首关于秋天的诗」 | 用户气泡上屏,工作中 | prompt 落地;首轮闭合后 host 检测占位标题 → `deriveSessionTitle` → rename(隐藏态保 `~`) | ≤一个轮询拍内,会话行标题变「帮我写一首关于秋天的诗」 |
| 2 | 行菜单「重命名」输入「秋诗草稿」 | 行内输入框,回车提交 | host rename;起题标记该会话已有人工名 | 标题显示「秋诗草稿」 |
| 3 | 继续对话多轮 | — | 起题幂等:不再触发 | 标题保持「秋诗草稿」 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| rename 失败 | 网关瞬断 | 标题保持占位,无错误弹窗 | host log 记录,下轮闭合重试一次 | 自愈或手动重命名 |
| 重命名为空 | 提交空字符串 | 行内校验「名字不能为空」,不发请求 | — | 补填 |
| DSH 已自动起题 | ASM-403 场景 | 标题保持 DSH 起的题(隐藏态仅补 `~`) | host 检测非占位即跳过 | — |

**界面状态机**:

```text
占位标题 → (首轮闭合)自动起题 → 已命名
已命名 → 重命名输入中 → 已命名(新)|校验失败(保持)
```

**入口接线清单**:

- host 起题钩子挂在 history/list 读取路径的轮闭合检测(Task 5)
- `SessionList.tsx` 行菜单「重命名」→ `POST /dsh-bot/renameSession`(Task 7)

#### UF-404: 归档会话

**前置状态**:某 bot 有 ≥2 条会话,当前打开其中一条。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 当前会话行菜单「归档」 | 确认气泡「归档后工作台不再显示,DSH 归档区可找回」 | — | 二次确认 |
| 2 | 确认 | 该行消失 | `archiveSession` + 列表排除;活动会话切到该 bot 最新一条 | 对话面切到下一条会话;roster 计数 -1 |
| 3 | 去官方 GUI 归档区 | — | — | 该会话可寻回(数据未删) |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 归档失败 | 网关错误 | 错误条 + 行恢复 | 乐观更新回滚 | 重试 |
| 最后一条会话被归档 | 该 bot 无剩余会话 | 对话面回到空态 CTA | activeSession 置空 | 「新开对话」 |
| archive 通道不可用 | `archiveSession` 抛 `archive-unavailable` | 菜单项显示为「隐藏」并注明 | 走隐藏 toggle 路径 | 文档写明边界 |

**界面状态机**:

```text
确认 → 归档中 → 行移除+切换会话 | 错误条(行恢复)
```

**入口接线清单**:

- `SessionList.tsx` 行菜单「归档」→ `POST /dsh-bot/archiveSession`(Task 7)

#### UF-405: roster 实时刷新(聚合 + SSE)

**前置状态**:≥2 个 bot;打开浏览器 DevTools network 面板。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 打开工作台 | roster 加载 | UI 建立 `GET /dsh-bot/events` EventSource + 首次 `overview` | network 里只有 events(常驻)+ overview(单发) |
| 2 | 让 bot A、B 同时生成(各发一条) | 两行 working 点亮 | host 推脏通知 → UI 拉 overview | ≤2s 内两行预览/时间/working 更新;每拍仍只 1 个 overview 请求 |
| 3 | 回复落地 | working 点灭,预览变为回复文本 | 同上 | roster 与对话面一致 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| SSE 断开 | 网关重启 | 无感知或短暂「重连中」徽标 | EventSource onerror → 回落 2s 轮询 + 自动重连 | 网关回来后自动恢复推送 |
| 事件风暴 | 高频生成 | UI 不卡 | host 事件按 owner 去抖(≥500ms 合并) | — |
| 网关死 | boot 停 | roster 错误态 + 重试(v2 既有行为) | overview 失败呈现 | boot 后重试 |

**界面状态机**:

```text
SSE connected(推送驱动) ⇄ SSE down(轮询兜底,自动重连)
```

**入口接线清单**:

- host `GET /dsh-bot/events` + `POST /dsh-bot/overview`(Task 9/10)
- `App.tsx` 轮询 tick 替换为 overview 单请求 + `useEvents.ts` EventSource(Task 9/10)

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-401 | v1/v2/v3 用户可见行为零回归:`dsh_bot_ask` 委托、override 三态、工作台 1:1 全链(建/聊/切/编/删)、小组一轮与 @点名、隐藏轮次会话不进 1:1 列表 | BR-407 | Task 14 抽验(各包 5.2 主路径行) |
| INV-402 | 官方 DSH 包与邻仓零改动;官方会话栏对**存量**会话行为不变 | BR-402/407 | 邻仓 `git status --porcelain` + 官方栏截图对比 |
| INV-403 | 一口一仓:SSE/overview 全部经 :3084 既有 webServer,不开新端口 | BR-406 | `lsof` + `dsh-rpc-who.sh 3084` |
| INV-404 | 会话数据只经 platform/sessionTool 通道读写;ASM-405 若采用事件订阅,仅只读,不经总线写任何事件;运行数据不入 git | BR-406/407 | Task 10 代码 review + `git status` |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-401 | screenshot+log | 页签跳转前后截图(工作台菜单/官方视图)、隐藏会话跳转、直开降级 toast | `evidence/UF-401/` |
| EVD-402 | screenshot+log | 收纳开关开/关时官方侧栏对比截图 + marks/标题取证 | `evidence/UF-402/` |
| EVD-403 | screenshot+log | 起题前后列表截图 + rename RPC 取证 + 手动重命名不被覆盖 | `evidence/UF-403/` |
| EVD-404 | screenshot+log | 归档确认/列表移除/官方寻回截图 + archive 取证 | `evidence/UF-404/` |
| EVD-405 | screenshot+log | network 面板(events+overview)截图、双 bot 并发 working 更新、SSE 断线回落 | `evidence/UF-405/` |
| EVD-406 | log | 单测/构建/standard:check/回归命令输出 | `evidence/phase-0/`…`evidence/phase-4/` |

### 2.6 角色与权限矩阵

单一本机用户,loopback,无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 依赖失败 | 网关重启中 | 跳转/归档/重命名 | 错误条可重试,不白屏不丢草稿 | `evidence/UF-404/gateway-down.md` |
| 非法输入 | 重命名含控制字符/超长 | 提交 | host 清洗或拒绝(fail loud),不产生 broken 标题 | `evidence/UF-403/invalid-input.md` |
| 重复提交 | 连点「归档」 | — | 防重(loading 锁),只归档一次 | `evidence/UF-404/double-submit.md` |
| 恶意消息 | 页面向页签 postMessage 伪造 type/origin | — | 页签只认同源 + 白名单 type,其余忽略并 log | `evidence/UF-401/bad-message.md` |
| 旧数据兼容 | v2/v3 存量会话(可见标题/委托隐藏/轮次隐藏) | 打开工作台 | 列表/过滤/跳转全部照旧;不被起题改名 | `evidence/UF-402/legacy.md` |

### 2.8 非目标

- **token 级流式**:SSE 本包只做脏通知;chunk 转发留后续包。
- **官方前端 URL 深链 / 修改官方会话栏**:平台无此机制,不造。
- **存量会话批量迁移隐藏**:只影响新会话;单会话手动切换已覆盖需求。
- **小组房间标题/管理**:属 `../dsh-bot-group-rounds/`(五期)范围。
- **多用户/鉴权**:loopback 单用户。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before(v3):
workbench-ui ──2s×N── listBotSessions/listGroupSessions(每 owner 一请求)
     └ 会话行:仅标题(多为「新对话」)+ 时间;无跳转/重命名/归档
dsh-bot-host:createOwnedSession 可见标题;隐藏 = 仅委托/轮次
官方侧栏:工作台会话全量堆积

After(v4):
workbench-ui ──1req── POST /dsh-bot/overview(聚合)
     └──SSE── GET /dsh-bot/events(脏通知;断线回落轮询)
     └ 会话行菜单:在 DSH 打开 / 重命名 / 显示·隐藏 / 归档
     └ iframe postMessage ──→ DshBotTab(origin+type 校验)──→ jumpToSession(ctx.sessions)
dsh-bot-host:
  createOwnedSession + hiddenSessions 开关(~ 标题 + kind:hidden + kind:dsh-bot-wb)
  session-title.ts 首轮自动起题(幂等,不覆盖人工名)
  overview.ts 聚合投影;events.ts SSE(事件源:session/event 订阅 或 内部扫描)
官方侧栏:新 bot 会话默认收起;跳转按需直达
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/ui-dsh-bot/src/client/DshBotTab.tsx` | 页签 iframe 宿主 | 增 message 监听(origin/type 校验)→ 复用 `session-jump.ts`;回执消息 `{ok}` |
| `packages/dsh-bot-host/src/session-title.ts` | 自动起题 | 新建:`deriveSessionTitle` 纯函数 + 轮闭合触发 + 幂等标记 |
| `packages/dsh-bot-host/src/overview.ts` | 聚合投影 | 新建:一次拼装全部 owner 会话摘要/working/预览 |
| `packages/dsh-bot-host/src/events.ts` | SSE 通道 | 新建:`text/event-stream` 扇出 + 事件源(按 ASM-405)+ 500ms 去抖 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | 会话创建/列表 | 收纳分支、`kind:dsh-bot-wb` 例外、renameSession/archiveSession 方法 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | API | 增 `overview/renameSession/archiveSession/toggleSessionHidden/revealSession` + GET events |
| `packages/dsh-bot-host/src/marks.ts` | mark 常量 | 增 `DSH_BOT_WB_KIND = 'kind:dsh-bot-wb'` |
| `packages/workbench-ui/src/SessionList.tsx` | 会话行 | 行 ⋯ 菜单(打开/重命名/隐藏/归档)+ 预览行 |
| `packages/workbench-ui/src/jump.ts` | 跳转封装 | 新建:postMessage + 直开降级(复制 ID) |
| `packages/workbench-ui/src/useEvents.ts` | SSE 接入 | 新建:EventSource + 回落轮询开关 |
| `packages/workbench-ui/src/App.tsx` | roster 数据源 | O(N) tick 替换为 overview 单请求 + 事件驱动 |
| `scripts/manual-test.sh` | 验收矩阵 | 增 overview/rename/archive/收纳链路 |

### 3.3 三段式定位清单

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/ui-dsh-bot/src/client/session-jump.ts` | `export function jumpToSession` | `rg "jumpToSession" packages/ui-dsh-bot/src/client/session-jump.ts` | L16-26 | 既有,直接复用 |
| `packages/ui-dsh-bot/src/client/DshBotTab.tsx` | `iframeRef` | `rg "iframeRef" packages/ui-dsh-bot/src/client/DshBotTab.tsx` | L115、L175 | 增 message 监听 |
| `packages/ui-dsh-bot/src/client/tab-id.ts` | `DSH_BOT_SESSIONS_TAB_ID` | `rg "DSH_BOT_SESSIONS_TAB_ID" packages/ui-dsh-bot/src/client/tab-id.ts` | L2 | tab id 不变(v2 合同) |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `const promptLocks` / `visibleBotTitle` 调用 | `rg "promptLocks" packages/dsh-bot-host/src/workbench-sessions.ts` | L42、L361、L435 | 创建/列表/锁形状 |
| `packages/dsh-bot-host/src/platform.ts` | `renameSession` | `rg "renameSession" packages/dsh-bot-host/src/platform.ts` | L50、L245;archive L118 | 起题/归档通道 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `dispatchWorkbenchApi` | `rg "dispatchWorkbenchApi" packages/dsh-bot-host/src/workbench-routes.ts` | L183-220 case 区 | 新 case 并列 |
| `packages/dsh-bot-host/src/index.ts` | `installSettingsSection` | `rg "installSettingsSection" packages/dsh-bot-host/src/index.ts` | L271;webServer L277 | 开关 + events 挂载 |
| `packages/dsh-bot-host/src/marks.ts` | `DSH_BOT_HIDDEN_KIND` | `rg "DSH_BOT_HIDDEN_KIND" packages/dsh-bot-host/src/marks.ts` | L14 | 新常量并列 |
| `packages/workbench-ui/src/App.tsx` | 轮询 tick | `rg "setInterval" packages/workbench-ui/src/App.tsx` | L250 附近 | 替换数据源 |
| `packages/workbench-ui/src/SessionList.tsx` | `export function SessionList` | `rg "export function SessionList" packages/workbench-ui/src/SessionList.tsx` | L29 | 行菜单挂点 |
| `packages/workbench-ui/src/Conversation.tsx` | `sessionSwitchBtn` | `rg "sessionSwitchBtn" packages/workbench-ui/src/Conversation.tsx` | L410 附近 | Header 菜单挂点 |
| `packages/workbench-ui/src/session-binding.ts` | `sessionDisplayTitle` | `rg "sessionDisplayTitle" packages/workbench-ui/src/session-binding.ts` | L68-80 | `~` 展示已就绪 |
| `../../vibee/plugin/packages/vibee-viz/src/rpc-http.ts` | `text/event-stream` | `rg "text/event-stream" ../../vibee/plugin/packages/vibee-viz/src/rpc-http.ts` | L137 | SSE 样板(只读) |
| `packages/dsh-bot-host/src/session-title.ts` | 新建:`deriveSessionTitle` | 建成后 `rg -F "deriveSessionTitle" packages/dsh-bot-host/src/session-title.ts` | 新建 | Task 5 |
| `packages/dsh-bot-host/src/overview.ts` | 新建:`buildOverview` | 建成后 `rg -F "buildOverview" packages/dsh-bot-host/src/overview.ts` | 新建 | Task 9 |
| `packages/dsh-bot-host/src/events.ts` | 新建:`installEventsRoute` | 建成后 `rg -F "installEventsRoute" packages/dsh-bot-host/src/events.ts` | 新建 | Task 10 |
| `packages/workbench-ui/src/jump.ts` | 新建:`requestJump` | 建成后 `rg -F "requestJump" packages/workbench-ui/src/jump.ts` | 新建 | Task 3 |
| `packages/workbench-ui/src/useEvents.ts` | 新建:`useWorkbenchEvents` | 建成后 `rg -F "useWorkbenchEvents" packages/workbench-ui/src/useEvents.ts` | 新建 | Task 10 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 新增 | `POST /dsh-bot/{overview,renameSession,archiveSession,toggleSessionHidden,revealSession}` + `GET /dsh-bot/events`;既有 15 方法与 v1 方法不变 | wire 仍 `{args}/{ok,value\|error}`;SSE 为新 GET 面 |
| 数据 | 新增 | settings 键 `dsh-bot.workbench.hiddenSessions`;mark 常量 `kind:dsh-bot-wb`;无新文件存储 | 普通 marks/设置;不迁移存量 |
| 权限 | 否 | loopback 单用户 | — |
| 路由(口) | 否 | 全部经 :3084 | — |

---

## 4. Phase 计划与任务详情

> Phase 依赖链:

```text
P0 校准(T1) → P1 跳转桥(T2-T4) → P2 起题与收纳(T5-T8)
  → P3 聚合与推送(T9-T11) → P4 收尾与真实验收(T12-T14)
```

> 实现任务数 ≥ 8 → 状态板 `tasks.csv`。状态严格枚举:待开始/进行中/已完成/已阻塞:{原因}。

### Phase 0: 校准

> 你在哪里:v1/v2/v3 已交付;五条 ASM 未消解。
> 做完之后:ASM-401~405 全部有实测结论,写回 1.3/1.4。

### Task 1: 校准跳转/起题/归档/事件源五条机制

- **关联**:ASM-401/402/403/404/405;支撑 BR-401~406(UF 无:校准)
- **前置任务**:无
- **风险等级**:P0

**为什么做**:跳转对隐藏会话的行为、marks 摘除能力、事件源通道决定 BR-401/404/406 的实现分支。

**涉及文件与定位**:运行中 :3084 网关(`~/.agents/skills/dsh-plugin-debug/scripts/`);`packages/ui-dsh-bot/src/client/session-jump.ts`(L16);`../../session-tool/plugin/packages/session-tool/src/index.ts`(rename L420)

**具体操作**:

1. 起网关(`sh env/boot.sh`,先 `dsh-rpc-who.sh 3084` 核身份)。页签里挂临时监听(或临时 tab 代码)实测:iframe 内 `window.parent.postMessage` 页签能否收到(ASM-402);`ctx.sessions.open(id)` 对可见会话、`~`+hidden 会话、archived 会话各测一次(ASM-401)。临时代码不入 git。
2. RPC 实测 rename:对新会话显式 `renameSession` 后再发一轮,确认 DSH 不覆盖(ASM-403);读 `sessionTool.list` 行投影字段确认有无 archived 标志;查 session-marks 面有无摘除/重写通道(ASM-404)。
3. 网关内订阅冒烟:临时在 host 加 `ctx.on('session/event', …)` 打日志,确认能收到会话事件与字段形状(ASM-405);失败则记录降级结论(内部扫描)。
4. 结论回写 1.3/1.4(消解或改写 ASM),BR-401/404/406 的分支选择在备注注明。

**验证**:`evidence/phase-0/calibration.md` 存在且五条 ASM 在 1.4 全部消解或改写 → 期望零残留

**Evidence**:`evidence/phase-0/calibration.md`

**注意事项**:临时监听/临时路由不入 git;打 RPC 前先 who;不要动邻仓。豁免回归:P0 单实现任务,回归并入本任务验证。

### Phase 1: 跳转桥

> 你在哪里:机制已校准。
> 做完之后:页签内任意 bot 会话一键跳官方视图;直开有降级。

### Task 2: 页签宿主 postMessage 桥

- **关联**:BR-401 / UF-401
- **前置任务**:1
- **风险等级**:P0

**为什么做**:iframe 无法直接拿官方客户端服务,桥是跳转唯一通道。

**涉及文件与定位**:

- `packages/ui-dsh-bot/src/client/DshBotTab.tsx`:`iframeRef`,`rg "iframeRef" packages/ui-dsh-bot/src/client/DshBotTab.tsx`,L115(hint)
- `packages/ui-dsh-bot/src/client/session-jump.ts`:`export function jumpToSession`,L16-26

**具体操作**:

1. Tab 组件 `useEffect` 挂 `window.addEventListener('message', …)`:校验 `event.origin === location.origin`、`event.source === iframeRef.current?.contentWindow`、`data.type === 'dsh-bot:jump'`;白名单外忽略。
2. 命中 → 按 Task 1 结论:直接 `jumpToSession(ctx.sessions, sessionId)`,或先调 host `revealSession`(去 `~`)再跳;向 iframe 回执 `{type:'dsh-bot:jump-result', ok, reason?}`。
3. 单测(jsdom):合法消息触发 jump stub;异源/异 type/非 iframe source 不触发。

**验证**:`pnpm --filter ui-dsh-bot run build && pnpm --filter ui-dsh-bot test` → 期望全绿

**Evidence**:`evidence/phase-1/bridge-unit.log`

**注意事项**:不改 tab id;badge 轮询保留;不得信任消息体里的任何路径/HTML。

### Task 3: 工作台跳转入口与直开降级

- **关联**:BR-401 / UF-401
- **前置任务**:2
- **风险等级**:P1

**为什么做**:用户点名的入口;直开场景必须有明确降级而不是沉默失败。

**涉及文件与定位**:

- 新建 `packages/workbench-ui/src/jump.ts`(`requestJump`:postMessage + 超时回执 + `window.parent === window` 判定)
- `packages/workbench-ui/src/SessionList.tsx`:`export function SessionList`,L29;`packages/workbench-ui/src/Conversation.tsx`:`sessionSwitchBtn`,L410 附近

**具体操作**:

1. `jump.ts`:页签内发 `dsh-bot:jump` 并等回执(1.5s 超时);直开环境返回 `unsupported`。
2. SessionList 行增 ⋯ 菜单,首项「在 DSH 打开」;Conversation Header 当前会话菜单同项;直开时该项变「复制会话 ID」+ tooltip;失败 toast 透传 reason。
3. 组件单测:菜单渲染、直开降级、回执超时提示。

**验证**:`pnpm --filter workbench-ui run build && pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-1/jump-ui-unit.log`

**注意事项**:菜单不要挡住行点击选中;隐藏会话行菜单同样可用。

### Task 4: 执行 Phase 1 回归验证

- **关联**:本 Phase 全部条目 + INV-402
- **前置任务**:3

**验证**:`pnpm -r run build && pnpm -r test` + 页签实测:可见 / 未归档隐藏会话各跳一次 `current` 落地;归档委托会话回执 `archived`;直开降级复制 ID

**Evidence**:`evidence/phase-1/phase-summary.md`

### Phase 2: 起题与收纳

> 你在哪里:跳转可用。
> 做完之后:新会话自动有标题;官方侧栏不再堆积;会话行有重命名/隐藏/归档。

### Task 5: host 自动起题

- **关联**:BR-403 / UF-403
- **前置任务**:1
- **风险等级**:P1

**为什么做**:「一堆新对话」是会话切换体验最大的坑。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/src/session-title.ts`
- `packages/dsh-bot-host/src/workbench-sessions.ts`:`promptLocks`,L42(触发点挂 history/list 读取路径)

**具体操作**:

1. `deriveSessionTitle(text)` 纯函数:去 @提及/换行/多空白,取 ≤20 字,超长截 `…`;空结果回 null。
2. 触发:`listOwnedSessions`/`readOwnedHistory` 检测「占位标题 + 首条用户消息存在 + turn 已闭合」→ rename 一次(按 Task 1 的 ASM-403 结论选时机);内存幂等标记 + 失败下拍重试一次;隐藏会话保 `~ ` 前缀。
3. 单测:派生规则(中英文/emoji/超长/纯空白)、幂等、人工名不覆盖、隐藏前缀保留。

**验证**:`pnpm --filter dsh-bot-host run build && pnpm --filter dsh-bot-host test` → 期望全绿

**Evidence**:`evidence/phase-2/title-unit.log`

**注意事项**:只对占位标题动手;失败静默 log,禁止阻塞 history 响应。

### Task 6: 收纳开关与创建分支

- **关联**:BR-402 / UF-402
- **前置任务**:1
- **风险等级**:P0

**为什么做**:「一大堆都堆在这里」的正解;官方侧栏还给用户。

**涉及文件与定位**:

- `packages/dsh-bot-host/src/workbench-sessions.ts`:创建标题区 L361-385;隐藏过滤 L435
- `packages/dsh-bot-host/src/marks.ts`:`DSH_BOT_HIDDEN_KIND`,L14
- `packages/dsh-bot-host/src/index.ts`:`installSettingsSection`,L271

**具体操作**:

1. settings 增 `workbench.hiddenSessions`(boolean 默认 true,schema 校验,热生效)。
2. 开启时 `createOwnedSession`:标题 `~ 新对话`(或显式题加 `~ ` 前缀)+ marks 追加 `kind:hidden` + `kind:dsh-bot-wb`。
3. `listOwnedSessions` 默认列表 = 非隐藏 ∪ 带 `kind:dsh-bot-wb` 的隐藏;`includeHidden` 额外放开委托会话;轮次会话排除逻辑不变。
4. 单测:开关两态创建、例外通道、委托/轮次过滤不回归。

**验证**:`pnpm --filter dsh-bot-host test` → 期望全绿;`curl createBotSession` 后官方 `session.list` 见 `~` 标题

**Evidence**:`evidence/phase-2/hidden-unit.log`

**注意事项**:存量会话零改动;`kind:dsh-bot-wb` 进 marks.ts 常量,不散落字符串。

### Task 7: 会话行动作(重命名/隐藏切换/归档)

- **关联**:BR-404 / UF-403 / UF-404
- **前置任务**:5;6
- **风险等级**:P1

**为什么做**:会话可管理才谈得上「切换历史会话」。

**涉及文件与定位**:

- `packages/dsh-bot-host/src/workbench-routes.ts`:`dispatchWorkbenchApi`,L183;`packages/dsh-bot-host/src/platform.ts`:archive L118、rename L245
- `packages/workbench-ui/src/SessionList.tsx` L29;`packages/workbench-ui/src/api.ts`:`workbenchCall`,L17

**具体操作**:

1. host 增 `renameSession {sessionId,title}`(清洗控制字符/空名拒绝;隐藏态自动保 `~`)、`toggleSessionHidden {sessionId,hidden}`(rename 加/去 `~`;marks 用 `put` 整集 ±`kind:hidden`)、`archiveSession {sessionId}`(调用 `platform.archiveSession`;`listOwnedSessions` 排除 `archivedSessionIds`;**禁止**因 list 行无 archived 字段退化为 toggleHidden。仅 `archive-unavailable` 时响应 `degraded:true` 并走隐藏)、`revealSession {sessionId}`(跳转显形用;隐藏跳转按 ASM-401 直接 open,本方法非隐藏跳转必需)。
2. SessionList 行 ⋯ 菜单:重命名(行内输入)/在 DSH 显示·隐藏/归档(确认气泡,文案「归档」不是「隐藏」);乐观更新失败回滚 + 错误条;归档当前会话自动切下一条(复用 `pickBoundSession`)。
3. 行增最后消息预览(来自 overview 数据,Task 9 前先空置字段)。
4. host 单测(清洗/前缀/`archiveSession`+排除 `archivedSessionIds`;仅 `archive-unavailable` 才 `degraded`)+ 组件单测(菜单/确认/回滚)。

**验证**:`pnpm --filter dsh-bot-host test && pnpm --filter workbench-ui test` → 期望全绿

**Evidence**:`evidence/phase-2/session-actions-unit.log`

**注意事项**:**开工前先消解 ASM-406**(§1.4):rc.2 官方 GUI 没有归档查看面,「官方可寻回」不成立,文案与确认气泡要按拍板结果改;默认 bot 的会话同样可操作(动作对会话,不对 bot)。

### Task 8: 执行 Phase 2 回归验证

- **关联**:本 Phase 全部条目 + INV-401
- **前置任务**:7

**验证**:`pnpm -r run build && pnpm -r test` + 浏览器:新会话起题、开关两态官方侧栏对比、重命名/隐藏/归档各一次;v2 双人设隔离抽验一遍

**Evidence**:`evidence/phase-2/phase-summary.md`

### Phase 3: 聚合与推送

> 你在哪里:会话展示已达标,数据源还是 O(N) 轮询。
> 做完之后:roster 单请求 + SSE 推送,断线自动回落。

### Task 9: overview 聚合接口与 roster 接入

- **关联**:BR-405 / UF-405
- **前置任务**:8
- **风险等级**:P1

**为什么做**:N 个 bot 每 2s N 个请求既费网关又难做推送;聚合是推送的前置。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/src/overview.ts`(`buildOverview`:复用 listOwnedSessions/listGroupRooms 投影,拼 owner→sessions 摘要/working/lastMessage)
- `packages/workbench-ui/src/App.tsx`:`setInterval` tick,L250 附近

**具体操作**:

1. host `overview {}`:返回 `{owners: [{id, kind, working, lastMessage, updatedAt, sessions: [...]}]}`,字段语义与 listBotSessions 一致(单测锁形状)。
2. App tick 替换为单次 `overview`;`sessionsByOwner/workingIds/updatedAtById/lastMessages` 全部由 overview 喂;选中会话 transcript 轮询不变。
3. 单测:host 投影;UI reducer(overview → 状态)。

**验证**:`pnpm -r test` → 期望全绿;浏览器 network:每拍仅 1 个 overview 请求

**Evidence**:`evidence/phase-3/overview-unit.log`

**注意事项**:group rooms 的 working 沿现状(五期接引擎真值);overview 不含 transcript 正文,只含预览截断(≤80 字)。

### Task 10: SSE 事件通道与 UI 接入

- **关联**:BR-406 / UF-405 / INV-403 / INV-404
- **前置任务**:9
- **风险等级**:P1

**为什么做**:轮询升推送,发消息后 roster/transcript 即时更新,这是「体感」主升级。

**涉及文件与定位**:

- 新建 `packages/dsh-bot-host/src/events.ts`;`packages/dsh-bot-host/src/index.ts` webServer 注入区 L277
- 新建 `packages/workbench-ui/src/useEvents.ts`;`packages/workbench-ui/src/useSessionPoll.ts`(收到 session 脏通知时立即 refresh)
- 样板(只读):`../../vibee/plugin/packages/vibee-viz/src/rpc-http.ts` L137

**具体操作**:

1. `events.ts`:`GET /dsh-bot/events` SSE;客户端注册表 + 心跳(≤30s 注释帧);事件 `{kind, ownerId?, sessionId?}`;按 owner 500ms 去抖;事件源按 Task 1 ASM-405 结论(总线订阅只读,或内部 ≤1s 扫描)。
2. `useEvents.ts`:EventSource 接入;`roster` 事件 → 拉 overview;`session` 事件命中当前会话 → `poll.refresh()`;onerror → 标记 degraded 回落既有轮询 + 指数退避重连。
3. App/Conversation 接入:SSE 正常时 roster 轮询间隔放宽到 10s(兜底),断线恢复 2s。
4. 单测:host 事件编码/去抖;UI 降级切换。

**验证**:`pnpm -r test` 全绿;`curl -N http://127.0.0.1:3084/dsh-bot/events` 首帧 ≤1s → 期望心跳与事件可见

**Evidence**:`evidence/phase-3/sse.log`

**注意事项**:INV-404:订阅只读,禁止经总线写事件;SSE 响应禁缓存;iframe 与直开都要实测 EventSource。

### Task 11: 执行 Phase 3 回归验证

- **关联**:本 Phase 全部条目 + INV-403
- **前置任务**:10

**验证**:`pnpm -r run build && pnpm -r test` + 浏览器:双 bot 并发生成 roster ≤2s 更新、network 面板核请求数、杀网关重启看回落与重连

**Evidence**:`evidence/phase-3/phase-summary.md`

### Phase 4: 收尾与真实验收

> 你在哪里:功能全量在。
> 做完之后:standards/文档/manual-test 覆盖 v4,5.2 全过,v1/v2/v3 零回归。

### Task 12: standards、manual-test 与 README

- **关联**:BR-407;v2 标准面延续
- **前置任务**:11
- **风险等级**:P2

**具体操作**:

1. standards:host-descriptor 增 events/overview 能力描述;adapter-baseline 增新触点;`pnpm run standard:check` 0 FAIL。
2. `scripts/manual-test.sh` 增:overview → createBotSession(核 `~` 标题)→ prompt(--write)→ 起题核验 → rename → archive(或降级隐藏)→ 清理;`--no-write` 跳过 prompt/起题。
3. README:收纳开关(默认开/如何关/存量不迁移)、「在 DSH 打开」双入口行为差异、自动起题规则、归档语义(真归档+`archivedSessionIds` 排除;仅 `archive-unavailable` 才降级隐藏)、SSE 兜底行为。

**验证**:`pnpm run standard:check` 0 FAIL;`bash scripts/manual-test.sh --no-write` 全步通过

**Evidence**:`evidence/phase-4/standard-check.log` + `evidence/phase-4/manual-test.log` + `evidence/phase-4/docs-diff.md`

### Task 13: 执行 spec 5.2 真实场景全套测试

- **关联**:全部用户可见 UF(UF-401~405)+ 2.7 负向场景
- **前置任务**:12
- **风险等级**:P0

**验证**:按 5.2 执行矩阵逐行回放全部通过;每行 evidence 落盘后复跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav`(证据审计)

**Evidence**:`evidence/UF-401/`…`evidence/UF-405/`(全量)

**注意事项**:官方侧栏对比截图必须同屏含时间线索;隐藏会话跳转行必做。

### Task 14: 执行 Phase 4 回归验证(总收尾)

- **关联**:本 Phase 全部条目 + INV-401~404 + BR-407 终检
- **前置任务**:13

**验证**:`pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check` 全绿;v1 委托/v2 双人设隔离/v3 小组一轮各抽验一行;邻仓 `git status --porcelain` 干净(vibee 既有 `?? .vibee/` 除外);`rg -i 'anysphere|sand://' packages/` 为空;本仓 `git status` 无运行数据

**Evidence**:`evidence/phase-4/phase-summary.md` + `evidence/phase-4/final-regression.log`

---

## 5. 验收与 Review 协议

> **验收铁律:命令级验证(5.1)只是入场券;5.2 真实场景全套测试是完成的唯一标准。**

### 5.1 命令级验证(入场券)

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 构建 | `pnpm -r run build` | 全包成功 | EVD-406 |
| 类型 | `pnpm -r run typecheck` | 0 error | EVD-406 |
| 单测 | `pnpm -r test` | 全绿 | EVD-406 |
| 标准面 | `pnpm run standard:check` | 0 FAIL | EVD-406 |
| 包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav` | 0 FAIL | EVD-406 |

### 5.2 真实场景全套测试(Real-Run,完成的唯一标准)

**环境准备**:

| 项 | 值 |
|---|---|
| 启动命令 | `cd <本仓> && pnpm install && pnpm -r run build && sh env/setup.sh && sh env/boot.sh`(已起则 `dsh-rpc-who.sh 3084` 核身份) |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui`(直开)与官方 GUI `http://127.0.0.1:3084` 右栏「DSH Bot」页签;RPC `dsh-rpc.sh 3084`;marks CLI 见 `../archive/dsh-bot-mvp/spec.md` 2.3 节 |
| 测试账号/数据 | `env/settings.yaml` 现有模型路由 + `env/.env` 凭据;种子默认 bot;≥2 个人设(可现场新建) |
| 干净状态定义 | 收纳/起题行只需新会话,无需清库;归档行新建专用会话 |
| 可用测试工具 | chrome-devtools 类 MCP / Playwright(v2/v3 已实证);RPC/CLI 直跑留档 |

**执行矩阵**:

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-401 主路径(页签跳转) | browser | 2.3 UF-401 步骤 1-3 | 可见与隐藏会话都能到达官方视图 | `evidence/UF-401/jump-tab.png` + `evidence/UF-401/jump-hidden.png` |
| UF-401 失败分支 已归档 | browser | 2.3 UF-401 失败分支 4 | 桥端回执 `archived`,current 不动,toast 文案含「已归档」 | `evidence/UF-401/jump-archived.png` |
| UF-401 直开降级 | browser | 2.3 UF-401 失败分支 1 | 菜单项为复制 ID + tooltip | `evidence/UF-401/standalone-fallback.png` |
| UF-401 恶意消息 | browser console | 2.7 恶意消息 | 异源/异 type 不触发跳转 | `evidence/UF-401/bad-message.md` |
| UF-402 主路径(收纳开) | browser + 官方 GUI | 2.3 UF-402 步骤 1-2 | 新会话官方侧栏不可见、工作台可见 | `evidence/UF-402/hidden-on.png` + `evidence/UF-402/marks.txt` |
| UF-402 开关关闭 | browser | 2.3 UF-402 步骤 3 | 新会话官方侧栏可见 | `evidence/UF-402/hidden-off.png` |
| UF-402 存量兼容 | CLI 取证 | 2.7 旧数据兼容 | v2/v3 存量会话标题/过滤零变化 | `evidence/UF-402/legacy.md` |
| UF-403 主路径(起题) | browser + RPC | 2.3 UF-403 步骤 1 | 首轮后标题=首问摘要(≤20 字) | `evidence/UF-403/auto-title.png` |
| UF-403 重命名不覆盖 | browser | 2.3 UF-403 步骤 2-3 | 人工名多轮后保持 | `evidence/UF-403/manual-rename.png` |
| UF-403 非法输入 | browser | 2.7 非法输入 | 空名拒绝/控制字符清洗 | `evidence/UF-403/invalid-input.md` |
| UF-404 主路径(归档) | browser + RPC | 2.3 UF-404 步骤 1-3 | 列表移除+自动切换+官方可寻回 | `evidence/UF-404/archive.png` + `evidence/UF-404/archive-rpc.txt` |
| UF-404 网关死分支 | browser(停 boot) | 2.7 依赖失败 | 错误条可重试不白屏 | `evidence/UF-404/gateway-down.md` |
| UF-404 防重 | browser | 2.7 重复提交 | 连点只归档一次 | `evidence/UF-404/double-submit.md` |
| UF-405 主路径(实时) | browser + network | 2.3 UF-405 步骤 1-3 | ≤2s 更新;每拍 1 个 overview;events 常驻 | `evidence/UF-405/realtime.png` + `evidence/UF-405/network.png` |
| UF-405 SSE 断线 | browser(重启网关) | 2.3 UF-405 失败分支 1 | 回落轮询+自动重连 | `evidence/UF-405/sse-fallback.md` |
| v1/v2/v3 回归抽验 | browser + RPC | 各包 5.2 主路径行 | 委托/双人设隔离/小组一轮零回归 | `evidence/phase-4/regression.md` |

**通过标准**:矩阵全部行通过且 evidence 齐全;任何一行失败回对应任务修复重跑。

### 5.3 Evidence 目录结构与命名

```text
docs/dsh-bot-session-nav/evidence/
  phase-0/ … phase-4/
  UF-401/ … UF-405/
```

### 5.4 Review 专项检查清单

- [ ] BR-401:postMessage 桥有 origin + source + type 三重校验;直开降级可用
- [ ] BR-402:收纳开着时工作台默认列表仍含自家隐藏会话;委托/轮次过滤零回归
- [ ] BR-403:自动起题幂等且不覆盖人工名;失败不阻塞 history
- [ ] BR-404:归档走 `archiveSession`+`archivedSessionIds` 排除(不因 list 行无 archived 字段改成隐藏);失败回滚,无半删状态
- [ ] BR-405/406:network 面板证据在案;SSE 断线回落实测;INV-404 订阅只读
- [ ] 红线终检:`rg -i 'anysphere|sand://' packages/` 为空;运行数据不入 git
- [ ] 5.2 执行矩阵全部通过,evidence 与 2.5 清单一致
- [ ] 2.3 每条流程的入口接线可达(菜单/按钮真实存在)
