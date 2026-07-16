import { makeAutoObservable, runInAction } from 'mobx'
import type {
  CompletionPreferences,
  FormatOptions,
  LanguageAdapter,
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

  get languageId(): string {
    return this.adapter.id
  }

  /** Editor language features, delegated to the single adapter worker. */
  check(source: string): Promise<Array<SourceDiagnostic>> {
    return this.adapter.check(source)
  }

  quickInfo(source: string, offset: number): Promise<string | null> {
    return this.adapter.quickInfo(source, offset)
  }

  completions(
    source: string,
    offset: number,
    preferences?: CompletionPreferences,
  ) {
    return this.adapter.completions(source, offset, preferences)
  }

  format(source: string, options: FormatOptions): Promise<string> {
    return this.adapter.format(source, options)
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
        const hasErrors = result.diagnostics.some(
          (diagnostic) => diagnostic.severity === 'error',
        )
        if (!hasErrors) {
          this.lastGoodResult = result
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
