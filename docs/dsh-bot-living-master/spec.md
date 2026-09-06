# dsh-bot-living-master Spec

> Version: 0.1.0 | Date: 2026-09-06 | Status: Ready 可执行
>
> 本文件是**母包**唯一事实源：统筹两个子包的执行顺序、共享面冲突规约、跨包联合验收。
> 子包合同各自独立（编号闭环）。引用子包条目时用「路径 + 描述性名称」，不直写其条目编号：
> - 记忆包 `../dsh-bot-memory/spec.md`（每 bot 跨会话记忆：存储 / 抽取 / 注入 preset / 面板 / 📌 记住）
> - 例程包 `../dsh-bot-routines/spec.md`（Wake 机制：cron 调度 / 唤醒投递 / 静默约定 / 未读通知 / 主动提议）
>
> 填写三态规则：每个表格单元格只允许三种内容——验证过的事实（注明来源命令）/ `ASM-xxx` / `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**：要"一口气"把两个让 bot 活起来的包（记忆 + 例程）全部做完的执行方（无人值守 agent 或人）。
- **做什么**：一个总控包——定两个子包的执行顺序（先记忆，后例程）、两包共用代码面的改动规矩（尤其是人设文本的三段拼接：基础人设 + 记忆段 + 行为规范段，谁先写谁后叠）、以及两包都做完后只有叠加才会出现的联合场景验收（例如：bot 被例程叫醒时，它得记得你是谁）。
- **改哪里**：母包自己不改产品代码；所有实现都在两个子包的任务里。
- **怎么算做完**：两个子包各自 spec 5.2 全过且校验脚本 0 FAIL；本包三条联合场景全过；最终 build / typecheck / test / standard:check 全绿；报告如实写清任何止损点。
- **不做什么**：不重复子包的执行矩阵；不在母包新增产品功能；bot 互发消息、token 流式、名册置顶分组等仍是后续包。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 「给一个 master 引导包吧」（2026-09-06），承接刚生成的记忆包与例程包 |
| 输入类型 | description（用户指令 + 两个子包已生成并各自 `--repo` 校验 0 FAIL） |
| Mode | oneclick（母包，多包统筹） |
| 置信度 | 高（两子包 spec 已落盘；统筹层无未知机制） |
| 输出目录 | `docs/dsh-bot-living-master/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | infra（执行编排 + 联合验收；不新增产品面） |
| 主要风险 | 两包同时改 `bots.ts` 的 persona 组合与 `workbench-sessions.ts` 的过滤/投影函数；例程唤醒轮次是否触发记忆抽取（成本叠加）；两个会话头按钮 🧠 / ⏰ 的排布与计数轮询叠加 |
| 行号引用策略 | 母包不定位产品代码；定位清单指向子包 spec 与共享文件的 symbol |
| 必需验收方式 | 子包各自 5.2 + 本包 5.2 联合回放（browser + cat + RPC） |
| 必须覆盖用户场景 | UF-101 唤醒会话读到记忆、UF-102 主动消息可被记住且三段拼接稳定、UF-103 老路径抽验 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 两子包已生成且结构齐备（spec / tasks.csv / evidence），各自 `--repo` 校验 0 FAIL | `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-memory --repo .`；同命令对 `docs/dsh-bot-routines`（2026-09-06） | 0 FAIL / 1 WARN（豁免回归留痕） |
| 两包共同点名的共享文件：`packages/dsh-bot-host/src/{bots,workbench-sessions,workbench-routes,index,marks,ask}.ts`、`packages/workbench-ui/src/{api.ts,Conversation.tsx,Transcript.tsx}` | `grep -n "^| \`packages" docs/dsh-bot-memory/spec.md docs/dsh-bot-routines/spec.md` 交集 | BR-102 冲突规约依据 |
| 记忆包的 persona 组合点：新增 `rewritePresetPersona(botId, fullText)`，建会话前写「基础 + 记忆段」；`bots.json.persona` 为真源 | `rg -n "rewritePresetPersona" docs/dsh-bot-memory/spec.md` | 其 Task 3 |
| 例程包的 persona 组合点：新增 `renderBehaviorSection(bot)`，要求组合为「基础 + 记忆段 + 规范段」，并明写"与 memory 包共用组合点" | `rg -n "renderBehaviorSection" docs/dsh-bot-routines/spec.md` | 其 Task 6 |
| 两包都改 `isPlatformInjection`：记忆包用它过滤抽取取文本；例程包给它加 `[routine]` 与系统提示前缀 | `rg -n "isPlatformInjection" docs/dsh-bot-memory/spec.md docs/dsh-bot-routines/spec.md` | 同函数两处加法 |
| 记忆抽取钩子只挂在 `promptOwnedSession`（用户主动发消息）；例程唤醒直接 `sessionTool.write`，不经该函数 | `rg -n "promptOwnedSession" docs/dsh-bot-memory/spec.md`；`rg -n "sessionTool.write" docs/dsh-bot-routines/spec.md` | 默认唤醒轮次**不**触发抽取 → BR-103 定死 |
| 两包都在 `Conversation.tsx` 会话头加 pill（🧠 N / ⏰ N），都随既有 2s 轮询更新计数 | `rg -n "🧠\|⏰" docs/dsh-bot-memory/spec.md docs/dsh-bot-routines/spec.md` | BR-102 排布规约 |
| 既有母包样板 `../dsh-bot-interaction-master/spec.md`（统筹层合同形状：顺序 / 共享面 / 闸门 / 纪律） | Read（2026-09-06） | 本包同形 |
| 仓库脚本 `pnpm run typecheck / build / test / standard:check`；:3084 网关与 Playwright 可用 | `grep -n '"typecheck"' package.json`；`lsof -nP -iTCP:3084 -sTCP:LISTEN` | 沿用 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-110 | 记忆包 Task 1 与例程包 Task 1 的校准结论互不冲突：preset 代际规则（改 persona 后新会话读到新文本）同时支撑"注入记忆"与"注入规范段" | 若代际规则证伪，两包同时失去注入靶点，需统一改为唤醒词/首条消息注入 | Task 1 前置检查读两子包 `evidence/phase-0/calibration.md`；Task 2 结束核对 |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| — | — | 首次生成 | — |

