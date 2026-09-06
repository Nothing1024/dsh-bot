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

## Later live (same :3084, after model recovery)

Gateway not recycled for restart-rearm. Scripts: `remaining-pass.mjs`, `mop-live.mjs`, `mop-ui3.mjs`.

| UF | Result | Notes | Evidence |
|---|---|---|---|
| UF-901 spoke | PASS | `Nothing，现在是 … CST` | UF-901/thread-wake.png, run-now-spoke.json |
| UF-902 silent | PASS | outcome=silent | UF-902/silent-row.png |
| UF-902 lock | PASS | user turn first | UF-902/lock-order.png |
| UF-903 notify | PASS | notices=1; unread=1; badge=1 | UF-903/notification-call.json, badge.png |
| UF-903 点回清零 | PASS | unreadNodes=0 after clearUnread | UF-903/cleared.png |
| UF-903 聚焦 | PASS | notices=0 | UF-903/focused-no-notify.json |
| UF-903 5s 节流 | PASS | unread=2; notices=1 | UF-903/throttle.json |
| UF-904 关/开 | PASS | off 0→0; on grew=true | UF-904/runs-off-on-restart.md |
| UF-904 重启 rearm | BLOCKED | constructor rearmAll; process not recycled | same |
| UF-905 接受 | PASS | created `校今天的稿` | UF-905/card.png, routine-created.png, routines.json |
| UF-905 拒绝后再提 | PASS | followCards=0 | UF-905/declined-follow.json |

Unread product fix: mount `markRead` removed; `App.clearUnread` optimistic; leftover headless `/dsh-bot/ui` blanked before mop-live.

