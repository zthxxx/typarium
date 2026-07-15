import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Standalone vitest config: unit tests must not load the TanStack Start /
 * devtools vite plugins (they assume a full app build context).
 * Core-domain tests run in node; component tests opt into jsdom via
 * `// @vitest-environment jsdom` per file.
 */
export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