---

## 2. 业务合同

> 本章是 BR/UF/INV/EVD 的唯一定义处。ID 用 1xx 段（与 `../dsh-bot-native-experience/spec.md` 的 ASM-101~103 无关，引用时带包名）。子包条目一律用「路径 + 描述名」引用。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-101 | 执行顺序：先记忆包 `../dsh-bot-memory/spec.md` 后例程包 `../dsh-bot-routines/spec.md`；每个子包按其 tasks.csv 推进到"全部已完成或诚实已阻塞"；两包的 Task 1（真机校准）都不得跳过；记忆包个别任务阻塞时例程包照常开工，但例程包依赖的 persona 组合点（记忆包 Task 3 的重写函数）若阻塞，例程包 Task 6 改为直接组合「基础 + 规范段」并在其备注写明 | 记忆包 T5 抽取阻塞 → 例程包照常 | 例程包先行；跳过校准 | 两子包 | Task 2/3 板面核查 |
| BR-102 | 共享面规约：① persona 拼接顺序固定为 `基础 persona + 记忆段 + 行为规范段`，只有一个组合函数（记忆包先建，例程包只追加，不得各写一份重写逻辑）；② `isPlatformInjection` 两包都是加法，不得改既有前缀判定；③ 会话头 pill 顺序固定「🧠 记忆」在「⏰ 例程」左侧，两者共用一次 `listBots`/轮询拍不新增独立定时器；④ `workbench-routes.ts` 新增 case 各自成段，不交叉改对方 case；⑤ 两包各自 Phase commit，不混包提交 | 例程包 diff 里记忆段拼接原样在 | 例程包重写 persona 时把记忆段丢了；新增第四个 2s 定时器 | 全仓 | Task 3 开工前 diff 核 + Task 4 联合回放 |
| BR-103 | 抽取边界：例程唤醒轮次**不**触发记忆抽取（唤醒不经 `promptOwnedSession`，不登记 pendingExtract）；用户对唤醒消息点「📌 记住这条」仍可写入记忆；唤醒会话由建会话链路创建时**照常注入**记忆段 | 例程说"磁盘 86%"不自动进记忆；用户 📌 后进 | 每次唤醒都跑一次抽取（成本翻倍） | 两子包 | Task 4 UF-102 |
| BR-104 | 完成闸门：母包完成 = 两子包各自 `validate_package.py` 0 FAIL 且其 5.2 全过 + 本包 5.2 联合回放全过 + 最终 `pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` 全绿；任何子包链条止损时，报告必须写明止损点与未执行面，禁止描述为"全部完成" | 报告如实写"例程包 T13 阻塞：xx" | 子包有 FAIL 仍宣称完成 | 全仓 | Task 4/5 |
| BR-105 | 纪律延续：两子包红线条款（各自 2.1 末条）全程有效；一口一仓 :3084、邻仓零改、`env/dsh-bot/` 下 memory / routines 数据不入 git、参考树只读（`rg -i 'anysphere\|sand://' packages/` 为空）、唤醒词 / 抽取提示词 / 规范段文案自写 | 终检命令干净 | — | 全仓 | Task 5 终检 |

