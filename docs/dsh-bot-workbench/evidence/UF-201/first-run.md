# UF-201 首次空态

时间: 2026-08-30T11:10:45.025Z
网关: `127.0.0.1:3084  pid=55016  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


## 方法

一口一仓 :3084 未替换。临时 `DSH_HOME=/tmp/dsh-wb-t18` 起 :3184。

- symlink `profiles/gb`
- 只拷 bundled `dsh-bot` preset
- 空 `dsh-bot/`、无 `dsh-bot--*`、无 sessions/marks

`dsh-rpc-who.sh 3184` → `127.0.0.1:3184  pid=31726  DSH_HOME=/tmp/dsh-wb-t18  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`

`dsh-rpc-who.sh 3084` 仍为本仓 env。未动 3080/3083。

## Then

- listBots names = ["DSH Bot"]
- 空会话 CTA：
```
还没有对话

给 DSH Bot 发一条消息开始，或点「新开对话」
```
- 「包含隐藏」默认 false
- 会话下拉 value=""

截图 `first-run.png`。拍完 kill 3184 并删除临时 home（含凭据副本）。

