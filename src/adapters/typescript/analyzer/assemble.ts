import type * as ts from 'typescript'

import { TS_DOMAIN } from '#/adapters/typescript/universe.ts'
import type {
  DecomposedPart,
  DomainProbes,
} from '#/adapters/typescript/analyzer/decompose.ts'
import type {
  Cell,
  Deviation,
  EntityId,
  PairRelation,
  RelationKind,
  SpecialRole,
} from '#/core/set-model/types.ts'

/** An exported type resolved against the checker, pre-assembly. */
export interface ResolvedEntity {
  id: EntityId
  type: ts.Type
  special: SpecialRole
  parts: Array<DecomposedPart>
  isEnum: boolean
  hasMethodSignature: boolean
}

/**
 * Emptiness verdict for one same-domain refinement pair, resolved via a
 * synthesized `(A) & (B)` probe alias in the probe file.
 */
export type OverlapVerdict = 'empty' | 'overlap' | 'unknown'

export interface PairProbeRequest {
  key: string
  domain: string
  probeTextA: string
  probeTextB: string
}

export interface PairProbeResolution {
  verdict: OverlapVerdict
  /**
   * The `(A) & (B)` probe type; membership witness for overlap cells.
   * Absent when the probe failed to parse (error type) — assemble then
   * falls back to the two refinement types as OR-witnesses, which keeps
   * membership sound (under-approximated) instead of any-polluted.
   */
  intersectionType?: ts.Type
}

export interface AssembleOutput {
  cells: Array<Cell>
  relations: Array<PairRelation>
  deviations: Array<Deviation>
  /** Pairs whose verdict was unavailable — caller reruns with probes. */
  missingProbes: Array<PairProbeRequest>
}

export function pairProbeKey(
  domain: string,
  textA: string,
  textB: string,
): string {
  const [a, b] = [textA, textB].sort()
  return `${domain}::${a}::${b}`
}

/**
 * Builds cells, relations and deviations from decomposed entities.
 *
 * Membership uses one uniform query — cell region ⊆ entity type — which
 * makes memberships upward-closed under containment by construction, and
 * makes `relations` and `cells` agree (the anti-phantom-intersection
 * invariant checked by `validateAnalysisResult`).
 *
 * The discovery pass runs with an empty `resolutions` map and reports the
 * intersection probes it needs; the final pass runs with all of them.
 */
