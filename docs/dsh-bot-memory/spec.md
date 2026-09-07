# dsh-bot-memory Spec

> Version: 0.2.0 | Date: 2026-09-06 | Status: Done 已验收（状态板 100%，5.2 证据齐全；2026-09-08 梳理时改标）
>
> 本文件是本需求的**唯一事实源**：事实基线、业务合同、技术方案、任务计划、验收协议全部在此。
> 其他文件（tasks.csv）只引用本文件，不复制内容。
>
> 填写三态规则：每个表格单元格只允许三种内容——
> 1. 验证过的事实（注明来源命令）；2. 显式假设 `ASM-xxx`；3. `待勘察`。
> 禁止编造看似合理的命令、symbol、文件名。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：在 DSH Bot 工作台里长期和几个人设（bot）聊天的本机用户。今天每个 bot 只是一份人设文本，换一个会话就什么都不记得，感觉是"工具"而不是"同事"。
- **做什么**：给每个 bot 一份**跨会话的记忆**——每轮对话结束后自动抽取"关于用户的长期事实"和"做过的事"，写进这个 bot 自己的记忆文件；下次开新会话时把记忆塞进它的人设里，它就记得你叫什么、上次决定了什么。
- **改哪里**：`dsh-bot-host`（记忆文件读写、抽取、注入、四个 RPC）、`workbench-ui`（会话头新增「记忆」面板：分三层看、每条可"忘记"；消息悬停多一个「📌 记住这条」）、bot preset 生成器（人设文本末尾拼上记忆段）。
- **怎么算做完**：在真实 :3084 工作台里：和「校对阿宁」聊两轮并说"我叫 Nothing，术语保留英文"→ 打开「记忆」面板看到这条被记住；新开一个会话问"我叫什么"→ 它答对；点"忘记"→ 再新开会话它不再知道；寒暄"谢谢"不会被记。
- **不做什么**：不做跨 bot 共享的"用户记忆"分片、不做项目记忆、不做每 24 小时的后台合成整理、不做 30 天衰减排序——这些是下一版；bot 自己用工具改记忆（`update_state`）也不在本包。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 用户 2026-09-06 认可 `../prototypes/dsh-bot-grok-parity.html` 的 Bot 中心方向后回复 oneclick；本包 = 该原型「记忆」页签 + 「📌 记住」动作 + 记忆注入，对标 Grok Bot 三层记忆中的 agent 层（`../prototypes/real-dsh-ui-survey.md` 与最初调研 §4.4） |
| 输入类型 | description（对话上下文 + 原型） |
| Mode | oneclick |
| 置信度 | 高（存储根、preset 生成器、会话链路均已勘察） |
| 输出目录 | `docs/dsh-bot-memory/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | backend（主：文件存储 + 抽取 + 注入 + RPC）+ frontend（记忆面板与动作）+ prompt（抽取提示词与注入段格式） |
| 主要风险 | ① 抽取只能经隐藏会话跑一个完整 agent turn（平台 `llm` 域无 completion 接口），成本与延迟；② 注入靶点是 preset persona 文本，依赖"新会话读取当前 preset 文件"的代际规则；③ 抽取误记寒暄/误删事实 |
| 行号引用策略 | 仅 hint；以 symbol + rg anchor 为准 |
| 必需验收方式 | 真实浏览器（Playwright channel chrome）对 `http://127.0.0.1:3084/dsh-bot/ui` 回放 + 记忆文件 `cat` + RPC curl |
| 必须覆盖用户场景 | 自动记住、面板查看、忘记生效、显式记住、寒暄不记、注入只影响新会话 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 插件运行数据根为 `$DSH_HOME/dsh-bot/`（`bots.json`、`groups.json`、rooms），已 gitignore | `grep -n "dsh-bot" .gitignore`；`rg -n "dsh-bot/bots.json" packages/dsh-bot-host/src/bots.ts` | `.gitignore` L14 `env/dsh-bot/`；bots.ts L2 |
| 每个 bot 一个 preset 目录 `env/.agent-presets/dsh-bot--<slug>/`，人设文本在 `agent.cordis.yml` 的 `- id: persona` 行 `config.text`；`replacePersonaText(source, persona)` 负责整文件替换 | `grep -n "id: persona" -A4 env/.agent-presets/dsh-bot/agent.cordis.yml`；`rg -n "export function replacePersonaText\|const COMPOSITION_FILE" packages/dsh-bot-host/src/bots.ts` | L24-28；bots.ts L22/L195 |
| 平台 `dsh-agent-instructions` 行读 cwd 下 `AGENTS.md`/`CLAUDE.md`，cwd 是仓库根，不适合作为 per-bot 注入靶点 | `grep -n "DEFAULT_INSTRUCTION_FILE_CANDIDATES" env/profiles/gb/node_modules/@deepseek-ai/dsh-agent-instructions/lib/index.js` | L16-17 |
| bot 会话由 `createOwnedSession` 经 `platform.createSession({agentPreset, cwd})` 创建；投递经 `promptOwnedSession` → `sessionTool.write`；`turnIsOpen(events)` 判轮次是否闭合 | `rg -n "export async function createOwnedSession\|export async function promptOwnedSession\|export function turnIsOpen" packages/dsh-bot-host/src/workbench-sessions.ts` | L350 / L484 / L306 |
| 隐藏会话跑一轮并取答案的完整链路已存在：`askBot`（create hidden → write → `wait until idle` → read → `extractAssistantAnswer`） | `rg -n "export async function askBot\|until: 'idle'\|export function extractAssistantAnswer" packages/dsh-bot-host/src/ask.ts` | L243 / L271 / L121 |
| 平台 `llm` 域仅 `providers / models / discoverModels`，无 completion；抽取必须走会话 | `grep -n "(request" env/profiles/gb/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/llm.d.ts` | L39 / L47 / L67 |
| `sessionTool.read` 返回 message rows，`isPlatformInjection(text)` 用于过滤隐藏 user 行不进工作台历史 | `rg -n "export function isPlatformInjection" packages/dsh-bot-host/src/workbench-sessions.ts` | L161 |
| host RPC 分派在 `workbench-routes.ts`（`listBotSessions` 等 case），HTTP 挂 `webServer.register({kind:'prefix', path:'/dsh-bot'})`；应用错误返回 HTTP 200 + `{ok:false}` | `rg -n "listBotSessions" packages/dsh-bot-host/src/workbench-routes.ts`；`rg -n "kind: 'prefix'" packages/dsh-bot-host/src/routes.ts` | L177-227；routes.ts L124 |
| host 服务类 `DshBotService extends Service`，配置经 `static Config` zod + `installSettingsSection(ctx, …)` 热更新，命名空间 `dsh-bot` | `rg -n "class DshBotService extends Service\|static Config\|installSettingsSection\(ctx" packages/dsh-bot-host/src/index.ts` | L224 / L227 / L271 |
| 工作台 RPC 客户端在 `api.ts`（`listBots`、`prompt(sessionId, text)` 等）；会话头 `.conversationHead` 有「编辑人设」按钮位；`Transcript.tsx` 有 `showAuthor` 与消息菜单 | `rg -n "export function listBots\|export function prompt\(" packages/workbench-ui/src/api.ts`；`rg -n "conversationHead" packages/workbench-ui/src/Conversation.tsx`；`rg -n "showAuthor" packages/workbench-ui/src/Transcript.tsx` | api.ts L94/L198；Conversation.tsx L400 |
| 工作台每 30s 跑 `reconcile()`（`RECONCILE_MS`），可作为"GUI 直建会话的轮次闭合"补扫触发点 | `rg -n "RECONCILE_MS" packages/workbench-ui/src/App.tsx` | L56/L165 |
| 仓库脚本：`pnpm run typecheck` / `pnpm run build` / `pnpm test`(vitest) / `pnpm run standard:check`；host 测试目录 `packages/dsh-bot-host/tests/{ask,bots,group-engine,groups,reconcile,routes,workbench-routes,workbench-sessions}.spec.ts` | `grep -n '"typecheck"\|"build"\|"test"\|"standard:check"' package.json`；`ls packages/dsh-bot-host/tests` | L9-13 |
| :3084 网关可起且身份为本仓 `env/`；Playwright 可复用 `../../dsh-genoffice/engine/node_modules/playwright`，`launch({channel:'chrome'})` | `lsof -nP -iTCP:3084 -sTCP:LISTEN`；本会话多次无头渲染零报错 | pid 32077 |
| Grok Bot 记忆参考形状（只读，不拷文案）：三类事实 profile/log/note；寒暄词表 + `<40 字且无问号` 不记；冲突用 `remove: <逐字旧事实>`；用户显式写入的不被合成改写；删除留 tombstone | 最初调研报告 §4.4（`/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/reference` 只读） | 形状可对齐，实现与文案自写 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-801 | 在 `createOwnedSession` 之前重写该 bot preset 的 persona 文本（基础人设 + 记忆段），随后 `platform.createSession({agentPreset})` 建出的新会话读到的是重写后的内容（代际规则：只影响其后新会话） | 若平台缓存 preset，新会话仍拿旧文本 → 注入失效 | Task 1：改 persona 后立刻建会话问"你记得什么" |
| ASM-802 | 用隐藏会话跑一轮抽取（复用 `askBot` 链路，同 bot preset 或专用轻量 preset）单次 ≤ 20s、可接受；抽取结果为 JSON 可解析率 ≥ 95% | 太慢/太贵则改为每 N 轮或用户手动触发 | Task 1：对 3 段真实对话各跑一次计时 |
| ASM-803 | GUI 直建（非工作台）bot 会话的轮次闭合可由 30s `reconcile` 补扫捕获：对每个 bot 会话比较"上次抽取 seq"与当前最大 seq | 补扫漏掉则这类会话不长记忆（仅影响非工作台路径） | Task 1：在官方 GUI 用 bot preset 聊一轮，35s 内看记忆文件 |
| ASM-804 | 记忆段注入 ≤ 4000 字符（profile ≤ 1500 + log 最近 20 条）不会让 persona 行 YAML 超限或触发 preset `broken` | 超限则截断策略需前移 | Task 1：写 4000 字符 persona 后 `agentPreset.list` 校验 |

