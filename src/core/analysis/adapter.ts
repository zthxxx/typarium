import type { AnalysisResult } from '#/core/set-model/types.ts'

/**
 * Contract every language adapter fulfills. The app is written against
 * this interface only; the header language selector swaps adapters.
 *
 * Adapters run their analysis inside a Web Worker — `analyze` is async
 * for that reason. The worker wiring lives with the adapter, not in core.
 */
export interface LanguageAdapter {
  readonly id: string
  /** Display name for the header language selector. */
  readonly label: string
  /** Monaco language id used by the editor pane. */
  readonly editorLanguageId: string
  /** Preset catalog for the picker bar, in display order. */
  readonly presets: Array<LanguagePreset>
  /** Default source shown on first visit (the teaching demo snippet). */
  readonly sampleSource: string
  /** Human-readable engine identity for the footer. */
  readonly engineLabel: string

  /**
   * Analyze the editor source plus the toggled virtual preset types.
   * Virtual presets never appear in the user's code; they join the
   * displayed entity set with `origin: 'preset'`.
   */
  analyze: (
    source: string,
    virtualTypes: Array<VirtualType>,
  ) => Promise<AnalysisResult>
  dispose: () => void
}

/** A type displayed on the canvas without touching the editor code. */
export interface VirtualType {
  /** Display name, e.g. `string`, `Array<T>` shown as its label. */
  name: string
  /** The type expression the analyzer materializes, e.g. `Array<unknown>`. */
  typeText: string
}

export type PresetCategory = 'primitive' | 'intrinsic' | 'common' | 'snippet'

/**
 * One picker button. `virtual` presets toggle canvas display state;
 * `snippet` presets insert an `export type CN = ...` line into the
 * editor (auto-numbered, blank-line separated) — the code is then the
 * source of truth for those.
 */
export interface LanguagePreset {
  label: string
  category: PresetCategory
  kind: 'virtual' | 'snippet'
  /** For virtual presets: the analyzable type expression. */
  typeText?: string
  /** For snippet presets: the RHS inserted as `export type CN = <rhs>`. */
  snippetRhs?: string
  /** Marks presets needing the warning treatment (TS `any`). */
  tone?: 'warning'
}
