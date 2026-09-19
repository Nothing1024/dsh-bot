# Phase 1 回归摘要

日期：2026-09-08  
网关：`127.0.0.1:3084` pid `94795`，`DSH_HOME=.../dsh-grok-bot/plugin/env`，`include:ui-dsh-bot` fiber `active`。

## 命令级

见同目录 `commands.log` Task 5 段：

- `pnpm run typecheck` → EXIT 0
- `./node_modules/.bin/vitest run packages/ui-dsh-bot/tests` → 8 files / 42 tests passed
- `pnpm --filter ui-dsh-bot run build` → tsdown + 纯度通过

## 真机（UF-601 步骤 1/5，UF-602 步骤 1–3）

| 步骤 | 结果 | 截图 |
|---|---|---|
| UF-601-1 点底栏「Bot」 | `localStorage`=`bot`；`[data-testid=dsh-bot-region][data-wide=1]` 分段条「会话 \| Bot」+「加载名册…」；官方树消失；底栏 `aria-pressed=true` | `toggle.png` |
| UF-601-5 F5 | 刷新后仍是 Bot 区域（apply 读 localStorage 立即注册） | `after-reload.png` |
| UF-602-1 点分段条「会话」 | dispose 遮蔽；官方工作区头 / 搜索 / 树 / 未分组回来；底栏未激活 | `sessions-restored.png` |
| UF-602-2 搜索 leftover | 官方「搜索结果」只剩 `v1 leftover` / `v1 leftover t18` | `search-leftover.png` |
| UF-602-3 点 leftover t18 | 标题与中栏切到 `v1 leftover t18`，官方对话 + composer | `open-session.png` |

`document.querySelectorAll('[data-slot="sidebar.workspaces"]').length === 1`（Bot 态与会话态都是 1）。

## 真机排障（已修）

首轮点「Bot」后 `localStorage` 已写 `bot` 但 region 崩溃：`cannot get property "betterSidebar" without inject`（`BoundBotRegion` 渲染时读了 `client.betterSidebar`）。已改为不在 slot 组件里碰该服务；空态 `activateTab` 留给 Task 8 在 `ctx.inject(['betterSidebar'], …)` 内接线。修后重建并重启网关，回放通过。

## 剩余风险

- 名册仍是 loading 占位（Task 7/8）。
- BR-607 须同时匹配 `dsh-bot` 与 `dsh-bot--` 前缀（Task 1 校准补充）。
- 空态「在右栏新建」链接本 Phase 不接线，避免再踩 inject 墙。
