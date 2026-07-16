import type {
  EntityId,
  PairRelation,
  TypeEntity,
} from '#/core/set-model/types.ts'

/**
 * Shared containment analysis for both layout engines: equivalence
 * merging (union-find) and the strict-superset structure from which
 * parents (minimal strict supersets) are derived. Pure and
 * deterministic — declaration order breaks every tie.
 */

export interface EntityClass {
  /** Members in declaration order; the first one names the class. */
  members: Array<TypeEntity>
  orderIndex: number
}

export function classKey(cls: EntityClass): string {
  return cls.members
    .map((member) => member.id)
    .sort()
    .join('+')
}

export function mergeEquivalent(
  drawable: Array<TypeEntity>,
  relations: Array<PairRelation>,
  order: Map<EntityId, number>,
): Array<EntityClass> {
  const drawableIds = new Set(drawable.map((entity) => entity.id))
  const parent = new Map<EntityId, EntityId>(
    drawable.map((entity) => [entity.id, entity.id]),
  )

  const find = (id: EntityId): EntityId => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) ?? root
    // Path compression keeps repeated finds cheap.
    let cursor = id
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) ?? root
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }

  // Union by declaration order: the earliest-declared member always
  // becomes the root, so the outcome is independent of relation order.
  for (const relation of relations) {
    if (relation.kind !== 'equivalent') continue
    if (!drawableIds.has(relation.a) || !drawableIds.has(relation.b)) continue
    const rootA = find(relation.a)
    const rootB = find(relation.b)
    if (rootA === rootB) continue
    const [earlier, later] =
      (order.get(rootA) ?? 0) <= (order.get(rootB) ?? 0)
        ? [rootA, rootB]
        : [rootB, rootA]
    parent.set(later, earlier)
  }

  const byRoot = new Map<EntityId, Array<TypeEntity>>()
  for (const entity of drawable) {
    const root = find(entity.id)
    const bucket = byRoot.get(root)
    if (bucket) {
      bucket.push(entity)
    } else {
      byRoot.set(root, [entity])
    }
  }

  const classes = [...byRoot.values()].map((members) => {
    members.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    return {
      members,
      orderIndex: order.get(members[0].id) ?? 0,
    }
  })
  classes.sort((a, b) => a.orderIndex - b.orderIndex)
  return classes
}

/** supersetsOf.get(x) contains y ⟺ x ⊂ y (strict; classes merged). */
export function buildSupersets(
  classes: Array<EntityClass>,
  relations: Array<PairRelation>,
): Map<EntityClass, Set<EntityClass>> {
  const classOf = new Map<EntityId, EntityClass>()
  for (const cls of classes) {
    for (const member of cls.members) classOf.set(member.id, cls)
  }
  const supersetsOf = new Map<EntityClass, Set<EntityClass>>(
    classes.map((cls) => [cls, new Set<EntityClass>()]),
  )
  for (const relation of relations) {
    const classA = classOf.get(relation.a)
    const classB = classOf.get(relation.b)
    if (!classA || !classB || classA === classB) continue
    if (relation.kind === 'subset') supersetsOf.get(classA)?.add(classB)
    if (relation.kind === 'superset') supersetsOf.get(classB)?.add(classA)
  }
  return supersetsOf
}

/**
 * Parents in the Hasse sense: strict supersets not implied through
 * another strict superset (the covering relation / transitive
 * reduction), sorted by declaration order.
 */
export function minimalSupersets(
  cls: EntityClass,
  supersetsOf: Map<EntityClass, Set<EntityClass>>,
): Array<EntityClass> {
  const supersets = [...(supersetsOf.get(cls) ?? [])]
  const minimal = supersets.filter(
    (candidate) =>
      !supersets.some(
        (other) =>
          other !== candidate && supersetsOf.get(other)?.has(candidate),
      ),
  )
  minimal.sort((a, b) => a.orderIndex - b.orderIndex)
  return minimal
}
