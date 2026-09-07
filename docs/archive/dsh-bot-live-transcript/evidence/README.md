# Evidence Directory

本目录保存 dsh-bot-live-transcript 的执行与验收证据。EVD ID 与 `../spec.md` §2.5 一一对应；没有 evidence 不视为完成。

## 结构

```text
evidence/
  phase-0/            # calibration.md（ASM-011~014 实测）
  phase-1/ ~ phase-5/ # 命令输出
  UF-011/ ~ UF-015/   # 截图 + Network
  API-016/            # curl SSE 与 prompt/cancel
```

## 命名

- 文件名与 spec §5.2 执行矩阵 Evidence 列逐字一致。
- Network 导出保存 HAR 或截图，不手改。

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
