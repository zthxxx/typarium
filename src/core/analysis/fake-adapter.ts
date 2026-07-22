import type {
  CompletionEntry,
  CompletionPreferences,
  FormatOptions,
  LanguageAdapter,
  LanguagePreset,
  TwoslashQuery,
  VirtualType,
} from '#/core/analysis/adapter.ts'
import type {
  AnalysisResult,
  SourceDiagnostic,
} from '#/core/set-model/types.ts'

/**
 * In-memory LanguageAdapter with manually-resolved analyze calls: tests
 * orchestrate ticket races without timers, and the adapter doubles as
 * the second contract implementation next to the TypeScript one.
 * Pure TS on purpose — no test-framework imports, usable from core.
 */

export interface FakeAnalyzeCall {
  source: string
  virtualTypes: Array<VirtualType>
  resolve: (result: AnalysisResult) => void
  reject: (error: unknown) => void
}

export interface FakeCheckCall {
  source: string
  resolve: (diagnostics: Array<SourceDiagnostic>) => void
  reject: (error: unknown) => void
}

export interface FakeLanguageAdapter extends LanguageAdapter {
  /** Every analyze() call in arrival order, awaiting manual resolution. */
  analyzeCalls: Array<FakeAnalyzeCall>
  /** Every check() call in arrival order, awaiting manual resolution. */
  checkCalls: Array<FakeCheckCall>
  /** Fire the type-acquisition signal to every registered listener. */
  emitTypesAcquired: () => void
  disposed: boolean
}

export const EMPTY_RESULT: AnalysisResult = {
  entities: [],
  relations: [],
  diagnostics: [],
  anyEntityNames: [],
}

export function createFakeAdapter(options?: {
  presets?: Array<LanguagePreset>
}): FakeLanguageAdapter {
  const listeners = new Set<() => void>()
  const adapter: FakeLanguageAdapter = {
    id: 'fake',
    label: 'Fake',
    editorLanguageId: 'plaintext',
    presets: options?.presets ?? [],
    sampleSource: 'export type Sample = sample',
    engineLabel: 'Fake Engine',
    compilerOptionsDisplay: [],
    analyzeCalls: [],
    checkCalls: [],
    disposed: false,

    analyze: (source, virtualTypes) =>
      new Promise<AnalysisResult>((resolve, reject) => {
        adapter.analyzeCalls.push({ source, virtualTypes, resolve, reject })
      }),
    check: (source) =>
      new Promise<Array<SourceDiagnostic>>((resolve, reject) => {
        adapter.checkCalls.push({ source, resolve, reject })
      }),
    quickInfo: () => Promise.resolve(null),
    completions: (
      _source: string,
      _offset: number,
      _preferences?: CompletionPreferences,
    ) => Promise.resolve([] as Array<CompletionEntry>),
    format: (source: string, _options: FormatOptions) =>
      Promise.resolve(source),
    twoslashQueries: () => Promise.resolve([] as Array<TwoslashQuery>),
    onTypesAcquired: (listener) => {
      listeners.add(listener)
    },
    emitTypesAcquired: () => {
      for (const listener of listeners) listener()
    },
    dispose: () => {
      adapter.disposed = true
    },
  }
  return adapter
}
