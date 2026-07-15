import { describe, expect, it } from 'vitest'
import { PointPath } from 'bubblesets-js'
import { computeLayout } from '#/core/layout/index.ts'
import {
  fixtureUniverse,
  makeCell,
  makeEntity,
  makeResult,
} from '#/core/layout/fixtures.test-helper.ts'
import type {
  DomainFrame,
  EntityContour,
  LayoutResult,
  Shape,
} from '#/core/layout/types.ts'

const viewport = { width: 1200, height: 800 }

function layoutOf(
  entities: Parameters<typeof makeResult>[0],
  cells: Parameters<typeof makeResult>[1],
): LayoutResult {
  return computeLayout({
    universe: fixtureUniverse,
    result: makeResult(entities, cells),
    viewport,
  })
}

function frameCenter(frame: DomainFrame): { x: number; y: number } {
  if (frame.shape.kind === 'circle') {
    return { x: frame.shape.cx, y: frame.shape.cy }
  }
  return {
    x: frame.shape.x + frame.shape.width / 2,
    y: frame.shape.y + frame.shape.height / 2,
  }
}

function encloses(contour: EntityContour, x: number, y: number): boolean {
  return new PointPath(contour.outline, true).withinArea(x, y)
}

function shapeWithinFrame(shape: Shape, frame: DomainFrame): boolean {
  const bounds =
    frame.shape.kind === 'circle'
      ? {
          x: frame.shape.cx - frame.shape.radius,
          y: frame.shape.cy - frame.shape.radius,
          width: frame.shape.radius * 2,
          height: frame.shape.radius * 2,
        }
      : frame.shape
  const center =
    shape.kind === 'circle'
      ? { x: shape.cx, y: shape.cy }
      : { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
  return (
    center.x >= bounds.x &&
    center.x <= bounds.x + bounds.width &&
    center.y >= bounds.y &&
    center.y <= bounds.y + bounds.height
  )
}

function expectNoNaN(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized.includes('null,null')).toBe(false)
  expect(serialized.includes('NaN')).toBe(false)
}

describe('computeLayout basemap', () => {
  it('produces one frame per domain, all inside the universe frame', () => {
    const layout = layoutOf([], [])
    expect(layout.frames.map((frame) => frame.id).sort()).toEqual(
      fixtureUniverse.domains.map((domain) => domain.id).sort(),
    )
    for (const frame of layout.frames) {
      expect(
        shapeWithinFrame(frame.shape, {
          ...frame,
          shape: layout.universeFrame,
        }),
      ).toBe(true)
    }
    expectNoNaN(layout)
  })

  it('keeps domain frames disjoint from each other', () => {
    const layout = layoutOf([], [])
    const boxes = layout.frames.map((frame) => {
      const shape = frame.shape
      return shape.kind === 'circle'
        ? {
            x: shape.cx - shape.radius,
            y: shape.cy - shape.radius,
            width: shape.radius * 2,
            height: shape.radius * 2,
          }
        : shape
    })
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        const separated =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        expect(separated).toBe(true)
      }
    }
  })

  it('is deterministic', () => {
    const first = layoutOf([], [])
    const second = layoutOf([], [])
    expect(second).toEqual(first)
  })
})

