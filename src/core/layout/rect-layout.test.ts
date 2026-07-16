import { describe, expect, test } from 'vitest'
import { CANVAS_PAD, CELL_GAP } from '#/core/layout/constants.ts'
import { computeRectLayout, gridDimensions } from '#/core/layout/rect-layout.ts'
import type { Box, EntityRect } from '#/core/layout/types.ts'
import type {
  PairRelation,
  RelationKind,
  SpecialRole,
  TypeEntity,
} from '#/core/set-model/types.ts'

const VIEWPORT = { width: 1200, height: 800 }
const EPSILON = 1e-6

function entity(id: string, special: SpecialRole = 'none'): TypeEntity {
  return {
    id,
    name: id,
    typeText: id,
    special,
    origin: 'code',
    declarationSpan: null,
  }
}

function rel(a: string, kind: RelationKind, b: string): PairRelation {
  return { a, b, kind }
}

function layoutOf(
  entities: Array<TypeEntity>,
  relations: Array<PairRelation> = [],
) {
  return computeRectLayout({ entities, relations, viewport: VIEWPORT })
}

function rectOf(rects: Array<EntityRect>, id: string): EntityRect {
  const found = rects.find((rect) => rect.entityIds.includes(id))
  expect(found, `rect for ${id}`).toBeDefined()
  return found as EntityRect
}

function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
  )
}

function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    b.x < a.x + a.width - EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    b.y < a.y + a.height - EPSILON
  )
}

describe('gridDimensions', () => {
  test('rounds odd counts up to even and factors with cols >= rows', () => {
    expect(gridDimensions(1)).toEqual({ cols: 1, rows: 1 })
    expect(gridDimensions(2)).toEqual({ cols: 2, rows: 1 })
    expect(gridDimensions(3)).toEqual({ cols: 2, rows: 2 })
    expect(gridDimensions(4)).toEqual({ cols: 2, rows: 2 })
    expect(gridDimensions(5)).toEqual({ cols: 3, rows: 2 })
    expect(gridDimensions(6)).toEqual({ cols: 3, rows: 2 })
    expect(gridDimensions(8)).toEqual({ cols: 4, rows: 2 })
    expect(gridDimensions(10)).toEqual({ cols: 5, rows: 2 })
    expect(gridDimensions(12)).toEqual({ cols: 4, rows: 3 })
    expect(gridDimensions(14)).toEqual({ cols: 7, rows: 2 })
    expect(gridDimensions(16)).toEqual({ cols: 4, rows: 4 })
  })
})

