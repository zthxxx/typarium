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

export interface RectLayoutResult {
  /** Draw order: parents strictly before children. */
  rects: Array<EntityRect>
  /** Displayed `unknown` entities — rendered as the canvas frame itself. */
  universeIds: Array<EntityId>
  /** Displayed `never` entities — background dot emphasis + legend. */
  emptyIds: Array<EntityId>
  warnings: Array<string>
}
