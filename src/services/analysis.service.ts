import { makeAutoObservable, runInAction } from 'mobx'
import type {
  BootProgressEvent,
  EditorCapabilities,
  LanguageAdapter,
  LanguageDescriptor,
  VirtualType,
} from '#/core/analysis/adapter.ts'
import type {
  AnalysisResult,
  SourceDiagnostic,
} from '#/core/set-model/types.ts'

/**
 * Orchestrates the language adapter: serializes analyze calls, drops
 * stale results, and separates "latest diagnostics" from "last good
 * result" — the canvas keeps showing the last valid diagram while the
 * user is mid-edit with type errors (product rule).
 */
export class AnalysisService {
  /** Last analysis whose diagnostics contain no errors. */
  lastGoodResult: AnalysisResult | null = null
  /**
   * The exact input that produced `lastGoodResult` — the snapshot key
   * for cache-first rendering (ADR-0020). Null while the result is a
   * hydrated snapshot rather than a fresh engine run.
   */
  lastGoodInput: { source: string; virtualNames: Array<string> } | null = null
  /** Diagnostics of the most recent analysis, error or not. */
  diagnostics: Array<SourceDiagnostic> = []
  analyzing = false
  failed = false

  private sequence = 0

  constructor(private readonly adapter: LanguageAdapter) {
    makeAutoObservable<AnalysisService, 'adapter' | 'sequence'>(this, {
      adapter: false,
      sequence: false,
    })
  }

  /**
   * Boot-time cache hydration: paint the canvas with the stored last
   * good result while the engine still boots. Only before any real
   * analysis has landed; the first live run replaces it (ticket flow).
   */
  hydrate(result: AnalysisResult): void {
    if (this.lastGoodResult !== null) return
    this.lastGoodResult = result
  }

  /** Static language facts (names, presets, snippet syntax, engine). */
  get descriptor(): LanguageDescriptor {
    return this.adapter.descriptor
  }

  get languageId(): string {
    return this.adapter.descriptor.id
  }

  /**
   * Optional editor language features. Views check per capability and
   * degrade (hide the button / skip the provider) when one is absent.
   */
  get editor(): EditorCapabilities | undefined {
    return this.adapter.editor
  }

  /** Fast diagnostics-only pass driving editor squiggles. */
  check(source: string): Promise<Array<SourceDiagnostic>> {
    return this.adapter.check(source)
  }

  /** Late type-acquisition arrivals (see LanguageAdapter contract). */
  onTypesAcquired(listener: () => void): () => void {
    return this.adapter.onTypesAcquired(listener)
  }

  /** Engine boot progress passthrough for the boot pipeline display. */
  onBootProgress(listener: (event: BootProgressEvent) => void): () => void {
    return this.adapter.onBootProgress(listener)
  }

  /** Kick engine initialization eagerly (idempotent). */
  warmup(): Promise<void> {
    return this.adapter.warmup()
  }

  async analyze(
    source: string,
    virtualTypes: Array<VirtualType>,
  ): Promise<void> {
    const ticket = ++this.sequence
    this.analyzing = true
    try {
      const result = await this.adapter.analyze(source, virtualTypes)
      if (ticket !== this.sequence) return

      runInAction(() => {
        this.diagnostics = result.diagnostics
        this.failed = false
        // Value-space errors (bad assignments, calls) cannot change
        // exported type meaning — only syntax and type-space errors
        // hold the canvas on its last good diagram (product rule).
        const hasBlockingErrors = result.diagnostics.some(
          (diagnostic) =>
            diagnostic.severity === 'error' && diagnostic.domain !== 'value',
        )
        if (!hasBlockingErrors) {
          this.lastGoodResult = result
          this.lastGoodInput = {
            source,
            virtualNames: virtualTypes.map((virtual) => virtual.name),
          }
        }
        this.analyzing = false
      })
    } catch (error) {
      if (ticket !== this.sequence) return
      runInAction(() => {
        this.failed = true
        this.analyzing = false
      })
      if (import.meta.env.DEV) {
        console.error('[typarium] analysis failed', error)
      }
    }
  }
}
