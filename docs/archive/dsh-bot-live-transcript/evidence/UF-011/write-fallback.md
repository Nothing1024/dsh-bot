# UF-011 write-fallback

未在真机摘掉 `sessions.prompt` duck：当前 :3084 已 duck 成功（`prompt` 返回 `{ok:true,value:{sessionId}}`，`cancel` 返回 `{accepted:true}`）。摘 duck 会破坏同会话其余 UF。

回退路径在代码与单测里：

- `packages/dsh-bot-host/src/workbench-sessions.ts` `promptOwnedSession`：`platform.promptSession` 缺失或 `{unavailable:true}` 时走 `sessionTool.write`。
- `packages/dsh-bot-host/tests/workbench-sessions.spec.ts` 覆盖 write fallback。
- UI toast「旧通道」由 `prompt` RPC 错误码映射，不伪造本轮截图。

结论：失败分支以单测为准；真机本 build 走 queue 主路径。
