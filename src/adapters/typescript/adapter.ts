import { wrap } from 'comlink'
import { FIXED_COMPILER_OPTIONS_DISPLAY } from '#/adapters/typescript/compiler-options-display.ts'
import { typescriptPresets } from '#/adapters/typescript/presets.ts'
import type { Remote } from 'comlink'
import type { AnalysisWorkerApi } from '#/adapters/typescript/analysis.worker.ts'
import type { LanguageAdapter } from '#/core/analysis/adapter.ts'

/**
 * Kept in sync with the exact `typescript` pin in package.json — the
 * single implementation powering analysis, diagnostics, hover and
 * completions (ADR-0015). 6.0.3 is the last line with a JS compiler
 * API, required for checker-level containment queries.
 */
const ENGINE_LABEL = 'TypeScript 6.0.3'

const SAMPLE_SOURCE = `// typarium — every exported type is drawn as a set of values

export type Fruit = 'apple' | 'banana'
export type Text = string
export type TextOrNumber = string | number

export type Point = { x: number; y: number }

// Function parameters are contravariant under strict mode,
// so WideHandler ends up INSIDE StrHandler:
export type Handler<X> = (value: X) => void
export type StrHandler = Handler<string>
export type WideHandler = Handler<string | number>
`

/**
 * Main-thread face of the TypeScript adapter: a thin comlink proxy to
 * the analysis worker (ADR-0007's LanguageAdapter boundary).
 */
export function createTypescriptAdapter(): LanguageAdapter {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
    type: 'module',
    name: 'ts-analysis',
  })
  const remote: Remote<AnalysisWorkerApi> = wrap<AnalysisWorkerApi>(worker)

  return {
    id: 'typescript',
    label: 'TypeScript',
    editorLanguageId: 'typescript',
    presets: typescriptPresets,
    sampleSource: SAMPLE_SOURCE,
    engineLabel: ENGINE_LABEL,
    compilerOptionsDisplay: FIXED_COMPILER_OPTIONS_DISPLAY,

    analyze: (source, virtualTypes) => remote.analyze(source, virtualTypes),
    check: (source) => remote.check(source),
    quickInfo: (source, offset) => remote.quickInfo(source, offset),
    completions: (source, offset, preferences) =>
      remote.completions(source, offset, preferences),
    format: (source, options) => remote.format(source, options),
    twoslashQueries: (source) => remote.twoslashQueries(source),
    dispose: () => worker.terminate(),
  }
}
