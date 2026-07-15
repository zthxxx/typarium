import { BubbleSets, circle, rect } from 'bubblesets-js'
import type { ICircle, IRectangle } from 'bubblesets-js'
import type { Cell, EntityId, TypeEntity } from '#/core/set-model/types.ts'
import type { Basemap } from '#/core/layout/basemap.ts'
import type {
  CellAnchor,
  EntityContour,
  LabeledPoint,
  Shape,
} from '#/core/layout/types.ts'

/**
 * Draws one bubble-set contour per displayed entity (equivalence classes
 * merged). Members are the anchors of the entity's cells; every other
 * anchor plus every untouched domain frame becomes an obstacle, so a
 * contour can only visually intersect another one at a genuinely shared
 * cell — the rendering half of the anti-phantom-intersection invariant.
 */

const MEMBER_PADDING = 7
const OBSTACLE_PADDING = 2

export interface ContourComputation {
  contours: Array<EntityContour>
  warnings: Array<string>
}

export function computeContours(
  basemap: Basemap,
  anchors: Array<CellAnchor>,
  cells: Array<Cell>,
  entities: Array<TypeEntity>,
): ContourComputation {
  const warnings: Array<string> = []
  const drawable = entities.filter((entity) => entity.special === 'none')
  if (drawable.length === 0) return { contours: [], warnings }

  const anchorByCell = new Map(anchors.map((anchor) => [anchor.cellId, anchor]))
  const cellIdsOf = new Map<EntityId, Array<string>>(
    drawable.map((entity) => [entity.id, []]),
  )
  for (const cell of cells) {
    for (const member of cell.members) {
      cellIdsOf.get(member)?.push(cell.id)
    }
  }

  // Merge entities with identical coverage into one contour.
  const classes = new Map<string, Array<TypeEntity>>()
  for (const entity of drawable) {
    const coverage = [...(cellIdsOf.get(entity.id) ?? [])].sort()
    if (coverage.length === 0) {
      warnings.push(`entity ${entity.name} has no cells to draw`)
      continue
    }
    const key = coverage.join('+')
    const group = classes.get(key)
    if (group) {
      group.push(entity)
    } else {
      classes.set(key, [entity])
    }
  }

  const entityOrder = new Map(
    drawable.map((entity, index) => [entity.id, index]),
  )
  const merged = [...classes.entries()].map(([coverageKey, group]) => {
    const cellIds = coverageKey.split('+')
    const firstIndex = Math.min(
      ...group.map((entity) => entityOrder.get(entity.id) ?? 0),
    )
    return { cellIds, group, firstIndex }
  })
  // Bigger coverage first: large sets are painted underneath.
  merged.sort(
    (a, b) =>
      b.cellIds.length - a.cellIds.length || a.firstIndex - b.firstIndex,
  )

  const contours: Array<EntityContour> = []
  for (const { cellIds, group, firstIndex } of merged) {
    const memberCellIds = new Set(cellIds)
    const memberAnchors = cellIds
      .map((id) => anchorByCell.get(id))
      .filter((anchor): anchor is CellAnchor => Boolean(anchor))
    if (memberAnchors.length === 0) {
      warnings.push(
        `contour for ${group.map((entity) => entity.name).join(', ')} has no anchors`,
      )
      continue
    }

    // Default pixelGroup (4): a coarser potential grid loses member
    // containment after outline smoothing (verified empirically).
    const bubbles = new BubbleSets({ virtualEdges: true })
    for (const anchor of memberAnchors) {
      bubbles.pushMember(toBubbleShape(anchor.shape, MEMBER_PADDING))
    }
    for (const anchor of anchors) {
      if (!memberCellIds.has(anchor.cellId)) {
        bubbles.pushNonMember(toBubbleShape(anchor.shape, OBSTACLE_PADDING))
      }
    }
    for (const obstacle of untouchedFrameObstacles(basemap, memberAnchors)) {
      bubbles.pushNonMember(obstacle)
    }

    const rawPath = bubbles.compute()
    const smooth = rawPath.sample(8).simplify(0).bSplines()
    if (smooth.length === 0) {
      warnings.push(
        `bubble set produced an empty outline for ${group
          .map((entity) => entity.name)
          .join(', ')}`,
      )
      continue
    }
    if (!smooth.containsElements(memberAnchors.map((a) => centerOf(a.shape)))) {
      warnings.push(
        `contour for ${group
          .map((entity) => entity.name)
          .join(', ')} does not enclose every member anchor`,
      )
    }

    const outline: Array<LabeledPoint> = smooth.points.map((point) => ({
      x: point.x,
      y: point.y,
    }))
    contours.push({
      key: group
        .map((entity) => entity.id)
        .sort()
        .join('+'),
      entityIds: group.map((entity) => entity.id),
      labels: group.map((entity) => entity.name),
      svgPath: smooth.toString(2),
      outline,
      colorIndex: firstIndex % 12,
      labelPos: labelPosition(memberAnchors),
    })
  }

  return { contours, warnings }
}