---

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-09-06 | INV-804 | 邻仓既有脏状态非本仓所致；与母包 living-master 邻仓例外同一登记，文件清单见 `../dsh-bot-living-master/spec.md` §1.5 | Task 13 按「邻仓 porcelain 与开工基线一致」验收，状态改已完成 |

## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。ID 用 8xx 段（native-surface 用 7xx，routines 用 9xx）。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-801 | 存储：每 bot 一个目录 `$DSH_HOME/dsh-bot/memory/<botId>/`，两文件 `profile.md`（长期事实，每行 `- ` 一条）与 `log.jsonl`（每行 `{ts, kind:'log'\|'note', text, source:'auto'\|'explicit', sessionId, tombstone?}`）；目录随 bot 删除一并删除；不入 git | 记住"用户叫 Nothing" → `profile.md` 多一行 | 写进 `bots.json`；删 bot 后目录残留 | dsh-bot-host | `cat` 文件 + vitest |
| BR-802 | 自动抽取：工作台 `prompt` 触发的轮次闭合后（`turnIsOpen` 变 false），host 取该轮 user+assistant 文本跑一次抽取（隐藏会话，标 `kind:hidden`、标题 `~dsh-bot-memory:`），输出 `{profile:[…], log:[…], remove:[…]}`；`remove` 只允许删逐字存在的行；寒暄（字符 < 40 且无问号，或命中寒暄词表）跳过抽取 | 一轮说"我叫 Nothing，术语保留英文" → profile 增两条 | 用户说"谢谢"也跑抽取；`remove` 删了不存在的原文 | dsh-bot-host | vitest（抽取解析）+ 真机 |
| BR-803 | 注入：`createOwnedSession` 前把该 bot preset persona 重写为 `基础人设 + "\n\n## 你记得的事\n" + profile 全部 + log 最近 20 条（非 tombstone）`，总长 ≤ 4000 字符（超出丢最旧 log）；基础人设单独存于 `bots.json.persona`，重写不丢基础文本；旧会话不受影响 | 新会话问"我叫什么" → 答 Nothing | 直接改用户填写的 persona 字段；注入超 4000 字符 | dsh-bot-host | 真机 + `cat agent.cordis.yml` |
| BR-804 | 面板与忘记：工作台会话头「🧠 记忆 N」按钮 → 面板分「关于用户 / 日志 / 备注」三段，每条显示来源（自动 / 你标记的）与时间；「忘记」= 该行加 `tombstone:true`（profile 行移入 log 并打 tombstone），立即从注入段剔除；面板空态文案「还没记住什么。每轮后自动抽取，寒暄不记。」 | 忘记后新开会话它不再知道 | 忘记只隐藏不落盘；刷新后又出现 | workbench-ui + host | 真机 |
| BR-805 | 显式记住：assistant 消息悬停动作「📌 记住这条」→ RPC `memoryRemember({botId, text, sessionId})` 写 log 行 `source:'explicit'`；explicit 行不会被自动抽取的 `remove` 删除（只能用户手动忘记） | 点 📌 后面板日志段多一条「你标记的」 | 自动抽取把 explicit 行删了 | workbench-ui + host | vitest + 真机 |
| BR-806 | RPC 契约（`POST /dsh-bot/<method>`，`{args}`）：`memoryList({botId})` → `{profile:[{text,ts}], log:[{id,kind,text,ts,source,sessionId}]}`；`memoryRemember({botId,text,sessionId?})` → `{id}`；`memoryForget({botId,id})` → `{ok:true}`；`memoryClear({botId})` → `{ok:true}`（需二次确认在前端）；越界返回 `{ok:false}` 而非 500 | curl 四例 | 500；`memoryClear` 无确认 | dsh-bot-host | curl + vitest |
| BR-807 | 红线：不改官方 npm 包与邻仓；一口一仓 :3084；记忆文件不入 git；参考树只读（`rg -i 'anysphere\|sand://' packages/` 为空）；抽取提示词与注入段文案自写 | — | 拷参考提示词 | 全部 | 收尾命令 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-801 | 工作台打开「校对阿宁」新会话，记忆为空 | 发"我叫 Nothing，术语保留英文"，等回复闭合 ≤30s | 会话头「记忆」计数从 0 变 ≥1；面板「关于用户」出现这两条 | 本机用户 | browser | EVD-801 |
| UF-802 | UF-801 已完成 | 点「新开对话」，发"我叫什么？" | 新会话回复含 Nothing | 本机用户 | browser | EVD-802 |
| UF-803 | UF-802 已完成 | 在面板对"叫 Nothing"点「忘记」，再新开对话问"我叫什么" | 面板该条消失；新会话不知道名字 | 本机用户 | browser | EVD-803 |
| UF-804 | 任一 bot 会话有一条 assistant 回复 | 悬停 → 点「📌 记住这条」 | 面板「日志」段出现该条，来源「你标记的」 | 本机用户 | browser | EVD-804 |
| UF-805 | 记忆有 N 条 | 发"谢谢"并等闭合 | 计数仍为 N（未触发抽取） | 本机用户 | browser + `cat` | EVD-805 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-801: 自动记住

