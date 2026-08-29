# UF-002 / 断 key 调工具

时间: 2026-08-29  
临时 `settings.mutate` 增加 `llm-pi-ai.providers.nokey`（`apiKeyEnv: BOT_MISSING_KEY`，该变量未配置），`dsh-bot.model = {provider: nokey, model: grok-4.5}`。演练后 unset 该 provider 并清空 override。

## 工具卡片（fail loud，点名 MISSING_CREDENTIAL 与凭据引用）

主会话 `session-05363849-2c31-47ff-a6dc-5efeb5dce722`：

```
Error: missing-credential: MISSING_CREDENTIAL: llm-pi-ai: no credential for provider route "nokey"; its profile resolves BOT_MISSING_KEY, which is not set — store BOT_MISSING_KEY through the credentials service (the web Models page writes it) or export it, and remove apiKeyEnv only if this provider should authenticate from pi-ai's own environment discovery — turn/end error (session session-8ee512c7-c26d-4d4f-8509-1532944b5267)
```

`isError: true`。未返回空串。askBot 从 bot 会话 `turn/end.reason.error` 抽出 `MISSING_CREDENTIAL`，并附 `wait.lastTurnEndReason=error`。

历史：`missing-key-history.json`。
