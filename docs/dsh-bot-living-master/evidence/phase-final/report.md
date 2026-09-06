# Living-master final report

Not all-done. Joint UF-101~103 verbal paths passed. Mother four-command chain is green. Child leftover 5.2 rows that were still open (extract-timeout, restart rearm, named shots) passed on this recycle. INV-103 neighbor porcelain is still dirty.

## Memory package

**Shipped (commit `2135fe6`):** store, inject, extract hooks, panel, four RPCs. `composePersona` is the only composer. `bots.json.persona` is not rewritten on inject.

**Follow-up:** `memoryForget` / `memoryClear` call `injectMemory`. After recycle, forget + `createBotSession` dropped `zebra-forget-904-unique` from the preset; new session answered `不知道。` Immediate post-forget file rewrite can still race a prior inject; the next create path is clean (`UF-803/forget-inject.json`).

**5.2 live**

| Row | Result | Evidence |
|---|---|---|
| UF-801 auto-extract | PASS | `source:auto` + profile facts |
| UF-801 抽取 timeout | PASS | askTimeoutMs=1000 after a closed 运维夜班 turn; memory 0→0; host warn `extract returned empty; will retry once`; `phase-2/extract-timeout.log` |
| UF-801 文件不可写 | PASS | `UF-801/unwritable.png` |
| UF-802 新会话答名 | PASS | `Nothing。你自己定的称呼。` |
| UF-802 旧会话 | PASS | `不知道。这轮对话里你没报过名字。` |
| UF-802 空记忆 strip | PASS | `UF-802/cordis-empty.yml` |
| UF-803 忘记后新会话 | PASS | `不知道。` after forget+create (`after-forget-ask.json`) |
| UF-803 RPC 失败 | PASS | `UF-803/forget-fail.png` |
| UF-804 📌 | PASS | mop-ui3: `source:explicit`; `UF-804/after-pin.png` |
| UF-804 房间选成员 | PASS | `UF-804/room-pick.png` |
| UF-805 寒暄 / 问号 | PASS | `UF-805/before-after-wc.txt` 2→2 |

**Still blocked**

- INV-103 neighbor porcelain (session-tool + vibee, pre-existing). This repo did not edit them.

## Routines package

**Shipped (commit `2660b81`):** store+cron, scheduler, wake (`sessionTool.write`, not `promptOwnedSession`), behavior section, seven RPCs, ⏰ panel, unread, notify helper, propose card.

**5.2 live**

| Row | Result | Evidence |
|---|---|---|
| UF-901 spoke | PASS | `Nothing，现在是 … CST` |
| UF-901 `@every 0m` | PASS | `UF-901/invalid-schedule.png` |
| UF-901 error×3 | PASS | three `outcome:error` ~1.1s; history has `[routine-system] 例程「超时探针对」连续失败 3 次`; `UF-901/error-x3.png` |
| UF-902 `(silent)` | PASS | outcome=silent |
| UF-902 lock | PASS | user turn finishes first |
| UF-903 主路径 notify | PASS | mop-live: notices=1; unread=1 |
| UF-903 点回清零 | PASS | mop-ui3 unreadNodes=0 |
| UF-903 窗口聚焦 | PASS | notices=0 |
| UF-903 5s 节流 | PASS | unread=2; notices=1 |
| UF-904 关/开 | PASS | off 0→0; on grew=true |
| UF-904 重启 rearm | PASS | recycled :3084 (pid 5302 / node 5337, this-repo DSH_HOME); `重启续跑` `@every 1m` 0→1 spoke in 64s; `rearm-after-wait.json` |
| UF-904 损坏 | PASS | write `{not-json` + recycle → `routines.json.bak` + `routineList=[]` + empty panel; `UF-904/corrupt-bak.png` |
| UF-905 接受 | PASS | mop-ui3 created `校今天的稿` |
| UF-905 拒绝后再提 | PASS | followCards=0; `UF-905/declined.png` |

## Joint UF-101/102/103

| UF | Result | Notes |
|---|---|---|
| UF-101 | PASS named wake + switcher | history `Nothing，现在是 2026-09-06 19:12 CST。`; named shot `wake-with-name.png` is `例程 · 重启续跑` `Nothing，现在是 2026-09-06 22:11 CST。` |
| UF-102 | PASS pin + no auto extract + compose stable | two `explicit` rows; no `source:auto`; named `pinned.png` opens 校对阿宁 memory panel with `你标记的` |
| UF-103 | PASS v1/v2/group + auto-extract + delete leftover | v1 `listSessions` 200 / 162 sessions. Named shots now on disk: `v2-isolation.png` (阿宁「校对阿宁。专挑措辞。」+ 小北铜镜), `group-round.png` (编辑室「你们是谁？」一轮两句). Hidden `~dsh-bot:` stays filtered. deleteBot leftover `enabled=false`. |

Named-shot refresh (`shot-mother-names3` + `shot-v2-aning`; `shot-mother-names2` exit 2 was superseded): `wake-with-name.png` textOk; `pinned.png` textOk (`你标记的`); `v2-aning.png` is the conversation (not the memory panel) `校对阿宁。专挑措辞。`; `v2-xiaobei.png` 铜镜; `group-round.png` 一轮两句. `v2-isolation.png` restiched from those two 1400×900 shots. `validate_package.py` after refresh: memory 0 FAIL / 1 WARN / 21 PASS (16/16); routines 0 FAIL / 1 WARN / 21 PASS (19/19); mother 0 FAIL / 0 WARN / 17 PASS (11/11).

## Four commands

Green as a single `&&` chain (`evidence/phase-final/final-commands.log`):

- `pnpm run typecheck` rc=0
- `pnpm run build` rc=0
- `pnpm test` rc=0 — 40 files / 296 tests
- `pnpm run standard:check` rc=0
- `pnpm install --frozen-lockfile` rc=0

Red-line `rg -i 'anysphere|sand://' packages/ env/ scripts/` empty. `env/dsh-bot` not in git.

## Neighbor / git hygiene

`env/dsh-bot/` stays untracked. Neighbors not edited (`inv-103-porcelain.md`).

## Stop-loss (do not close)

1. INV-103 — `session-tool/plugin` and `vibee/plugin` pre-existing dirty porcelain. 邻仓零改. Mother Task 5 stays `已阻塞:INV-103`.
2. Forget→inject may leave the previous preset text until the next `createBotSession` inject (UF-803 new-session path still holds).

Mother Task 5 remains `已阻塞:INV-103`.
