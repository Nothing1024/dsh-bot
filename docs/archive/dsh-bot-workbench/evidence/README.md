# Evidence Directory

本目录保存 dsh-bot-workbench 的执行与验收证据。没有 evidence,不视为完成(spec 5.2 是完成的唯一标准)。

## 结构

```text
evidence/
  phase-0/   # calibration.md、skeleton.png、static-route.log、tab-iframe.png、phase-summary.md
  phase-1/   # bots-unit.log、roster-unit.log、phase-summary.md
  phase-2/   # session-api.log、transcript-unit.log、composer-unit.log、phase-summary.md
  phase-3/   # phase-summary.md
  phase-4/   # standard-check.log、manual-test.log、docs-diff.md、v1-regression.md、phase-summary.md
  UF-201/    # tab.png、standalone.png、gateway-down.png、first-run.png
  UF-202/    # create-and-chat.png、session-export.json、invalid-input.md、double-submit.md
  UF-203/    # isolation.png、exports/、concurrent.md
  UF-204/    # edit-persona.png、write-fail.md
  UF-205/    # reconcile.png、marks-diff.txt、v1-sessions.md
  UF-206/    # delete.png、preset-list-diff.txt、default-protected.png
```

## 命名

- EVD ID 必须能在 `../spec.md` 第 2.5 节找到;截图命名含 UF 编号与状态。
- 命令输出保存完整命令、时间、结果摘要。

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
