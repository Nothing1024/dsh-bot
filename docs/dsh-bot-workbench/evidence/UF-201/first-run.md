# UF-201 首次空态

Date: 2026-08-30 (review fix).

一口一仓 :3084 的 live `DSH_HOME=env/` 不能清掉（会毁掉 GUI 直建/对账会话）。本图用 Playwright `page.route` 把

- `POST /dsh-bot/listBots` → 仅种子 `{id:dsh-bot,name:DSH Bot,protected:true}`
- `POST /dsh-bot/listBotSessions` → `{sessions:[]}`
- `POST /dsh-bot/reconcile` → 空 assigned

钉成 2.7 空数据：roster 只有种子 DSH Bot，对话面「还没有对话」CTA，会话下拉为「新对话」，「包含隐藏」开关可见且默认关。

`first-run.png` 即该 UI。不是脏 env 里点「新开对话」的截图。
