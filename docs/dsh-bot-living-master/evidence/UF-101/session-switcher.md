# UF-101 session switcher after listBotSessions fallback

Date: 2026-09-06 (gateway pid 33601, post-rebuild)

`POST /dsh-bot/listBotSessions` `{botId:yunwei-yeban}` now returns `ok:true`.
Visible rows include `uf103-auto-extract`, `例程 · 报时` (`routine:r-1788692459058-bldp78m8`), and `运维夜班`.
Hidden `~dsh-bot-memory: yunwei-yeban` only appears with `includeHidden:true`.

Workbench header: `对话 uf103-auto-extract`. Left rail lists `例程 · 报时`.
Screenshot: `session-switcher.png`.

Root cause of the old 401: `sessionTool.list` still HTTP-calls `workspace/follow` without `DSH_LAUNCH_TOKEN`.
`listOwnedSessions` now falls back to `platform.listSessions` (official `session.list` + titles) ∩ `bot:<id>` marks.
v1 `listSessions` RPC is unchanged and still 401.
