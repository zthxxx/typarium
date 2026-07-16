import { makeAutoObservable, runInAction } from 'mobx'
import type { VirtualType } from '#/core/analysis/adapter.ts'
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
