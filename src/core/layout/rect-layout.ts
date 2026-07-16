import {
  CANVAS_PAD,
  CELL_GAP,
  CONTENT_PAD,
  LABEL_STRIP,
  MIN_VIEWPORT,
  RING_INSET,
} from '#/core/layout/constants.ts'
import type {
  Box,
  EntityRect,
  RectLayoutInput,
  RectLayoutResult,
} from '#/core/layout/types.ts'
import type {
  EntityId,
  PairRelation,
  TypeEntity,
} from '#/core/set-model/types.ts'

/**
 * Rectangular containment layout (ADR-0012).
 *
 * Pipeline: merge mutually-containing entities into classes (union-find)
 * → build the containment forest (parent = minimal strict superset) →
 * recursively split each container on a balanced grid. Sibling cells are
 * equal-sized: area is deliberately meaningless, only nesting speaks.
 */
export function computeRectLayout(input: RectLayoutInput): RectLayoutResult {
  const warnings: Array<string> = []

  const universeIds = input.entities
    .filter((entity) => entity.special === 'universe')
    .map((entity) => entity.id)
  const emptyIds = input.entities
    .filter((entity) => entity.special === 'empty')
    .map((entity) => entity.id)
  const drawable = input.entities.filter((entity) => entity.special === 'none')

  if (drawable.length === 0) {
    return { rects: [], universeIds, emptyIds, warnings }
  }

  const order = new Map<EntityId, number>(
    input.entities.map((entity, index) => [entity.id, index]),
  )
  const classes = mergeEquivalent(drawable, input.relations, order)
  const forest = buildForest(classes, input.relations, warnings)

  const width = Math.max(MIN_VIEWPORT.width, input.viewport.width)
  const height = Math.max(MIN_VIEWPORT.height, input.viewport.height)
  // A displayed `unknown` puts its label at the canvas top-left; reserve
  // the strip so first-row rectangles don't collide with it.
  const topInset = CANVAS_PAD + (universeIds.length > 0 ? LABEL_STRIP : 0)
  const rootBox: Box = {
    x: CANVAS_PAD,
    y: topInset,
    width: width - CANVAS_PAD * 2,
    height: height - CANVAS_PAD - topInset,
  }

  // A displayed `unknown` makes the canvas itself an entity container:
  // its children share the space with one implicit "everything else"
  // slot. A bare canvas splits fully among top-level classes.
  const rootSlots = forest.roots.length + (universeIds.length > 0 ? 1 : 0)

  const rects: Array<EntityRect> = []
  layoutSiblings(forest.roots, rootBox, rootSlots, 1, rects, forest, warnings)

  return { rects, universeIds, emptyIds, warnings }
}

interface EntityClass {
  /** Members in declaration order; the first one names the class. */
  members: Array<TypeEntity>
  orderIndex: number
}

interface Forest {
  roots: Array<EntityClass>
  childrenOf: Map<EntityClass, Array<EntityClass>>
}

