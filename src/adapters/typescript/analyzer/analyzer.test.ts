import { describe, expect, test } from 'vitest'
import { createTsgoAnalyzer } from '#/adapters/typescript/analyzer/create-tsgo-analyzer.ts'
import { createNodeTsgoRunner } from '#/adapters/typescript/analyzer/tsgo-runner.node.ts'
import type { AnalysisResult, RelationKind } from '#/core/set-model/types.ts'

/**
 * Teaching acceptance matrix against the REAL tsgo (TypeScript 7)
 * compiler via the CLI runner. Each analyze() is a full tsc pass
 * (~1s), so cases group several assertions per run.
 */

const analyzer = createTsgoAnalyzer(createNodeTsgoRunner())

function relationOf(
  result: AnalysisResult,
  a: string,
  b: string,
): RelationKind | undefined {
  const found = result.relations.find(
    (relation) =>
      (relation.a === a && relation.b === b) ||
      (relation.a === b && relation.b === a),
  )
  if (!found) return undefined
  if (found.a === a) return found.kind
  if (found.kind === 'subset') return 'superset'
  if (found.kind === 'superset') return 'subset'
  return found.kind
}

describe('tsgo analyzer', () => {
  test('covariance keeps direction, function parameters invert it', async () => {
    const result = await analyzer.analyze(
      [
        'export type Co<T = never> = T | boolean',
        'export type CoNarrow = Co<string>',
        'export type CoWide = Co<string | number>',
        'export type Handler<X = never> = (value: X) => void',
        'export type StrHandler = Handler<string>',
        'export type WideHandler = Handler<string | number>',
      ].join('\n'),
      [],
    )
    expect(relationOf(result, 'CoNarrow', 'CoWide')).toBe('subset')
    // Contravariance: the WIDER instantiation is the SMALLER set.
    expect(relationOf(result, 'WideHandler', 'StrHandler')).toBe('subset')
    expect(relationOf(result, 'StrHandler', 'CoNarrow')).toBe('unrelated')
  })

  test('method bivariance merges, property syntax nests', async () => {
    const result = await analyzer.analyze(
      [
        'interface Animal { name: string }',
        'interface Dog extends Animal { breed: string }',
        'export interface KennelM { addM(animal: Animal): void }',
        'export interface DogKennelM { addM(dog: Dog): void }',
        'export interface KennelF { addF: (animal: Animal) => void }',
        'export interface DogKennelF { addF: (dog: Dog) => void }',
      ].join('\n'),
      [],
    )
    expect(relationOf(result, 'KennelM', 'DogKennelM')).toBe('equivalent')
    expect(relationOf(result, 'KennelF', 'DogKennelF')).toBe('subset')
  })

  test('tagged union: branches unrelated, each subset of the sum', async () => {
    const result = await analyzer.analyze(
      [
        "export type GroupRow = { type: 'Group'; groupName: string }",
        "export type DataRow = { type: 'DataRow'; data: string }",
        "export type CreatorRow = { type: 'Creator'; authorID: number }",
        'export type RowData = GroupRow | DataRow | CreatorRow',
      ].join('\n'),
      [],
    )
    expect(relationOf(result, 'GroupRow', 'DataRow')).toBe('unrelated')
    expect(relationOf(result, 'DataRow', 'CreatorRow')).toBe('unrelated')
    expect(relationOf(result, 'GroupRow', 'RowData')).toBe('subset')
    expect(relationOf(result, 'DataRow', 'RowData')).toBe('subset')
    expect(relationOf(result, 'CreatorRow', 'RowData')).toBe('subset')
  })

  test('literals nest into virtual preset primitives', async () => {
    const result = await analyzer.analyze(`export type Foo = 'foo'`, [
      { name: 'string', typeText: 'string' },
      { name: 'Array<T>', typeText: 'Array<unknown>' },
      { name: 'object', typeText: 'object' },
    ])
    expect(relationOf(result, 'Foo', 'preset:string')).toBe('subset')
    expect(relationOf(result, 'Foo', 'preset:object')).toBe('unrelated')
    expect(relationOf(result, 'preset:Array<T>', 'preset:object')).toBe(
      'subset',
    )
  })

  test('specials: unknown universe, never empty, any badge-only', async () => {
    const result = await analyzer.analyze(
      [
        'export type U = unknown',
        'export type N = never',
        'export type A = any',
        'export type Plain = string',
        'export type Empty = string & number',
      ].join('\n'),
      [],
    )
    const byId = new Map(result.entities.map((entity) => [entity.id, entity]))
    expect(byId.get('U')?.special).toBe('universe')
    expect(byId.get('N')?.special).toBe('empty')
    expect(byId.get('A')?.special).toBe('outside-set-theory')
    expect(byId.get('Plain')?.special).toBe('none')
    // The snippet-style intersection collapses to never.
    expect(byId.get('Empty')?.special).toBe('empty')
    expect(result.anyEntityNames).toEqual(['A'])
    const inRelations = new Set(
      result.relations.flatMap((relation) => [relation.a, relation.b]),
    )
    expect(inRelations.has('A')).toBe(false)
    expect(inRelations.has('U')).toBe(false)
    expect(inRelations.has('N')).toBe(false)
  })

  test('scan rules: non-export and defaultless generics skipped', async () => {
    const result = await analyzer.analyze(
      [
        'type Hidden = string',
        'export type Generic<T> = T | boolean',
        'export type WithDefault<T = string> = T | boolean',
        'export type Shown = number',
      ].join('\n'),
      [],
    )
    const ids = result.entities.map((entity) => entity.id)
    expect(ids).toEqual(['WithDefault', 'Shown'])
    expect(relationOf(result, 'Shown', 'WithDefault')).toBe('unrelated')
  })

  test('broken user code returns diagnostics and no entities', async () => {
    const result = await analyzer.analyze('export type X = unknwon', [])
    expect(result.entities).toEqual([])
    expect(result.relations).toEqual([])
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    ).toBe(true)
  })

  test('deterministic: identical input yields identical result', async () => {
    const source = 'export type A = string\nexport type B = string | number'
    const virtual = [{ name: 'number', typeText: 'number' }]
    const first = await analyzer.analyze(source, virtual)
    const second = await analyzer.analyze(source, virtual)
    expect(second).toEqual(first)
    expect(relationOf(first, 'A', 'B')).toBe('subset')
    expect(relationOf(first, 'preset:number', 'B')).toBe('subset')
    expect(relationOf(first, 'A', 'preset:number')).toBe('unrelated')
  })
})
