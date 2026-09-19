# DSH Bot 项目调研

日期：2026-09-13。范围：本仓源码、manifest、env、docs、测试与 `work/` 冒烟记录。依据是仓库内的一手材料，不是外部二手介绍。

对照：当前代码优先于 README；两者冲突处单独标出。

---

## 1. 这是什么

`dsh-bot` 是跑在本机 DeepSeek Harness 上的插件：常驻多人设对话 agent + 任意 agent 可调的委托工具 + 自己的工作台。人设存在插件配置里，不是 DSH `agentPreset`；模型跟随 DSH 配置，可 bot 专属 override。会话经邻仓 session-tool 管理，标记 `kind:dsh-bot`。本仓独占 loopback **3084**、profile **`gb`**，平台包钉 `@deepseek-ai/dsh@0.1.5-rc.1`。GitHub 仓名 `Nothing1024/dsh-bot`；本机目录仍是 `dsh-grok-bot/plugin`。

来源：[`README.md` L1–7](../README.md)、[`package.json` L1–5](../package.json)、[`packages/dsh-bot-host/src/index.ts` L1–6](../packages/dsh-bot-host/src/index.ts)。

---

## 2. 架构

### 2.1 一口一仓

| 谁 | profile | 口 | DSH 包 | `DSH_HOME` |
|---|---|---|---|---|
| 官方 `dsh web` / dsh-genoffice | 默认 / `go` | 3080 | 随官方 / `0.1.0-rc.7` | `~/.dsh` / genoffice env |
| session-tool | `st` | 3081 | `0.1.5-rc.1` | session-tool env |
| vibee | `vb` | 3083 | `0.1.0-rc.7` | vibee env |
| **本仓** | **`gb`** | **3084** | **`0.1.5-rc.1`** | **本仓 `env/`** |

来源：[`README.md` L9–17](../README.md)、[`env/boot.sh` L11–12, L45](../env/boot.sh)、[`standards/host-descriptor.json`](../standards/host-descriptor.json)。

`boot.sh` 会核对监听进程的 `DSH_HOME` 是本仓 `env/`；口被别人占着会失败，不会偷偷打过去（[`env/boot.sh` L41–44](../env/boot.sh)）。

### 2.2 五个包

| 包 | 角色 | 可挂载？ |
|---|---|---|
| `dsh-bot-host` | `ctx.dshBot` 服务：ask / 人设 / 小组 / 记忆 / 例程 / 同事 / HTTP | 否。由 `tool-dsh-bot` 的 cordis patch insert |
| `tool-dsh-bot` | 模型工具 `dsh_bot_ask`、`dsh_bot_send` | 是。官方 `dsh.plugin.json` + 社区 `dsh-plugin.json` |
| `ui-dsh-bot` | 浏览器半身：官方壳座位 / 工作台嵌入 | 是。host apply 为空；client 走 `dsh.client` |
| `workbench-ui` | 工作台 SPA（React）。`GET /dsh-bot/ui` 静态服务，也可 embedded 进官方 main | 否。无 manifest |
| `dsh-bot-shared` | roster / avatar / session-binding / RPC 类型 | 否。给两个 UI 包共用 |

来源：各包 `package.json`、[`standards/README.md` L21–29](../standards/README.md)、[`packages/tool-dsh-bot/cordis.patch.yml`](../packages/tool-dsh-bot/cordis.patch.yml)、[`packages/ui-dsh-bot/src/index.ts`](../packages/ui-dsh-bot/src/index.ts)。

workspace 还链邻仓 session-tool 三包（[`pnpm-workspace.yaml` L1–5](../pnpm-workspace.yaml)）。gb profile bundles：`dsh-base`、`dsh-web-app`、`dsh-better-sidebar@0.19.1`、`tool-session`、`tool-dsh-bot`、`ui-dsh-bot`（[`env/profiles/gb/package.json` L17–27](../env/profiles/gb/package.json)）。

### 2.3 运行时接线

