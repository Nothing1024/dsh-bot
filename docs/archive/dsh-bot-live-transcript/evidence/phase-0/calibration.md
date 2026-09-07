# Task 1 校准 ASM-011~014

Date: 2026-09-06
Gateway: `dsh-rpc-who.sh 3084` → pid=3121 `DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env` cwd=本仓库根
Bots: `dsh-bot` / `shiren-xiaobei` / `xiaodui-aning` / `yunwei-yeban`
Probe session: `session-aecaaa0f-ac89-4402-9f20-3e434a3d8a06`（校对阿宁，`agentPreset=dsh-bot--xiaodui-aning`）

`git status --porcelain env/.agent-presets`：空（目录 gitignore）。未改 preset。

## ASM-014 — GET `/dsh-bot/events` 改代码前基线

```
curl -N -D - http://127.0.0.1:3084/dsh-bot/events
HTTP/1.1 405 Method Not Allowed
{"ok":false,"error":{"code":"method-not-allowed","message":"GET"}}
```

**结论：证实。** 现网 `handleDshBotHttp` 对非 POST 一律 405。豁口在 Task 2。

## ASM-012 — 进程内 `ctx.get('apiProxy')` 是否有 events / prompt / respond

官方 HTTP 与 host 共用同一 `ApiProxy`：

- `POST /api/session.prompt` 对上述 bot 会话返回 `{accepted:true}`（queue / steer）
- `POST /api/session.cancel` 返回 `{accepted:true}`
- `createPlatform` 现网已 duck 调用同一对象上的 `sessions.create` / `list` / `rename` / `selectModel`
- 类型 `ApiProxy` 含 `events.mux` / `events.host` / `sessions.prompt` / `respond`
- 官方 `POST /api/events.mux` 是 404（流不是一元 HTTP）；进程内应走 `events.mux(request, signal): AsyncIterable`

**结论：证实（unary 已打通；mux 按 in-process AsyncIterable 接，缺函数则 SSE 503、投递回退 write）。**

## ASM-011 — bot 会话 mux/history 有没有 `assistant/chunk`

`session.history` 对上述阿宁会话：810 条事件，类型计数：

| type | n |
|---|---|
| assistant/chunk | 718 |
| assistant/message | 9 |
| tool/call | 26 |
| tool/result | 26 |
| user/message | 3 |
| 其它（turn/step/permission 等） | 余下 |

chunk 形状：`{type, seq, time, data}`，`data.chunk` 为 `StreamChunk`（`text-delta` / `reasoning-delta` / `tool-call-delta` / `block-start`）。

**结论：证实。** BR-015 走增量：`text-delta` 刷最后一条 assistant 气泡；`reasoning-delta` 可进思考卡；`assistant/message` 定稿。不得假打字。

## ASM-013 — `sessions.prompt` 对 bot 会话是否 `agent-busy`

对同一 `bot:` 会话：

```
session.prompt {mode:queue, content:[{type:text,text:"校准探测：请只用两个字回答「收到」。"}]}
→ {ok:true, value:{accepted:true}}

session.prompt {mode:steer, content:[{type:text,text:"校准探测 steer：停。"}]}
→ {ok:true, value:{accepted:true}}

session.cancel {sessionId}
→ {ok:true, value:{accepted:true}}
```

未出现 `agent-busy`。

**结论：证实。** 投递改 `sessions.prompt`；失败或缺 duck 才回退 `sessionTool.write`。

## 对第 2 章的影响

四条假设均成立，不改 BR 语义。BR-015 锁定「有 chunk → 逐字刷末泡」。