export function assemble(
  checker: ts.TypeChecker,
  probes: DomainProbes,
  entities: Array<ResolvedEntity>,
  resolutions: Map<string, PairProbeResolution>,
): AssembleOutput {
  const drawable = entities.filter((entity) => entity.special === 'none')
  const deviations: Array<Deviation> = []
  const missingProbes: Array<PairProbeRequest> = []

  // -- 1. cell drafts, deduplicated by content-addressed id ---------------
  interface CellDraft {
    id: string
    domain: string
    subzone?: string
    kind: Cell['kind']
    label?: string
    /**
     * Region witnesses for membership queries: the cell belongs to every
     * entity that contains ANY witness. Ordinary cells have exactly one
     * witness; probe-failure fallbacks carry both refinement types.
     */
    witnesses: Array<ts.Type>
  }

  const drafts = new Map<string, CellDraft>()
  const addDraft = (draft: CellDraft) => {
    if (!drafts.has(draft.id)) drafts.set(draft.id, draft)
  }

  interface RefinementDraft {
    domain: string
    subzone?: string
    typeText: string
    probeText: string
    type: ts.Type
  }
  const refinements = new Map<string, RefinementDraft>()

  for (const entity of drawable) {
    for (const part of entity.parts) {
      switch (part.kind) {
        case 'literal': {
          addDraft({
            id: `lit:${part.domain}:${part.label}`,
            domain: part.domain,
            kind: 'literal',
            label: part.label,
            witnesses: [part.type],
          })
          break
        }
        case 'domain-full': {
          for (const domain of part.domains) {
            const probe = probes.byDomain.get(domain)
            if (probe === undefined) continue
            addDraft({
              id: `full:${domain}`,
              domain,
              kind: 'domain-full',
              witnesses: [probe],
            })
          }
          break
        }
        case 'void-like': {
          const probe = probes.byDomain.get(TS_DOMAIN.undefined)
          if (probe !== undefined) {
            addDraft({
              id: `full:${TS_DOMAIN.undefined}`,
              domain: TS_DOMAIN.undefined,
              kind: 'domain-full',
              witnesses: [probe],
            })
          }
          deviations.push({
            kind: 'void',
            entityId: entity.id,
            messageKey: 'deviation.void',
          })
          break
        }
        case 'refinement': {
          const key = `${part.domain}|${part.subzone ?? '-'}|${part.typeText}`
          if (!refinements.has(key)) {
            refinements.set(key, {
              domain: part.domain,
              subzone: part.subzone,
              typeText: part.typeText,
              probeText: part.probeText,
              type: part.type,
            })
          }
          addDraft({
            id: `ref:${part.domain}:${part.subzone ?? '-'}:${part.typeText}`,
            domain: part.domain,
            subzone: part.subzone,
            kind: 'refinement-exclusive',
            witnesses: [part.type],
          })
          break
        }
      }
    }
  }

  // -- 2. same-domain refinement pairs: containment or probed overlap -----
  // Cross-subzone pairs are probed too (a callable can structurally
  // intersect a plain object); the overlap cell inherits the first
  // refinement's subzone — a known rendering approximation.
  const refinementList = [...refinements.values()]
  for (let i = 0; i < refinementList.length; i++) {
    for (let j = i + 1; j < refinementList.length; j++) {
      const a = refinementList[i]
      const b = refinementList[j]
      if (a.domain !== b.domain) continue
      if (
        checker.isTypeAssignableTo(a.type, b.type) ||
        checker.isTypeAssignableTo(b.type, a.type)
      ) {
        continue // containment: upward-closed membership already covers it
      }
      const request: PairProbeRequest = {
        key: pairProbeKey(a.domain, a.probeText, b.probeText),
        domain: a.domain,
        probeTextA: a.probeText,
        probeTextB: b.probeText,
      }
      const resolution = resolutions.get(request.key)
      if (resolution === undefined) {
        missingProbes.push(request)
        continue
      }
      if (resolution.verdict === 'empty') continue
      const [textA, textB] = [a.typeText, b.typeText].sort()
      addDraft({
        id: `${resolution.verdict === 'overlap' ? 'ovl' : 'unk'}:${a.domain}:${textA} & ${textB}`,
        domain: a.domain,
        subzone: a.subzone,
        kind:
          resolution.verdict === 'overlap'
            ? 'refinement-overlap'
            : 'unknown-overlap',
        label: `${textA} & ${textB}`,
        witnesses:
          resolution.intersectionType !== undefined
            ? [resolution.intersectionType]
            : [a.type, b.type],
      })
    }
  }

  // -- 3. membership: one uniform query, region ⊆ entity ------------------
  // Raw witness queries are then closed over entity-level containment:
  // method bivariance makes assignability non-transitive, so a witness
  // can reach A yet miss B ⊇ A. The invariant demands upward-closure
  // under the DISPLAYED containment relation — enforce it by
  // construction instead of hoping the checker is transitive.
  const containsIndex = new Map<EntityId, Array<EntityId>>()
  for (const entity of drawable) {
    containsIndex.set(
      entity.id,
      drawable
        .filter(
          (candidate) =>
            candidate !== entity &&
            checker.isTypeAssignableTo(entity.type, candidate.type),
        )
        .map((candidate) => candidate.id),
    )
  }
  const drawableOrder = new Map(
    drawable.map((entity, index) => [entity.id, index]),
  )

  const cells: Array<Cell> = []
  for (const draft of [...drafts.values()].sort((x, y) =>
    x.id.localeCompare(y.id),
  )) {
    const raw = drawable
      .filter((entity) =>
        draft.witnesses.some((witness) =>
          checker.isTypeAssignableTo(witness, entity.type),
        ),
      )
      .map((entity) => entity.id)
    // Fixpoint, not one step: the ⊆ edges themselves are non-transitive
    // under bivariance, so supersets of supersets must be chased too.
    const closed = new Set<EntityId>(raw)
    const queue = [...raw]
    while (queue.length > 0) {
      const id = queue.pop()
      if (id === undefined) break
      for (const superset of containsIndex.get(id) ?? []) {
        if (!closed.has(superset)) {
          closed.add(superset)
          queue.push(superset)
        }
      }
    }
    const members = [...closed].sort(
      (x, y) => (drawableOrder.get(x) ?? 0) - (drawableOrder.get(y) ?? 0),
    )
    if (members.length === 0) continue
    cells.push({
      id: draft.id,
      domain: draft.domain,
      subzone: draft.subzone,
      kind: draft.kind,
      label: draft.label,
      members,
    })
  }

  // -- 4. relations: assignability first, cells as overlap evidence -------
  const cellsOf = new Map<EntityId, Set<string>>()
  for (const entity of drawable) cellsOf.set(entity.id, new Set())
  const provenKinds = new Set<Cell['kind']>([
    'literal',
    'domain-full',
    'refinement-exclusive',
    'refinement-overlap',
  ])
  const provenCellIds = new Set<string>()
  for (const cell of cells) {
    if (provenKinds.has(cell.kind)) provenCellIds.add(cell.id)
    for (const member of cell.members) cellsOf.get(member)?.add(cell.id)
  }

  const relate = (a: ResolvedEntity, b: ResolvedEntity): RelationKind => {
    const aToB = checker.isTypeAssignableTo(a.type, b.type)
    const bToA = checker.isTypeAssignableTo(b.type, a.type)
    if (aToB && bToA) return 'equivalent'
    if (aToB) return 'subset'
    if (bToA) return 'superset'
    const shared = intersect(cellsOf.get(a.id), cellsOf.get(b.id))
    if (shared.length === 0) return 'disjoint'
    return shared.some((id) => provenCellIds.has(id)) ? 'overlap' : 'unknown'
  }

  const related = entities.filter(
    (entity) => entity.special !== 'outside-set-theory',
  )
  const relations: Array<PairRelation> = []
  for (let i = 0; i < related.length; i++) {
    for (let j = i + 1; j < related.length; j++) {
      relations.push({
        a: related[i].id,
        b: related[j].id,
        kind: relate(related[i], related[j]),
      })
    }
  }

  // -- 5. entity-level deviations -----------------------------------------
  for (const entity of entities) {
    if (entity.special === 'outside-set-theory') {
      deviations.push({
        kind: 'any',
        entityId: entity.id,
        messageKey: 'deviation.any',
      })
    }
    if (entity.isEnum) {
      deviations.push({
        kind: 'enum-nominal',
        entityId: entity.id,
        messageKey: 'deviation.enumNominal',
      })
    }
    if (entity.hasMethodSignature) {
      deviations.push({
        kind: 'method-bivariance',
        entityId: entity.id,
        messageKey: 'deviation.methodBivariance',
      })
    }
  }

  return { cells, relations, deviations, missingProbes }
}

function intersect(
  a: Set<string> | undefined,
  b: Set<string> | undefined,
): Array<string> {
  if (!a || !b) return []
  const out: Array<string> = []
  for (const id of a) if (b.has(id)) out.push(id)
  return out
}