function toBubbleShape(shape: Shape, padding: number): IRectangle | ICircle {
  if (shape.kind === 'circle') {
    return circle(shape.cx, shape.cy, shape.radius + padding)
  }
  return rect(
    shape.x - padding,
    shape.y - padding,
    shape.width + padding * 2,
    shape.height + padding * 2,
  )
}

function centerOf(shape: Shape): { cx: number; cy: number } {
  if (shape.kind === 'circle') return { cx: shape.cx, cy: shape.cy }
  return { cx: shape.x + shape.width / 2, cy: shape.y + shape.height / 2 }
}

/**
 * Frames of domains (and subzones) the entity does not touch become
 * obstacles, so contours route through the empty corridors between
 * domains instead of cutting across foreign territory.
 */
function untouchedFrameObstacles(
  basemap: Basemap,
  memberAnchors: Array<CellAnchor>,
): Array<IRectangle | ICircle> {
  const touchedDomains = new Set(memberAnchors.map((anchor) => anchor.domain))
  const touchedSubzones = new Set(
    memberAnchors
      .filter((anchor) => anchor.subzone)
      .map((anchor) => `${anchor.domain}::${anchor.subzone ?? ''}`),
  )
  const touchesWholeDomain = new Set(
    memberAnchors
      .filter((anchor) => anchor.cellKind === 'domain-full')
      .map((anchor) => anchor.domain),
  )

  const obstacles: Array<IRectangle | ICircle> = []
  for (const frame of basemap.frames) {
    if (!touchedDomains.has(frame.id)) {
      obstacles.push(toBubbleShape(frame.shape, OBSTACLE_PADDING))
      continue
    }
    // Domain touched only in specific subzones: block the other subzones,
    // unless the entity covers the whole domain.
    if (frame.subzones.length > 0 && !touchesWholeDomain.has(frame.id)) {
      for (const subzone of frame.subzones) {
        const key = `${frame.id}::${subzone.id}`
        if (!touchedSubzones.has(key)) {
          obstacles.push(toBubbleShape(subzone.shape, OBSTACLE_PADDING))
        }
      }
    }
  }
  return obstacles
}

function labelPosition(memberAnchors: Array<CellAnchor>): LabeledPoint {
  let best = memberAnchors[0]
  let bestCenter = centerOf(best.shape)
  for (const anchor of memberAnchors) {
    const center = centerOf(anchor.shape)
    if (
      center.cy < bestCenter.cy ||
      (center.cy === bestCenter.cy && center.cx < bestCenter.cx)
    ) {
      best = anchor
      bestCenter = center
    }
  }
  const offset = best.shape.kind === 'circle' ? best.shape.radius : 10
  return { x: bestCenter.cx, y: bestCenter.cy - offset - 10 }
}