```
dsh web --profile gb --port 3084   (DSH_HOME=env/)
  ├─ tool-session     → ctx.sessionTool + marks.jsonl
  ├─ tool-dsh-bot     → insert dsh-bot-host → ctx.dshBot
  │                     register dsh_bot_ask / dsh_bot_send
  ├─ ui-dsh-bot       → client apply：slots 座位 + 工作台嵌入
  └─ dsh-bot-host     → POST /dsh-bot/<method> + GET /dsh-bot/ui + GET /dsh-bot/events
                         人设注入：agents pre-step 优先，否则 wrapPrompt
```

会话 I/O **只走** `ctx.sessionTool`（BR-003，[`packages/dsh-bot-host/src/index.ts` L3](../packages/dsh-bot-host/src/index.ts)、[`packages/dsh-bot-host/src/platform.ts` L1–5](../packages/dsh-bot-host/src/platform.ts)）。模型 override 走 `session.selectModel`；归档走 `workspaceRegistry`。

人设不是 DSH preset。创建会话时把基础人设冻到 `$DSH_HOME/dsh-bot/session-voice/<sessionId>.txt`；发送时合成 memory + behavior。生产有 `ctx.agents` 时走 plugin-source reminder，避免官方把 persona 当成用户消息（[`session-voice.ts`](../packages/dsh-bot-host/src/session-voice.ts)、[`session-voice-inject.ts`](../packages/dsh-bot-host/src/session-voice-inject.ts)）。

---

## 3. 产品面

### 3.1 入口（文档合同 vs 当前代码）

README / left-tab 归档合同写的是三入口：

1. 浏览器直开 `http://127.0.0.1:3084/dsh-bot/ui`
2. 右栏 better-sidebar 页签 `dsh-bot:sessions` → iframe `/dsh-bot/ui`
3. 左栏底栏「Bot」→ 原生人名册 → 点人设 `sessions.open` **官方中栏**；小组仍走右栏 iframe

来源：[`README.md` L65–77](../README.md)、[`docs/remaining-prd-decision.md` L9–11](remaining-prd-decision.md)、[`docs/archive/dsh-bot-left-tab/`](archive/dsh-bot-left-tab/)。

**当前 `ui-dsh-bot` 的 `apply()` 已经不是这条合同。** [`packages/ui-dsh-bot/src/client/index.ts`](../packages/ui-dsh-bot/src/client/index.ts)：

- `sidebar.workspaces`：工作台 roster 的 portal 座位（`WorkbenchRoster`）
- `main` 面板 `dsh-bot`：直接 `<App rosterTarget={target} />`（`workbench-ui/embedded`）
- `sidebar.panellist`：顶栏「会话 / Bot」两个导航项
- **没有**注册 `DshBotTab` iframe，**没有**挂 `BoundBotRegion` / `IdentityBar` / `ModeFooterAction`

`work/bot-production-smoke.mjs` 也按「原生 main panel、零 Bot iframe」验收（L38–40，结果见 `work/bot-production-smoke-result.json`）。

left-tab 组件仍在源码和测试里（`BoundRoster.tsx`、`BotRoster.tsx`、`IdentityBar.tsx`、`DshBotTab.tsx`、`select-bot.ts`），但 client `apply()` 不再引用它们。`DshBotTab` 仍能把 `/dsh-bot/ui` 嵌进 iframe，只是当前入口没把它装上。

结论：**产品主面正在从「左栏名册 + 官方中栏 + 右栏 iframe」迁到「官方壳里嵌工作台 SPA」。文档没跟上。** 2026-09-13 的 UI 反馈交接仍按 left-tab 合同写（[`docs/ui-feedback-triage.md` L11–18](ui-feedback-triage.md)）。

### 3.2 工具

| 工具 | 行为 |
|---|---|
| `dsh_bot_ask` | 隐藏委托会话（标题 `~dsh-bot: `，`kind:hidden`），等 idle 后返回 `{session_id, answer}`。空答案 fail loud（BR-007） |
| `dsh_bot_send` | 异步捎话给名册里另一个 bot。立刻 `{accepted:true}`，不等对方说完。每 bot 每分钟最多 3 条 |

