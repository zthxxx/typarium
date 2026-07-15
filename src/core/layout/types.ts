import type {
  AnalysisResult,
  CellId,
  CellKind,
  DomainId,
  EntityId,
  SetUniverse,
  SubzoneId,
} from '#/core/set-model/types.ts'

/**
 * Geometry model of the layout engine.
 *
 * All coordinates live in a fixed logical viewport; the canvas never
 * zooms or pans, it only has a minimum size. Everything here is fully
 * deterministic: same input → identical output, no randomness.
 */

export interface Viewport {
  width: number
  height: number
}

export interface LayoutInput {
  universe: SetUniverse
  result: AnalysisResult
  viewport: Viewport
}

/** Axis-aligned rounded rectangle in viewport coordinates. */
export interface RectShape {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  /** Corner radius for rendering. */
  rx: number
}

export interface CircleShape {
  kind: 'circle'
  cx: number
  cy: number
  radius: number
}

export type Shape = RectShape | CircleShape

export interface LabeledPoint {
  x: number
  y: number
}

/** Fixed basemap geometry for one domain — independent of user input. */
export interface DomainFrame {
  id: DomainId
  label: string
  shape: Shape
  labelPos: LabeledPoint
  subzones: Array<SubzoneFrame>
}

export interface SubzoneFrame {
  id: SubzoneId
  label: string
  shape: RectShape
  labelPos: LabeledPoint
}

/** Placement of one IR cell on the basemap. */
export interface CellAnchor {
  cellId: CellId
  domain: DomainId
  subzone?: SubzoneId
  cellKind: CellKind
  shape: Shape
  /** True for `unknown-overlap` cells — renderer draws them dashed. */
  uncertain: boolean
  /** Label for point-like cells (literals), rendered next to the dot. */
  label?: string
}

/**
 * One drawable contour. Entities with identical cell coverage (an
 * equivalence class under mutual assignability) merge into a single
 * contour carrying every name as label.
 */
export interface EntityContour {
  /** Stable key: sorted entity ids joined with `+`. */
  key: string
  entityIds: Array<EntityId>
  labels: Array<string>
  /** Closed SVG path (`M … Z`) produced by bubble sets + smoothing. */
  svgPath: string
  /** Sampled closed polygon of the same outline, for hit tests. */
  outline: Array<LabeledPoint>
  /** Index into the categorical color palette, assigned by declaration order. */
  colorIndex: number
  /** Where the contour label should be placed. */
  labelPos: LabeledPoint
}

/**
 * Single source of truth for contour-label pill geometry: the layout
 * engine uses it for collision resolution, the renderer for drawing.
 */
export const LABEL_METRICS = {
  height: 26,
  charWidth: 8.6,
  paddingX: 18,
  minWidth: 34,
  gap: 6,
} as const

export function labelBoxWidth(text: string): number {
  return Math.max(
    LABEL_METRICS.minWidth,
    text.length * LABEL_METRICS.charWidth + LABEL_METRICS.paddingX,
  )
}

export interface LayoutResult {
  /** The universe frame — the canvas border region representing `unknown`. */
  universeFrame: RectShape
  frames: Array<DomainFrame>
  anchors: Array<CellAnchor>
  /** Contours in draw order: larger sets first (painted underneath). */
  contours: Array<EntityContour>
  /** Entity that IS the universe (TS `unknown`), if exported. */
  universeEntityIds: Array<EntityId>
  /** Entities that are the empty set (TS `never`), if exported. */
  emptyEntityIds: Array<EntityId>
  warnings: Array<string>
}
