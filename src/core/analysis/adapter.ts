import type { AnalysisResult, SetUniverse } from '#/core/set-model/types.ts'

/**
 * Contract every language adapter fulfills. The app is written against
 * this interface only; the header language selector swaps adapters.
 *
 * Adapters run their analysis inside a Web Worker — `analyze` and
 * `quickInfo` are async for that reason. The worker wiring lives with
 * the adapter, not in core.
 */
export interface LanguageAdapter {
  readonly id: string
  /** Display name for the header language selector. */
  readonly label: string
  /** Monaco language id used by the editor pane. */
  readonly editorLanguageId: string
  /** The fixed universe basemap this language draws on. */
  readonly universe: SetUniverse
  /** Sample snippets for the preset buttons row. */
  readonly presets: Array<LanguagePreset>
  /** Default source shown on first visit (the teaching demo snippet). */
  readonly sampleSource: string
  /** Human-readable engine identity for the footer, e.g. `TypeScript 5.9.3`. */
  readonly engineLabel: string

  analyze: (source: string) => Promise<AnalysisResult>
  /** Hover support for canvas labels, mirroring the editor's LSP hover. */
  quickInfo: (source: string, position: number) => Promise<string | null>
  dispose: () => void
}

export interface LanguagePreset {
  /** Button label, e.g. `unknown`, `{}`. */
  label: string
  /** The exact source line(s) the button inserts into the editor. */
  insertText: string
}
