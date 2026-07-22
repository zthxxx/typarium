import type {
  AnalysisResult,
  SourceDiagnostic,
} from '#/core/set-model/types.ts'

/**
 * Contract every language adapter fulfills (ADR-0019). The app is
 * written against this interface only; the header language selector
 * swaps adapters.
 *
 * Shape: a pure-data descriptor, a REQUIRED analysis core
 * (analyze/check — the minimum a new language ships), OPTIONAL editor
 * capabilities the UI degrades without, and a small event surface.
 * One adapter is the SINGLE language implementation in the bundle: it
 * powers the canvas analysis AND the editor's language features from
 * the same engine (ADR-0015).
 */
export interface LanguageAdapter {
  readonly descriptor: LanguageDescriptor

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

  /** Editor language features; absent members hide the matching UI. */
  readonly editor?: EditorCapabilities

  /**
   * Subscribe to late type-acquisition arrivals: typings landed after
   * some check/analyze pass already ran without them, so those passes
   * should be re-run against the same source. Multi-subscriber; the
   * returned function unsubscribes.
   */
  onTypesAcquired: (listener: () => void) => () => void
  /**
   * Engine boot progress (stage id + optional in-stage fraction), for
   * the app's boot pipeline display. Multi-subscriber.
   */
  onBootProgress: (listener: (event: BootProgressEvent) => void) => () => void
  /**
   * Start engine initialization eagerly (idempotent). Without it the
   * engine boots lazily on the first analyze/check call.
   */
  warmup: () => Promise<void>

  dispose: () => void
}

/** Static language facts — pure data, safe to read before warmup. */
export interface LanguageDescriptor {
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
   * What the special set-roles are CALLED in this language — display
   * names only; the IR keeps its language-neutral roles. TS: unknown /
   * never / any. Views must render these, never hardcoded TS names.
   */
  readonly specialTypeNames: SpecialTypeNames
  /** Declaration syntax for snippet-preset insertion. */
  readonly snippet: SnippetSyntax
}

export interface SpecialTypeNames {
  /** The type equal to the whole value universe (TS `unknown`). */
  universe: string
  /** The empty set (TS `never`). */
  empty: string
  /** The outside-set-theory escape hatch (TS `any`). */
  any: string
}

export interface SnippetSyntax {
  /**
   * Build the next auto-numbered export declaration for this code, in
   * this language's syntax (product rule: auto-incremented `CN` names,
   * e.g. TS `export type C3 = string | number`). The adapter owns both
   * the numbering scan and the declaration grammar.
   */
  nextDeclaration: (code: string, rhs: string) => string
}

/** Editor language features; every member is individually optional. */
export interface EditorCapabilities {
  /** LSP-style hover text at a source offset; null when nothing there. */
  quickInfo?: (source: string, offset: number) => Promise<string | null>
  /** Completion entries at a source offset for the editor. */
  completions?: (
    source: string,
    offset: number,
    preferences?: CompletionPreferences,
  ) => Promise<Array<CompletionEntry>>
  /** Format the whole document per the user's style options. */
  format?: (source: string, options: FormatOptions) => Promise<string>
  /**
   * Inline type-query annotations resolved against the current source.
   * The marker syntax is language-defined (TS: twoslash `// ^?`).
   */
  inlineQueries?: (source: string) => Promise<Array<InlineQuery>>
}

/** One resolved inline type-query annotation. */
export interface InlineQuery {
  /** Offset of the queried position in the source. */
  offset: number
  /** Zero-based line of the queried token. */
  line: number
  /** The type text the annotation resolves to. */
  text: string
}

/** Engine boot progress: stage id plus optional in-stage fraction. */
export interface BootProgressEvent {
  /** Stable stage id; the app maps known ids to localized labels. */
  stage: 'engine-download' | 'engine-init' | 'ready'
  /** 0..1 within the stage when measurable; absent = indeterminate. */
  fraction?: number
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
 * `snippet` presets insert an auto-numbered declaration line into the
 * editor (blank-line separated) — the code is then the source of truth
 * for those.
 */
export interface LanguagePreset {
  label: string
  category: PresetCategory
  kind: 'virtual' | 'snippet'
  /** For virtual presets: the analyzable type expression. */
  typeText?: string
  /** For snippet presets: the RHS handed to `snippet.nextDeclaration`. */
  snippetRhs?: string
  /** Marks presets needing the warning treatment (TS `any`). */
  tone?: 'warning'
}
