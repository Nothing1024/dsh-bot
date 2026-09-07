# docs — 任务包索引

每个 `dsh-bot-*/` 目录是一个 prd-workflow 任务包：`spec.md` 唯一事实源（§0 人话摘要 → §5 验收协议）、`tasks.csv` 或内嵌状态表、`evidence/` 证据、`spec-view.html` 只读投影、按需 `handoff.md`。看进度：`python3 ~/.claude/skills/prd-workflow/scripts/board.py docs/<包>`；校验：`python3 ~/.claude/skills/prd-workflow/scripts/validate_package.py docs/<包> --repo .`。

**已验收（Done）的包已整体移入 `archive/`**，与被取代的原型、搁置包一起索引在 `archive/README.md`；本目录只留活跃包。原型与真实 GUI 调研见 `prototypes/`。

## 交付脉络（按 spec 首次入库日期）

```text
08-29 mvp ─▶ 08-30 workbench ─▶ 08-30 group-chat
   ├─▶ 09-01 session-nav / group-rounds / interaction-master(母包)   ← 起草后暂停，09-08 session-nav 恢复
   ├─▶ 09-02 native-experience
   └─▶ 09-06 转向「Bot 中心」：memory ─▶ routines ─▶ living-master(母包；native-surface 同日搁置)
                               └─▶ live-transcript ─▶ peers ─▶ roster ─▶ alive-master(母包)
09-08 left-tab（依赖 session-nav 的 overview / SSE）                 ← 下一步
```

## 活跃包（2026-09-08）

| 包 | 状态 | 进度 | 一句话 | 备注 |
|---|---|---|---|---|
| `dsh-bot-workbench` | Ready（Task 18 阻塞） | 18/19 | iframe 工作台 `/dsh-bot/ui`：名册 + 独立对话面 | 活跃产品面；5.2 因 env 会话复用问题未闭合 |
| `dsh-bot-session-nav` | InProgress | 4/14 | 页签跳转桥（已落地）、`~` 收纳、自动起题、overview 聚合 + SSE | **在飞** |
| `dsh-bot-group-rounds` | Ready | 0/15 | 小组多轮讨论、队列、单成员重试、房间起题 | 待开工 |
| `dsh-bot-interaction-master` | Ready | 0/5 | 母包：session-nav + group-rounds 联合回放 | 待开工 |
| `dsh-bot-left-tab` | Ready | 0/23 | 官方左栏 Bot 模式（priority -1 遮蔽名册、overlay 管理人设/小组、关系图、悬停预览、⌘K、红「@」）+ 官方中栏（身份条、例程触发标签） | 待开工，Task 7 依赖 session-nav Task 9/10 |

## 已验收并归档（`archive/`）

| 包 | 进度 | 一句话 |
|---|---|---|
| `archive/dsh-bot-mvp` | 20/20 | v1：单人设 bot、preset、marks、better-sidebar 页签 |
| `archive/dsh-bot-group-chat` | 17/17 | 小组广播对话、插件房间 jsonl |
| `archive/dsh-bot-memory` | 13/13 | 三层记忆 + 自动抽取 + 注入 |
| `archive/dsh-bot-routines` | 14/14 | 例程调度、主动来消息、未读 |
| `archive/dsh-bot-living-master` | 5/5 | 母包：memory + routines 联合回放 |
| `archive/dsh-bot-live-transcript` | 16/16 | SSE、排队/打断、思考/工具/审批卡 |
| `archive/dsh-bot-peers` | 15/15 | 同事异步传话、礼仪、关系图 |
| `archive/dsh-bot-roster` | 15/15 | 名册分组/拖拽/隐藏/静音/快捷键 |
| `archive/dsh-bot-alive-master` | 6/6 | 母包：live-transcript + peers + roster 联合回放 |
| `archive/dsh-bot-native-experience` | 9/9 | 官方壳上的身份 / 入口 / 导航表面层 |

这些包的业务合同仍是已交付功能的定义处：新包引用时写 `../archive/dsh-bot-<x>/spec.md`，不回头改动它们。

## 需要人拍板的遗留

- `dsh-bot-workbench` Task 18（5.2 真实场景）自 2026-08-30 阻塞于「GUI 新会话复用已标记 dsh-bot-manual 会话」；工作台此后被 memory / routines / live-transcript / peers / roster 五包的 5.2 反复真机回放覆盖。可选：① 补一次专项回放解除阻塞并改 Done；② 在 spec §1.5 记「由后续五包 5.2 覆盖」后改 Done。未拍板前保持 Ready。
- 三个母包（living / alive / interaction）之间没有再上一层的总控；当前主线顺序以本文件「交付脉络」为准。

## 约定

- 新包命名 `dsh-bot-<feature>`，小写 kebab-case。BR/UF/INV/EVD 编号**只在包内唯一**（已有多包共用 0xx，interaction-master 与 left-tab 共用 6xx）；跨包引用不要写裸 ID（校验脚本会当作本包未定义），写「`<包>` 的 Task N / §2.1「规则名」」这种描述式引用。
- 包验收（状态板 100% + 5.2 证据齐全 + Status 改 Done）后整体 `git mv` 进 `archive/`，并把活文档里的路径改指 `archive/`；归档包不再改动业务合同，发现旧包事实过期时在**新包** §1.3 记录。
- 归档收四类：已验收 / 被取代 / 被搁置 / 已并入，规则见 `archive/README.md`。
