# dsh-bot-group-rounds Handoff

本文件是可直接交给 Codex / Claude / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码",而是在不破坏业务不变量的前提下,完成 spec 定义的用户可见行为。

> 使用方式:把本文件完整粘贴给执行 Agent,或让 Agent 开工前先读本文件。
> 本文件只做入口导航;所有规则、任务、验收细节以 `spec.md` 为准。
> 路径纪律:文件引用一律相对本包目录(docs/dsh-bot-group-rounds);仓根 = `../..`。

## 1. 目标

把工作台小组对话从"一轮广播"升级成"多轮讨论":小组可设 1-3 轮(默认 1 不变),第 2 轮起成员回应同伴、发言起点轮转、全员 pass 早停、总发言 ≤10;加「继续讨论」「轮内排队」「引用回复点名」「单成员重试」;房间自动起题/可重命名/可删除,roster 小组 working 真值。默认配置与三期行为逐步一致,1:1/v1/v2 零回归。

## 1.1 执行环境假设(generic + 浏览器 MCP)

| 项 | 假设 |
|---|---|
| 执行环境 | 本机 macOS(与本包同机;邻仓/凭据/网关都在本机) |
| 浏览器工具 | chrome-devtools 类 MCP 已在本仓 :3084 实证可用;5.2 browser 行自动回放截图;不可用则手动脚本+用户回填 |
| 网关 | :3084 profile gb;先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份;改代码后 `pnpm -r run build`、杀本仓 pid、`sh env/boot.sh`(已起会直接退出) |
| 验证命令输出 | 每条验证命令完整输出存对应 evidence 路径 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec(唯一事实源) | `spec.md` | found | 合同/方案/15 任务/验收矩阵 |
| Tasks CSV(状态板) | `tasks.csv` | found | 每完成一条立即更新 |
| 三期小组合同 | `../archive/dsh-bot-group-chat/spec.md` | found | 一轮语义/隐藏会话/房间 jsonl 回归基线 |
| 四期会话导航合同 | `../dsh-bot-session-nav/spec.md` | found | overview 对接面(ASM-502) |
| 母包统筹 | `../dsh-bot-interaction-master/spec.md` | found | 执行顺序(四期先行)与跨包接口 |
| Evidence | `evidence/` | found | 证据归档 |

缺失资料与假设:无缺失。ASM-501~503 见 spec 1.4,由 Task 1 消解——**不要跳过 Task 1**。

## 3. 开工上下文

### 架构 Before / After

```text
Before: groupPrompt → 单轮串行广播;房间无标题;进行中禁发;失败整轮重来
After:  runGroupDiscussion(≤3 轮,轮转,增量 wake,pass 早停,≤10 硬停)
        + 继续讨论 + roundQueue(≤3)+ 引用回复点名 + retryMember
        + 房间 title/resolved 行(append-only)+ working 真值
```

### Phase 地图

```text
P0 校准(T1) → P1 引擎与队列(T2-T4) → P2 讨论交互面(T5-T8)
  → P3 房间管理与重试(T9-T12) → P4 收尾与 5.2(T13-T15)
```

### 最关键规则(Top 10,全量见 spec.md 第 2 章)

- BR-501: rounds 1-3 缺省 1;每成员每轮 ≤1 条;总发言 ≤10;轮转起点;全员 pass 早停
- BR-502: 继续讨论不追加用户消息;并发拒绝
- BR-504: 重试只补单成员;resolved 行灰显,不删错误行
- BR-505: 回应者优先级 @ > 引用 > 全员;wake 无协议标识
- BR-506: 排队 FIFO ≤3,绝不交错进当前轮;重启清空是文档化边界
- BR-507: 房间标题 = jsonl 追加 title 行;旧房间回退占位;删房间不伤成员
- BR-508: 默认行为与三期逐步一致;1:1 零群控件泄漏
- INV-502: 隐藏轮次会话纪律不变(不进 1:1 列表)
- INV-503: 房间 jsonl append-only
- UF-501: 两轮讨论第 2 轮必须"回应第 1 轮"

### 禁止事项

- 不得跳过 Task 1 直接选排队/引擎态/兼容实现分支。
- 不得改变 rounds 缺省值或让老小组悄悄变多轮。
- 不得把轮次编号/协议标记写进房间正文或成员 wake。
- 不得从参考树拷 SendMessage/轮次提示词/文案(红线 `rg -i 'anysphere|sand://'` 为空)。
- 不得改写房间 jsonl 既有行;不得删成员 preset。
- 不得让排队消息交错写入当前轮;不得让 1:1 出现群控件。
- 不得让 roster 回到每 owner 一请求的轮询(四期合同)。
- 不得只跑单测宣称完成——完成标准是 spec 5.2 全矩阵。
- 不得动 3080/3081/3083、不得改邻仓、不得提交 env 运行数据。

## 4. 开工前初始化

1. 工作目录取仓根(`cd ../..`)。
2. 通读 `spec.md` 第 1、2 章(七条 UF 的 2.3 脚本)。
3. 预读第 5 章验收矩阵。
4. 打开 `tasks.csv`,第一条是 Task 1。
5. 环境核身:

```sh
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
git status
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-rounds --repo .
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
3. 第 2 轮成员复读:查增量 wake 游标(上次发言 seq)与新内容判定。
4. 排队交错:查房间锁与出队时机(必须等讨论收束)。
5. 旧房间读不出:查未知行类型忽略逻辑(ASM-503 结论)。
6. ≤3 次修复,仍败阻塞继续。

## 7. 完成标准与汇报

1. `pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check`
2. 执行 spec 5.2 全矩阵(13 行),evidence 落盘。
3. 二次 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-rounds`
4. 核销 BR-501~508 / UF-501~507 / INV-501~504。
5. 输出完成总结(范围/文件/矩阵行数/不变量/evidence/剩余风险)。
