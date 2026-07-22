import { expose } from 'comlink'
import { createTsAnalyzer } from '#/adapters/typescript/analyzer/index.ts'
import type { TsAnalyzer } from '#/adapters/typescript/analyzer/index.ts'
import type {
  BootProgressEvent,
  VirtualType,
  CompletionPreferences,
  FormatOptions,
} from '#/core/analysis/adapter.ts'

import { createTypeAcquirer } from '#/adapters/typescript/analyzer/type-acquisition.ts'
import type { TypeAcquirer } from '#/adapters/typescript/analyzer/type-acquisition.ts'

/**
 * Web Worker hosting the single TypeScript implementation (ADR-0015):
 * canvas analysis AND editor language features run here. The FULL lib
 * set ships as lazy raw chunks (no CDN dependency) — the fixed
 * compiler baseline includes DOM + ESNext.
 */
const libModules = import.meta.glob('/node_modules/typescript/lib/lib.*.d.ts', {
  query: '?raw',
  import: 'default',
})

let analyzerPromise: Promise<TsAnalyzer> | null = null
let acquirer: TypeAcquirer | null = null
let typesAcquiredListener: (() => void) | null = null
let bootProgressListener: ((event: BootProgressEvent) => void) | null = null

const emitProgress = (event: BootProgressEvent) => {
  bootProgressListener?.(event)
}

function getAnalyzer(): Promise<TsAnalyzer> {
  analyzerPromise ??= (async () => {
    emitProgress({ stage: 'engine-init', fraction: 0 })
    const entries = Object.entries(libModules)
    const libFiles = new Map<string, string>()
    let loaded = 0
    await Promise.all(
      entries.map(async ([path, load]) => {
        const fileName = path.slice(path.lastIndexOf('/') + 1)
        libFiles.set(`/${fileName}`, await load())
        loaded += 1
        // Lib loading dominates init: report real per-file fractions.
        emitProgress({
          stage: 'engine-init',
          fraction: (loaded / entries.length) * 0.8,
        })
      }),
    )
    const analyzer = createTsAnalyzer({ libFiles })
    acquirer = createTypeAcquirer({
      receiveFile: (path, content) => analyzer.addLibraryFile(path, content),
      onAcquired: () => typesAcquiredListener?.(),
    })
    emitProgress({ stage: 'ready' })
    return analyzer
  })()
  return analyzerPromise
}

/** Fetch typings for bare imports before any type computation runs. */
async function withTypes(source: string): Promise<TsAnalyzer> {
  const analyzer = await getAnalyzer()
  await acquirer?.ensureTypesFor(source)
  return analyzer
}

const api = {
  /**
   * Register the main-thread callbacks (comlink-proxied). One slot per
   * event: the adapter registers exactly once and fans out locally to
   * its own subscriber set.
   */
  onTypesAcquired(listener: () => void) {
    typesAcquiredListener = listener
  },
  onBootProgress(listener: (event: BootProgressEvent) => void) {
    bootProgressListener = listener
  },
  /** Eager engine boot; idempotent, resolves when the checker is ready. */
  async warmup() {
    await getAnalyzer()
  },
  async analyze(source: string, virtualTypes: Array<VirtualType>) {
    return (await withTypes(source)).analyze(source, virtualTypes)
  },
  async check(source: string) {
    return (await withTypes(source)).check(source)
  },
  async quickInfo(source: string, offset: number) {
    return (await getAnalyzer()).quickInfo(source, offset)
  },
  async completions(
    source: string,
    offset: number,
    preferences?: CompletionPreferences,
  ) {
    return (await getAnalyzer()).completions(source, offset, preferences)
  },
  async inlineQueries(source: string) {
    return (await getAnalyzer()).twoslashQueries(source)
  },
  async format(source: string, options: FormatOptions): Promise<string> {
    // Prettier standalone: the formatter matches the editor-config
    // style knobs one for one (quotes / semi / trailing comma / width).
    const [{ format }, tsPlugin, estreePlugin] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/typescript'),
      import('prettier/plugins/estree'),
    ])
    return format(source, {
      parser: 'typescript',
      plugins: [tsPlugin.default, estreePlugin.default],
      singleQuote: options.singleQuote,
      semi: options.semi,
      trailingComma: options.trailingComma ? 'all' : 'none',
      printWidth: options.printWidth,
    })
  },
}

export type AnalysisWorkerApi = typeof api

expose(api)
