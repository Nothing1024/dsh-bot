# Evidence Directory — dsh-bot-session-nav

本目录保存执行和验收证据。没有 evidence,不视为完成。

## 结构

```text
evidence/
  phase-0/calibration.md            # Task 1 五条 ASM 实测结论
  phase-1/bridge-unit.log           # Task 2 页签桥单测
  phase-1/jump-ui-unit.log          # Task 3 跳转入口单测
  phase-1/phase-summary.md
  phase-2/title-unit.log            # Task 5 起题单测
  phase-2/hidden-unit.log           # Task 6 收纳单测
  phase-2/session-actions-unit.log  # Task 7 会话动作单测
  phase-2/phase-summary.md
  phase-3/overview-unit.log         # Task 9
  phase-3/sse.log                   # Task 10 curl -N 样例
  phase-3/phase-summary.md
  phase-4/standard-check.log
  phase-4/manual-test.log
  phase-4/docs-diff.md
  phase-4/regression.md             # v1/v2/v3 抽验
  phase-4/final-regression.log
  phase-4/phase-summary.md
  UF-401/jump-tab.png jump-hidden.png standalone-fallback.png bad-message.md
  UF-402/hidden-on.png hidden-off.png marks.txt legacy.md
  UF-403/auto-title.png manual-rename.png invalid-input.md
  UF-404/archive.png archive-rpc.txt gateway-down.md double-submit.md
  UF-405/realtime.png network.png sse-fallback.md
```

## 命名

- EVD ID 必须能在 `spec.md` 第 2.5 节找到;截图含 UF 编号与状态。
- 命令输出保存完整命令、时间、结果摘要。

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
