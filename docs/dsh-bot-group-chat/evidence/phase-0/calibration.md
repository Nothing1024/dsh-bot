# Phase 0 calibration (Task 1)

Date: 2026-08-30  
Gateway: `dsh-rpc-who.sh 3084` → pid=34032 `DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env`

## Hidden listBotSessions (BR-305 / ASM-301)

Commands:

```sh
curl -sS -X POST http://127.0.0.1:3084/dsh-bot/listBotSessions \
  -H 'Content-Type: application/json' \
  -d '{"args":{"botId":"dsh-bot"}}'
curl -sS -X POST http://127.0.0.1:3084/dsh-bot/listBotSessions \
  -H 'Content-Type: application/json' \
  -d '{"args":{"botId":"dsh-bot","includeHidden":true}}'
```

Live counts (bot `dsh-bot`):

| 列表 | count | `hidden:true` | title 以 `~` 开头 |
|---|---|---|---|
| 默认 `includeHidden` 省略 | 64 | 0 | 0 |
| `includeHidden: true` | 83 | 19 | 18 |

Default list contains **zero** `kind:hidden` / `~` title rows. The 19 hidden rows (askBot `~dsh-bot: …` + `kind:hidden`) appear only when `includeHidden: true`.

Calibration session minted this run:

1. `POST /dsh-bot/createBotSession` `{botId:"dsh-bot", title:"calibration-visible"}` → `session-822eeff1-bfd4-4bfa-a9e4-d8ba8dd05e1b`
2. `session.rename` title `~dsh-bot-group: calibration`
3. session-marks put: `bot:dsh-bot`, `kind:dsh-bot`, `kind:hidden`, `group:calibration`, `group-room:calibration`

After hide:

- default `listBotSessions` **does not** contain `session-822eeff1-…`
- `includeHidden: true` also omits it: `sessionTool.list` did not return this gateway-created-then-renamed row (askBot sessions created via `sessionTool.create` with hidden tags *are* listed). Marks lookup still works: `listByKind("group-room:calibration")` returns this id.

**ASM-301 结论**: 复用「每个 (房间, 成员) 一对隐藏会话」。查找走 `session-marks` 的 `group:` / `group-room:` + `bot:<id>`，**不**依赖 `listBotSessions`。默认 1:1 列表不会出现 hidden / `~` 标题会话。泄漏风险未实证，保持复用、不改每轮新建。

## 1:1 history shape (BR-307)

`POST /dsh-bot/history` `{sessionId:"session-5a0ca88e-49dc-4397-afd6-3e56e81b9e7a"}` (default 1:1 row):

- `ok: true`, `working: false`, 3 items
- item key union: `id`, `kind`, `role`, `seq`, `text`
- **no `author` field** on any item
- kinds: `message`, `thinking`; roles: user then assistant

Adding optional `author` / `speaking` / `error` on the wire is backward compatible: 1:1 projection must keep omitting them.

Calibration session history: `{items:[], working:false}` (no user turns). `session.history` shows `session/title` renamed to `~dsh-bot-group: calibration`.
