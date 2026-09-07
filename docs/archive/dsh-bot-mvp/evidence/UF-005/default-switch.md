# UF-005 默认切换→委托

时间: 2026-08-29T15:38:28Z
网关: `127.0.0.1:3084  pid=18399  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`

改 `agent-default-model` 为 `deepseek-official/deepseek-v4-flash`（settings.update live）。主会话调 `dsh_bot_ask`（prompt `PINOK`）。

- 主会话 `session-aae82a55-e593-42dd-9e33-88d96d76fe8a` preset=`dsh-bot` 自身 header `[{'provider': 'deepseek-official', 'model': 'deepseek-v4-flash', 'reasoningEffort': 'max', 'maxTokens': 256000}]`
- 新增 marks: session-f739533d-e387-4c33-bc8b-e0662de807eb
- 后台 bot 会话 `session-f739533d-e387-4c33-bc8b-e0662de807eb`
- bot request/header.config: `{'provider': 'deepseek-official', 'model': 'deepseek-v4-flash', 'reasoningEffort': 'max', 'maxTokens': 256000}`

核对：委托会话 header 用新默认 **deepseek-official/deepseek-v4-flash**。PASS=True。随后恢复 anthropic/grok-4.6/xhigh。
