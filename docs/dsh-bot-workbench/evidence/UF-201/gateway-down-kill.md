# UF-201 停 boot

时间: 2026-08-30T11:10:45.025Z
网关: `127.0.0.1:3084  (没人监听)`


who before:
127.0.0.1:3084  pid=55016  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin
who after:
127.0.0.1:3084  (没人监听)
curl /dsh-bot/ui: 7 000 curl: (7) Failed to connect to 127.0.0.1 port 3084 after 0 ms: Couldn't connect to server



产品错误态截图见 `gateway-down.png`（fetch abort 复现 roster 错误态+重试；静态与 API 同口，真停 boot 则整页无法加载）。

