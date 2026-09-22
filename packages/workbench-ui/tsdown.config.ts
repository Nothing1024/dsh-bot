import { defineConfig } from 'tsdown'

/**
 * Browser SPA bundle: one ESM entry plus copied index.html / CSS (package.json
 * `build` copies those after tsdown). React is inlined so the page does not
 * depend on the DSH client module table.
 */
export default defineConfig({
  entry: { workbench: 'src/main.tsx' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: true,
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  deps: {
    alwaysBundle: [
      /^react($|\/)/,
      /^react-dom($|\/)/,
      /^dsh-bot-shared/,
      /^react-markdown($|\/)/,
      /^remark-gfm($|\/)/,
    ],
    onlyBundle: false,
  },
  outputOptions: {
    entryFileNames: 'workbench.js',
  },
})
