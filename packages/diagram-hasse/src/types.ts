import type { Box, EntityId } from '@typarium/set-model'

/**
 * Hasse-diagram geometry (ADR-0017): when the containment DAG cannot
 * be drawn faithfully with one rectangle per entity (≥3 parents,
 * parents in different containers, conflicting overlap pairings), the
 * canvas switches to a layered order diagram — the lossless
 * representation of any containment order. Supersets sit ABOVE their
 * subsets; an edge is a covering (minimal) containment; no arrowheads
 * (Hasse convention).
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
