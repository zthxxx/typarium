import * as fc from 'fast-check'
import { expect, test } from 'vitest'

import { createTsAnalyzer } from '#/adapters/typescript/analyzer/create-ts-analyzer.ts'
import { loadLibFilesFromNodeModules } from '#/adapters/typescript/analyzer/lib-files.node.ts'
import { validateAnalysisResult } from '#/core/set-model/invariants.ts'
import type { AnalysisResult, RelationKind } from '#/core/set-model/types.ts'

const analyzer = createTsAnalyzer({ libFiles: loadLibFilesFromNodeModules() })

/**
 * Small grammar of type expressions: primitives, unit domains, literals,
 * and unions over them. Wide enough to exercise decomposition, literal
 * dedup, cross-domain unions and every relation kind except the probed
 * object refinements (covered by the behavioral suite).
 */
const atom = fc.constantFrom(
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'null',
  'undefined',
  '"a"',
  '"b"',
  '1',
  '2',
  'true',
  'false',
)

const typeExpression = fc.oneof(
  { weight: 1, arbitrary: atom },
  {
    weight: 2,
    arbitrary: fc
      .array(atom, { minLength: 1, maxLength: 4 })
      .map((parts) => [...new Set(parts)].join(' | ')),
  },
)

const declarations = (expressions: Array<string>) =>
  expressions
    .map((expression, index) => `export type T${index} = ${expression}`)
    .join('\n')

function relationOf(
  result: AnalysisResult,
  a: string,
  b: string,
): RelationKind | undefined {
  const row = result.relations.find(
    (relation) =>
      (relation.a === a && relation.b === b) ||
      (relation.a === b && relation.b === a),
  )
  if (!row) return undefined
  if (row.a === a) return row.kind
  if (row.kind === 'subset') return 'superset'
  if (row.kind === 'superset') return 'subset'
  return row.kind
}

test('analyze is total, invariant-clean, self-consistent and idempotent', () => {
  fc.assert(
    fc.property(
      fc.array(typeExpression, { minLength: 1, maxLength: 5 }),
      (expressions) => {
        const source = declarations(expressions)
        const first = analyzer.analyze(source)

        expect(validateAnalysisResult(first)).toEqual([])
        expect(first.diagnostics.filter((d) => d.severity === 'error')).toEqual(
          [],
        )

        // Exactly one relation row per unordered entity pair.
        const ids = first.entities.map((entity) => entity.id)
        const expectedPairs = (ids.length * (ids.length - 1)) / 2
        expect(first.relations).toHaveLength(expectedPairs)

        // Membership lists respect declaration order and stay unique.
        for (const cell of first.cells) {
          expect(new Set(cell.members).size).toBe(cell.members.length)
        }

        // Idempotence: analyzing the same source again is deep-equal.
        const second = analyzer.analyze(source)
        expect(second).toEqual(first)
      },
    ),
    { numRuns: 24 },
  )
}, 120_000)

test('relations are declaration-order independent', () => {
  fc.assert(
    fc.property(
      fc.array(typeExpression, { minLength: 2, maxLength: 4 }),
      (expressions) => {
        const forward = analyzer.analyze(declarations(expressions))
        // Same names bound to the same expressions, declared in reverse.
        const reversedSource = expressions
          .map((expression, index) => ({ expression, index }))
          .reverse()
          .map(
            ({ expression, index }) => `export type T${index} = ${expression}`,
          )
          .join('\n')
        const reversed = analyzer.analyze(reversedSource)

        for (let i = 0; i < expressions.length; i++) {
          for (let j = i + 1; j < expressions.length; j++) {
            expect(relationOf(reversed, `T${i}`, `T${j}`)).toBe(
              relationOf(forward, `T${i}`, `T${j}`),
            )
          }
        }
      },
    ),
    { numRuns: 12 },
  )
}, 120_000)
