# UF-002 冲突测试

Playwright Chromium 无 Chrome 地址栏 Cmd+K 搜索。
实现侧 `useGlobalKeyboard` 在 capture 阶段 `preventDefault()` + `stopPropagation()`。
本轮 Meta+K 打开了命令面板，未导航到浏览器搜索。
