# Phase 0 Summary

## 完成任务
- Task 1 校准隐藏轮次会话与 history 形状
- Task 2 执行 Phase 0 回归验证

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|
| `dsh-rpc-who.sh 3084` | pid=34032, DSH_HOME=本仓 `env/` | `calibration.md` |
| `POST /dsh-bot/listBotSessions` 默认 | 64 行, hidden=0, 校准 id 不在 | `calibration.md` |
| `POST /dsh-bot/listBotSessions` includeHidden | 83 行, hidden=19 | `calibration.md` |
| `POST /dsh-bot/history` 1:1 | 无 author 字段 | `calibration.md` |
| spec 1.4 ASM-301 | 已删除并回写 1.3 | spec.md |

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|
| BR-305 默认列表 | 通过 | `evidence/phase-0/calibration.md` |
| ASM-301 复用隐藏会话 | 消解为复用 | 同上 |

## 剩余风险
- 网关 `createBotSession` 后再改 `~` 标题的会话不一定进入 `sessionTool.list`;轮次引擎必须用 marks 查找,不能用 `listBotSessions` 当索引。
