# UF-205 v1 leftover compatibility

时间: 2026-08-30T11:10:45.025Z
网关: `127.0.0.1:3084  pid=55016  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


## Given

v1 `POST /dsh-bot/createSession` still tags **only** `kind:dsh-bot` (no `bot:<id>`).

```
POST /dsh-bot/createSession {args:{title:"v1 leftover t18", cwd:仓根}}
{
  "ok": true,
  "value": {
    "sessionId": "session-39c84391-3556-41bb-a947-276e7425175c",
    "title": "v1 leftover t18"
  }
}
```

## Marks before reconcile

```
session-39c84391-3556-41bb-a947-276e7425175c kind:dsh-bot

```

## When

```
POST /dsh-bot/reconcile
{
  "ok": true,
  "value": {
    "scanned": 97,
    "labeled": 1,
    "alreadyLabeled": 88,
    "skippedNonBot": 0,
    "skippedCached": 8,
    "assigned": [
      {
        "sessionId": "session-39c84391-3556-41bb-a947-276e7425175c",
        "botId": "dsh-bot",
        "reason": "v1-legacy"
      }
    ]
  }
}
```

## Then

```
session-39c84391-3556-41bb-a947-276e7425175c bot:dsh-bot,kind:dsh-bot

```

in listBotSessions dsh-bot: true
assigned reason v1-legacy: {"sessionId":"session-39c84391-3556-41bb-a947-276e7425175c","botId":"dsh-bot","reason":"v1-legacy"}

