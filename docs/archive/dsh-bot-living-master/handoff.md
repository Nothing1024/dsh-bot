# dsh-bot-living-master Handoff（INV-103 例外已登记，三包收尾完成）

本文件是可直接交给 Codex / Claude / omp / Generic Coding Agent 的交付 Prompt。你的目标不是"按文件改代码"，也不是重做记忆包 / 例程包 / 联合回放，而是接住已经诚实止损的母包，只处理 INV-103 闸门。

> 使用方式：把本文件完整粘贴给执行 Agent，或让 Agent 开工前先读本文件。
> 本文件只做入口导航，不复制 spec 内容；所有规则、任务、验收细节以 `spec.md` 与两个子包 spec 为准。
> 路径纪律：本文件内所有引用一律相对于本包目录 `docs/dsh-bot-living-master/`。工作目录取仓根时先 `cd ../..`。

## 1. 目标

产品路径已合入。INV-103 已按 shared-rules §12 登记邻仓既有脏为例外（母包 spec §1.5）：邻仓要求改为「porcelain 与开工基线一致」。母包 Task 5、记忆 Task 13、例程 Task 14 已完成。本文件只作已收口导航，不要把例外再改回阻塞。

## 1.1 执行环境假设（--executor generic，最保守）

| 项 | 假设 |
|---|---|
| 执行环境 | generic（omp / Claude / Codex 均适用） |
| 浏览器工具 | 本棒默认不用浏览器。UF-101~103 与子包 leftover 已过，不要新开联合回放 |
| 长命令策略 | 不要重跑四命令，除非本棒改了产品代码或 lockfile（默认不改） |
| 验证命令输出 | porcelain / 红线 / `env/dsh-bot` 检查的完整输出写入 `evidence/phase-final/inv-103-porcelain.md` |
| 网关身份 | 本棒不碰 :3084。若误开 RPC，先跑 dsh-plugin-debug 的 who 脚本核 3084，DSH_HOME 必须是本仓 env |
| 邻仓 | 零改。禁止 checkout / commit / restore / stash 邻仓 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| 母包 Spec（本包唯一事实源） | `spec.md` | found | 顺序 / 共享面 / 联合验收 / 内嵌 5 行状态表 |
| 母包状态板 | `spec.md` §4 内嵌状态表（不生成 CSV） | found | Task 1–5 已完成 |
| 记忆包 Spec | `../dsh-bot-memory/spec.md` | found | 子包合同 |
| 记忆包状态板 | `../dsh-bot-memory/tasks.csv` | found | 1–13 已完成 |
| 例程包 Spec | `../dsh-bot-routines/spec.md` | found | 子包合同 |
| 例程包状态板 | `../dsh-bot-routines/tasks.csv` | found | 1–14 已完成 |
| 记忆 / 例程交接稿 | 无（子包同会话已执行，未另写 handoff） | missing | 以子包 spec + CSV 为准；本文件覆盖收口 |
| 总报告 | `evidence/phase-final/report.md` | found | 终报：记忆 13/13、例程 14/14、母包 5/5；INV-103 例外见 §1.5 |
| leftover 矩阵 | `evidence/phase-final/leftover-close-matrix.md` | found | 子包 leftover 与母包 named shot 已 PASS |
| INV-103 快照 | `evidence/phase-final/inv-103-porcelain.md` | found | 下一次只覆盖刷新，不改结论口径 |
| Evidence 目录 | `evidence/` | found | 母包证据；子包证据在各自 `evidence/` |
| 已搁置包（勿执行） | `../archive/dsh-bot-native-surface/spec.md` | Deferred | 不在范围 |
| 无关脏树（勿混提交） | `../dsh-bot-session-nav/`、`../dsh-bot-group-chat/`、`../../packages/workbench-ui/src/BotForm.tsx`、`../../packages/workbench-ui/src/GroupForm.tsx`、`../../packages/dsh-bot-host/src/group-engine.ts` | found 且脏 | 四期 / 三期 leftover，不是本母包未完成项 |

缺失资料与假设：

- 子包未另写交接稿：不是缺口，本母包交接稿覆盖收口。
- ASM-110 已在记忆包 `../dsh-bot-memory/evidence/phase-0/calibration.md` 落地；本棒不重校准。

## 3. 开工上下文

### 当前盘面（交接时）

```text
母包 board 5/5：T1–T5 已完成
记忆 13/13：T13 已完成（INV-103 例外登记见母包 §1.5）
例程 14/14：T14 已完成（INV-103 例外登记见母包 §1.5）
无可开工任务。

本仓产品收口 commit：f797408
  docs(dsh-bot-living-master): honest leftover close, INV-103 still blocked
四命令已绿（296 tests）。红线空。env/dsh-bot 不入 git。
邻仓未改，也清不了。
```

### 架构 Before / After（已落地，勿重写）

```text
Before: bot = preset 文本；换会话即失忆；无用户输入时不存在
After:  bots.json.persona(真源) ──单一组合函数──> preset persona = 基础 + 记忆段 + 行为规范段
        memory/<botId>/ ◀ 轮次闭合抽取（仅用户 prompt 触发）   routines.json → 调度器 → 唤醒会话 → 未读/通知
        工作台：会话头 🧠 记忆 | ⏰ 例程；消息 📌 记住；名册未读徽标；「设成例程」卡
```

### Phase 地图

```text
母包 P0 前置(T1) 已完成
  → P1 记忆包全量(T2) 已完成（子包诚实阻塞见其 CSV）
  → P2 例程包全量(T3) 已完成（子包诚实阻塞见其 CSV）
  → P3 联合回放(T4) 已完成
  → 收尾(T5) 已完成（INV-103 例外见 §1.5）
```

