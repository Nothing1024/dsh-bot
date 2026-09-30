# 未完成 PRD 决策简报

日期：2026-09-13。对照：当前代码 + 各包 spec §0/§2 + left-tab 已验收事实。
目的：逐条标「已用别的方式覆盖 / 合同过时应砍 / 痛点仍在要做」。

**归档（同日）**：用户决定五个剩余活跃包全部进 `docs/archive/`（workbench / session-nav / group-rounds / interaction-master / left-tab）。本文件保留为收口依据；要重开先走变更协议，不要按旧 `tasks.csv` execute。

## 先看产品面（left-tab 之后）

1:1 已经不在 iframe 里聊。主路径是：底栏「Bot」→ 左栏人名册 → 点人设 → **官方中栏**打开绑定会话（官方 composer / 轨迹）。小组仍进右栏「DSH Bot」页签（iframe 工作台）。官方「+ 新会话」故意不拦截。

session-nav / group-rounds 是 09-01 写的，当时 1:1 还整页住在 iframe。left-tab（09-08 Done）把 1:1 的壳换了，合同没跟着改。

---

## 总表

| 包 | 板面 | 建议 |
|---|---|---|
| `dsh-bot-left-tab` | 23/23 Done | **归档**。功能已交。 |
| `dsh-bot-workbench` T18 | 18/19，UF-205 env 阻塞 | **关单**：官方「+」不再建 bot preset 会话，阻塞窗口不存在了。 |
| `dsh-bot-session-nav` T5–T14 | 4/14 | **拆开拍**：跳转已做完；收纳与合同冲突；起题被 bot 名部分覆盖；overview 被 left-tab B 路替代。 |
| `dsh-bot-group-rounds` | 0/15 | **仍是产品缺口**（小组还在 iframe，仍是一轮广播）。 |
| `dsh-bot-interaction-master` | 0/5 | **先挂起**。子包范围不定，母包没有独立产品。 |
| `archive/dsh-bot-native-surface` | Deferred 0/14 | 保持搁置。 |

---

## 1. session-nav：三条原痛点还在不在

原 §0：① 一堆「新对话」分不清；② 工作台会话堆满官方侧栏；③ 没法跳到官方视图看工具卡。

### BR-401 点击跳转 — 已做完（换入口也覆盖了）

| | |
|---|---|
| 合同 | iframe 行菜单「在 DSH 打开」→ postMessage 桥 → `sessions.open` |
| 现状 | P1（T2–T4）已落地：`session-jump.ts` / `jump.ts` / SessionList 菜单。归档目标回 `archived`。 |
| left-tab 之后 | 点人设**直接** `sessions.open` 官方中栏，1:1 主路径不再需要菜单跳转。桥仍服务：右栏 iframe 里的 1:1、浏览器直开 `/dsh-bot/ui`。 |
| **建议** | **算做完。** 不要再为 1:1 主路径加跳转。 |

### BR-402 收纳（默认 `~` 隐藏新会话）— 与 left-tab 冲突，建议砍

| | |
|---|---|
| 合同 | `createOwnedSession` 默认 `~ 新对话` + `kind:hidden` + `kind:dsh-bot-wb`，官方侧栏看不见 |
| 现状 | **没做。** 创建 tags 只有 `kind:dsh-bot` + `bot:<id>`，标题是人设名。 |
| left-tab 之后 | Bot 模式遮蔽官方树，收纳无意义。会话模式里若把 bot 会话藏起来，`sessions.open` / 身份条 / 官方 composer 这条主链会断——人设点开的就是这些官方会话。 |
| **建议** | **砍原合同。** 不要给新 1:1 打 `kind:hidden`。若会话模式里 bot 会话仍嫌吵，另开需求（「会话树里折叠 bot 分组」），不是现在这套 `~` 隐藏。 |

### BR-403 自动起题 — 部分被 bot 名覆盖，建议改合同或砍

| | |
|---|---|
| 合同 | 占位「新对话」在首轮后改成首条用户消息 ≤20 字 |
| 现状 | **没做 `deriveSessionTitle`。** `createOwnedSession` 标题 = 人设名（`visibleBotTitle(bot.name)`），不再是「新对话」。 |
| 副作用 | 合同写「只对占位标题起题」。现在标题已是人设名 → 按原文实现，起题**永远不会触发**。 |
| 还痛吗 | 同一人设多条会话时，官方树和下挂列表会是一串相同人设名，仍难区分。名册行本身是身份，不靠会话标题。 |
| **建议（三选一）** | **A 砍**：接受「标题 = 人设名」，多会话靠时间/预览区分（left-tab 已有预览）。**B 改写**：保留人设名作默认，提供手动重命名；不要自动覆盖。**C 仍做自动起题**：创建时必须改回占位「新对话」，和现在的 bot 名策略相反。 |

