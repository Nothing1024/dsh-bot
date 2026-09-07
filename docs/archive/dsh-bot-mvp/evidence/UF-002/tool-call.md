# UF-002 主路径

时间: 2026-08-29T15:27:06.869Z
网关: `127.0.0.1:3084  pid=55792  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


## 操作
1. session.create → `session-aaaf4884-4f05-40df-9ba7-6e6cc25ee6d3` preset=`dsh-bot`
2. session.prompt 要求恰好调用一次 `dsh_bot_ask`（pong）
3. 工具卡片完成：`true`
4. marks：见 `marks.txt`
5. 官方栏无 `~dsh-bot:`（session.list JSON 不含该标题前缀；GUI 截图 rail-check.png）

## 核对
| 点 | 结果 |
|---|---|
| 工具卡片完成 | true |
| 答案入主会话 | true |
| marks kind:dsh-bot | true |
| 后台会话 | `session-4cac60d2-bbc2-48f9-85fe-b0a8653c27c3` |

