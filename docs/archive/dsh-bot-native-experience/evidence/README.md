# 证据收存目录

按 `../spec.md` 第 2.5 节（EVD 清单）与 5.3 节（目录结构）组织。**spec.md 是唯一事实源**，本文件只做落盘导航，不复制 EVD 定义。

## 目录结构

```text
evidence/
  phase-0/          # Task 1：Stage 1 校验输出
    stage1-validate.log
  phase-1/          # Task 2-3：快捷键 hook、命令面板（含 Phase 1 聚合回归）
    shortcut-hook.log
    command-palette-ui.log
    phase1-regression.log
  phase-2/          # Task 4-5：emoji picker、回复菜单（含 Phase 2 聚合回归）
    emoji-picker.log
    build-size.txt
    reply-menu.log
    phase2-regression.log
  phase-3/          # Task 6-7：reply 状态、后端评估结论
    reply-state.log
    reply-backend-assessment.md
  UF-001/           # EVD-001
    cmd-k-open.png
    selection.png
    composer-focus.png
  UF-002/           # EVD-002
    shortcut-response.log
    no-conflict.md
  UF-003/           # EVD-003
    emoji-insert.png
    sent-message.png
    fallback.md          # 仅降级分支触发时产出；未触发写「不适用」
  UF-004/           # EVD-004
    reply-menu.png
    reply-card.png
    tree-display.png
    clear-reply.png
  phase-final/      # Task 9：EVD-005
    report.md
    final-regression.log
```

## 填充时机

| 阶段 | 落盘内容 |
|---|---|
| Task 1 | `phase-0/stage1-validate.log`（已落盘） |
| Task 2-3 | `phase-1/*`；Task 3 兼 Phase 1 聚合回归（spec 内嵌表留豁免痕） |
| Task 4-5 | `phase-2/*`；Task 5 兼 Phase 2 聚合回归 |
| Task 6-7 | `phase-3/*` |
| Task 8 | 按 spec 5.2 执行矩阵 8 行逐条收集到 `UF-00x/` |
| Task 9 | `phase-final/*` |

## 纪律

- 路径一律相对本目录；spec 5.2 矩阵 Evidence 列的路径必须与此处实际落盘一致（Task 8 完成后重跑 `validate_package.py` 做证据审计）。
- 未触发的失败分支不留空文件，在对应 `.md` 里写明「不适用 + 原因」。
- 运行数据（`groups.json`、rooms jsonl、env 凭据）不得进入本目录。