describe('computeLayout contours', () => {
  it('draws a single-domain entity and keeps foreign domains outside', () => {
    const entities = [makeEntity('A')]
    const cells = [makeCell('c-string', 'string', 'domain-full', ['A'])]
    const layout = layoutOf(entities, cells)

    expect(layout.contours).toHaveLength(1)
    const contour = layout.contours[0]
    expect(contour.svgPath.startsWith('M')).toBe(true)
    expect(contour.svgPath.trimEnd().endsWith('Z')).toBe(true)

    const stringFrame = layout.frames.find((frame) => frame.id === 'string')
    const numberFrame = layout.frames.find((frame) => frame.id === 'number')
    expect(stringFrame && numberFrame).toBeTruthy()
    if (!stringFrame || !numberFrame) return
    const inside = frameCenter(stringFrame)
    const outside = frameCenter(numberFrame)
    expect(encloses(contour, inside.x, inside.y)).toBe(true)
    expect(encloses(contour, outside.x, outside.y)).toBe(false)
    expectNoNaN(layout)
  })

  it('nests a subset contour inside its superset (A ⊂ B)', () => {
    const entities = [makeEntity('A'), makeEntity('B')]
    const cells = [
      makeCell('c-string', 'string', 'domain-full', ['A', 'B']),
      makeCell('c-number', 'number', 'domain-full', ['B']),
    ]
    const layout = layoutOf(entities, cells)
    expect(layout.contours).toHaveLength(2)
    expect(layout.warnings).toEqual([])

    const contourB = layout.contours.find((contour) =>
      contour.labels.includes('B'),
    )
    const contourA = layout.contours.find((contour) =>
      contour.labels.includes('A'),
    )
    expect(contourA && contourB).toBeTruthy()
    if (!contourA || !contourB) return

    // Draw order: the bigger set comes first (painted underneath).
    expect(layout.contours[0].labels).toContain('B')

    const stringFrame = layout.frames.find((frame) => frame.id === 'string')
    const numberFrame = layout.frames.find((frame) => frame.id === 'number')
    if (!stringFrame || !numberFrame) return
    const stringCenter = frameCenter(stringFrame)
    const numberCenter = frameCenter(numberFrame)

    expect(encloses(contourB, stringCenter.x, stringCenter.y)).toBe(true)
    expect(encloses(contourB, numberCenter.x, numberCenter.y)).toBe(true)
    expect(encloses(contourA, stringCenter.x, stringCenter.y)).toBe(true)
    expect(encloses(contourA, numberCenter.x, numberCenter.y)).toBe(false)
  })

  it('keeps disjoint entities from visually intersecting', () => {
    const entities = [makeEntity('A'), makeEntity('B')]
    const cells = [
      makeCell('c-string', 'string', 'domain-full', ['A']),
      makeCell('c-number', 'number', 'domain-full', ['B']),
    ]
    const layout = layoutOf(entities, cells)
    expect(layout.contours).toHaveLength(2)

    const contourA = layout.contours.find((contour) =>
      contour.labels.includes('A'),
    )
    const contourB = layout.contours.find((contour) =>
      contour.labels.includes('B'),
    )
    if (!contourA || !contourB) return

    const stringFrame = layout.frames.find((frame) => frame.id === 'string')
    const numberFrame = layout.frames.find((frame) => frame.id === 'number')
    if (!stringFrame || !numberFrame) return

    const stringCenter = frameCenter(stringFrame)
    const numberCenter = frameCenter(numberFrame)
    expect(encloses(contourA, numberCenter.x, numberCenter.y)).toBe(false)
    expect(encloses(contourB, stringCenter.x, stringCenter.y)).toBe(false)
  })

  it('draws literals as small anchors inside their domain', () => {
    const entities = [makeEntity('Foo'), makeEntity('Str')]
    const cells = [
      makeCell('c-lit-foo', 'string', 'literal', ['Foo', 'Str'], undefined),
      makeCell('c-string', 'string', 'refinement-exclusive', ['Str']),
    ]
    const layout = layoutOf(entities, cells)

    const literal = layout.anchors.find(
      (anchor) => anchor.cellId === 'c-lit-foo',
    )
    const refinement = layout.anchors.find(
      (anchor) => anchor.cellId === 'c-string',
    )
    expect(literal?.shape.kind).toBe('circle')
    expect(refinement?.shape.kind).toBe('circle')
    if (
      literal?.shape.kind === 'circle' &&
      refinement?.shape.kind === 'circle'
    ) {
      expect(literal.shape.radius).toBeLessThan(refinement.shape.radius)
    }

    const stringFrame = layout.frames.find((frame) => frame.id === 'string')
    if (!stringFrame || !literal) return
    expect(shapeWithinFrame(literal.shape, stringFrame)).toBe(true)
  })

  it('merges equivalent entities into one multi-label contour', () => {
    const entities = [makeEntity('A'), makeEntity('B')]
    const cells = [makeCell('c-string', 'string', 'domain-full', ['A', 'B'])]
    const layout = layoutOf(entities, cells)
    expect(layout.contours).toHaveLength(1)
    expect(layout.contours[0].labels.sort()).toEqual(['A', 'B'])
  })

  it('excludes universe/empty/outside entities from contours', () => {
    const entities = [
      makeEntity('U', 'universe'),
      makeEntity('N', 'empty'),
      makeEntity('Any', 'outside-set-theory'),
      makeEntity('A'),
    ]
    const cells = [makeCell('c-string', 'string', 'domain-full', ['A'])]
    const layout = layoutOf(entities, cells)
    expect(layout.contours).toHaveLength(1)
    expect(layout.contours[0].labels).toEqual(['A'])
    expect(layout.universeEntityIds).toEqual(['U'])
    expect(layout.emptyEntityIds).toEqual(['N'])
  })

  it('places overlap anchors between their parent refinements', () => {
    const entities = [makeEntity('A'), makeEntity('B')]
    const cells = [
      makeCell('c-a', 'object', 'refinement-exclusive', ['A'], 'plain'),
      makeCell('c-b', 'object', 'refinement-exclusive', ['B'], 'plain'),
      makeCell('c-ab', 'object', 'refinement-overlap', ['A', 'B'], 'plain'),
    ]
    const layout = layoutOf(entities, cells)

    const anchorA = layout.anchors.find((anchor) => anchor.cellId === 'c-a')
    const anchorB = layout.anchors.find((anchor) => anchor.cellId === 'c-b')
    const anchorAB = layout.anchors.find((anchor) => anchor.cellId === 'c-ab')
    expect(anchorA && anchorB && anchorAB).toBeTruthy()
    if (
      anchorA?.shape.kind !== 'circle' ||
      anchorB?.shape.kind !== 'circle' ||
      anchorAB?.shape.kind !== 'circle'
    ) {
      throw new Error('expected circle anchors')
    }
    expect(anchorAB.shape.cx).toBeCloseTo(
      (anchorA.shape.cx + anchorB.shape.cx) / 2,
      5,
    )
    expect(anchorAB.shape.cy).toBeCloseTo(
      (anchorA.shape.cy + anchorB.shape.cy) / 2,
      5,
    )

    // Both contours must enclose the shared overlap anchor.
    const contourA = layout.contours.find((contour) =>
      contour.labels.includes('A'),
    )
    const contourB = layout.contours.find((contour) =>
      contour.labels.includes('B'),
    )
    if (!contourA || !contourB) return
    expect(encloses(contourA, anchorAB.shape.cx, anchorAB.shape.cy)).toBe(true)
    expect(encloses(contourB, anchorAB.shape.cx, anchorAB.shape.cy)).toBe(true)
  })

  it('flags unknown overlaps as uncertain anchors', () => {
    const entities = [makeEntity('A'), makeEntity('B')]
    const cells = [
      makeCell('c-a', 'object', 'refinement-exclusive', ['A'], 'plain'),
      makeCell('c-b', 'object', 'refinement-exclusive', ['B'], 'plain'),
      makeCell('c-ab', 'object', 'unknown-overlap', ['A', 'B'], 'plain'),
    ]
    const layout = layoutOf(entities, cells)
    const anchorAB = layout.anchors.find((anchor) => anchor.cellId === 'c-ab')
    expect(anchorAB?.uncertain).toBe(true)
  })

  it('spans a cross-domain union through both domains', () => {
    const entities = [makeEntity('U')]
    const cells = [
      makeCell('c-string', 'string', 'domain-full', ['U']),
      makeCell('c-number', 'number', 'domain-full', ['U']),
    ]
    const layout = layoutOf(entities, cells)
    expect(layout.contours).toHaveLength(1)
    const contour = layout.contours[0]

    const stringFrame = layout.frames.find((frame) => frame.id === 'string')
    const numberFrame = layout.frames.find((frame) => frame.id === 'number')
    const bigintFrame = layout.frames.find((frame) => frame.id === 'bigint')
    if (!stringFrame || !numberFrame || !bigintFrame) return

    const stringCenter = frameCenter(stringFrame)
    const numberCenter = frameCenter(numberFrame)
    const bigintCenter = frameCenter(bigintFrame)
    expect(encloses(contour, stringCenter.x, stringCenter.y)).toBe(true)
    expect(encloses(contour, numberCenter.x, numberCenter.y)).toBe(true)
    expect(encloses(contour, bigintCenter.x, bigintCenter.y)).toBe(false)
  })

  it('is deterministic for a non-trivial scene', () => {
    const entities = [makeEntity('A'), makeEntity('B'), makeEntity('C')]
    const cells = [
      makeCell('c-string', 'string', 'domain-full', ['A', 'B']),
      makeCell('c-number', 'number', 'domain-full', ['B']),
      makeCell('c-lit', 'string', 'literal', ['A', 'B']),
      makeCell('c-obj', 'object', 'refinement-exclusive', ['C'], 'plain'),
    ]
    const first = layoutOf(entities, cells)
    const second = layoutOf(entities, cells)
    expect(second).toEqual(first)
    expectNoNaN(first)
  })
})
