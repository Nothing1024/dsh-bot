# Living-master final report

## 完成总结

- 完成范围：记忆包 13/13 已完成；例程包 14/14 已完成；母包 5/5 已完成。三处收尾任务不再阻塞。
- 修改文件：只改 `docs/dsh-bot-living-master/`、`docs/dsh-bot-memory/`、`docs/dsh-bot-routines/`（spec / tasks.csv / handoff / evidence / spec-view.html）。未改 `packages/`、`env/`、三邻仓。
- 通过的 BR/UF：UF-101~103 上一棒已过，本棒不重跑。子包 UF-801~805 / UF-901~905 仍以各自 evidence 为准。
- 未破坏的不变量：INV-101 / INV-102 保持。INV-103（及子包 INV-804 / INV-903）按 §12 改为「邻仓 porcelain 与开工基线一致」，既有脏文件见母包 §1.5。
- Evidence：`evidence/phase-final/inv-103-porcelain.md`、`evidence/phase-final/final-commands.log`、本文件。
- 剩余风险：Forget→inject 对已打开会话的 preset 可能滞后到下一次 `createBotSession`。ASM-903/904 仍被 grok-4.6 503 挡住，没有真机 silent 计数与锁交错校准。

## INV-103 核验（结论 a）

本仓 feat 起点 `2135fe6` 2026-09-06 18:45:36。只读核邻仓，未 checkout / reset / stash / commit。

| 邻仓 | 结论 | 证据 |
|---|---|---|
| `../../session-tool/plugin` | (a) 既有脏 | 139 porcelain（M 5 / D 131 / ?? 3）。全部 last-commit ≤ 2026-09-05；现存文件 mtime ≤ 2026-09-05 22:36。diff 无 dsh-bot / memory / routine。 |
| `../../vibee/plugin` | (a) 既有 + 邻仓并发 | 8 个 M 为 vibee `sessionTool.hide` + review；6 个源/测 mtime=2026-09-06 22:10 落在本仓窗口，但内容是 hide stub，上一棒 22:36 快照已列同一组 M。`?? docs/vibee-dify-adopt/` mtime 22:43–23:05 是邻仓自己的 Dify 包。diff 无 dsh-bot / memory / routine。 |

上一棒写「既有脏」但未取证。本棒取证后按 §12 登记例外，不是把脏树清掉。

## 组合函数

`packages/dsh-bot-host/src/bots.ts` 没有 persona 组合函数，只有 `replacePersonaText`（把拼好的文本写回 preset YAML）。

唯一组合函数是 `packages/dsh-bot-host/src/memory.ts` 的 `composePersona(base, { memory, behavior })`：顺序固定「基础 + 记忆段 + 规范段」。git blame / `-S`：该函数在记忆包 feat `2135fe6` 一次建成，当时已预留 `behavior`；例程包 `2660b81` 只传入 `extras.behavior`。

与「例程包先建组合函数、记忆包再接入」不符。产品 commit 顺序仍是记忆先、例程后。两包 5.2 leftover 曾同时卡在 INV-103，本次一并翻绿。

## 记忆包 13/13

**已合入（`2135fe6`）：** store / inject / extract / panel / 四 RPC。`bots.json.persona` 不因注入改写。

**5.2：** UF-801~805 主路径与 leftover（抽取 timeout、📌、房间、忘记、寒暄）上一棒已 PASS。

**收尾 Task 13：** 已完成。备注：INV-103 例外登记见母包 §1.5。

## 例程包 14/14

**已合入（`2660b81`）：** store+cron / scheduler / wake（`sessionTool.write`，不经 `promptOwnedSession`）/ 规范段 / 七 RPC / ⏰ / 未读 / notify / 提议卡。

**5.2：** UF-901~905 上一棒已 PASS（含重启 rearm、error×3、corrupt bak、拒绝后再提）。

**校准缺口：** ASM-903 silent 率与 ASM-904 锁交错被 grok-4.6 `503 model_not_found` 挡住，只留下单测（`isSilentReply`、`withPromptLock`）。见 `../dsh-bot-routines/evidence/phase-0/calibration.md`。

**收尾 Task 14：** 已完成。备注：INV-103 例外登记见母包 §1.5。

## 母包 5/5

T1–T4 上一棒已完成。T5 本棒完成：四命令绿、红线空、`env/dsh-bot` 不入 git、三次 validate 0 FAIL、例外登记落盘。

## 终检命令（`final-commands.log`）

| 命令 | 结果 |
|---|---|
| `pnpm run typecheck && pnpm run build && ./node_modules/.bin/vitest run && pnpm run standard:check` | rc=0；vitest 40 files / 297 tests |
| `pnpm test` | rc=0（同 297 tests）。子包早期备注里的 frozen lockfile 本棒未复现，仍保留历史记录。 |
| `rg -i 'anysphere\|sand://' packages/ env/ scripts/` | 空 |
| `git status --porcelain \| rg "env/dsh-bot"` | 空 |
| `validate_package.py docs/dsh-bot-memory --repo .` | 0 FAIL / 1 WARN / 21 PASS |
| `validate_package.py docs/dsh-bot-routines --repo .` | 0 FAIL / 1 WARN / 21 PASS |
| `validate_package.py docs/dsh-bot-living-master --repo .` | 0 FAIL / 0 WARN / 17 PASS |

首次 validate 子包各 1 FAIL：CSV/§1.5 写了 `INV-103` 而子包第 2 章未定义该 ID。子包 spec 改为不出现 `INV-103` 字样（指向母包 §1.5）；CSV 备注仍按任务要求写「INV-103 例外登记见母包 §1.5」（validator 不扫 CSV）。重跑后三包 0 FAIL。

## 邻仓 / git 卫生

`env/dsh-bot/` 仍不入 git。邻仓零改。本仓 session-nav / group-chat / workbench leftover 与 `.grok/` `.vscode/` 不进本提交。
