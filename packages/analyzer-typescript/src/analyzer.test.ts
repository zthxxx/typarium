import { describe, expect, test } from 'vitest'
import { createTsAnalyzer } from './create-ts-analyzer.ts'
import { loadLibFilesFromNodeModules } from './lib-files.node.ts'
import type { AnalysisResult, RelationKind } from '@typarium/set-model'

/**
 * Teaching acceptance matrix against the real TypeScript 6.0.3 checker
 * (the single engine, ADR-0015). One shared analyzer instance: the
 * language service is incremental by design and reuse mirrors runtime.
 */

const analyzer = createTsAnalyzer({ libFiles: loadLibFilesFromNodeModules() })

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

function coveredOf(result: AnalysisResult, id: string): boolean | undefined {
  return result.entities.find((entity) => entity.id === id)?.coveredBySubsets
}

describe('ts analyzer', () => {
  test('covariance keeps direction, function parameters invert it', () => {
    const result = analyzer.analyze(
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

  test('method bivariance merges, property syntax nests', () => {
    const result = analyzer.analyze(
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

  test('tagged union: branches unrelated, each subset of the sum', () => {
    const result = analyzer.analyze(
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

  test('literals nest into virtual preset primitives', () => {
    const result = analyzer.analyze(`export type Foo = 'foo'`, [
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

  test('specials: unknown universe, never empty, any badge-only', () => {
    const result = analyzer.analyze(
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

  test('lazy discriminant reduction still classifies as empty', () => {
    // TypeFlags.Never misses this (deferred reduction); the assignable-
    // to-never query is the reliable emptiness oracle (v1 finding).
    const result = analyzer.analyze(
      ["export type Conflict = { kind: 'a' } & { kind: 'b' }"].join('\n'),
      [],
    )
    expect(result.entities[0]?.special).toBe('empty')
  })

  test('scan rules: non-exports skipped, generics shown at their bound (ADR-0022)', () => {
    const result = analyzer.analyze(
      [
        'type Hidden = string',
        'export type Generic<T> = T | boolean',
        'export type WithDefault<T = string> = T | boolean',
        'export type Shown = number',
      ].join('\n'),
      [],
    )
    const ids = result.entities.map((entity) => entity.id)
    expect(ids).toEqual(['Generic<T>', 'WithDefault<T = string>', 'Shown'])
    // Unconstrained T evaluates at unknown: T | boolean degenerates to
    // the universe — correct, if initially surprising (ADR-0022).
    expect(
      result.entities.find((entity) => entity.id === 'Generic<T>')?.special,
    ).toBe('universe')
    // The all-default generic instantiates bare: string | boolean.
    expect(relationOf(result, 'Shown', 'WithDefault<T = string>')).toBe(
      'unrelated',
    )
    expect(
      result.entities.find((entity) => entity.id === 'WithDefault<T = string>')
        ?.expandedText,
    ).toBe('string | boolean')
  })

  test('constraint bounds make generic families comparable (ADR-0022)', () => {
    const result = analyzer.analyze(
      [
        'export type Box<T> = { value: T }',
        'export type BoxStr<T extends string> = { value: T }',
        'export type BoxLit = { value: "a" }',
        'export type H<T> = (value: T) => void',
        'export type HStr<T extends string> = (value: T) => void',
      ].join('\n'),
      [],
    )
    // Covariant position: a TIGHTER constraint is a SMALLER family bound.
    expect(relationOf(result, 'BoxStr<T extends string>', 'Box<T>')).toBe(
      'subset',
    )
    expect(relationOf(result, 'BoxLit', 'BoxStr<T extends string>')).toBe(
      'subset',
    )
    // Contravariant position flips it: the unconstrained handler family
    // bound accepts everything, making it the SMALLEST handler set.
    expect(relationOf(result, 'H<T>', 'HStr<T extends string>')).toBe('subset')
    expect(
      result.entities.find((entity) => entity.id === 'BoxStr<T extends string>')
        ?.expandedText,
    ).toBe('{ value: string; }')
  })

  test('sibling-referencing constraints drop only that entity', () => {
    const result = analyzer.analyze(
      [
        'export type Odd<T, U extends T> = [T, U]',
        'export type Fine = string',
      ].join('\n'),
      [],
    )
    const ids = result.entities.map((entity) => entity.id)
    expect(ids).toEqual(['Fine'])
  })

  test('expandedText resolves aliases one level', () => {
    const result = analyzer.analyze(
      [
        'export type Co<T = never> = T | boolean',
        'export type R = Co<string>',
      ].join('\n'),
      [],
    )
    const entity = result.entities.find((candidate) => candidate.id === 'R')
    expect(entity?.expandedText).toBe('string | boolean')
    expect(entity?.typeText).toBe('Co<string>')
  })

  test('broken user code returns diagnostics and no entities', () => {
    const result = analyzer.analyze('export type X = unknwon', [])
    expect(result.entities).toEqual([])
    expect(result.relations).toEqual([])
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === 'error' && diagnostic.domain === 'type',
      ),
    ).toBe(true)
  })

  test('value-space errors do not block: exported types still analyzed', () => {
    const result = analyzer.analyze(
      [
        'export type A2 = string',
        'export type B2 = string | number',
        'declare let a2: A2',
        'declare let b2: B2',
        'a2 = b2',
        'a2 = 1',
        "a2.concat('')",
      ].join('\n'),
      [],
    )
    expect(result.entities.map((entity) => entity.id)).toEqual(['A2', 'B2'])
    expect(relationOf(result, 'A2', 'B2')).toBe('subset')
    const errors = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error',
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((diagnostic) => diagnostic.domain === 'value')).toBe(
      true,
    )
  })

  test('syntax and annotation type errors still block', () => {
    const syntaxBroken = analyzer.analyze('export type = string', [])
    expect(syntaxBroken.entities).toEqual([])
    expect(
      syntaxBroken.diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === 'error' && diagnostic.domain === 'syntax',
      ),
    ).toBe(true)

    const annotationBroken = analyzer.analyze(
      'export type X = string\ndeclare let x: Unresolved',
      [],
    )
    expect(annotationBroken.entities).toEqual([])
    expect(
      annotationBroken.diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === 'error' && diagnostic.domain === 'type',
      ),
    ).toBe(true)
  })

  test('check returns spanned errors without relations work', () => {
    const source = 'export type X = unknwon\nexport type Y = string'
    const diagnostics = analyzer.check(source)
    const error = diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    )
    expect(error).toBeDefined()
    expect(error!.span.start).toBe(source.indexOf('unknwon'))
    expect(error!.span.end).toBe(source.indexOf('unknwon') + 'unknwon'.length)
    expect(analyzer.check('export type Y = string')).toEqual([])
  })

  test('quickInfo answers at a declaration name', () => {
    const source =
      'export type Co<T = never> = T | boolean\nexport type R = Co<string>'
    const info = analyzer.quickInfo(source, source.indexOf('R ='))
    expect(info).toContain('type R')
    expect(info).toContain('string | boolean')
    expect(analyzer.quickInfo(source, 0)).toBeNull()
  })

  test('completions offer lib types at a type position', () => {
    const source = 'export type S = str'
    const entries = analyzer.completions(source, source.length)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.map((entry) => entry.name)).toContain('string')
  })

  test('union coverage: parent exactly covered by displayed subsets', () => {
    const result = analyzer.analyze(
      [
        'export type C1 = string',
        'export type C2 = number',
        'export type C3 = string | number',
      ].join('\n'),
      [],
    )
    expect(coveredOf(result, 'C3')).toBe(true)
    expect(coveredOf(result, 'C1')).toBe(false)
    expect(coveredOf(result, 'C2')).toBe(false)
  })

  test('union coverage: three-way union covered by its primitives', () => {
    const result = analyzer.analyze(
      [
        'export type C1 = string',
        'export type C2 = number',
        'export type C3 = boolean',
        'export type C4 = string | number | boolean',
      ].join('\n'),
      [],
    )
    expect(coveredOf(result, 'C4')).toBe(true)
  })

  test('union coverage: missing member leaves the parent uncovered', () => {
    const result = analyzer.analyze(
      ['export type C1 = string', 'export type C3 = string | number'].join(
        '\n',
      ),
      [],
    )
    expect(coveredOf(result, 'C3')).toBe(false)
  })

  test('union coverage: literal unions count', () => {
    const result = analyzer.analyze(
      [
        "export type A = 'a' | 'b'",
        "export type B = 'a'",
        "export type C = 'b'",
      ].join('\n'),
      [],
    )
    expect(coveredOf(result, 'A')).toBe(true)
  })

  test('union coverage: literals never exhaust a primitive', () => {
    const result = analyzer.analyze("export type Foo = 'foo' | 'bar'", [
      { name: 'string', typeText: 'string' },
    ])
    expect(coveredOf(result, 'preset:string')).toBe(false)
    expect(coveredOf(result, 'Foo')).toBe(false)
  })

  test('deterministic: identical input yields identical result', () => {
    const source = 'export type A = string\nexport type B = string | number'
    const virtual = [{ name: 'number', typeText: 'number' }]
    const first = analyzer.analyze(source, virtual)
    const second = analyzer.analyze(source, virtual)
    expect(second).toEqual(first)
    expect(relationOf(first, 'A', 'B')).toBe('subset')
    expect(relationOf(first, 'preset:number', 'B')).toBe('subset')
    expect(relationOf(first, 'A', 'preset:number')).toBe('unrelated')
  })

  test('object family: soundness correction splits the fake merge', () => {
    // Raw assignability makes all four mutually assignable (unsound,
    // non-transitive); the witness correction must recover TWO nested
    // equivalence classes: {Object ≡ {}} ⊃ {object ≡ Record<string, any>}.
    const result = analyzer.analyze(
      [
        'export type Big = Object',
        'export type Braces = {}',
        'export type Obj = object',
        'export type Rec = Record<string, any>',
      ].join('\n'),
      [],
    )
    expect(relationOf(result, 'Big', 'Braces')).toBe('equivalent')
    expect(relationOf(result, 'Obj', 'Rec')).toBe('equivalent')
    expect(relationOf(result, 'Obj', 'Braces')).toBe('subset')
    expect(relationOf(result, 'Obj', 'Big')).toBe('subset')
    expect(relationOf(result, 'Rec', 'Braces')).toBe('subset')
    expect(relationOf(result, 'Rec', 'Big')).toBe('subset')
  })

  test('object family: {} is NOT covered by object alone', () => {
    // Raw `{} ⊆ object` holds, but the string witness lives in {} and
    // not in object — coverage must respect the witness discipline.
    const result = analyzer.analyze(
      ['export type Braces = {}', 'export type Obj = object'].join('\n'),
      [],
    )
    expect(coveredOf(result, 'Braces')).toBe(false)
  })

  test('teaching matrix survives the soundness correction', () => {
    const result = analyzer.analyze(
      [
        "export type Fruit = 'apple' | 'banana'",
        'export type Text = string',
        'export type TextOrNumber = string | number',
      ].join('\n'),
      [{ name: 'string', typeText: 'string' }],
    )
    expect(relationOf(result, 'Fruit', 'Text')).toBe('subset')
    expect(relationOf(result, 'Text', 'TextOrNumber')).toBe('subset')
    expect(relationOf(result, 'Text', 'preset:string')).toBe('equivalent')
    expect(coveredOf(result, 'TextOrNumber')).toBe(false)
  })

  test('twoslash: ^? query resolves the type at position', async () => {
    const queries = await analyzer.twoslashQueries('const a = 1\n//    ^?')
    expect(queries.length).toBe(1)
    expect(queries[0].text).toContain('const a: 1')
    expect(queries[0].line).toBe(0)
  })

  test('twoslash: unmarked source short-circuits to empty', async () => {
    expect(await analyzer.twoslashQueries('const a = 1')).toEqual([])
  })

  test('twoslash: broken code never throws', async () => {
    expect(
      await analyzer.twoslashQueries('const a: unknwon = 1\n//    ^?'),
    ).toEqual(expect.any(Array))
  })

  test('broken virtual preset drops only that entity', () => {
    const result = analyzer.analyze('export type A = string', [
      { name: 'good', typeText: 'number' },
      { name: 'bad', typeText: 'NoSuchGlobalType' },
    ])
    const ids = result.entities.map((entity) => entity.id)
    expect(ids).toContain('preset:good')
    expect(ids).not.toContain('preset:bad')
    expect(relationOf(result, 'A', 'preset:good')).toBe('unrelated')
  })
})
