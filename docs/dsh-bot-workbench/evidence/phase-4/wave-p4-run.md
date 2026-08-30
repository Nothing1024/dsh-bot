# Wave P4 run (Task 18-19, review-fix)

## validate_package.py
`python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench`
See this file's follow-up command log. Target: 0 FAIL.

## tests
`pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check`
Prior Task 19: host 76 / workbench-ui 43 / ui-dsh-bot 11 / tool-dsh-bot 5; standard:check 全部通过. Re-run after review-fix (docs-only).

## review-fix
- UF-203: sidA.json items>0 DSH Bot 口吻; sidB 诗人小北诗; isolation.png 非空历史+草稿
- UF-205: 官方 GUI 新会话 composer（v1-gui-chat.png）; session.create 无 marks → 打开 `/dsh-bot/ui` 后 `bot:dsh-bot`（未 POST reconcile）
- UF-206: official-rail.png 删除人设后官方 GUI 仍打开 t18fix-poet-hist
- v1 UF-001: v1-gui-chat.png 官方对话面，不是空白落地页
- task18-matrix.md 15/15 PASS