### BR-404 重命名 / 显示隐藏 / 归档 — 归档合同已假，建议砍归档

| | |
|---|---|
| 合同 | 行菜单：重命名、在 DSH 显示/隐藏、归档（官方归档区可寻回） |
| 现状 | 行菜单**只有跳转**。 |
| ASM-406 | rc.2 官方**没有**归档查看 / unarchive；归档 = 工作台和官方双向不可见。UF-404「官方可寻回」已证伪。 |
| **建议** | **砍归档**（按现平台做了等于丢会话）。隐藏并入 BR-402，建议一起砍。重命名跟 BR-403 走：选 B 就做手动重命名；选 A 可以都不做。 |

### BR-405 / BR-406 overview + roster 脏通知 — 主表面已换实现，建议砍原方案

| | |
|---|---|
| 合同 | 新 `POST /dsh-bot/overview`；SSE 事件 `{kind:session\|roster}`；iframe roster 每拍 1 个请求 |
| 现状 | **没有 `overview` case。** `GET /dsh-bot/events` 已有，但是 live-transcript 的 mux 帧（思考/工具/审批）+ `bot/status`，不是脏通知协议。 |
| left-tab | B 路：`listBots` + `listGroups`，选中才懒拉 `listBotSessions`；SSE 300ms debounce 重拉 list；预览走官方 `sessions.list` + `history`。主名册**已经不是** O(N) `listBotSessions`。 |
| iframe | `App.tsx` 仍对每个 bot/group 打 `listBotSessions` / `listGroupSessions`（SSE 就绪 15s，否则 2s）。小组 `working` 在这条映射里写死 `false`。iframe 现在主要是小组 + 直开，不是 1:1 主面。 |
| **建议** | **砍新 overview RPC 和脏通知协议。** 主名册已够用。iframe 的 O(N) 若以后烦，再把 tick 收成「只拉选中 + 小组」，不必先做聚合接口。 |

### session-nav 拍板选项

1. **收缩包**：T2–T4 标 Done；T5–T14 按变更协议从 §2 删掉或改成「非目标」；Status → Done（跳转交付）。推荐，若接受「标题 = 人设名」。
2. **只留手动重命名**（BR-403B + 菜单改名），不做收纳/归档/overview。
3. **按原文继续跑** T5–T14。风险：收纳破坏 left-tab 主链；起题与当前 bot 名创建冲突；归档在 rc.2 不可逆。

---

## 2. group-rounds：不是「换方式做了」，是没做

小组仍在 iframe。引擎仍是三期 `runGroupRound`：用户一句 → 成员串行各一句 → 结束。`groups.json` 无 `rounds`。房间标题写死 `房间 {id 前 8 位}`。

| ID | 合同 | 现状 | 建议 |
|---|---|---|---|
| BR-501 多轮 1–3 | 第 2 轮起回应同伴；轮转起点；全员 pass 散会 | **无。** 永远一轮。 | **要「开会」就必须做。** 若接受广播，整包砍。 |
| BR-502 继续讨论 | 不追加用户消息再聊一轮 | **无按钮。** | 同上。 |
| BR-503 chips 三态 + 第 r/R 轮 | 已发言✓ / 正在发言 / 排队中 | 只有 speaking 动效。 | 同上。 |
| BR-504 单成员重试 | 错误行「重试该成员」 | error 行会写，**无重试按钮**（`Transcript.tsx` 无「重试」）。 | 小而独立，即使不做多轮也可以做。 |
| BR-505 回复即点名 | `@` > 引用目标 > 全员；wake 带引用句 | UI 有回复 pill，**发送不改回应者**。`promptSession` 只把原文交给 `parseMentions`（只认 `@`）。引用只给记忆引用条。 | **半成品。** 要么做完接线，要么去掉 1:1 不该有、小组也无效的回复按钮。 |
| BR-506 轮内排队 | host `roundQueue` ≤3，UI 可取消 | **无。** 讨论中再发送会在 `withRoomLock` 后**再跑一整轮**（又 append 一条用户消息）。Composer `mode:'queue'` 是 1:1 的 `sessions.prompt` 队列，不是讨论队列。 | 要多轮才有意义；单轮现状等于「锁外再来一轮」，容易叠房间。 |
| BR-507 房间名 / 删房间 / 小组 working 真值 | jsonl title 行；删房间不伤 1:1；`listGroupSessions.running` | 标题占位；`App.tsx` 把每个房间 `working: false`。选中房间的 history 才有 `roundTracker.working`。 | 标题 + working 真值即使不做多轮也值得做。删房间看要不要。 |
| BR-508 默认 1 轮 = 三期 | 兼容红线 | 当前就是三期行为。 | 保底。多轮必须缺省 1。 |

