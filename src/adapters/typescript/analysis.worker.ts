import { expose } from 'comlink'
import { createTsAnalyzer } from '#/adapters/typescript/analyzer/index.ts'
import type { TsAnalyzer } from '#/adapters/typescript/analyzer/index.ts'
import type {
  VirtualType,
  CompletionPreferences,
  FormatOptions,
} from '#/core/analysis/adapter.ts'

/**
 * Web Worker hosting the single TypeScript implementation (ADR-0015):
 * canvas analysis AND editor language features run here. Lib files are
 * bundled as lazy raw chunks (no CDN dependency): only the ES2022
 * chain — DOM types stay out of the type universe.
 */
const libModules = import.meta.glob(
  '/node_modules/typescript/lib/lib.{es5,es2015,es2016,es2017,es2018,es2019,es2020,es2021,es2022,decorators,decorators.legacy}*.d.ts',
  { query: '?raw', import: 'default' },
)

let analyzerPromise: Promise<TsAnalyzer> | null = null

function getAnalyzer(): Promise<TsAnalyzer> {
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
  async analyze(source: string, virtualTypes: Array<VirtualType>) {
    return (await getAnalyzer()).analyze(source, virtualTypes)
  },
  async check(source: string) {
    return (await getAnalyzer()).check(source)
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