**前置状态**：`sh env/boot.sh` 已起；浏览器打开 `http://127.0.0.1:3084/dsh-bot/ui`；「校对阿宁」存在且 `memory/proof/` 为空。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 选「校对阿宁」→「新开对话」 | 会话头出现「🧠 0」 | `memoryList` 返回空 | — |
| 2 | 发"我叫 Nothing，术语保留英文" | 消息入列、typing 指示 | `promptOwnedSession` 写入；host 记录该会话 `pendingExtract` | Bot 回复 |
| 3 | — | 回复完成后 ≤30s 「🧠」计数变 ≥1（无需刷新，随既有 2s 轮询） | host 检测 `turnIsOpen` 变 false → 取本轮文本 → 非寒暄 → 隐藏会话抽取 → 写 `profile.md` | 打开面板：「关于用户」两条，来源「自动」 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 抽取超时/失败 | 隐藏会话 `wait` 超时或输出非 JSON | 计数不变，无 toast（静默） | host warn 日志，`pendingExtract` 保留到下一轮重试一次 | 下一轮再抽 |
| 寒暄 | 文本 < 40 字且无问号 / 命中词表 | 计数不变 | 跳过抽取 | — |
| 记忆文件不可写 | 目录权限错 | 面板显示「记忆暂不可用」 | RPC `{ok:false,error}` | 修权限后刷新 |

**界面状态机**：

```text
count:0 → (轮次闭合) extracting(无 UI) → count:N
面板：closed → open(list) → forgetting(行 loading) → open
```

**入口接线清单**：

- `Conversation.tsx` `.conversationHead` 新增「🧠 记忆 N」按钮 → 打开 `MemoryPanel`
- host：`promptOwnedSession` 成功后登记 `pendingExtract[sessionId]`；既有 2s `history` 轮询命中 `turnIsOpen=false` 时触发抽取（同一进程内，不依赖前端）

#### UF-802: 新会话读到记忆（注入）

