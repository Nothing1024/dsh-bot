# Task 17 docs-diff

时间：2026-08-30
命令：`git diff -- README.md env/README.md`（人工核对 spec Task 17 四点边界）

## 变更文件

| 文件 | 摘要 |
|---|---|
| `README.md` | 新增「日常使用」：双入口、人设 CRUD、编辑只对新会话、GUI 对账、隐藏会话默认不显示、v1 页签改 iframe |
| `env/README.md` | 新增 `$DSH_HOME/dsh-bot/` 运行数据说明与目录树 |

`git diff --stat`：`README.md` +33/−6；`env/README.md` +18/−1。

## 核对清单（spec Task 17 + wave）

| 要求 | 位置 | 结果 |
|---|---|---|
| 双入口用法 | README.md L56–63：直开 `/dsh-bot/ui` + 右栏页签 iframe | 通过 |
| 人设 CRUD | README.md L69–73：新建 / 编辑 / 删除 | 通过 |
| 编辑人设只对新会话生效 | README.md L72、L77 | 通过 |
| GUI 直建会话经对账归属 | README.md L78 | 通过 |
| 委托隐藏会话默认不显示 | README.md L79「包含隐藏」开关 | 通过 |
| v1 页签改为 iframe 工作台 | README.md L3、L63–65；tab id `dsh-bot:sessions` / `DSH_BOT_SESSIONS_TAB_ID` 保留 | 通过 |
| v1 HTTP listSessions/createSession 保留 | README.md L65 | 通过 |
| `$DSH_HOME/dsh-bot/` | env/README.md L57–66：`bots.json` + 自动 `dsh-bot--*` preset 不入 git | 通过 |

v1 行为未改写：`dsh_bot_ask`、`dsh-bot.model` override、marks CLI、默认 preset 会话、一口一仓 :3084 段落仍在。
