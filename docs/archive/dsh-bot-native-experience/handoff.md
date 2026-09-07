# dsh-bot-native-experience Handoff

本文件是可直接交给 Codex / Claude / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码"，而是在不破坏既有工作台行为的前提下，完成 spec 定义的用户可见行为。

> 使用方式：把本文件完整粘贴给执行 Agent，或让 Agent 开工前先读本文件。
> 本文件只做入口导航，不复制 spec 内容；所有规则、任务、验收细节以 `spec.md` 为准。
> 路径纪律：本文件内所有文件引用一律相对于本包目录（`docs/dsh-bot-native-experience/`），命令中的仓库路径相对仓根。

## 1. 目标

给 dsh-bot 工作台补四项贴合 dsh 形态的交互：Cmd+K 轻量命令面板、全局快捷键、Composer emoji picker、小组消息回复引用——**不引入 grok-bot 的通用客户端能力**（见 spec 2.8 非目标）。

## 1.1 执行环境假设（executor: generic，最保守）

| 项 | 假设 |
|---|---|
| 执行环境 | generic coding agent |
| 浏览器工具 | 按最保守假设：**无浏览器 MCP**。spec 5.2 的前端项按「逐步手动脚本 + 用户回填」执行——你写出可照做的分步脚本与预期界面表现，落盘到对应 `evidence/UF-00x/*.md`，请用户执行并回填截图；不得因为没有浏览器就跳过 5.2 或自行宣称通过 |
| 长命令策略 | `pnpm -r run build` 等较慢，按包拆分执行避免超时 |
| 验证命令输出 | 每条验证命令写出期望输出摘要，保存到对应 evidence 路径 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| Spec（唯一事实源） | `spec.md` | found | 业务合同、技术方案、任务详情、验收协议 |
| Tasks CSV（状态板） | 不适用 | 小需求 → 用 `spec.md` 第 4 章「内嵌状态表」 | 任务状态跟踪 |
| Evidence 目录 | `evidence/` | found（含 `evidence/README.md` 与 `evidence/phase-0/stage1-validate.log`） | 证据归档 |

缺失资料与假设（全量见 spec 1.4）：

- **ASM-101**：emoji 方案体积增量 < 10KB gzipped —— Task 4 用 `pnpm -r run build` 证实或证伪。
- **ASM-102**：小组回复**不改后端**，`replyTo` 只在前端展示 —— Task 7 评估；若证伪，按 spec 1.5 + shared-rules §12 走变更协议另开子包，**不要在本包里顺手改后端房间数据模型**（位置见 spec 3.3 定位清单末两行）。
- **ASM-103**：命令面板是本地列表，无搜索/历史/插件 —— 按 spec 2.3 UF-001 界线实现。

## 3. 开工上下文

### 架构 Before / After

```text
Before: Composer 纯 textarea + @mention；无全局快捷键；无命令面板；小组消息无回复入口
After:  + useGlobalKeyboard.ts（document 级 Cmd+K）
        + CommandPalette.tsx（蒙层 + 列表，数字键/箭头选中）
        + Composer emoji picker（复用 @mention 的弹窗与键盘模式）
        + Transcript 小组消息菜单 → onReplyTo → Conversation replyTo state → Composer reply 卡片
```

### Phase 地图

```text
P0 勘察 (T1)
   ├─ P1 命令面板 + 快捷键 (T2→T3)      ┐ 两条链互不依赖
   └─ P2 emoji + 回复菜单 (T4, T5)      ┘ 可并行
                        ↓
        P3 回复状态 + 验收 (T6 → T7 → T8 → T9)
```

### 最关键规则（全量见 spec.md 第 2 章）

- **BR-001**：Cmd+K 面板列出新建人设/新建小组/清空对话 + 现有人设与小组，选中即切换、无二次确认。
- **BR-002**：Cmd+K 在 textarea focus 时也必须响应；打开面板要关掉 @mention 弹窗，禁止两个弹窗共存。
- **BR-003**：既有 Enter 发送 / Shift+Enter 换行**一个字符都不许改**；新快捷键只做增量。
- **BR-005**：回复卡片可「×」清除，且发送成功后必须自动清除。
- **INV-002**：命令面板与 emoji 数据全部来自既有前端 state 或静态数据，**不得新增任何后端 RPC**。
- **INV-003**：回复功能不写入 `RoomMessage`，房间 jsonl 结构保持不变。
- **UF-001~004**：四条用户可见流程，步骤级脚本在 spec 2.3，真实回放矩阵在 spec 5.2。

### 禁止事项

