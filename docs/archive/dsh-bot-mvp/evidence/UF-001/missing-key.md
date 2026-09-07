# UF-001 无凭据分支

时间: 2026-08-29T15:27:06.869Z
网关: `127.0.0.1:3084  pid=55792  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


临时 `settings.mutate` 增加 `llm-pi-ai.providers.nokey`（`apiKeyEnv: BOT_MISSING_KEY`，未配置），会话 `session-fc686803-b7b3-4809-bc20-4d62a0f1518d` `session.selectModel` 到 nokey/grok-4.6。

selectModel：

```
{
  "type": "server-response",
  "rpcId": "dbg",
  "result": {
    "ok": true,
    "value": {
      "selected": {
        "provider": "nokey",
        "model": "grok-4.6",
        "reasoningEffort": "xhigh"
      }
    }
  }
}
```

历史是否点名 MISSING_CREDENTIAL / BOT_MISSING_KEY：true / true

摘录（截断）：

```
{"type":"server-response","rpcId":"dbg","result":{"ok":true,"value":{"events":[{"event":{"type":"permission/preset","seq":0,"time":1788017252204,"data":{"preset":"workspace-write"}}},{"event":{"type":"sandbox/mode","seq":1,"time":1788017252205,"data":{"mode":"workspace-write"}}},{"event":{"type":"approval/policy","seq":2,"time":1788017252205,"data":{"policy":"ask"}}},{"event":{"type":"agent/inbox/spliced","seq":3,"time":1788017252241,"data":{"target":"next-turn","start":0,"inserted":[{"content":[{"type":"text","text":"Reply with exactly: should fail missing key"}],"source":{"kind":"user","rpcId":"dbg"},"role":"user","id":"4a872f68-6d80-4a2f-829f-ee88fbd1bf06"}]}}},{"event":{"type":"turn/start","seq":4,"time":1788017252241,"data":{"turn":1}}},{"event":{"type":"agent/inbox/spliced","seq":5,"time":1788017252241,"data":{"target":"next-turn","start":0,"removedCount":1,"inserted":[]}}},{"event":{"type":"step/start","seq":6,"time":1788017252272,"data":{"turn":1,"step":1}}},{"event":{"type":"user/message","seq":7,"time":1788017252272,"data":{"content":[{"type":"text","text":"Reply with exactly: should fail missing key"}],"source":{"kind":"user","rpcId":"dbg"},"role":"user","id":"4a872f68-6d80-4a2f-829f-ee88fbd1bf06"},"surfaceOp":"append"}},{"event":{"type":"user/message","seq":8,"time":1788017252272,"data":{"content":[{"type":"text","text":"Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\nCurrent DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: \"/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin\". Some platform temporary areas may also be writable.\n\nApproval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed."}],"source":{"kind":"plugin","plugin":"@deepseek-ai/dsh-system-prompt","form":"snapshot","sections":[{"name":"sandbox:policy","text":"Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: \"/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin\". Some platform temporary areas may also be writable."},{"name":"approval:policy","text":"Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed."}]},"role":"user","id":"c0787668-6863-4acd-88c7-35857bcf2edd
```

随后 unset nokey，切回 anthropic/grok-4.6，再发一条确认免重启恢复。

