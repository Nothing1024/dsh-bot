# UF-006 非法 override

时间: 2026-08-29T15:27:06.869Z
网关: `127.0.0.1:3084  pid=55792  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


settings.update `dsh-bot.model = {provider:no-such-provider, model:no-such-model}`

`POST /dsh-bot/createSession`：

```
{
  "ok": false,
  "error": {
    "code": "override-invalid",
    "message": "illegal dsh-bot.model override no-such-provider/no-such-model: no adapter registered for provider \"no-such-provider\""
  }
}
```

期望 `ok:false`，code 为 override-invalid 类，点名 provider/model，不静默回落。演练后已清空 override。

