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
 * Rectangular containment layout, v3 (ADR-0012 + union coverage +
 * overlap bands).
 *
 * Pipeline: merge mutually-containing entities into classes (union-find)
 * → build the containment DAG (parents = ALL minimal strict supersets)
 * → recursively split each container on a balanced grid.
 *
 * Two rules beyond plain nesting:
 * - A container that IS the union of its children (`coveredBySubsets`)
 *   is filled completely: exact slot count, no implicit "everything
 *   else" cell, odd counts stay odd (3 children → 3×1).
 * - A child with exactly two parents that are siblings renders as an
 *   overlap band: the parents' rectangles extend into each other and
 *   the shared child sits in the doubly-contained strip — the closest
 *   a rectangle diagram gets to a partial Euler overlap.
 */
export function computeRectLayout(input: RectLayoutInput): RectLayoutResult {
  const warnings: Array<string> = []

  const universeEntities = input.entities.filter(
    (entity) => entity.special === 'universe',
  )
  const universeIds = universeEntities.map((entity) => entity.id)
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
  const dag = buildDag(classes, input.relations, warnings)

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
  // unless unknown is itself the union of the shown classes, it keeps
  // one implicit "everything else" slot. A bare canvas splits fully.
  const universeCovered =
    universeEntities.length > 0 &&
    universeEntities.some((entity) => entity.coveredBySubsets)
  const rects: Array<EntityRect> = []
  layoutContainer(
    dag.roots,
    rootBox,
    {
      covered: universeCovered,
      extraSlot: universeIds.length > 0 && !universeCovered,
    },
    1,
    rects,
    dag,
    warnings,
  )

  return { rects, universeIds, emptyIds, warnings }
}

interface EntityClass {
  /** Members in declaration order; the first one names the class. */
  members: Array<TypeEntity>
  orderIndex: number
}

/** Two sibling parents whose rectangles overlap around shared children. */
interface OverlapPair {
  left: EntityClass
  right: EntityClass
  bandChildren: Array<EntityClass>
}

