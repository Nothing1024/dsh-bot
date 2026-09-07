# docs/archive — 已归档文档

归档 = 已被后续决策取代、或已明确搁置、或结论已并入其他文档的材料。**只读快照，不再更新**；需要引用时写明「已归档」。归档文件内部的相对路径（如 `../prototypes/real/…`、`../dsh-bot-memory/`）仍按它们**原始位置**（`docs/<原目录>/`）书写，未做改写。

已验收（Done）的任务包**不在**这里——它们是交付记录，留在 `docs/dsh-bot-*/` 原位，索引见 `../README.md`。

| 归档项 | 原位置 | 归档日期 | 为什么归档 | 被什么取代 |
|---|---|---|---|---|
| `dsh-bot-native-surface/` | `docs/dsh-bot-native-surface/` | 2026-09-08 | 用户 2026-09-06 判定「把 Bot 面拆到官方壳的几个小座位上产生不了 Bot 中心」，包状态 Deferred，0/N 未执行；其 BR-703 已撤回 | 方向由 `../dsh-bot-left-tab/`（左栏模式切换 + 官方中栏）接替；表面层的身份/入口部分由 `../dsh-bot-native-experience/` 实现 |
| `prototypes/dsh-bot-complete.html` | `docs/prototypes/` | 2026-09-08 | 按 slot 名推想的「官方壳」，与真实 GUI 逐项对照后多数为编造（品牌、分段、hero 文案、composer 按钮、右栏五 tab、主题） | `../prototypes/real-dsh-ui-survey.md` §B 保留了逐项对照结论 |
| `prototypes/dsh-bot-grok-parity.html` | `docs/prototypes/` | 2026-09-08 | Bot 中心整页住在右栏 overlay，官方左栏与中栏闲置；曾是 memory / routines / live-transcript / peers / roster 五包的原型输入，这些包均已验收 | 五包 spec 已落地其内容；左栏方向见 `../prototypes/dsh-bot-left-tab.html` |
| `prototypes/dsh-bot-on-real-shell.html` | `docs/prototypes/` | 2026-09-08 | 入口在 footer 打开右栏 iframe，产品面仍在 sidebar；是 native-surface 的原型 | 随 native-surface 一同归档 |
| `prototypes/dsh-integrated.html` | `docs/prototypes/` | 2026-09-08 | 画了不存在的左栏「会话 \| Bot」分段座位，中栏又是一套假 Chat 壳 | `../prototypes/dsh-bot-left-tab.html`（真实壳 + 真实座位） |
| `prototypes/native-surface.html` | `docs/prototypes/` | 2026-09-08 | 56px 假 rail + 插件三栏，不是官方 sidebarCol，对话面自绘 | 同上 |
| `EXPERIENCE_ANALYSIS.md` | 仓根 | 2026-09-08 | 2026-09-01 对 grok-bot 0.18 的体验差异分析，结论已分别进入 memory / routines / peers / roster / live-transcript / group-rounds 各包 §1.1 | 各包 spec |
| `IMPLEMENTATION_GUIDE.md` | 仓根 | 2026-09-01 写就，2026-09-08 归档 | 带完整代码示例的实现指南，早于 oneclick 任务包体系；代码示例已被各包 §3 技术方案与实际实现取代 | 各包 spec §3 / `packages/*` 源码 |

## 归档规则

- 判定「过时」的依据只有三种：被用户明确搁置（spec 状态 Deferred）、被后续原型/调研证伪、结论已全部并入其他单一事实源。
- 归档动作用 `git mv`，保留历史；不删除。
- 归档后要回头修活文档里的路径（`rg -n "<旧路径>" docs README.md --glob '!docs/archive/**'`），本次已修：routines / memory / live-transcript / peers / roster / living-master 的 grok-parity 与 native-surface 引用。
