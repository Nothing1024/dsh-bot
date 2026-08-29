# UF-002 等待超时分支

时间: 2026-08-29  
设置：`settings.update` `dsh-bot.askTimeoutMs = 200`（live，未重启），演练后恢复 `180000`。

## 操作

主会话 `session-d7c15291-a7ab-4b0a-9710-72fa16a15800` 调用 `dsh_bot_ask`（prompt「Write two sentences about water」）。

## 结果

工具卡片 `isError: true`，错误文本：

```
Error: wait-timeout: dsh_bot_ask timed out waiting for session-71e5d33c-7ff5-48c2-b8fe-b95460d8c24e (session kept) (session session-71e5d33c-7ff5-48c2-b8fe-b95460d8c24e)
```

marks 仍登记该会话（未被杀）：

```
session-71e5d33c-7ff5-48c2-b8fe-b95460d8c24e kind:delegated,kind:dsh-bot,kind:hidden
```

历史：`timeout-history.json`。
