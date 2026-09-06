# Routines 5.2 real-run

Gateway: :3084 `DSH_HOME=.../dsh-grok-bot/plugin/env` pid after rebuild. Playwright `channel:'chrome'` from `dsh-genoffice/engine/node_modules/playwright`. Bot「运维夜班」`yunwei-yeban` created this pass.

## Matrix

| UF | Result | Notes | Evidence |
|---|---|---|---|
| UF-901 主路径 list/create | PARTIAL | 列表与「报时」`@every 1m` 可建；≤70s 徽标/主动气泡未出现（唤醒 error） | UF-901/panel-after-create.png, UF-901/routines.json |
| UF-901 非法时间 | PASS | `@every 0m` 内联「时间文本不合法，或创建失败」 | UF-901/invalid-schedule.png, invalid-schedule.txt |
| UF-901 唤醒出错 ×3 | PASS | `routineRunNow` ×3 → `lastOutcome:error`；第 3 次写入 `[routine-system] 例程「报时」连续失败 3 次，先不自动开口。` | phase-2/wake-error.log, UF-901/wake-session-history.json |
| UF-902 silent | BLOCKED | 模型 503 无 `(silent)` 回复。单测覆盖精确匹配 | routine-wake.spec.ts |
| UF-902 撞用户轮次 | BLOCKED | 无活模型重叠验证。`withPromptLock` + scheduler `running` 单测覆盖 | routine-scheduler.spec.ts |
| UF-903 未读/通知 | BLOCKED | unread 只在 spoke 递增；error 不加徽标。notify 单测覆盖 hidden+5s | notify.spec.ts |
| UF-904 开关 | PARTIAL | `enabled` 热切有效；未等 2 分钟看 runs。单元 disable-zero-fire | UF-904/runs-off-on-restart.md |
| UF-904 损坏 | PASS | 写坏 `routines.json` → `.bak` + 空列表；已还原 | UF-904/routines.json.bak, corrupt-note.md |
| UF-905 提议卡 | BLOCKED | 无模型输出 propose 块。投影与卡片单测覆盖 | transcript.spec / workbench-sessions.spec |

## Compose order (no model required)

`createBotSession` / wake `ensureSession` 先 `injectMemory`。`env/.agent-presets/dsh-bot--yunwei-yeban/agent.cordis.yml` persona 顺序：基础 → `## 你记得的事`（近期记录：用户叫 Nothing）→ `## 行为规范`。`bots.json.persona` 仍是基础句，未改。

## Empty copy

诗人小北无例程：`没有例程。到点它会自己醒来，有事才说。` — UF-901/empty-panel.png / empty-copy.txt

## Pills

`["memory-open","routines-open"]` — 🧠 在 ⏰ 左。phase-3/pills-order.json

## API-907

list/create/update/delete/run-now/mark-read 均为 HTTP 200 `{ok:true}`。
