import { wrap } from 'comlink'
import { typescriptPresets } from '#/adapters/typescript/presets.ts'
import type { Remote } from 'comlink'
import type { AnalysisWorkerApi } from '#/adapters/typescript/analysis.worker.ts'
import type { LanguageAdapter } from '#/core/analysis/adapter.ts'

/**
 * The semantic oracle is the TypeScript 7 native compiler, run as the
 * tsgo-wasm build inside the analysis worker (ADR-0013). Export
 * scanning still uses the 5.9 parser for syntax only.
 */
const ENGINE_LABEL = 'TypeScript 7 (tsgo-wasm)'

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

    analyze: (source, virtualTypes) => remote.analyze(source, virtualTypes),
    dispose: () => worker.terminate(),
  }
}
