# Task 13 README
95:### 同事（`dsh_bot_send`）
97:任意 bot 可通过工具 `dsh_bot_send({toBot, text})` 给名册里**另一个** bot 捎一句。工具立刻 `{accepted:true}`，不在调用里等对方说完。
100:- 成功投递追加 `$DSH_HOME/dsh-bot/peers.jsonl`（`{from,to,ts,sessionId}`），该文件不入 git。
101:- 一次一个收件人，不广播、不接外部、不跨用户。
