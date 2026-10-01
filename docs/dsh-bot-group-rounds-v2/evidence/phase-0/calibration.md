# Phase 0 环境校准（Task 1）

日期：2026-10-01

## 基线

- `baseline.log`：`pnpm test` 50 文件通过 / 1 文件失败（`packages/tool-dsh-bot/tests/tools.spec.ts`，解析 `dsh-bot-host` 入口失败，0 用例），491 用例通过；`pnpm run typecheck` 错误全部在 `packages/tool-dsh-bot/`（`src/index.ts` 9 处 + `tests/tools.spec.ts` 1 处）。与 spec §1.3 一致。
- `git status --porcelain` 开工时为空（仅新建本目录）。

## 网关

- `env/profiles/gb/node_modules` 缺失 → 执行 `sh env/setup.sh`（apply.sh + pnpm install，未改 git 跟踪文件）。
- `pnpm run build` 后以 hub 常驻 `sh env/boot.sh`，:3084 监听，`DSH_HOME` = 本仓 `env/`。

## ASM-001 浏览器

- 无头 Chromium 访问 `/?token=…` 拿 Cookie 后打开 `http://127.0.0.1:3084/dsh-bot/ui` 正常（`workbench-open.webp`）。结论：成立，5.2 用浏览器自动化执行。

## ASM-002 模型凭据与成员回复

- 新建人设「诗人小北」+ 小组「编辑室」（成员：诗人小北、DSH Bot，rounds=3）。
- 首次发言：两名成员都报 `session-failed (status failed)`。根因：0.2.0-rc.1 `dsh-api-session-controller` 的 `agent/pre-step` 对已归档会话返回 `reject` → `turn/end {kind:'blocked'}`；`ensureMemberTurnSession` 用 `hide({syncToArchived:true})` 把成员隐藏会话归档了。1:1 会话（`syncToArchived:false`）正常回复。
- 用户拍板：窄修 + 单独 commit（`8e7d58f`）：成员会话不归档、复用时 unarchive、reconcile 对 `group-room:` 会话不归档。
- 修复后新房间：两人三轮内各发言 2 次，真实回复。结论：成立。

## 测试数据（按 id 清理）

- 人设 `shiren-xiaobei`、小组 `bianji-shi`（5.2 继续复用；Task 16 结束按 id 清理）。
- 1:1 会话 `session-891c5fa4-3098-4505-91fd-945001b4ede9`（calib-1v1）。
