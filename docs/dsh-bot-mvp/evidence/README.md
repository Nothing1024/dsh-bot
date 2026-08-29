# Evidence Directory

本目录保存 dsh-bot-mvp 的执行与验收证据。没有 evidence,不视为完成(spec 5.2 是完成的唯一标准)。

## 结构

```text
evidence/
  phase-0/   # scaffold.log、boot.log、rpc-who.txt、plugin-inventory.json、model-smoke.md、calibration.md、phase-summary.md
  phase-1/   # preset-list.json、命令输出、phase-summary.md
  phase-2/   # host-unit.log、tool-unit.log、phase-summary.md
  phase-3/   # rpc-samples/、ui-unit.log、no-sidebar.md、phase-summary.md
  phase-4/   # standard-check.log、manual-test.log、phase-summary.md
  UF-001/    # success.png、session-history.json、missing-key.md、upstream-error.md
  UF-002/    # tool-call.md、marks.txt、rail-check.png、gateway-down.md、timeout.md、concurrent.md
  UF-003/    # tab-list.png、create-jump.png、rpc-error.png、empty.png
  UF-004/    # marks-list.txt
  UF-005/    # switch-in-session.md、default-switch.md、missing-cred.md
  UF-006/    # override-on.md、override-off.md、override-invalid.md
```

## 命名

- EVD ID 必须能在 `../spec.md` 第 2.5 节找到。
- 截图文件名含 UF 编号与状态:`UF-001-success.png`。
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
