import type {
  AnalysisResult,
  Cell,
  CellKind,
  PairRelation,
  RelationKind,
  SetUniverse,
  SpecialRole,
  TypeEntity,
} from '#/core/set-model/types.ts'

/**
 * Test fixtures for the layout engine. A universe mirroring the shape of
 * the TypeScript one is defined locally so core tests stay free of any
 * adapter import.
 */

export const fixtureUniverse: SetUniverse = {
  languageId: 'fixture',
  domains: [
    { id: 'string', label: 'string', cardinality: 'infinite' },
    { id: 'number', label: 'number', cardinality: 'infinite' },
    { id: 'bigint', label: 'bigint', cardinality: 'infinite' },
    { id: 'boolean', label: 'boolean', cardinality: 'infinite' },
    { id: 'symbol', label: 'symbol', cardinality: 'infinite' },
    { id: 'null', label: 'null', cardinality: 'unit' },
    { id: 'undefined', label: 'undefined', cardinality: 'unit' },
    {
      id: 'object',
      label: 'object',
      cardinality: 'infinite',
      subzones: [
        { id: 'callable', label: 'functions' },
        { id: 'array', label: 'arrays' },
        { id: 'plain', label: 'objects' },
      ],
    },
  ],
}

export function makeEntity(
  id: string,
  special: SpecialRole = 'none',
): TypeEntity {
  return {
    id,
    name: id,
    typeText: id,
    expandedText: id,
    special,
    declarationSpan: { start: 0, end: 1 },
  }
}

export function makeCell(
  id: string,
  domain: string,
  kind: CellKind,
  members: Array<string>,
  subzone?: string,
): Cell {
  return { id, domain, subzone, kind, members }
}

/**
 * Derives the pairwise relation matrix from cell membership, so fixtures
 * are consistent with the invariant checker by construction.
 */
export function deriveRelations(
  entities: Array<TypeEntity>,
  cells: Array<Cell>,
): Array<PairRelation> {
  const cellsOf = new Map<string, Set<string>>(
    entities.map((entity) => [entity.id, new Set<string>()]),
  )
  for (const cell of cells) {
    for (const member of cell.members) {
      cellsOf.get(member)?.add(cell.id)
    }
  }
  const relations: Array<PairRelation> = []
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const a = entities[i]
      const b = entities[j]
      if (a.special !== 'none' || b.special !== 'none') continue
      const setA = cellsOf.get(a.id) ?? new Set()
      const setB = cellsOf.get(b.id) ?? new Set()
      const shared = [...setA].filter((id) => setB.has(id)).length
      const aInB = [...setA].every((id) => setB.has(id))
      const bInA = [...setB].every((id) => setA.has(id))
      let kind: RelationKind
      if (aInB && bInA) kind = 'equivalent'
      else if (aInB) kind = 'subset'
      else if (bInA) kind = 'superset'
      else if (shared > 0) kind = 'overlap'
      else kind = 'disjoint'
      relations.push({ a: a.id, b: b.id, kind })
    }
  }
  return relations
}

export function makeResult(
  entities: Array<TypeEntity>,
  cells: Array<Cell>,
): AnalysisResult {
  return {
    entities,
    cells,
    relations: deriveRelations(entities, cells),
    deviations: [],
    diagnostics: [],
    anyEntityNames: entities
      .filter((entity) => entity.special === 'outside-set-theory')
      .map((entity) => entity.name),
  }
}
