import { expose } from 'comlink'
import { createTsAnalyzer } from '#/adapters/typescript/analyzer/index.ts'
import type { AnalysisResult } from '#/core/set-model/types.ts'

/**
 * Web Worker entry hosting the set-semantics analyzer (ADR-0007).
 * Lib files are bundled as lazy raw chunks (no CDN dependency): only
 * the ES2022 chain — DOM types stay out of the type universe.
 */
const libModules = import.meta.glob(
  '/node_modules/typescript/lib/lib.{es5,es2015,es2016,es2017,es2018,es2019,es2020,es2021,es2022,decorators,decorators.legacy}*.d.ts',
  { query: '?raw', import: 'default' },
)

let analyzerPromise: Promise<ReturnType<typeof createTsAnalyzer>> | null = null

function getAnalyzer(): Promise<ReturnType<typeof createTsAnalyzer>> {
  analyzerPromise ??= (async () => {
    const libFiles = new Map<string, string>()
    await Promise.all(
      Object.entries(libModules).map(async ([path, load]) => {
        const fileName = path.slice(path.lastIndexOf('/') + 1)
        libFiles.set(`/${fileName}`, await load())
      }),
    )
    return createTsAnalyzer({ libFiles })
  })()
  return analyzerPromise
}

const api = {
  async analyze(source: string): Promise<AnalysisResult> {
    const analyzer = await getAnalyzer()
    return analyzer.analyze(source)
  },
  async quickInfo(source: string, position: number): Promise<string | null> {
    const analyzer = await getAnalyzer()
    return analyzer.quickInfo(source, position)
  },
}

export type AnalysisWorkerApi = typeof api

expose(api)
