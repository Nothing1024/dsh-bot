# dsh-bot-interaction-master Spec

> Version: 0.1.0 | Date: 2026-09-01 | Status: Ready 可执行
>
> 本文件是**母包**唯一事实源:统筹两个子包的执行顺序、共享面冲突规约、跨包联合验收。
> 子包合同各自独立(编号闭环)。引用子包条目时用「路径 + 描述性名称」,不直写其条目编号:
> - 四期 `../dsh-bot-session-nav/spec.md`(会话导航:跳转桥/收纳/起题/会话动作/聚合推送)
> - 五期 `../dsh-bot-group-rounds/spec.md`(小组多轮:讨论引擎/排队/引用点名/重试/房间管理)
>
> 填写三态规则:每个表格单元格只允许三种内容——验证过的事实(注明来源命令)/ `ASM-xxx` / `待勘察`。

---

## 0. 一页纸人话摘要

- **给谁 / 场景**:要"一口气"把两个升级包(会话导航 + 小组多轮讨论)全部做完的执行方(无人值守 agent 或人)。
- **做什么**:一个总控包——定义两个子包的执行顺序(先会话导航,后小组多轮)、两包共享代码面的冲突规矩、以及两包都完成后的**跨包联合验收**(单包各自的验收不重复,这里只测两包叠加才会出现的场景)。
- **改哪里**:本包自己不改产品代码;所有实现都发生在两个子包的任务里。
- **怎么算做完**:两个子包各自 spec 5.2 全过且校验脚本 0 FAIL;本包三条联合场景(多轮讨论中跳转隐藏轮次会话、讨论进行中 roster 实时态、老路径全量抽验)全过;最终 build/typecheck/test/standard:check 全绿。
- **不做什么**:不重复子包的执行矩阵;不在母包里新增任何产品功能。

---

## 1. 事实基线与假设

### 1.1 需求与运行模式

| 项 | 结论 |
|---|---|
| 原始需求 | 「都走 /prd-workflow oneclick,然后还要有一个 master prd oneclick 包用于一口气全部启动」(2026-09-01) |
| 输入类型 | description(用户指令 + 两个子包已生成) |
| Mode | oneclick(母包,多包统筹) |
| 置信度 | 高(两子包 spec 已落盘且各自 --repo 校验;统筹层无未知机制) |
| 输出目录 | `docs/dsh-bot-interaction-master/` |

### 1.2 任务类型路由

| 维度 | 结论 |
|---|---|
| 任务类型 | infra(执行编排 + 联合验收;不新增产品面) |
| 主要风险 | 两包共享文件(Conversation.tsx / workbench-routes.ts / App.tsx)的先后改造冲突;四期被阻时五期的 ASM-502 降级 |
| 行号引用策略 | 母包不定位产品代码;定位清单指向子包 spec 与启动脚本 |
| 必需验收方式 | 子包各自 5.2 + 本包 5.2 联合回放(browser + RPC/CLI) |
| 必须覆盖用户场景 | UF-601 联合跳转、UF-602 联合实时态、UF-603 老路径抽验 |

### 1.3 勘察事实清单

