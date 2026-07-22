import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Workspace packages are consumed as SOURCE via their
    // `typarium-source` exports condition (ADR-0021); user conditions
    // REPLACE the defaults in vite >= 6, so the defaults ride along.
    conditions: ['typarium-source', ...defaultClientConditions],
  },
  ssr: {
    resolve: {
      conditions: ['typarium-source', ...defaultServerConditions],
      externalConditions: ['typarium-source', ...defaultServerConditions],
    },
    // Workspace source packages must be transformed, not left external.
    noExternal: [/^@typarium\//],
  },
  // ES-format workers keep dynamic imports as REAL split chunks: the
  // analysis worker ships without prettier (lazy, first format only)
  // and without the lib files (runtime JSON asset, ADR-0020).
  worker: { format: 'es' },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // The app is a pure client-side tool deployed on GitHub Pages:
      // prerender every route into static HTML, no server runtime.
      prerender: {
        enabled: true,
        crawlLinks: true,
      },
    }),
    viteReact(),
  ],
})

export default config
