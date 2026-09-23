import { defineConfig } from 'tsdown'

/**
 * Node-half runtime bundle: ESM entry from src, peer/runtime deps external.
 * cordis and every @deepseek-ai/* import resolve from the host profile
 * closure; session-marks / session-tool resolve through link: to the sibling
 * session-tool checkout, which owns its own node_modules.
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
  external: ['cordis', 'cosmokit', 'schemastery', /^@deepseek-ai\//, 'session-marks', 'session-tool', 'workbench-ui'],
})
