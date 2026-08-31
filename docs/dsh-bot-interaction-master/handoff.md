# dsh-bot-interaction-master Handoff(一口气全部启动)

本文件是可直接交给执行 Agent 的**总控交付 Prompt**:一次跑完两个子包(四期会话导航 → 五期小组多轮)+ 跨包联合验收。你的目标不是"按文件改代码",而是在不破坏业务不变量的前提下,完成两个子包 spec 定义的全部用户可见行为,并通过母包联合回放。

> 使用方式:把本文件完整粘贴给执行 Agent(人工路径);或用无人值守启动器 `../../.grok/workflows/dsh-bot-interaction-master.rhai`(由母包 Task 1 就位,波次编排同本文件顺序)。
> 本文件只做入口导航;统筹规则以本包 `spec.md` 为准,实现细节以两个子包 spec 为准。
> 路径纪律:文件引用一律相对本包目录(docs/dsh-bot-interaction-master);仓根 = `../..`。

## 1. 目标

按顺序完成:① `../dsh-bot-session-nav/`(跳转桥/收纳/自动起题/会话动作/overview+SSE);② `../dsh-bot-group-rounds/`(多轮讨论/继续讨论/排队/引用点名/单成员重试/房间管理);③ 本包跨包联合回放(UF-601~603)与总回归。任何子包链条止损都要如实报告,禁止虚报完成。

## 1.1 执行环境假设(generic + 浏览器 MCP)

| 项 | 假设 |
|---|---|
| 执行环境 | 本机 macOS(邻仓/凭据/网关同机) |
| 浏览器工具 | chrome-devtools 类 MCP 已在本仓 :3084 实证可用;5.2 browser 行自动回放截图;不可用则手动脚本+用户回填 |
| 网关 | :3084 profile gb;先 `~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084` 核身份;改代码后 `pnpm -r run build`、杀本仓 pid、`sh env/boot.sh`(已起会直接退出) |
| 验证命令输出 | 每条验证命令完整输出存对应 evidence 路径 |

## 2. 资料清单

| 资料 | 路径 | 状态 | 用途 |
|---|---|---|---|
| 母包 Spec(统筹唯一事实源) | `spec.md` | found | 顺序/冲突规约/联合矩阵/5 任务内嵌状态表 |
| 四期包 | `../dsh-bot-session-nav/`(spec.md + tasks.csv + handoff.md) | found | 第一阶段全部实现 |
| 五期包 | `../dsh-bot-group-rounds/`(spec.md + tasks.csv + handoff.md) | found | 第二阶段全部实现 |
| 一键启动器 | `../../.grok/workflows/dsh-bot-interaction-master.rhai` | found(Task 1 核) | 无人值守波次编排 |
| Evidence | `evidence/` | found | 联合验收证据 |

缺失资料与假设:无缺失。ASM-601(四期 P3 阻塞时五期降级)见 `spec.md` 1.4。

## 3. 开工上下文

### 架构 Before / After

```text
Before: 工作台会话堆官方侧栏/满屏「新对话」/无跳转;roster O(N) 轮询;小组一轮广播
After:  四期:收纳+起题+跳转桥+overview/SSE
        五期:多轮讨论+排队+引用点名+重试+房间管理(基于四期合入后增量)
        母包:联合回放证明两包叠加不互伤、老路径零回归
```

### Phase 地图(母包内嵌状态表 5 条)

```text
T1 前置与启动器 → T2 四期全量(其 T1-T14) → T3 五期全量(其 T1-T15)
  → T4 联合回放(UF-601~603) → T5 总回归收尾
```

### 最关键规则(Top 8,全量见 spec.md 第 2 章与子包第 2 章)

- BR-601: 顺序四期→五期;四期个别阻塞时五期按其降级假设继续,不空转
- BR-602: 五期基于四期合入后增量改共享文件,禁止回退四期行为
- BR-603: 完成 = 双子包 0 FAIL + 双 5.2 全过 + 联合矩阵全过;止损必须如实报告
- BR-604: 红线延续(不拷参考树/一口一仓/邻仓零改/运行数据不入 git)
- INV-601: 子包互不回归(四期行为在五期后保持;三期一轮在缺省下保持)
- INV-602: 终检三命令干净
- UF-601: 多轮讨论的隐藏轮次会话可经四期跳转达官方视图
- UF-602: 讨论进行中 roster 实时且无 O(N) 回退

