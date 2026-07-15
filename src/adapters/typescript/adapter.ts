import { wrap } from 'comlink'
import { typescriptPresets } from '#/adapters/typescript/presets.ts'
import { typescriptUniverse } from '#/adapters/typescript/universe.ts'
import type { Remote } from 'comlink'
import type { AnalysisWorkerApi } from '#/adapters/typescript/analysis.worker.ts'
import type { LanguageAdapter } from '#/core/analysis/adapter.ts'

/**
 * Kept in sync with the exact `typescript` pin in package.json — the
 * analysis engine stays on the 5.9.x JS-API line (ADR-0002 / ADR-0011).
 */
const ENGINE_LABEL = 'TypeScript 5.9.3'

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
 * the analysis worker. Everything language-specific the UI needs comes
 * through this object (ADR-0007's LanguageAdapter boundary).
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
    universe: typescriptUniverse,
    presets: typescriptPresets,
    sampleSource: SAMPLE_SOURCE,
    engineLabel: ENGINE_LABEL,

    analyze: (source) => remote.analyze(source),
    quickInfo: (source, position) => remote.quickInfo(source, position),
    dispose: () => worker.terminate(),
  }
}
