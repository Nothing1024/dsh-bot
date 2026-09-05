# Evidence Directory

本目录保存 dsh-bot-memory 的执行与验收证据。EVD ID 与 `../spec.md` §2.5 一一对应；没有 evidence 不视为完成。

## 结构

```text
evidence/
  phase-0/            # calibration.md（ASM-801~804 实测）
  phase-1/ ~ phase-4/ # 命令输出；phase-2 含 extract-timeout.log；phase-4 含 docs-diff.md、final-commands.log
  UF-801/ ~ UF-805/   # 截图 + 记忆文件快照（profile.md / log.jsonl / cordis-*.yml）
  API-806/            # list.json / remember.json / forget.json / clear.json
```

## 命名

- 文件名与 spec §5.2 执行矩阵 Evidence 列逐字一致。
- 记忆文件快照直接 `cp` 真实文件，不手改。

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