### 2.2 UF 用户验收场景（索引）

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-101 | 两包合入；「运维夜班」记忆里已有"用户叫 Nothing"；一条 `@every 1m` 例程"报时并称呼用户" | 等一次唤醒 | 例程线程里的主动消息称呼 Nothing；其 preset 文件同时含「你记得的事」与规范段 | 本机用户 | browser + cat | EVD-101 |
| UF-102 | 例程刚落一条主动消息 | 悬停该消息点「📌 记住这条」；随后对同 bot 编辑人设保存 | 记忆面板日志段出现该条「你标记的」；`log.jsonl` 无自动抽取新增行；保存人设后 preset 文件三段顺序不变 | 本机用户 | browser + cat | EVD-102 |
| UF-103 | 两包全部合入 | 复跑老路径：v1 委托 `dsh_bot_ask`、v2 双人设隔离、三期默认一轮小组 | 三条主路径与各自包验收时逐步一致；`dsh_bot_ask` 隐藏会话与小组轮次会话既不长记忆也不出现在例程列表 | 本机用户 | browser + RPC | EVD-103 |

### 2.3 核心业务流程（步骤级交互脚本）

#### UF-101: 例程唤醒会话读到记忆

**前置状态**：两包合入；工作台已用「运维夜班」聊过一轮"我叫 Nothing"（记忆面板可见）；`routines.json` 为空。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 例程页签新建「报时」`@every 1m`，指令"报告时间并用名字称呼我" | 列表出现该条 | 写文件、arm | — |
| 2 | 等 ≤70s | 名册徽标 1；例程线程出现主动消息 | 到点 → 建例程会话（建会话链路注入「基础 + 记忆段 + 规范段」）→ 唤醒 → spoke | 消息里出现 Nothing |
| 3 | `cat env/.agent-presets/dsh-bot--<slug>/agent.cordis.yml` | — | — | persona 依次含基础文本、「你记得的事」、行为规范段 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 记忆为空 | 清空记忆后新建例程 | 主动消息不带名字 | 注入段无记忆行，规范段仍在 | 正常 |
| 唤醒 error | 模型凭据缺失 | 页签「上次：error」 | 记忆不受影响 | 修凭据 |

**界面状态机**：沿两子包各自 2.3（不重复）。

**入口接线清单**：例程包 `RoutinesPanel`「创建」→ 例程包 `ensureRoutineSession` → 记忆包 `injectMemory` 所在的建会话链路（`createOwnedSession`）。本包只核对接线存在，不新增。

#### UF-102: 主动消息可被记住，三段拼接稳定

**前置状态**：UF-101 完成，例程线程有一条主动消息。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 记录 `wc -l env/dsh-bot/memory/<id>/log.jsonl` | — | — | 基线 N 行 |
| 2 | 悬停主动消息，点「📌 记住这条」 | toast「已记住」，🧠 计数 +1 | `memoryRemember(source:'explicit')` | 面板日志段新增「你标记的」 |
| 3 | 再等一次唤醒（spoke） | 线程新消息 | 唤醒不登记 pendingExtract | `log.jsonl` 只比基线多 1 行（📌 那条） |
| 4 | 会话头「编辑人设」改一个字保存 | 提示"对新会话生效" | `rewritePresetPersona(基础 + 记忆段 + 规范段)` | `cat` preset：三段顺序不变、记忆段仍含 📌 内容 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 抽取被误触发 | 唤醒后 `log.jsonl` 多出自动行 | — | 违反 BR-103 | 回例程包 Task 5 修（唤醒不得走 `promptOwnedSession`） |
| 保存人设后记忆段丢失 | preset 只剩基础 + 规范段 | 新会话不记得 | 违反 BR-102 ① | 回例程包 Task 6 修组合函数 |

