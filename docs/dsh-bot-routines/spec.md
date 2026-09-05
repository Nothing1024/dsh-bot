# dsh-bot-routines Spec

> Version: 0.1.0 | Date: 2026-09-06 | Status: Ready 可执行
>
> 本文件是本需求的**唯一事实源**。其他文件（tasks.csv）只引用本文件，不复制内容。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：在 DSH Bot 工作台里用多个人设（bot）的本机用户。今天 bot 只在你发消息那一刻存在，你不看屏幕它就什么都不做，像工具不像同事。
- **做什么**：给每个 bot 加**例程**（定时任务）——到点 host 自动叫醒它跑一轮，告诉它"没人在等你，有事就说没事别说"；它有话说就落到自己的一段专用会话里，名册亮未读、右下弹通知。另外 bot 观察到你反复让它做同一件事时，可以**主动提议**"要不我设成例程"，你一键同意。
- **改哪里**：`dsh-bot-host`（例程存储、cron 调度器、唤醒投递、未读计数、五个 RPC）、`workbench-ui`（详情栏「例程」页签：列表/开关/新建；名册未读徽标；浏览器通知；消息里的「设成例程」卡片）、bot preset（人设文本附带"例程回合规范"）。
- **怎么算做完**：在真实 :3084 工作台里：给「运维夜班」建一条每分钟例程"报告当前时间"→ 1 分钟内它的线程出现一条带「主动 · routine」标签的消息、名册出现未读 1、窗口失焦时弹系统通知；把例程指令改成"没事别说话"→ 下一分钟不再有新消息；关掉开关 → 不再触发；重启网关后开着的例程继续跑。
- **不做什么**：不做外部事件监听（Slack/GitHub）、不做 bot 互发消息（`[agent]` 唤醒）、不做移动推送、不做花费守卫——另立包。用户自己主动发的消息不受例程影响。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 用户 2026-09-06 认可 `../prototypes/dsh-bot-grok-parity.html` 后回复 oneclick；本包 = 原型「Bot 主动来消息」「主动提议例程」「例程」页签，对标 Grok Bot Wake 机制中的 routine 一路（最初调研 §4.2） |
| 输入类型 | description |
| Mode | oneclick |
| 置信度 | 高 |
| 输出目录 | `docs/dsh-bot-routines/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | backend（主：调度器 + 投递 + 存储）+ frontend（例程页签、未读、通知、提议卡）+ prompt（唤醒词与"没人在等"规范） |
| 主要风险 | ① host 进程内定时器与网关生命周期绑定（重启需重新武装）；② 唤醒轮次与用户正在进行的轮次撞车（同会话串行锁）；③ bot 在"没事"时仍产出填充文本；④ 无 cron 依赖，需自写 5 字段解析 |
| 行号引用策略 | 仅 hint |
| 必需验收方式 | 真实浏览器回放 + 等待真实定时触发（用 `@every 1m` 缩短等待）+ 文件与日志核对 |
| 必须覆盖用户场景 | 建例程、到点唤醒落消息、静默、开关、重启续跑、主动提议 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 插件运行数据根 `$DSH_HOME/dsh-bot/`，已 gitignore | `grep -n "dsh-bot" .gitignore` | L14 |
| bot 会话创建 `createOwnedSession`（`platform.createSession({agentPreset,cwd})` + marks）；投递 `promptOwnedSession` → `sessionTool.write`，带按 sessionId 的 `promptLocks` 串行 | `rg -n "export async function createOwnedSession\|export async function promptOwnedSession\|promptLocks" packages/dsh-bot-host/src/workbench-sessions.ts` | L350 / L484 / L42-49 |
| 轮次闭合判定 `turnIsOpen(events)`，事件来自 `ctx.get('sessions')` | `rg -n "export function turnIsOpen\|function sessionEvents" packages/dsh-bot-host/src/workbench-sessions.ts` | L306 / L322 |
| 隐藏标题前缀常量 `DSH_BOT_HIDDEN_TITLE_PREFIX = '~dsh-bot: '`、`DSH_BOT_GROUP_HIDDEN_TITLE_PREFIX`；`botMark(botId)` | `rg -n "~dsh-bot\|export function botMark" packages/dsh-bot-host/src/marks.ts` | L16 / L18 / L24 |
| `listOwnedSessions` 已过滤 `group-room:` 会话 | `rg -n "export async function listOwnedSessions" packages/dsh-bot-host/src/workbench-sessions.ts` | L399 |
| host 服务 `DshBotService extends Service`，`static Config` zod + `installSettingsSection` 热更新；无 `start/stop` 覆写（构造函数在 L248） | `rg -n "class DshBotService extends Service\|static Config\|constructor\(" packages/dsh-bot-host/src/index.ts` | L224 / L227 / L248 |
| RPC 分派 `workbench-routes.ts`；HTTP `webServer.register({kind:'prefix'})`；错误 `{ok:false}` | `rg -n "listBotSessions" packages/dsh-bot-host/src/workbench-routes.ts`；`rg -n "kind: 'prefix'" packages/dsh-bot-host/src/routes.ts` | L177-227；L124 |
| 工作台名册 `Roster.tsx` 现无 unread 字段（只有 `sessionCount` 与 `working`）；`App.tsx` 每 2s 轮询 `listBotSessions`，30s `reconcile` | `rg -n "unread" packages/workbench-ui/src/Roster.tsx`（0 命中）；`rg -n "sessionCount\|working" packages/workbench-ui/src/Roster.tsx`；`rg -n "RECONCILE_MS" packages/workbench-ui/src/App.tsx` | Roster L21/L37；App L56 |
| 工作台无浏览器 `Notification` 使用 | `rg -n "Notification" packages/workbench-ui/src` | 0 命中 |
| 会话头 `.conversationHead`；`Transcript.tsx` 有 `showAuthor` 与消息动作；`api.ts` RPC 客户端 | 同 memory spec 1.3 | — |
| 仓内无 cron 解析依赖（`node_modules/.pnpm` 无 cron/croner/node-cron） | `ls node_modules/.pnpm \| grep -iE "^(cron\|croner\|node-cron)"` | 空 |
| 平台 `dsh-jobs` 是进程内 job 注册表（owner/settlement 语义），非 cron 调度器 | `grep -rn "cron\|schedule" env/profiles/gb/node_modules/@deepseek-ai/dsh-jobs/lib/types/*.d.ts` | 无 cron 语义 |
| 仓库脚本与测试目录、:3084、Playwright | 同 memory spec 1.3 | — |
| Grok Bot Wake 参考形状（只读）：`[routine]` cue 前缀、"nobody is waiting"、静默不发填充、结果随口提不复述 cron、落盘队列重启重武装、系统通知仅失焦且 5s 节流 | 最初调研 §4.2 | 形状可对齐，文案自写 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-901 | host 进程内 `setTimeout` 链在网关运行期间稳定；`DshBotService` 构造函数可挂调度器启动，`ctx` 生命周期结束时可 `clearTimeout`（cordis Service dispose 语义） | 定时器随插件热重载泄漏或被回收 | Task 1：加临时 1 分钟定时器，`sh env/boot.sh` 后观察 3 次触发日志；触发 settings 热更新后不重复 |
| ASM-902 | 唤醒消息经 `sessionTool.write` 写入 bot 的例程专用会话后，`sessionTool.wait({until:'idle'})` 能在 `askTimeoutMs` 内返回；bot 回复经 `extractAssistantAnswer` 可取 | 同 `askBot` 链路，已在 v1 验证 | Task 1 复用 `manual-test.sh` 一次 |
| ASM-903 | preset persona 追加"例程回合规范"后，bot 在无事时能输出约定的静默标记（如单独一行 `(silent)`），可被 host 识别为"不落消息" | 模型不遵守 → 产出填充文本 | Task 1：3 次"没事"唤醒实测静默率 |
| ASM-904 | 用户正在与该 bot 的例程会话交互时，唤醒经 `promptLocks` 排队不撞车；若用户在同一 bot 的**另一**会话交互，互不影响 | 撞车导致用户轮次被插话 | Task 1：用户轮次进行中触发唤醒，观察顺序 |

---
## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。ID 用 9xx 段（memory 用 8xx，native-surface 用 7xx）。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-901 | 存储：`$DSH_HOME/dsh-bot/routines.json` 数组，每条 `{id, botId, name, schedule, instruction, enabled, sessionId?, createdAt, lastRunAt?, lastOutcome?:'spoke'\|'silent'\|'error', runs:[{ts,outcome,ms}] ≤20}`；schedule 支持 5 字段 cron、`@hourly/@daily/@every <N>m\|h`、可选 `CRON_TZ=<tz>` 前缀；不入 git | `@every 1m` 每分钟触发 | 写进 `bots.json`；`runs` 无上限 | dsh-bot-host | vitest（解析）+ `cat` |
| BR-902 | 调度：host 进程内单一调度器，每条 enabled 例程按下一触发时刻 `setTimeout`；网关启动时从文件重新武装；`enabled=false`/删除即撤销；同一例程上一次未结束不重入 | 重启后 1 分钟内继续触发 | 重启后例程失效；同一例程并发两次 | dsh-bot-host | 真机重启 + 日志 |
| BR-903 | 唤醒投递：到点 → 确保该 bot 有一段**例程专用会话**（marks `bot:<id>` + `routine:<routineId>`，标题 `例程 · <name>`，不隐藏、出现在 1:1 列表）→ `sessionTool.write` 唤醒词（自写，含 `[routine]` 前缀、例程名、用户指令、"没有人在等你，没事就只输出 `(silent)`"）→ `wait until idle`；bot 输出若仅为 `(silent)` → 不计消息、`lastOutcome:'silent'`；否则 `lastOutcome:'spoke'` 并把该会话最新 assistant seq 记为未读 | 巡检正常时线程里不出现任何新气泡 | 每次都落一条"无事"消息；唤醒词进 1:1 历史显示为用户消息 | dsh-bot-host | 真机 + `cat routines.json` |
| BR-904 | 未读与通知：host 维护 `unread[botId] = 未读 assistant 消息数`，`listBots` 返回 `unread`；用户打开该 bot 任一会话 → 清零；工作台名册显示数字徽标；`spoke` 时若 `document.hidden` 且 5s 内无同 bot 通知 → 浏览器 `Notification`（首次请求权限，被拒则静默） | 切走后触发 → 徽标 1 + 系统通知 | 窗口聚焦时仍弹系统通知；打开会话后徽标不清 | host + workbench-ui | 真机 |
| BR-905 | 例程页签：详情栏「例程」列表（名 / schedule / 开关 / 上次：时间 + spoke/silent/error）+「新建」表单（名、时间快捷选项或 cron 文本、指令、有输出时通知开关）+ 删除二次确认；时间文本非法 → 表单内联报错不提交 | 建后列表立即出现，`lastRun` 空 | 非法 cron 被保存 | workbench-ui + host | 真机 |
| BR-906 | 主动提议：bot preset 附带「主动性规范」（自写）：连续 ≥2 次被要求做同类事时可**一次**提议设为例程，输出固定块 `[propose-routine]{"name","schedule","instruction"}[/propose-routine]`；host 识别该块 → 替换为工作台「设成例程 / 不用」卡片；「设成例程」= 调 `routineCreate`；「不用」= host 记录 `declined` 到该 bot，唤醒词与人设里注明不再提同类建议 | 卡片一键启用后例程页签出现该条 | 每轮都提议；被拒后再提 | host + workbench-ui + preset | 真机 |
| BR-907 | RPC：`routineList({botId?})`、`routineCreate({botId,name,schedule,instruction,notify})`、`routineUpdate({id,…})`、`routineDelete({id})`、`routineRunNow({id})`（手动触发，用于验收）；`listBots` 增 `unread`；`markRead({botId})`；错误 `{ok:false}` | curl 六例 | 500 | dsh-bot-host | curl + vitest |
| BR-908 | 红线：不改官方包与邻仓；一口一仓 :3084；`routines.json` 不入 git；参考树只读（`rg -i 'anysphere\|sand://' packages/` 为空）；唤醒词、静默标记、主动性规范文案自写 | — | 拷参考 cue/文案 | 全部 | 收尾命令 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-901 | 工作台选中「运维夜班」，例程为空 | 例程页签新建「报时」`@every 1m`，指令"报告当前时间，一句话" | 列表出现该条；≤70s 后名册未读 1，其线程「例程 · 报时」出现一条带「主动 · routine」标签的消息 | 本机用户 | browser | EVD-901 |
| UF-902 | UF-901 完成 | 把指令改为"如果没有异常就别说话"，等下一次触发 | 线程无新消息；页签该条「上次：silent」 | 本机用户 | browser | EVD-902 |
| UF-903 | 例程 enabled | 切到另一 bot，等触发；点回「运维夜班」 | 切走期间徽标出现、失焦时系统通知；点回后徽标清零 | 本机用户 | browser | EVD-903 |
| UF-904 | 例程 enabled | 关掉开关等 2 分钟；重新开；`sh env/boot.sh` 重启网关等 2 分钟 | 关时无触发；重启后继续触发 | 本机用户 | browser + log | EVD-904 |
| UF-905 | 与「校对阿宁」连续两轮都说"校一下今天的稿" | 第二轮回复 | 回复末尾出现「设成例程 / 不用」卡；点「设成例程」→ 例程页签出现 | 本机用户 | browser | EVD-905 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-901: 新建例程并被唤醒

**前置状态**：`sh env/boot.sh` 已起；工作台打开；「运维夜班」存在，例程为空。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 详情栏「例程」→「＋ 新建例程」 | 表单展开 | — | — |
| 2 | 填名「报时」、时间点「每 1 分钟」（或 cron 文本 `@every 1m`）、指令、通知开 → 「创建」 | 按钮 loading → 列表出现该条，开关 on，「上次：—」 | `routineCreate` → 写文件 → 调度器武装 | — |
| 3 | 等待 ≤70s | 名册「运维夜班」出现徽标 1；详情该条「上次：刚刚 · spoke」 | 到点 → 建/复用例程会话 → write 唤醒词 → wait → 非 silent → unread+1 | 点进其线程「例程 · 报时」：一条 assistant 消息，作者行带「主动 · routine」 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 时间文本非法 | `@every 0m` / `61 * * * *` | 表单字段红框「时间格式不对」，不提交 | 前端预校验 + host 二次校验 `{ok:false}` | 改正 |
| 唤醒超时/出错 | `wait` 超时 | 页签该条「上次：error」；线程无消息；无 toast | `lastOutcome:'error'`，下次照常 | 连续 3 次 error → 线程落一条系统提示行「例程连续失败，请检查」 |
| bot 已删除 | 例程指向不存在 bot | 页签不显示；调度跳过并 `enabled=false` | 清理 | — |

**界面状态机**：

```text
list.empty → form → creating → list(row: idle) → (到点) running → row: spoke(+unread) | silent | error
```

**入口接线清单**：

- `Conversation.tsx` 会话头「ⓘ」/ 详情栏 `dTabs`「例程」→ `RoutinesPanel`（新）
- `RoutinesPanel`「创建」→ `api.routineCreate`
- host：`DshBotService` 构造时 `createScheduler(...).arm()`；settings 热更新不重复 arm

#### UF-902: 静默

**前置状态**：UF-901 完成。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 例程行「编辑」，指令改"如果没有异常就别说话" → 保存 | 行更新 | `routineUpdate` | — |
| 2 | 等下一次触发 | 该条「上次：刚刚 · silent」；徽标不变 | bot 输出仅 `(silent)` → 不计消息 | 线程无新气泡 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| bot 不守规范输出填充 | 输出非 `(silent)` 的"没有异常。" | 落一条消息 | 记 spoke | 唤醒词强调静默标记；ASM-903 校准结果决定是否加"短于 12 字且含'无/没有'即视为静默"兜底 |
| 用户正在该线程打字 | 触发撞用户轮次 | 用户消息先完成，唤醒排队后跑 | `promptLocks` 串行 | — |

**界面状态机**：`row: idle → running → silent`

**入口接线清单**：`RoutinesPanel` 行「编辑」→ `api.routineUpdate`

#### UF-903: 未读与通知

**前置状态**：例程 enabled。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 选中「诗人小北」，把浏览器切到后台 | — | — | — |
| 2 | 例程触发 | 名册「运维夜班」徽标 1（2s 轮询）；系统通知「运维夜班：<首句 ≤140 字>」 | `listBots.unread`；工作台 `document.hidden` 且 5s 节流通过 → `new Notification` | 点通知 → 窗口前置并选中该 bot |
| 3 | 点「运维夜班」 | 徽标消失 | `markRead` | — |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 通知权限被拒 | `Notification.permission==='denied'` | 只有徽标 | 不再请求 | 设置里说明 |
| 窗口聚焦 | `document.hidden===false` | 只有徽标 + toast | 不发系统通知 | — |
| 5s 内同 bot 再触发 | — | 徽标 2，一条通知 | 节流 | — |

**界面状态机**：`badge:0 → badge:N → (select bot) badge:0`

**入口接线清单**：`Roster.tsx` 行徽标读 `bot.unread`；`App.tsx` 轮询 `listBots` 时 diff unread 增量 → `notify()`；选中 bot → `api.markRead`

#### UF-904: 开关与重启续跑

**前置状态**：例程 enabled。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 关开关 | 行变灰 | `routineUpdate({enabled:false})` → 撤销 timer | 2 分钟内无触发（`runs` 不增） |
| 2 | 开开关 | 行恢复 | 重新 arm | 下一分钟触发 |
| 3 | `sh env/boot.sh`（先停再起） | 页面重连 | 构造函数从文件 re-arm | 2 分钟内触发一次 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 文件损坏 | `routines.json` 非法 JSON | 页签「例程数据损坏，已备份为 .bak」 | 重命名 `.bak`，从空开始 | 手工恢复 |
| 全局关闭 | settings `dsh-bot.routines.enabled=false` | 页签顶部横幅「例程已全局关闭」 | 调度器不 arm | 设置打开 |

**界面状态机**：`row.on ⇄ row.off`

**入口接线清单**：`RoutinesPanel` 开关 → `api.routineUpdate`；host `static Config.routines.enabled`

#### UF-905: 主动提议例程

**前置状态**：「校对阿宁」新会话。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 发"校一下今天的稿"→ 回复 → 再发"校一下今天的稿" | 正常两轮 | preset 主动性规范生效，第二轮输出含 `[propose-routine]{…}[/propose-routine]` | 回复正文 + 卡片「要不我每个工作日 9 点自己跑？」「设成例程 / 不用」（原始块不显示） |
| 2 | 点「设成例程」 | 卡片变「✓ 已启用」 | `routineCreate` 用块内 name/schedule/instruction | 例程页签出现该条 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 点「不用」 | — | 卡片变「已拒绝，不再提」 | host `declined[botId].push(name)`；后续唤醒词/注入段附「用户已拒绝：…」 | — |
| 块 JSON 非法 | 模型输出坏 | 不渲染卡片，原文隐藏 | 记 warn | — |

**界面状态机**：`card → accepting → enabled | declined`

**入口接线清单**：host `projectWorkbenchHistory` 识别块 → 投影为 `kind:'propose-routine'` 项；`Transcript.tsx` 渲染卡片 → `api.routineCreate` / `api.routineDecline`

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-901 | 用户主动发的消息链路（`promptOwnedSession`）行为不变；例程唤醒词不出现在工作台历史的用户气泡里（`isPlatformInjection` 覆盖 `[routine]` 前缀） | BR-903 | vitest + 真机 |
| INV-902 | 例程会话出现在 1:1 列表且带 `routine:` mark；`dsh_bot_ask` 隐藏会话与小组轮次会话不受影响 | BR-903 | `listOwnedSessions` 断言 |
| INV-903 | 一口一仓 :3084、邻仓干净、红线 rg 为空、`routines.json` 不入 git | BR-908 | 收尾命令 |
| INV-904 | 调度器在 `enabled=false` 或 bot 删除后零触发（无孤儿 timer） | BR-902 | vitest（fake timers） |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-900 | log | Task 1 校准 ASM-901~904 | `evidence/phase-0/calibration.md` |
| EVD-901 | screenshot+file | 新建后列表、触发后线程消息与徽标；`routines.json` | `evidence/UF-901/` |
| EVD-902 | screenshot+file | silent 状态行；线程无新消息 | `evidence/UF-902/` |
| EVD-903 | screenshot | 徽标、系统通知截图、清零 | `evidence/UF-903/` |
| EVD-904 | log+file | 关/开/重启三段 `runs` 对比 | `evidence/UF-904/` |
| EVD-905 | screenshot | 提议卡与启用后页签 | `evidence/UF-905/` |
| EVD-906 | api | 六个 RPC curl | `evidence/API-907/` |
| EVD-907 | log | 各 Phase 命令输出 | `evidence/phase-{N}/` |

### 2.6 角色与权限矩阵

单一本机用户，loopback，无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 空数据 | 无例程 | 打开页签 | 空态「没有例程。到点它会自己醒来，有事才说。」 | EVD-901 |
| 依赖失败 | 网关模型凭据缺失 | 触发 | `lastOutcome:'error'`，连续 3 次落系统提示行 | EVD-907 `phase-2/wake-error.log` |
| 重复提交 | 快速连点「创建」 | — | 按钮 disabled；host 同名同 schedule 60s 内去重 | vitest |
| 旧数据兼容 | 升级前无 `routines.json` | 启动 | 视为空，不报错 | vitest |
| 破坏性 | 删除例程 | 二次确认 | 撤销 timer；例程会话保留（历史可看） | EVD-906 |
| 高频 | `@every 1m` × 5 个 bot | 运行 10 分钟 | 每次触发串行、无并发同例程；CPU 无异常 | EVD-904 |

### 2.8 非目标

- 外部事件监听（Slack/GitHub/…）、bot 互发消息 `[agent]` 唤醒、广播 `[broadcast]`、时间线事件 `[event]`、后台任务完成唤醒——`dsh-bot-peers` 与后续包。
- 移动推送、花费守卫、云同步。
- 例程结果的"随口提"节奏依赖 preset 规范，不做后处理改写。
- token 流式——`dsh-bot-live-transcript`。

---
## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
用户 ──prompt──> bot 会话 ──> 回复；无用户输入时 bot 不存在

After:
routines.json ──arm──> 调度器(host 进程内 setTimeout 链)
                           │到点
                           ▼
              例程专用会话(marks bot:<id> + routine:<rid>) ◀─ write [routine] 唤醒词 ─ wait idle ─ read
                           │ 非 (silent)
                           ▼
                 unread[botId]++ ──listBots.unread──> 名册徽标 / Notification（失焦 + 5s 节流）
preset 主动性规范 ──> [propose-routine]{…} 块 ──projectWorkbenchHistory──> 「设成例程 / 不用」卡 ──> routineCreate
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/dsh-bot-host/src/routines.ts`（新） | 存储读写、schedule 解析（5 字段 + `@hourly/@daily/@every` + `CRON_TZ=`）、`nextRun(schedule, now)`、`runs` ≤20 | 纯函数 + fs，vitest 全覆盖 |
| `packages/dsh-bot-host/src/routine-scheduler.ts`（新） | `createScheduler(deps)`：`arm/disarm/rearmAll/runNow`，单例程不重入，fake-timer 可测 | — |
| `packages/dsh-bot-host/src/routine-wake.ts`（新） | `wakeRoutine(deps, routine)`：确保例程会话 → 构造唤醒词 → write/wait/read → 判 `(silent)` → 更新 `runs/lastOutcome/unread` | 复用 `askBot` 的 write/wait/read 形状（不新建隐藏会话，用可见会话） |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `isPlatformInjection` 覆盖 `[routine]` 前缀；`projectWorkbenchHistory` 识别 `[propose-routine]` 块并投影 `kind:'propose-routine'`；`listOwnedSessions` 返回 `routine:` mark | — |
| `packages/dsh-bot-host/src/bots.ts` | preset 生成时 persona 追加「例程回合规范 + 主动性规范」段（自写）；`listBots` 增 `unread`；`declined` 存入 `bots.json` 该 bot 条目 | 与 memory 包共用 `rewritePresonaText` 组合点 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | 六个 RPC + `markRead` | — |
| `packages/dsh-bot-host/src/index.ts` | `static Config.routines.enabled`；构造函数 arm；dispose 时 disarm | — |
| `packages/workbench-ui` | `api.ts` 调用；`RoutinesPanel.tsx`（新）；`Roster.tsx` 徽标；`App.tsx` unread diff → `notify.ts`（新，Notification 权限与节流）；`Transcript.tsx` 提议卡 | — |

### 3.3 三段式定位清单

> 全部 anchor 已于 2026-09-06 用 `rg -c` 核验命中。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function createOwnedSession` | `rg "export async function createOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L350 | 建例程会话复用 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function promptOwnedSession` | `rg "export async function promptOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L484 | `promptLocks` 串行 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function turnIsOpen` | `rg "export function turnIsOpen" packages/dsh-bot-host/src/workbench-sessions.ts` | L306 | — |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function isPlatformInjection` | `rg "export function isPlatformInjection" packages/dsh-bot-host/src/workbench-sessions.ts` | L161 | 加 `[routine]` 前缀 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function projectWorkbenchHistory` | `rg "export function projectWorkbenchHistory" packages/dsh-bot-host/src/workbench-sessions.ts` | L177 | 投影提议块 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function listOwnedSessions` | `rg "export async function listOwnedSessions" packages/dsh-bot-host/src/workbench-sessions.ts` | L399 | 返回 `routine:` mark |
| `packages/dsh-bot-host/src/ask.ts` | `export async function askBot` | `rg "export async function askBot" packages/dsh-bot-host/src/ask.ts` | L243 | write/wait/read 形状 |
| `packages/dsh-bot-host/src/ask.ts` | `export function extractAssistantAnswer` | `rg "export function extractAssistantAnswer" packages/dsh-bot-host/src/ask.ts` | L121 | 判 silent |
| `packages/dsh-bot-host/src/marks.ts` | `export function botMark` | `rg "export function botMark" packages/dsh-bot-host/src/marks.ts` | L24 | 旁加 `routineMark` |
| `packages/dsh-bot-host/src/bots.ts` | `export function replacePersonaText` | `rg "export function replacePersonaText" packages/dsh-bot-host/src/bots.ts` | L195 | 追加规范段 |
| `packages/dsh-bot-host/src/bots.ts` | `export function createBotsRuntime` | `rg "export function createBotsRuntime" packages/dsh-bot-host/src/bots.ts` | L347 | `listBots.unread` / `declined` |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `listBotSessions` case | `rg "listBotSessions" packages/dsh-bot-host/src/workbench-routes.ts` | L177-227 | 旁加七个 case |
| `packages/dsh-bot-host/src/index.ts` | `class DshBotService extends Service` | `rg "class DshBotService extends Service" packages/dsh-bot-host/src/index.ts` | L224 | 挂调度器 |
| `packages/dsh-bot-host/src/index.ts` | `static Config` | `rg "static Config" packages/dsh-bot-host/src/index.ts` | L227 | `routines.enabled` |
| `packages/dsh-bot-host/src/groups.ts` | `groups.json` 读写形状 | `rg "groups.json" packages/dsh-bot-host/src/groups.ts` | L2/L18 | `routines.json` 照抄读写形状 |
| `packages/workbench-ui/src/api.ts` | `export function listBots` | `rg "export function listBots" packages/workbench-ui/src/api.ts` | L94 | 旁加调用 |
| `packages/workbench-ui/src/Roster.tsx` | `sessionCount` | `rg "sessionCount" packages/workbench-ui/src/Roster.tsx` | L37 | 换为 `unread` 徽标 |
| `packages/workbench-ui/src/App.tsx` | `RECONCILE_MS` | `rg "RECONCILE_MS" packages/workbench-ui/src/App.tsx` | L56 | 同处轮询 diff unread |
| `packages/workbench-ui/src/Conversation.tsx` | `conversationHead` | `rg "conversationHead" packages/workbench-ui/src/Conversation.tsx` | L400 | 详情栏入口 |
| `packages/workbench-ui/src/Transcript.tsx` | `showAuthor` | `rg "showAuthor" packages/workbench-ui/src/Transcript.tsx` | L205 | 「主动 · routine」标签 + 提议卡 |
| `.gitignore` | `env/dsh-bot/` | `rg "env/dsh-bot/" .gitignore` | L14 | 已覆盖 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 是 | 新增 7 个 RPC；`listBots` 增 `unread` 字段 | 加法；旧客户端忽略新字段 |
| 数据 | 是 | 新增 `routines.json`；`bots.json` 条目增 `declined[]` | 缺省视为空 |
| 权限 | 否 | loopback 单用户 | — |
| 路由 | 否 | 仍 `/dsh-bot/*` | — |

---

## 4. Phase 计划与任务详情

```text
P0 校准(1) → P1 存储与调度(2,3,4) → P2 唤醒投递(5,6,7) → P3 工作台(8,9,10,11) → P4 收尾(12,13,14)
```

> 实现任务 9 条 ≥ 8 → `tasks.csv`。

### Phase 0: 校准

### Task 1: 校准 ASM-901~904

- **关联**：ASM-901 / ASM-902 / ASM-903 / ASM-904 / EVD-900 / UF NA
- **前置任务**：无
- **风险等级**：P0

**涉及文件与定位**：

- `packages/dsh-bot-host/src/index.ts`：`class DshBotService extends Service`，L224
- `packages/dsh-bot-host/src/ask.ts`：`askBot`，L243

**具体操作**：

1. ASM-901：构造函数临时加 `setInterval(() => console.info('[dsh-bot] tick'), 60000)`，`sh env/boot.sh`，观察 3 次；改一次 settings 触发热更新，确认 tick 不翻倍；移除。
2. ASM-902：`bash scripts/manual-test.sh --no-write` 确认 write/wait/read 链路可用。
3. ASM-903：临时把「运维夜班」persona 追加自写"没事只输出 `(silent)`"规范，用工作台发 3 次"[routine] 巡检 · 没有异常就别说话"，统计输出恰为 `(silent)` 的次数；恢复。
4. ASM-904：用户轮次进行中（发一条长任务）同时经 `promptOwnedSession` 再写一条，观察顺序与是否插话。
5. 结论写 `evidence/phase-0/calibration.md`；证伪按 §12 变更。

**验证**：`ls evidence/phase-0/calibration.md` → 存在；`git diff --stat packages/` → 无残留

**Evidence**：`evidence/phase-0/`

**注意事项**：`豁免回归:单任务校准 Phase`。

### Phase 1: 存储与调度

### Task 2: routines.ts 存储与 schedule 解析

- **关联**：BR-901 / UF-901（表单校验依据）
- **前置任务**：1
- **风险等级**：P1

**涉及文件与定位**：`packages/dsh-bot-host/src/routines.ts`（新）；`packages/dsh-bot-host/src/groups.ts`：`groups.json`，L2/L18（读写形状参考）

**具体操作**：

1. `parseSchedule(text)` → `{kind:'cron', fields} | {kind:'every', ms} | {kind:'alias'} | Error`；支持 `CRON_TZ=` 前缀；`nextRun(schedule, now)`。
2. `createRoutineStore(home)`：`list/get/create/update/remove/recordRun`（`runs` ≤20）；文件损坏 → 备份 `.bak` 从空开始。
3. `tests/routines.spec.ts`：cron 正反例（`@every 0m` / `61 * * * *` 报错）、`nextRun` 跨日/时区、runs 截断、损坏备份。

**验证**：`pnpm test -- routines` → 通过

**Evidence**：`evidence/phase-1/task2-tests.log`

### Task 3: routine-scheduler.ts 与服务挂载

- **关联**：BR-902 / INV-904 / UF-904
- **前置任务**：2
- **风险等级**：P1

**涉及文件与定位**：`packages/dsh-bot-host/src/routine-scheduler.ts`（新）；`packages/dsh-bot-host/src/index.ts`：`class DshBotService extends Service`，L224；`static Config`，L227

**具体操作**：

1. `createScheduler({store, wake, now, setTimeout, clearTimeout})`：`arm(id)/disarm(id)/rearmAll()/runNow(id)`；每例程一个 timer；`running` 集合防重入；触发后 `recordRun` 再 arm 下一次。
2. `static Config` 加 `routines: z.object({ enabled: z.boolean().default(true) })`；构造函数 `rearmAll()`；`ctx` dispose 时全部 `disarm`；settings 热更新时 enabled 变化 → arm/disarm 全部，不重复挂。
3. `tests/routine-scheduler.spec.ts`（fake timers）：到点触发一次、disable 零触发、重入保护、rearmAll 幂等。

**验证**：`pnpm test -- routine-scheduler` → 通过

**Evidence**：`evidence/phase-1/task3-tests.log`

### Task 4: 执行 Phase 1 回归验证

- **关联**：BR-901 / BR-902 / INV-904
- **前置任务**：3

**验证**：`pnpm run typecheck && pnpm test` → 全过

**Evidence**：`evidence/phase-1/`

### Phase 2: 唤醒投递

### Task 5: routine-wake.ts 唤醒链路与静默判定

- **关联**：BR-903 / INV-901 / INV-902 / UF-901 / UF-902
- **前置任务**：3
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/routine-wake.ts`（新）
- `packages/dsh-bot-host/src/workbench-sessions.ts`：`createOwnedSession`，L350；`isPlatformInjection`，L161；`listOwnedSessions`，L399
- `packages/dsh-bot-host/src/marks.ts`：`botMark`，L24
- `packages/dsh-bot-host/src/ask.ts`：`extractAssistantAnswer`，L121

**具体操作**：

1. `marks.ts` 加 `routineMark(routineId)` / `parseRoutineMark`。
2. `ensureRoutineSession(routine)`：按 `routine.sessionId` 复用；缺失则 `createOwnedSession({botId, title:'例程 · '+name})` + merge `routine:` mark，回写 `sessionId`。
3. `buildWakePrompt(routine)`（自写）：`[routine] ` 前缀 + 名 + 用户指令 + "没有人在等你；没有要说的就只输出 `(silent)`；有要说的就像随口提一句，不要复述计划表"。
4. `wakeRoutine`：`sessionTool.write` → `wait until idle`（`askTimeoutMs`）→ `read` → `extractAssistantAnswer` → 去空白后 `=== '(silent)'` → `silent`；否则 `spoke` + `unread[botId]++`；异常 → `error`；连续 3 次 error → 向例程会话写一条系统提示（`isPlatformInjection` 可识别的前缀）。
5. `isPlatformInjection` 增 `[routine]` 与系统提示前缀；`listOwnedSessions` 携带 `routine` 字段。
6. `tests/routine-wake.spec.ts`：silent/spoke/error 三态；连续 3 次 error 落提示；唤醒词被过滤出历史。

**验证**：`pnpm test -- routine-wake workbench-sessions` → 通过

**Evidence**：`evidence/phase-2/task5-tests.log`、`evidence/phase-2/wake-error.log`

### Task 6: preset 规范段与提议块投影

- **关联**：BR-906 / BR-903 / UF-905
- **前置任务**：5
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/bots.ts`：`replacePersonaText`，L195；`createBotsRuntime`，L347
- `packages/dsh-bot-host/src/workbench-sessions.ts`：`projectWorkbenchHistory`，L177

**具体操作**：

1. `bots.ts` 新增 `renderBehaviorSection(bot)`（自写）：例程回合规范（`(silent)` 约定）+ 主动性规范（连续 ≥2 次同类请求可提议一次，输出 `[propose-routine]{json}[/propose-routine]`；`declined` 列表内的不再提）；`createBot/updateBot` 与 memory 包的注入组合：`基础 persona + 记忆段 + 规范段`。
2. `bots.json` 条目增 `declined: string[]`；`listBots` 增 `unread`（读调度器内存计数）。
3. `projectWorkbenchHistory`：assistant 文本中匹配 `[propose-routine]…[/propose-routine]` → 剥离原文，追加 `{kind:'propose-routine', name, schedule, instruction}` 项；JSON 非法则只剥离。
4. `tests/bots.spec.ts` / `tests/workbench-sessions.spec.ts` 加例。

**验证**：`pnpm test -- bots workbench-sessions` → 通过

**Evidence**：`evidence/phase-2/task6-tests.log`

### Task 7: 执行 Phase 2 回归验证

- **关联**：BR-903 / BR-906 / INV-901 / INV-902
- **前置任务**：5；6

**验证**：`pnpm run typecheck && pnpm test` → 全过；真机建 `@every 1m` 例程一次 → `cat env/dsh-bot/routines.json` 见 `runs` 增长

**Evidence**：`evidence/phase-2/`

### Phase 3: RPC 与工作台

### Task 8: 七个 RPC

- **关联**：BR-907 / BR-904 / EVD-906
- **前置任务**：7
- **风险等级**：P1

**涉及文件与定位**：`packages/dsh-bot-host/src/workbench-routes.ts`：`listBotSessions` case，L177-227

**具体操作**：

1. `routineList/Create/Update/Delete/RunNow`、`routineDecline`、`markRead` case；参数校验（schedule 经 `parseSchedule`）；60s 内同 bot 同名同 schedule 去重。
2. `tests/workbench-routes.spec.ts` 加例；curl 六例存 `evidence/API-907/`。

**验证**：`pnpm test -- workbench-routes` → 通过；curl 六例 `ok:true`

**Evidence**：`evidence/API-907/`

### Task 9: RoutinesPanel 与表单

- **关联**：BR-905 / UF-901 / UF-902 / UF-904
- **前置任务**：8
- **风险等级**：P1

**涉及文件与定位**：`packages/workbench-ui/src/api.ts`：`listBots`，L94；`packages/workbench-ui/src/Conversation.tsx`：`conversationHead`，L400；`packages/workbench-ui/src/RoutinesPanel.tsx`（新）

**具体操作**：

1. `api.ts` 加七个调用。
2. `RoutinesPanel.tsx`：列表行（名/schedule/开关/上次 outcome）、新建表单（时间快捷选项 → cron 文本、前端 `parseSchedule` 同款校验内联报错、指令、通知开关）、编辑、删除二次确认、全局关闭横幅、空态。
3. `Conversation.tsx` 会话头「⏰ N」按钮（N = 该 bot enabled 例程数）→ 打开面板。
4. `tests/routines-panel.spec.tsx`：校验报错、开关调用、空态。

**验证**：`pnpm test -- routines-panel` → 通过；真机会话头可见「⏰」

**Evidence**：`evidence/UF-901/panel-after-create.png`

### Task 10: 名册未读徽标、通知与提议卡

- **关联**：BR-904 / BR-906 / UF-903 / UF-905
- **前置任务**：8
- **风险等级**：P1

**涉及文件与定位**：`packages/workbench-ui/src/Roster.tsx`：`sessionCount`，L37；`packages/workbench-ui/src/App.tsx`：`RECONCILE_MS`，L56；`packages/workbench-ui/src/Transcript.tsx`：`showAuthor`，L205；`packages/workbench-ui/src/notify.ts`（新）

**具体操作**：

1. `Roster.tsx` 行右侧 `unread` 数字徽标；选中 bot → `api.markRead`。
2. `notify.ts`：`requestPermissionOnce()`、`notify(bot, text)`：仅 `document.hidden` 且同 bot 5s 节流；点击通知 → `window.focus()` + 选中该 bot。
3. `App.tsx` 现有 2s 轮询里 diff `unread` 增量 → 取该 bot 最新 assistant 首句（≤140 字）→ `notify`。
4. `Transcript.tsx`：`kind:'propose-routine'` 渲染卡片「设成例程 / 不用」→ `routineCreate` / `routineDecline`；assistant 消息在例程会话内显示「主动 · routine」标签。
5. 测试：`tests/roster.spec.tsx` 徽标；`tests/transcript.spec.tsx` 提议卡；`tests/notify.spec.ts` 节流与 hidden 判定。

**验证**：`pnpm test -- roster transcript notify` → 通过

**Evidence**：`evidence/UF-903/badge.png`、`evidence/UF-905/card.png`

### Task 11: 执行 Phase 3 回归验证

- **关联**：BR-904 / BR-905 / BR-906 / BR-907
- **前置任务**：9；10

**验证**：`pnpm run typecheck && pnpm test && pnpm run build` → 全过

**Evidence**：`evidence/phase-3/`

### Phase 4: 收尾

### Task 12: 同步 README 与设置示例

- **关联**：BR-901 / BR-908 / UF NA
- **前置任务**：11
- **风险等级**：P2

**具体操作**：README 加「例程」小节（cron 语法、静默约定、未读/通知、`dsh-bot.routines.enabled`）；`env/settings.example.yaml` 加注释示例。

**验证**：`rg -n "例程" README.md` → ≥1 命中

**Evidence**：`evidence/phase-4/docs-diff.md`

### Task 13: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-901 / UF-902 / UF-903 / UF-904 / UF-905
- **前置任务**：11

**验证**：按 5.2 执行矩阵逐行回放（含真实等待触发），全部通过

**Evidence**：`evidence/UF-901/` ~ `evidence/UF-905/`

### Task 14: 执行 Phase 4 回归验证

- **关联**：全部 BR / INV-903
- **前置任务**：12；13

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/ env/ scripts/` → 空；`git status --porcelain` 不含 `env/dsh-bot`；三邻仓干净；`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-routines --repo .` → 0 FAIL

**Evidence**：`evidence/phase-4/final-commands.log`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 用户可见的需求必须通过 5.2 真实场景全套测试才算完成。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| typecheck | `pnpm run typecheck` | exit 0 | EVD-907 |
| build | `pnpm run build` | exit 0 | EVD-907 |
| unit | `pnpm test` | 全过，含 routines / routine-scheduler / routine-wake / routines-panel / notify 新增用例 | EVD-907 |
| standard | `pnpm run standard:check` | exit 0 | EVD-907 |
| 红线 | `rg -i 'anysphere\|sand://' packages/ env/ scripts/` | 空 | EVD-907 |
| 数据不入 git | `git status --porcelain \| rg "env/dsh-bot"` | 空 | EVD-907 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（loopback :3084；先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份） |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui` |
| 测试账号/数据 | 本机单用户；需人设「运维夜班」（无则先建）与「校对阿宁」；测试前 `rm -f env/dsh-bot/routines.json` |
| 干净状态定义 | 每条 UF 前删掉测试例程；浏览器通知权限置为「允许」（Playwright 用 `context.grantPermissions(['notifications'])`） |
| 可用测试工具 | Playwright（`../../dsh-genoffice/engine/node_modules/playwright`，`channel:'chrome'`）；触发等待用 `@every 1m` 或 `routineRunNow` RPC 加速；系统通知用 Playwright 拦截 `Notification` 构造（注入 stub 记录调用）核对 |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-901 主路径 | browser + cat | 2.3 UF-901 步骤 1-3 | 列表出现；≤70s 徽标 1；线程消息带「主动 · routine」；`routines.json.runs[0].outcome==='spoke'` | `evidence/UF-901/panel-after-create.png`、`evidence/UF-901/thread-wake.png`、`evidence/UF-901/routines.json` |
| UF-901 失败分支 非法时间 | browser | `@every 0m` | 内联报错不提交 | `evidence/UF-901/invalid-schedule.png` |
| UF-901 失败分支 唤醒出错 | browser + log | 临时 `askTimeoutMs=1000` + `routineRunNow` ×3 | `lastOutcome:error`；第 3 次后线程系统提示行 | `evidence/UF-901/error-x3.png`、`evidence/phase-2/wake-error.log` |
| UF-902 主路径 | browser + cat | 2.3 UF-902 | 行「silent」；线程无新气泡；`runs` 最新 outcome silent | `evidence/UF-902/silent-row.png`、`evidence/UF-902/routines.json` |
| UF-902 失败分支 撞用户轮次 | browser | 用户发长消息期间 `routineRunNow` | 用户回复先完成，唤醒后跑 | `evidence/UF-902/lock-order.png` |
| UF-903 主路径 | browser | 2.3 UF-903 | 切走后徽标 1；`Notification` stub 被调用一次且 body ≤140 字；点回清零 | `evidence/UF-903/badge.png`、`evidence/UF-903/notification-call.json`、`evidence/UF-903/cleared.png` |
| UF-903 失败分支 窗口聚焦 | browser | 不切走触发 | 只有徽标，stub 未调用 | `evidence/UF-903/focused-no-notify.json` |
| UF-903 失败分支 5s 节流 | browser | 两次 `routineRunNow` 间隔 <5s | 徽标 2、stub 一次 | `evidence/UF-903/throttle.json` |
| UF-904 主路径 | browser + cat + log | 2.3 UF-904 三段 | 关：2 分钟 runs 不增；开：增；重启后 2 分钟内增 | `evidence/UF-904/runs-off-on-restart.md` |
| UF-904 失败分支 文件损坏 | cat + browser | 写坏 `routines.json` 后重启 | `.bak` 生成、页签横幅 | `evidence/UF-904/corrupt-bak.png` |
| UF-905 主路径 | browser | 2.3 UF-905 | 第二轮出现卡片；点「设成例程」后页签出现 | `evidence/UF-905/card.png`、`evidence/UF-905/routine-created.png` |
| UF-905 失败分支 拒绝 | browser | 点「不用」再发同类两轮 | 不再出现卡片；`bots.json.declined` 含该名 | `evidence/UF-905/declined.png` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-0/ calibration.md
  phase-1/ ~ phase-4/
  UF-901/ ~ UF-905/
  API-907/ list.json create.json update.json delete.json run-now.json mark-read.json
```

### 5.4 Review 专项检查清单

- [ ] 唤醒词与系统提示行不出现在工作台用户气泡里（INV-901）
- [ ] `enabled=false` / 删除 / bot 删除后无孤儿 timer（INV-904，fake timers 覆盖）
- [ ] 静默判定只认精确 `(silent)`（或 Task 1 校准后写明的兜底规则），不误吞正常回复
- [ ] 系统通知仅在 `document.hidden` 且 5s 节流内触发（BR-904）
- [ ] 主动提议被拒后 `declined` 生效，不再提（BR-906）
- [ ] 唤醒词、静默标记、规范段文案自写（BR-908）
- [ ] 5.2 执行矩阵全部通过，evidence 齐全
- [ ] 2.3 每条流程入口接线可达