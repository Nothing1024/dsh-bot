# UF-205 v1 leftover compatibility (2.7 旧数据兼容)

Date: 2026-08-30. Task 12.

## Given

v1 `POST /dsh-bot/createSession` still tags **only** `kind:dsh-bot` (no `bot:<id>`).
This is the leftover shape from v1 sidebar 新建.

```
POST /dsh-bot/createSession {args:{title:"v1 leftover", cwd:仓根}}
{"ok":true,"value":{"sessionId":"session-470456ed-49f6-46b5-bc23-75d970536a1f","title":"v1 leftover"}}
```

## Marks before reconcile

```
marks get --id session-470456ed-49f6-46b5-bc23-75d970536a1f
session-470456ed-49f6-46b5-bc23-75d970536a1f kind:dsh-bot
```

No `bot:` token.

## When

```
POST /dsh-bot/reconcile {args:{}}
{"ok":true,"value":{"scanned":79,"labeled":1,"alreadyLabeled":70,"skippedNonBot":0,"skippedCached":8,"assigned":[{"sessionId":"session-470456ed-49f6-46b5-bc23-75d970536a1f","botId":"dsh-bot","reason":"v1-legacy"}]}}
```

## Then

```
marks get --id session-470456ed-49f6-46b5-bc23-75d970536a1f
session-470456ed-49f6-46b5-bc23-75d970536a1f bot:dsh-bot,kind:dsh-bot
```

The session appears in `listBotSessions {botId:dsh-bot}` (newest-first; title "v1 leftover").
Existing tokens were merged, not replaced. Default bot (`dsh-bot` / preset `dsh-bot`) owns the leftover.
Not duplicated on a later reconcile (`labeled:0`).
