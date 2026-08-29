# dsh-bot

DSH 插件「DSH Bot」：常驻对话 agent（人设 preset + 模型跟随 DSH 配置，可 bot 专属 override）+ 任意 agent 可调的 `dsh_bot_ask` 委托工具 + better-sidebar「DSH Bot」侧栏页签。

本仓独占 loopback **3084**，profile **`gb`**，平台包钉 `@deepseek-ai/dsh@0.1.1-rc.2`。

调试环境见 `env/README.md`。

```sh
pnpm install
sh env/setup.sh
sh env/boot.sh                 # loopback :3084
```

会话经邻仓 session-tool 管理，标记 `kind:dsh-bot`。不要抢 3080 / 3081 / 3083。
