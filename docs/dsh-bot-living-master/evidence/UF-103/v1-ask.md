# UF-103 v1 `dsh_bot_ask`

Date: 2026-09-06 (gateway replay after bg_7)

## Caller
- `session.create` → `session-db24dfe7-b207-413a-bb73-56979d9f2b62` preset `dsh-bot`
- title later: `Dsh bot ask tool request`
- prompt accepted: `session.prompt` `accepted: true`

## Tool card
- `tool/call` seq 76 `dsh_bot_ask` arguments `prompt: Reply with exactly: dsh bot pong.` `title: uf103-v1-hidden`
- `tool/result` seq 77 text `dsh bot pong.` `isError: false`
- assistant quote seq 90 `dsh bot pong.`
- `turn/end` reason `completed`

## Hidden delegate
- official session.list title `~dsh-bot: uf103-v1-hidden`
- sessionId `session-b3335484-5c9c-4408-8772-71b95444d9d4`
- not in `routineList` (only `例程 · 报时` / `session-44502c29-…`)
- no `memory/<hidden-session-id>/` directory

## Still blocked
- `POST /dsh-bot/listSessions` and `listBotSessions` → `web-unreachable` `workspace/follow` HTTP 401
- workbench switcher cannot list the hidden row; isolation checked via platform `session.list` + memory tree
