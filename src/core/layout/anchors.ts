import type { Cell } from '#/core/set-model/types.ts'
import type { Basemap } from '#/core/layout/basemap.ts'
import type {
  CellAnchor,
  CircleShape,
  RectShape,
  Shape,
} from '#/core/layout/types.ts'

/**
 * Places every IR cell on the basemap, deterministically.
 *
 * Placement contract (the anti-phantom-intersection invariant, layout
 * side): cells shared by several entities are the ONLY places where
 * their contours may meet, so
 * - `refinement-overlap` / `unknown-overlap` anchors sit between the
 *   exclusive anchors of the refinements they join,
 * - every other anchor keeps its own grid slot inside its region.
 */

const LABEL_STRIP = 26

interface Region {
  x: number
  y: number
  width: number
  height: number
}

export function placeAnchors(
  basemap: Basemap,
  cells: Array<Cell>,
  minDim: number,
): Array<CellAnchor> {
  const literalRadius = clamp(minDim * 0.016, 6, 11)
  const refinementRadius = clamp(minDim * 0.05, 18, 42)

  const anchors: Array<CellAnchor> = []
  const groups = groupByRegion(cells)

  for (const [regionKey, groupCells] of groups) {
    const region = resolveRegion(basemap, regionKey)
    if (!region) continue

    const sorted = [...groupCells].sort(compareCells)
    const fullCells = sorted.filter((cell) => cell.kind === 'domain-full')
    const overlapCells = sorted.filter(
      (cell) =>
        cell.kind === 'refinement-overlap' || cell.kind === 'unknown-overlap',
    )
    const slotCells = sorted.filter(
      (cell) => cell.kind !== 'domain-full' && !overlapCells.includes(cell),
    )

    // Whole-domain cells cover the region interior itself.
    for (const cell of fullCells) {
      anchors.push({
        cellId: cell.id,
        domain: cell.domain,
        subzone: cell.subzone,
        cellKind: cell.kind,
        uncertain: false,
        label: cell.label,
        shape: interiorRect(region),
      })
    }

    // Grid slots for refinements and literals.
    const placed = new Map<string, Shape>()
    const slots = gridSlots(region, slotCells.length)
    slotCells.forEach((cell, index) => {
      const radius = cell.kind === 'literal' ? literalRadius : refinementRadius
      const slot = slots[index]
      const shape: CircleShape = {
        kind: 'circle',
        cx: slot.x,
        cy: slot.y,
        radius: fitRadius(radius, region, slotCells.length),
      }
      placed.set(cell.id, shape)
      anchors.push({
        cellId: cell.id,
        domain: cell.domain,
        subzone: cell.subzone,
        cellKind: cell.kind,
        uncertain: false,
        label: cell.label,
        shape,
      })
    })

    // Overlap cells: midpoint between the two closest parent anchors —
    // parents are the exclusive cells whose member set is a subset of
    // the overlap's member set (overlap ⊆ both refinements).
    overlapCells.forEach((cell, index) => {
      const memberSet = new Set(cell.members)
      const parents = slotCells.filter(
        (candidate) =>
          candidate.kind === 'refinement-exclusive' &&
          candidate.members.some((member) => memberSet.has(member)),
      )
      const first = parents.at(0)
      const second = parents.at(1)
      let shape: CircleShape
      if (first && second) {
        const shapeA = placed.get(first.id) as CircleShape
        const shapeB = placed.get(second.id) as CircleShape
        shape = {
          kind: 'circle',
          cx: (shapeA.cx + shapeB.cx) / 2,
          cy: (shapeA.cy + shapeB.cy) / 2,
          radius: fitRadius(refinementRadius * 0.62, region, slotCells.length),
        }
      } else {
        // No identifiable parents — fall back to a deterministic slot.
        const fallback = gridSlots(region, overlapCells.length)[index]
        shape = {
          kind: 'circle',
          cx: fallback.x,
          cy: fallback.y,
          radius: fitRadius(refinementRadius * 0.62, region, slotCells.length),
        }
      }
      anchors.push({
        cellId: cell.id,
        domain: cell.domain,
        subzone: cell.subzone,
        cellKind: cell.kind,
        uncertain: cell.kind === 'unknown-overlap',
        label: cell.label,
        shape,
      })
    })
  }

  return anchors
}

function compareCells(a: Cell, b: Cell): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function groupByRegion(cells: Array<Cell>): Map<string, Array<Cell>> {
  const groups = new Map<string, Array<Cell>>()
  for (const cell of cells) {
    const key = `${cell.domain}::${cell.subzone ?? ''}`
    const group = groups.get(key)
    if (group) {
      group.push(cell)
    } else {
      groups.set(key, [cell])
    }
  }
  return groups
}

function resolveRegion(basemap: Basemap, regionKey: string): Region | null {
  const [domainId, subzoneId] = regionKey.split('::')
  const frame = basemap.frames.find((candidate) => candidate.id === domainId)
  if (!frame) return null

  if (subzoneId) {
    const subzone = frame.subzones.find(
      (candidate) => candidate.id === subzoneId,
    )
    if (subzone) return innerRegion(subzone.shape)
  }

  if (frame.shape.kind === 'circle') {
    const { cx, cy, radius } = frame.shape
    const half = radius / Math.SQRT2
    return { x: cx - half, y: cy - half, width: half * 2, height: half * 2 }
  }
  return innerRegion(frame.shape)
}

function innerRegion(shape: RectShape): Region {
  const padX = Math.max(8, shape.width * 0.08)
  const padTop = LABEL_STRIP
  const padBottom = Math.max(8, shape.height * 0.08)
  return {
    x: shape.x + padX,
    y: shape.y + padTop,
    width: shape.width - padX * 2,
    height: shape.height - padTop - padBottom,
  }
}

function interiorRect(region: Region): RectShape {
  return {
    kind: 'rect',
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    rx: 8,
  }
}

/** Deterministic grid positions inside a region, row-major. */
function gridSlots(
  region: Region,
  count: number,
): Array<{ x: number; y: number }> {
  if (count <= 0) return []
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const slots: Array<{ x: number; y: number }> = []
  for (let index = 0; index < count; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    slots.push({
      x: region.x + ((column + 0.5) / columns) * region.width,
      y: region.y + ((row + 0.5) / rows) * region.height,
    })
  }
  return slots
}

/** Keeps anchors from outgrowing crowded regions. */
function fitRadius(radius: number, region: Region, count: number): number {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)))
  const slotWidth = region.width / columns
  const slotHeight = region.height / Math.max(1, Math.ceil(count / columns))
  const maxRadius = Math.max(6, Math.min(slotWidth, slotHeight) * 0.42)
  return Math.min(radius, maxRadius)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
