import { expect, test } from 'vitest'

import { createTsAnalyzer } from '#/adapters/typescript/analyzer/create-ts-analyzer.ts'
import { loadLibFilesFromNodeModules } from '#/adapters/typescript/analyzer/lib-files.node.ts'
import { validateAnalysisResult } from '#/core/set-model/invariants.ts'
import { TS_DOMAIN, TS_SUBZONE } from '#/adapters/typescript/universe.ts'
import type { AnalysisResult, RelationKind } from '#/core/set-model/types.ts'

const analyzer = createTsAnalyzer({ libFiles: loadLibFilesFromNodeModules() })

/** Analyzes and asserts the structural invariants in one step. */
function analyze(source: string): AnalysisResult {
  const result = analyzer.analyze(source)
  expect(validateAnalysisResult(result)).toEqual([])
  return result
}

/** Relation of `a` towards `b`, regardless of stored orientation. */
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

const entityNames = (result: AnalysisResult) =>
  result.entities.map((entity) => entity.name)

const cellsOf = (result: AnalysisResult, entity: string) =>
  result.cells.filter((cell) => cell.members.includes(entity))

// --- export extraction ------------------------------------------------------

test('shows only exported types; generics need full defaults', () => {
  const result = analyze(`
    export type UnionBoolean<T> = T | boolean
    export type R1 = UnionBoolean<string>
    export type R2 = UnionBoolean<number>
    type R3 = UnionBoolean<unknown>
    export type WithDefault<T = string> = T | boolean
  `)
  expect(entityNames(result)).toEqual(['R1', 'R2', 'WithDefault'])
  const withDefault = result.entities.find(
    (entity) => entity.name === 'WithDefault',
  )
  expect(withDefault?.typeText).toBe('string | boolean')
})

test('misspelled type name produces diagnostics and drops the entity', () => {
  const result = analyzer.analyze(`export type X = unknwon`)
  expect(result.diagnostics.length).toBeGreaterThan(0)
  expect(result.diagnostics[0].severity).toBe('error')
  expect(entityNames(result)).toEqual([])
  expect(result.anyEntityNames).toEqual([])
})

// --- special types -----------------------------------------------------------

test('unknown is the universe, never the empty set, any lives outside', () => {
  const result = analyze(`
    export type U = unknown
    export type N = never
    export type A = any
    export type S = string
  `)
  const byName = new Map(result.entities.map((entity) => [entity.name, entity]))
  expect(byName.get('U')?.special).toBe('universe')
  expect(byName.get('N')?.special).toBe('empty')
  expect(byName.get('A')?.special).toBe('outside-set-theory')
  expect(byName.get('S')?.special).toBe('none')
  expect(result.anyEntityNames).toEqual(['A'])
  expect(
    result.deviations.some((d) => d.kind === 'any' && d.entityId === 'A'),
  ).toBe(true)

  // ∅ ⊆ everything, everything ⊆ unknown; any joins no relation.
  expect(relationOf(result, 'N', 'S')).toBe('subset')
  expect(relationOf(result, 'S', 'U')).toBe('subset')
  expect(relationOf(result, 'N', 'U')).toBe('subset')
  expect(relationOf(result, 'A', 'S')).toBeUndefined()

  // Specials own no cells; the canvas renders them as frame/pattern/badge.
  for (const name of ['U', 'N', 'A']) {
    expect(cellsOf(result, name)).toEqual([])
  }
})

test('{} covers every domain except null and undefined', () => {
  const result = analyze(`
    export type Braces = {}
    export type S = string
  `)
  const braceCells = cellsOf(result, 'Braces')
  const coveredDomains = new Set(braceCells.map((cell) => cell.domain))
  for (const domain of [
    'string',
    'number',
    'bigint',
    'boolean',
    'symbol',
    'object',
  ]) {
    expect(coveredDomains.has(domain)).toBe(true)
  }
  expect(coveredDomains.has(TS_DOMAIN.null)).toBe(false)
  expect(coveredDomains.has(TS_DOMAIN.undefined)).toBe(false)
  expect(relationOf(result, 'S', 'Braces')).toBe('subset')
})

