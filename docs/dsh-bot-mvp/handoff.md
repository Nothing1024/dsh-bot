# dsh-bot-mvp Handoff

本文件是可直接交给 Codex / Claude / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码",而是在不破坏业务不变量的前提下,完成 spec 定义的用户可见行为。

> 使用方式:把本文件完整粘贴给执行 Agent,或让 Agent 开工前先读本文件。
> 本文件只做入口导航,不复制 spec 内容;所有规则、任务、验收细节以 `spec.md` 为准。
> 路径纪律:本文件内所有文件引用一律使用相对于本包目录(docs/dsh-bot-mvp)的相对路径;仓根 = 本包目录的上两级(`../..`)。

## 1. 目标

在空仓 dsh-grok-bot/plugin 里从零建成 DSH 插件「DSH Bot」:常驻对话 agent(人设 preset + 模型跟随 DSH 配置且支持 bot 专属 override)+ 任意 agent 可调的 `dsh_bot_ask` 委托工具(会话经邻仓 session-tool 管理、打 `kind:dsh-bot` 标记、隐藏辅助会话不扰官方栏)+ better-sidebar「DSH Bot」侧栏页签,独占调试口 3084(profile `gb`),最终过 `standard:check` 与 spec 5.2 真实场景全套测试。

## 1.1 执行环境假设(generic,最保守)

| 项 | 假设 |
|---|---|
| 执行环境 | generic(本机 macOS,zsh;与本包同机——邻仓与凭据都在本机) |
| 浏览器工具 | 默认无浏览器 MCP——spec 5.2 的 GUI 行按「逐步手动脚本 + 用户回填」执行;若执行环境有 chrome-devtools-proxy 等浏览器 MCP,可改为自动回放并直接落盘 evidence |
| 长命令策略 | 正常执行;`pnpm install` / boot 类长命令注意后台化与日志留存 |
| 验证命令输出 | 每条验证命令保存完整输出到对应 evidence 路径 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec(唯一事实源) | `spec.md` | found | 业务合同、技术方案、任务详情、验收协议 |
| Tasks CSV(状态板) | `tasks.csv` | found | 20 条任务状态跟踪(每完成一条立即更新) |
| Evidence 目录 | `evidence/` | found(含 README 与命名规范) | 证据归档 |

缺失资料与假设:

- 无缺失资料。开工假设全部登记在 spec.md 第 1.4 节(ASM-001/002/003/005/006/007),由 P0 的 Task 3/Task 4 勘察消解——不要跳过这两个任务。

## 3. 开工上下文

### 架构 Before / After(简图,全图见 spec.md 第 3.1 节)

```text
Before: 仓根只有 docs/(本包);邻仓 session-tool(:3081)/vibee(:3083)/genoffice(:3080) 已在位
After:  仓根新增 packages/{dsh-bot-host, tool-dsh-bot, ui-dsh-bot} + env/(DSH_HOME, 口 3084, profile gb,
        含 .agent-presets/dsh-bot 人设 preset)+ standards/ + scripts/
        推理链: GUI/工具 → agent loop → ctx.llm → 用户配置路由(llm-pi-ai 等)
        会话链: dsh_bot_ask → ctx.sessionTool → web 网关 → 持久化 + marks(kind:dsh-bot)
```

### Phase 地图

```text
P0 环境与模型基线(T1-T5) → P1 人设 preset(T6-T8) → P2 委托工具(T9-T12)
  → P3 侧栏 UI(T13-T16) → P4 标准面与真实验收(T17-T20)
```

### 最关键规则(Top 10,全量见 spec.md 第 2 章)

- BR-001: 模型完全跟随 DSH 自身配置;零适配器、零硬编码 provider/model;xAI 只是注释示例
- BR-002: 人设走 preset(`agentPreset.copy` 复制 standard 后只改 persona 行;文本全新撰写、模型无关)
- BR-003: 会话一律经 `ctx.sessionTool`(fence)+ marks;辅助会话标题 `~dsh-bot:` 前缀 + kind:hidden;禁碰官方 session/tags
- BR-004: 一口一仓——本仓只听 3084;boot 先 gateway_refuse_foreign 核身份
- BR-005: 凭据只经 env/.env(600、gitignore);任何入 git 文件不含明文 key
- BR-006: 参考树(../../../reference,相对仓根 ../reference)只读红线——不拷代码/文案/品牌,仓内不得出现 anysphere/sand:// 等标识
- BR-007: `dsh_bot_ask` 失败必须 fail loud(明确错误文本),禁止静默空串
- BR-010: bot 专属模型 override(settings `dsh-bot.model`,可空;只作用于经本插件创建的会话;非法时 fail loud 不静默回落)
- INV-001: 邻仓零改动(session-tool/vibee/genoffice 的 git status 保持干净)
- UF-002: 委托全链——工具卡片完成、答案入主会话、marks 登记、官方栏无 `~` 会话

### 禁止事项

