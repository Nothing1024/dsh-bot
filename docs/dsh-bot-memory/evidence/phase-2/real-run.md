# Memory 5.2 real-run (2026-09-06)

Gateway: 127.0.0.1:3084 this-repo env/. Model: grok-4.6 → 503 model_not_found (no assistant text).

## Matrix

| Row | Result | Evidence | Note |
|---|---|---|---|
| UF-801 主路径 auto-extract | BLOCKED | UF-801/profile.md seeded | No assistant close; extract never starts. Panel rendered from seeded profile + remember. |
| UF-801 panel | PASS (seeded) | UF-801/panel.png | 🧠 3; 关于用户 two auto rows; 日志 你标记的. Session list shows workspace/follow HTTP 401. |
| UF-801 抽取失败 timeout | BLOCKED | — | Extract never invoked; cannot lower askTimeoutMs usefully. |
| UF-801 文件不可写 | PASS | UF-801/unwritable.png | chmod 000 → 记忆暂不可用; restored 0755. |
| UF-802 主路径 答 Nothing | BLOCKED | — | No model reply. |
| UF-802 cordis inject | PASS | UF-802/cordis-after-inject.yml | Heading + Nothing after createBotSession. |
| UF-802 旧会话 | BLOCKED | — | No model reply. |
| UF-802 记忆为空 | PASS | UF-802/cordis-empty.yml | After memoryClear + createBotSession, no 你记得的事. Fixed stripMemorySection (file-as-base contamination). |
| UF-803 忘记 | PASS (panel+file) | UF-803/after-forget.png, log.jsonl | 用户叫 Nothing gone; tombstone note in log.jsonl. New-session unknown BLOCKED (no model). |
| UF-803 RPC 失败 | PASS | UF-803/forget-fail.png | Playwright fulfilled memoryForget ok:false; toast 忘记失败; row restored. |
| UF-804 📌 | BLOCKED | — | Empty transcript; no assistant row. Unit: transcript.spec.tsx. |
| UF-804 房间选成员 | BLOCKED | — | Same; group 编辑室 exists. Unit covers pick. |
| UF-805 寒暄 | PARTIAL | UF-805/before-after-wc.txt | log.jsonl line count unchanged after prompt 谢谢. Extract hook also requires assistant row. shouldExtract unit green. |
| UF-805 短句问号 | PARTIAL | UF-805/question-mark.txt | shouldExtract("为什么？")=true unit only. |
| API-806 | PASS | API-806/*.json | Four RPCs ok:true. |

## Stop-loss

1. grok-4.6 503 / no channel — blocks verbal UF-801/802/803/804/805 extract paths.
2. listBotSessions → workspace/follow HTTP 401 — roster session counts / switcher error visible in screenshots; memory RPCs and 🧠 still work.
3. Pre-existing managed bots had no bots.json.persona; inject used file persona (already included memory). Fixed by stripMemorySection in toView + injectMemory.
4. pnpm test / tsc frozen lockfile + SessionId brand clash — use ./node_modules/.bin/vitest only.
