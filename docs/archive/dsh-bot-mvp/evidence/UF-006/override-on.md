# UF-006 override 生效

时间: 2026-08-29T15:27:06.869Z
网关: `127.0.0.1:3084  pid=55792  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


settings.update `dsh-bot.model = {provider:deepseek-official, model:deepseek-v4-flash}`

| 入口 | sessionId | current provider/model | header |
|---|---|---|---|
| listSessions.botModel | — | deepseek-official/deepseek-v4-flash source=override | — |
| 页签/HTTP createSession | `session-69d25432-cab5-42b6-bd0f-0a6f6b210aa1` | deepseek-official/deepseek-v4-flash | deepseek-official/deepseek-v4-flash |
| GUI 直建 session.create | `session-b1ee3d6d-60f4-40f4-9b1c-85831f0bd399` | anthropic/grok-4.6 | 应仍为全局 anthropic/grok-4.6 |

GUI 直建不受 override 影响。

