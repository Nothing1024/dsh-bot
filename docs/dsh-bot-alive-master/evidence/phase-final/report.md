## 完成总结

- 完成范围：母包 T1–T6 已跑完。实时 15/16（Task 16 typecheck 邻仓 SessionId brand clash 诚实阻塞；build/test/standard 绿）。同事 15/15。名册 14/15（Task 15 同一 typecheck 阻塞）。
- 修改文件：`packages/dsh-bot-host`、`packages/workbench-ui`、`packages/tool-dsh-bot`、四包 `docs/` evidence。未 add `env/`、`.grok/`、`.vscode/`、根目录遗留、session-nav/group-chat 脏文件。
- 通过的联合场景：
  - UF-041：阿宁→小北非静默回写，阿宁会话出现「来自」；`silent.md` 8s 内无来自泡。`network.md`：唯一 `GET /dsh-bot/events`；peers/roster 未新增 EventSource。listBots 2s 是名册未读门闩，不是三轮询。
  - UF-042：隐藏小北后投递，底栏 `已隐藏 1 个 · 1`；展开能进。静音后再投递徽标仍 +1。为此补了 `acceptPeerSend` 对 **收件人** `incrementUnread(toBot)`。
  - UF-043：`session.prompt` 跑通 `dsh_bot_ask`（history 含工具名与 `joint-pong`）；工作台双人设截图；小组房间截图；记忆目录 + 例程 lastOutcome 抽验。`ask-not-peer.md`：ask 会话未入 `peers.jsonl`（新增行仅 sendToPeer）。
- 未破坏的不变量：INV-041 后包未拆掉思考/工具卡、Composer 不锁、发送异步、隐藏不进调度。INV-042 一条 SSE。INV-043 一口一仓 :3084，`env/dsh-bot` 不入 git，红线空。
- Evidence：`evidence/UF-041/` ~ `UF-043/` 与 `evidence/phase-final/{live,peers,roster}-board.md`、`final-commands.log`、本报告。
- 剩余风险：
  1. `pnpm run typecheck` rc=2：本仓 `@deepseek-ai/dsh-session@0.1.2-rc.1` vs vibee `0.1.0-rc.7` SessionId brand + `sessionTool` 路径；BR-044 不改邻仓。
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
typecheck  TYPECHECK_RC=2   （邻仓 SessionId clash，诚实缺口）
build      BUILD_RC=0
test       TEST_RC=0        46 files passed
standard   STANDARD_RC=0
redline    rg anysphere|sand:// packages/ → 空
porcelain  无 env/dsh-bot
```

## 网关

`dsh-rpc-who.sh 3084` → 本仓 `.../dsh-grok-bot/plugin/env`。模型可用。