**界面状态机**：沿两子包 2.3。

**入口接线清单**：记忆包 `Transcript.tsx` 📌 动作；记忆包 `BotForm` 保存 → `updateBot` → 组合函数。本包只核对。

#### UF-103: 老路径全量抽验

**前置状态**：两包全部合入。

**成功主路径**：

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 官方会话调 `dsh_bot_ask` | 工具卡完成 | v1 链 | 答案返回；其隐藏会话不出现在记忆抽取会话或例程列表，`memory/` 无新增 |
| 2 | v2 双人设各自对话 + 草稿切换 | 隔离如旧 | v2 链 | 历史 / 口吻 / 草稿三隔离；各自记忆目录独立 |
| 3 | 老小组发「你们是谁？」 | 全员一轮各一句 | 三期链 | 与三期验收一致；成员轮次隐藏会话不长记忆、不进例程 |

**失败分支**：

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 隐藏会话被抽取 | `~dsh-bot:` 会话闭合后 `memory/` 增行 | — | 抽取钩子未按 owner 会话过滤 | 回记忆包 Task 6 |
| 小组成员会话进例程列表 | 例程页签出现成员会话 | — | `listOwnedSessions` 过滤破 | 回例程包 Task 5 |

**界面状态机**：沿 v1/v2/三期。

**入口接线清单**：v1 工具卡、工作台 roster、小组房间——既有入口，本包只复跑。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-101 | 子包互不回归：例程包合入后，记忆包 5.2 已过行为（自动记住 / 注入 / 忘记 / 📌 / 寒暄不记）保持；记忆包合入后 v1/v2/三期行为保持 | BR-102, UF-103 | Task 4 联合回放 + Task 5 抽验 |
| INV-102 | `bots.json.persona` 在任何注入或规范段追加后不变（它是真源，preset 文件是派生物） | BR-102 ① | Task 4 `diff` 前后 `bots.json` |
| INV-103 | 全局纪律：仍只有 :3084；邻仓 porcelain 干净（vibee 既有 `?? .vibee/` 除外）；`rg -i 'anysphere\|sand://' packages/` 为空；`env/dsh-bot/{memory,routines.json}` 不入 git | BR-105 | Task 5 终检 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-101 | screenshot+file | 唤醒消息含 Nothing；preset 三段快照 | `evidence/UF-101/` |
| EVD-102 | screenshot+file | 📌 后面板；`log.jsonl` 前后 `wc`；保存人设后 preset 快照 | `evidence/UF-102/` |
| EVD-103 | screenshot+log | v1/v2/三期三条主路径复跑对比 + `memory/` 目录树 | `evidence/UF-103/` |
| EVD-104 | log | 两子包二次校验输出 + 最终四命令输出 + 总报告 | `evidence/phase-final/` |

### 2.6 角色与权限矩阵

单一本机用户，loopback，无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 依赖失败 | 记忆包 Task 3（组合函数）阻塞 | 例程包 Task 6 开工 | 按 BR-101 降级为「基础 + 规范段」，备注写明；母包报告写明 | EVD-104 |
| 旧数据兼容 | 升级前已有 bot 无 memory 目录、无 routines.json | 首次启动与首轮闭合 | 两包各自懒创建，不报错 | EVD-103 |
| 破坏性 | 删除一个 bot | — | memory 目录删除、其例程 `enabled=false` 并跳过、例程会话保留 | EVD-103 |

### 2.8 非目标

- 不重复子包执行矩阵；不在母包新增产品功能。
- bot 互发消息（`[agent]` 唤醒）、广播、外部事件监听、token 流式、名册置顶 / 分组 / 隐藏、跨 bot 共享记忆分片——后续包（`dsh-bot-peers`、`dsh-bot-live-transcript`、`dsh-bot-memory-v2`）。
- 搁置中的 `../dsh-bot-native-surface/spec.md` 不在本母包范围。

---
## 3. 技术方案

### 3.1 架构 Before / After

