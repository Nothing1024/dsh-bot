# Wave P0 (Tasks 1–4)

## Dual gate
- `python3 ~/.agents/skills/prd-workflow/scripts/validate_package.py docs/dsh-bot-workbench` → **0 FAIL / 0 WARN / 21 PASS**
- `pnpm --filter ui-dsh-bot test` → 11 passed (tab probe + gateway-dead retry)
- `pnpm --filter dsh-bot-host test` / `workbench-ui test` / `pnpm -r test` (Task 4) 全绿

## Review fixes
- **P0 BR-203 / UF-205**: 第 2 章合同恢复原文。ASM-201 是 Task 1 **证实**而非证伪,不走变更协议。通道事实只写在 1.3;1.4 删除 ASM-201/203、改写 ASM-202。UF-205「未归属」失败分支保留。
- **P1 Task 3 网关死**: 页签不再把 iframe `onLoad` 当成功。先 `GET /dsh-bot/ui` 探活,失败直接错误态+重试;iframe `load` 再探一次,浏览器错误页仍 `load` 也会落到重试。

## Evidence
- `calibration.md` `skeleton.png` `static-route.log` `tab-iframe.png` `phase-summary.md`
