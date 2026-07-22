import { expose } from 'comlink'
import {
  createTsAnalyzer,
  createTypeAcquirer,
} from '@typarium/analyzer-typescript'
import { tsLibsUrl } from '#/adapters/typescript/ts-libs-manifest.ts'
import type { TsAnalyzer, TypeAcquirer } from '@typarium/analyzer-typescript'
import type {
  BootProgressEvent,
  VirtualType,
  CompletionPreferences,
  FormatOptions,
} from '@typarium/language-adapter'

/**
 * Web Worker hosting the single TypeScript implementation (ADR-0015):
 * canvas analysis AND editor language features run here. The default
 * lib files are NOT bundled into this chunk — they arrive as one
 * comment-stripped JSON asset (ADR-0020), fetched in parallel with
 * this script's own parse and reported with real byte progress.
 */

let analyzerPromise: Promise<TsAnalyzer> | null = null
let acquirer: TypeAcquirer | null = null
let typesAcquiredListener: (() => void) | null = null
let bootProgressListener: ((event: BootProgressEvent) => void) | null = null

const emitProgress = (event: BootProgressEvent) => {
  bootProgressListener?.(event)
}

/** Stream the libs asset, reporting loaded/total byte fractions. */
async function fetchLibFiles(): Promise<Map<string, string>> {
  emitProgress({ stage: 'engine-download', fraction: 0 })
  const response = await fetch(tsLibsUrl)
  if (!response.ok || !response.body) {
    throw new Error(`ts-libs asset failed: ${response.status} ${tsLibsUrl}`)
  }
  // content-length is the compressed size while the reader yields
  // decoded bytes — the fraction can overshoot, so cap it at 1.
  const total = Number(response.headers.get('content-length')) || null
  const reader = response.body.getReader()
  const chunks: Array<Uint8Array> = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    if (total) {
      emitProgress({
        stage: 'engine-download',
        fraction: Math.min(1, loaded / total),
      })
    }
  }
  emitProgress({ stage: 'engine-download', fraction: 1 })
  const text = new TextDecoder().decode(
    chunks.length === 1 ? chunks[0] : concat(chunks, loaded),
  )
  const parsed = JSON.parse(text) as {
    version: string
    files: Record<string, string>
  }
  return new Map(
    Object.entries(parsed.files).map(([name, content]) => [
      `/${name}`,
      content,
    ]),
  )
}

function concat(chunks: Array<Uint8Array>, size: number): Uint8Array {
  const merged = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function getAnalyzer(): Promise<TsAnalyzer> {
  analyzerPromise ??= (async () => {
    const libFiles = await fetchLibFiles()
    emitProgress({ stage: 'engine-init' })
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
