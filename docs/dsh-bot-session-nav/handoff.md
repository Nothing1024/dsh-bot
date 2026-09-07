# dsh-bot-session-nav Handoff

本文件是可直接交给 Codex / Claude / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码",而是在不破坏业务不变量的前提下,完成 spec 定义的用户可见行为。

> 使用方式:把本文件完整粘贴给执行 Agent,或让 Agent 开工前先读本文件。
> 本文件只做入口导航;所有规则、任务、验收细节以 `spec.md` 为准。
> 路径纪律:文件引用一律相对本包目录(docs/dsh-bot-session-nav);仓根 = `../..`。

## 1. 目标

给 DSH Bot 工作台交付「会话导航」四件事:① 会话行「在 DSH 打开」一键跳官方 conversation 视图(页签 postMessage 桥);② 工作台新建会话默认从官方侧栏收纳(`~` 隐藏约定,设置可关);③ 首轮自动起题 + 重命名/隐藏切换/归档;④ roster 数据源换成单个 overview 聚合 + SSE 脏通知推送。v1/v2/v3 零回归。

## 1.1 执行环境假设(generic + 浏览器 MCP)

| 项 | 假设 |
|---|---|
| 执行环境 | 本机 macOS(与本包同机;邻仓/凭据/网关都在本机) |
| 浏览器工具 | chrome-devtools 类 MCP 已在本仓 :3084 实证可用;5.2 browser 行自动回放截图;不可用则手动脚本+用户回填 |
| 网关 | :3084 profile gb;先 `../../env` 外的 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份;改代码后 `pnpm -r run build`、杀掉本仓 pid、再 `sh env/boot.sh`(已起会直接退出) |
| 验证命令输出 | 每条验证命令完整输出存对应 evidence 路径 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec(唯一事实源) | `spec.md` | found | 合同/方案/14 任务/验收矩阵 |
| Tasks CSV(状态板) | `tasks.csv` | found | 每完成一条立即更新 |
| 工作台合同(v2) | `../dsh-bot-workbench/spec.md` | found | 1:1 回归基线 |
| 小组合同(v3) | `../dsh-bot-group-chat/spec.md` | found | 隐藏轮次会话过滤基线 |
| 母包统筹 | `../dsh-bot-interaction-master/spec.md` | found | 执行顺序与跨包接口 |
| Evidence | `evidence/` | found | 证据归档 |

缺失资料与假设:无缺失。ASM-401~405 见 spec 1.4,由 Task 1 消解——**不要跳过 Task 1**。

## 3. 开工上下文

### 架构 Before / After

```text
Before: roster 每 2s 对每个 bot/group 各发一次 listSessions;会话标题满屏「新对话」;
        工作台会话全部堆进官方侧栏;无跳转入口
After:  overview 单请求 + SSE 脏通知;首轮自动起题;新会话默认 ~ 收纳(可关);
        会话行菜单:在 DSH 打开(postMessage→页签→jumpToSession)/重命名/隐藏/归档
```

### Phase 地图

```text
P0 校准(T1) → P1 跳转桥(T2-T4) → P2 起题与收纳(T5-T8)
  → P3 聚合与推送(T9-T11) → P4 收尾与真实验收(T12-T14)
```

### 最关键规则(Top 10,全量见 spec.md 第 2 章)

- BR-401: 跳转桥 origin+source+type 三重校验;直开降级复制 ID
- BR-402: 收纳默认开;工作台默认列表必含自家隐藏会话(`kind:dsh-bot-wb` 例外通道)
- BR-403: 自动起题幂等,永不覆盖人工名/DSH 已落标题
- BR-404: 归档=archiveSession+`archivedSessionIds` 排除;list 行无 archived 字段不降级隐藏;失败回滚零半删
- BR-405: roster 每拍只打一个 overview
- BR-406: SSE 走 :3084 既有 webServer;断线回落轮询;事件源订阅只读
- BR-407: 不拷参考树;`~` 约定与 marks 语义不变
- INV-401: v1 委托/v2 工作台/v3 小组零回归
- INV-403: 不开新端口
- UF-402: 收纳开着时官方侧栏看不到新 bot 会话

### 禁止事项

- 不得跳过 Task 1 校准直接选 BR-401/404/406 的实现分支。
- 不得批量改名/迁移存量会话。
- 不得让收纳后的会话从工作台自己的列表里消失。
- 不得信任 postMessage 消息体;不得省略 origin 校验。
- 不得经事件总线写任何事件(只读订阅)。
- 不得为通过测试删除隐藏轮次会话的过滤逻辑。
- 不得只实现函数不接线(菜单项/EventSource/开关都是需求本体)。
- 不得只跑单测宣称完成——完成标准是 spec 5.2 全矩阵。
- 不得动 3080/3081/3083、不得改邻仓、不得提交 env 运行数据。

## 4. 开工前初始化

1. 工作目录取仓根(`cd ../..`)。
2. 通读 `spec.md` 第 1、2 章(五条 UF 的 2.3 脚本)。
3. 预读第 5 章验收矩阵。
4. 打开 `tasks.csv`,第一条是 Task 1。
5. 环境核身:

```sh
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
git status
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav --repo .
```

## 5. 核心执行循环

```text
WHILE 存在待开始或进行中的任务:
    读 spec 第 4 章 → 进行中 → 实现 → 验证命令 → evidence
    通过 → 已完成;失败 ≤3 次;仍败 → 已阻塞:原因
    Phase 回归后写 phase summary
改 host/client 后:build → 杀本仓 3084 pid → boot.sh 后台 → 浏览器强刷
```

不要中途问是否继续。本包无用户暂停点。每 Phase 按语义单元 commit(中文 message 点名条目 ID)。

## 6. 排障顺序

1. spec 第 4 章当前任务注意事项 → 第 2 章关联合同。
2. dsh-plugin-debug:who → pluginInventory → session.history。
3. 跳转不动:先核 iframe postMessage 是否到页签(console);再核 sessions face 注入。
4. 收纳后工作台丢会话:查 `kind:dsh-bot-wb` 例外通道与 listOwnedSessions 过滤序。
5. SSE 无事件:核事件源分支(总线订阅 or 扫描)与去抖;curl -N 直连验证。
6. ≤3 次修复,仍败阻塞继续。

## 7. 完成标准与汇报

1. `pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check`
2. 执行 spec 5.2 全矩阵(15 行),evidence 落盘。
3. 二次 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav`
4. 核销 BR-401~407 / UF-401~405 / INV-401~404。
5. 输出完成总结(范围/文件/矩阵行数/不变量/evidence/剩余风险)。
