import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * Test-lane resolution for the dsh-bot monorepo (npm-based).
 * Neighbor session-tool packages resolve to their TypeScript sources.
 * Platform `@deepseek-ai/*` and `@deepseek-ai/cordis` resolve from the
 * hoisted node_modules (pinned 0.1.1-rc.2 / 4.0.1).
 */
export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: /^session-marks$/, replacement: fileURLToPath(new URL('../../session-tool/plugin/packages/session-marks/src/index.ts', import.meta.url)) },
      { find: /^session-tool$/, replacement: fileURLToPath(new URL('../../session-tool/plugin/packages/session-tool/src/index.ts', import.meta.url)) },
      { find: /^session-tool-local$/, replacement: fileURLToPath(new URL('../../session-tool/plugin/packages/session-tool-local/src/index.ts', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.spec.ts'],
  },
})
