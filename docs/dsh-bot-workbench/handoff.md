# dsh-bot-workbench Handoff

本文件是可直接交给 Codex / Claude / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码",而是在不破坏业务不变量的前提下,完成 spec 定义的用户可见行为。

> 使用方式:把本文件完整粘贴给执行 Agent,或让 Agent 开工前先读本文件。
> 本文件只做入口导航;所有规则、任务、验收细节以 `spec.md` 为准;UI 设计形状以 `reference-ui-notes.md` 为准(只读设计参考,禁拷代码)。
> 路径纪律:文件引用一律相对本包目录(docs/dsh-bot-workbench);仓根 = `../..`。

## 1. 目标

在 v1(DSH Bot 插件,已验收)之上交付「**DSH Bot 工作台**」:host 自服务的独立网页(`/dsh-bot/ui`)——左栏多人设 roster(新建/编辑/删除人设,每人设一个自动管理的 agent preset),右侧专属对话面(身份 Header、角色分侧消息、thinking/工具折叠、工作中指示、按 bot 隔离的草稿);右栏页签 iframe 嵌入与浏览器直开功能等价;人设 1 与人设 2 的对话完全隔离;GUI 直建的 bot 会话经补标对账归入对应人设(修 v1 验收缺口);v1 功能零回归。

## 1.1 执行环境假设(generic + 浏览器 MCP)

| 项 | 假设 |
|---|---|
| 执行环境 | 本机 macOS(与本包同机;邻仓/凭据/运行中网关都在本机) |
| 浏览器工具 | **本机已实证可用**(上一验收会话用 chrome-devtools 类 MCP 完成过 :3084 GUI 实测);5.2 的 browser 行用它自动回放并截图;若不可用降级手动脚本+用户回填 |
| 网关 | :3084 已在跑(profile gb;先 `dsh-rpc-who.sh 3084` 核身份再动);改 host/client 代码后需 `pnpm -r run build` + 重启 boot + 浏览器强刷(boot rev 缓存) |
| 验证命令输出 | 每条验证命令完整输出存对应 evidence 路径 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec(唯一事实源) | `spec.md` | found | 合同/方案/19 任务/验收矩阵(15 行) |
| Tasks CSV(状态板) | `tasks.csv` | found | 每完成一条立即更新 |
| UI 设计形状 | `reference-ui-notes.md` | found | 布局尺寸/roster 行字段/身份呈现/裁剪表(§E) |
| v1 合同基线 | `../dsh-bot-mvp/spec.md` | found | BR-208/INV-201 回归依据 |
| Evidence 目录 | `evidence/` | found | 证据归档 |

缺失资料与假设:

- 无缺失资料。ASM-201/202/203 见 spec 1.4,由 Task 1/2/5 消解——不要跳过 Task 1。

## 3. 开工上下文

### 架构 Before / After(简图,全图见 spec.md 3.1)

```text
Before: dsh-bot-host(/dsh-bot API + askBot + marks)→ ui-dsh-bot 页签(React 列表)
After:  dsh-bot-host 增 bots 注册表($DSH_HOME/dsh-bot/bots.json)+ preset 工厂
        (模板生成 env/.agent-presets/dsh-bot--<slug>/,写后校验回滚)+ 工作台 API
        + 静态 /dsh-bot/ui + 补标对账;新包 workbench-ui(SPA);页签改 iframe 嵌入
```

### Phase 地图

```text
P0 勘察与骨架(T1-T4) → P1 人设注册表(T5-T7) → P2 对话面(T8-T11)
  → P3 身份与对账(T12-T15) → P4 收尾与真实验收(T16-T19)
```

### 最关键规则(Top 10,全量见 spec.md 第 2 章)

