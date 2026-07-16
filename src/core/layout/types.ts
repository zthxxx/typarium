import type {
  EntityId,
  PairRelation,
  TypeEntity,
} from '#/core/set-model/types.ts'

/**
 * Geometry model of the rectangular layout engine (ADR-0012).
 *
 * The canvas is a responsive rounded-rect region; entities render as
 * nested rounded rectangles arranged by CONTAINMENT ONLY. Areas carry
 * no quantitative meaning: siblings split their container equally on a
 * balanced grid. Everything is deterministic — same input, same output.
 */

export interface Viewport {
  width: number
  height: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * One drawable rectangle: an equivalence class of mutually-containing
 * entities. `ringCount` extra borders (one per class member beyond the
 * first) are drawn inset by the renderer; `contentBox` is where child
 * rectangles were laid out (inside all rings plus padding).
 */
export interface EntityRect {
  /** Stable key: sorted entity ids joined with `+`. */
  key: string
  entityIds: Array<EntityId>
  labels: Array<string>
  outer: Box
  contentBox: Box
  /** Nesting depth: 1 for canvas-level rectangles. */
  depth: number
  /** Number of stacked border rings (equivalence-class size). */
  ringCount: number
  /** Index into the categorical palette, by declaration order. */
  colorIndex: number
}

export interface RectLayoutInput {
  entities: Array<TypeEntity>
  relations: Array<PairRelation>
  viewport: Viewport
}

/**
 * The explicit "everything else" block: a non-covered container's
 * remaining value space, drawn as a light-gray `???` cell (half-weight
 * border) instead of silent empty space.
 */
export interface PlaceholderRect {
  /** Stable key derived from the container's class key. */
  key: string
  box: Box
  depth: number
}

export interface RectLayoutResult {
  /** Draw order: parents strictly before children. */
  rects: Array<EntityRect>
  /** Displayed `unknown` entities — rendered as the canvas frame itself. */
  universeIds: Array<EntityId>
  /** Displayed `never` entities — background dot emphasis + legend. */
  emptyIds: Array<EntityId>
  /** `???` blocks, one per non-covered entity container. */
  placeholders: Array<PlaceholderRect>
  warnings: Array<string>
}

/**
 * Hasse-diagram fallback (ADR-0017): when the containment DAG cannot be
 * drawn faithfully with one rectangle per entity (≥3 parents, parents
 * in different containers, conflicting overlap pairings), the canvas
 * switches to a layered order diagram — the lossless representation of
 * any containment order. Supersets sit ABOVE their subsets; an edge is
 * a covering (minimal) containment; no arrowheads (Hasse convention).
 */
export interface HasseNode {
  /** Class key (sorted entity ids joined `+`); `<parentKey>+rest` for ???. */
  key: string
  /** Empty for placeholder nodes. */
  entityIds: Array<EntityId>
  /** Equivalence-class labels; `['???']` for placeholder nodes. */
  labels: Array<string>
  kind: 'entity' | 'placeholder'
  box: Box
  /** Palette index by declaration order; null for placeholder nodes. */
  colorIndex: number | null
  /** 0 = maximal sets (top row). */
  layer: number
}

export interface HasseEdge {
  /** Superset node key (drawn above). */
  from: string
  /** Subset node key (drawn below). */
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface HasseLayoutResult {
  nodes: Array<HasseNode>
  edges: Array<HasseEdge>
  universeIds: Array<EntityId>
  emptyIds: Array<EntityId>
  warnings: Array<string>
}

/** Discriminated canvas layout: Euler rectangles or the Hasse fallback. */
export type CanvasLayout =
  | ({ mode: 'euler' } & RectLayoutResult)
  | ({ mode: 'hasse' } & HasseLayoutResult)
