# docs — 任务包索引

每个 `dsh-bot-*/` 目录是一个 prd-workflow 任务包：`spec.md` 唯一事实源（§0 人话摘要 → §5 验收协议）、`tasks.csv` 或内嵌状态表、`evidence/` 证据、`spec-view.html` 只读投影、按需 `handoff.md`。看进度：`python3 ~/.claude/skills/prd-workflow/scripts/board.py docs/<包>`；校验：`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/<包> --repo .`。

已归档材料见 `archive/README.md`。原型与真实 GUI 调研见 `prototypes/`。

## 交付脉络（按 spec 首次入库日期）

```text
08-29 mvp ─▶ 08-30 workbench ─▶ 08-30 group-chat
   ├─▶ 09-01 session-nav / group-rounds / interaction-master(母包)   ← 起草后暂停，09-08 session-nav 恢复
   ├─▶ 09-02 native-experience
   └─▶ 09-06 转向「Bot 中心」：memory ─▶ routines ─▶ living-master(母包；native-surface 同日搁置)
                               └─▶ live-transcript ─▶ peers ─▶ roster ─▶ alive-master(母包)
09-08 left-tab（依赖 session-nav 的 overview / SSE）                 ← 下一步
```

## 状态一览（2026-09-08）

| 包 | 状态 | 进度 | 一句话 | 类型 |
|---|---|---|---|---|
| `dsh-bot-mvp` | Done | 20/20 | v1：单人设 bot、preset、marks、better-sidebar 页签 | 交付记录 |
| `dsh-bot-workbench` | Ready（Task 18 阻塞） | 18/19 | iframe 工作台 `/dsh-bot/ui`：名册 + 独立对话面；5.2 真实场景因 env 会话复用问题未闭合 | 活跃产品面 |
| `dsh-bot-group-chat` | Done | 17/17 | 小组广播对话、插件房间 jsonl | 交付记录 |
| `dsh-bot-memory` | Done | 13/13 | 三层记忆 + 自动抽取 + 注入 | 交付记录 |
| `dsh-bot-routines` | Done | 14/14 | 例程调度、主动来消息、未读 | 交付记录 |
| `dsh-bot-living-master` | Done | 5/5 | 母包：memory + routines 联合回放 | 交付记录 |
| `dsh-bot-live-transcript` | Done | 16/16 | SSE、排队/打断、思考/工具/审批卡 | 交付记录 |
| `dsh-bot-peers` | Done | 15/15 | 同事异步传话、礼仪、关系图 | 交付记录 |
| `dsh-bot-roster` | Done | 15/15 | 名册分组/拖拽/隐藏/静音/快捷键 | 交付记录 |
| `dsh-bot-alive-master` | Done | 6/6 | 母包：live-transcript + peers + roster 联合回放 | 交付记录 |
| `dsh-bot-native-experience` | Done | 9/9 | 官方壳上的身份 / 入口 / 导航表面层 | 交付记录 |
| `dsh-bot-session-nav` | InProgress | 4/14 | 页签跳转桥（已落地）、`~` 收纳、自动起题、overview 聚合 + SSE | **在飞** |
| `dsh-bot-group-rounds` | Ready | 0/15 | 小组多轮讨论、队列、单成员重试、房间起题 | 待开工 |
| `dsh-bot-interaction-master` | Ready | 0/5 | 母包：session-nav + group-rounds 联合回放 | 待开工 |
| `dsh-bot-left-tab` | Ready | 0/18 | 官方左栏 Bot 模式（priority -1 遮蔽名册）+ 官方中栏 + 顶栏身份条 | 待开工，Task 7 依赖 session-nav Task 9/10 |

## 需要人拍板的遗留

- `dsh-bot-workbench` Task 18（5.2 真实场景）自 2026-08-30 阻塞于「GUI 新会话复用已标记 dsh-bot-manual 会话」；工作台此后被 memory / routines / live-transcript / peers / roster 五包的 5.2 反复真机回放覆盖。可选：① 补一次专项回放解除阻塞并改 Done；② 在 spec §1.5 记「由后续五包 5.2 覆盖」后改 Done。未拍板前保持 Ready。
- 三个母包（living / alive / interaction）之间没有再上一层的总控；当前主线顺序以本文件「交付脉络」为准。

## 约定

- 新包命名 `dsh-bot-<feature>`，小写 kebab-case。BR/UF/INV/EVD 编号**只在包内唯一**（已有多包共用 0xx，interaction-master 与 left-tab 共用 6xx）；跨包引用不要写裸 ID（校验脚本会当作本包未定义），写「`<包>` 的 Task N / §2.1「规则名」」这种描述式引用。
- Done 包不归档、不再改动业务合同；发现旧包事实过期时在**新包** §1.3 记录，不回头改旧包。
- 归档只收「被取代 / 被搁置 / 已并入」三类，规则见 `archive/README.md`。
