# UF-002 网关不可达分支

时间: 2026-08-29  
真实停掉本仓 gb `:3084` 后再调。完整命令输出：`gateway-down.log`、`gateway-down-cli.err`。

## 1. 停网关

```
dsh-rpc-who.sh 3084
# 127.0.0.1:3084  pid=66036  DSH_HOME=<本仓>/env
kill 66036
dsh-rpc-who.sh 3084
# 127.0.0.1:3084  (没人监听)
```

## 2. CLI headless（session-tool 同一条 sessionTool.create 链）

```
DSH_HOME=<本仓>/env node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js \
  session create --title gateway-down --profile headless \
  --patch env/cli.patch.yml --format json
```

退出码 1，stderr：

```
dsh-session: [web-unreachable] web gateway unreachable for session.create: fetch failed
```

这是 `dsh_bot_ask` 委托链的第一步（`sessionTool.create`）在 headless CLI 上的同一错误码。

## 3. `ctx.dshBot.askBot` 对死口 3084

进程内 `DshBotService.askBot` 的 `sessionTool.create` 对 `http://127.0.0.1:3084/api/session.create` 发真实 POST；网关已停，fetch 失败，映射为：

```
CODE=web-unreachable
MSG=web-unreachable: fetch failed (http://127.0.0.1:3084)
```

未返回空串。演练后已重新 `sh env/boot.sh` 起本仓网关。