- 不得为了通过测试删除现有业务分支;不得把失败状态吞掉。
- 不得只修改 mock/fixture,不修改真实路径。
- 不得只按行号修改;必须用 symbol/rg anchor 校验(三段式定位见 spec.md 第 3.3 节,含锚点书写约定)。
- 不得只实现组件/函数而不接线到真实入口——接线清单见 spec.md 第 2.3 节各 UF 块。
- 不得跳过交互反馈(loading、禁用、错误提示、空态、成功反馈);它们是需求本体。
- 不得只跑单测就宣称完成——完成的唯一标准是 spec.md 第 5.2 节真实场景全套测试。
- 不得把平台包写成 latest;不得修改官方 DSH npm 包与邻仓;不得同时抢 3080/3081/3083 口。
- 不得从参考树拷贝任何内容(BR-006 红线,Task 20 有终检)。

## 4. 开工前初始化

1. 工作目录一律取仓根(从本包 `cd ../..`;后文命令均在仓根执行,包目录记为 docs/dsh-bot-mvp)。
2. 通读 `spec.md` 第 1、2 章(事实基线 + 业务合同,重点读 2.3 节六条流程脚本与各入口接线清单)。
3. 预读 spec.md 第 5 章——先知道完成标准(5.2 真实场景矩阵 21 行 evidence),再开工。
4. 打开状态板 `tasks.csv`,第一条可执行任务是 Task 1(搭建 monorepo 骨架;仓库已 git init 且有 docs 基线 commit,Task 1 里的 git init 步骤按已完成处理)。
5. 确认邻仓与调试工具在位:

```sh
ls ../../session-tool/plugin ../../vibee/plugin          # 邻仓(相对仓根)
ls ~/.agents/skills/dsh-plugin-debug/scripts/            # dsh-rpc-who.sh / dsh-rpc.sh / dsh-session-cat.sh
```

6. 运行 `git status` 确认工作区干净;运行基线命令:

```sh
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-mvp --repo .   # 期望 0 FAIL
```

## 5. 核心执行循环

```text
WHILE 存在待开始或进行中的任务:
    1. 找到下一条前置任务已完成的任务(顺序即 tasks.csv 序号)
    2. 读 spec.md 第 4 章对应 Task 详情
    3. 回答:关联 BR/UF/INV/EVD 是什么?哪些行为不能变?
    4. 状态板更新为「进行中」
    5. 按三段式定位校验文件位置(样板行可直接抄形状)
    6. 执行具体操作
    7. 运行验证命令并保存 evidence(路径见任务 Evidence 行)
    8. 通过 → 状态「已完成」;失败 → 排障,最多主动修复 3 次
    9. 仍失败 → 标记「已阻塞:{原因}」,继续不依赖该任务的后续任务
   10. Phase 回归通过后,输出 Phase summary(evidence/phase-N/),再进入下一 Phase
```

不要中途问"是否继续"。除非所有剩余任务都被阻塞,否则继续推进。**仅有的两个允许暂停询问点**(spec 已写明):

- Task 3:需要用户现有模型配置/凭据拷入本仓 env(settings.yaml 与 .env 不入 git,内容用户给);
- Task 6:人设 persona 文本需贴给用户过目后再落盘。

每个 Phase 完成后按语义单元 commit(规范见 spec 顶部引用的 shared-rules §9:中文 message、点名条目 ID)。

## 6. 排障顺序

1. 查 spec.md 第 4 章当前任务的注意事项(易错点都预写了:cordis overlay 整段替换、双重 insert、RPC envelope 形态、浏览器缓存 boot rev……)。
2. 查 spec.md 第 2 章关联 BR/UF/INV。
3. 网关侧排障用 dsh-plugin-debug skill:先 rpc-who 核口,再 pluginInventory 看装配,再 session.history 看会话;网关没起用 dsh-session-cat 直读磁盘。
4. 按错误类型定位:profile 组合/link 提升、typecheck paths、凭据解析、fence 拒绝、UI 状态。
5. 最多主动修复 3 次,仍失败则阻塞并继续其他任务。

## 7. 完成标准与汇报

所有任务「已完成」后:

1. 运行最终验收命令(命令级,入场券):

```sh
pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check
```

2. **执行 spec.md 第 5.2 节真实场景全套测试**:起真实网关(:3084),按 2.3 节六条流程脚本逐行回放主路径和失败分支(21 行执行矩阵),截图/回填/RPC 取证落盘到矩阵写明的 `evidence/` 路径。任何一行失败 = 未完成,回去修。
3. 重跑包校验(第二次运行,证据审计):

```sh
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-mvp
```

4. 对照 spec.md 第 2 章逐条核对 BR-001~010 / UF-001~006 / INV-001~004 / EVD-001~009。
5. 对照 spec.md 第 5.4 节专项检查清单自检(含入口接线可达性、BR-006 红线 rg 终检、邻仓零 diff)。
6. 输出最终总结:

```markdown
## 完成总结
- 完成范围:...
- 修改文件:...
- 通过的 BR/UF:...(真实场景执行矩阵 21/21 行通过)
- 未破坏的不变量:INV-001~004 ...
- Evidence:evidence/...
- 剩余风险:...
```