- 不得为了通过测试删除现有业务分支；不得只改 mock/fixture 不改真实路径；不得吞掉错误状态。
- 不得只按行号修改；必须用 symbol / rg anchor 校验（三段式定位见 spec.md 第 3.3 节）。
- 不得只实现组件而不接线到真实入口——接线清单见 spec.md 第 2.3 节各流程末尾。
- 不得跳过交互反馈（弹窗开关、禁用态、清除按钮、降级文案）；它们是需求本体。
- 不得只跑单测就宣称完成——完成的唯一标准是 spec.md 第 5.2 节真实场景全套测试。
- **不得越界做 spec 2.8 的非目标**：消息内 Cmd+F、roster 未读计数、SSE 推送、slash-command、文件上传、KaTeX/Mermaid、跨会话搜索、虚拟滚动、人类在线状态、emoji reaction。
- 不得引入重型依赖（Tiptap / emoji-mart / emoji-picker-element 等）；不得改动后端 host 包的数据模型。
- 不得碰参考树（只读，仓根 `reference/`）；不得让小组注册表 / rooms jsonl / env 凭据进入 git。

## 4. 开工前初始化

1. 通读 `spec.md` 第 1、2 章（事实基线 + 业务合同，重点读 2.3 节四条流程脚本）。
2. 预读 `spec.md` 第 5 章——先知道完成标准，再开工。
3. 打开 `spec.md` 第 4 章内嵌状态表，找第一条前置已满足的任务（Task 1）。
4. `git status --short` 记录开工基线；仓库当前**已有大量与本包无关的未提交改动**，只 stage 你自己产出的文件，无关改动原样保留。
5. 基线命令（仓根执行）：`pnpm install && pnpm -r run typecheck && pnpm test`，记录通过数作为回归基线。

## 5. 核心执行循环

```text
WHILE 存在待开始或进行中的任务:
    1. 找到下一条前置任务已完成的任务（P1 与 P2 两条链可任选顺序）
    2. 读 spec.md 第 4 章对应 Task 详情
    3. 回答：关联 BR/UF/INV/EVD 是什么？哪些既有行为不能变？
    4. 内嵌状态表更新为「进行中」
    5. 按三段式定位（spec 3.3）校验文件位置，行号不符以 symbol/rg anchor 为准
    6. 执行具体操作
    7. 运行该 Task 的验证命令并把输出保存到其 Evidence 路径
    8. 通过 → 状态「已完成」；失败 → 排障，最多主动修复 3 次
    9. 仍失败 → 标记「已阻塞:{具体原因}」，继续不依赖该任务的后续任务
   10. Phase 收尾任务（T3 / T5 带豁免回归痕、T9）通过后输出 Phase summary，再进下一 Phase
```

每完成一条立即更新状态表，不许攒一批再刷。不要中途问"是否继续"——除非所有剩余任务都被阻塞。

## 6. 排障顺序

1. 查 spec.md 第 4 章当前任务的「注意事项」。
2. 查 spec.md 第 2 章关联 BR/UF/INV。
3. 按错误类型定位：import → 类型 → 事件优先级（document vs React onKeyDown）→ 弹窗状态互斥 → 测试 fixture。
4. 最多主动修复 3 次，仍失败则标注阻塞并继续其他任务。

## 7. 完成标准与汇报

所有任务「已完成」后：

1. 最终验收命令（仓根）：`pnpm -r run build && pnpm -r run typecheck && pnpm test && pnpm run standard:check` —— 命令级，入场券。
2. **执行 spec.md 第 5.2 节真实场景全套测试**：按环境准备启动（`sh env/setup.sh && sh env/boot.sh`，:3084；已起则先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核 `DSH_HOME` 是本仓 `env/`），入口 `http://127.0.0.1:3084/dsh-bot/ui`；按 2.3 流程脚本逐条回放 8 行矩阵，证据存到矩阵写明的 `evidence/` 路径。无浏览器工具时按 1.1 节降级为手动脚本 + 用户回填。任何一行失败 = 未完成。
3. 重跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-native-experience --repo .` —— 它会审计真实场景任务的证据是否真的落盘（evidence 缺失 = FAIL，不得宣称完成）。
4. 对照 spec.md 第 2 章逐条核对 BR-001~006 / UF-001~004 / INV-001~004 / EVD-001~005。
5. 对照 spec.md 第 5.4 节专项检查清单自检（含入口接线可达性）。
6. Commit 纪律（shared-rules §9）：按语义单元提交，message 点名条目 ID，例如 `workbench: 实现 Cmd+K 命令面板（BR-001/002, UF-001）`。
7. 输出最终总结：

```markdown
## 完成总结
- 完成范围：...
- 修改文件：...
- 通过的 BR/UF：...（真实场景执行矩阵 N/N 行通过）
- 未破坏的不变量：...
- Evidence：evidence/...
- 剩余风险：...（含 ASM-101 / ASM-102 的证实或证伪结论）
```

止损诚实：任何任务阻塞或 5.2 有未过行，必须在总结里写明止损点与未执行面，**禁止把部分完成描述为"全部完成"**。