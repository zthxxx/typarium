import { expose } from 'comlink'
import { createTsgoAnalyzer } from '#/adapters/typescript/analyzer/index.ts'
import { createBrowserTsgoRunner } from '#/adapters/typescript/analyzer/tsgo-runner.browser.ts'
import type { VirtualType } from '#/core/analysis/adapter.ts'
import type { AnalysisResult } from '#/core/set-model/types.ts'

/**
 * Web Worker entry hosting the tsgo (TypeScript 7) analysis engine
 * (ADR-0013). The wasm module compiles once on first use; each analyze
 * call runs a full tsc pass over a virtual project whose diagnostics
 * are the assignability oracle.
 */
const analyzer = createTsgoAnalyzer(createBrowserTsgoRunner())

const api = {
  analyze(
    source: string,
    virtualTypes: Array<VirtualType>,
  ): Promise<AnalysisResult> {
    return analyzer.analyze(source, virtualTypes)
  },
}

export type AnalysisWorkerApi = typeof api

expose(api)