```text
Before:
两个子包各自独立可执行；共享面（persona 组合 / isPlatformInjection / 会话头 pill / routes）无人协调

After:
母包 → 顺序：memory(全部) → routines(全部) → 联合回放 → 终检
       共享面规约：persona = 基础 + 记忆段 + 规范段（单一组合函数，记忆包建、例程包叠）
                   isPlatformInjection 两处加法；会话头 🧠 在 ⏰ 左；routes case 各自成段
       抽取边界：例程唤醒不触发抽取；📌 仍可记；唤醒会话照常注入
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| 本包 | 编排 + 联合验收 | 不改产品代码 |
| `../dsh-bot-memory/` | 记忆 | 按其 tasks.csv 执行 |
| `../dsh-bot-routines/` | 例程 | 按其 tasks.csv 执行，Task 6 只在记忆包组合函数上追加规范段 |

### 3.3 三段式定位清单

> 母包只定位子包 spec 与共享文件 symbol；全部 anchor 于 2026-09-06 用 `rg -c` 核验命中。

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `docs/dsh-bot-memory/spec.md` | 组合函数任务 | `rg "rewritePresetPersona" docs/dsh-bot-memory/spec.md` | — | 记忆包 Task 3 |
| `docs/dsh-bot-routines/spec.md` | 规范段任务 | `rg "renderBehaviorSection" docs/dsh-bot-routines/spec.md` | — | 例程包 Task 6 |
| `docs/dsh-bot-memory/tasks.csv` | 状态板 | `rg "P0:校准" docs/dsh-bot-memory/tasks.csv` | L2 | Task 2 推进依据 |
| `docs/dsh-bot-routines/tasks.csv` | 状态板 | `rg "P0:校准" docs/dsh-bot-routines/tasks.csv` | L2 | Task 3 推进依据 |
| `packages/dsh-bot-host/src/bots.ts` | `export function replacePersonaText` | `rg "export function replacePersonaText" packages/dsh-bot-host/src/bots.ts` | L195 | 共享面 ① |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export function isPlatformInjection` | `rg "export function isPlatformInjection" packages/dsh-bot-host/src/workbench-sessions.ts` | L161 | 共享面 ② |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | `export async function promptOwnedSession` | `rg "export async function promptOwnedSession" packages/dsh-bot-host/src/workbench-sessions.ts` | L484 | 抽取钩子唯一挂点（BR-103） |
| `packages/dsh-bot-host/src/workbench-routes.ts` | `listBotSessions` case | `rg "listBotSessions" packages/dsh-bot-host/src/workbench-routes.ts` | L177-227 | 共享面 ④ |
| `packages/workbench-ui/src/Conversation.tsx` | `conversationHead` | `rg "conversationHead" packages/workbench-ui/src/Conversation.tsx` | L400 | 共享面 ③ |
| `packages/workbench-ui/src/Transcript.tsx` | `showAuthor` | `rg "showAuthor" packages/workbench-ui/src/Transcript.tsx` | L205 | 📌 与「主动」标签同一动作栏 |

### 3.4 API / 数据 / 权限 / 路由影响

均无母包自身影响——全部影响由子包各自 3.4 承担。

---

## 4. Phase 计划与任务详情

```text
P0 前置检查(1) → P1 记忆包全量(2) → P2 例程包全量(3) → P3 联合验收(4) → 收尾(5)
```

> 实现任务 < 8 → 用下方内嵌状态表，不生成 tasks.csv。

### 内嵌状态表

| 序号 | 任务 | 前置 | 验证命令 | 状态 | 备注 |
|---|---|---|---|---|---|
| 1 | 前置检查与共享面基线 | 无 | `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-memory --repo .` 与 `... docs/dsh-bot-routines --repo .` 均 0 FAIL；`git status --porcelain packages/` 记录基线 | 已完成 | 豁免回归:P0 单实现任务；见 evidence/phase-final/baseline.md |
| 2 | 执行子包 dsh-bot-memory 全量 | 1 | 其 tasks.csv 13 条全部已完成（或诚实已阻塞）且其 validate 0 FAIL | 已完成 | 诚实已阻塞见其子 CSV；validate 0 FAIL / 1 WARN |
| 3 | 执行子包 dsh-bot-routines 全量 | 2 | 其 tasks.csv 14 条全部已完成（或诚实已阻塞）且其 validate 0 FAIL | 已完成 | 诚实已阻塞见其子 CSV；validate 0 FAIL / 1 WARN |
| 4 | 执行 spec 5.2 真实场景全套测试（跨包联合回放） | 3 | 5.2 执行矩阵 UF-101~103 全行通过并落 evidence | 已阻塞:grok-4.6 503 无唤醒发言 | 三段 compose 已证；见 evidence/phase-final/report.md |
| 5 | 执行母包总回归验证（收尾） | 4 | `pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` 全绿 + INV-103 命令干净 + 总报告落盘 | 已阻塞:tsc SessionId brand + pnpm frozen lockfile | 红线空；三包 validate 0 FAIL；报告已落盘 |

