# UF-001 上游失败分支

时间: 2026-08-29T15:27:06.869Z
网关: `127.0.0.1:3084  pid=55792  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


本地 401 端点 `http://127.0.0.1:18091`，临时 provider `badup`（凭据走已有 ANTHROPIC_API_KEY 引用，端点返回 401）。会话 `session-d0556073-e165-4c01-9c4e-75f536c6e121`。

selectModel：

```
{
  "type": "server-response",
  "rpcId": "dbg",
  "result": {
    "ok": true,
    "value": {
      "selected": {
        "provider": "badup",
        "model": "grok-4.6",
        "reasoningEffort": "xhigh"
      }
    }
  }
}
```

历史含稳定错误（AUTH/401/authentication/turn/end error）：true

会话保留可重试（未删除）。演练后 unset badup 并恢复全局模型。

