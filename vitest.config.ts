import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Workspace-wide vitest: package tests (relative imports) and app
 * tests (`#/` alias) in one run. The `typarium-source` condition
 * resolves @typarium/* package names straight to their src — same
 * source-consumption contract the app build uses (ADR-0021).
 * Unit tests must not load the TanStack Start / devtools vite plugins.
 */
export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
    conditions: ['typarium-source'],
  },
  // Vitest's node environment resolves through the ssr pipeline, which
  // has its OWN conditions list (and overriding it drops the defaults,
  // so the node defaults ride along explicitly).
  ssr: {
    resolve: {
      conditions: ['typarium-source', 'node', 'import', 'module', 'default'],
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/web/src/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/e2e/**', '**/node_modules/**', '**/dist/**'],
  },
})
