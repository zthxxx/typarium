import { makeAutoObservable, runInAction } from 'mobx'
import type { FormatOptions, VirtualType } from '#/core/analysis/adapter.ts'
import type { SourceDiagnostic } from '#/core/set-model/types.ts'
import type { AnalysisService } from '#/services/analysis.service.ts'
import type { PersistenceService } from '#/services/persistence.service.ts'

/** Product rule: auto-submit visualization 1.2s after the user stops typing. */
const ANALYZE_DEBOUNCE_MS = 1_200
/** Squiggles should feel editor-grade: check runs well before analysis. */
const CHECK_DEBOUNCE_MS = 350
/** One deferred re-check after type acquisition has had time to land. */
const ACQUISITION_RETRY_MS = 5_000
/** Saves are cheaper than analysis; persist keystrokes almost immediately. */
const SAVE_DEBOUNCE_MS = 300

/**
 * Single source of truth for the editor text. Snippet presets and
 * share-links mutate it only through here. Virtual preset types come
 * from the injected getter at analysis time (owned by PresetService).
 */
export class EditorService {
  code = ''
  /** Live editor diagnostics (fast check pass), consumed by monaco markers. */
  editorDiagnostics: Array<SourceDiagnostic> = []

  private analyzeTimer: ReturnType<typeof setTimeout> | null = null
  private checkTimer: ReturnType<typeof setTimeout> | null = null
  private checkTicket = 0
  private retriedForCode: string | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private virtualTypesGetter: () => Array<VirtualType> = () => []
  private activePresetsGetter: () => Array<string> = () => []

  constructor(
    private readonly analysis: AnalysisService,
    private readonly persistence: PersistenceService,
  ) {
    makeAutoObservable<
      EditorService,
      | 'analysis'
      | 'persistence'
      | 'analyzeTimer'
      | 'checkTimer'
      | 'checkTicket'
      | 'retriedForCode'
      | 'saveTimer'
      | 'virtualTypesGetter'
      | 'activePresetsGetter'
    >(this, {
      analysis: false,
      persistence: false,
      analyzeTimer: false,
      checkTimer: false,
      checkTicket: false,
      retriedForCode: false,
      saveTimer: false,
      virtualTypesGetter: false,
      activePresetsGetter: false,
    })
  }

  /** Wired by the composition root after PresetService exists. */
  connectPresets(deps: {
    virtualTypes: () => Array<VirtualType>
    activeLabels: () => Array<string>
  }): void {
    this.virtualTypesGetter = deps.virtualTypes
    this.activePresetsGetter = deps.activeLabels
  }

  /** User keystrokes: debounced persistence + debounced analysis. */
  setCode(code: string): void {
    if (code === this.code) return
    this.code = code
    this.scheduleSave()
    this.scheduleCheck()
    this.scheduleAnalyze()
  }

  /** Programmatic replacement (boot restore, share link): analyze now. */
  replaceCode(code: string): void {
    this.code = code
    this.scheduleSave()
    this.analyzeNow()
  }

  /** Virtual preset toggles re-analyze immediately (no typing involved). */
  analyzeNow(): void {
    if (this.analyzeTimer) clearTimeout(this.analyzeTimer)
    this.scheduleSave()
    this.scheduleCheck()
    void this.analysis.analyze(this.code, this.virtualTypesGetter())
  }

  /** Format the whole document with the user's style options. */
  async formatDocument(options: FormatOptions): Promise<void> {
    // Spread into a plain object: callers pass mobx observables, and
    // an observable proxy cannot be structured-cloned into the worker.
    const plain: FormatOptions = {
      singleQuote: options.singleQuote,
      semi: options.semi,
      trailingComma: options.trailingComma,
      printWidth: options.printWidth,
    }
    try {
      const formatted = await this.analysis.format(this.code, plain)
      if (formatted !== this.code) this.replaceCode(formatted)
    } catch {
      // Unformattable (syntax errors): leave the code untouched.
    }
  }

  /**
   * Snippet insertion (product rule): append `export type CN = <rhs>`
   * with auto-incremented N and a blank line between consecutive
   * declarations.
   */
  insertSnippetLine(rhs: string): void {
    const nextIndex =
      Math.max(
        0,
        ...[...this.code.matchAll(/^export type C(\d+)\b/gm)].map((match) =>
          Number(match[1]),
        ),
      ) + 1
    const line = `export type C${nextIndex} = ${rhs}`
    const trimmed = this.code.replace(/\s+$/, '')
    const next = trimmed === '' ? `${line}\n` : `${trimmed}\n\n${line}\n`
    this.replaceCode(next)
  }

  private scheduleCheck(): void {
    if (this.checkTimer) clearTimeout(this.checkTimer)
    this.checkTimer = setTimeout(() => {
      const ticket = ++this.checkTicket
      const source = this.code
      void this.analysis.check(source).then((diagnostics) => {
        if (ticket !== this.checkTicket) return
        runInAction(() => {
          this.editorDiagnostics = diagnostics
        })
        // Type acquisition may land after this pass: unresolved-module
        // diagnostics get ONE deferred re-run so freshly fetched types
        // clear the squiggles and join the canvas without a keystroke.
        const unresolved = diagnostics.some((diagnostic) =>
          diagnostic.message.includes('Cannot find module'),
        )
        if (unresolved && this.retriedForCode !== source) {
          this.retriedForCode = source
          setTimeout(() => {
            if (this.code !== source) return
            this.scheduleCheck()
            void this.analysis.analyze(source, this.virtualTypesGetter())
          }, ACQUISITION_RETRY_MS)
        }
      })
    }, CHECK_DEBOUNCE_MS)
  }

  private scheduleAnalyze(): void {
    if (this.analyzeTimer) clearTimeout(this.analyzeTimer)
    this.analyzeTimer = setTimeout(() => {
      void this.analysis.analyze(this.code, this.virtualTypesGetter())
    }, ANALYZE_DEBOUNCE_MS)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void this.persistence.saveDocument({
        code: this.code,
        languageId: this.analysis.languageId,
        presets: this.activePresetsGetter(),
      })
    }, SAVE_DEBOUNCE_MS)
  }
}
