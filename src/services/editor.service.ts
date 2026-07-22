import { makeAutoObservable, runInAction } from 'mobx'
import type { FormatOptions, VirtualType } from '#/core/analysis/adapter.ts'
import type { SourceDiagnostic } from '#/core/set-model/types.ts'
import type { AnalysisService } from '#/services/analysis.service.ts'
import type { PersistenceService } from '#/services/persistence.service.ts'

/** Product rule: auto-submit visualization 1.2s after the user stops typing. */
const ANALYZE_DEBOUNCE_MS = 1_200
/** Squiggles should feel editor-grade: check runs well before analysis. */
const CHECK_DEBOUNCE_MS = 350
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
  /** An analyze pass is debounce-queued (edit made, waiting for idle). */
  analyzeQueued = false

  private analyzeTimer: ReturnType<typeof setTimeout> | null = null
  private checkTimer: ReturnType<typeof setTimeout> | null = null
  private checkTicket = 0
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
      | 'saveTimer'
      | 'virtualTypesGetter'
      | 'activePresetsGetter'
    >(this, {
      analysis: false,
      persistence: false,
      analyzeTimer: false,
      checkTimer: false,
      checkTicket: false,
      saveTimer: false,
      virtualTypesGetter: false,
      activePresetsGetter: false,
    })

    // Typings can land AFTER a check/analyze pass raced past the
    // acquisition batch (the batch dedupes on specifier, so only the
    // first caller waits). Re-run both passes against the same code
    // the moment the typings actually arrive — this is what makes
    // pasted import-bearing code refresh the canvas with no further
    // keystroke.
    this.analysis.onTypesAcquired(() => {
      this.scheduleCheck()
      void this.analysis.analyze(this.code, this.virtualTypesGetter())
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
    this.analyzeTimer = null
    this.analyzeQueued = false
    this.scheduleSave()
    this.scheduleCheck()
    void this.analysis.analyze(this.code, this.virtualTypesGetter())
  }

  /**
   * Run a queued analyze immediately instead of waiting out the idle
   * debounce (ESC = "I'm done editing, show me"). No-op when nothing
   * is queued.
   */
  flushPendingAnalyze(): void {
    if (!this.analyzeTimer) return
    this.analyzeNow()
  }

  /** Format the whole document with the user's style options. */
  async formatDocument(options: FormatOptions): Promise<void> {
    const format = this.analysis.editor?.format
    if (!format) return
    // Spread into a plain object: callers pass mobx observables, and
    // an observable proxy cannot be structured-cloned into the worker.
    const plain: FormatOptions = {
      singleQuote: options.singleQuote,
      semi: options.semi,
      trailingComma: options.trailingComma,
      printWidth: options.printWidth,
    }
    try {
      const formatted = await format(this.code, plain)
      if (formatted !== this.code) this.replaceCode(formatted)
    } catch {
      // Unformattable (syntax errors): leave the code untouched.
    }
  }

  /**
   * Snippet insertion (product rule): append an auto-numbered export
   * declaration with a blank line between consecutive declarations.
   * Numbering and declaration grammar are the adapter's (ADR-0019);
   * this service only owns the document edit.
   */
  insertSnippetLine(rhs: string): void {
    const line = this.analysis.descriptor.snippet.nextDeclaration(
      this.code,
      rhs,
    )
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
      })
    }, CHECK_DEBOUNCE_MS)
  }

  private scheduleAnalyze(): void {
    if (this.analyzeTimer) clearTimeout(this.analyzeTimer)
    this.analyzeQueued = true
    this.analyzeTimer = setTimeout(() => {
      runInAction(() => {
        this.analyzeQueued = false
      })
      this.analyzeTimer = null
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