### 禁止事项

- 不得并行执行两个子包或颠倒顺序。
- 不得跳过任一子包的 Task 1 校准。
- 不得在母包层面复制/改写子包合同;变更走各子包变更协议。
- 不得把与本三包无关的脏文件 stage 进提交。
- 不得只跑命令级验证宣称完成——两级 5.2(子包+联合)才是完成标准。
- 不得动 3080/3081/3083、不得改邻仓、不得提交 env 运行数据。

## 4. 开工前初始化

1. 工作目录取仓根(`cd ../..`)。
2. 读本包 `spec.md` 第 2、4、5 章;预读两子包 handoff 的「开工上下文」。
3. 环境与子包双校验:

```sh
~/.agents/skills/dsh-plugin-debug/scripts/dsh-rpc-who.sh 3084
git status --short
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav --repo .
python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-group-rounds --repo .
```

4. 把本包内嵌状态表 T1 置「进行中」,完成 preflight 后把记录写进 evidence 目录 phase-0 小节的 preflight 文档(首次写入时创建子目录)。

## 5. 核心执行循环

```text
T1 preflight(双校验 + 启动器就位)
T2 进入 ../dsh-bot-session-nav/:按其 handoff.md 第 5 节循环推进其 tasks.csv 全部 14 条
   (含其 5.2 真实场景与二次 validate;每 Phase 按其纪律 commit)
   → 板面快照写 evidence/phase-1/nav-board.md;母包 T2 置已完成
T3 进入 ../dsh-bot-group-rounds/:先 diff 核四期已合入,再按其 handoff.md 推进其 15 条
   → 板面快照写 evidence/phase-2/rounds-board.md;母包 T3 置已完成
T4 按本包 spec 5.2 联合矩阵逐行回放(UF-601~603),evidence 落盘,
   复跑 python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-interaction-master
T5 总回归:pnpm -r build/typecheck/test + standard:check + INV-602 三命令,
   写 evidence/phase-final/report.md(含各板面终态与止损点)
```

不要中途问是否继续;除非所有剩余任务都被阻塞。任何子包任务 已阻塞 时:跳过其依赖项继续其余任务,并把影响记入母包报告。每完成母包一条任务,立即更新 `spec.md` 第 4 章内嵌状态表。

## 6. 排障顺序

1. 先查所在子包 spec 第 4 章当前任务注意事项,再查其第 2 章合同。
2. dsh-plugin-debug:who → pluginInventory → session.history。
3. 跨包冲突(五期改坏四期功能):以 BR-602 为准回退五期改法,不改四期合同。
4. 环境类失败(端口被占/凭据缺):按各子包 handoff 环境节处理;3084 被外仓占用时停下记录,不劫持。
5. ≤3 次修复,仍败阻塞继续。

## 7. 完成标准与汇报

1. 两子包:各自 tasks.csv 全「已完成」(或诚实已阻塞)+ 各自二次包校验(§4 同款命令)0 FAIL + 各自 5.2 全过。
2. 母包:联合矩阵(spec 5.2)全行通过或标注 不适用-链条止损;对 docs/dsh-bot-interaction-master 复跑 §4 同款包校验命令 0 FAIL。
3. `pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check` 全绿;INV-602 三命令干净。
4. 输出最终总结到 evidence 目录 phase-final 小节的 report 文档:

```markdown
## 完成总结
- 完成范围:四期 …/14;五期 …/15;联合矩阵 …/7 行
- 止损点:无 / {包}-{Task}:{原因}
- 修改文件:...
- 通过的 BR/UF:...(两级 5.2 各 N/N 行)
- 未破坏的不变量:INV-601/602 + 各子包 INV
- Evidence:evidence/...
- 剩余风险:...
```