| 事实 | 来源命令 | 输出摘要 |
|---|---|---|
| 两子包已生成且结构齐备(spec/tasks.csv/handoff/evidence) | `ls docs/dsh-bot-session-nav docs/dsh-bot-group-rounds`(2026-09-01) | 可被本包引用与调度 |
| 四期包定位清单已 `--repo` 全量核验(13 条 rg anchor 命中) | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav --repo .` | 子包可执行性有机器背书 |
| 两包共享改造文件:五期 3.2 与四期 3.2 都点名 `packages/workbench-ui/src/Conversation.tsx`、`App.tsx`、`packages/dsh-bot-host/src/workbench-routes.ts` | Read 两子包 spec 3.2 模块表(2026-09-01) | BR-602 冲突规约的依据 |
| 五期对四期有单向依赖:引擎态暴露走四期 `overview`(五期 ASM-502),roster 不得回退 O(N) 轮询(五期 handoff 禁止事项) | Read `docs/dsh-bot-group-rounds/spec.md` 1.4 ASM-502 | 执行顺序必须四期先行 |
| 既有无人值守执行样板:`.grok/workflows/dsh-bot-workbench.rhai`(inspect→impl→双轴 review→fix→verify→closer 波次,按 tasks.csv 板面推进) | Read `.grok/workflows/dsh-bot-workbench.rhai` | 本包 rhai 启动器按同形状编排两包 |
| 环境与验收工具(:3084/profile gb/浏览器 MCP/Playwright/RPC 脚本)在 v2/v3 验收全部实证 | `../dsh-bot-workbench/spec.md` 5.2、`../dsh-bot-group-chat/spec.md` 5.2(已验收) | 联合回放环境沿用 |

### 1.4 假设清单

| 假设 ID | 内容 | 风险 | 确认方式 |
|---|---|---|---|
| ASM-601 | 四期 P3(overview/SSE)若被阻塞,五期仍可按其 ASM-502 降级通道(独立 groupStatus)推进,联合场景 UF-602 按降级通道验收 | 双通道行为不一致 → 联合回放暴露,回五期 Task 10 修 | Task 2 完成后核四期板面;UF-602 执行时按实况选通道 |

### 1.5 变更记录

| 日期 | 变更条目 ID | 原因 | 影响任务与处置 |
|---|---|---|---|
| 2026-09-01 | 初版 | — | — |

---

## 2. 业务合同

> 母包只定义统筹层合同;子包条目一律引用不复制。子包 spec 路径清单见本文件头部。

### 2.1 BR 业务规则

| 规则 ID | 规则 | 正例 | 反例 | 影响范围 | 验证方式 |
|---|---|---|---|---|---|
| BR-601 | 执行顺序:先四期 `../dsh-bot-session-nav/spec.md` 后五期 `../dsh-bot-group-rounds/spec.md`;每个子包按其 tasks.csv 板面推进到"全部已完成或诚实已阻塞";四期个别任务阻塞不满足五期依赖面时,五期按其 ASM-502 降级继续,不得空转等待 | 四期 P3 阻塞 → 五期照常开工并用 groupStatus | 并行乱改同一文件;五期先行 | 两子包 | Task 2/3 板面核查 |
| BR-602 | 共享面规约:五期对 `Conversation.tsx`/`App.tsx`/`workbench-routes.ts` 的改造必须基于四期合入后的工作区增量进行,禁止回退四期已交付行为(跳转菜单/收纳/起题/overview 单请求);两子包各自 Phase commit 按各自 spec 纪律,不混包提交 | 五期 diff 里四期功能原样在 | 五期把 roster 改回 O(N) 轮询 | 全仓 | Task 3 开工前 diff 核 + Task 4 联合回放 |
| BR-603 | 完成闸门:母包完成 = 两子包各自 `validate_package.py` 0 FAIL 且其 5.2 全过 + 本包 5.2 联合回放全过 + 最终 `pnpm -r build/typecheck/test && pnpm run standard:check` 全绿;任何子包链条止损时,母包报告必须写明止损点与未执行面,禁止描述为"全部完成" | 报告如实写"五期 T14 阻塞:xx" | 子包有 FAIL 仍宣称母包完成 | 全仓 | Task 4/5 |
| BR-604 | 纪律延续(引用):四期红线与兼容条款(`../dsh-bot-session-nav/spec.md` 2.1 末条)与五期兼容红线条款(`../dsh-bot-group-rounds/spec.md` 2.1 末条)对母包全程有效;一口一仓(:3084)、邻仓零改、运行数据不入 git、不拷参考树 | 终检三命令干净 | — | 全仓 | Task 5 终检 |

### 2.2 UF 用户验收场景(索引)

> 只列**跨包耦合面**场景;子包各自 UF 不重复(见其 spec 5.2)。

| 场景 ID | Given | When | Then | 角色 | 验证方式 | Evidence |
|---|---|---|---|---|---|---|
| UF-601 | 两包已合入;两人小组 rounds=2 且收纳开关开 | 跑一场两轮讨论后,从成员 1:1 会话列表(含隐藏)对轮次会话「在 DSH 打开」 | 官方视图达到该隐藏轮次会话,能看到两轮 wake 痕迹;工作台/官方侧栏收纳状态不被讨论破坏 | 本机用户 | browser | EVD-601 |
| UF-602 | 多轮讨论进行中 | 切走到别的 bot,观察 roster 与网络面板 | 小组行 working 真值点亮、预览随成员发言更新;请求仍是 overview/events 单通道(或 ASM-601 降级通道),无 O(N) 回退 | 本机用户 | browser + network | EVD-602 |
| UF-603 | 两包全部合入 | 复跑老路径:v1 委托、v2 双人设隔离、三期默认一轮小组 | 三条主路径与各自包验收时逐步一致 | 本机用户 | browser + RPC | EVD-603 |

### 2.3 核心业务流程(步骤级交互脚本)

#### UF-601: 多轮讨论中的隐藏轮次会话跳转

**前置状态**:页签内工作台;两人小组 rounds=2;四期收纳开关默认开。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 小组发一条触发两轮讨论 | 轮次进度/chips 三态(五期) | runGroupDiscussion 两轮 | 房间 4 条内成员发言 |
| 2 | 切到成员「诗人小北」1:1,会话下拉勾「包含隐藏」 | 列表出现委托隐藏会话;轮次会话按三期约定**不在**此列表 | 五期隐藏轮次过滤不变量(其 spec 2.4)不破 | 确认过滤纪律未被两包叠加破坏 |
| 3 | 回小组房间,对某条成员发言行(或经 CLI 取轮次会话 id)执行四期「在 DSH 打开」 | 跳转请求 | postMessage 桥 → jumpToSession(按四期 ASM-401 结论路径) | 官方视图达到该隐藏轮次会话,可见两轮 wake 与回复 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 讨论进行中跳转 | 轮次未收束 | 跳转照常(只读查看);composer 在官方视图受该会话运行态约束 | 无写冲突(读路径) | 等讨论结束再操作 |
| 四期跳转降级路径 | ASM-401 结论为"先显形" | toast「已在 DSH 显示该会话」 | revealSession 后 open | 用完可手动再隐藏 |

**界面状态机**:`讨论中/idle → 跳转请求 → 官方视图(达到) | toast 失败(工作台不变)`

**入口接线清单**(由子包任务交付,母包只核联合可达):

- 四期 Task 2/3(桥与菜单);五期 Task 2(多轮)、Task 1(隐藏会话复用校准)

#### UF-602: 讨论进行中的 roster 实时态

**前置状态**:多轮讨论进行中;DevTools network 打开。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 讨论开始后切到别的 bot | 小组行 working 点亮(未选中态) | 五期 running 真值 → 四期 overview(或降级 groupStatus) | roster 状态实时 |
| 2 | 成员逐个发言 | 小组行预览随最新发言更新,时间前移 | SSE 脏通知 → 拉 overview | ≤2s 更新 |
| 3 | 观察 network | — | 单通道请求 | 每拍 ≤1 个聚合请求 + events 常驻,无每 owner 一请求回退 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 四期 SSE 被阻(ASM-601) | 四期 P3 未交付 | 状态仍正确,靠轮询 | 五期降级通道 | 记录止损,不算 UF-602 失败(核对点降级为"状态正确+无 O(N)") |
| 讨论中断(网关重启) | boot 重启 | roster 错误态→恢复;讨论按五期边界收束 | 队列清空(五期文档化) | 重新触发 |

**界面状态机**:`讨论中(推送/轮询驱动更新) → 结束复位;断线 → 兜底轮询 → 恢复`

**入口接线清单**:四期 Task 9/10;五期 Task 10。

#### UF-603: 老路径全量抽验

**前置状态**:两包全部合入并重启网关。

**成功主路径**:

| 步骤 | 用户动作 | 界面即时反馈 | 系统行为 | 用户看到的结果 |
|---|---|---|---|---|
| 1 | 官方会话调 `dsh_bot_ask` | 工具卡完成 | v1 链 | 答案返回,隐藏会话纪律不变 |
| 2 | v2 双人设各自对话+草稿切换 | 隔离如旧 | v2 链 | 历史/口吻/草稿三隔离 |
| 3 | 未改 rounds 的老小组发「你们是谁?」 | 全员一轮各一句 | 五期默认单轮路径 | 与三期验收逐步一致 |

**失败分支**:

| 分支 | 触发条件 | 界面表现 | 系统行为 | 恢复路径 |
|---|---|---|---|---|
| 任一步与原验收不一致 | 回归缺陷 | 记录差异 | 判 P0 回子包修 | 修复后重跑本条 |
| 网关死 | boot 停 | 各面错误态(既有) | — | 重启重试 |

**界面状态机**:同各原包。

**入口接线清单**:既有入口(工具/工作台/小组),母包只核可达与一致。

### 2.4 INV 不变量

| 不变量 ID | 内容 | 关联 BR/UF | 验证方式 |
|---|---|---|---|
| INV-601 | 子包互不回归:五期合入后,四期 5.2 已过行为(跳转/收纳/起题/归档/单请求 roster)保持;四期合入后,三期一轮语义保持(五期缺省即三期) | BR-602, UF-603 | Task 4 联合回放 + Task 5 抽验 |
| INV-602 | 全局纪律:仍只有 :3084;邻仓 porcelain 干净(vibee 既有 `?? .vibee/` 除外);`rg -i 'anysphere\|sand://' packages/` 为空;`groups.json`/rooms/bots.json/env 凭据不入 git | BR-604 | Task 5 终检三命令 |

### 2.5 EVD 证据清单

| 证据 ID | 类型 | 期望证据 | 保存位置 |
|---|---|---|---|
| EVD-601 | screenshot+log | 两轮讨论后跳转隐藏轮次会话:工作台菜单、官方视图、过滤纪律取证 | `evidence/UF-601/` |
| EVD-602 | screenshot | 讨论中 roster working/预览更新 + network 单通道 | `evidence/UF-602/` |
| EVD-603 | screenshot+log | v1/v2/三期三条主路径复跑对比 | `evidence/UF-603/` |
| EVD-604 | log | 两子包二次校验输出 + 最终 5.1 全套命令输出 + 总报告 | `evidence/phase-final/` |

### 2.6 角色与权限矩阵

单一本机用户,loopback,无权限差异。

### 2.7 负向 / 破坏性场景

| 场景 | Given | When | Then | Evidence |
|---|---|---|---|---|
| 子包链条止损 | 四期或五期有 已阻塞 任务 | 母包收尾 | 报告写明止损点/未执行面;联合场景标注 不适用-链条止损;不虚报完成 | `evidence/phase-final/report.md` |
| 依赖失败 | 网关死于联合回放中途 | 重启后续跑 | 已过行不重复,断点续跑 | `evidence/phase-final/report.md` |
| 脏工作区 | 开工时存在与本三包无关的未提交改动 | 执行/提交 | 只 stage 本单元产物;无关改动原样保留 | `evidence/phase-final/report.md` |

### 2.8 非目标

- 不重复子包执行矩阵;不在母包新增产品功能;不做 token 流式(两子包均列为后续)。

---

## 3. 技术方案

### 3.1 架构 Before / After

```text
Before: 两个 Ready 子包各自独立,无执行编排与联合验收
After:  母包定义 顺序(四期→五期) + 冲突规约 + 联合回放
        一键启动器 .grok/workflows/dsh-bot-interaction-master.rhai:
          四期波次(P0→P4,IRF 循环) → 五期波次(P0→P4,IRF 循环) → 母包联合验收 closer
        (人工路径:依次贴两子包 handoff.md,再回本包跑 Task 4/5)
