# UF-601 失败分支 空名册 — BLOCKED

**目标 Evidence**：`empty.png`（空态「还没有人设」+「在右栏 DSH Bot 页签新建」）

**已尝试**：
1. `cp env/dsh-bot/bots.json /tmp/lt-bots.json.bak`、`cp env/dsh-bot/groups.json /tmp/lt-groups.json.bak`
2. 写入 `{"version":1,"bots":[]}` / `{"version":1,"groups":[]}`
3. `dsh-rpc-who.sh 3084` 核身份后 `kill`，`sh env/boot.sh` 拉起本仓网关
4. 刷新官方前台并切入 Bot 模式

**结果**：host 启动时把受保护的默认 `DSH Bot` 写回 `bots.json`（`id=dsh-bot`，`protected:true`，`createdAt` 为本次启动时间）。`POST /dsh-bot/listBots` 至少返回 1 个 bot。名册因此不会走到「0 bot 且 0 小组」空态。本包不得改 `packages/dsh-bot-host`，无法关掉这条种子逻辑。

**不伪造** `empty.png`（拍到的会是默认 DSH Bot 行，与矩阵核对点不符）。

**恢复**：已从 `/tmp/lt-bots.json.bak` / `/tmp/lt-groups.json.bak` 还原并重启网关（见 Task 22 后续步骤）。
