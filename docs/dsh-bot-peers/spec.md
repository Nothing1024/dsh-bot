# dsh-bot-peers Spec

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

- **给谁 / 场景**：本机用户养了多个人设。今天 bot 只能跟用户说话，不能跟同事打招呼；工作台也看不出谁跟谁往来过。
- **做什么**：给 bot 一把异步同事信（工具立刻回「收下了」）：host 写到收件人的同事会话里叫醒它；它的回复再写回发件人当前会话。工作台详情有「同事」页和一张关系图。
- **改哪里**：`tool-dsh-bot` 新工具、`dsh-bot-host`（同事会话、限流、peers.jsonl、RPC）、`composePersona` 的行为规范段追加同事礼仪、`workbench-ui` 同事页签 / 关系图 / Transcript「来自 X」标签。
- **怎么算做完**：真机里让「校对阿宁」给「诗人小北」发一句；阿宁工具立刻成功；小北同事会话出现带「来自阿宁」的消息；小北若开口，阿宁当前会话也出现带标签的回复；关系图有一条实线；超频返回失败。
- **不做什么**：不广播、不接外部渠道、不跨用户；不新建第二套人设拼接函数。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 协调者定稿：`dsh_bot_send({toBot, text})` 异步 accepted；同事会话 marks `bot:<to>` + `peer:<from>`；复用例程包 write/wait/read 与 `(silent)`；反扇出；`peers.jsonl`；礼仪只叠 `composePersona` 的 behavior |
| 输入类型 | description |
| Mode | oneclick |
| 置信度 | 高（工具注册形状、wake IO、composePersona 均已勘察） |
| 输出目录 | `docs/dsh-bot-peers/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | backend（工具 + 投递 + 限流 + 日志）+ frontend（同事页、关系图、标签）+ prompt（礼仪段） |
| 主要风险 | ① 回写发件人「当前会话」在发件人已切走时写错靶；② 与例程唤醒抢同一 `withPromptLock`；③ 礼仪段叠进 behavior 时冲掉例程规范 |
| 行号引用策略 | 仅 hint |
| 必需验收方式 | 真机工作台 + 工具卡 + `cat env/dsh-bot/peers.jsonl` + RPC |
| 必须覆盖用户场景 | 发送被收下、回复写回、超频拒绝、同事页/图、礼仪进 persona |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| `dsh_bot_ask` 在 `apply` 里 `defineTool`，参数 `prompt` + 可选 `title`，同步返回 `session_id` + `answer` | `rg -n "name: 'dsh_bot_ask'\|export function apply" packages/tool-dsh-bot/src/index.ts` | L41 / L39 |
| 例程唤醒 `wakeRoutine` → `io.writeWaitRead`；`(silent)` = `ROUTINE_SILENT_TOKEN`；`isSilentReply` | `rg -n "export async function wakeRoutine\|writeWaitRead\|ROUTINE_SILENT_TOKEN\|export function isSilentReply" packages/dsh-bot-host/src/routine-wake.ts` | L48 / L36 / L7 / L18 |
| host 里 writeWaitRead 实现：`withPromptLock` + `sessionTool.write` + `wait until idle` + `read` + `extractAssistantAnswer` | `rg -n "writeWaitRead" packages/dsh-bot-host/src/index.ts` | L656 |
| 唯一组合函数 `composePersona(base, {memory, behavior})`；例程 `renderBehaviorSection` 只产 behavior 字符串 | `rg -n "export function composePersona" packages/dsh-bot-host/src/memory.ts`；`rg -n "export function renderBehaviorSection" packages/dsh-bot-host/src/routine-behavior.ts` | L224 / L16 |
| `botMark` = `bot:<id>`；尚无 `peer:` token | `rg -n "export function botMark\|peer:" packages/dsh-bot-host/src/marks.ts` | L26；`peer:` 0 命中 |
| 工作台 Transcript 已有 `showAuthor`；Roster 已有详情栏位 | `rg -n "showAuthor" packages/workbench-ui/src/Transcript.tsx`；`rg -n "export function Roster" packages/workbench-ui/src/Roster.tsx` | L193+；L98 |
| RPC 分派 `dispatchWorkbenchApi`；`listBots` 在 api.ts | `rg -n "export async function dispatchWorkbenchApi" packages/dsh-bot-host/src/workbench-routes.ts`；`rg -n "export function listBots" packages/workbench-ui/src/api.ts` | L188 / L96 |
| `env/dsh-bot/` 已 gitignore | `rg -n "env/dsh-bot/" .gitignore` | L14 |
| 原型「同事」页签 + 关系图 SVG（实线互发、虚线同组、脉动 working） | `rg -n "openDet\('peers'\)\|关系图" docs/prototypes/dsh-bot-grok-parity.html` | L268 / L546 |
| 本会话 :3084 未监听；Playwright 渠道存在 | `lsof -nP -iTCP:3084 -sTCP:LISTEN`；`ls ../../dsh-genoffice/engine/node_modules/playwright/package.json` | 空；存在 |
| living-master 已知缺口：忘记→注入滞后；例程 ASM-903/904 未真机校准 | `rg -n "Forget\|ASM-903" docs/dsh-bot-living-master/evidence/phase-final/report.md` | 报告 L10 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-021 | 同事会话用 marks `bot:<to>` + `peer:<from>`、标题「来自 \<from 名\>」可被 `listOwnedSessions` 列为该 to bot 的一条可见会话（非 hidden） | 被 hidden 过滤则用户看不到来信 | Task 1：建一条带这两 mark 的会话，看工作台列表 |
| ASM-022 | 复用例程 `writeWaitRead` + `(silent)`：收件 bot 无话可说时只回一行 `(silent)`，host 不把静默写回发件会话 | 模型不守静默 → 发件会话被空话刷屏 | Task 1：3 次「没事」互发，记静默率（例程 ASM-903 若仍被 503 挡住，本条同样记诚实缺口） |
| ASM-023 | 「发件 bot 的当前会话」= 该 bot 工作台选中的 1:1 会话；若无选中则写其最近一条非 hidden 会话；再没有就新建 | 写错会话用户以为丢回复 | Task 1：发件人切到另一会话后再等回复，看落点 |
| ASM-024 | 实时到达走 live-transcript 的同一条 SSE（`session/event` + `bot/status`），本包不新开定时器 | 若 SSE 包未合入，同事页只能靠既有 2s 轮询 | Task 1：记录 SSE 包是否已合入；未合入则验收允许 2s 延迟并在备注写明 |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-04-09 | CAL-021 | Task 1 真机：ASM-021/022/024 确认；ASM-023 按合同接线（工具 caller 会话，否则最新非 hidden） | 第 2 章不改；见 evidence/phase-0/calibration.md |

---

## 2. 业务合同

> ID 用 02x 段。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-021 | 新工具 `dsh_bot_send({toBot, text})` 在 `packages/tool-dsh-bot` 按 `dsh_bot_ask` 同形注册。执行立即返回 `{accepted:true}`，不在工具调用里 `wait` 收件人说完。`toBot` 必须是本用户名册里另一个 bot id；缺 text / 自己发给自己 → 工具错误 | 阿宁调工具给小北 → 马上 accepted | 工具卡转圈等到小北说完 | tool-dsh-bot + host | vitest + 真机 |
| BR-022 | host 向收件 bot 的同事会话（marks `bot:<to>` + `peer:<from>`，标题「来自 \<from 名\>」）写自写唤醒词，前缀 `[agent]`。投递复用 `routine-wake.ts` 的 write/wait/read 与 `(silent)` 约定（`isSilentReply`）。一次一个收件人 | 小北同事会话出现一条 `[agent]` 用户行 | 广播写入所有 bot；走 `promptOwnedSession` 触发记忆抽取 | host | vitest + 真机 |
| BR-023 | 收件 bot 非静默回复再以 `[agent]` 唤醒写回发件 bot 的当前会话（ASM-023 落点）。静默不写回、不记未读 | 小北说了一句 → 阿宁当前会话出现带「来自小北」的泡 | 静默仍写「(silent)」进阿宁会话 | host | 真机 |
| BR-024 | 反扇出：一次调用一个 `toBot`；每 bot 每分钟 ≤3 条成功投递。超出返回 `{ok:false}`（工具侧表现为失败，不是 accepted） | 第 4 条在同一分钟失败 | 一次传数组群发；超频仍 accepted | host | vitest |
| BR-025 | 成功投递追加 `env/dsh-bot/peers.jsonl` 行 `{from,to,ts,sessionId}`（sessionId=同事会话）。RPC `peerLog({botId?})` 返回该 bot 相关行（缺省全部）。不入 git | curl 见行 | 写入 bots.json | host | cat + curl |
| BR-026 | 同事礼仪只追加到 `composePersona` 的 behavior 段（与 `renderBehaviorSection` 拼成同一字符串再传入），不新建第二组合函数。礼仪自写：不转述用户私下抱怨、只找明显相关的同事、不确定就先问用户 | `cat` persona 在例程规范后可见礼仪三条 | 再写一个 rewritePersona | memory.ts + routine-behavior | cat + vitest |
| BR-027 | 工作台详情「同事」页签：互发条数、所在小组。「关系图」模态 SVG：实线=互发条数（粗细随 n）、虚线=同小组、脉动=working、点节点切到该 bot。Transcript 里 `[agent]` 消息带「来自 X」标签与 peer 卡 | 图上点小北切到小北 | 新开轮询拉关系 | workbench-ui | 真机 |
| BR-028 | 红线：不改官方 npm 与三邻仓（基线见 `../dsh-bot-living-master/spec.md` §1.5）；一口一仓 :3084；`env/dsh-bot/peers.jsonl` 不入 git；`rg -i 'anysphere\|sand://' packages/` 为空；唤醒词/礼仪自写；不广播、不接外部、不跨用户 | — | 抄参考树 | 全部 | 收尾 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-021 | 工作台有阿宁、小北；阿宁当前会话打开 | 让阿宁「给小北捎一句：封面用深蓝」 | 工具立刻 accepted；小北出现「来自 校对阿宁」会话；该会话有 `[agent]` 用户行 | 本机用户 | browser + 工具卡 | EVD-021 |
| UF-022 | UF-021 已投递且小北有非静默回复 | 看阿宁当前会话 | 出现带「来自 诗人小北」标签的 assistant 泡；`peers.jsonl` 多一行 | 本机用户 | browser + cat | EVD-022 |
| UF-023 | 阿宁本分钟已成功 3 条 | 再 send 第 4 条 | 工具失败 / `{ok:false}`；jsonl 不增行 | 本机用户 | 工具卡 + cat | EVD-023 |
| UF-024 | 至少一对互发 | 打开阿宁详情「同事」；再开关系图 | 看到与小北的条数与小组；实线+虚线；点节点切 bot | 本机用户 | browser | EVD-024 |
| UF-025 | 礼仪已注入 | 新开阿宁会话问「同事之间该怎么说话」 | 回复含不转述抱怨 / 先问用户之类自写要点；`agent.cordis.yml` behavior 含礼仪段 | 本机用户 | browser + cat | EVD-025 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-021: 异步发送被收下

**前置状态**：boot 后工作台有「校对阿宁」「诗人小北」；打开阿宁 1:1。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 对阿宁说「给小北捎一句：封面用深蓝」 | 工具卡几乎立刻完成（accepted） | `dsh_bot_send` 返回；host 确保同事会话、write `[agent]` 唤醒词 | 阿宁会话不卡住 |
| 2 | 切到小北 | 名册/会话列表多「来自 校对阿宁」 | marks `bot:<xiaobei>` + `peer:<aning>` | 会话里可见唤醒用户行 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| toBot 不存在 | 写错 id | 工具错误，不写会话 | `{ok:false}` | 用户改口 |
| 发给自己 | toBot=自己 | 工具错误 | 不建会话 | — |
| 收件会话锁占用 | 小北例程正在跑 | 工具仍 accepted；write 排队 | `withPromptLock` | 等锁 |

**界面状态机**：`idle → tool-accepted → peer-session-visible`

**入口接线清单**：`tool-dsh-bot` 注册 `dsh_bot_send` → host `sendToPeer`；`createOwnedSession` 同类建同事会话 + `mergeBotMarks`。

#### UF-022: 回复写回发件当前会话

**前置状态**：UF-021 完成；小北被叫醒。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 等小北说完（或在其同事会话看它开口） | 小北会话出现回复 | writeWaitRead；非 silent | — |
| 2 | 回到阿宁当前会话 | 新泡带「来自 诗人小北」peer 卡 | `[agent]` 写回；jsonl append | 标签可见 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 静默 | 小北只回 `(silent)` | 阿宁会话无新泡 | 不写回、不 unread++ | 正常 |
| 发件人已切会话 | 阿宁当时看着另一条 1:1 | 回复落到校准指定的「当前」会话 | ASM-023 | 以校准为准 |
| wait 超时 | 同例程超时 | host warn；不写回 | 不假成功 | 下一条再试 |

**界面状态机**：`waiting → silent-drop | echoed-with-tag`

**入口接线清单**：host 回写 `sessionTool.write`（不经 `promptOwnedSession`，避免误抽记忆）；Transcript 认 `[agent]` → 标签。实时靠 SSE 或既有 2s（ASM-024）。

#### UF-023: 超频拒绝

**前置状态**：测试夹具把阿宁窗口打满 3 条，或真机 1 分钟内连发 3 次成功。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 第 4 次 send | 工具失败 | 计数器拒绝，不 write，不 jsonl | 小北无第 4 条 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 跨分钟 | 61s 后再发 | 成功 | 窗口滑动 | — |
| 不同 from | 小北发给阿宁 | 独立计数 | 每 bot 自己的窗口 | — |

**界面状态机**：`under-cap → rejected`

**入口接线清单**：host `peerRateLimit(fromBot)`，工具 execute 映射 `{ok:false}`。

#### UF-024: 同事页与关系图

**前置状态**：至少一对 jsonl 行；阿宁在一个小组里。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 阿宁详情点「同事」 | 页签列出小北与条数、所在小组 | `peerLog({botId})` + `listGroups` | 数字对得上 jsonl |
| 2 | 点「关系图」 | 模态 SVG | 实线 n、虚线同组、working 脉动 | — |
| 3 | 点小北节点 | 模态关，名册切到小北 | 复用既有 select | 中栏换人 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 无往来 | 新 bot | 空态「还没跟同事说过话」 | 空数组 | — |
| 单节点 | 只有 1 个 bot | 图画一个点，无边 | — | — |

**界面状态机**：`tab-persona → tab-peers → modal-graph → selected-other`

**入口接线清单**：详情栏既有页签位（记忆/例程旁）加「同事」；Roster/Conversation 头按钮开关系图。不新开 setInterval。

#### UF-025: 礼仪进入人设

**前置状态**：本包合入后新开阿宁会话。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 新开对话，问同事礼仪 | 正常回复 | `injectMemory` 仍只调 `composePersona`；behavior = 例程段 + 礼仪段 | 回复提到不转述 / 先问用户 |
| 2 | `cat` preset | — | — | 一段 behavior 里两块都在 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 旧会话 | 合入前已打开的会话 | 可能无礼仪（代际） | 与记忆包同一代际规则 | 新开即可 |
| 组合被拆 | 有第二套 rewrite | 审查 FAIL | 禁止 | 删掉 |

**界面状态机**：无新 UI。

**入口接线清单**：`renderBehaviorSection` 末尾追加礼仪，或 `index.ts injectMemory` 把两段拼进同一个 `extras.behavior`。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-021 | 不广播、不接 Slack/GitHub、不跨用户写别人的 `$DSH_HOME` | BR-028 | 无广播 API；代码无外渠 |
| INV-022 | `dsh_bot_ask` 名称与同步返回形状不变 | BR-021 | 既有 ask 单测 |
| INV-023 | 全仓只有一个 `composePersona`；本包不得再导出组合函数 | BR-026 | `rg "export function composePersona" packages` 仅 memory.ts 一处 |
| INV-024 | 一口一仓 :3084；邻仓基线见 living-master §1.5；peers.jsonl 不入 git；参考树空 | BR-028 | 收尾 |
| INV-025 | 同事唤醒不经 `promptOwnedSession`，不触发记忆自动抽取（用户 📌 仍可记） | BR-022 | 与 living-master 抽取边界同形 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-020 | log | Task 1 校准 | `evidence/phase-0/calibration.md` |
| EVD-021 | screenshot | 工具 accepted + 小北同事会话 | `evidence/UF-021/` |
| EVD-022 | screenshot+file | 阿宁会话「来自」标签 + jsonl 行 | `evidence/UF-022/` |
| EVD-023 | screenshot+file | 第 4 条失败 + jsonl 行数不变 | `evidence/UF-023/` |
| EVD-024 | screenshot | 同事页 + 关系图 | `evidence/UF-024/` |
| EVD-025 | screenshot+file | 礼仪问答 + cordis 片段 | `evidence/UF-025/` |
| EVD-026 | api | peerLog curl | `evidence/API-026/` |
| EVD-027 | log | Phase 命令 | `evidence/phase-0/` |

### 2.6 角色与权限矩阵

单一本机用户。bot 只能发给本用户名册内的 bot。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 空数据 | 无 jsonl | 开同事页 / 图 | 空态，不报错 | EVD-024 |
| 依赖失败 | 收件 preset broken | send | `{ok:false}`，不写半套 marks | EVD-021 |
| 重复提交 | 同一 text 连点 | 两条都算额度 | 限流按次数不按去重 | EVD-023 |
| 旧数据 | 无 peers.jsonl | 首次 send | 懒建文件 | EVD-022 |
| 破坏性 | 删除收件 bot | 再 send | 工具失败；发件 jsonl 历史仍在 | EVD-021 |

### 2.8 非目标

- 广播、外部渠道、跨用户、群发给小组全员（小组房间已有，不走本工具）。
- 第二套 persona 组合函数。
- 独立 SSE（必须消费 live-transcript 通道）。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
bot 只能对用户说话；无 peer mark；behavior = 例程规范

After:
dsh_bot_send → 立即 accepted
  → ensurePeerSession(to, from) marks bot:<to>+peer:<from>
  → writeWaitRead([agent] 自写唤醒词)
  → silent? drop : writeback [agent] 到 from 当前会话
  → peers.jsonl + peerLog
behavior = 例程规范 + 同事礼仪   (仍 composePersona)
工作台：同事页签 / SVG 关系图 / 「来自 X」
实时：消费 /dsh-bot/events，不新开定时器
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/tool-dsh-bot/src/index.ts` | 注册 `dsh_bot_send` | 仿 ask，异步 accepted |
| `packages/dsh-bot-host/src/peers.ts`（新） | jsonl、限流、ensureSession、send | vitest |
| `packages/dsh-bot-host/src/marks.ts` | `peerMark(fromId)` | 加法 |
| `packages/dsh-bot-host/src/routine-behavior.ts` | behavior 末尾追加礼仪 | 不新建组合 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `peerLog` case | — |
| `packages/workbench-ui` | 同事页、关系图、Transcript 标签 | 不新 timer |

