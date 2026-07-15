import type { AnalysisResult, EntityId } from '#/core/set-model/types.ts'

/**
 * Structural invariants the IR must satisfy before layout may draw it.
 * Violations indicate an adapter bug; the renderer surfaces them in dev
 * builds instead of silently drawing a lying diagram.
 */
export interface InvariantViolation {
  rule:
    | 'membership-upward-closed'
    | 'overlap-needs-shared-cell'
    | 'containment-needs-cell-subset'
  detail: string
}

/**
 * Checks the anti-phantom-intersection contract between `relations`
 * (source of truth from assignability queries) and `cells` (what layout
 * will draw):
 *
 * 1. A ⊆ B  ⇒ every cell of A is a cell of B (upward-closed membership)
 * 2. A overlaps B (or unknown) ⇒ they share at least one cell
 * 3. A disjoint B ⇒ they share no cell
 */
export function validateAnalysisResult(
  result: AnalysisResult,
): Array<InvariantViolation> {
  const violations: Array<InvariantViolation> = []
  const cellsOf = new Map<EntityId, Set<string>>()

  for (const entity of result.entities) {
    cellsOf.set(entity.id, new Set())
  }
  for (const cell of result.cells) {
    for (const member of cell.members) {
      cellsOf.get(member)?.add(cell.id)
    }
  }

  const intersects = (a: EntityId, b: EntityId): boolean => {
    const setA = cellsOf.get(a) ?? new Set()
    const setB = cellsOf.get(b) ?? new Set()
    for (const id of setA) {
      if (setB.has(id)) return true
    }
    return false
  }

  const isSubsetCells = (a: EntityId, b: EntityId): boolean => {
    const setA = cellsOf.get(a) ?? new Set()
    const setB = cellsOf.get(b) ?? new Set()
    for (const id of setA) {
      if (!setB.has(id)) return false
    }
    return true
  }

  const special = new Map(result.entities.map((e) => [e.id, e.special]))
  const drawable = (id: EntityId) => special.get(id) === 'none'

  for (const relation of result.relations) {
    const { a, b, kind } = relation
    if (!drawable(a) || !drawable(b)) continue

    if (kind === 'subset' && !isSubsetCells(a, b)) {
      violations.push({
        rule: 'containment-needs-cell-subset',
        detail: `${a} ⊆ ${b} but cell membership is not a subset`,
      })
    }
    if (kind === 'superset' && !isSubsetCells(b, a)) {
      violations.push({
        rule: 'containment-needs-cell-subset',
        detail: `${b} ⊆ ${a} but cell membership is not a subset`,
      })
    }
    if ((kind === 'overlap' || kind === 'unknown') && !intersects(a, b)) {
      violations.push({
        rule: 'overlap-needs-shared-cell',
        detail: `${a} ~ ${b} (${kind}) but no shared cell exists`,
      })
    }
    if (kind === 'disjoint' && intersects(a, b)) {
      violations.push({
        rule: 'overlap-needs-shared-cell',
        detail: `${a} ∥ ${b} disjoint but a shared cell exists`,
      })
    }
    if (
      kind === 'equivalent' &&
      (!isSubsetCells(a, b) || !isSubsetCells(b, a))
    ) {
      violations.push({
        rule: 'membership-upward-closed',
        detail: `${a} ≡ ${b} but cell memberships differ`,
      })
    }
  }

  return violations
}
