# Evidence Directory

本目录用于保存 `dsh-bot-left-tab` 的执行和验收证据。没有 evidence，不视为完成。

## 结构（与 spec.md §5.3 一致）

```text
evidence/
  phase-0/
    calibration.md          # ASM-601~605 逐条结论 + ctx.slots.entries 输出
    shadow-on.png           # priority -1 遮蔽后左栏
    shadow-off.png          # dispose 后官方树恢复
    git-status-before.txt   # INV-604 基线
  phase-1/  commands.log toggle.png phase-summary.md
  phase-2/  commands.log roster.png open-session.png phase-summary.md
  phase-3/  commands.log popover.png phase-summary.md
  phase-4/  commands.log hmr.png final-summary.md
  UF-601/   bot-mode.png after-reload.png load-error.png empty.png console.log
  UF-602/   sessions-restored.png console.log
  UF-603/   open-existing.png create-new.png create-failed.png archived-fallback.png createBotSession.json
  UF-604/   rail.png expanded.png rail-error.png
  UF-605/   identity-bar.png memory-popover.png plain-session.png orphan-preset.png
  UF-606/   group-jump.png tab-cold.png
  UF-607/   unread.png read.png poll-fallback.log
```

## 命名

- `EVD-6xx` 必须能在 `spec.md` §2.5 找到。
- 截图文件名与 §5.2 执行矩阵的 Evidence 列一字不差。
- `commands.log` 保存完整命令、时间、退出码、结果摘要。

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
