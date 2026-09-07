# INV-103 porcelain snapshot

Refreshed 2026-09-06 during INV-103 exception close. Neighbors were not edited by this repo.
Verdict: 例外登记（邻仓 porcelain 与开工基线一致）。判定 (a)：与本仓 worker 无关的既有/并发脏状态。

本仓 feat 起点：`2135fe6` 2026-09-06 18:45:36 +0800。

## 核验方法（只读，无 checkout/reset/stash/commit 邻仓）

对每个脏路径：`git -C <邻仓> diff --stat`、`git log -1 --format=%ci -- <file>`、文件 mtime；与 `git log --format='%h %ci %s' 2135fe6^..HEAD` 对比；`rg -i 'dsh-bot|memory|routine'` 扫邻仓 diff。

## session-tool（139 porcelain）

kinds: `M` 5、`D` 131、`??` 3

结论 (a)。全部 last-commit ≤ 2026-09-05；现存文件 mtime ≤ 2026-09-05 22:36。tracked diff 与未跟踪 `live-events*` 均无 dsh-bot / memory / routine 字样。

- `M README.md`（last-commit 2026-09-05 15:35，mtime 2026-09-05 17:12）
- `M packages/session-tool-local/src/http-rpc.ts`
- `M packages/session-tool-local/src/index.ts`
- `M packages/session-tool-local/src/session-client-in-process.ts`
- `M packages/session-tool-local/tests/http-auth.spec.ts`
- `D` 131 × `docs/`（`EVOLUTION-SUMMARY.md` / `design.md` / `research.md` / `discuss-*` / `dsh-0-1-2-upgrade/` / `session-delegation/` / `session-marks/`）
- `?? .grok/`
- `?? packages/session-tool-local/src/live-events.ts`
- `?? packages/session-tool-local/tests/live-events.spec.ts`

## vibee（15 porcelain）

kinds: `M` 8、`??` 7

结论 (a)。diff 是 vibee `sessionTool.hide` 委托会话 + review/canvas 遗留，无 dsh-bot / memory / routine 字样。

- `M docs/vibee-node-ops/review-report.md`（mtime 2026-09-01）
- `M packages/vibee-host/src/executor.ts`（mtime 2026-09-06 22:10:32；内容 `sessionTool.hide`）
- `M` 六个测试 hide stub（mtime 2026-09-06 22:10:55；last-commit 2026-09-05）
- `??` review-0903 / canvas-next / graph-paradigm / chrome-live / review-0901
- `?? docs/vibee-dify-adopt/`（mtime 2026-09-06 22:43–23:05）：邻仓自己的 Dify 包（spec/tasks/plan），不是本仓产物

mtime 落在本仓窗口内的 vibee 源/测文件：内容与本仓无关；上一棒 22:36 快照已列同一组 `M`；`vibee-dify-adopt` 证明邻仓当时另有执行者。仍不动邻仓。

Allowed vibee exemption remains only `?? .vibee/`。当前脏集不是 `.vibee/`，因此按例外登记而不是按豁免清零。

## dsh-grok-bot

本仓另有 session-nav / group-chat / workbench leftover 与未跟踪 `.grok/` `.vscode/`，不属 INV-103 修复面。`env/dsh-bot` 不在 porcelain。