describe('computeRectLayout', () => {
  test('empty input renders an empty canvas', () => {
    const layout = layoutOf([])
    expect(layout.rects).toEqual([])
    expect(layout.warnings).toEqual([])
  })

  test('a single entity fills the whole canvas region', () => {
    const layout = layoutOf([entity('A')])
    expect(layout.rects).toHaveLength(1)
    expect(layout.rects[0].outer).toEqual({
      x: CANVAS_PAD,
      y: CANVAS_PAD,
      width: VIEWPORT.width - CANVAS_PAD * 2,
      height: VIEWPORT.height - CANVAS_PAD * 2,
    })
    expect(layout.rects[0].depth).toBe(1)
  })

  test('two unrelated entities split the canvas in half', () => {
    const layout = layoutOf(
      [entity('A'), entity('B')],
      [rel('A', 'unrelated', 'B')],
    )
    const a = rectOf(layout.rects, 'A')
    const b = rectOf(layout.rects, 'B')
    const expectedWidth = (VIEWPORT.width - CANVAS_PAD * 2 - CELL_GAP) / 2
    expect(a.outer.width).toBeCloseTo(expectedWidth)
    expect(b.outer.width).toBeCloseTo(expectedWidth)
    expect(a.outer.height).toBeCloseTo(VIEWPORT.height - CANVAS_PAD * 2)
    expect(b.outer.x).toBeGreaterThan(a.outer.x)
    expect(boxesOverlap(a.outer, b.outer)).toBe(false)
  })

  test('three unrelated entities use a 2x2 grid with one empty cell', () => {
    const layout = layoutOf(
      [entity('A'), entity('B'), entity('C')],
      [
        rel('A', 'unrelated', 'B'),
        rel('A', 'unrelated', 'C'),
        rel('B', 'unrelated', 'C'),
      ],
    )
    expect(layout.rects).toHaveLength(3)
    const widths = new Set(
      layout.rects.map((rect) => Math.round(rect.outer.width)),
    )
    const heights = new Set(
      layout.rects.map((rect) => Math.round(rect.outer.height)),
    )
    expect(widths.size).toBe(1)
    expect(heights.size).toBe(1)
    const a = rectOf(layout.rects, 'A')
    const c = rectOf(layout.rects, 'C')
    // Row-major: C sits on the second row.
    expect(c.outer.y).toBeGreaterThan(a.outer.y)
  })

  test('six unrelated entities use a 3x2 grid', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F']
    const relations: Array<PairRelation> = []
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        relations.push(rel(ids[i], 'unrelated', ids[j]))
      }
    }
    const layout = layoutOf(
      ids.map((id) => entity(id)),
      relations,
    )
    expect(layout.rects).toHaveLength(6)
    const xs = new Set(layout.rects.map((rect) => Math.round(rect.outer.x)))
    const ys = new Set(layout.rects.map((rect) => Math.round(rect.outer.y)))
    expect(xs.size).toBe(3)
    expect(ys.size).toBe(2)
  })

  test('a contained entity takes half of its container content box', () => {
    const layout = layoutOf(
      [entity('A'), entity('B')],
      [rel('B', 'subset', 'A')],
    )
    const a = rectOf(layout.rects, 'A')
    const b = rectOf(layout.rects, 'B')
    expect(b.depth).toBe(2)
    expect(boxContains(a.contentBox, b.outer)).toBe(true)
    // slots = 1 child + 1 "other" = 2 → 2x1 grid → half the content width.
    expect(b.outer.width).toBeCloseTo((a.contentBox.width - CELL_GAP) / 2)
    expect(b.outer.height).toBeCloseTo(a.contentBox.height)
  })

  test('A ⊃ {B, C} lays children on a 2x2 grid (2 cells + other + empty)', () => {
    const layout = layoutOf(
      [entity('A'), entity('B'), entity('C')],
      [
        rel('B', 'subset', 'A'),
        rel('C', 'subset', 'A'),
        rel('B', 'unrelated', 'C'),
      ],
    )
    const a = rectOf(layout.rects, 'A')
    const b = rectOf(layout.rects, 'B')
    const c = rectOf(layout.rects, 'C')
    expect(boxContains(a.contentBox, b.outer)).toBe(true)
    expect(boxContains(a.contentBox, c.outer)).toBe(true)
    expect(b.outer.width).toBeCloseTo((a.contentBox.width - CELL_GAP) / 2)
    expect(b.outer.height).toBeCloseTo((a.contentBox.height - CELL_GAP) / 2)
    expect(boxesOverlap(b.outer, c.outer)).toBe(false)
  })

  test('equivalent entities merge into one rect with stacked rings', () => {
    const layout = layoutOf(
      [entity('A'), entity('B')],
      [rel('A', 'equivalent', 'B')],
    )
    expect(layout.rects).toHaveLength(1)
    expect(layout.rects[0].entityIds).toEqual(['A', 'B'])
    expect(layout.rects[0].labels).toEqual(['A', 'B'])
    expect(layout.rects[0].ringCount).toBe(2)
  })

  test('a chain nests with increasing depth', () => {
    const layout = layoutOf(
      [entity('A'), entity('B'), entity('C')],
      [
        rel('B', 'subset', 'A'),
        rel('C', 'subset', 'B'),
        rel('C', 'subset', 'A'),
      ],
    )
    const a = rectOf(layout.rects, 'A')
    const b = rectOf(layout.rects, 'B')
    const c = rectOf(layout.rects, 'C')
    expect([a.depth, b.depth, c.depth]).toEqual([1, 2, 3])
    expect(boxContains(a.contentBox, b.outer)).toBe(true)
    expect(boxContains(b.contentBox, c.outer)).toBe(true)
  })

  test('a displayed universe adds the implicit "other" slot at top level', () => {
    const layout = layoutOf(
      [entity('U', 'universe'), entity('A')],
      [rel('A', 'subset', 'U')],
    )
    expect(layout.universeIds).toEqual(['U'])
    const a = rectOf(layout.rects, 'A')
    // slots = 1 top-level class + 1 other = 2 → half the canvas.
    expect(a.outer.width).toBeCloseTo(
      (VIEWPORT.width - CANVAS_PAD * 2 - CELL_GAP) / 2,
    )
  })

  test('never and any entities never become rectangles', () => {
    const layout = layoutOf(
      [entity('N', 'empty'), entity('X', 'outside-set-theory'), entity('A')],
      [],
    )
    expect(layout.emptyIds).toEqual(['N'])
    expect(layout.rects).toHaveLength(1)
    expect(layout.rects[0].entityIds).toEqual(['A'])
  })

  test('relation order does not change the output', () => {
    const entities = [entity('A'), entity('B'), entity('C'), entity('D')]
    const relations = [
      rel('B', 'subset', 'A'),
      rel('C', 'subset', 'A'),
      rel('B', 'unrelated', 'C'),
      rel('A', 'unrelated', 'D'),
      rel('B', 'unrelated', 'D'),
      rel('C', 'unrelated', 'D'),
    ]
    const forward = computeRectLayout({
      entities,
      relations,
      viewport: VIEWPORT,
    })
    const reversed = computeRectLayout({
      entities,
      relations: [...relations].reverse(),
      viewport: VIEWPORT,
    })
    expect(reversed).toEqual(forward)
  })

  test('draw order lists parents strictly before children', () => {
    const layout = layoutOf(
      [entity('A'), entity('B'), entity('C')],
      [
        rel('B', 'subset', 'A'),
        rel('C', 'subset', 'B'),
        rel('C', 'subset', 'A'),
      ],
    )
    const indexOf = (id: string) =>
      layout.rects.findIndex((rect) => rect.entityIds.includes(id))
    expect(indexOf('A')).toBeLessThan(indexOf('B'))
    expect(indexOf('B')).toBeLessThan(indexOf('C'))
  })

  test('containment cycles are broken with a warning instead of dropping rects', () => {
    // A malformed matrix no analyzer should produce — the layout still
    // renders every entity and says what it did.
    const layout = layoutOf(
      [entity('A'), entity('B')],
      [rel('A', 'subset', 'B'), rel('B', 'subset', 'A')],
    )
    expect(layout.rects.length).toBeGreaterThanOrEqual(1)
    expect(layout.warnings.some((w) => w.includes('cycle'))).toBe(true)
  })
})
