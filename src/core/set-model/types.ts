/**
 * Language-agnostic set-semantics IR, v2 (rectangular paradigm).
 *
 * Product rule (ADR-0012): the visualization expresses CONTAINMENT ONLY.
 * Types either contain each other or they don't; no partial-overlap
 * geometry exists. The analyzer therefore emits a pairwise containment
 * matrix — no cells, no atoms, no area semantics.
 *
 * Nothing in `core/` may import from adapters, services or views.
 * A second ADT language is added by writing a new adapter that emits
 * this IR — layout and rendering stay untouched.
 */

/** Identifier of a displayed type. Unique per analysis run. */
export type EntityId = string

/**
 * How one displayed type relates to another, in the source language's
 * assignability semantics (both directions queried).
 *
 * `unrelated` means neither containment direction holds — the layout
 * renders such entities as sibling rectangles. Semantic partial
 * overlaps (e.g. two unions sharing a member) are deliberately NOT
 * distinguished (ADR-0012).
 */
export type RelationKind = 'equivalent' | 'subset' | 'superset' | 'unrelated'

export interface PairRelation {
  a: EntityId
  b: EntityId
  kind: RelationKind
}

/**
 * Special roles that bypass ordinary rectangle rendering.
 * - `universe`: the type equals the whole canvas (TS `unknown`)
 * - `empty`: the empty set (TS `never`) — rendered as the omnipresent
 *   ∅ dot background, not as an area
 * - `outside-set-theory`: not a set at all (TS `any`) — floating badge
 */
export type SpecialRole = 'none' | 'universe' | 'empty' | 'outside-set-theory'

/** Where a displayed entity came from. */
export type EntityOrigin = 'code' | 'preset'

export interface TypeEntity {
  id: EntityId
  /** Display name: export name, or the preset's type text itself. */
  name: string
  /** Type text as written in source / preset, e.g. `string | number`. */
  typeText: string
  /**
   * One-level alias-expanded text from the checker (e.g. `Co<string>`
   * expands to `string | boolean`); equals `typeText` when nothing
   * expands. Tooltips prefer this — it is the teaching payload.
   */
  expandedText: string
  special: SpecialRole
  origin: EntityOrigin
  /**
   * True when the entity is EXACTLY the union of its proper subsets
   * among displayed entities (P ⊆ S₁ ∪ … ∪ Sₖ; ⊇ holds by
   * construction). Layout then lets the children fill the container
   * completely — no implicit "everything else" slot (e.g.
   * `string | number` with both `string` and `number` displayed).
   */
  coveredBySubsets: boolean
  /** Span of the declaration in the source; null for preset entities. */
  declarationSpan: SourceSpan | null
}

export interface SourceSpan {
  start: number
  end: number
}

export interface SourceDiagnostic {
  message: string
  span: SourceSpan
  severity: 'error' | 'warning'
}

/**
 * The complete result of analyzing one source text plus the toggled
 * preset types. Error diagnostics mean the canvas keeps showing the
 * last good result; the editor owns error presentation.
 */
export interface AnalysisResult {
  entities: Array<TypeEntity>
  relations: Array<PairRelation>
  diagnostics: Array<SourceDiagnostic>
  /** Entities resolved to `any`, driving the floating badge. */
  anyEntityNames: Array<string>
}
