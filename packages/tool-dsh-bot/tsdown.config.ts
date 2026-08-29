import { defineConfig } from 'tsdown'

/**
 * Node-half runtime bundle: ESM entry from src, peer/runtime deps external.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: false,
  external: ['cordis', 'cosmokit', 'schemastery', /^@deepseek-ai\//, 'dsh-bot-host', 'session-tool'],
})
