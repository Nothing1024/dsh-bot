import { build } from 'tsdown'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { adaptPrototype } from './adapt.mjs'

const base = resolve('docs/prototypes/sidebar-ui-migration')
const output = resolve('work/sidebar-ui-migration-bundle')
const transport = resolve(base, 'transport.ts')
await build({
  config: false,
  entry: { prototype: resolve(base, 'main.tsx') }, outDir: output,
  format: ['iife'], platform: 'browser', target: 'es2022', dts: false, clean: true, minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  deps: { alwaysBundle: [/^react($|\/)/, /^react-dom($|\/)/, /^dsh-bot-shared/], onlyBundle: false },
  plugins: [{
    name: 'prototype-only-local-transport',
    transform(code, id) {
      if (id.includes('/packages/dsh-bot-shared/') && id.endsWith('/session-binding.ts')) {
        return { code: `import { localStorage as prototypeStorage } from ${JSON.stringify(transport)};\n` + code.replace(/\blocalStorage\b/g, 'prototypeStorage'), map: null }
      }
      if (!id.includes('/packages/workbench-ui/src/')) return null
      code = adaptPrototype(code, id, base)
      if (id.endsWith('/api.ts')) {
        const start = code.indexOf('export async function workbenchCall<T>')
        const end = code.indexOf('export function listBots()', start)
        if (start < 0 || end < 0) throw new Error('workbenchCall boundary changed')
        code = `import { mockCall } from ${JSON.stringify(transport)};\n` + code.slice(0, start) + 'export const workbenchCall = mockCall;\n' + code.slice(end)
      }
      if (/\blocalStorage\b/.test(code)) code = `import { localStorage as prototypeStorage } from ${JSON.stringify(transport)};\n` + code.replace(/\blocalStorage\b/g, 'prototypeStorage')
      if (id.endsWith('/useBotEvents.ts')) code = `import { LocalEvents } from ${JSON.stringify(transport)};\n` + code.replace(/\bEventSource\b/g, 'LocalEvents')
      return { code, map: null }
    },
  }],
})
const js = await readFile(resolve(output, 'prototype.iife.js'), 'utf8')
const lightPalette = {
  '#12151a': '#ffffff', '#181c22': '#f6f7f9', '#2c333c': '#dde1e7',
  '#e8eaed': '#202733', '#9aa3ad': '#66707c', '#6b8cff': '#4467d7',
  '#f07178': '#b83546', '#222830': '#edf0f4', '#243044': '#e5ecfa',
  '#1d232c': '#ffffff', '#1b2027': '#f3f5f8', '#2a3340': '#e5eaf0',
  '#2a3a52': '#dce6fa', '#1a1e24': '#f6f7f9', '#ddd': '#4f5967', '#9aa0a6': '#66707c',
}
const css = (await readFile('packages/workbench-ui/src/styles.css', 'utf8'))
  .replace(':root', ':scope').replace('color-scheme: dark;', 'color-scheme: inherit;')
  .replace(/html,\s*body,\s*#root\s*\{/, ':scope {')
  .replace(/#[0-9a-f]{3,8}\b/gi, color => lightPalette[color.toLowerCase()] ? `light-dark(${lightPalette[color.toLowerCase()]}, ${color})` : color)
const shell = await readFile(resolve(base, 'shell.css'), 'utf8')
const html = `<div id="dsh-bot-integrated-prototype" aria-label="DSH 中的原版 Bot 工作台"></div>\n<style>\n@scope (#dsh-bot-integrated-prototype) {\n${css}\n${shell}\n}\n</style>\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>\n`
if (Buffer.byteLength(html) > 1_000_000) throw new Error('Prototype exceeds inline size limit')
await mkdir('docs/prototypes', { recursive: true })
await writeFile('docs/prototypes/dsh-bot-integrated-prototype.html', html)
console.log(`Original workbench components + original styles; ${Buffer.byteLength(html)} bytes`)