function mergeEquivalent(
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

function buildForest(
  classes: Array<EntityClass>,
  relations: Array<PairRelation>,
  warnings: Array<string>,
): Forest {
  // subsetOf.get(x) contains y ⟺ x ⊂ y (strict, classes already merged).
  const classOf = new Map<EntityId, EntityClass>()
  for (const cls of classes) {
    for (const member of cls.members) classOf.set(member.id, cls)
  }
  const subsetOf = new Map<EntityClass, Set<EntityClass>>(
    classes.map((cls) => [cls, new Set<EntityClass>()]),
  )
  for (const relation of relations) {
    const classA = classOf.get(relation.a)
    const classB = classOf.get(relation.b)
    if (!classA || !classB || classA === classB) continue
    if (relation.kind === 'subset') subsetOf.get(classA)?.add(classB)
    if (relation.kind === 'superset') subsetOf.get(classB)?.add(classA)
  }

  const parentOf = new Map<EntityClass, EntityClass | null>()
  for (const cls of classes) {
    const supersets = [...(subsetOf.get(cls) ?? [])]
    // Minimal superset: one that is not a superset of another candidate.
    const minimal = supersets.filter(
      (candidate) =>
        !supersets.some(
          (other) => other !== candidate && subsetOf.get(other)?.has(candidate),
        ),
    )
    minimal.sort((a, b) => a.orderIndex - b.orderIndex)
    parentOf.set(cls, minimal[0] ?? null)
  }

  // Guard against malformed matrices: a parent cycle would orphan its
  // members. Promote the earliest-declared cycle member to top level.
  for (const cls of classes) {
    const seen = new Set<EntityClass>([cls])
    let cursor = parentOf.get(cls) ?? null
    while (cursor) {
      if (seen.has(cursor)) {
        warnings.push(
          `containment cycle detected around "${cls.members[0].name}"; promoted to top level`,
        )
        parentOf.set(cls, null)
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor) ?? null
    }
  }

  const childrenOf = new Map<EntityClass, Array<EntityClass>>(
    classes.map((cls) => [cls, []]),
  )
  const roots: Array<EntityClass> = []
  for (const cls of classes) {
    const parent = parentOf.get(cls) ?? null
    if (parent) {
      childrenOf.get(parent)?.push(cls)
    } else {
      roots.push(cls)
    }
  }
  // Declaration order everywhere: stable cells, stable colors.
  for (const children of childrenOf.values()) {
    children.sort((a, b) => a.orderIndex - b.orderIndex)
  }
  roots.sort((a, b) => a.orderIndex - b.orderIndex)
  return { roots, childrenOf }
}

/**
 * Balanced grid for S slots: odd counts (above 1) round UP to the next
 * even number, which is then factored as cols×rows with cols ≥ rows and
 * the smallest possible difference (product rule).
 */
export function gridDimensions(slots: number): { cols: number; rows: number } {
  if (slots <= 1) return { cols: 1, rows: 1 }
  const even = slots % 2 === 0 ? slots : slots + 1
  let best = { cols: even, rows: 1 }
  for (let rows = 2; rows * rows <= even; rows += 1) {
    if (even % rows === 0) {
      const cols = even / rows
      if (cols >= rows && cols - rows < best.cols - best.rows) {
        best = { cols, rows }
      }
    }
  }
  return best
}

function layoutSiblings(
  siblings: Array<EntityClass>,
  container: Box,
  slots: number,
  depth: number,
  rects: Array<EntityRect>,
  forest: Forest,
  warnings: Array<string>,
): void {
  if (siblings.length === 0) return
  if (container.width <= 0 || container.height <= 0) {
    warnings.push(
      `container too small for ${siblings
        .map((cls) => cls.members[0].name)
        .join(', ')} at depth ${depth}; children skipped`,
    )
    return
  }

  const { cols, rows } = gridDimensions(slots)
  const cellWidth = Math.max(
    0,
    (container.width - (cols - 1) * CELL_GAP) / cols,
  )
  const cellHeight = Math.max(
    0,
    (container.height - (rows - 1) * CELL_GAP) / rows,
  )

  siblings.forEach((cls, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const outer: Box = {
      x: container.x + col * (cellWidth + CELL_GAP),
      y: container.y + row * (cellHeight + CELL_GAP),
      width: cellWidth,
      height: cellHeight,
    }

    const inset = cls.members.length * RING_INSET + CONTENT_PAD
    const contentBox: Box = {
      x: outer.x + inset,
      y: outer.y + inset + LABEL_STRIP,
      width: Math.max(0, outer.width - inset * 2),
      height: Math.max(0, outer.height - inset * 2 - LABEL_STRIP),
    }

    rects.push({
      key: cls.members
        .map((member) => member.id)
        .sort()
        .join('+'),
      entityIds: cls.members.map((member) => member.id),
      labels: cls.members.map((member) => member.name),
      outer,
      contentBox,
      depth,
      ringCount: cls.members.length,
      colorIndex: cls.orderIndex % 12,
    })

    const children = forest.childrenOf.get(cls) ?? []
    if (children.length > 0) {
      // An entity container always reserves one extra empty slot: the
      // container is presumed strictly larger than its children's union,
      // and the empty cell lets the ∅ background represent "the rest".
      layoutSiblings(
        children,
        contentBox,
        children.length + 1,
        depth + 1,
        rects,
        forest,
        warnings,
      )
    }
  })
}
