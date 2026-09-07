# Phase 0 校准：ASM-601~605

日期：2026-09-08  
网关：`127.0.0.1:3084` pid 重启后 `83702`，`DSH_HOME=.../dsh-grok-bot/plugin/env`，`fiberPhase=active`（`pluginInventory/list` → `include:ui-dsh-bot`）。

## 基线命令

见同目录 `commands.log`：

- `pnpm run typecheck` → EXIT 0
- `./node_modules/.bin/vitest run packages/ui-dsh-bot/tests` → 4 files / 28 tests passed
- `pnpm --filter ui-dsh-bot run build` → tsdown + purity 通过

## ASM 结论

| ID | 结论 | 证据 |
|---|---|---|
| ASM-601 | **证实** | `inject` 加 `'slots'` 后 fiber 非 PENDING。`console.info('[spike] slots.snapshot', snapshot)` 可读；`sidebar.footer.action` 出现 `id: 'dsh-bot:mode'`；底栏「Bot」行可见。 |
| ASM-602 | **证实** | `localStorage['dsh-bot:sidebar-mode']='bot'` 后 `[data-slot="sidebar.workspaces"]` 内是「Bot 名册（占位）」+「会话」，官方树/搜索消失。`workspacesCount===1`。截图 `shadow-on.png`。 |
| ASM-603 | **证实** | 点「会话」写回 `'sessions'` 并 reload 后官方树完整回来（工作区头 / 搜索 / 树 / 未分组）。搜索 `leftover` 过滤生效；点 `v1 leftover t18` 中栏打开。截图 `shadow-off.png`。 |
| ASM-604 | **证实** | rail：`[data-testid=dsh-bot-spike-mode][data-wide=0]` 只画图标；wide：`data-wide=1` 文案「Bot」。截图 `rail-footer.png` / `wide-before.png`。 |
| ASM-605 | **证实**（格式补充） | header.actions 组件能拿到 `sessionId`，`ctx.sessions.list.getSnapshot().byId[sessionId].agentPreset` 可读。 |

### ASM-605 console 抄录

```
[spike] session-db24dfe7-b207-413a-bb73-56979d9f2b62 dsh-bot          // 当前 bot 会话
[spike] session-39c84391-3556-41bb-a947-276e7425175c dsh-bot          // leftover t18（同为 dsh-bot 预设）
[spike] session-bf460816-85ee-4492-a349-5c73e44c7919 standard         // 普通会话「gui stream ok」
```

`session.list` 抽样：`dsh-bot`（默认 DSH Bot）、`dsh-bot--shiren-xiaobei` / `dsh-bot--xiaodui-aning` / `dsh-bot--yunwei-yeban`（人设 slug）、`standard` / `minimal`（非 bot）。  
BR-607 后续匹配应同时认 `dsh-bot` 与 `dsh-bot--` 前缀，不能只认 `dsh-bot--`。

## `ctx.slots.entries('sidebar.workspaces')`（会话模式，dispose 后）

一条官方条目：`locale: "workspace"`，`children.sidebar.workspaces.directoryFlow`，`store.persist: "dsh.workspace.view.v5"`，`registrant: "z5"`。无插件孤儿。

Bot 模式 DOM：同一 `data-slot` 内只有 spike，官方搜索/树不在 slot 文本里。`document.querySelectorAll('[data-slot="sidebar.workspaces"]').length === 1`（HMR/reload 后仍为 1）。

## `sidebar.footer.action` occupants（snapshot）

`cordis-panel`（官方）+ `dsh-bot:mode`（本插件，order 10）。

## `conversation.session.header.actions` occupants（snapshot）

`agent-preset` / `job-list` / `dsh-bot:identity-spike`（order 50）。

## 处置

五条全部证实，不阻塞。去掉 reload 式 spike 代码，保留 `inject` 含 `'slots'`。Phase 1 写成正式实现。
