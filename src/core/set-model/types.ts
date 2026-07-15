/**
 * Language-agnostic set-semantics IR.
 *
 * This module is the contract between three independently evolving parts:
 * - language adapters (e.g. the TypeScript analyzer worker) PRODUCE it,
 * - the layout engine CONSUMES it to place anchors and contours,
 * - the view layer CONSUMES it for labels, tooltips and legends.
 *
 * Nothing in `core/` may import from adapters, services or views.
 * A second ADT language is added by writing a new adapter that emits this
 * IR — layout and rendering stay untouched.
 */

/** Stable identifier of a top-level domain in the universe basemap. */
export type DomainId = string

/** Optional finer zone inside a domain (e.g. functions inside object). */
export type SubzoneId = string

/** Identifier of a displayed (exported) type. Unique per analysis run. */
export type EntityId = string

/** Identifier of a minimal drawable region (cell) on the basemap. */
export type CellId = string

/**
 * The fixed partition of the universe (`unknown` in TypeScript terms).
 * Domains never move or resize between analysis runs — layout stability
 * is what makes the visualization readable while typing.
 */
export interface SetUniverse {
  languageId: string
  domains: Array<Domain>
}

export interface Domain {
  id: DomainId
  /** Canonical label rendered on the basemap, e.g. `string`, `object`. */
  label: string
  /**
   * `infinite` domains have interior room for refinements and literals;
   * `unit` domains are single-value domains (`null`, `undefined`).
   */
  cardinality: 'infinite' | 'unit'
  subzones?: Array<Subzone>
}

export interface Subzone {
  id: SubzoneId
  label: string
}

/**
 * How one displayed type relates to another, in the source language's
 * assignability semantics (both directions queried).
 *
 * `unknown` is an honest answer: neither containment holds and the
 * language service cannot prove the intersection empty or inhabited.
 */
export type RelationKind =
  'equivalent' | 'subset' | 'superset' | 'disjoint' | 'overlap' | 'unknown'

export interface PairRelation {
  a: EntityId
  b: EntityId
  kind: RelationKind
}

/**
 * Special roles that bypass ordinary region rendering.
 * - `universe`: the type equals the whole canvas (TS `unknown`)
 * - `empty`: the empty set (TS `never`) — rendered as the omnipresent
 *   ∅ dot pattern, not as an area
 * - `outside-set-theory`: not a set at all (TS `any`) — floating badge
 */
export type SpecialRole = 'none' | 'universe' | 'empty' | 'outside-set-theory'

export interface TypeEntity {
  id: EntityId
  /** Export name as written by the user, e.g. `R1`. */
  name: string
  /** Type text as the language prints it, e.g. `string | boolean`. */
  typeText: string
  /** One-level expanded text for hover, alias names resolved at top level. */
  expandedText: string
  special: SpecialRole
  /** Span of the declaration in the source, for editor↔canvas linkage. */
  declarationSpan: SourceSpan
}

export interface SourceSpan {
  start: number
  end: number
}

/**
 * Minimal drawable region. Every displayed type is a union of cells;
 * contours are drawn around the anchors of the cells a type covers.
 *
 * `members` is upward-closed under containment: if a cell belongs to A
 * and A ⊆ B among displayed types, the cell also lists B. The layout
 * engine relies on this to place semantically intersecting anchors
 * adjacently (the anti-phantom-intersection invariant).
 *
 * Adapters must enforce the closure themselves: raw assignability
 * queries are NOT transitive in every language (TS method bivariance
 * breaks transitivity), so witness-membership alone can violate this —
 * take a fixed point over entity containment edges before emitting.
 */
export interface Cell {
  id: CellId
  domain: DomainId
  subzone?: SubzoneId
  kind: CellKind
  /** Label for point-like cells, e.g. `"foo"`, `42`, `true`. */
  label?: string
  members: Array<EntityId>
}

export type CellKind =
  /** The whole interior of a domain, e.g. all of `string`. */
  | 'domain-full'
  /** A single value (unit type): `"foo"`, `42`, `true`, `null`. */
  | 'literal'
  /** The part of a refinement not shared with overlapping peers. */
  | 'refinement-exclusive'
  /** A proven-inhabited intersection of two refinements. */
  | 'refinement-overlap'
  /** An intersection the language service can neither prove empty nor inhabited. */
  | 'unknown-overlap'

/**
 * A point where the language's assignability deliberately deviates from
 * pure set semantics. Rendered as an info marker, never hidden — the
 * tool teaches the real language, warts included.
 */
export interface Deviation {
  kind: 'any' | 'void' | 'method-bivariance' | 'enum-nominal'
  entityId?: EntityId
  /** i18n message key; views resolve it to the active locale. */
  messageKey: string
}

export interface SourceDiagnostic {
  message: string
  span: SourceSpan
  severity: 'error' | 'warning'
}

/**
 * The complete result of analyzing one source text.
 * `diagnostics` non-empty (errors) means the canvas keeps showing the
 * last good result; the editor owns error presentation.
 */
export interface AnalysisResult {
  entities: Array<TypeEntity>
  cells: Array<Cell>
  relations: Array<PairRelation>
  deviations: Array<Deviation>
  diagnostics: Array<SourceDiagnostic>
  /** Entities resolved to `any` (or error types), driving the badge. */
  anyEntityNames: Array<string>
}
