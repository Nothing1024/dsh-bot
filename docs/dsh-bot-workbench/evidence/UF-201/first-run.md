# UF-201 首次空态

Date: 2026-08-30 (closer: 临时 DSH_HOME 实拍).

## 方法

Task 14「临时 DSH_HOME 或清运行数据」。一口一仓 :3084 live env 未清、未替换。

1. 新建 `/tmp/dsh-wb-first-run`：symlink `profiles/gb`、只拷 bundled `dsh-bot` preset、空 `dsh-bot/`（无 bots.json）、无 `dsh-bot--*`、无 sessions/marks。
2. `DSH_HOME=/tmp/dsh-wb-first-run npx @deepseek-ai/dsh@0.1.1-rc.2 --profile gb --port 3184 --no-open`
3. `dsh-rpc-who.sh 3184` → `DSH_HOME=/tmp/dsh-wb-first-run`
4. `dsh-rpc-who.sh 3084` 仍为本仓 env（pid 55016）。未动 3080/3083。
5. Playwright 直开 `http://127.0.0.1:3184/dsh-bot/ui`（无 `page.route`）。
6. 拍完 kill 3184，删除临时 home（含凭据副本）。

## Then

- `POST /dsh-bot/listBots` 仅种子 `id=dsh-bot` `protected=true`
- `.agent-presets/` 只有 `dsh-bot`
- roster 一行 DSH Bot；会话下拉「新对话」；空会话 CTA；「包含隐藏」默认关

见 `first-run.png` + `first-run.json`。
