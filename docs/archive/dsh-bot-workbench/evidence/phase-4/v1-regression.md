# v1 回归抽验 (workbench Task 18/19, review-fix)

网关: `127.0.0.1:3084` this-warehouse env

## GUI 对话（v1 UF-001）

官方 GUI http://127.0.0.1:3084 「新会话」composer 发送后，会话标题 UF-003 jump t19 / preset **DSH Bot**。

截图 `v1-gui-chat.png`：用户气泡 + assistant「DSH Bot 在线…官方 GUI 直建的 bot preset 会话」。不是空白「探索未至之境」落地页。

## 委托 dsh_bot_ask（v1 UF-002）

主会话 `session-41f479ce-3e16-48be-aa8b-b9f899f9a18d` 调用 `dsh_bot_ask`。

- history 含 `tool-call` name=`dsh_bot_ask`
- 工具答案：`dsh bot pong t18`
- 原始：`v1-ask-history.json`

## 页签 iframe（v1 UF-003 / BR-208）

底部「+」→ DSH Bot，`data-testid=dsh-bot-iframe` src=`/dsh-bot/ui`。`v1-tab-iframe.png`。tab id 仍 `dsh-bot:sessions`。`POST /dsh-bot/listSessions` `{ok:true}`。