```

### 3.2 模块改造

| 模块 | 职责 | 改造说明 |
|---|---|---|
| `../dsh-bot-session-nav/` | 四期实现 | 由其 spec/tasks 驱动,本包不复制 |
| `../dsh-bot-group-rounds/` | 五期实现 | 同上 |
| `../../.grok/workflows/dsh-bot-interaction-master.rhai` | 一键启动器 | 新建:按 `.grok/workflows/dsh-bot-workbench.rhai` 形状编排两包波次 + 联合 closer |

### 3.3 三段式定位清单

| 文件 | 稳定定位 | 搜索定位 | 行号 hint | 备注 |
|---|---|---|---|---|
| `../dsh-bot-session-nav/spec.md` | `# dsh-bot-session-nav Spec` | `rg "dsh-bot-session-nav Spec" docs/dsh-bot-session-nav/spec.md` | L1 | 子包合同(相对仓根) |
| `../dsh-bot-group-rounds/spec.md` | `# dsh-bot-group-rounds Spec` | `rg "dsh-bot-group-rounds Spec" docs/dsh-bot-group-rounds/spec.md` | L1 | 子包合同 |
| `../dsh-bot-session-nav/tasks.csv` | 状态板表头 | `rg "详情锚点" docs/dsh-bot-session-nav/tasks.csv` | L1 | 板面推进依据 |
| `../dsh-bot-group-rounds/tasks.csv` | 状态板表头 | `rg "详情锚点" docs/dsh-bot-group-rounds/tasks.csv` | L1 | 板面推进依据 |
| `../../.grok/workflows/dsh-bot-workbench.rhai` | `fn run_irf` | `rg "fn run_irf" .grok/workflows/dsh-bot-workbench.rhai` | L383 | 启动器样板 |
| `../../.grok/workflows/dsh-bot-interaction-master.rhai` | 新建:`master` 波次编排 | 建成后 `rg -F "dsh-bot-interaction-master" .grok/workflows/dsh-bot-interaction-master.rhai` | 新建 | Task 1 交付 |
| `../../env/boot.sh` | 启动脚本 | `rg "profile gb" env/boot.sh` | L46 附近 | 环境入口 |

