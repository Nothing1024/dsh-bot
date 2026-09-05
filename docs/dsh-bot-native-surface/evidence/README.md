# Evidence Directory

本目录用于保存执行和验收证据。没有 evidence，不视为完成。EVD ID 与 `../spec.md` §2.5 一一对应。

## 结构

```text
evidence/
  phase-0/            # calibration.md（ASM-701~704 实测结论）、hero-preset-menu.png
  phase-1/            # typecheck / test / manual-test 输出
  phase-2/            # 命令输出、task4-tests.log、task7-tests.log、no-sidebar.log
  phase-3/            # 命令输出、直开抽验截图
  phase-4/            # docs-diff.md、final-commands.log
  UF-701/ ~ UF-705/   # 截图（含 UF 编号与状态）、*-dom.json、console log
  API-705/            # identity-bot.json / identity-plain.json / identity-missing.json
```

## 命名

- 截图：`footer-wide.png`、`bot-session-header.png` 等，与 spec §5.2 执行矩阵 Evidence 列逐字一致。
- DOM 断言：`*-dom.json`，用 `data-slot` 选择器抓取，不认 hash class。
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