import type { SetUniverse } from '#/core/set-model/types.ts'
import type {
  DomainFrame,
  RectShape,
  Shape,
  SubzoneFrame,
  Viewport,
} from '#/core/layout/types.ts'

/**
 * Deterministic basemap geometry: the fixed "world map" of a language
 * universe. Only depends on the universe structure and the viewport —
 * user code never moves the basemap, which keeps the diagram readable
 * while typing.
 *
 * Composition (fractions of the interior area):
 * - the whole canvas (minus margin) is the universe frame (`unknown`)
 * - top row: infinite primitive domains side by side
 * - bottom left: unit domains (`null`, `undefined`) as small circles
 * - bottom right: the compound domain (`object`) with its subzones
 */

export const MIN_VIEWPORT = { width: 640, height: 480 } as const

/** Relative widths of the top-row primitive domains, in declaration order. */
const TOP_ROW_WEIGHTS: Record<string, number> = {
  string: 1.35,
  number: 1.35,
  bigint: 0.85,
  boolean: 1,
  symbol: 0.85,
}

const LABEL_STRIP = 26

export interface Basemap {
  universeFrame: RectShape
  frames: Array<DomainFrame>
}

export function clampViewport(viewport: Viewport): Viewport {
  return {
    width: Math.max(viewport.width, MIN_VIEWPORT.width),
    height: Math.max(viewport.height, MIN_VIEWPORT.height),
  }
}

export function computeBasemap(
  universe: SetUniverse,
  rawViewport: Viewport,
): Basemap {
  const viewport = clampViewport(rawViewport)
  const minDim = Math.min(viewport.width, viewport.height)
  const margin = Math.round(minDim * 0.035)

  const universeFrame: RectShape = {
    kind: 'rect',
    x: margin,
    y: margin,
    width: viewport.width - margin * 2,
    height: viewport.height - margin * 2,
    rx: Math.round(minDim * 0.045),
  }

  // Interior: universe frame minus padding and its own label strip.
  const pad = Math.round(minDim * 0.03)
  const interior = {
    x: universeFrame.x + pad,
    y: universeFrame.y + pad + LABEL_STRIP,
    width: universeFrame.width - pad * 2,
    height: universeFrame.height - pad * 2 - LABEL_STRIP,
  }

  const gapX = Math.round(interior.width * 0.02)
  const gapY = Math.round(interior.height * 0.05)

  const topRow = universe.domains.filter(
    (domain) => domain.cardinality === 'infinite' && !domain.subzones,
  )
  const unitDomains = universe.domains.filter(
    (domain) => domain.cardinality === 'unit',
  )
  const compoundDomains = universe.domains.filter((domain) =>
    Boolean(domain.subzones),
  )

  const frames: Array<DomainFrame> = []

  // --- Top row: primitive domains ---------------------------------------
  const topHeight = Math.round(interior.height * 0.37)
  const weights = topRow.map((domain) => TOP_ROW_WEIGHTS[domain.id] ?? 1)
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  const topInnerWidth = interior.width - gapX * (topRow.length - 1)
  let cursorX = interior.x
  topRow.forEach((domain, index) => {
    const width = Math.round((topInnerWidth * weights[index]) / weightSum)
    const shape: RectShape = {
      kind: 'rect',
      x: cursorX,
      y: interior.y,
      width,
      height: topHeight,
      rx: Math.round(minDim * 0.03),
    }
    frames.push({
      id: domain.id,
      label: domain.label,
      shape,
      labelPos: { x: shape.x + 12, y: shape.y + 18 },
      subzones: [],
    })
    cursorX += width + gapX
  })

  // --- Bottom area -------------------------------------------------------
  const bottomY = interior.y + topHeight + gapY
  const bottomHeight = interior.y + interior.height - bottomY

  // Unit domains: small circles stacked in a left column.
  const unitColWidth = Math.round(interior.width * 0.14)
  const unitRadius = Math.max(
    18,
    Math.min(
      Math.round(unitColWidth * 0.34),
      Math.floor(
        (bottomHeight - gapY * (unitDomains.length - 1)) /
          (unitDomains.length * 2 + 1),
      ),
    ),
  )
  unitDomains.forEach((domain, index) => {
    const cx = interior.x + Math.round(unitColWidth / 2)
    const slot = bottomHeight / Math.max(unitDomains.length, 1)
    const cy = Math.round(bottomY + slot * index + slot / 2)
    const shape: Shape = { kind: 'circle', cx, cy, radius: unitRadius }
    frames.push({
      id: domain.id,
      label: domain.label,
      shape,
      labelPos: { x: cx - unitRadius, y: cy - unitRadius - 8 },
      subzones: [],
    })
  })

  // Compound domain(s): the remaining bottom-right area, split evenly.
  const compoundX = interior.x + unitColWidth + gapX
  const compoundWidth = interior.x + interior.width - compoundX
  compoundDomains.forEach((domain, index) => {
    const slot = compoundWidth / compoundDomains.length
    const shape: RectShape = {
      kind: 'rect',
      x: Math.round(compoundX + slot * index + (index > 0 ? gapX / 2 : 0)),
      y: bottomY,
      width: Math.round(slot - (compoundDomains.length > 1 ? gapX / 2 : 0)),
      height: bottomHeight,
      rx: Math.round(minDim * 0.03),
    }
    const subzones: Array<SubzoneFrame> = []
    const zonePad = Math.round(minDim * 0.02)
    const zones = domain.subzones ?? []
    if (zones.length > 0) {
      const innerX = shape.x + zonePad
      const innerY = shape.y + zonePad + LABEL_STRIP
      const innerWidth = shape.width - zonePad * 2
      const innerHeight = shape.height - zonePad * 2 - LABEL_STRIP
      const zoneGap = Math.round(innerWidth * 0.03)
      const zoneWidth = Math.round(
        (innerWidth - zoneGap * (zones.length - 1)) / zones.length,
      )
      zones.forEach((zone, zoneIndex) => {
        const zoneShape: RectShape = {
          kind: 'rect',
          x: innerX + (zoneWidth + zoneGap) * zoneIndex,
          y: innerY,
          width: zoneWidth,
          height: innerHeight,
          rx: Math.round(minDim * 0.02),
        }
        subzones.push({
          id: zone.id,
          label: zone.label,
          shape: zoneShape,
          labelPos: { x: zoneShape.x + 10, y: zoneShape.y + 16 },
        })
      })
    }
    frames.push({
      id: domain.id,
      label: domain.label,
      shape,
      labelPos: { x: shape.x + 12, y: shape.y + 18 },
      subzones,
    })
  })

  return { universeFrame, frames }
}
