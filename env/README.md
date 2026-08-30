# dsh-bot 固定 env

本目录是一份独立的 `DSH_HOME`（loopback）。不要 `--lan`。口固定 **3084**，不要打别人的 3080 / 3081 / 3083。

官方 pin：`@deepseek-ai/dsh` / `@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app` 均为 **0.1.1-rc.2**（`boot.sh` 用 `npx @deepseek-ai/dsh@0.1.1-rc.2 --no-open`）。会话 tags 是插件标记（`$DSH_HOME/session-tool/marks.jsonl`）。

```text
env/
├── setup.sh / boot.sh / gateway-id.sh
├── cli.patch.yml         # headless CLI：关 runner + webUrl :3084
├── settings.example.yaml # 唯一入 git 的配置模板（无明文 key）
├── .env / .credentials.yaml / .anonymous-user-id   # git 忽略
├── dsh-bot/              # 运行时人设注册表（gitignore）
│   └── bots.json
├── .agent-presets/
│   ├── dsh-bot/          # 默认 bundled preset（setup 种子）
│   └── dsh-bot--*/       # 自动人设 preset（gitignore）
└── profiles/gb/          bundles + 邻仓 link；overlay 把 webUrl 指到 :3084
```

模型 key：`$DSH_HOME/.credentials.yaml` 优先于 `$DSH_HOME/.env`（官方 Models 页写前者）。都 git 忽略。`setup.sh` 若本地没有 `.env`，会从 `~/.dsh/.env` 拷一份并 chmod 600。`settings.yaml` 不存在时从邻仓 session-tool 的 env 拷贝（否则从 `settings.example.yaml`）。邻仓拷贝不含 `agent-presets.default`；`setup.sh` 种子后会写入 `agent-presets.default: dsh-bot`（BR-002），再 `chmod 600`。

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
DSH_HOME=$PWD node ../../session-tool/plugin/packages/session-tool-cli/lib/bin.js marks list --kind kind:dsh-bot
```

`dsh-bot.model` 只作用于经本插件创建的会话；GUI 直建会话跟随全局默认（见仓根 README）。

### `$DSH_HOME/dsh-bot/` 运行数据

人设注册表与自动 preset 都是 **env 运行数据，不入 git**（INV-204）。`.gitignore` 已忽略 `env/dsh-bot/`、`env/.agent-presets/dsh-bot--*`、`bots.json`。

| 路径 | 内容 |
|---|---|
| `$DSH_HOME/dsh-bot/bots.json` | 人设清单唯一事实源：`{id, name, avatar, presetId, modelOverride?, createdAt}`。**人设文本不在此文件**，只在对应 preset 的 persona 行。首次启动种子默认 bot（id `dsh-bot`）。 |
| `$DSH_HOME/.agent-presets/dsh-bot--<slug>/` | 工作台新建人设时整文件模板生成的自动 preset；写后校验，失败回滚删目录。编辑人设重写该目录，只影响其后新会话。 |
| `$DSH_HOME/.agent-presets/dsh-bot/` | 默认 bot 的 bundled preset（setup 种子）。不要 YAML surgery；自定义人设请新建 bot。 |
| `$DSH_HOME/sessions/`、`$DSH_HOME/session-tool/` | 会话投影与 marks（含 `kind:dsh-bot` / `bot:<id>`）；删除人设不删历史会话。 |

| 依赖 | 去哪 | bundle 层 |
|---|---|---|
| `@deepseek-ai/dsh-base` / `dsh-web-app` | npm 正式包 0.1.1-rc.2 | 是 |
| `tool-session` | `../../session-tool/plugin/packages/tool-session` | 是 |
| `tool-dsh-bot` | `packages/tool-dsh-bot` | 是（patch 同时 insert `dsh-bot-host`） |
| `session-tool-local` / `session-tool` / `session-marks` | 邻仓 `packages/*` | 否（给 loader resolve） |
| `dsh-bot-host` | `packages/dsh-bot-host` | 否（给 loader resolve；不要在 overlay 再 insert） |

只 `add tool-session` 不够：邻包不会提升到 profile 根。

```sh
DSH_HOME=$PWD/env npx --yes @deepseek-ai/dsh@0.1.1-rc.2 --profile gb --dump-config
```