- BR-201: 注册表是 bot 清单唯一事实源;人设文本唯一事实源是该 bot 的 preset 文件 persona 行
- BR-202: 一人设一 preset(`dsh-bot--<slug>`);写后 `agentPreset.list` 校验非 broken,失败回滚零残留;编辑只对新会话生效
- BR-203: 会话归属双通道——工作台创建打 `[kind:dsh-bot, bot:<id>]`;GUI 直建由对账补标,幂等
- BR-204: 页签 iframe 与浏览器直开**功能等价**,全部 loopback
- BR-205: 对话呈现契约——身份 Header/角色分侧/thinking 与工具折叠/工作中指示/草稿按 bot 隔离/≤2s 消息级刷新(token 流式是非目标)
- BR-206: 头像 = emoji 或首字+确定性色块;身份出现在 roster 行/Header/composer 占位符
- BR-207: 红线延续——禁拷参考树代码/品牌;凭据不入 git;不改官方包与邻仓
- BR-208: v1 零回归(dsh_bot_ask/override/CLI/默认 preset 链路);页签 id 保留内容换 iframe
- INV-201: 收尾必须复跑 v1 主路径行
- INV-204: bots.json/自动 preset/会话数据都是 env 运行数据,不入 git

### 禁止事项

- 不得从 `../../../reference`(仓根 `../reference`)拷贝任何代码/文案/品牌;`reference-ui-notes.md` 只取设计形状。
- 不得原地 YAML surgery 官方随附 preset;bot preset 一律整文件模板生成 + 校验回滚。
- 不得把失败吞掉(创建失败必须零残留;对话错误必须呈现错误码)。
- 不得只跑单测宣称完成——spec 5.2 的 15 行矩阵是唯一完成标准。
- 不得跳过交互反馈(loading/禁发/错误条/工作中/生效提示,全在 2.3 脚本里)。
- 不得只按行号改;锚点见 spec 3.3(书写约定同 v1)。
- 不得改 3084 以外的口;不得动邻仓。

## 4. 开工前初始化

1. 工作目录取仓根(`cd ../..`;命令均在仓根跑)。
2. 通读 `spec.md` 第 1、2 章(六条 UF 的 2.3 脚本 + 入口接线清单)与 `reference-ui-notes.md` §A/B/D/E。
3. 预读 spec 第 5 章(15 行矩阵)。
4. 打开 `tasks.csv`,第一条是 Task 1(勘察)。
5. 环境核身:

```sh
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084     # DSH_HOME 应为本仓 env
git status                                                          # 干净
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench --repo .   # 0 FAIL
```

## 5. 核心执行循环

```text
WHILE 存在待开始或进行中的任务:
    1. 取下一条前置已完成的任务 → 读 spec 第 4 章详情
    2. 回答:关联 BR/UF/INV 是什么?哪些行为不能变?
    3. 状态板「进行中」→ 按定位锚点实现 → 跑验证命令 → evidence 落盘
    4. 通过 →「已完成」;失败 → 排障 ≤3 次;仍败 →「已阻塞:原因」继续其他任务
    5. Phase 回归过后写 phase summary 再进下一 Phase
改 host/client 代码后:pnpm -r run build → 重启 boot(sh env/boot.sh)→ 浏览器强刷。
```

不要中途问"是否继续";除非全部剩余任务阻塞。本包**无需用户输入的暂停点**(人设文本由使用者在产品里自填,不需要预先过目;模型配置沿用 v1)。

每个 Phase 完成后按语义单元 commit(中文 message 点名条目 ID)。

## 6. 排障顺序

1. spec 第 4 章当前任务注意事项 → 第 2 章关联合同。
2. 网关侧:dsh-plugin-debug 三工具(rpc-who → pluginInventory → session.history)。
3. preset broken:读 `agentPreset.list` 的 broken 原因字段;检查 persona 转义。
4. iframe 内 fetch 失败:先浏览器直开同 URL 复现,分清页面问题与嵌入问题。
5. ≤3 次修复,仍败阻塞继续。

## 7. 完成标准与汇报

1. 命令级(入场券):

```sh
pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check
```

2. **执行 spec 5.2 的 15 行真实场景矩阵**(浏览器逐行回放并截图;含 v1 回归抽验行),evidence 全落盘。
3. 二次跑包校验(证据审计):

```sh
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench
```

4. 对照 spec 第 2 章核销 BR-201~208 / UF-201~206 / INV-201~204 / EVD-201~207;5.4 清单自检。
5. 输出最终总结(完成范围/修改文件/矩阵 15/15/不变量/evidence/剩余风险)。
