# Memory board snapshot (master T2)

Date: 2026-09-06

Source: `docs/dsh-bot-memory/tasks.csv`

| 序号 | 状态 |
|---|---|
| 1 校准 ASM-801~804 | 已完成（模型未答「测试甲」） |
| 2 memory.ts | 已完成 |
| 3 注入链路 | 已完成（空记忆 strip 已修） |
| 4 Phase 1 回归 | 已阻塞: tsc SessionId brand + pnpm frozen lockfile |
| 5 memory-extract.ts | 已完成 |
| 6 抽取钩子 | 已阻塞: grok-4.6 503 无 assistant 闭合 |
| 7 四个 RPC | 已完成 |
| 8 MemoryPanel + 🧠 | 已完成 |
| 9 📌 | 已完成（单测；真机无 assistant 行） |
| 10 Phase 3 回归 | 已阻塞: 同 Task 4 |
| 11 README | 已完成 |
| 12 5.2 全套 | 已阻塞: 模型 503 + listBotSessions 401 |
| 13 Phase 4 回归 | 已阻塞: 四命令不全绿 |

矩阵与止损：`docs/dsh-bot-memory/evidence/phase-2/real-run.md`