来源：[`packages/tool-dsh-bot/src/index.ts`](../packages/tool-dsh-bot/src/index.ts)、[`packages/dsh-bot-host/src/ask.ts` L1–5](../packages/dsh-bot-host/src/ask.ts)、[`packages/dsh-bot-host/src/peers.ts` L12–13](../packages/dsh-bot-host/src/peers.ts)。

`askBot` 固定用种子 bot `dsh-bot` 的人设（[`index.ts` L411–420](../packages/dsh-bot-host/src/index.ts)）。

### 3.3 人设 / 名册 / 小组

- 人设 CRUD 写 `$DSH_HOME/dsh-bot/bots.json`。种子 id `dsh-bot` 不可删。`presetId` 只是遗留 GUI 对账别名（`dsh-bot` / `dsh-bot--<id>`），不再对应 `.agent-presets/`（[`bots.ts` L1–5, L15–28, L174–180](../packages/dsh-bot-host/src/bots.ts)）。
- 名册默认三组：置顶 / 工作 / 生活。布局在 `bots.json` 字段 + `roster.json`（[`roster-layout.ts`](../packages/dsh-bot-host/src/roster-layout.ts)）。
- 小组 2–6 个已有 1:1 人设，记在 `groups.json`。房间是插件自己的 jsonl，不是官方 session。成员发言走隐藏会话 `~dsh-bot-group:`（[`groups.ts` L1–4, L15–16](../packages/dsh-bot-host/src/groups.ts)、[`group-engine.ts` L1–7](../packages/dsh-bot-host/src/group-engine.ts)）。
- 一轮语义：用户一句 → 成员按名单串行各一句；空回复 / `(pass)` 跳过。`@名` 点名；对不上 toast「未匹配成员,已发给全员」。**没有多轮开会**（`runGroupRound` 永远一轮，[`group-engine.ts` L318–400](../packages/dsh-bot-host/src/group-engine.ts)）。

### 3.4 记忆 / 例程 / 同事 / 实时

- **记忆**：`$DSH_HOME/dsh-bot/memory/<botId>/{profile.md,log.jsonl}`。轮次闭合后自动抽取；寒暄不记。settings `dsh-bot.memory.enabled` 可关（[`memory.ts`](../packages/dsh-bot-host/src/memory.ts)、[`index.ts` L255–256, L798–800](../packages/dsh-bot-host/src/index.ts)）。
- **例程**：`$DSH_HOME/dsh-bot/routines.json`。到点在「例程 · 名称」线程叫醒；`(silent)` 不上屏。隐藏不停止例程。
- **同事**：`dsh_bot_send` → `peers.jsonl`。收件人会话标题「来自 \<发件人名\>」；静默回复不写回发件人当前会话。
- **SSE**：`GET /dsh-bot/events` 转发 mux/host 里带 `bot:` / `group-room:` 的帧，并推 `bot/status`（[`bot-events.ts`](../packages/dsh-bot-host/src/bot-events.ts)）。工作台工作中输入框不灰；发送键变「停止」；回车仍可 `sessions.prompt({mode:'queue'})`。

### 3.5 模型

- UF-005：跟随 DSH `agent-default-model` + 官方设置。插件不写厂商适配器。
- UF-006：settings `dsh-bot.model` `{provider, model, reasoningEffort?}`。空 ⇒ 跟全局；非空 ⇒ **仅本插件创建的会话**在首次投递前 `selectModel`。指向未注册路由或缺凭据 fail loud，禁止静默回落。
- 边界：官方 GUI「+ 新会话」不受 override 影响。

来源：[`README.md` L136–140](../README.md)、[`ask.ts` L95–111](../packages/dsh-bot-host/src/ask.ts)、[`index.ts` L244–256](../packages/dsh-bot-host/src/index.ts)。

