import { describe, expect, test } from 'vitest'
import { CANVAS_PAD, CELL_GAP } from '@typarium/set-model'
import {
  computeRectLayout,
  exactGridDimensions,
  gridDimensions,
} from './rect-layout.ts'
import type { EntityRect } from './types.ts'
import type {
  Box,
  PairRelation,
  RelationKind,
  SpecialRole,
  TypeEntity,
} from '@typarium/set-model'

const VIEWPORT = { width: 1200, height: 800 }
const EPSILON = 1e-6

function entity(
  id: string,
  special: SpecialRole = 'none',
  coveredBySubsets = false,
): TypeEntity {
  return {
    id,
    name: id,
    typeText: id,
    expandedText: id,
    special,
    origin: 'code',
    coveredBySubsets,
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

function intersect(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    width: Math.min(a.x + a.width, b.x + b.width) - x,
    height: Math.min(a.y + a.height, b.y + b.height) - y,
  }
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

describe('exactGridDimensions', () => {
  test('keeps the exact count: odd numbers become a single row', () => {
    expect(exactGridDimensions(1)).toEqual({ cols: 1, rows: 1 })
    expect(exactGridDimensions(2)).toEqual({ cols: 2, rows: 1 })
    expect(exactGridDimensions(3)).toEqual({ cols: 3, rows: 1 })
    expect(exactGridDimensions(4)).toEqual({ cols: 2, rows: 2 })
    expect(exactGridDimensions(5)).toEqual({ cols: 5, rows: 1 })
    expect(exactGridDimensions(6)).toEqual({ cols: 3, rows: 2 })
    expect(exactGridDimensions(9)).toEqual({ cols: 3, rows: 3 })
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

  test('a contained entity takes half of its non-covered container', () => {
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

  test('non-covered A ⊃ {B, C} shows an explicit ??? block (3x1 grid)', () => {
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
    // Children plus the ??? block split the container exactly: 3 x 1.
    expect(b.outer.width).toBeCloseTo((a.contentBox.width - CELL_GAP * 2) / 3)
    expect(b.outer.height).toBeCloseTo(a.contentBox.height)
    const placeholder = layout.placeholders.find((candidate) =>
      boxContains(a.contentBox, candidate.box),
    )
    expect(placeholder).toBeDefined()
    expect(placeholder!.box.width).toBeCloseTo(b.outer.width)
    expect(boxesOverlap(b.outer, c.outer)).toBe(false)
  })

  test('covered container with two children fills as 2x1 with no spare cell', () => {
    // User case 1: C1=string, C2=number, C3=string|number ≡ C1 ∪ C2.
    const layout = layoutOf(
      [entity('C1'), entity('C2'), entity('C3', 'none', true)],
      [
        rel('C1', 'subset', 'C3'),
        rel('C2', 'subset', 'C3'),
        rel('C1', 'unrelated', 'C2'),
      ],
    )
    const c3 = rectOf(layout.rects, 'C3')
    const c1 = rectOf(layout.rects, 'C1')
    const c2 = rectOf(layout.rects, 'C2')
    // 2 children, covered → 2×1, each child takes exactly half.
    expect(c1.outer.width).toBeCloseTo((c3.contentBox.width - CELL_GAP) / 2)
    expect(c2.outer.width).toBeCloseTo((c3.contentBox.width - CELL_GAP) / 2)
    expect(c1.outer.height).toBeCloseTo(c3.contentBox.height)
    expect(c2.outer.height).toBeCloseTo(c3.contentBox.height)
    // Together with the gap they span the full content width: no hole.
    expect(c1.outer.width + c2.outer.width + CELL_GAP).toBeCloseTo(
      c3.contentBox.width,
    )
  })

  test('covered container with three children fills as 3x1, never 2x2', () => {
    // User case 2: C4 = string | number | boolean ≡ C1 ∪ C2 ∪ C3.
    const layout = layoutOf(
      [entity('C1'), entity('C2'), entity('C3'), entity('C4', 'none', true)],
      [
        rel('C1', 'subset', 'C4'),
        rel('C2', 'subset', 'C4'),
        rel('C3', 'subset', 'C4'),
        rel('C1', 'unrelated', 'C2'),
        rel('C1', 'unrelated', 'C3'),
        rel('C2', 'unrelated', 'C3'),
      ],
    )
    const c4 = rectOf(layout.rects, 'C4')
    const inner = ['C1', 'C2', 'C3'].map((id) => rectOf(layout.rects, id))
    // Single row: same y, three equal widths filling the content box.
    const ys = new Set(inner.map((rect) => Math.round(rect.outer.y)))
    expect(ys.size).toBe(1)
    const expected = (c4.contentBox.width - 2 * CELL_GAP) / 3
    for (const rect of inner) {
      expect(rect.outer.width).toBeCloseTo(expected)
      expect(rect.outer.height).toBeCloseTo(c4.contentBox.height)
    }
  })

  test('two-parent child renders in the overlap band of its parents', () => {
    // User case 3: C1=string, C2=string|number, C3=string|boolean.
    const layout = layoutOf(
      [entity('C1'), entity('C2'), entity('C3')],
      [
        rel('C1', 'subset', 'C2'),
        rel('C1', 'subset', 'C3'),
        rel('C2', 'unrelated', 'C3'),
      ],
    )
    const c1 = rectOf(layout.rects, 'C1')
    const c2 = rectOf(layout.rects, 'C2')
    const c3 = rectOf(layout.rects, 'C3')
    // Parents overlap horizontally...
    expect(c2.outer.x + c2.outer.width).toBeGreaterThan(c3.outer.x + EPSILON)
    expect(boxesOverlap(c2.outer, c3.outer)).toBe(true)
    // ...and the shared child sits inside BOTH parents' content boxes.
    expect(boxContains(c2.contentBox, c1.outer)).toBe(true)
    expect(boxContains(c3.contentBox, c1.outer)).toBe(true)
    const band = intersect(c2.contentBox, c3.contentBox)
    expect(boxContains(band, c1.outer)).toBe(true)
    // Draw order: both parents precede the shared child.
    const indexOf = (id: string) =>
      layout.rects.findIndex((rect) => rect.entityIds.includes(id))
    expect(indexOf('C2')).toBeLessThan(indexOf('C1'))
    expect(indexOf('C3')).toBeLessThan(indexOf('C1'))
  })

  test('overlap pair keeps exclusive children out of the band', () => {
    const layout = layoutOf(
      [entity('S'), entity('P'), entity('Q'), entity('PE'), entity('QE')],
      [
        rel('S', 'subset', 'P'),
        rel('S', 'subset', 'Q'),
        rel('P', 'unrelated', 'Q'),
        rel('PE', 'subset', 'P'),
        rel('QE', 'subset', 'Q'),
        rel('PE', 'unrelated', 'QE'),
        rel('PE', 'unrelated', 'S'),
        rel('QE', 'unrelated', 'S'),
        rel('PE', 'unrelated', 'Q'),
        rel('QE', 'unrelated', 'P'),
      ],
    )
    const p = rectOf(layout.rects, 'P')
    const q = rectOf(layout.rects, 'Q')
    const s = rectOf(layout.rects, 'S')
    const pe = rectOf(layout.rects, 'PE')
    const qe = rectOf(layout.rects, 'QE')
    const band = intersect(p.contentBox, q.contentBox)
    expect(boxContains(band, s.outer)).toBe(true)
    // Exclusive children stay inside exactly one parent, off the band.
    expect(boxContains(p.contentBox, pe.outer)).toBe(true)
    expect(boxesOverlap(pe.outer, q.outer)).toBe(false)
    expect(boxContains(q.contentBox, qe.outer)).toBe(true)
    expect(boxesOverlap(qe.outer, p.outer)).toBe(false)
  })

  test('three parents fall back to the earliest with a warning', () => {
    const layout = layoutOf(
      [entity('X'), entity('P1'), entity('P2'), entity('P3')],
      [
        rel('X', 'subset', 'P1'),
        rel('X', 'subset', 'P2'),
        rel('X', 'subset', 'P3'),
        rel('P1', 'unrelated', 'P2'),
        rel('P1', 'unrelated', 'P3'),
        rel('P2', 'unrelated', 'P3'),
      ],
    )
    expect(
      layout.warnings.some((warning) => warning.includes('3 parents')),
    ).toBe(true)
    const x = rectOf(layout.rects, 'X')
    const p1 = rectOf(layout.rects, 'P1')
    expect(boxContains(p1.contentBox, x.outer)).toBe(true)
    // The other two parents render as plain siblings.
    const p2 = rectOf(layout.rects, 'P2')
    expect(boxContains(p2.contentBox, x.outer)).toBe(false)
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

  test('a covered universe lets top-level classes fill the canvas', () => {
    const layout = layoutOf(
      [entity('U', 'universe', true), entity('A'), entity('B')],
      [
        rel('A', 'subset', 'U'),
        rel('B', 'subset', 'U'),
        rel('A', 'unrelated', 'B'),
      ],
    )
    const a = rectOf(layout.rects, 'A')
    const b = rectOf(layout.rects, 'B')
    // covered → 2 slots exactly, halves with no third cell.
    const canvasWidth = VIEWPORT.width - CANVAS_PAD * 2
    expect(a.outer.width + b.outer.width + CELL_GAP).toBeCloseTo(canvasWidth)
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
