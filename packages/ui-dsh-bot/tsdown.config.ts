/**
 * tsdown build for ui-dsh-bot: host-half lib (lib/index.js) plus the browser
 * client bundle (lib/client.js, CJS closure factory via __ModuleLoader__).
 *
 * Types ship from lib/types (tsc -p tsconfig.build.json), not from tsdown.
 */
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** Module specifiers the web shell shares into the frozen module table. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

/** Wire/type layers a client bundle may inline. */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

const WORKBENCH_STYLES_ID = '\0workbench-styles'

const PLUGIN_ID = 'ui-dsh-bot'

function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolvePath(dirname(sourcemapPath), source)
  const repositoryPath = relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/')
  return `../../../${repositoryPath}`
}

const libConfig: UserConfig = {
  name: PLUGIN_ID,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'neutral',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: [
      'cordis',
      '@deepseek-ai/cordis',
      'cosmokit',
      'schemastery',
      'react',
      'react-dom',
      /^@deepseek-ai\//,
    ],
  },
}

const clientConfig: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  minify: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  inputOptions: {
    // tsdown defaults CJS output to Node even when top-level platform is browser.
    // This factory is consumed by the web shell, so package imports need browser conditions.
    platform: 'browser',
    resolve: {
      conditionNames: ['browser', 'import', 'require', 'default'],
    },
  },
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [
    {
      name: 'dsh-client-bundle-purity',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue
          const unknown = chunk.imports.filter(id => !CLIENT_EXTERNALS.includes(id) && bundle[id] === undefined)
          if (unknown.length > 0) throw new Error(`client bundle requires unavailable modules: ${unknown.join(', ')}`)
        }
      },
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        if (INLINE_SAFE.test(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) or an inline-safe wire layer — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased)',
        )
      },
    },
    {
      name: 'dsh-workbench-styles-inline',
      resolveId(source: string) {
        return source === 'workbench-ui/styles.css' ? WORKBENCH_STYLES_ID : null
      },
      async load(id: string) {
        if (id !== WORKBENCH_STYLES_ID) return null
        const file = resolvePath(REPOSITORY_ROOT, 'packages/workbench-ui/src/styles.css')
        this.addWatchFile(file)
        return 'export default ' + JSON.stringify(await readFile(file, 'utf8'))
      },
    },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapPathTransform: browserSourcePath,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [libConfig, clientConfig]