test('void reads as {undefined} plus a deviation marker', () => {
  const result = analyze(`
    export type V = void
    export type Und = undefined
  `)
  expect(relationOf(result, 'Und', 'V')).toBe('subset')
  expect(
    result.deviations.some((d) => d.kind === 'void' && d.entityId === 'V'),
  ).toBe(true)
  expect(
    cellsOf(result, 'V').some(
      (cell) =>
        cell.domain === TS_DOMAIN.undefined && cell.kind === 'domain-full',
    ),
  ).toBe(true)
})

// --- literals & primitives ---------------------------------------------------

test('a string literal is a point inside the string domain', () => {
  const result = analyze(`
    export type Foo = "foo"
    export type S = string
  `)
  expect(relationOf(result, 'Foo', 'S')).toBe('subset')
  const literal = result.cells.find((cell) => cell.kind === 'literal')
  expect(literal?.domain).toBe(TS_DOMAIN.string)
  expect(literal?.label).toBe('"foo"')
  expect(literal?.members).toEqual(['Foo', 'S'])
})

test('string and number are disjoint domains', () => {
  const result = analyze(`
    export type S = string
    export type N = number
  `)
  expect(relationOf(result, 'S', 'N')).toBe('disjoint')
})

test('template literal types are string refinements with sound literal membership', () => {
  const result = analyze(`
    export type Tpl = \`a\${string}\`
    export type S = string
    export type LitAb = "ab"
    export type LitZz = "zz"
  `)
  expect(relationOf(result, 'Tpl', 'S')).toBe('subset')
  expect(relationOf(result, 'LitAb', 'Tpl')).toBe('subset')
  expect(relationOf(result, 'LitZz', 'Tpl')).toBe('disjoint')
  expect(
    result.cells.some(
      (cell) =>
        cell.kind === 'refinement-exclusive' &&
        cell.domain === TS_DOMAIN.string,
    ),
  ).toBe(true)
})

// --- teaching demo: covariance ----------------------------------------------

test('union positions are covariant: narrower input, narrower result', () => {
  const result = analyze(`
    export type Co<T = string> = T | boolean
    export type C1 = Co<string>
    export type C2 = Co<string | number>
  `)
  expect(relationOf(result, 'C1', 'C2')).toBe('subset')
  expect(relationOf(result, 'C1', 'Co')).toBe('equivalent')
})

// --- teaching demo: contravariance -------------------------------------------

test('function parameters are contravariant: wider input, narrower set', () => {
  const result = analyze(`
    export type Fun<X> = (params: X) => void
    export type F1 = Fun<string>
    export type F2 = Fun<string | number>
  `)
  expect(entityNames(result)).toEqual(['F1', 'F2'])
  // The direction flips: the wider-parameter function is the SUBSET.
  expect(relationOf(result, 'F2', 'F1')).toBe('subset')
  const f1Cells = cellsOf(result, 'F1')
  expect(
    f1Cells.every(
      (cell) =>
        cell.domain === TS_DOMAIN.object &&
        cell.subzone === TS_SUBZONE.callable,
    ),
  ).toBe(true)
})

// --- teaching demo: method bivariance -----------------------------------------

test('method syntax is bivariant (merged), property syntax is contravariant (nested)', () => {
  const result = analyze(`
    interface Animal { name: string }
    interface Dog extends Animal { breed: string }
    export interface KennelMethod { add(x: Animal): void }
    export interface DogKennelMethod { add(x: Dog): void }
    export interface KennelFn { add: (x: Animal) => void }
    export interface DogKennelFn { add: (x: Dog) => void }
  `)
  // Method syntax: unsound both-ways assignability collapses the two
  // sets into one — that IS the bivariance lesson.
  expect(relationOf(result, 'KennelMethod', 'DogKennelMethod')).toBe(
    'equivalent',
  )
  // Property syntax: strictFunctionTypes keeps contravariance, the sets nest.
  expect(relationOf(result, 'KennelFn', 'DogKennelFn')).toBe('subset')
  expect(
    result.deviations.some(
      (d) => d.kind === 'method-bivariance' && d.entityId === 'KennelMethod',
    ),
  ).toBe(true)
})

