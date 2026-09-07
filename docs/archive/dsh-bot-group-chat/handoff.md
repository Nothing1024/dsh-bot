# dsh-bot-group-chat Handoff

本文件是可直接交给 Codex / Claude / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码",而是在不破坏业务不变量的前提下,完成 spec 定义的用户可见行为。

> 使用方式:把本文件完整粘贴给执行 Agent,或让 Agent 开工前先读本文件。
> 本文件只做入口导航;所有规则、任务、验收细节以 `spec.md` 为准。
> 路径纪律:文件引用一律相对本包目录(docs/dsh-bot-group-chat);仓根 = `../..`。

## 1. 目标

在已交付的 DSH Bot 工作台上增加 **Grok Bot 式小组对话**:左栏「小组」行(拼贴头像),右侧同一 conversation 里多名成员按身份轮流回复;默认全员一轮,`@名字` 只让被点到的 bot 开口;删组不影响 1:1 人设与私聊;v1/v2 零回归。

## 1.1 执行环境假设(generic + 浏览器 MCP)

| 项 | 假设 |
|---|---|
| 执行环境 | 本机 macOS(与本包同机;邻仓/凭据/运行中网关都在本机) |
| 浏览器工具 | chrome-devtools 类 MCP 已在本仓 :3084 实证可用;5.2 browser 行自动回放截图;不可用则手动脚本+用户回填 |
| 网关 | :3084 profile gb;先 `dsh-rpc-who.sh 3084` 核身份;改代码后 `pnpm -r run build`、杀掉本仓 pid、再 `sh env/boot.sh`(boot.sh 已起会直接退出) |
| 验证命令输出 | 每条验证命令完整输出存对应 evidence 路径 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec(唯一事实源) | `spec.md` | found | 合同/方案/17 任务/验收矩阵 |
| Tasks CSV(状态板) | `tasks.csv` | found | 每完成一条立即更新 |
| 工作台合同 | `../dsh-bot-workbench/spec.md` | found | 1:1 回归基线 |
| 设计形状 | `../dsh-bot-workbench/reference-ui-notes.md` | found | 小组行/拼贴头像形状;禁拷代码 |
| Evidence | `evidence/` | found | 证据归档 |

缺失资料与假设:无缺失。ASM-301/302/303 见 spec 1.4,由 Task 1/7 消解——不要跳过 Task 1。

## 3. 开工上下文

### 架构 Before / After

```text
Before: 1:1 bot → 单 preset 会话 → transcript 无 author
After:  小组注册表 + 房间 jsonl(多作者)
        用户发送 → 轮次引擎 → 每成员隐藏会话(该 preset)→ 答案写入房间
        roster = bot 行 + group 行
```

### Phase 地图

```text
P0 校准(T1-T2) → P1 注册表+空组壳(T3-T6) → P2 轮次+多作者面(T7-T10)
  → P3 点名/成员/1:1(T11-T14) → P4 文档与 5.2(T15-T17)
```

### 最关键规则(Top 10,全量见 spec.md 第 2 章)

- BR-301: 小组是独立注册表实体,没有自己的 preset
- BR-302: 成员 2–6 个已有 1:1 bot,禁止套组
- BR-303: 同一房间多作者气泡(成员必须带头像+名)
- BR-304: 无点名=全员一轮串行;@点名子集;失败不丢已成功回复
- BR-305: 轮次会话 `kind:hidden`,默认不进 1:1 列表
- BR-306: 删组不删成员 bot/preset/私聊
- BR-307: 1:1 与 `dsh_bot_ask` 零回归
- BR-308: 禁拷参考树;轮次提示原创
- INV-304: 房间文件不入 git
- UF-302: 「你们是谁?」同一 transcript 两口吻

### 禁止事项

- 不得把两个 preset 塞进官方同一个 `session.create`。
- 不得从参考树拷小组轮次实现或 SendMessage 工具文案。
- 不得把小组行写进人设注册表的 BotRegistryRow。
- 不得让隐藏轮次会话出现在默认 1:1 下拉。
- 不得删组成员的 `dsh-bot--*` preset。
- 不得跳过 loading/禁发/错误条;不得只跑单测宣称完成。
- 不得改 3084 以外的口、不得动邻仓。

## 4. 开工前初始化

1. 工作目录取仓根(`cd ../..`)。
2. 通读 `spec.md` 第 1、2 章(六条 UF 的 2.3 脚本)。
3. 预读第 5 章矩阵。
4. 打开 `tasks.csv`,第一条是 Task 1。
5. 环境核身:

```sh
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
git status
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-chat --repo .
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

1. spec 第 4 章注意事项 → 第 2 章合同。
2. dsh-plugin-debug: who → pluginInventory → session.history。
3. 1:1 列表出现轮次会话:查 hidden/group marks。
4. 两成员口吻相同:查是否误用同一 preset/隐藏会话未按成员隔离。
5. ≤3 次修复,仍败阻塞继续。

## 7. 完成标准与汇报

1. `pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check`
2. 执行 spec 5.2 全矩阵,evidence 落盘。
3. 二次 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-chat`
4. 核销 BR-301~309 / UF-301~306 / INV-301~304。
5. 输出完成总结(范围/文件/矩阵行数/不变量/evidence/剩余风险)。
