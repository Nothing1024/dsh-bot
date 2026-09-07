# dsh-bot-alive-master Handoff（一口气三包）

本文件是可直接交给 Codex / Claude / omp / Generic Coding Agent 的总控交付 Prompt。目标不是「按文件改代码」，而是按顺序做完三个子包的全部用户可见行为，再跑本包联合回放。任何链条止损都要如实写，禁止虚报完成。

> 使用方式：把本文件完整粘贴给执行 Agent，或让 Agent 开工前先读本文件。
> 本文件只做入口导航，不复制 spec 内容；统筹规则以本包 `spec.md` 为准，实现细节以三个子包 spec 为准。
> 路径纪律：本文件内所有引用一律相对于本包目录 `docs/dsh-bot-alive-master/`。工作目录取仓根时先 `cd ../..`。

## 1. 目标

按顺序完成：① `../dsh-bot-live-transcript/`（SSE / 排队打断 / 思考工具审批卡 / 停三轮询）；② `../dsh-bot-peers/`（异步同事信 / 礼仪段 / 关系图）；③ `../dsh-bot-roster/`（分组拖拽 / 隐藏静音 / 快捷键）；④ 本包跨包联合回放与总回归。

## 1.1 执行环境假设（--executor generic，最保守）

| 项 | 假设 |
|---|---|
| 执行环境 | generic（omp / Claude / Codex 均适用） |
| 浏览器工具 | 有则用来回放 5.2；没有则 Playwright channel chrome 或人手回填截图 |
| 长命令策略 | 改代码后在仓根跑 typecheck / 相关 vitest；收尾才跑四命令全套 |
| 验证命令输出 | 每条验证命令完整输出写入对应 evidence 路径 |
| 网关身份 | loopback :3084；先核本仓 env。已起的 boot 脚本会直接退出，改代码后先杀本仓 pid 再 boot |
| 邻仓 | 零改。禁止 checkout / commit / restore / stash。脏清单见 `../dsh-bot-living-master/spec.md` §1.5 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| 母包 Spec（本包唯一事实源） | `spec.md` | found | 顺序 / 共享面 / 联合验收 / 内嵌 6 行状态表 |
| 母包状态板 | `spec.md` §4 内嵌状态表（不生成 CSV） | found | Task 1–6 |
| 实时包 Spec | `../dsh-bot-live-transcript/spec.md` | found | 第一阶段合同 |
| 实时包状态板 | `../dsh-bot-live-transcript/tasks.csv` | found | 16 条 |
| 同事包 Spec | `../dsh-bot-peers/spec.md` | found | 第二阶段合同 |
| 同事包状态板 | `../dsh-bot-peers/tasks.csv` | found | 15 条 |
| 名册包 Spec | `../dsh-bot-roster/spec.md` | found | 第三阶段合同 |
| 名册包状态板 | `../dsh-bot-roster/tasks.csv` | found | 15 条 |
| 上一棒母包（邻仓基线 + leftover） | `../dsh-bot-living-master/spec.md` | found | §1.5 邻仓脏清单 |
| 上一棒终报 | `../dsh-bot-living-master/evidence/phase-final/report.md` | found | 忘记→注入滞后；例程未校准。本棒不修 |
| Evidence 目录 | `evidence/` | found | 母包证据；子包证据在各自 `evidence/` |
| 共享面 Transcript | `../../packages/workbench-ui/src/Transcript.tsx` | found | 先卡片后标签 |
| 共享面 Roster | `../../packages/workbench-ui/src/Roster.tsx` | found | 先关系图入口后分组 |
| 共享面组合函数 | `../../packages/dsh-bot-host/src/memory.ts` | found | 只同事包追加 behavior |

缺失资料与假设：

- 三子包未另写交接稿：不是缺口，以各包 spec + CSV + 本文件为准。
- 本会话规划时 :3084 未监听：执行棒先 boot。

## 3. 开工上下文

### 当前盘面（交接时）

```text
母包 board 0/6：T1–T6 待开始
实时 0/16、同事 0/15、名册 0/15：待开始
本棒从 Task 1 前置检查开工。
```

### 架构 Before / After

