import { makeAutoObservable } from 'mobx'
import type { AnalysisService } from '#/services/analysis.service.ts'
import type { PersistenceService } from '#/services/persistence.service.ts'

/** Product rule: auto-submit visualization 1.2s after the user stops typing. */
const ANALYZE_DEBOUNCE_MS = 1_200
/** Saves are cheaper than analysis; persist keystrokes almost immediately. */
const SAVE_DEBOUNCE_MS = 300

/**
 * Single source of truth for the editor text. Monaco mirrors this
 * observable; presets and share-links mutate it only through here.
 */
export class EditorService {
  code = ''

  private analyzeTimer: ReturnType<typeof setTimeout> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly analysis: AnalysisService,
    private readonly persistence: PersistenceService,
  ) {
    makeAutoObservable<
      EditorService,
      'analysis' | 'persistence' | 'analyzeTimer' | 'saveTimer'
    >(this, {
      analysis: false,
      persistence: false,
      analyzeTimer: false,
      saveTimer: false,
    })
  }

  /** User keystrokes: debounced persistence + debounced analysis. */
  setCode(code: string): void {
    if (code === this.code) return
    this.code = code
    this.scheduleSave()
    this.scheduleAnalyze()
  }

  /** Programmatic replacement (boot restore, share link): analyze now. */
  replaceCode(code: string): void {
    this.code = code
    this.scheduleSave()
    void this.analysis.analyze(code)
  }

  /** Preset button toggling: insert the line, or remove it when present. */
  togglePresetLine(insertText: string): void {
    const line = insertText.trim()
    const lines = this.code.split('\n')
    const existing = lines.findIndex((candidate) => candidate.trim() === line)
    const next =
      existing >= 0
        ? [...lines.slice(0, existing), ...lines.slice(existing + 1)]
        : appendLine(lines, line)
    this.replaceCode(next.join('\n'))
  }

  hasPresetLine(insertText: string): boolean {
    const line = insertText.trim()
    return this.code.split('\n').some((candidate) => candidate.trim() === line)
  }

  private scheduleAnalyze(): void {
    if (this.analyzeTimer) clearTimeout(this.analyzeTimer)
    this.analyzeTimer = setTimeout(() => {
      void this.analysis.analyze(this.code)
    }, ANALYZE_DEBOUNCE_MS)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void this.persistence.saveDocument(this.code, this.analysis.languageId)
    }, SAVE_DEBOUNCE_MS)
  }
}

function appendLine(lines: Array<string>, line: string): Array<string> {
  const result = [...lines]
  if (result.length > 0 && result[result.length - 1].trim() !== '') {
    result.push('')
  }
  result.push(line)
  return result
}