**前置状态**：UF-801 完成。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 点「新开对话」 | 新会话出现 | `createOwnedSession` 前重写 preset persona = 基础人设 + 记忆段 → `platform.createSession` | — |
| 2 | 发"我叫什么？" | typing | 正常轮次 | 回复含 Nothing |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| preset 重写后校验 broken | YAML 转义问题 | 新建会话失败 toast「人设文件写入失败」 | 回滚 persona 为基础文本（复用 `createBotsRuntime` 回滚） | 重试 |
| 记忆为空 | 无文件 | 正常建会话 | 不追加记忆段 | — |
| 旧会话 | 继续在旧会话问 | 旧会话不知道（代际规则） | 不动旧会话 | 用户新开对话 |

**界面状态机**：`idle → creating → ready | failed(toast)`

**入口接线清单**：

- `Roster.tsx` / `Conversation.tsx`「新开对话」→ `createBotSession` → host `createOwnedSession`（内部先 `injectMemory(botId)`）

#### UF-803: 忘记

**前置状态**：UF-802 完成。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 打开面板，悬停"叫 Nothing"行 | 出现「忘记」按钮 | — | — |
| 2 | 点「忘记」 | 行 loading → 消失；计数 -1 | `memoryForget` → 该行 tombstone | 面板不再显示 |
| 3 | 新开对话问"我叫什么" | typing | 注入段不含 tombstone 行 | 回复不知道 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| RPC 失败 | host `{ok:false}` | 行恢复，toast「忘记失败」 | 不改文件 | 重试 |
| 重复点击 | 连点 | 按钮 disabled 300ms | 幂等（已 tombstone 返回 ok） | — |

**界面状态机**：`row → forgetting → gone | row(+toast)`

**入口接线清单**：`MemoryPanel` 行「忘记」→ `api.memoryForget`

#### UF-804: 显式记住

**前置状态**：任一 bot 会话有 assistant 消息。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 悬停 assistant 消息 | 动作栏出现「📌」 | — | — |
| 2 | 点 📌 | toast「已记住」；「🧠」计数 +1 | `memoryRemember({text: 该消息纯文本前 200 字, source:'explicit'})` | 面板日志段新增，来源「你标记的」 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 小组房间消息 | 在房间点 📌 | 弹出选择「记到哪个成员」 | 按选择写入 | — |
| RPC 失败 | `{ok:false}` | toast「记住失败」 | — | 重试 |

**界面状态机**：`hover → saving → saved(toast) | failed(toast)`

**入口接线清单**：`Transcript.tsx` assistant 消息动作栏新增 📌 → `api.memoryRemember`

#### UF-805: 寒暄不记

**前置状态**：记忆有 N 条。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 发"谢谢" | Bot 回复 | 轮次闭合 → 文本 < 40 字且无问号 → 跳过抽取 | 计数仍 N；`log.jsonl` 行数不变 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 短句但有问号 | "为什么？" | 正常抽取（可能无结果） | 走抽取 | — |
| 抽取返回空 | 模型判无可记 | 计数不变 | 写空结果不落盘 | — |

**界面状态机**：无新增状态。

**入口接线清单**：host `shouldExtract(text)` 门槛函数，接在轮次闭合钩子前。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-801 | 用户在 BotForm 填写的基础 persona 永不被记忆注入改写（`bots.json.persona` 为真源，preset 文件是派生物） | BR-803 | vitest：注入两次后 `bots.json.persona` 不变 |
| INV-802 | 抽取用的隐藏会话带 `kind:hidden` + `~dsh-bot-memory:` 前缀，不出现在 1:1 列表（含「包含隐藏」关闭态） | BR-802 | `listOwnedSessions` 过滤断言 |
| INV-803 | 既有 v1 `dsh_bot_ask`、小组轮次、`listBotSessions` 契约不变 | BR-806 | `pnpm test` 既有用例全过 |
| INV-804 | 一口一仓 :3084、邻仓 porcelain 与开工基线一致（既有脏文件见母包 `../dsh-bot-living-master/spec.md` §1.5）、`rg -i 'anysphere\|sand://' packages/` 为空、`env/dsh-bot/memory/` 不入 git | BR-807 | 收尾命令 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-800 | log | Task 1 校准 ASM-801~804 实测结论 | `evidence/phase-0/calibration.md` |
| EVD-801 | screenshot+file | 自动记住：面板截图 + `profile.md` 内容 | `evidence/UF-801/` |
| EVD-802 | screenshot+file | 新会话答对 + 重写后 `agent.cordis.yml` 记忆段 | `evidence/UF-802/` |
| EVD-803 | screenshot+file | 忘记后面板 + `log.jsonl` tombstone 行 + 新会话不知道 | `evidence/UF-803/` |
| EVD-804 | screenshot | 📌 后面板日志段 | `evidence/UF-804/` |
| EVD-805 | file | 寒暄前后 `log.jsonl` 行数一致 | `evidence/UF-805/` |
| EVD-806 | api | 四个 RPC curl request/response | `evidence/API-806/` |
| EVD-807 | log | 各 Phase 命令输出 | `evidence/phase-{N}/` |

### 2.6 角色与权限矩阵

单一本机用户，loopback，无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 空数据 | 新建 bot 无记忆 | 打开面板 / 新开对话 | 空态文案；不注入记忆段 | EVD-801 |
| 依赖失败 | 抽取隐藏会话超时 | 轮次闭合 | 静默、下一轮重试一次、不阻塞对话 | EVD-807 `phase-1/extract-timeout.log` |
| 重复提交 | 同一轮闭合被检测两次 | — | 幂等（按 `lastExtractedSeq` 去重） | vitest |
| 旧数据兼容 | 升级前已有 bot 无 memory 目录 | 首次轮次闭合 | 目录懒创建 | vitest |
| 破坏性 | `memoryClear` | 前端二次确认后 | 目录清空但保留；bot 不受影响 | EVD-806 |

### 2.8 非目标