### Phase 0: 前置检查

### Task 1: 前置检查与共享面基线

- **关联**：BR-101 / BR-105 / ASM-110 / EVD-104 / UF NA
- **前置任务**：无
- **风险等级**：P0

**具体操作**：

1. 两子包 `validate_package.py --repo .` 均 0 FAIL；记录输出到 `evidence/phase-final/pre-validate.log`。
2. `git status --porcelain packages/` 与 `git log --oneline -1` 记入 `evidence/phase-final/baseline.md`，作为 Task 3 开工前 diff 核对的起点。
3. 核 :3084 身份（`~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084`）。

**验证**：两次 validate 均 0 FAIL；`ls evidence/phase-final/baseline.md`

**Evidence**：`evidence/phase-final/`

### Phase 1: 记忆包

### Task 2: 执行子包 dsh-bot-memory 全量

- **关联**：BR-101 / BR-102 / INV-101 / INV-102
- **前置任务**：1

**具体操作**：按 `../dsh-bot-memory/spec.md` §4 与其 tasks.csv 逐条推进（其 Task 1 真机校准不得跳过）；每 Phase 按其纪律 commit；结束时读其 `evidence/phase-0/calibration.md`，若代际规则被证伪，按 ASM-110 立即回本包 §1.5 记变更并暂停 Task 3。

**验证**：其 tasks.csv 13 条全部「已完成」或「已阻塞:原因」；`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-memory --repo .` → 0 FAIL；`豁免回归:单任务 Phase，回归即子包自身收尾任务`

**Evidence**：子包 `../dsh-bot-memory/evidence/`；本包 `evidence/phase-final/memory-board.md`（板面快照）

### Phase 2: 例程包

### Task 3: 执行子包 dsh-bot-routines 全量

- **关联**：BR-101 / BR-102 / BR-103 / INV-101
- **前置任务**：2

**具体操作**：

1. 开工前：`git diff <baseline>..HEAD -- packages/dsh-bot-host/src/bots.ts packages/dsh-bot-host/src/workbench-sessions.ts` 确认记忆包的组合函数与 `isPlatformInjection` 改动在位；例程包 Task 6 **只在该组合函数上追加规范段**。
2. 按 `../dsh-bot-routines/spec.md` §4 推进；其 Task 5 的唤醒投递必须直接 `sessionTool.write`，不经 `promptOwnedSession`（BR-103）。
3. 记忆包 Task 3 若阻塞：例程包 Task 6 降级为「基础 + 规范段」，备注写明。

**验证**：其 tasks.csv 14 条全部「已完成」或「已阻塞:原因」；validate 0 FAIL；`豁免回归:单任务 Phase，回归即子包自身收尾任务`

**Evidence**：子包 `../dsh-bot-routines/evidence/`；本包 `evidence/phase-final/routines-board.md`

### Phase 3: 联合验收与收尾

### Task 4: 执行 spec 5.2 真实场景全套测试（跨包联合回放）

- **关联**：UF-101 / UF-102 / UF-103 / INV-101 / INV-102
- **前置任务**：3

**验证**：按 5.2 执行矩阵逐行回放，全部通过；`diff` 前后 `bots.json` 无 persona 变化

**Evidence**：`evidence/UF-101/` ~ `evidence/UF-103/`

### Task 5: 执行母包总回归验证（收尾）

- **关联**：BR-104 / BR-105 / INV-103
- **前置任务**：4

**验证**：`pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` → 全绿；`rg -i 'anysphere|sand://' packages/ env/ scripts/` → 空；`git status --porcelain | rg "env/dsh-bot"` → 空；三邻仓 `git status --porcelain` 干净；两子包 validate 二次运行 0 FAIL（证据审计）；`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-living-master --repo .` → 0 FAIL；总报告 `evidence/phase-final/report.md` 写明每个子包完成/止损点

**Evidence**：`evidence/phase-final/final-commands.log`、`evidence/phase-final/report.md`

---

## 5. 验收与 Review 协议

> **验收铁律：命令级验证（5.1）通过只是入场券，不是完成。** 母包完成 = 两子包 5.2 全过 + 本包 5.2 联合回放全过。

