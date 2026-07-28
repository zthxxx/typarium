import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { roughRectPath, roughSegments, wobbleSeed } from './wobble.ts'
import type { RoughRectOptions } from './wobble.ts'

describe('wobbleSeed', () => {
  test('is a pure function: equal content, equal seed', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        expect(wobbleSeed(content)).toBe(wobbleSeed(content))
      }),
    )
  })

  test('stays a bounded non-negative integer for any content', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const seed = wobbleSeed(content)
        expect(Number.isInteger(seed)).toBe(true)
        expect(seed).toBeGreaterThanOrEqual(0)
        expect(seed).toBeLessThan(2 ** 32)
      }),
    )
  })

  test('seed depends on content: distinct strings spread over seeds', () => {
    // Not a collision-freedom claim (a hash cannot promise that) —
    // the property is that the seed FUNCTION is not constant: any
    // decent-sized set of distinct contents yields many distinct
    // seeds, so distinct elements do not all share one wobble.
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string(), { minLength: 20, maxLength: 40 }),
        (contents) => {
          const seeds = new Set(contents.map(wobbleSeed))
          expect(seeds.size).toBeGreaterThan(contents.length / 2)
        },
      ),
    )
  })
})

const optionsArbitrary: fc.Arbitrary<RoughRectOptions> = fc
  .record({
    x: fc.integer({ min: 0, max: 400 }),
    y: fc.integer({ min: 0, max: 400 }),
    width: fc.integer({ min: 24, max: 900 }),
    height: fc.integer({ min: 24, max: 900 }),
    radius: fc.integer({ min: 0, max: 16 }),
    seed: fc.integer({ min: 0, max: 2 ** 32 - 1 }),
  })
  .map((options) => ({
    ...options,
    segments: roughSegments(options.width, options.height),
  }))

describe('roughRectPath', () => {
  test('is a pure function: equal options, equal path', () => {
    fc.assert(
      fc.property(optionsArbitrary, (options) => {
        expect(roughRectPath(options)).toBe(roughRectPath(options))
      }),
    )
  })

  test('emits a closed, finite path', () => {
    fc.assert(
      fc.property(optionsArbitrary, (options) => {
        const path = roughRectPath(options)
        expect(path.startsWith('M ')).toBe(true)
        expect(path.endsWith(' Z')).toBe(true)
        expect(path).not.toMatch(/NaN|Infinity|undefined/)
      }),
    )
  })

  test('a ring replays its outer border: same command shape per edge', () => {
    // The equivalence-ring contract: with the SAME seed and the SAME
    // segment counts, an inset box produces a path with the identical
    // command sequence (same wavy point count per edge) — offsets are
    // replayed one-for-one, which is what keeps stacked border lines
    // of identical elements parallel.
    fc.assert(
      fc.property(
        optionsArbitrary,
        fc.integer({ min: 1, max: 8 }),
        (options, inset) => {
          const commands = (path: string) => path.replace(/[^MLQAZ]/g, '')
          const ring = roughRectPath({
            ...options,
            x: options.x + inset,
            y: options.y + inset,
            width: options.width - inset * 2,
            height: options.height - inset * 2,
          })
          expect(commands(ring)).toBe(commands(roughRectPath(options)))
        },
      ),
    )
  })
})
