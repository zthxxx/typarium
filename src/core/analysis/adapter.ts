import type {
  AnalysisResult,
  SourceDiagnostic,
} from '#/core/set-model/types.ts'

/**
 * Contract every language adapter fulfills. The app is written against
 * this interface only; the header language selector swaps adapters.
 *
 * One adapter is the SINGLE language implementation in the bundle: it
 * powers the canvas analysis AND the editor's language features
 * (diagnostics, hover, completions) from the same worker — the editor
 * never loads a second copy of the language toolchain (ADR-0015).
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
  /** Read-only compiler baseline rows for the config popover. */
  readonly compilerOptionsDisplay: Array<[string, string]>

  /**
   * Analyze the editor source plus the toggled virtual preset types.
   * Virtual presets never appear in the user's code; they join the
   * displayed entity set with `origin: 'preset'`.
   */
  analyze: (
    source: string,
    virtualTypes: Array<VirtualType>,
  ) => Promise<AnalysisResult>
  /** Fast diagnostics-only pass driving editor squiggles. */
  check: (source: string) => Promise<Array<SourceDiagnostic>>
  /** LSP-style hover text at a source offset; null when nothing there. */
  quickInfo: (source: string, offset: number) => Promise<string | null>
  /** Completion entries at a source offset for the editor. */
  completions: (
    source: string,
    offset: number,
    preferences?: CompletionPreferences,
  ) => Promise<Array<CompletionEntry>>
  /** Format the whole document per the user's style options. */
  format: (source: string, options: FormatOptions) => Promise<string>
  /** Twoslash `// ^?` query results for inline type display. */
  twoslashQueries: (source: string) => Promise<Array<TwoslashQuery>>
  dispose: () => void
}

/** One resolved `// ^?` annotation. */
export interface TwoslashQuery {
  /** Offset of the queried position in the source. */
  offset: number
  /** Zero-based line of the queried token. */
  line: number
  /** The type text the annotation resolves to. */
  text: string
}

/** Style knobs shared by the formatter and completion suggestions. */
export interface FormatOptions {
  singleQuote: boolean
  semi: boolean
  trailingComma: boolean
  printWidth: number
}

export interface CompletionPreferences {
  quotePreference: 'single' | 'double'
}

/** Minimal completion surface the editor needs (kind maps to icons). */
export interface CompletionEntry {
  name: string
  kind: string
  sortText: string
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