### 3.4 API / 数据 / 权限 / 路由影响

均无影响:母包不新增产品面,全部影响记录在两子包各自 3.4。

---

## 4. Phase 计划与任务详情

> Phase 依赖链:

```text
P0 前置与启动器(T1) → P1 四期执行(T2) → P2 五期执行(T3) → P3 联合验收与收尾(T4-T5)
```

> 实现任务数 < 8 → 用下方内嵌状态表,不生成 tasks.csv。

### 内嵌状态表

| 序号 | 任务 | 前置 | 验证命令 | 状态 | 备注 |
|---|---|---|---|---|---|
| 1 | 前置检查与一键启动器 | 无 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav --repo .` 与 `... docs/dsh-bot-group-rounds --repo .` 均 0 FAIL | 待开始 | 豁免回归:P0 单实现任务 |
| 2 | 执行子包 dsh-bot-session-nav 全量 | 1 | 其 tasks.csv 14 条全部 已完成(或诚实已阻塞)且其 validate 0 FAIL | 待开始 | 按其 handoff.md 推进 |
| 3 | 执行子包 dsh-bot-group-rounds 全量 | 2 | 其 tasks.csv 15 条全部 已完成(或诚实已阻塞)且其 validate 0 FAIL | 待开始 | 按其 handoff.md 推进;ASM-601 降级允许 |
| 4 | 执行 spec 5.2 真实场景全套测试(跨包联合回放) | 3 | 5.2 执行矩阵 UF-601~603 全行通过并落 evidence | 待开始 | |
| 5 | 执行母包总回归验证(收尾) | 4 | `pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check` 全绿 + INV-602 三命令干净 + 总报告落盘 | 待开始 | |

### Phase 0: 前置与启动器

> 你在哪里:两子包 Ready,无编排。
> 做完之后:环境/子包双校验通过,一键启动器就位。

### Task 1: 前置检查与一键启动器

- **关联**:BR-601 / BR-604(UF 无:编排开销任务)
- **前置任务**:无
- **风险等级**:P1

**为什么做**:开工前锁定"子包可执行 + 环境可用 + 启动器可跑",避免波次中途才发现地基问题。

**涉及文件与定位**:

- `../dsh-bot-session-nav/spec.md`、`../dsh-bot-group-rounds/spec.md`(子包合同)
- 新建 `../../.grok/workflows/dsh-bot-interaction-master.rhai`(样板 `fn run_irf`,`rg "fn run_irf" .grok/workflows/dsh-bot-workbench.rhai`)

**具体操作**:

1. 仓根跑两子包 `validate_package.py --repo`,0 FAIL;`dsh-rpc-who.sh 3084` 核环境(未起则 `sh env/boot.sh`)。
2. 按 workbench.rhai 形状写 master 启动器:四期波次(1 / 2-4 / 5-8 / 9-11 / 12-14)→ 五期波次(1 / 2-4 / 5-8 / 9-12 / 13-15)→ 母包联合 closer(Task 4/5 语义);每波 inspect→impl→双轴 review→fix→verify→closer,板面路径指向对应子包。
3. `git status --short` 记录开工基线(已有无关脏文件不 stage)。

**验证**:两条 validate 命令 0 FAIL;启动器文件存在且 `grep` 到两个子包路径 → 期望齐备

**Evidence**:`evidence/phase-0/preflight.md`

**注意事项**:启动器只编排、不内联子包规则(单一事实源);豁免回归:P0 单实现任务,回归并入本任务验证。

### Phase 1: 四期执行

### Task 2: 执行子包 dsh-bot-session-nav 全量

- **关联**:BR-601 / BR-602;交付 `../dsh-bot-session-nav/spec.md` 全部条目
- **前置任务**:1
- **风险等级**:P0

**具体操作**:按 `../dsh-bot-session-nav/handoff.md` 完整执行(P0→P4,含其 5.2 与二次校验);逐任务更新其 tasks.csv;每 Phase 按其纪律 commit。

**验证**:其 tasks.csv 14 条全部「已完成」(或诚实「已阻塞:原因」且不影响后续依赖)且 `validate_package.py docs/dsh-bot-session-nav` 0 FAIL → 期望板面干净

**Evidence**:`evidence/phase-1/nav-board.md`(板面快照 + validate 输出)

**注意事项**:阻塞时记录对五期 ASM-502 的影响(ASM-601);豁免回归:单任务 Phase,回归并入验证(子包自带全量回归)。

### Phase 2: 五期执行

### Task 3: 执行子包 dsh-bot-group-rounds 全量

- **关联**:BR-601 / BR-602;交付 `../dsh-bot-group-rounds/spec.md` 全部条目
- **前置任务**:2
- **风险等级**:P0

**具体操作**:开工前 `git log --oneline -5` + diff 核四期已合入(BR-602);按 `../dsh-bot-group-rounds/handoff.md` 完整执行;其 Task 1 校准必须消费四期实际板面(ASM-502/ASM-601)。

**验证**:其 tasks.csv 15 条全部「已完成」(或诚实「已阻塞:原因」)且 `validate_package.py docs/dsh-bot-group-rounds` 0 FAIL → 期望板面干净

**Evidence**:`evidence/phase-2/rounds-board.md`(板面快照 + validate 输出)

**注意事项**:禁止回退四期行为(BR-602 反例);豁免回归:单任务 Phase,回归并入验证(子包自带全量回归)。

### Phase 3: 联合验收与收尾

### Task 4: 执行 spec 5.2 真实场景全套测试(跨包联合回放)

- **关联**:UF-601 / UF-602 / UF-603 / INV-601 / BR-603
- **前置任务**:3
- **风险等级**:P0

**验证**:按 5.2 执行矩阵逐行回放全部通过(ASM-601 降级行按降级核对点);evidence 落盘后复跑 `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-interaction-master`(证据审计)

**Evidence**:`evidence/UF-601/` + `evidence/UF-602/` + `evidence/UF-603/`

### Task 5: 执行母包总回归验证(收尾)

- **关联**:BR-603 / BR-604 / INV-601 / INV-602
- **前置任务**:4

**验证**:`pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check` 全绿;邻仓 porcelain 干净(vibee 既有 `?? .vibee/` 除外);`rg -i 'anysphere|sand://' packages/` 为空;`git status` 无运行数据;总报告(含各子包板面终态、止损点、联合矩阵结果)写入 `evidence/phase-final/report.md`

**Evidence**:`evidence/phase-final/report.md` + `evidence/phase-final/final-regression.log`

---

## 5. 验收与 Review 协议

> **验收铁律:命令级验证(5.1)只是入场券;子包 5.2 + 本包 5.2 联合回放全过才算完成。**

### 5.1 命令级验证(入场券)

| 验证项 | 命令 | 期望 | Evidence |
|---|---|---|---|
| 构建/类型/单测/标准面 | `pnpm -r run build && pnpm -r run typecheck && pnpm -r test && pnpm run standard:check` | 全绿 | EVD-604 |
| 子包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav` 与 `... docs/dsh-bot-group-rounds` | 各 0 FAIL | EVD-604 |
| 母包校验 | `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-interaction-master` | 0 FAIL | EVD-604 |