- 跨 bot 共享「用户记忆」分片、项目记忆、24h 后台合成、30 天衰减排序、`[via 某 bot]` 溯源标签——下一版 `dsh-bot-memory-v2`。
- bot 自己用工具改记忆（`update_state`）——需要新工具面，另立。
- 小组房间的多作者记忆——本包只记 1:1；房间里点 📌 需指定成员。
- token 流式 / 附件 / 停止——`dsh-bot-live-transcript` 包范围。

---
## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
bots.json.persona ──createBot──> preset/agent.cordis.yml(persona) ──createSession──> 会话
会话之间无任何跨越；bot 只在被提问的那一刻存在

After:
                    ┌── memory/<botId>/profile.md + log.jsonl ◀── 抽取(隐藏会话 ~dsh-bot-memory:) ◀── 轮次闭合钩子
bots.json.persona ──┴──injectMemory──> preset persona = 基础 + 「你记得的事」段 ──createSession──> 新会话
工作台：会话头「🧠 N」→ MemoryPanel（三段 / 忘记）；消息「📌 记住这条」
RPC：memoryList / memoryRemember / memoryForget / memoryClear
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `packages/dsh-bot-host/src/memory.ts`（新） | 文件读写（profile/log）、`shouldExtract`、注入段渲染 `renderMemorySection`、tombstone | 纯函数 + fs，vitest 全覆盖 |
| `packages/dsh-bot-host/src/memory-extract.ts`（新） | 复用 `askBot` 链路对本轮文本跑抽取，解析 JSON，应用 `remove` 规则 | 提示词自写 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `createOwnedSession` 前 `injectMemory`；`promptOwnedSession` 后登记 `pendingExtract`；`readOwnedHistory` 检测闭合触发抽取 | 改动点见 §3.3 |
| `packages/dsh-bot-host/src/bots.ts` | 暴露 `rewritePresetPersona(botId, text)`（复用 `replacePersonaText` + 校验回滚）；删 bot 时删 memory 目录 | — |
| `packages/dsh-bot-host/src/workbench-routes.ts` | 四个 memory RPC case | — |
| `packages/workbench-ui` | `api.ts` 四个调用；`MemoryPanel.tsx`（新）；`Conversation.tsx` 会话头按钮；`Transcript.tsx` 📌 动作 | — |

### 3.3 三段式定位清单

