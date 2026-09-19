# UF-202 非法输入

时间: 2026-08-30T11:10:45.025Z
网关: `127.0.0.1:3084  pid=55016  DSH_HOME=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin/env  cwd=/Users/nothing/workspace/dsh/plugin/dsh-grok-bot/plugin`


## 1. 空必填（不发请求）

- 名字错误：`请填写名字`
- 人设错误：`请填写人设`
- 提交前 bots = ["dsh-bot","shiren-xiaobei"]

## 2. YAML 注入字符（安全转义，preset 非 broken）

persona = `""" !!js/function >-\nfoo`

- 创建结果 id=`yaml-zhuru` preset=`dsh-bot--yaml-zhuru`
- agentPreset.list broken=null
- 人设回读："\"\"\" !!js/function >-\nfoo"
- composition 摘录：

```
# The `standard` agent preset: the full coding agent, mounted once per process.
#
# This file is an AGENT-PLANE composition. The roster mounts it ONCE under a
# standing scope; every session naming it joins by scope parentage, so the
# tools and prompt sections registered here cover each joined agent while a
# session's own state stays keyed per Session/Agent inside the plugins. The
# host composition (`base.cordis.yml` + `web.cordis.yml`) keeps everything a
# preset must not own: the registries themselves, the sandbox and approval
# stack, persistence, and the model route.
#
# A service row here MUST sit inside a group carrying an `isolate` realm.
# Without one it publishes into the root realm, where it is process-global —
# another preset publishing the same name collides, and a host reader would
# resolve one preset's instance for every session; `dsh-agent-presets` rejects
# that at mount. `true` means an entry-local realm: this standing mount's own
# private instance, apart from every other preset's. (A shared label does NOT
# pool instances — `provide()` throws on the second registration under the
# same realm symbol; labels join REALMS, and are not what this file needs.)

# ─
```

创建失败会回滚零残留；本例注入字符被 YAML 单引号/字面量转义，preset 未 broken。测完已 deleteBot。

## 3. 超长名字

65 个 `N` 经表单提交后注册表出现 64 字 slug 行（host `NAME_MAX=64`）。矩阵结束后 `deleteBot` 已清掉该残留，默认 seed 与 bundled preset 未动。

空必填与 YAML 注入是本行硬核对项，均通过。