### 5.1 命令级验证（入场券）

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 四命令 | `pnpm run typecheck && pnpm run build && pnpm test && pnpm run standard:check` | 全绿 | EVD-104 |
| 子包校验 ×2（二次运行，含证据审计） | `python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-memory --repo .`；同命令对 `docs/dsh-bot-routines` | 0 FAIL | EVD-104 |
| 红线 | `rg -i 'anysphere\|sand://' packages/ env/ scripts/` | 空 | EVD-104 |
| 数据不入 git | `git status --porcelain \| rg "env/dsh-bot"` | 空 | EVD-104 |

### 5.2 真实场景全套测试（Real-Run，跨包联合回放）

**环境准备**：

| 项 | 值 |
|---|---|
| 启动命令 | `pnpm install && pnpm run build && sh env/setup.sh && sh env/boot.sh`（loopback :3084；先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份） |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui`；官方 GUI `http://127.0.0.1:3084`（UF-103 v1 委托用） |
| 测试账号/数据 | 本机单用户；人设「运维夜班」「校对阿宁」「诗人小北」与一个老小组（三期建）；测试前清空 `env/dsh-bot/memory/<运维夜班 id>/` 与 `env/dsh-bot/routines.json` |
| 干净状态定义 | 每条 UF 前刷新页面；UF-101 前先用工作台聊一轮"我叫 Nothing"让记忆到位 |
| 可用测试工具 | Playwright（`../../dsh-genoffice/engine/node_modules/playwright`，`channel:'chrome'`）；`cat` / `wc` / `diff` 核文件；RPC 用 curl；等待触发用 `@every 1m` 或例程包 `routineRunNow` RPC |

**执行矩阵**：

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-101 主路径 | browser + cat | 2.3 UF-101 步骤 1-3 | 唤醒消息含 Nothing；preset persona 三段顺序 | `evidence/UF-101/wake-with-name.png`、`evidence/UF-101/cordis-three-sections.yml` |
| UF-101 失败分支 记忆为空 | browser + cat | 清空记忆后新建例程 | 消息无名字；规范段仍在 | `evidence/UF-101/wake-no-memory.png` |
| UF-102 主路径 | browser + cat | 2.3 UF-102 步骤 1-4 | 📌 后日志段新增；再次唤醒后 `log.jsonl` 只多 1 行；保存人设后三段不变 | `evidence/UF-102/pinned.png`、`evidence/UF-102/log-wc-before-after.txt`、`evidence/UF-102/cordis-after-edit.yml` |
| UF-102 失败分支 抽取误触发 | cat | 唤醒后 `log.jsonl` 出现 `source:'auto'` 新行 | 判为失败 → 回例程包 Task 5 | `evidence/UF-102/log-wc-before-after.txt` |
| UF-103 主路径 | browser + RPC | 2.3 UF-103 步骤 1-3 | v1/v2/三期三条一致；`ls -R env/dsh-bot/memory` 无隐藏/轮次会话痕迹；例程页签无成员会话 | `evidence/UF-103/v1-ask.png`、`evidence/UF-103/v2-isolation.png`、`evidence/UF-103/group-round.png`、`evidence/UF-103/memory-tree.txt` |
| UF-103 失败分支 删除 bot | browser + cat | 删一个带例程的 bot | memory 目录消失；其例程 `enabled=false`；例程会话仍在官方列表 | `evidence/UF-103/delete-bot.md` |

**通过标准**：执行矩阵全部行通过且 evidence 齐全；任一行失败 → 回对应子包任务修复后重跑。

### 5.3 Evidence 目录结构与命名

```text
evidence/
  phase-final/   pre-validate.log baseline.md memory-board.md routines-board.md final-commands.log report.md
  UF-101/ ~ UF-103/
```

### 5.4 Review 专项检查清单

- [ ] 只有一个 persona 组合函数，拼接顺序「基础 + 记忆段 + 规范段」（BR-102 ①）
- [ ] 例程唤醒不经 `promptOwnedSession`、不触发抽取（BR-103）
- [ ] `bots.json.persona` 前后一致（INV-102）
- [ ] 会话头 🧠 在 ⏰ 左，无新增独立定时器（BR-102 ③）
- [ ] 报告写明每个子包的完成/止损点，无"全部完成"式概括（BR-104）
- [ ] 两子包二次 validate（证据审计）0 FAIL