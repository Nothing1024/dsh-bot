# UF-002 主路径

时间: 2026-08-29  
网关: `dsh-rpc-who.sh 3084` → `DSH_HOME=<本仓>/env` pid=32559  
pluginInventory: `dsh-bot-host` / `tool-dsh-bot` fiberPhase=active（`evidence/phase-2/plugin-inventory.json`）

## 操作

1. `session.create {cwd: <仓根>}` → `session-c8cf1b3a-d154-4d34-bed9-f8f03135100c` preset=`dsh-bot`
2. `session.prompt` 要求模型 **恰好调用一次** `dsh_bot_ask`：
   - prompt: `Reply with exactly: dsh bot pong.`
   - title: `uf002`
3. 模型产生 `tool/call` `dsh_bot_ask`，工具卡片完成（`isError: false`）
4. 主会话引用答案继续作答：`dsh bot pong.`
5. 后台会话 `session-9690590f-6953-4d68-bbcd-ab31cb7bba88`
   - title `~dsh-bot: uf002`
   - marks `kind:delegated,kind:dsh-bot,kind:hidden`
   - `workspace.archiveSession` 已入档（`archivedSessionIds` 含该 id）
   - `request/header` 跟随全局 `anthropic / grok-4.6 / xhigh`（`dsh-bot.model` 为空）

## 核对

| 点 | 结果 |
|---|---|
| 工具卡片完成 | `tool/result` 文本 `dsh bot pong.`，`isError: false` |
| 答案入主会话 | 第二步 `assistant/message` 原文引用 |
| marks `kind:dsh-bot` | `marks.txt` 一行 |
| 官方栏无 `~dsh-bot:` | Playwright `HAS_TILDE_TITLE=false`（`rail-check.png` / `rail-playwright.log`） |

## 产物

- `main-create.json` / `main-prompt.json` / `session-history.json`
- `bot-history.json` / `session-list.json` / `workspace-list.json`
- `marks.txt` / `rail-check.png`
