import type { PairRelation, TypeEntity } from './types.ts'

/**
 * The shared canvas geometry contract (ADR-0012 / ADR-0021): both
 * diagram engines lay out in the same coordinate space, from the same
 * input shape, against the same spacing constants. The renderer draws
 * rings/labels with the SAME values the engines used to reserve space
 * — single source of truth, no drift.
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

/** The input every layout engine consumes: IR + measured viewport. */
export interface LayoutInput {
  entities: Array<TypeEntity>
  relations: Array<PairRelation>
  viewport: Viewport
}

/** Smallest canvas the engines lay out; smaller viewports are clamped. */
export const MIN_VIEWPORT = { width: 320, height: 240 } as const

/** Breathing room between the canvas edge and top-level rectangles. */
export const CANVAS_PAD = 14

/** Gap between sibling cells — the ∅ dot background shows through here. */
export const CELL_GAP = 12

/** Inset per stacked border ring (equivalence-class members). */
export const RING_INSET = 5

/** Height reserved at the top of a rectangle for its label row. */
export const LABEL_STRIP = 26

/** Padding between the innermost ring and the children grid. */
export const CONTENT_PAD = 10

/** Corner radius used by the renderer for entity rectangles. */
export const RECT_RADIUS = 14