---

## 4. 数据存放（全部在 `$DSH_HOME`，git 忽略 `env/dsh-bot/`）

| 路径 | 内容 |
|---|---|
| `dsh-bot/bots.json` | 人设注册表 |
| `dsh-bot/groups.json` | 小组成员名单 |
| `dsh-bot/rooms.json` + `dsh-bot/rooms/<roomId>.jsonl` | 小组房间索引与消息 |
| `dsh-bot/routines.json` | 例程 |
| `dsh-bot/peers.jsonl` | 同事投递日志 |
| `dsh-bot/roster.json` | 名册分组标题 |
| `dsh-bot/memory/<botId>/profile.md` + `log.jsonl` | 跨会话记忆 |
| `dsh-bot/session-voice/<sessionId>.txt` | 创建时冻结的基础人设 |
| `session-tool/marks.jsonl` | `kind:dsh-bot`、`bot:<id>`、`kind:hidden`、`group:`、`group-room:`、`peer:`、`routine:` |
| `sessions/` | 官方会话投影。删人设不删历史会话 |

来源：[`env/README.md` L56–63](../env/README.md)、[`.gitignore` L14](../.gitignore)、[`marks.ts`](../packages/dsh-bot-host/src/marks.ts)。

HTTP 面：`POST /dsh-bot/<method>` 用 `{args}`；应用错误仍 HTTP 200 + `{ok:false,error}`（[`routes.ts` L134–161](../packages/dsh-bot-host/src/routes.ts)）。v1 保留 `listSessions` / `createSession`；工作台方法在 `dispatchWorkbenchApi`（[`workbench-routes.ts` L206+](../packages/dsh-bot-host/src/workbench-routes.ts)）。静态页 `GET /dsh-bot/ui` 最长前缀优先。

---

## 5. 非目标与红线

README「非目标与 BR-006」：

- 不做：模型厂商绑定 / 自写适配器、参考产品 MCP 连接器、Docker 沙箱、多 provider Router、桌面 Electron/VNC。
- 参考树 `../reference` **只读**：不拷代码、文案、品牌。仓内不得出现 `com.anysphere.sand`、`sand://`、上游 DSN / Statsig key / OAuth client id。
- 不改官方 npm 包与邻仓；一口一仓 :3084；运行数据不入 git。

来源：[`README.md` L141–145](../README.md)、[`docs/archive/dsh-bot-mvp/spec.md` BR-006](archive/dsh-bot-mvp/spec.md)。

社区标准：对齐 dsh-community-standard v0.15 的静态声明面。私有坐标用 `x-nothing1024.*`。已知缺口：RFC 0002（client facet 不可声明）、RFC 0003（插件间 service 不能写 `provides`）。`pnpm run standard:check` = `node standards/validate.mjs`。

---

## 6. 交付状态

`docs/` **没有活跃 PRD 包**。16 个任务包 2026-09-13 全部进 `archive/`（[`docs/README.md` L5](README.md)）。

### 已验收（合同仍有效）

mvp、workbench（18/19，T18 后关单）、group-chat、memory、routines、living-master、live-transcript、peers、roster、alive-master、native-experience、left-tab（23/23）。

### 明确未做 / 搁置

| 项 | 状态 |
|---|---|
| session-nav T5–T14（收纳 / 自动起题 / overview） | 未做；与 left-tab 冲突，决策建议砍 |
| group-rounds 0/15 | **产品缺口**：小组仍是一轮广播 |
| interaction-master 0/5 | 子包不定，挂起 |
| native-surface Deferred 0/14 | 搁置 |

收口依据：[`docs/remaining-prd-decision.md`](remaining-prd-decision.md)。

即使不做多轮，决策简报仍标这些三期缺口：房间标题占位 `房间 {id 前 8 位}`、roster 小组 `working: false` 写死、错误行无单成员重试、回复 pill 不改回应者。源码仍在：

