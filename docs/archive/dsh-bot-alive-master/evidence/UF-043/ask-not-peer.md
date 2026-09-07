# UF-043 ask-not-peer

- dsh_bot_ask 走 session.prompt 隐藏委托，不应往 peers.jsonl 追加 ask 会话。
- peers.jsonl 新增行：
```
{"from":"xiaodui-aning","to":"shiren-xiaobei","ts":1788712412840,"sessionId":"session-530cca77-4380-4d6e-b2e1-b493169bee86"}
{"from":"xiaodui-aning","to":"shiren-xiaobei","ts":1788712422096,"sessionId":"session-530cca77-4380-4d6e-b2e1-b493169bee86"}
{"from":"xiaodui-aning","to":"shiren-xiaobei","ts":1788712445599,"sessionId":"session-530cca77-4380-4d6e-b2e1-b493169bee86"}
{"from":"yunwei-yeban","to":"shiren-xiaobei","ts":1788712450269,"sessionId":"session-6f9782df-91c6-4c8a-98ed-fe921e1605ee"}

```
- 含 joint-uf043 / dsh_bot_ask session: false

- session-580b5c36 history 含 `dsh_bot_ask` 与 `joint-pong`：是。该 session 未写入 peers.jsonl。
