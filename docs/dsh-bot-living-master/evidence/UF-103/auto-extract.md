# UF-103 / memory auto-extract on a user turn

Date: 2026-09-06 (gateway replay after bg_7)

## Turn
- `createBotSession` botId `yunwei-yeban` title `uf103-auto-extract`
- sessionId `session-bbeb73e6-3cd0-47c3-8c3a-43bafbc6cde1`
- user: `部署环境代号是 living-master-replay，时区固定用 CST，请记住这一点。`
- assistant: `记下了。` + environment / CST

## Memory after history poll
`memoryList yunwei-yeban`:
- profile: `部署环境代号是 living-master-replay。` ; `时区固定使用 CST。`
- log `source:auto` `用户要求记住部署环境代号 living-master-replay 且时区固定用 CST。`
- sessionId on the auto log = the workbench session, not a hidden filename under `memory/`

Hidden extract worker title `~dsh-bot-memory: yunwei-yeban` exists in platform `session.list` only.
