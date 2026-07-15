import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { computeLayout } from '#/core/layout/index.ts'
import {
  fixtureUniverse,
  makeCell,
  makeEntity,
  makeResult,
} from '#/core/layout/fixtures.test-helper.ts'
import type { Cell, CellKind } from '#/core/set-model/types.ts'

/**
 * Property: for ANY membership structure (relations derived from cells,
 * hence consistent by construction) the layout engine terminates, emits
 * finite geometry and is deterministic.
 */

const domainIds = fixtureUniverse.domains.map((domain) => domain.id)
const plainKinds: Array<CellKind> = [
  'domain-full',
  'literal',
  'refinement-exclusive',
  'refinement-overlap',
  'unknown-overlap',
]

const sceneArbitrary = fc
  .record({
    entityCount: fc.integer({ min: 1, max: 4 }),
    cellSeeds: fc.array(
      fc.record({
        domainIndex: fc.nat({ max: domainIds.length - 1 }),
        kindIndex: fc.nat({ max: plainKinds.length - 1 }),
        memberMask: fc.integer({ min: 1, max: 15 }),
      }),
      { minLength: 1, maxLength: 6 },
    ),
  })
  .map(({ entityCount, cellSeeds }) => {
    const entities = Array.from({ length: entityCount }, (_, index) =>
      makeEntity(`e${index}`),
    )
    const cells: Array<Cell> = cellSeeds.map((seed, index) => {
      const members = entities
        .filter((_, entityIndex) => (seed.memberMask >> entityIndex) & 1)
        .map((entity) => entity.id)
      const domain = domainIds[seed.domainIndex]
      const subzone = domain === 'object' ? 'plain' : undefined
      return makeCell(
        `c${index}`,
        domain,
        plainKinds[seed.kindIndex],
        members.length > 0 ? members : [entities[0].id],
        subzone,
      )
    })
    return { entities, cells }
  })

describe('computeLayout properties', () => {
  it('never throws, never yields NaN, and is deterministic', () => {
    fc.assert(
      fc.property(sceneArbitrary, ({ entities, cells }) => {
        const input = {
          universe: fixtureUniverse,
          result: makeResult(entities, cells),
          viewport: { width: 1200, height: 800 },
        }
        const first = computeLayout(input)
        const second = computeLayout(input)

        expect(second).toEqual(first)
        expect(JSON.stringify(first).includes('NaN')).toBe(false)
        for (const contour of first.contours) {
          expect(contour.svgPath.length).toBeGreaterThan(0)
          expect(contour.outline.length).toBeGreaterThan(2)
          for (const point of contour.outline) {
            expect(Number.isFinite(point.x)).toBe(true)
            expect(Number.isFinite(point.y)).toBe(true)
          }
        }
      }),
      { numRuns: 25 },
    )
  })
})
