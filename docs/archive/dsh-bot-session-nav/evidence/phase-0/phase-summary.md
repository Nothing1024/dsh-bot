# Phase 0 Summary

## 完成任务
- Task 1 校准跳转/起题/归档/事件源五条机制

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `dsh-rpc-who.sh 3084` | 本仓 `env/`,未占 3080/3081/3083 | `calibration.md` §0 |
| Playwright ASM-401/402 | 可见/隐藏 open 落地;归档不落地;iframe postMessage 可达 | `calib-jump.json` `calib-browser.json` |
| `session.rename` + prompt | 钉题不被 first-prompt 覆盖 | `asm403-rename-turn.json` |
| `session.list` / `workspace.list` / session-marks `put` | 无 archived 行字段;archivedSessionIds 有效;put 可摘 tag | `asm404-*.json` `marks-rewrite.json` |
| 临时 `ctx.on('session/event')` | subscribed,样例 chunk/message/turn/end | `asm405-events.json` |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| P0 无 UF(校准) | ASM-401~405 全消解 | `calibration.md` |
| BR-401 分支 | 隐藏直接 open | `calib-jump.json` |
| BR-404 分支 | 真归档,不降级隐藏 | `asm404-membership.json` |
| BR-406 分支 | session/event 只读订阅 | `asm405-events.json` |

## 剩余风险
- 归档会话 `sessions.open` 不能落地,工作台默认列表必须排除 `archivedSessionIds`。
- Task 7 必须走真归档(`platform.archiveSession`),禁止因 list 行无 archived 字段做成隐藏(§12 已改 BR-404)。
- Task 10 只在 plugin ctx 订一次 `session/event`,勿同时订 root(会双份)。
- 临时代码已从产品源撤回;本 Phase 豁免回归(P0 单实现任务)。
