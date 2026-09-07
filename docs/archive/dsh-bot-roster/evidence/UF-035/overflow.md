# UF-035 ⌘9 超范围

可见项 6（置顶阿宁 + 工作 4 + 生活编辑室）< 9。`onRosterIndex(8)` 越界直接 return，不切换。
单测 `handles roster shortcuts without stealing Cmd+K` 覆盖 index 派发；越界由 App `visibleRosterIds[index] === undefined` 吞掉。
