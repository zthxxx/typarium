import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { computeRectLayout } from './rect-layout.ts'
import type { EntityRect } from './types.ts'
import type { Box, PairRelation, TypeEntity } from '@typarium/set-model'

const EPSILON = 1e-6

/**
 * Random containment forests, encoded the way an analyzer would emit
 * them: full transitive ancestor matrix plus `unrelated` for the rest.
 * `parents[i]` is the parent index of node i (must be < i) or null.
 * Every node additionally gets a random `coveredBySubsets` flag — the
 * layout must stay valid whichever containers claim union coverage.
 */
const forestArbitrary = fc
  .record({
    raw: fc.array(fc.option(fc.nat(), { nil: null }), {
      minLength: 1,
      maxLength: 8,
    }),
    covered: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
  })
  .map(({ raw, covered }) => {
    const parents = raw.map((value, index) =>
      value === null || index === 0 ? null : value % index,
    )
    const ids = parents.map((_, index) => `T${index}`)
    const entities: Array<TypeEntity> = ids.map((id, index) => ({
      id,
      name: id,
      typeText: id,
      expandedText: id,
      special: 'none',
      origin: 'code',
      coveredBySubsets: covered[index] ?? false,
      declarationSpan: null,
    }))

    const ancestorsOf = (index: number): Array<number> => {
      const result: Array<number> = []
      let cursor = parents[index]
      while (cursor !== null) {
        result.push(cursor)
        cursor = parents[cursor]
      }
      return result
    }

    const relations: Array<PairRelation> = []
    for (let i = 0; i < ids.length; i += 1) {
      const ancestors = new Set(ancestorsOf(i))
      for (let j = 0; j < i; j += 1) {
        relations.push({
          a: ids[i],
          b: ids[j],
          kind: ancestors.has(j) ? 'subset' : 'unrelated',
        })
      }
    }
    return { entities, relations, parents }
  })

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

describe('computeRectLayout properties', () => {
  test('random forests lay out valid, deterministic geometry', () => {
    fc.assert(
      fc.property(forestArbitrary, ({ entities, relations, parents }) => {
        const viewport = { width: 1600, height: 1200 }
        const layout = computeRectLayout({ entities, relations, viewport })
        const again = computeRectLayout({ entities, relations, viewport })
        expect(again).toEqual(layout)

        const shuffled = computeRectLayout({
          entities,
          relations: [...relations].reverse(),
          viewport,
        })
        expect(shuffled).toEqual(layout)

        const byId = new Map<string, EntityRect>()
        layout.rects.forEach((rect) => {
          for (const id of rect.entityIds) byId.set(id, rect)
        })

        for (const rect of layout.rects) {
          for (const value of [
            rect.outer.x,
            rect.outer.y,
            rect.outer.width,
            rect.outer.height,
          ]) {
            expect(Number.isFinite(value)).toBe(true)
          }
          expect(rect.outer.x).toBeGreaterThanOrEqual(0)
          expect(rect.outer.y).toBeGreaterThanOrEqual(0)
          expect(rect.outer.x + rect.outer.width).toBeLessThanOrEqual(
            viewport.width + EPSILON,
          )
          expect(rect.outer.y + rect.outer.height).toBeLessThanOrEqual(
            viewport.height + EPSILON,
          )
        }

        // Emitted children sit inside their forest-parent's content box;
        // siblings sharing a parent never overlap (the generator builds
        // single-parent trees, so no overlap pairs arise here).
        entities.forEach((entity, index) => {
          const rect = byId.get(entity.id)
          const parentIndex = parents[index]
          if (!rect || parentIndex === null) return
          const parentRect = byId.get(`T${parentIndex}`)
          if (!parentRect || parentRect === rect) return
          expect(boxContains(parentRect.contentBox, rect.outer)).toBe(true)
          expect(layout.rects.indexOf(parentRect)).toBeLessThan(
            layout.rects.indexOf(rect),
          )
        })

        for (const rect of layout.rects) {
          for (const other of layout.rects) {
            if (rect === other || rect.depth !== other.depth) continue
            const related = boxContains(rect.outer, other.outer)
            if (!related) {
              expect(boxesOverlap(rect.outer, other.outer)).toBe(false)
            }
          }
        }
      }),
      { numRuns: 60 },
    )
  })
})
