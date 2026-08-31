# Evidence Directory — dsh-bot-group-rounds

本目录保存执行和验收证据。没有 evidence,不视为完成。

## 结构

```text
evidence/
  phase-0/calibration.md          # Task 1 三条 ASM 实测结论
  phase-1/engine-unit.log         # Task 2 多轮调度单测(含默认一轮等价)
  phase-1/queue-unit.log          # Task 3 队列/继续讨论单测
  phase-1/phase-summary.md
  phase-2/chips-unit.log          # Task 5
  phase-2/reply-unit.log          # Task 6
  phase-2/queue-ui-unit.log       # Task 7
  phase-2/phase-summary.md
  phase-3/rooms-unit.log          # Task 9
  phase-3/status-unit.log         # Task 10
  phase-3/retry-unit.log          # Task 11
  phase-3/phase-summary.md
  phase-4/standard-check.log
  phase-4/manual-test.log
  phase-4/docs-diff.md
  phase-4/final-regression.log
  phase-4/phase-summary.md
  UF-501/two-rounds.png room-export.json member-fail.md turn-cap.md member-lock.md
  UF-502/continue.png double-submit.md
  UF-503/reply.png removed-member.md
  UF-504/queue.png cancel-full.md gateway-down.md
  UF-505/retry.png
  UF-506/rooms.png legacy.md
  UF-507/regression.png v1-ask.log
```

## 命名

- EVD ID 必须能在 `spec.md` 第 2.5 节找到;截图含 UF 编号与状态。
- 房间导出 JSON 保留 speaker/seq 字段以便核对轮转与回应关系。

## Phase Summary 模板

```markdown
# Phase {N} Summary

## 完成任务
- Task ...

## 验证命令
| 命令 | 结果 | 日志 |
|---|---|---|

## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
|---|---|---|

## 剩余风险
- ...
```
