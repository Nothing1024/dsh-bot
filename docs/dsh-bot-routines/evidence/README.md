# Evidence Directory

本目录保存 dsh-bot-routines 的执行与验收证据。EVD ID 与 `../spec.md` §2.5 一一对应；没有 evidence 不视为完成。

## 结构

```text
evidence/
  phase-0/            # calibration.md（ASM-901~904 实测）
  phase-1/ ~ phase-4/ # 命令输出；phase-2 含 wake-error.log；phase-4 含 docs-diff.md、final-commands.log
  UF-901/ ~ UF-905/   # 截图 + routines.json 快照 + Notification stub 调用记录 json
  API-907/            # list / create / update / delete / run-now / mark-read .json
```

## 命名

- 文件名与 spec §5.2 执行矩阵 Evidence 列逐字一致。
- `routines.json` 快照直接 `cp`，不手改；涉及等待触发的场景在文件名旁记录等待时长。

## Phase Summary 模板

```markdown
# Phase {N} Summary
## 完成任务
## 验证命令
| 命令 | 结果 | 日志 |
## 用户路径 / API 验证
| UF/API | 结果 | Evidence |
## 剩余风险
```