```text
Before: 工作台整段跳变、输入框锁死、bot 不能互发、名册平铺
After:  一条 SSE → 排队/打断/卡片
        dsh_bot_send 异步 → 同事会话 → 关系图
        名册分组/隐藏/静音/快捷键
        persona behavior 仍只有一个组合函数
```

### Phase 地图

```text
母包 P0 前置(T1)
  → P1 实时包全量(T2)
  → P2 同事包全量(T3)
  → P3 名册包全量(T4)
  → P4 联合回放(T5) → 收尾(T6)
```

### 最关键规则（Top 8，全量见 spec.md 第 2 章与子包第 2 章）

- BR-041：先实时，再同事，再名册；三包校准都不得跳过。
- BR-042：Transcript 先卡片后标签；Roster 先关系图入口后分组；组合函数只有一个；SSE 只有一份。
- BR-043：有闸门仍红时，报告禁止写成「全部完成」。
- BR-044：一口一仓 :3084；邻仓按上一棒基线，不代清；运行数据不入 git；不重开上一棒 leftover。
- INV-041：后包不得毁掉前包已过行为。
- INV-042：不新增工作台定时器。
- UF-041~043：联合回放才算母包完成。
- ASM-041：实时包 SSE 未合入时，联合实时场景按 2s 回退验收并写明。

### 禁止事项

- 不得打乱三包顺序，不得跳过任一包 Task 1 校准。
- 不得在母包新增产品功能或第二套 persona 组合函数。
- 不得改邻仓（checkout / commit / restore 都不行）。
- 不得把上一棒 leftover、session-nav / group-chat 脏文件、官方 npm、运行数据塞进本母包提交。
- 不得为了「收口好看」把阻塞改成完成。
- 不得只跑单测就宣称完成。
- 不得开新端口。

## 4. 开工前初始化

1. 工作目录取仓根：`cd ../..`。
2. 读本包 `spec.md` §2 与 §4。
3. 跑板面：

```sh
python3 -c "print('use prd-workflow board.py on docs/dsh-bot-alive-master and the three child dirs')"
```

4. 只读核邻仓（不要改）。对照 `../dsh-bot-living-master/spec.md` §1.5。

## 5. 核心执行循环

```text
1. Task 1：三子包校验 0 FAIL，记下 packages/ 基线。
2. Task 2：按实时包 tasks.csv 做到该包收尾（校准不得跳）。
3. Task 3：开工前看 Transcript 卡片还在；按同事包 tasks.csv 做完。
4. Task 4：开工前看 Roster 关系图入口还在；按名册包 tasks.csv 做完。
5. Task 5：只跑本包 5.2 联合矩阵，不重复子包全矩阵。
6. Task 6：四命令 + 红线 + 三子包二次校验 + report.md。
每子包 Phase 单独 commit，不混包。
```

不要中途问「是否继续」，除非撞上红线或邻仓被你误改。

## 6. 排障顺序

1. 先看本包 `spec.md` 对应 BR / 联合 UF，再看子包 spec。
2. Transcript 丢思考卡：回实时包卡片任务，同事包不得「修好」成 return null。
3. Roster 丢关系图：回名册包 UI 任务，把入口加回。
4. 礼仪冲掉记忆段：回同事包，只改 behavior 字符串。
5. 同事回复不实时：先看实时包 SSE 是否合入（ASM-041），再看同事包回写落点。
6. 若误改邻仓或官方包：立刻停，不要继续补丁。

## 7. 完成标准与汇报

1. 三子包 tasks.csv 全部已完成或诚实已阻塞；各包 5.2 有 evidence。
2. 本包 5.2 UF-041~043 全过（或按 ASM-041 诚实降级并写明）。
3. 四次 validate（三子包 + 本包）0 FAIL。
4. 四命令全绿；红线空；`env/dsh-bot` 不入 git。
5. evidence/phase-final/report.md 按下面写：

```markdown
## 完成总结
- 完成范围：母包 T1–T6 …；实时 a/16 + 止损…；同事 b/15 + 止损…；名册 c/15 + 止损…
- 修改文件：只允许对应子包产品改动 + 本四包 docs/evidence
- 通过的联合场景：UF-041~043 …
- 未破坏的不变量：INV-041 / INV-042 / INV-043
- Evidence：evidence/UF-041/ ~ UF-043/ 与 phase-final/report.md
- 剩余风险：…
```