### 5.2 真实场景全套测试(Real-Run,跨包联合回放)

> 只测两包叠加的耦合面;子包各自矩阵在其包内完成,不重复。

**环境准备**:

| 项 | 值 |
|---|---|
| 启动命令 | `cd <本仓> && pnpm install && pnpm -r run build && sh env/setup.sh && sh env/boot.sh`(已起则 `dsh-rpc-who.sh 3084` 核身份) |
| 访问入口 | 工作台 `http://127.0.0.1:3084/dsh-bot/ui` 与官方 GUI :3084 右栏页签;RPC `dsh-rpc.sh 3084`;marks CLI 见 `../dsh-bot-mvp/spec.md` 2.3 |
| 测试账号/数据 | ≥2 人设 + 两人小组(rounds=2);凭据沿 `env/.env` |
| 干净状态定义 | 小组数据可单独清;老路径抽验用既有数据 |
| 可用测试工具 | chrome-devtools 类 MCP / Playwright(v2/v3 已实证)+ RPC/CLI |

**执行矩阵**:

| UF | 执行方式 | 操作来源 | 必须核对的点 | Evidence |
|---|---|---|---|---|
| UF-601 主路径 | browser + CLI | 2.3 UF-601 步骤 1-3 | 隐藏轮次会话可跳达官方视图;1:1 过滤纪律不破 | `evidence/UF-601/jump-round-session.png` + `evidence/UF-601/filter.md` |
| UF-601 讨论中跳转分支 | browser | 2.3 失败分支 1 | 只读可达,无写冲突 | `evidence/UF-601/during-discussion.md` |
| UF-602 主路径 | browser + network | 2.3 UF-602 步骤 1-3 | working 真值/预览实时;无 O(N) 回退 | `evidence/UF-602/roster-live.png` + `evidence/UF-602/network.png` |
| UF-602 降级分支(ASM-601) | browser | 2.3 失败分支 1 | 降级通道下状态仍正确 | `evidence/UF-602/degraded.md`(未触发则记 不适用) |
| UF-603 v1 委托 | RPC + browser | 2.3 UF-603 步骤 1 | 与 v1 验收一致 | `evidence/UF-603/v1-ask.log` |
| UF-603 v2 隔离 | browser | 2.3 UF-603 步骤 2 | 三隔离保持 | `evidence/UF-603/v2-isolation.png` |
| UF-603 三期一轮 | browser | 2.3 UF-603 步骤 3 | 逐步一致 | `evidence/UF-603/v3-single-round.png` |

**通过标准**:矩阵全部行通过(或按 2.7 标注 不适用-链条止损)且 evidence 齐全。

### 5.3 Evidence 目录结构与命名

```text
docs/dsh-bot-interaction-master/evidence/
  phase-0/ phase-1/ phase-2/ phase-final/
  UF-601/ UF-602/ UF-603/
```

### 5.4 Review 专项检查清单

- [ ] BR-601:执行顺序有板面痕迹(四期先于五期)
- [ ] BR-602:五期 diff 未回退四期行为(跳转/收纳/起题/单请求 roster 抽查)
- [ ] BR-603:任何止损都在报告里如实呈现
- [ ] INV-602:终检三命令输出在案
- [ ] 联合矩阵全过且 evidence 与 2.5 一致
- [ ] 母包未复制子包合同内容(只引用 ID/路径)