**建议（二选一）**

- **做精简包**：BR-501/502/503/506 多轮开会（原包核心）；顺手做 BR-504 重试、BR-505 把引用接到 `parseMentions`、BR-507 标题与 working。
- **砍多轮，只修三期缺口**：房间自动起题、roster 小组 working 真值、错误行重试、回复要么接线要么删除。工作量远小于 15 任务原包。

母包 `interaction-master` 的联合场景（多轮中跳隐藏轮次会话、讨论中 roster 实时态）依赖「先有多轮 + session-nav P3」。两者都砍/收缩后，母包没有内容。

---

## 3. workbench T18 — 关单，不是接着回放

阻塞行：UF-205「官方 GUI 直建无标 dsh-bot preset 会话，打开工作台补标」。

后来的合同已经取消这个窗口：

- workbench BR-208（09-12）：官方「+」跟随平台默认 preset，**不再**列出 DSH Bot。
- left-tab BR-609：Bot 模式不拦截官方「+」。
- closer 自己记：官方「新会话」`added=[]`，落地复用已有 DSH Bot 会话。

补标通道（`reconcile` 扫遗留 `agentPreset: dsh-bot / dsh-bot--*`）closer 复验是绿的。14/15 行过，缺的是一个产品已删除的入口。

**建议**：spec §1.5 记「UF-205 GUI 直建窗口被 BR-208/BR-609 取消；遗留补标仍绿」→ Task 18 Done → 包 Status Done → 视情况归档（工作台还是活入口，也可以留在活跃目录当合同，不必强行进 archive）。

---

## 4. 建议你拍的题

1. **session-nav 收纳（BR-402）**：砍（推荐） / 仍做默认隐藏？砍才能保住 left-tab「点人设开官方会话」。
2. **会话标题（BR-403/404）**：A 保持人设名、不做起题归档 / B 只加手动重命名 / C 按原文自动起题（会改回「新对话」占位）？
3. **overview + 脏通知（BR-405/406）**：砍原方案（推荐） / 仍给 iframe 做聚合 RPC？
4. **小组**：精简多轮开会 / 只修三期缺口（标题、working、重试、回复接线） / 整包不做？
5. **workbench T18**：按上文关单？
6. **left-tab**：现在 `git mv` 进 `archive/`？

拍完再改 spec §2 做变更协议；未拍板前不要按旧 tasks.csv 接着 execute。

---

## 5. 2026-09-30 拍板记录

对照代码：`fd2be5d`（09-19）已加多轮、单成员重试、房间标题；`c012211`（09-30）已删 left-tab 名册 / iframe / 身份条。

| 题 | 用户决定 | 落地 |
|---|---|---|
| 放弃包 | 删 `interaction-master`、`native-surface` | 已 `git rm`，登记 `archive/README.md`「已删除」 |
| 主面 | 认「官方壳内嵌工作台」 | left-tab 降为历史基线；`ui-feedback-triage.md` P0-1/2/3 按旧入口报，需按新入口重测 |
| 小组默认轮数 | 保持 3 轮，改合同 | 取代 group-rounds 的 BR-508「默认 1 轮」；老小组无 `rounds` 字段也按 3 轮 |
| 多轮缺口 | 全做：引用即点名、轮内排队可取消、继续讨论、删房间 | 待开新包（旧 group-rounds 板面不复用） |
| session-nav T5–T14 | 关单（不做） | 板面标已完成 + 备注；spec Status → Done 收缩交付 |
| workbench T18 | 关单（被取代） | 板面标已完成 + 备注；spec Status → Done 19/19 |

### 小组补齐项设计（新包输入）

| 项 | 定案 |
|---|---|
| 引用即点名 | 回应者 = 显式 `@` > 被引成员 > 全员。只点名被引成员；引用自己的消息、或被引成员已不在组 → 回退全员 |
| 轮内排队 | host 内存 FIFO ≤3，满则拒绝；讨论结束后才写进房间并按正常语义开下一场；可单条取消；网关重启清空（README 写明） |
| 继续讨论 | 房间 idle 时可点；写一条 `{kind:'system', text:'继续讨论'}` 分隔行作锚点，界面显示灰色分隔线，不当用户消息交给成员；回应者全员，轮数按组设置 |
| 删房间 | 二次确认后删 jsonl + `rooms.json` 索引；成员隐藏轮次会话保留不归档；1:1 与人设零影响 |
