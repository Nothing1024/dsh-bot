# Remaining 5.2 replay (current)

Superseded as the live leftover board by `leftover-close-matrix.md` and `live-remaining-matrix.md`.
This file is kept so older pointers do not re-open closed rows.

Latest close: leftover-close + named-shot refresh + `validate-three` (2026-09-06).

| PASS | FAIL | BLOCKED |
|---|---|---|
| child 5.2 verbal rows + mother named shots + v1 listSessions + extract-timeout + restart rearm | 0 | INV-103 only |

| Row | Result | Notes | Driver |
|---|---|---|---|
| UF-903 主路径 notify | PASS | notices=1; unread=1; badge=1 | mop-live |
| UF-903 点回清零 | PASS | unreadNodes=0 after `clearUnread` | mop-ui3 |
| UF-903 窗口聚焦 | PASS | notices=0; outcome=spoke | mop-live |
| UF-903 5s 节流 | PASS | unread=2; notices=1 | mop-live |
| UF-804 📌 | PASS | explicit=true; seq=58 | mop-ui3 |
| UF-804 房间选成员 | PASS | pin pick visible | remaining-pass2 |
| UF-905 提议卡接受 | PASS | createdRoutine=true; 校今天的稿 | mop-ui3 |
| UF-905 拒绝后再提 | PASS | followCards=0; `declined.png` | leftover-close |
| UF-803 忘记后新会话 | PASS | 不知道。这段记忆里没有你的名字。 | remaining-pass |
| UF-904 关/开 | PASS | off 0→0; on grew=true | remaining-pass |
| UF-904 重启 rearm | PASS | 0→1 spoke in 64s after recycle | leftover-close |
| UF-801 抽取 timeout | PASS | 运维夜班 0→0; host warn retry once | leftover-close |
| v1 listSessions RPC | PASS | 200 / 162 sessions (workbench fallback) | leftover-close |
| mother 5.2 named shots | PASS | wake-with-name / pinned / v2-isolation / group-round | shot-mother-names3 |
| INV-103 邻仓 porcelain | BLOCKED | session-tool + vibee pre-existing; 邻仓零改 | inv-103-porcelain.md |
