# Task 18 matrix (review-fix)

时间: 2026-08-30
网关: `127.0.0.1:3084` this-warehouse

```
PASS UF-201 dual-entry — tab.png + standalone.png
PASS UF-201 gateway-down — gateway-down.png 错误态+重试
PASS UF-201 first-run — first-run.png 种子+空 CTA
PASS UF-202 main — create-and-chat.png + session-export.json 诗人小北口吻
PASS UF-202 invalid — invalid-input.md
PASS UF-202 double-submit — double-submit.md
PASS UF-203 isolation — isolation.png 非空 DSH Bot 历史+草稿; exports/sidA.json items>0; sidB 诗人小北诗
PASS UF-203 concurrent — concurrent.md
PASS UF-204 edit — edit-persona.png + take-effect hint
PASS UF-204 write-fail — write-fail.md
PASS UF-205 gui-reconcile — 官方 GUI 新会话/composer（v1-gui-chat.png）; session.create 无 marks → 打开 /dsh-bot/ui 后 bot:dsh-bot（marks-diff.txt）; 未 POST /dsh-bot/reconcile
PASS UF-205 v1-legacy — v1-sessions.md
PASS UF-206 delete — delete.png roster 无小北; preset dir 删; official-rail.png 官方 GUI 仍打开 t18fix-poet-hist / 诗人小北
PASS UF-206 protected — default-protected.png
PASS v1 regression — v1-gui-chat.png 官方对话面 DSH Bot 回复; v1-regression.md dsh_bot_ask + iframe
```

Canonical first run had a Playwright strict-mode FAIL on `dsh-bot-tab|dsh-bot-iframe`; iframe path was re-shot (`tab.png`, `v1-tab-iframe.png`) and this review-fix matrix is all PASS.
