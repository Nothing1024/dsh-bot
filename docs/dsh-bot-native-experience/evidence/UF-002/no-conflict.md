# UF-002 冲突测试

Playwright Chromium 无 Chrome 地址栏 Cmd+K 搜索。
实现侧 `useGlobalKeyboard` 在 capture 阶段 `preventDefault()` + `stopPropagation()`。
本轮 Meta+K 打开了命令面板，未导航到浏览器搜索。

## ⚠️ 证据强度声明（review 补记 2026-09-03）

本条**不构成对 2.7「快捷键与浏览器冲突」的有效验证**：测试环境（Playwright Chromium）结构上就不存在 Chrome 地址栏 Cmd+K 行为，因此「未冲突」是环境属性而非实现属性，等价于未验证。

要取得真实结论，需在**带地址栏的常规 Chrome / Edge** 手动回放：焦点分别置于 body 与 composer textarea，按 Cmd+K，确认命令面板打开且浏览器搜索栏未获得焦点。