interface Dag {
  roots: Array<EntityClass>
  /** Single-attached children only; band children live on their pair. */
  childrenOf: Map<EntityClass, Array<EntityClass>>
  /** Pair membership of a parent class, if any. */
  pairOf: Map<EntityClass, OverlapPair>
  coveredOf: Map<EntityClass, boolean>
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

type Attachment =
  | { kind: 'root' }
  | { kind: 'single'; parent: EntityClass }
  | { kind: 'band'; pair: OverlapPair }

function buildDag(
  classes: Array<EntityClass>,
  relations: Array<PairRelation>,
  warnings: Array<string>,
): Dag {
  // supersetsOf.get(x) contains y ⟺ x ⊂ y (strict; classes merged).
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

  // Along any containment chain the subset has strictly more supersets,
  // so this order processes every parent before its children.
  const topo = [...classes].sort((a, b) => {
    const bySupersets =
      (supersetsOf.get(a)?.size ?? 0) - (supersetsOf.get(b)?.size ?? 0)
    return bySupersets !== 0 ? bySupersets : a.orderIndex - b.orderIndex
  })

  const attachment = new Map<EntityClass, Attachment>()
  const pairOf = new Map<EntityClass, OverlapPair>()

  const containerKey = (cls: EntityClass): EntityClass | 'root' | null => {
    const attached = attachment.get(cls)
    if (!attached) return null
    if (attached.kind === 'root') return 'root'
    if (attached.kind === 'single') return attached.parent
    return null // band-attached parents are too complex to pair again
  }

  for (const cls of topo) {
    const supersets = [...(supersetsOf.get(cls) ?? [])]
    const minimal = supersets.filter(
      (candidate) =>
        !supersets.some(
          (other) =>
            other !== candidate && supersetsOf.get(other)?.has(candidate),
        ),
    )
    minimal.sort((a, b) => a.orderIndex - b.orderIndex)

    if (minimal.length === 0) {
      attachment.set(cls, { kind: 'root' })
      continue
    }
    if (minimal.length === 1) {
      attachment.set(cls, { kind: 'single', parent: minimal[0] })
      continue
    }
    if (minimal.length === 2) {
      const [first, second] = minimal
      const keyFirst = containerKey(first)
      const keySecond = containerKey(second)
      const sameContainer = keyFirst !== null && keyFirst === keySecond
      const pairedFirst = pairOf.get(first)
      const pairedSecond = pairOf.get(second)
      const pairable =
        sameContainer &&
        ((pairedFirst === undefined && pairedSecond === undefined) ||
          (pairedFirst !== undefined && pairedFirst === pairedSecond))
      if (pairable) {
        let pair = pairedFirst
        if (!pair) {
          pair = { left: first, right: second, bandChildren: [] }
          pairOf.set(first, pair)
          pairOf.set(second, pair)
        }
        pair.bandChildren.push(cls)
        attachment.set(cls, { kind: 'band', pair })
        continue
      }
      warnings.push(
        `entity "${cls.members[0].name}" has 2 parents in incompatible positions; drawing inside the earliest only`,
      )
      attachment.set(cls, { kind: 'single', parent: minimal[0] })
      continue
    }
    warnings.push(
      `entity "${cls.members[0].name}" has ${minimal.length} parents; drawing inside the earliest only`,
    )
    attachment.set(cls, { kind: 'single', parent: minimal[0] })
  }

  // Guard against malformed matrices: a parent cycle would orphan its
  // members. Promote the earliest-declared cycle member to top level.
  const effectiveParent = (cls: EntityClass): EntityClass | null => {
    const attached = attachment.get(cls)
    if (!attached || attached.kind === 'root') return null
    if (attached.kind === 'single') return attached.parent
    return attached.pair.left
  }
  for (const cls of classes) {
    const seen = new Set<EntityClass>([cls])
    let cursor = effectiveParent(cls)
    while (cursor) {
      if (seen.has(cursor)) {
        warnings.push(
          `containment cycle detected around "${cls.members[0].name}"; promoted to top level`,
        )
        attachment.set(cls, { kind: 'root' })
        break
      }
      seen.add(cursor)
      cursor = effectiveParent(cursor)
    }
  }

  const childrenOf = new Map<EntityClass, Array<EntityClass>>(
    classes.map((cls) => [cls, []]),
  )
  const roots: Array<EntityClass> = []
  for (const cls of classes) {
    const attached = attachment.get(cls) ?? { kind: 'root' as const }
    if (attached.kind === 'single') {
      childrenOf.get(attached.parent)?.push(cls)
    } else if (attached.kind === 'root') {
      roots.push(cls)
    }
    // band children are reachable through their pair only
  }
  // Declaration order everywhere: stable cells, stable colors.
  for (const children of childrenOf.values()) {
    children.sort((a, b) => a.orderIndex - b.orderIndex)
  }
  roots.sort((a, b) => a.orderIndex - b.orderIndex)
  for (const pair of new Set(pairOf.values())) {
    pair.bandChildren.sort((a, b) => a.orderIndex - b.orderIndex)
  }

  const coveredOf = new Map<EntityClass, boolean>(
    classes.map((cls) => [
      cls,
      cls.members.some((member) => member.coveredBySubsets),
    ]),
  )

  return { roots, childrenOf, pairOf, coveredOf }
}

/**
 * Balanced grid for S slots: odd counts (above 1) round UP to the next
 * even number, which is then factored as cols×rows with cols ≥ rows and
 * the smallest possible difference (product rule).
 */
export function gridDimensions(slots: number): { cols: number; rows: number } {
  if (slots <= 1) return { cols: 1, rows: 1 }
  return factorGrid(slots % 2 === 0 ? slots : slots + 1)
}

/**
 * Exact grid for union-covered containers: the count is NOT rounded —
 * children must fill the container completely, so 3 slots means 3×1
 * (never 2×2 with a hole). Primes lay out as a single row.
 */
export function exactGridDimensions(slots: number): {
  cols: number
  rows: number
} {
  if (slots <= 1) return { cols: 1, rows: 1 }
  return factorGrid(slots)
}

function factorGrid(count: number): { cols: number; rows: number } {
  let best = { cols: count, rows: 1 }
  for (let rows = 2; rows * rows <= count; rows += 1) {
    if (count % rows === 0) {
      const cols = count / rows
      if (cols >= rows && cols - rows < best.cols - best.rows) {
        best = { cols, rows }
      }
    }
  }
  return best
}

/** Fraction of a pair's combined width covered by EACH parent. */
const PAIR_SPREAD = 0.62

interface ContainerMode {
  /** Container equals the union of its children: fill it exactly. */
  covered: boolean
  /** Reserve one extra empty slot ("everything else"). */
  extraSlot: boolean
}

/** One grid occupant: a lone class, or an overlapping parent pair. */
type LayoutUnit =
  | { kind: 'single'; cls: EntityClass; width: 1 }
  | { kind: 'pair'; pair: OverlapPair; width: 2 }

function layoutContainer(
  children: Array<EntityClass>,
  container: Box,
  mode: ContainerMode,
  depth: number,
  rects: Array<EntityRect>,
  dag: Dag,
  warnings: Array<string>,
): void {
  if (children.length === 0) return
  if (container.width <= 0 || container.height <= 0) {
    warnings.push(
      `container too small for ${children
        .map((cls) => cls.members[0].name)
        .join(', ')} at depth ${depth}; children skipped`,
    )
    return
  }

  // Group overlap-pair members into one double-width unit; the pair
  // sits at the earlier member's position in declaration order.
  const units: Array<LayoutUnit> = []
  const consumed = new Set<EntityClass>()
  for (const cls of children) {
    if (consumed.has(cls)) continue
    const pair = dag.pairOf.get(cls)
    const partner = pair
      ? pair.left === cls
        ? pair.right
        : pair.left
      : undefined
    if (pair && partner && children.includes(partner)) {
      units.push({ kind: 'pair', pair, width: 2 })
      consumed.add(pair.left)
      consumed.add(pair.right)
    } else {
      units.push({ kind: 'single', cls, width: 1 })
      consumed.add(cls)
    }
  }

  const totalWidth = units.reduce((sum, unit) => sum + unit.width, 0)
  const slots = totalWidth + (mode.extraSlot ? 1 : 0)
  const { cols, rows: plannedRows } = mode.covered
    ? exactGridDimensions(slots)
    : gridDimensions(slots)

  // Row-major packing; a double unit that would straddle the row edge
  // wraps to the next row, leaving a hole.
  const placements: Array<{ unit: LayoutUnit; col: number; row: number }> = []
  let col = 0
  let row = 0
  let holes = 0
  for (const unit of units) {
    if (col + unit.width > cols) {
      holes += cols - col
      row += 1
      col = 0
    }
    placements.push({ unit, col, row })
    col += unit.width
    if (col >= cols) {
      row += 1
      col = 0
    }
  }
  const rowCount = Math.max(plannedRows, row + (col > 0 ? 1 : 0))
  if (mode.covered && holes > 0) {
    warnings.push(
      `covered container at depth ${depth} left ${holes} empty cell(s): an overlap pair wrapped to the next row`,
    )
  }

  const cellWidth = Math.max(
    0,
    (container.width - (cols - 1) * CELL_GAP) / cols,
  )
  const cellHeight = Math.max(
    0,
    (container.height - (rowCount - 1) * CELL_GAP) / rowCount,
  )

  for (const placement of placements) {
    const originX = container.x + placement.col * (cellWidth + CELL_GAP)
    const originY = container.y + placement.row * (cellHeight + CELL_GAP)

    if (placement.unit.kind === 'single') {
      const outer: Box = {
        x: originX,
        y: originY,
        width: cellWidth,
        height: cellHeight,
      }
      layoutClass(placement.unit.cls, outer, depth, rects, dag, warnings)
      continue
    }

    const pair = placement.unit.pair
    const combinedWidth = cellWidth * 2 + CELL_GAP
    const parentWidth = combinedWidth * PAIR_SPREAD
    const leftOuter: Box = {
      x: originX,
      y: originY,
      width: parentWidth,
      height: cellHeight,
    }
    const rightOuter: Box = {
      x: originX + combinedWidth * (1 - PAIR_SPREAD),
      y: originY,
      width: parentWidth,
      height: cellHeight,
    }

    const leftRect = pushRect(pair.left, leftOuter, depth, rects)
    const rightRect = pushRect(pair.right, rightOuter, depth, rects)

    // The band: the strip contained by BOTH parents' content boxes.
    const band = intersectBoxes(leftRect.contentBox, rightRect.contentBox)
    if (band.width <= 0 || band.height <= 0) {
      warnings.push(
        `overlap band between "${pair.left.members[0].name}" and "${pair.right.members[0].name}" is too small; shared children skipped`,
      )
    } else {
      const count = pair.bandChildren.length
      const bandCellHeight = Math.max(
        0,
        (band.height - (count - 1) * CELL_GAP) / count,
      )
      pair.bandChildren.forEach((child, index) => {
        const childOuter: Box = {
          x: band.x,
          y: band.y + index * (bandCellHeight + CELL_GAP),
          width: band.width,
          height: bandCellHeight,
        }
        layoutClass(child, childOuter, depth + 1, rects, dag, warnings)
      })
    }

    // Exclusive children keep to the strip their parent does not share —
    // bounded by the OTHER parent's outer edge (not just the band), so
    // an exclusive child never touches the partner rectangle.
    const leftExclusive: Box = {
      ...leftRect.contentBox,
      width: Math.max(0, rightOuter.x - CELL_GAP - leftRect.contentBox.x),
    }
    const rightExclusiveX = leftOuter.x + leftOuter.width + CELL_GAP
    const rightExclusive: Box = {
      ...rightRect.contentBox,
      x: rightExclusiveX,
      width: Math.max(
        0,
        rightRect.contentBox.x + rightRect.contentBox.width - rightExclusiveX,
      ),
    }
    layoutOwnChildren(pair.left, leftExclusive, depth, rects, dag, warnings)
    layoutOwnChildren(pair.right, rightExclusive, depth, rects, dag, warnings)
  }
}

/** Push the rect for a class and lay out its own children inside it. */
function layoutClass(
  cls: EntityClass,
  outer: Box,
  depth: number,
  rects: Array<EntityRect>,
  dag: Dag,
  warnings: Array<string>,
): void {
  const rect = pushRect(cls, outer, depth, rects)
  layoutOwnChildren(cls, rect.contentBox, depth, rects, dag, warnings)
}

function layoutOwnChildren(
  cls: EntityClass,
  box: Box,
  depth: number,
  rects: Array<EntityRect>,
  dag: Dag,
  warnings: Array<string>,
): void {
  const children = dag.childrenOf.get(cls) ?? []
  if (children.length === 0) return
  const covered = dag.coveredOf.get(cls) ?? false
  layoutContainer(
    children,
    box,
    { covered, extraSlot: !covered },
    depth + 1,
    rects,
    dag,
    warnings,
  )
}

function pushRect(
  cls: EntityClass,
  outer: Box,
  depth: number,
  rects: Array<EntityRect>,
): EntityRect {
  const inset = cls.members.length * RING_INSET + CONTENT_PAD
  const contentBox: Box = {
    x: outer.x + inset,
    y: outer.y + inset + LABEL_STRIP,
    width: Math.max(0, outer.width - inset * 2),
    height: Math.max(0, outer.height - inset * 2 - LABEL_STRIP),
  }
  const rect: EntityRect = {
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
  }
  rects.push(rect)
  return rect
}

function intersectBoxes(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return { x, y, width: right - x, height: bottom - y }
}
