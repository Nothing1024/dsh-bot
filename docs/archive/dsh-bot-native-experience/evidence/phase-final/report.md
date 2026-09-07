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
| 8 spec 5.2 矩阵 | 已完成（7 行跑通 + UF-003 降级行 N/A，见下） |
| 9 回归 | **已阻塞**：`pnpm -r run typecheck` 未全绿，见下 |

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

证据见 `evidence/UF-00x/`。准确计数为 **7 行跑通 + 1 行不适用**（此前记为「8/8」，已更正）：

| 行 | 结论 |
|---|---|
| UF-001 主路径 / 失败分支、UF-002 主路径、UF-003 主路径、UF-004 主路径 / 清除回复 | 跑通（6 行） |
| UF-002 冲突测试 | 跑通但**证据弱**：Playwright Chromium 无地址栏，结构上不存在 Cmd+K 冲突，等价于未验证 |
| UF-003 降级 | **不适用**：emoji 为静态子集，无第三方库加载路径，无从触发「库缺失」 |

**未覆盖面**（review 补记，非本轮执行面）：

- 5.2 访问入口所列「官方 GUI 右栏 DSH Bot 页签」零覆盖；`useGlobalKeyboard` 在 capture 阶段吞 Cmd+K，嵌入宿主是最可能出问题处。
- 2.3 失败分支 UF-001「面板列表为空」、UF-004「回复消息删除或过期」已实现但无矩阵行与截图。

## 红线

- 无新 npm 依赖；无 Tiptap / emoji-mart。
- 未改 `RoomMessage` / rooms jsonl schema。
- `rg replyTo packages/dsh-bot-host/src` 为空。
- 未提交 `env/dsh-bot/` 运行时数据。

## 已知非本包问题

1:1 对话顶栏偶发 `internal: cannot get property "sessionProjections" without inject`（既有 host/session-tool，与本四项无关）。
