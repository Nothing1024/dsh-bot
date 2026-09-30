# Evidence Directory — dsh-bot-group-rounds-v2

本目录保存执行和验收证据。没有 evidence，不视为完成。EVD ID 定义见 `../spec.md` §2.5，5.2 矩阵路径见 §5.2。

## 结构

```text
evidence/
  phase-0/      baseline.log（Task 1 基线）、calibration.md（ASM-001/002）、commands.log
  phase-1/      commands.log
  phase-2/      commands.log、api-samples.md（三个新 RPC 的 request/response）
  phase-3/      commands.log、冒烟截图
  phase-4/      manual-test.log
  phase-final/  final-commands.log
  UF-001/       引用即点名：success.png、mention-override.png、quote-self.png、console.log
  UF-002/       轮内排队：queued.png、queue-full.png、stop.png、network.log
  UF-003/       继续讨论：success.png、disabled.png
  UF-004/       删房间：success.png、cancel.png、busy.png、rooms-diff.txt
  UF-005/       回归：regression.png、one-on-one.png
```

## 命名

- 截图文件名写场景和状态，放在对应 `UF-xxx/` 下。
- 命令输出保存完整命令、时间、结果摘要。
- 既有失败（`packages/tool-dsh-bot/`）以 `phase-0/baseline.log` 为准，后续比对失败集合是否扩大。

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
