# Evidence Directory

本目录保存 dsh-bot-group-chat 的执行与验收证据。没有 evidence,不视为完成(spec 5.2 是完成的唯一标准)。

## 结构

```text
evidence/
  phase-0/   # calibration.md、phase-summary.md
  phase-1/   # groups-unit.log、api.log、roster-unit.log、phase-summary.md
  phase-2/   # engine-unit.log、session-api.log、phase-summary.md
  phase-3/   # phase-summary.md
  phase-4/   # standard-check.log、manual-test.log、docs-diff.md、final-regression.log、phase-summary.md
  UF-301/    # create-group.png、too-few.md、first-run.md
  UF-302/    # round.png、room-export.json、member-fail.md、gateway-down.md、double-submit.md
  UF-303/    # mention.png、unmatched.md
  UF-304/    # members.png、too-few.md
  UF-305/    # delete.png、list-bots.txt
  UF-306/    # one-on-one.png、v1-ask.log
```

## 命名

- EVD ID 必须能在 `../spec.md` 第 2.5 节找到。
- 截图文件名含 UF 编号与状态。

## Phase Summary 模板

```markdown
# Phase N Summary

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
