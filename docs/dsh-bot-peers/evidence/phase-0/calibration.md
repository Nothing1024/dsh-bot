# Task 1 校准 ASM-021~024

网关：`dsh-rpc-who.sh 3084` → 本仓 `env/`。模型本轮可用（非 503）。

| ASM | 结果 | 证据 |
|---|---|---|
| ASM-021 | **Confirmed.** `createBotSession` 小北 title「来自 校对阿宁」，`put` extra `peer:xiaodui-aning`。`listBotSessions` 可见，`hidden:false`。会话 `session-530cca77-4380-4d6e-b2e1-b493169bee86`。 | 真机 RPC：create + list |
| ASM-022 | **Confirmed.** Prompt「没事…只输出一行 (silent)」→ assistant `(silent)`。1/1。模型存活。 | 真机 prompt |
| ASM-023 | **Contract confirmed, live path after code.** 回写目标 = 工具调用方 `exec.agent.id`（`fromSessionId`）；否则该 from bot 最新非 hidden；再没有则新建。校准未在改代码前完整复现「切会话再回写」，实现按此合同接线。 | host `resolveFromSession` |
| ASM-024 | **Confirmed.** live-transcript 已合入 `GET /dsh-bot/events`（200 + `ready`）。本包不新开定时器。 | curl `/dsh-bot/events` |

第 2 章合同未改：ASM 均未被证伪。
