# UF-005 会话内切换

时间: 2026-08-29T15:27:06.869Z
网关: `127.0.0.1:3084  pid=55792  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


会话 `session-58e3ccb3-d287-4e7d-aa61-3e8750a21c9d`

| 轮次 | provider | model | preset |
|---|---|---|---|
| 切换前 | anthropic | grok-4.6 | undefined |
| session.selectModel | deepseek-official | deepseek-v4-flash | (人设不变) |
| 切换后 | deepseek-official | deepseek-v4-flash | undefined |

selectModel 响应：

```
{
  "type": "server-response",
  "rpcId": "dbg",
  "result": {
    "ok": true,
    "value": {
      "selected": {
        "provider": "deepseek-official",
        "model": "deepseek-v4-flash",
        "reasoningEffort": "max"
      }
    }
  }
}
```

核对：下一轮 `request/header` 从 `anthropic/grok-4.6` 变为 `deepseek-official/deepseek-v4-flash`。`session.create` 的 `agentPreset=dsh-bot`（history 早段 `agent-preset/selected` 可能被 maxMessages 截掉，以 create 响应为准）。测完已 `settings.update` 恢复全局 anthropic/grok-4.6/xhigh。