> 全部 anchor 已于 2026-09-06 用 `rg -c` 核验命中。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `packages/dsh-bot-host/src/bots.ts` | `export function replacePersonaText` | `rg "export function replacePersonaText" packages/dsh-bot-host/src/bots.ts` | L195 | 注入复用 |
| `packages/dsh-bot-host/src/bots.ts` | `const COMPOSITION_FILE` | `rg "const COMPOSITION_FILE" packages/dsh-bot-host/src/bots.ts` | L22 | `agent.cordis.yml` |
| `packages/dsh-bot-host/src/bots.ts` | `export function createBotsRuntime` | `rg "export function createBotsRuntime" packages/dsh-bot-host/src/bots.ts` | L347 | 加 `rewritePresetPersona`；deleteBot 删目录 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function createOwnedSession` | `rg "export async function createOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L350 | 前置注入 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function promptOwnedSession` | `rg "export async function promptOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L484 | 登记 pendingExtract |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function turnIsOpen` | `rg "export function turnIsOpen" packages/dsh-bot-host/src/workbench-sessions.ts` | L306 | 闭合判定 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function listOwnedSessions` | `rg "export async function listOwnedSessions" packages/dsh-bot-host/src/workbench-sessions.ts` | L399 | 过滤 `~dsh-bot-memory:` |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function isPlatformInjection` | `rg "export function isPlatformInjection" packages/dsh-bot-host/src/workbench-sessions.ts` | L161 | 抽取取文本时同样过滤 |
| `packages/dsh-bot-host/src/ask.ts` | `export async function askBot` | `rg "export async function askBot" packages/dsh-bot-host/src/ask.ts` | L243 | 抽取复用隐藏会话链路 |
| `packages/dsh-bot-host/src/ask.ts` | `export function extractAssistantAnswer` | `rg "export function extractAssistantAnswer" packages/dsh-bot-host/src/ask.ts` | L121 | — |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `listBotSessions` case | `rg "listBotSessions" packages/dsh-bot-host/src/workbench-routes.ts` | L177-227 | 旁加四个 case |
| `packages/dsh-bot-host/src/index.ts` | `class DshBotService extends Service` | `rg "class DshBotService extends Service" packages/dsh-bot-host/src/index.ts` | L224 | 注入 memory runtime |
| `packages/dsh-bot-host/src/index.ts` | `static Config` | `rg "static Config" packages/dsh-bot-host/src/index.ts` | L227 | 加 `memory.enabled`（默认 true） |
| `packages/dsh-bot-host/src/marks.ts` | `export function botMark` | `rg "export function botMark" packages/dsh-bot-host/src/marks.ts` | L24 | 抽取会话打 `bot:<id>` + hidden |
| `packages/workbench-ui/src/api.ts` | `export function listBots` | `rg "export function listBots" packages/workbench-ui/src/api.ts` | L94 | 旁加四个调用 |
| `packages/workbench-ui/src/Conversation.tsx` | `conversationHead` | `rg "conversationHead" packages/workbench-ui/src/Conversation.tsx` | L400 | 加「🧠 N」按钮 |
| `packages/workbench-ui/src/Transcript.tsx` | `showAuthor` | `rg "showAuthor" packages/workbench-ui/src/Transcript.tsx` | L205 | assistant 动作栏加 📌 |
| `.gitignore` | `env/dsh-bot/` | `rg "env/dsh-bot/" .gitignore` | L14 | memory 目录已覆盖 |

### 3.4 API / 数据 / 权限 / 路由影响

| 类型 | 是否影响 | 说明 | 兼容策略 |
|---|---|---|---|
| API | 是 | 新增 4 个 RPC；`createBotSession` 行为不变但内部先注入 | 加法 |
| 数据 | 是 | 新增 `memory/<botId>/`；preset persona 文件变为派生物 | `bots.json.persona` 为真源；旧 bot 懒创建 |
| 权限 | 否 | loopback 单用户 | — |
| 路由 | 否 | 仍 `/dsh-bot/*` | — |

---

## 4. Phase 计划与任务详情

```text
P0 校准(1) → P1 存储与注入(2,3,4) → P2 抽取(5,6) → P3 RPC 与工作台(7,8,9,10) → P4 收尾(11,12,13)
```

> 实现任务 9 条（2,3,5,7,8,9 + 4/6/10 含实现）≥ 8 → `tasks.csv`。

### Phase 0: 校准

### Task 1: 校准 ASM-801~804

- **关联**：ASM-801 / ASM-802 / ASM-803 / ASM-804 / EVD-800 / UF NA（内部校准）
- **前置任务**：无
- **风险等级**：P0

**为什么做**：注入靶点与抽取成本是整个包的地基。

**涉及文件与定位**：

- `packages/dsh-bot-host/src/bots.ts`：`replacePersonaText`，`rg "export function replacePersonaText" packages/dsh-bot-host/src/bots.ts`，L195
- `packages/dsh-bot-host/src/ask.ts`：`askBot`，`rg "export async function askBot" packages/dsh-bot-host/src/ask.ts`，L243

**具体操作**：

1. ASM-801：`sh env/boot.sh` 后，手工改 `env/.agent-presets/dsh-bot--xiaodui-aning/agent.cordis.yml` persona 追加一句"你记得用户叫测试甲"，用工作台「新开对话」问"我叫什么"，记录是否答对；恢复文件。
2. ASM-802：用 `bash scripts/manual-test.sh --no-write` 确认链路后，对 3 段真实对话文本各走一次 `dsh_bot_ask`（模拟抽取提示词），`time` 记录耗时与输出是否 JSON。
3. ASM-803：在官方 GUI 用 bot preset 发一轮，记录 `reconcile` 是否能观察到该会话（`listBotSessions` 是否列出）。
4. ASM-804：写 4000 字符 persona 后 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh 3084 agentPreset/list` 核 `broken` 为空；恢复。
5. 结论写 `evidence/phase-0/calibration.md`；证伪按 §12 改第 2 章。

**验证**：`ls evidence/phase-0/calibration.md` → 存在；`git status --porcelain env/.agent-presets` → 干净（gitignore 外无残留）

**Evidence**：`evidence/phase-0/`

**注意事项**：`豁免回归:单任务校准 Phase，验证已含 evidence`。

### Phase 1: 存储与注入

### Task 2: 实现 memory.ts 存储层

- **关联**：BR-801 / INV-801 / UF NA（基础设施）
- **前置任务**：1
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/memory.ts`（新建）
- `.gitignore`：`env/dsh-bot/`，`rg "env/dsh-bot/" .gitignore`，L14（已覆盖，只核对）

**具体操作**：

1. `createMemoryStore(home)`：`dir(botId)`、`readProfile`、`appendProfile`、`readLog`、`appendLog({kind,text,source,sessionId})`、`tombstone(id)`、`clear(botId)`、`remove(botId)`；懒建目录；行 id = `ts-随机 6 位`。
2. `renderMemorySection(profile, log, {maxChars:4000, maxLog:20})`：`## 你记得的事` + profile 全部 + 非 tombstone log 最近 20 条；超限丢最旧 log。
3. `shouldExtract(text)`：`< 40` 字且无 `?`/`？` → false；命中寒暄词表（自写：谢谢/ok/好的/收到/哈哈/嗯 等）→ false。
4. `packages/dsh-bot-host/tests/memory.spec.ts`：读写、tombstone 剔除、渲染截断、shouldExtract 正反例。

**验证**：`pnpm test -- memory` → 通过

**Evidence**：`evidence/phase-1/task2-tests.log`

### Task 3: 注入到 preset 与建会话链路

- **关联**：BR-803 / INV-801 / UF-802
- **前置任务**：2
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/bots.ts`：`createBotsRuntime`，`rg "export function createBotsRuntime" packages/dsh-bot-host/src/bots.ts`，L347
- `packages/dsh-bot-host/src/workbench-sessions.ts`：`createOwnedSession`，L350

**具体操作**：

1. `bots.ts` 新增 `rewritePresetPersona(botId, fullText)`：读 `agent.cordis.yml` → `replacePersonaText` → 写 → `agentPreset.list` 校验非 broken，失败回滚为原文件；`bots.json.persona` 不动。
2. `updateBot` 保存基础 persona 后同样经 `rewritePresetPersona(base + memorySection)`。
3. `createOwnedSession` 前调用 `injectMemory(botId)` = `rewritePresetPersona(base + renderMemorySection(...))`；记忆为空时写纯基础文本。
4. `deleteBot` 末尾 `memoryStore.remove(botId)`。
5. `tests/bots.spec.ts` 加：注入两次 `bots.json.persona` 不变；broken 回滚。

**验证**：`pnpm test -- bots workbench-sessions` → 通过；真机新开对话后 `cat env/.agent-presets/dsh-bot--xiaodui-aning/agent.cordis.yml` 含「你记得的事」

**Evidence**：`evidence/UF-802/cordis-after-inject.yml`

### Task 4: 执行 Phase 1 回归验证

- **关联**：BR-801 / BR-803 / INV-801 / INV-803
- **前置任务**：3

**验证**：`pnpm run typecheck && pnpm test` → 全过；`bash scripts/manual-test.sh --no-write` → 通

**Evidence**：`evidence/phase-1/`

### Phase 2: 抽取

### Task 5: 实现 memory-extract.ts

- **关联**：BR-802 / BR-805 / INV-802 / UF-801 / UF-805
- **前置任务**：2
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/memory-extract.ts`（新建）
- `packages/dsh-bot-host/src/ask.ts`：`askBot` / `extractAssistantAnswer`，L243 / L121
- `packages/dsh-bot-host/src/marks.ts`：`botMark`，L24

**具体操作**：

1. `buildExtractPrompt(turnText, existingProfile)`：自写提示词，要求只输出 JSON `{profile:[], log:[], remove:[]}`，说明三类事实定义与"只删逐字存在的行"。
2. `extractMemory(deps, {botId, sessionId, turnText})`：`shouldExtract` 门槛 → 复用 `askBot` 建隐藏会话（标题 `~dsh-bot-memory: <botId>`，marks `kind:hidden` + `bot:<id>`）→ 解析 JSON（失败返回 null）→ `applyExtract`：`remove` 只对 `source:'auto'` 且逐字匹配的行 tombstone；profile 去重追加；log 追加 `source:'auto'`。
3. `tests/memory-extract.spec.ts`：JSON 解析容错、remove 不删 explicit、寒暄不调 askBot（mock）。

**验证**：`pnpm test -- memory-extract` → 通过

**Evidence**：`evidence/phase-2/task5-tests.log`

### Task 6: 轮次闭合钩子与重试

- **关联**：BR-802 / UF-801 / UF-805
- **前置任务**：5
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-sessions.ts`：`promptOwnedSession`，L484；`turnIsOpen`，L306
- `packages/dsh-bot-host/src/index.ts`：`class DshBotService extends Service`，L224

**具体操作**：

1. `promptOwnedSession` 成功后 `pendingExtract.set(sessionId, {botId, sinceSeq})`。
2. `readOwnedHistory`（既有 2s 轮询命中）中：若 `pendingExtract` 有该会话且 `turnIsOpen(events)===false` → 取 `sinceSeq` 之后的 user+assistant 文本（过滤 `isPlatformInjection`）→ 异步 `extractMemory`；失败保留 pending 一次重试；成功删除。
3. 同一 seq 不重复抽取（`lastExtractedSeq`）。
4. `static Config` 加 `memory: z.object({ enabled: z.boolean().default(true) })`，关闭时跳过钩子。
5. `tests/workbench-sessions.spec.ts` 加：闭合触发一次、重复轮询不重复、enabled=false 不触发。

**验证**：`pnpm test -- workbench-sessions` → 通过；真机 UF-801 主路径 `cat env/dsh-bot/memory/<id>/profile.md` 出现新行；`豁免回归:Phase 2 两任务均含单测，回归并入 Task 6 验证`

**Evidence**：`evidence/UF-801/profile.md`、`evidence/phase-2/extract-timeout.log`

### Phase 3: RPC 与工作台

### Task 7: 四个 memory RPC

- **关联**：BR-806 / BR-805 / EVD-806
- **前置任务**：6
- **风险等级**：P1

**涉及文件与定位**：

- `packages/dsh-bot-host/src/workbench-routes.ts`：`listBotSessions` case，L177-227

**具体操作**：

1. 加 `memoryList / memoryRemember / memoryForget / memoryClear` case；参数校验；错误 `{ok:false}`。
2. `tests/workbench-routes.spec.ts` 加四例。
3. curl 四例存 `evidence/API-806/`。

**验证**：`pnpm test -- workbench-routes` → 通过；curl 四例 `ok:true`

**Evidence**：`evidence/API-806/list.json`、`remember.json`、`forget.json`、`clear.json`

### Task 8: MemoryPanel 与会话头按钮

- **关联**：BR-804 / UF-801 / UF-803
- **前置任务**：7
- **风险等级**：P1

**涉及文件与定位**：

- `packages/workbench-ui/src/api.ts`：`listBots`，L94（旁加四个调用）
- `packages/workbench-ui/src/Conversation.tsx`：`conversationHead`，L400
- `packages/workbench-ui/src/MemoryPanel.tsx`（新建）

**具体操作**：

1. `api.ts` 加四个函数。
2. `MemoryPanel.tsx`：三段（profile / log kind=log / log kind=note）、每条来源与时间、悬停「忘记」（loading → 消失；失败 toast 恢复）、底部「清空全部」二次确认、空态文案。
3. `Conversation.tsx` 会话头加「🧠 N」按钮（N 随既有 2s 轮询更新，调 `memoryList` 取长度）→ 打开面板（侧滑或下拉，沿用既有会话切换器样式）。
4. `tests/memory-panel.spec.tsx`：三态、忘记乐观更新与回滚。

**验证**：`pnpm test -- memory-panel conversation` → 通过；真机会话头可见「🧠」

**Evidence**：`evidence/UF-801/panel.png`、`evidence/UF-803/after-forget.png`

### Task 9: 「📌 记住这条」动作

- **关联**：BR-805 / UF-804
- **前置任务**：7
- **风险等级**：P2

**涉及文件与定位**：

- `packages/workbench-ui/src/Transcript.tsx`：`showAuthor`，L205

**具体操作**：

1. assistant 消息动作栏加 📌；1:1 直接 `memoryRemember({botId, text 前 200 字, sessionId})`；小组房间弹成员选择。
2. toast「已记住」/「记住失败」。
3. `tests/transcript.spec.tsx` 加一例。

**验证**：`pnpm test -- transcript` → 通过

**Evidence**：`evidence/UF-804/after-pin.png`

### Task 10: 执行 Phase 3 回归验证

- **关联**：BR-804 / BR-805 / BR-806 / INV-803
- **前置任务**：8；9

**验证**：`pnpm run typecheck && pnpm test && pnpm run build` → 全过

**Evidence**：`evidence/phase-3/`

### Phase 4: 文档、真实场景与收尾

### Task 11: 同步 README 与人设编辑提示

- **关联**：BR-803 / UF NA（文档）
- **前置任务**：10
- **风险等级**：P2

**具体操作**：

1. README「人设管理」加「记忆」小节：文件位置、三类事实、忘记/清空、`dsh-bot.memory.enabled`。
2. BotForm 保存提示追加"记忆会随新会话一起注入"。

**验证**：`rg -n "记忆" README.md` → ≥1 命中

**Evidence**：`evidence/phase-4/docs-diff.md`

### Task 12: 执行 spec 5.2 真实场景全套测试

- **关联**：UF-801 / UF-802 / UF-803 / UF-804 / UF-805
- **前置任务**：10

**验证**：按 5.2 执行矩阵逐行回放，全部通过

**Evidence**：`evidence/UF-801/` ~ `evidence/UF-805/`

### Task 13: 执行 Phase 4 回归验证

- **关联**：全部 BR / INV-804
- **前置任务**：11；12

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/ env/ scripts/` → 空；`git status --porcelain` 不含 `env/dsh-bot/memory`；三邻仓 porcelain 与开工基线一致（既有脏文件见母包 §1.5）；`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-memory --repo .` → 0 FAIL

**Evidence**：`evidence/phase-4/final-commands.log`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 用户可见的需求必须通过 5.2 真实场景全套测试才算完成。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| typecheck | `pnpm run typecheck` | exit 0 | EVD-807 |
| build | `pnpm run build` | exit 0 | EVD-807 |
| unit | `pnpm test` | 全过，含 memory / memory-extract / memory-panel 新增用例 | EVD-807 |
| standard | `pnpm run standard:check` | exit 0 | EVD-807 |
| 红线 | `rg -i 'anysphere\|sand://' packages/ env/ scripts/` | 空 | EVD-807 |
| 数据不入 git | `git status --porcelain \| rg "env/dsh-bot"` | 空 | EVD-807 |

### 5.2 真实场景全套测试（Real-Run，完成的唯一标准）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（loopback :3084；先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份） |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui`（主）；官方 GUI `http://127.0.0.1:3084`（ASM-803 抽验） |
| 测试账号/数据 | 本机单用户；需存在人设「校对阿宁」（`dsh-bot--xiaodui-aning`）；测试前 `rm -rf env/dsh-bot/memory/<id>` 清空 |
| 干净状态定义 | 每条 UF 前清空该 bot 记忆目录并刷新页面 |
| 可用测试工具 | Playwright（`../../dsh-genoffice/engine/node_modules/playwright`，`channel:'chrome'`）；文件核对 `cat`；RPC 用 curl |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-801 主路径 | browser + cat | 2.3 UF-801 步骤 1-3 | 计数 0→≥1 ≤30s；面板两条来源「自动」；`profile.md` 含两行 | `evidence/UF-801/panel.png`、`evidence/UF-801/profile.md` |
| UF-801 失败分支 抽取失败 | browser + log | 临时把 `askTimeoutMs` 调为 1000 | 计数不变、无 toast、host 日志 warn、下一轮重试 | `evidence/phase-2/extract-timeout.log` |
| UF-801 失败分支 文件不可写 | browser | `chmod 000 env/dsh-bot/memory` 后打开面板 | 「记忆暂不可用」；恢复权限后正常 | `evidence/UF-801/unwritable.png` |
| UF-802 主路径 | browser + cat | 2.3 UF-802 | 新会话答含 Nothing；`agent.cordis.yml` 含「你记得的事」 | `evidence/UF-802/new-session-answer.png`、`evidence/UF-802/cordis-after-inject.yml` |
| UF-802 失败分支 旧会话 | browser | 回旧会话问 | 旧会话不知道 | `evidence/UF-802/old-session.png` |
| UF-802 失败分支 记忆为空 | cat | 清空后新开对话 | persona 文件无记忆段 | `evidence/UF-802/cordis-empty.yml` |
| UF-803 主路径 | browser + cat | 2.3 UF-803 | 行消失、`log.jsonl` 该行 tombstone、新会话不知道 | `evidence/UF-803/after-forget.png`、`evidence/UF-803/log.jsonl`、`evidence/UF-803/new-session-unknown.png` |
| UF-803 失败分支 RPC 失败 | browser | 停 host 后点忘记 | toast「忘记失败」，行恢复 | `evidence/UF-803/forget-fail.png` |
| UF-804 主路径 | browser | 2.3 UF-804 | 面板日志段出现，来源「你标记的」 | `evidence/UF-804/after-pin.png` |
| UF-804 失败分支 房间消息 | browser | 在编辑室点 📌 | 弹成员选择 | `evidence/UF-804/room-pick.png` |
| UF-805 主路径 | browser + cat | 2.3 UF-805 | `log.jsonl` 行数不变 | `evidence/UF-805/before-after-wc.txt` |
| UF-805 失败分支 短句带问号 | browser + cat | 发"为什么？" | 走抽取（可能无结果） | `evidence/UF-805/question-mark.txt` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-0/ calibration.md
  phase-1/ ~ phase-4/
  UF-801/ ~ UF-805/
  API-806/ list.json remember.json forget.json clear.json
```

### 5.4 Review 专项检查清单

- [ ] `bots.json.persona` 在任何注入后不变（INV-801）
- [ ] 抽取隐藏会话不出现在 1:1 列表（INV-802）
- [ ] `remove` 从不删 `source:'explicit'` 行（BR-805）
- [ ] 抽取失败不阻塞对话、不弹 toast（UF-801 失败分支）
- [ ] 提示词与注入段文案为自写，参考树零拷贝（BR-807）
- [ ] 5.2 执行矩阵全部通过，evidence 齐全
- [ ] 2.3 每条流程入口接线可达
