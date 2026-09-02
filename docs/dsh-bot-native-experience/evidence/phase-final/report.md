# Phase 3 / Task 9 收尾报告

Date: 2026-09-03

## 任务状态

| Task | 状态 |
|---|---|
| 1 前置检查 | 已完成 |
| 2 useGlobalKeyboard | 已完成 |
| 3 CommandPalette | 已完成 |
| 4 emoji picker | 已完成（ASM-101 证实） |
| 5 Transcript 回复菜单 | 已完成 |
| 6 reply 状态/卡片 | 已完成 |
| 7 后端评估 | 已完成（ASM-102 证实，不改 RoomMessage） |
| 8 spec 5.2 矩阵 | 已完成 8/8 |
| 9 回归 | 见下 |

## 命令级

| 命令 | 结果 |
|---|---|
| `pnpm --filter workbench-ui build` | 绿；js gzip 84.48 kB |
| `pnpm --filter workbench-ui typecheck` | 绿 |
| `pnpm --filter workbench-ui test` | 103 passed |
| `pnpm test` | 32 files / 238 tests passed |
| `pnpm run standard:check` | 全部通过 |
| `pnpm -r run typecheck` | **FAIL**：`packages/ui-dsh-bot/tests/jump-bridge.spec.ts` exactOptional（session-nav 未提交文件，非本包） |

## 5.2 矩阵

Playwright Chromium（Chrome for Testing 1228）对 `http://127.0.0.1:3084/dsh-bot/ui` 回放。`dsh-rpc-who.sh 3084` DSH_HOME 为本仓 `env/`。

8/8 行证据见 `evidence/UF-00x/`。

## 红线

- 无新 npm 依赖；无 Tiptap / emoji-mart。
- 未改 `RoomMessage` / rooms jsonl schema。
- `rg replyTo packages/dsh-bot-host/src` 为空。
- 未提交 `env/dsh-bot/` 运行时数据。

## 已知非本包问题

1:1 对话顶栏偶发 `internal: cannot get property "sessionProjections" without inject`（既有 host/session-tool，与本四项无关）。
