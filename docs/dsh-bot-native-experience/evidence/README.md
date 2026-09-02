# 证据收存目录

本目录按 spec.md 第 2.5 节(EVD) 和 5.3 节(Evidence 目录结构)组织，记录每个 Phase 和每条 UF 的验收证据。

## 目录结构

```
evidence/
  phase-0/          # Stage 1 validate_package.py 校验输出
  phase-1/          # Task 2-3 完成证据（快捷键 hook、命令面板 UI）
  phase-2/          # Task 4-5 完成证据（emoji picker、右键菜单）
  phase-3/          # Task 6-7 完成证据（reply 状态、后端评估）
  UF-001/           # 命令面板打开与导航
    - cmd-k-open.png
    - selection.png
    - composer-focus.png
  UF-002/           # 快捷键系统与 Composer 共存
    - shortcut-response.log
    - no-conflict.md
  UF-003/           # Emoji Picker 插入
    - emoji-insert.png
    - sent-message.png
    - fallback.md (如有降级)
  UF-004/           # 小组消息回复引用
    - reply-menu.png
    - reply-card.png
    - tree-display.png
    - clear-reply.png
  phase-final/      # 最终验收
    - report.md     # 总报告
    - final-regression.log  # 四条命令输出
```

## 命名规则

- 截图：`UF-xxx-<操作>.<ext>`，如 `UF-001-cmd-k-open.png`
- 日志：`<操作>.<ext>`，如 `shortcut-response.log`
- 文档：`<操作>.md`，如 `no-conflict.md`

## 填充时机

- Task 1-7 完成：对应 phase-N/ 下放任务完成日志
- Task 8 (5.2 测试)：按执行矩阵逐行收集证据到 UF-xxx/
- Task 9 (收尾)：生成 phase-final/report.md 和命令日志

## 使用方式

每条 UF 和每个 Phase 都应该有至少一份可验证的证据（截图、日志、markdown 文档）来支撑「已完成」的结论。