### 3.3 三段式定位清单

> 全部 anchor 已于 2026-09-06 用 `rg -c` 核验命中。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/tool-dsh-bot/src/index.ts` | `export function apply` | `rg "export function apply" packages/tool-dsh-bot/src/index.ts` | L39 | 旁加工具 |
| `packages/tool-dsh-bot/src/index.ts` | `name: 'dsh_bot_ask'` | `rg "name: 'dsh_bot_ask'" packages/tool-dsh-bot/src/index.ts` | L41 | 形状对照 |
| `packages/dsh-bot-host/src/routine-wake.ts` | `export async function wakeRoutine` | `rg "export async function wakeRoutine" packages/dsh-bot-host/src/routine-wake.ts` | L48 | 复用 IO |
| `packages/dsh-bot-host/src/routine-wake.ts` | `writeWaitRead` | `rg "writeWaitRead" packages/dsh-bot-host/src/routine-wake.ts` | L36 | — |
| `packages/dsh-bot-host/src/routine-wake.ts` | `export function isSilentReply` | `rg "export function isSilentReply" packages/dsh-bot-host/src/routine-wake.ts` | L18 | — |
| `packages/dsh-bot-host/src/routine-wake.ts` | `ROUTINE_SILENT_TOKEN` | `rg "ROUTINE_SILENT_TOKEN" packages/dsh-bot-host/src/routine-wake.ts` | L7 | `(silent)` |
| `packages/dsh-bot-host/src/memory.ts` | `export function composePersona` | `rg "export function composePersona" packages/dsh-bot-host/src/memory.ts` | L224 | 唯一组合 |
| `packages/dsh-bot-host/src/routine-behavior.ts` | `export function renderBehaviorSection` | `rg "export function renderBehaviorSection" packages/dsh-bot-host/src/routine-behavior.ts` | L16 | 追加礼仪 |
| `packages/dsh-bot-host/src/marks.ts` | `export function botMark` | `rg "export function botMark" packages/dsh-bot-host/src/marks.ts` | L26 | 加 peerMark |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function createOwnedSession` | `rg "export async function createOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L393 | 建同事会话 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `withPromptLock` | `rg "withPromptLock" packages/dsh-bot-host/src/workbench-sessions.ts` | L48 | 与例程共享锁 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function promptOwnedSession` | `rg "export async function promptOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L527 | 唤醒不走它 |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `export async function dispatchWorkbenchApi` | `rg "export async function dispatchWorkbenchApi" packages/dsh-bot-host/src/workbench-routes.ts` | L188 | peerLog |
| `packages/dsh-bot-host/src/index.ts` | `class DshBotService extends Service` | `rg "class DshBotService extends Service" packages/dsh-bot-host/src/index.ts` | L256 | 接线 |
| `packages/workbench-ui/src/Transcript.tsx` | `showAuthor` | `rg "showAuthor" packages/workbench-ui/src/Transcript.tsx` | L193 | 来自 X |
| `packages/workbench-ui/src/Roster.tsx` | `export function Roster` | `rg "export function Roster" packages/workbench-ui/src/Roster.tsx` | L98 | 关系图入口 |
| `packages/workbench-ui/src/Conversation.tsx` | `conversationHead` | `rg "conversationHead" packages/workbench-ui/src/Conversation.tsx` | L446 | 同事页签 |
| `packages/workbench-ui/src/api.ts` | `export function listBots` | `rg "export function listBots" packages/workbench-ui/src/api.ts` | L96 | 旁加 peerLog |
| `.gitignore` | `env/dsh-bot/` | `rg "env/dsh-bot/" .gitignore` | L14 | jsonl 已覆盖 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 是 | 新工具 + `peerLog` | 加法 |
| 数据 | 是 | `peers.jsonl` | 懒建 |
| 权限 | 否 | 本用户名册内 | — |
| 路由 | 否 | 仍 `/dsh-bot/*` | — |

---

## 4. Phase 计划与任务详情

```text
P0 校准(1) → P1 投递内核(2,3,4) → P2 工具礼仪RPC(5,6,7,8) → P3 工作台(9,10,11,12) → P4 收尾(13,14,15)
```

> 实现任务 8 条（2,3,5,6,7,9,10,11）≥ 8 → `tasks.csv`。

### Phase 0: 校准

### Task 1: 校准 ASM-021~024

- **关联**：ASM-021 / ASM-022 / ASM-023 / ASM-024 / EVD-020 / UF NA
- **前置任务**：无
- **风险等级**：P0

**涉及文件与定位**：

- `packages/dsh-bot-host/src/marks.ts`：`botMark`，`rg "export function botMark" packages/dsh-bot-host/src/marks.ts`，L26
- `packages/dsh-bot-host/src/routine-wake.ts`：`isSilentReply`，L18

**具体操作**：

1. ASM-021：手工建带 `bot:` + `peer:from` mark 的会话，看是否出现在 to bot 列表。
2. ASM-022：对小北走一次 writeWaitRead，指令「没事就 (silent)」，记静默率；503 则写诚实缺口。
3. ASM-023：发件人切会话后再回写一条，记落点。
4. ASM-024：看 `/dsh-bot/events` 是否已存在。
5. 写入 `evidence/phase-0/calibration.md`。

**验证**：`ls evidence/phase-0/calibration.md` → 存在

**Evidence**：`evidence/phase-0/`

**注意事项**：`豁免回归:单任务校准 Phase`

### Phase 1: 投递内核

### Task 2: peers.jsonl 与每分钟限额

- **关联**：BR-024 / BR-025 / UF-023
- **前置任务**：1
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/peers.ts`（新建）
- `.gitignore`：`env/dsh-bot/`，L14

**具体操作**：`append` / `readLog` / `tryConsume` 每分钟 3 次；单测窗口滑动。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/peers.spec.ts` → 通过

**Evidence**：`evidence/phase-1/task2-tests.log`

### Task 3: 同事会话与 writeWaitRead 投递

- **关联**：BR-022 / BR-023 / INV-025 / UF-021 / UF-022
- **前置任务**：2
- **风险等级**：P0

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-sessions.ts`：`createOwnedSession`，L393
- `packages/dsh-bot-host/src/routine-wake.ts`：`writeWaitRead` / `isSilentReply`，L36 / L18
- `packages/dsh-bot-host/src/marks.ts`：`botMark`，L26

**具体操作**：

1. `peerMark`；`ensurePeerSession(to, from)`。
2. `sendToPeer`：限额 → writeWaitRead 自写 `[agent]` 唤醒词 → silent 则结束 → 否则写回 from 当前会话。
3. 不经 `promptOwnedSession`。
4. 单测：silent 不写回；超频不 write。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/peers.spec.ts packages/dsh-bot-host/tests/workbench-sessions.spec.ts` → 通过

**Evidence**：`evidence/phase-1/task3-tests.log`

### Task 4: 执行 Phase 1 回归验证

- **关联**：BR-022 / BR-024 / INV-025
- **前置任务**：3

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/dsh-bot-host/tests` → 全过

**Evidence**：`evidence/phase-1/`

### Phase 2: 工具、礼仪、RPC

### Task 5: 注册 dsh_bot_send

- **关联**：BR-021 / INV-022 / UF-021
- **前置任务**：3
- **风险等级**：P1

**涉及文件与定位**：

- `packages/tool-dsh-bot/src/index.ts`：`apply` / `dsh_bot_ask`，L39 / L41

**具体操作**：同形注册；execute 调 host 后立刻映射 accepted / 失败。工具返回发生在 wait 之前。

**验证**：`rg -n "name: 'dsh_bot_send'" packages/tool-dsh-bot/src/index.ts` → 1；`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/ask.spec.ts` → 仍过

**Evidence**：`evidence/phase-2/task5-tests.log`

### Task 6: behavior 追加同事礼仪

- **关联**：BR-026 / INV-023 / UF-025
- **前置任务**：1
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/routine-behavior.ts`：`renderBehaviorSection`，L16
- `packages/dsh-bot-host/src/memory.ts`：`composePersona`，L224

**具体操作**：在 `renderBehaviorSection` 追加自写礼仪三段。禁止新组合函数。

**验证**：`rg -n "export function composePersona" packages --glob '*.ts'` → 仅 memory.ts；`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/memory.spec.ts` → 通过

**Evidence**：`evidence/phase-2/task6-tests.log`

### Task 7: peerLog RPC

- **关联**：BR-025 / UF-024
- **前置任务**：2
- **风险等级**：P2

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-routes.ts`：`dispatchWorkbenchApi`，L188
- `packages/workbench-ui/src/api.ts`：`listBots`，L96

**具体操作**：`peerLog` 按 botId 过滤；越界返回失败。

**验证**：`./node_modules/.bin/vitest run packages/dsh-bot-host/tests/workbench-routes.spec.ts` → 通过

**Evidence**：`evidence/phase-2/task7-tests.log`

### Task 8: 执行 Phase 2 回归验证

- **关联**：BR-021 / BR-026 / INV-022 / INV-023
- **前置任务**：5;6;7

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/dsh-bot-host/tests` → 全过

**Evidence**：`evidence/phase-2/`

### Phase 3: 工作台

### Task 9: 详情「同事」页签

- **关联**：BR-027 / UF-024
- **前置任务**：7
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Conversation.tsx`：`conversationHead`，L446

**具体操作**：记忆/例程旁加「同事」页；空态文案；数字来自 `peerLog`。不新 timer。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/conversation.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/task9-tests.log`

### Task 10: 关系图模态

- **关联**：BR-027 / UF-024
- **前置任务**：9
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Roster.tsx`：`Roster`，L98

**具体操作**：SVG 实线/虚线/脉动；点击节点切 bot。working 读既有 workingIds 或 SSE `bot/status`。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/roster.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/task10-tests.log`

### Task 11: Transcript「来自 X」与 peer 卡

- **关联**：BR-027 / UF-022
- **前置任务**：9
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/Transcript.tsx`：`showAuthor`，L193

**具体操作**：`[agent]` 前缀泡显示「来自 X」标签与简卡。

**验证**：`./node_modules/.bin/vitest run packages/workbench-ui/tests/transcript.spec.tsx` → 通过

**Evidence**：`evidence/phase-3/task11-tests.log`

### Task 12: 执行 Phase 3 回归验证

- **关联**：BR-027
- **前置任务**：10;11

**验证**：`pnpm run typecheck && ./node_modules/.bin/vitest run packages/workbench-ui/tests` → 通过

**Evidence**：`evidence/phase-3/`

### Phase 4: 文档、真实场景与收尾

### Task 13: 同步 README 同事说明

- **关联**：BR-028 / UF NA
- **前置任务**：12
- **风险等级**：P2

**具体操作**：README 写 `dsh_bot_send`、限额、peers.jsonl、不广播。

**验证**：`rg -n "dsh_bot_send" README.md` → ≥1

**Evidence**：`evidence/phase-4/docs-diff.md`

### Task 14: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-021 / UF-022 / UF-023 / UF-024 / UF-025
- **前置任务**：12

**验证**：按 5.2 执行矩阵逐行回放，全部通过

**Evidence**：`evidence/UF-021/` ~ `evidence/UF-025/`

### Task 15: 执行 Phase 4 回归验证

- **关联**：全部 BR / INV-024
- **前置任务**：13;14

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/` → 空；`rg "export function composePersona" packages --glob '*.ts'` → 仅 memory.ts；邻仓基线见 living-master §1.5

**Evidence**：`evidence/phase-4/final-commands.log`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。**

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| typecheck | `pnpm run typecheck` | exit 0 | EVD-027 |
| build | `pnpm run build` | exit 0 | EVD-027 |
| unit | `pnpm test` | 全过 | EVD-027 |
| standard | `pnpm run standard:check` | exit 0 | EVD-027 |
| 单一组合函数 | `rg "export function composePersona" packages --glob '*.ts'` | 仅 memory.ts | EVD-027 |
| 红线 | `rg -i 'anysphere\|sand://' packages/` | 空 | EVD-027 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084`） |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui` |
| 测试账号/数据 | 人设「校对阿宁」「诗人小北」；测试前备份并清空 `env/dsh-bot/peers.jsonl` |
| 干净状态定义 | 每条 UF 前刷新；UF-023 用新的一分钟窗口或测试时钟 |
| 可用测试工具 | Playwright channel chrome；`cat` jsonl；curl `peerLog` |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-021 主路径 | browser | 2.3 UF-021 | 工具立刻 accepted；小北「来自」会话 | `evidence/UF-021/accepted.png`、`evidence/UF-021/peer-session.png` |
| UF-021 失败分支 自己发给自己 | browser | 指令发给自己 | 工具失败；无新会话 | `evidence/UF-021/self-fail.png` |
| UF-021 失败分支 未知 id | browser | 乱 id | 工具失败 | `evidence/UF-021/unknown.png` |
| UF-022 主路径 | browser + cat | 2.3 UF-022 | 阿宁会话「来自小北」；jsonl 增行 | `evidence/UF-022/echo-tag.png`、`evidence/UF-022/peers.jsonl` |
| UF-022 失败分支 静默 | browser + cat | 指令让小北别说话 | 阿宁无新泡 | `evidence/UF-022/silent.md` |
| UF-023 主路径 | browser + cat | 2.3 UF-023 | 第 4 条失败；行数不变 | `evidence/UF-023/rate-limit.png`、`evidence/UF-023/wc.txt` |
| UF-023 失败分支 跨分钟 | browser | 等 61s 再发 | 成功 | `evidence/UF-023/window-reset.md` |
| UF-024 主路径 | browser | 2.3 UF-024 | 条数、实线虚线、点节点切换 | `evidence/UF-024/tab.png`、`evidence/UF-024/graph.png` |
| UF-024 失败分支 空态 | browser | 清空 jsonl | 空态文案 | `evidence/UF-024/empty.png` |
| UF-025 主路径 | browser + cat | 2.3 UF-025 | 礼仪要点 + cordis 含礼仪 | `evidence/UF-025/ask.png`、`evidence/UF-025/cordis.yml` |
| UF-025 失败分支 旧会话 | browser | 合入前会话 | 允许无礼仪；新开才有 | `evidence/UF-025/old-session.md` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-0/ calibration.md
  phase-1/ ~ phase-4/
  UF-021/ ~ UF-025/
  API-026/
```

### 5.4 Review 专项检查清单

- [ ] 工具返回在 wait 之前（BR-021）
- [ ] 唤醒不经 `promptOwnedSession`（INV-025）
- [ ] 只有一个 `composePersona`（INV-023）
- [ ] 无广播 API（INV-021）
- [ ] 无新增 setInterval（ASM-024 / 母包共享面）
- [ ] 5.2 全过；P0 未跳过

[Showing lines 1-300 of 651. Use :301 to continue]