### 最关键规则（Top 8，全量见 spec.md 第 2 章与子包第 2 章）

- BR-101：先记忆后例程；本棒不再开工子包实现。
- BR-102：persona 只有一个组合函数，顺序固定「基础 + 记忆段 + 规范段」。
- BR-103：例程唤醒不触发记忆抽取（`sessionTool.write`，不经 `promptOwnedSession`）。
- BR-104：有闸门仍红时，报告禁止写成"全部完成"。
- BR-105 / INV-103：一口一仓 :3084；邻仓 porcelain 与开工基线一致（既有脏文件见 spec §1.5）；红线空；`env/dsh-bot/{memory,routines.json}` 不入 git。
- INV-102：任何注入 / 规范段追加后 `bots.json.persona` 不变。
- UF-101~103：联合回放已过；evidence 在 `evidence/UF-101/` ~ `evidence/UF-103/`。不要重跑。
- 子包核心：寒暄不抽、explicit 永不被自动 remove；`(silent)` 不亮未读；系统通知仅 `document.hidden` 且 5s 节流。

### 禁止事项

- 不得重做 Phase 2–4，不得新开 UF 回放，不得重写组合函数 / 唤醒 / 抽取。
- 不得把已登记的 INV-103 例外改回「邻仓必须干净」或把三处收尾任务改回阻塞，除非用户明确要求。
- 不得改邻仓 `../../../../session-tool/plugin` 或 `../../../../vibee/plugin`（checkout / commit / restore 都不行）。
- 不得把 session-nav / group-chat leftover、`../../packages/workbench-ui/src/BotForm.tsx`、`../../packages/workbench-ui/src/GroupForm.tsx`、`../../packages/dsh-bot-host/src/group-engine.ts`、以及 grok / vscode / env 运行数据塞进本母包提交。
- 不得为了"收口好看"把阻塞改成完成。
- 不得只跑单测就宣称完成——本棒完成标准仍是 INV-103 命令干净 + 三包 validate 0 FAIL。
- 不得开新端口、不得改官方 npm 包。

## 4. 开工前初始化

1. 工作目录取仓根：`cd ../..`。
2. 读本包 `spec.md` §2.4 INV-103、§4 Task 5、`evidence/phase-final/report.md`、`evidence/phase-final/leftover-close-matrix.md`。
3. 跑板面，确认没有可开工实现任务：

```sh
python3 ~/.claude/skills/prd-workflow/scripts/board.py docs/dsh-bot-living-master
python3 ~/.claude/skills/prd-workflow/scripts/board.py docs/dsh-bot-memory
python3 ~/.claude/skills/prd-workflow/scripts/board.py docs/dsh-bot-routines
```

期望：三条都只剩 INV-103 阻塞，"无可开工任务"。

4. 只读核邻仓（不要改）：

```sh
git status --porcelain
git -C ../../session-tool/plugin status --porcelain
git -C ../../vibee/plugin status --porcelain
rg -i 'anysphere|sand://' packages/ env/ scripts/
git status --porcelain | rg "env/dsh-bot" || true
```

## 5. 核心执行循环

```text
INV-103 已关闭（例外登记）。本文件不再要求把邻仓清干净。

1. 只读核邻仓 porcelain 是否仍与 §1.5 清单同类（session-tool docs 删除 + vibee hide/review 遗留）。
2. 不要 checkout / commit / restore 邻仓。
3. 三处收尾任务保持 已完成。report.md 按 §7 完成总结写 13/13、14/14、5/5。
4. 本仓工作区里与 living-master 无关的脏文件保持不动。
```

不要中途问"是否继续"。三包收尾已完成，不要再开产品活。

## 6. 排障顺序

1. 先看 `spec.md` INV-103 / BR-105 / Task 5，再看 `evidence/phase-final/inv-103-porcelain.md`。
2. 本仓还有 session-nav / group-chat 脏文件：那是别的包，不是 INV-103 的修复面。
3. 邻仓 `M` / `D` / 非 `.vibee/` 的 `??`：停，等邻仓所有者。不要代清。
4. 若误改了产品文件：立刻 `git checkout -- <file>`，不要继续补丁。
5. Forget→inject 后 `preset.yml` 可能暂时残留旧记忆，要等新会话或 bot 更新才干净——这是已记录止损，不是 INV-103，不要当新 bug 修。

## 7. 完成标准与汇报

INV-103 例外已登记（当前路径）：

1. `evidence/phase-final/inv-103-porcelain.md` verdict = `例外登记（与开工基线一致）`。
2. 三处状态板为 `已完成`，备注写「INV-103 例外登记见母包 §1.5」。
3. 三次 validate 0 FAIL。
4. 终检：红线空；`env/dsh-bot` 不入 git；邻仓 porcelain 与 §1.5 清单同类。
5. 重跑：

```sh
python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-memory --repo .
python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-routines --repo .
python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-living-master --repo .
```

3. 对照 `spec.md` §5.4。不要重跑 §5.2。
4. 输出：

```markdown
## 完成总结
- 完成范围：母包 T1–T4 已完成；T5 …；记忆 12/13 + T13 …；例程 13/14 + T14 …
- 修改文件：只允许 living-master / 子包 docs 与 evidence（邻仓变干净时）
- 通过的 BR/UF：UF-101~103 已在上一棒通过；本棒不重跑
- 未破坏的不变量：INV-101 / INV-102 保持；INV-103 …
- Evidence：evidence/phase-final/inv-103-porcelain.md、report.md
- 剩余风险：Forget→inject 对已打开会话的 preset 可能滞后到下一次建会话
```