// --- teaching demo: tagged union ----------------------------------------------

test('tagged union branches are pairwise disjoint, the union is their superset', () => {
  const result = analyze(`
    export type GroupRow = { kind: 'group'; groupName: string }
    export type DataRow = { kind: 'data'; data: Record<string, string> }
    export type CreatorRow = { kind: 'creator'; authorId: number }
    export type RowData = GroupRow | DataRow | CreatorRow
  `)
  expect(relationOf(result, 'GroupRow', 'DataRow')).toBe('disjoint')
  expect(relationOf(result, 'GroupRow', 'CreatorRow')).toBe('disjoint')
  expect(relationOf(result, 'DataRow', 'CreatorRow')).toBe('disjoint')
  expect(relationOf(result, 'RowData', 'GroupRow')).toBe('superset')
  expect(relationOf(result, 'RowData', 'DataRow')).toBe('superset')
  expect(relationOf(result, 'RowData', 'CreatorRow')).toBe('superset')
})

// --- teaching demo: union to intersection -------------------------------------

test('UnionToIntersection lands inside each constituent', () => {
  const result = analyze(`
    export type ObjA = { a: 1 }
    export type ObjB = { b: 2 }
    export type U2I<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never
    export type R = U2I<ObjA | ObjB>
  `)
  expect(entityNames(result)).toEqual(['ObjA', 'ObjB', 'R'])
  expect(relationOf(result, 'R', 'ObjA')).toBe('subset')
  expect(relationOf(result, 'R', 'ObjB')).toBe('subset')
  // {a:1} and {b:2} genuinely intersect — R inhabits the overlap.
  expect(relationOf(result, 'ObjA', 'ObjB')).toBe('overlap')
  expect(result.cells.some((cell) => cell.kind === 'refinement-overlap')).toBe(
    true,
  )
})

// --- honest undecidability -----------------------------------------------------

test('conflicting non-literal properties stay an unknown overlap, not a lie', () => {
  const result = analyze(`
    export type PA = { a: string }
    export type PB = { a: number }
  `)
  expect(relationOf(result, 'PA', 'PB')).toBe('unknown')
  const cell = result.cells.find((c) => c.kind === 'unknown-overlap')
  expect(cell?.members).toEqual(['PA', 'PB'])
})

test('literal-discriminant conflicts are proven empty despite lazy reduction', () => {
  const result = analyze(`
    export type TagA = { kind: 'a'; payload: string }
    export type TagB = { kind: 'b'; payload: string }
  `)
  expect(relationOf(result, 'TagA', 'TagB')).toBe('disjoint')
  expect(result.cells.some((c) => c.kind === 'unknown-overlap')).toBe(false)
})

// --- enums ----------------------------------------------------------------------

test('string enums are literal points inside string, marked nominal', () => {
  const result = analyze(`
    export enum RowType { Group = 'Group', DataRow = 'DataRow' }
    export type S = string
  `)
  expect(relationOf(result, 'RowType', 'S')).toBe('subset')
  const literals = result.cells.filter((cell) => cell.kind === 'literal')
  expect(literals).toHaveLength(2)
  expect(literals.every((cell) => cell.domain === TS_DOMAIN.string)).toBe(true)
  expect(
    result.deviations.some(
      (d) => d.kind === 'enum-nominal' && d.entityId === 'RowType',
    ),
  ).toBe(true)
})

// --- quick info -------------------------------------------------------------------

test('quickInfo surfaces the inferred type at a position', () => {
  const source = `export type R1 = string | boolean`
  const info = analyzer.quickInfo(source, source.indexOf('R1') + 1)
  expect(info).toContain('string | boolean')
})

// --- entity cap ---------------------------------------------------------------------

test('more than 24 exports truncates with a warning', () => {
  const source = Array.from(
    { length: 30 },
    (_, index) => `export type T${index} = ${index}`,
  ).join('\n')
  const result = analyzer.analyze(source)
  expect(result.entities).toHaveLength(24)
  expect(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === 'warning' && diagnostic.message.includes('24'),
    ),
  ).toBe(true)
})
