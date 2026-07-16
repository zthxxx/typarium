/**
 * Shared geometry constants for the rectangular layout (ADR-0012).
 * The renderer draws rings/labels with the SAME values the engine used
 * to reserve space — single source of truth, no drift.
 */

/** Smallest canvas the engine lays out; smaller viewports are clamped. */
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
