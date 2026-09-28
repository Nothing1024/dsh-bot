# dsh-bot 固定 env

本目录是一份独立的 `DSH_HOME`（loopback）。不要 `--lan`。口固定 **3084**，不要打别人的 3080 / 3081 / 3083。

官方 pin：`@deepseek-ai/dsh` / `@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app` / `@deepseek-ai/dsh-headless` 均为 **0.2.0-rc.1**（`profiles/gb/package.json` 与 `profiles/headless/package.json`）。npm `latest` 是 `0.1.7-rc.2`，`next` 是 `0.2.0-rc.1`。`boot.sh` 直接 exec `profiles/gb/node_modules/@deepseek-ai/dsh/lib/bin.js`，不用 `npx`。会话 tags 是插件标记（`$DSH_HOME/session-tool/marks.jsonl`）。

```text
env/
├── setup.sh / boot.sh / gateway-id.sh
├── cli.patch.yml         # headless CLI：关 runner + webUrl :3084
├── settings.example.yaml # 唯一入 git 的配置模板（无明文 key）
├── .env / .credentials.yaml / .anonymous-user-id   # git 忽略
├── dsh-bot/              # 运行时人设注册表（gitignore）
│   ├── bots.json
│   └── session-voice/    # 每会话基础人设快照
└── profiles/gb/          bundles + 邻仓 link；overlay 把 webUrl 指到 :3084
```

模型 key 与 `llm-pi-ai` / `agent-default-model` 来自 `~/workspace/dsh/plugin/.shared/`。`setup.sh` 会跑 `apply.sh --home "$PWD"`。`settings.example.yaml` 只是无 LAN/无 key 的模板，不是活配置。Bot 人设只在 `$DSH_HOME/dsh-bot/bots.json`。

```sh
pnpm install
sh env/setup.sh
sh env/boot.sh            # :3084；已起且身份对本仓则直接退出
```

`boot.sh` 会核对监听进程的 `DSH_HOME` 是本目录。口被别人占着会失败，不会偷偷打过去。

前台：http://127.0.0.1:3084  
工作台：http://127.0.0.1:3084/dsh-bot/ui

半自动矩阵（先核身份再 RPC/CLI）：

```sh
bash scripts/manual-test.sh --no-write
```

记录写在本目录 `manual-test-last.txt`（gitignore）。

调试两行（`dsh-plugin-debug` skill）：

```sh
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc.sh 3084 pluginInventory/list
```

UF-004 标记查询（不 boot，直读本目录 `session-tool/marks.jsonl`）：

```sh
DSH_HOME=$PWD node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --mark app:dsh-bot
# --kind 仍是精确匹配（过渡期）
DSH_HOME=$PWD node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --kind kind:dsh-bot
```

`dsh-bot.model` 只作用于经本插件创建的会话；GUI 直建会话跟随全局默认（见仓根 README）。

### `$DSH_HOME/dsh-bot/` 运行数据

人设注册表是 **env 运行数据，不入 git**（INV-204）。`.gitignore` 已忽略 `env/dsh-bot/`、`bots.json`。

| 路径 | 内容 |
|---|---|
| `$DSH_HOME/dsh-bot/bots.json` | 人设清单唯一事实源：`{id, name, avatar, presetId, persona, modelOverride?, createdAt}`。`presetId` 只是遗留 GUI 对账别名（种子 `dsh-bot`，自定义 `dsh-bot--<id>`），**不再**对应 `.agent-presets/` 目录。首次启动种子默认 bot（id `dsh-bot`）。 |
| `$DSH_HOME/dsh-bot/session-voice/<sessionId>.txt` | 创建会话时钉死的基础人设。编辑注册表不影响旧会话。 |
| `$DSH_HOME/sessions/`、`$DSH_HOME/session-tool/` | 会话投影与 marks（含 `app:dsh-bot` / 过渡期 `kind:dsh-bot` / `bot:<id>`）；删除人设不删历史会话。 |

| 依赖 | 去哪 | bundle 层 |
|---|---|---|
| `@deepseek-ai/dsh` / `dsh-base` / `dsh-web-app` | npm `0.2.0-rc.1`（`dsh` 是 CLI 入口，不进 bundles） | `dsh-base` / `dsh-web-app` 是 |
| `tool-session` | `../../session-tool/plugin/packages/tool-session` | 是 |
| `tool-dsh-bot` | `packages/tool-dsh-bot` | 是（patch 同时 insert `dsh-bot-host`） |
| `session-tool-local` / `session-tool` / `session-marks` | 邻仓 `packages/*` | 否（给 loader resolve） |
| `dsh-bot-host` | `packages/dsh-bot-host` | 否（给 loader resolve；不要在 overlay 再 insert） |

只 `add tool-session` 不够：邻包不会提升到 profile 根。

```sh
DSH_HOME=$PWD/env node profiles/gb/node_modules/@deepseek-ai/dsh/lib/bin.js --profile gb --dump-config
```

### 可选宿主插件的 peer

`dsh-base` 挂载 `deepseek-account`、`ptc-runtime`、`bash-sandbox`。实现包把下面三个模块放在 peerDependencies，profile 不声明就不会装进本目录：

- `@deepseek-ai/dsh-deepseek-account`
- `@deepseek-ai/dsh-ptc-runtime`
- `@deepseek-ai/dsh-sandbox`

`profiles/gb/package.json` 声明了这三项，版本 `0.2.0-rc.1`。`profiles/headless/package.json` 声明了 `@deepseek-ai/dsh-sandbox`。`permission` 等 `bash-sandbox` 的 `shell`，`account-controller` 等 `deepseek-account`。当前 `@deepseek-ai/dsh-sandbox@0.2.0-rc.1` 导出 `classifyRunnerFailure`。
