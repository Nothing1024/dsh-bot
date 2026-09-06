## 完成总结

- 完成范围：母包 T1–T6 已完成。实时 16/16。同事 15/15。名册 15/15。
- 本轮回炉：原终报把 `pnpm run typecheck` rc=2 记成「邻仓 SessionId brand clash、按 BR-044 不改邻仓」。**该诊断不成立。** 当前 11 个 TS 错误全部在本仓：roster 给 `BotView`/`GroupView`/`BotsRuntime` 加了 `pinned/section/hidden/order/muted` 与 `updateLayout` 后，旧夹具未同步；`App.tsx` 把 wire 上的 `string | undefined` 赋给了 `exactOptionalPropertyTypes` 下的 `RosterItem.section`；`keyboard.spec.tsx` 把可选回调以 `undefined` 显式传入。未弱化生产 `BotView`。
- 修改文件：`packages/dsh-bot-host/tests/group-engine.spec.ts`、`packages/dsh-bot-host/tests/routes.spec.ts`、`packages/workbench-ui/src/App.tsx`、`packages/workbench-ui/tests/keyboard.spec.tsx`，以及四包 docs/evidence。未 add `env/`、`.grok/`、`.vscode/`、根目录遗留、session-nav/group-chat 脏文件。
- 通过的联合场景（上一轮已落，本轮未重开）：
  - UF-041：阿宁→小北非静默回写；唯一 `GET /dsh-bot/events`。
  - UF-042：隐藏底栏未读；静音后再投递徽标仍 +1。
  - UF-043：`dsh_bot_ask` 不入 `peers.jsonl`；记忆/例程抽验。
- 未破坏的不变量：INV-041 思考/工具卡、Composer 不锁、发送异步。INV-042 一条 SSE。INV-043 一口一仓 :3084，`env/dsh-bot` 不入 git，红线空。
- Evidence：`evidence/UF-041/` ~ `UF-043/` 与 `evidence/phase-final/{live,peers,roster}-board.md`、`final-commands.log`、本报告。
- 共享面 BR-042 ③：`composePersona` 只定义在 `packages/dsh-bot-host/src/memory.ts`。同事礼仪不是第二套组合函数，而是 `renderBehaviorSection`（`routine-behavior.ts`）behavior 段里的三行「同事：」。调用链：`index.ts injectMemory` → `renderBehaviorSection(bot.declined)` → `composePersona(stripMemorySection(bot.persona), { memory, behavior })`。
- 剩余风险：
  1. ~~`pnpm run typecheck` rc=2 / 邻仓 SessionId clash~~ **已修**。原诊断错误；本仓夹具/精确可选属性同步后 `TYPECHECK_RC=0`。
  2. UF-034/042 系统 Notification 无法从 Playwright 观察，以 `shouldNotifyRoutine` 门闩为准。
  3. UF-031 revert 未停 host，用同组 drop 无位移代替。
  4. v1-ask.png 是官方 GUI 会话列表；工具成功以 history 事件为准（`dsh_bot_ask` + `joint-pong`）。
  5. 例程 leftover（503 / 忘记滞后）按 living-master 不修。

## 四次 validate（含证据审计）

```
docs/dsh-bot-live-transcript : 0 FAIL / 1 WARN / 21 PASS
docs/dsh-bot-peers           : 0 FAIL / 1 WARN / 21 PASS
docs/dsh-bot-roster          : 0 FAIL / 1 WARN / 21 PASS
docs/dsh-bot-alive-master    : 0 FAIL / 0 WARN / 17 PASS
```

WARN 均为 P0 校准豁免回归留痕。

## 四命令

```
typecheck  TYPECHECK_RC=0
build      BUILD_RC=0
test       TEST_RC=0        46 files / 344 tests passed
standard   STANDARD_RC=0
redline    rg anysphere|sand:// packages/ → 空
porcelain  无 env/dsh-bot
```

## 网关

`dsh-rpc-who.sh 3084` → 本仓 `.../dsh-grok-bot/plugin/env`。模型可用。