- [`packages/workbench-ui/src/App.tsx` L307–315](../packages/workbench-ui/src/App.tsx) `working: false`
- [`packages/workbench-ui/src/Conversation.tsx` L124](../packages/workbench-ui/src/Conversation.tsx) 同类映射

### 2026-09-13 UI 反馈（未当作已修）

[`docs/ui-feedback-triage.md`](ui-feedback-triage.md) 是交接，不是修复报告。P0 五条里：

- P0-1：左 Bot 点人设后中栏不可发送（left-tab 主链；若主面已迁工作台，这条的复现入口变了）
- P0-2：左栏没有独立 composer — 按 left-tab 合同这是预期
- P0-3：多入口状态分裂、分类后列表空
- P0-4：设置 → 模型「settings are unavailable in this browser」— 更像 Harness / 非安全上下文
- P0-5：侧边对话 `crypto.randomUUID` 崩溃 — 定位 better-sidebar 0.19.1，LAN HTTP 非 secure context

同日还有 `work/bot-production-smoke-result.json`：临时人设 + 小组在**原生 main panel**上过一轮真实收发。两份材料描述的产品面不一致。

---

## 7. 怎么跑 / 测

```sh
pnpm install && pnpm run build
sh env/setup.sh
sh env/boot.sh                 # :3084；已起且身份对本仓则退出
pnpm test
pnpm run typecheck
pnpm run standard:check
bash scripts/manual-test.sh                 # 含模型写入
bash scripts/manual-test.sh --no-write      # 仍会建会话 / 人设 / 小组，不是只读
```

前台：http://127.0.0.1:3084  
工作台：http://127.0.0.1:3084/dsh-bot/ui

CLI 一律 `--profile headless --patch env/cli.patch.yml`。矩阵先核网关 `DSH_HOME`。UF-004 标记查询不 boot，直读 `env/session-tool/marks.jsonl`。

调试：

```sh
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh 3084 pluginInventory/list
```

`env/setup.sh` 会从 `~/.dsh/.env` 拷 key，settings 优先从邻仓 session-tool env 拷。凭据 git 忽略。

---

## 8. 关键源文件

| 路径 | 干什么 |
|---|---|
| `packages/dsh-bot-host/src/index.ts` | `ctx.dshBot` 服务本体 |
| `packages/dsh-bot-host/src/ask.ts` | 委托 create → marks → override → write → wait → read |
| `packages/dsh-bot-host/src/bots.ts` | 人设注册表 |
| `packages/dsh-bot-host/src/groups.ts` / `group-engine.ts` | 小组 + 一轮引擎 |
| `packages/dsh-bot-host/src/workbench-sessions.ts` | 工作台 1:1 会话链 |
| `packages/dsh-bot-host/src/routes.ts` / `workbench-routes.ts` / `bot-events.ts` | HTTP / SSE |
| `packages/dsh-bot-host/src/memory.ts` / `routines.ts` / `peers.ts` | 记忆 / 例程 / 同事 |
| `packages/dsh-bot-host/src/session-voice.ts` / `session-voice-inject.ts` | 人设包装与注入 |
| `packages/dsh-bot-host/src/marks.ts` | 标记约定 |
| `packages/tool-dsh-bot/src/index.ts` | 两个模型工具 |
| `packages/ui-dsh-bot/src/client/index.ts` | **当前** client 入口（工作台嵌入） |
| `packages/ui-dsh-bot/src/client/BoundRoster.tsx` 等 | left-tab 实现，apply 未挂 |
| `packages/ui-dsh-bot/src/client/DshBotTab.tsx` | 右栏 iframe 实现，apply 未挂 |
| `packages/workbench-ui/src/App.tsx` | 工作台壳 |
| `packages/workbench-ui/src/main.tsx` | 直开 `/dsh-bot/ui` 入口 |
| `env/boot.sh` / `env/setup.sh` / `env/profiles/gb/` | 部署 |
| `standards/` | 社区标准静态面 |
| `docs/archive/` | 已交付 / 搁置合同 |

---

