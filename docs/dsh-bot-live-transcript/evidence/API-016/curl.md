# API-016 curl SSE / prompt / cancel

## GET /dsh-bot/events
```
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
Date: Sun, 06 Sep 2026 16:08:21 GMT
Transfer-Encoding: chunked

--- body ---
data: {"type":"ready"}

data: {"type":"bot/status","botId":"dsh-bot","working":false,"unread":0}

data: {"type":"bot/status","botId":"shiren-xiaobei","working":false,"unread":0}

data: {"type":"bot/status","botId":"xiaodui-aning","working":false,"unread":0}

data: {"type":"bot/status","botId":"yunwei-yeban","working":false,"unread":0}


```

## prompt queue + cancel
```
session=session-b6729dae-3b76-401b-a8e2-2069914295c3
{"ok":true,"value":{"sessionId":"session-b6729dae-3b76-401b-a8e2-2069914295c3"}}
{"ok":true,"value":{"accepted":true}}
```
