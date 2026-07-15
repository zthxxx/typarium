import { validateAnalysisResult } from '#/core/set-model/invariants.ts'
import { clampViewport, computeBasemap } from '#/core/layout/basemap.ts'
import { placeAnchors } from '#/core/layout/anchors.ts'
import { computeContours } from '#/core/layout/contours.ts'
import type { LayoutInput, LayoutResult } from '#/core/layout/types.ts'

export type {
  CellAnchor,
  CircleShape,
  DomainFrame,
  EntityContour,
  LabeledPoint,
  LayoutInput,
  LayoutResult,
  RectShape,
  Shape,
  SubzoneFrame,
  Viewport,
} from '#/core/layout/types.ts'
export { MIN_VIEWPORT } from '#/core/layout/basemap.ts'

/**
 * Pure function from analysis IR to drawable geometry. No caching, no
 * randomness: identical input yields identical output, so callers can
 * memoize by reference and the diagram never jumps between keystrokes.
 */
export function computeLayout(input: LayoutInput): LayoutResult {
  const warnings: Array<string> = []

  for (const violation of validateAnalysisResult(input.result)) {
    warnings.push(`invariant ${violation.rule}: ${violation.detail}`)
  }

  const viewport = clampViewport(input.viewport)
  const basemap = computeBasemap(input.universe, viewport)
  const minDim = Math.min(viewport.width, viewport.height)
  const anchors = placeAnchors(basemap, input.result.cells, minDim)
  const contourResult = computeContours(
    basemap,
    anchors,
    input.result.cells,
    input.result.entities,
  )
  warnings.push(...contourResult.warnings)

  return {
    universeFrame: basemap.universeFrame,
    frames: basemap.frames,
    anchors,
    contours: contourResult.contours,
    universeEntityIds: input.result.entities
      .filter((entity) => entity.special === 'universe')
      .map((entity) => entity.id),
    emptyEntityIds: input.result.entities
      .filter((entity) => entity.special === 'empty')
      .map((entity) => entity.id),
    warnings,
  }
}
