# UF-002 网关不可达分支

时间: 2026-08-29T15:27:06.869Z
网关: `127.0.0.1:3084  (没人监听)`


## 1. 停网关
```
127.0.0.1:3084  pid=55792  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin
kill 55792
127.0.0.1:3084  (没人监听)
```

## 2. CLI headless session create
exit 1
stderr:
```
dsh-session: [web-unreachable] web gateway unreachable for session.create: fetch failed

```
stdout:
```

```

期望 web-unreachable / fetch failed，非空串。演练后已重新 boot 本仓网关。