## 9. 风险与未决（带出处）

1. **文档与入口分叉（最大）。** README / remaining-prd-decision / ui-feedback-triage 仍写 left-tab（左名册 + 官方中栏 + 右 iframe）。`client/index.ts` 把工作台嵌进官方 main，smoke 还断言零 iframe。下游若按旧合同修 P0-1「中栏不可发送」，可能改错面。

2. **两套 UI 并存。** `BoundRoster` / `IdentityBar` / `DshBotTab` / `ModeFooterAction` 有完整测试，但 `apply()` 不用。维护成本高，也容易让人以为 left-tab 仍是主路径。

3. **两份 `inject`。** [`client/index.ts` L17](../packages/ui-dsh-bot/src/client/index.ts) 是 `['sessions','locale','slots','layout']`；[`client/inject.ts` L6](../packages/ui-dsh-bot/src/client/inject.ts) 是 `['sessions','locale','slots']`。测试读的是后者（[`apply-sidebar.spec.ts` L10](../packages/ui-dsh-bot/tests/apply-sidebar.spec.ts)），测不到真实 apply。

4. **小组 working 假值。** `App.tsx` L315 把每个房间写成 `working: false`。选中房间的 history 才有 `roundTracker.working`（[`index.ts` L571–577](../packages/dsh-bot-host/src/index.ts)）。名册上看不见小组在忙。

5. **小组仍是一轮广播。** `runGroupRound` 用户一句成员各一句就结束（[`group-engine.ts` L318–400](../packages/dsh-bot-host/src/group-engine.ts)）。多轮 / 继续讨论 / 轮内排队未做。回复 pill 不进 `parseMentions`（决策简报 BR-505）。

6. **`createOwnedSession` 默认 cwd。** HTTP 侧 `defaultCreateCwd()` = `dirname(DSH_HOME)`（仓根）或 `process.cwd()`（[`routes.ts` L88–92](../packages/dsh-bot-host/src/routes.ts)）。triage 已指出：传了 cwd ≠ 工作区已绑定。P0-1 的「探索未至之境」空态仍可能从这里来。

7. **LAN / 非 secure context。** P0-4、P0-5 更像 Harness / better-sidebar 在 `http://192.168.x` 上缺 `crypto.randomUUID` / settings bridge。本仓改模型路由解决不了。

8. **typecheck 旧债。** triage L284：上一轮 `pnpm test` 439/439、`standard:check` 过，但 `typecheck` 报 `bot-events.spec.ts:192` TS2769、`bots.spec.ts:16` TS6133。本次未重跑。

9. **vitest 注释过期。** [`vitest.config.ts` L9–10](../vitest.config.ts) 仍写平台 pin `0.1.1-rc.2` / cordis `4.0.1`；workspace 实际是 DSH `0.1.5-rc.1`、cordis `4.0.2`。

10. **`settings.example.yaml` 带私有代理 baseURL**（`panpanpan.59188888.xyz`）。入 git 的是模板不是 key，但仍是环境细节外泄。live `settings.yaml` git 忽略。

11. **测试残留。** triage §8：环境里可能还留着 `DSH Bot (1)`、`【UI测试】*`、`yanshou-linshi-bot-0913` 等。`work/bot-production-smoke-result.json` 记了这次验收用的 bot/group/session id。

12. **社区标准缺口。** ui-dsh-bot 浏览器半身在 v0.15 不能声明 client facet；`ctx.dshBot` / `ctx.sessionTool` 的提供关系只能写在 Host Descriptor。

---

## 10. 一句话判断

后端合同（人设、委托、标记、记忆、例程、同事、一轮小组、SSE）已经按归档 PRD 落地，host 是单一事实源。前端主路径 2026-09-13 前后从 left-tab 迁到了官方壳内嵌工作台，文档和 UI 反馈仍按旧合同说话。下一步先拍板「主面到底是哪套」，再决定是补文档、拆掉死代码，还是把 left-tab 接回去。小组多轮仍然没做。
