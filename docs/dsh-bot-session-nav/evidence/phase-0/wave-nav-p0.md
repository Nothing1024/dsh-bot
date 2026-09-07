# Wave 1-1 / P0 review fix

Date: 2026-09-01. Wave Task 1 only. No commit.

## Board

Task 1 `已完成`(校准事实未改)。Task 2–14 仍 `待开始`(后续波次)。本波无 `进行中`。

## P1 finding (verified)

`spec.md` 1.4 选了真归档并写「第 2 章合同未改」,但:

- BR-404 仍:「按 ASM-404 无 archived 字段时本动作降级为隐藏」
- UF-404 失败分支仍:「list 无 archived 字段 → 菜单显示为隐藏」
- Task 7 仍:`archiveSession` 无 archived 字段时退化为 `toggleHidden` + `degraded:true`

`evidence/phase-0/asm404-fields.json`:`listBotSessionsKeys` 无 archived;`workspaceListKeys` 含 `archivedSessionIds`。`platform.ts` `createPlatform.archiveSession` 已调 `workspaceRegistry.archiveSession`。按原第 2/4 章实现会把归档做成隐藏,UF-404「官方可寻回」破裂。

## §12 变更协议(Version 0.1.0 → 0.2.0)

证伪的是降级**触发**「行无 archived 字段 ⇒ 必须隐藏」,不是 UF-404 Then。

| 条目 | 处置 |
|---|---|
| UF-404 Then「官方可寻回」 | **保持** |
| BR-404 正例「归档后列表消失、官方仍能找回」 | **保持** |
| BR-404 规则句 | 识别面改为 `archivedSessionIds`;行无 archived **不**降级;仅 `archive-unavailable` 降级 |
| UF-404 失败分支 | 触发改为 `archiveSession` 抛 `archive-unavailable` |
| Task 7 | 真归档+排除 archivedSessionIds;禁止因无行字段 toggleHidden |
| Task 1 | 校准事实保持已完成,不回退 |
| Task 7 状态 | 仍待开始(尚未实现) |

## Evidence

- `calibration.md` §4/§6 已改「未走变更协议」表述
- `asm404-fields.json` / `asm404-membership.json` / `marks-rewrite.json` 仍为 Task 1 实测

## Validate

`python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-session-nav --repo .` → 见本波终端;期望 0 FAIL。
