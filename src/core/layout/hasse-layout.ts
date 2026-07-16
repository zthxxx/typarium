import {
  CANVAS_PAD,
  HASSE_LAYER_GAP,
  HASSE_NODE_GAP,
  HASSE_NODE_HEIGHT,
  MIN_VIEWPORT,
} from '#/core/layout/constants.ts'
import {
  buildSupersets,
  classKey,
  mergeEquivalent,
  minimalSupersets,
} from '#/core/layout/containment.ts'
import type { EntityClass } from '#/core/layout/containment.ts'
import type {
  Box,
  HasseEdge,
  HasseLayoutResult,
  HasseNode,
  RectLayoutInput,
} from '#/core/layout/types.ts'
import type { EntityId } from '#/core/set-model/types.ts'

/**
 * Layered Hasse layout (ADR-0017): the lossless fallback when the
 * rectangle engine cannot draw the containment DAG faithfully.
 *
 * - node = equivalence class (multi-label), plus one ??? child under
 *   every non-covered class that has children (same "everything else"
 *   semantics as the rectangle placeholders)
 * - edge = covering containment (ALL minimal strict supersets — no
 *   parent-count limits here)
 * - a displayed `unknown` becomes the top node with synthesized edges
 *   to every root: it contains everything by definition
 * - layer = longest path from the maximal sets; deterministic
 *   barycenter pass orders each layer under its parents
 */
export function computeHasseLayout(input: RectLayoutInput): HasseLayoutResult {
  const warnings: Array<string> = []

  const universeEntities = input.entities.filter(
    (entity) => entity.special === 'universe',
  )
  const universeIds = universeEntities.map((entity) => entity.id)
  const emptyIds = input.entities
    .filter((entity) => entity.special === 'empty')
    .map((entity) => entity.id)
  const drawable = input.entities.filter((entity) => entity.special === 'none')

  if (drawable.length === 0 && universeEntities.length === 0) {
    return { nodes: [], edges: [], universeIds, emptyIds, warnings }
  }

  const order = new Map<EntityId, number>(
    input.entities.map((entity, index) => [entity.id, index]),
  )
  const classes = mergeEquivalent(drawable, input.relations, order)
  const supersetsOf = buildSupersets(classes, input.relations)

  // Parents per class: the full covering relation, no fallbacks.
  const parentsOf = new Map<EntityClass, Array<EntityClass>>(
    classes.map((cls) => [cls, minimalSupersets(cls, supersetsOf)]),
  )

  // A displayed unknown is the maximum element: parent of every root.
  const universeClass: EntityClass | null =
    universeEntities.length > 0
      ? {
          members: [...universeEntities].sort(
            (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
          ),
          orderIndex: order.get(universeEntities[0].id) ?? 0,
        }
      : null
  const allClassesRaw = universeClass ? [universeClass, ...classes] : classes
  if (universeClass) {
    parentsOf.set(universeClass, [])
    for (const cls of classes) {
      if ((parentsOf.get(cls) ?? []).length === 0) {
        parentsOf.set(cls, [universeClass])
      }
    }
  }

  // Isolated singletons — no containment edge in either direction —
  // leave the layered flow entirely: packing them into layer 0 widens
  // the top row and skews the connected diagram (product feedback).
  // They render as a compact grid tucked into the top-right corner.
  const hasChildOf = new Set<EntityClass>()
  for (const cls of allClassesRaw) {
    for (const parent of parentsOf.get(cls) ?? []) hasChildOf.add(parent)
  }
  const isolated = allClassesRaw.filter(
    (cls) =>
      cls !== universeClass &&
      (parentsOf.get(cls) ?? []).length === 0 &&
      !hasChildOf.has(cls),
  )
  const isolatedSet = new Set(isolated)
  const allClasses = allClassesRaw.filter((cls) => !isolatedSet.has(cls))

  // Kahn-style layering: layer(v) = longest path from a root. Tolerates
  // malformed cycles by dumping unprocessed nodes into a final layer.
  const layerOf = new Map<EntityClass, number>()
  const childCount = new Map<EntityClass, Array<EntityClass>>(
    allClasses.map((cls) => [cls, []]),
  )
  const indegree = new Map<EntityClass, number>()
  for (const cls of allClasses) {
    const parents = parentsOf.get(cls) ?? []
    indegree.set(cls, parents.length)
    for (const parent of parents) childCount.get(parent)?.push(cls)
  }
  let frontier = allClasses.filter((cls) => (indegree.get(cls) ?? 0) === 0)
  let layer = 0
  let processed = 0
  while (frontier.length > 0) {
    const next: Array<EntityClass> = []
    for (const cls of frontier) {
      layerOf.set(cls, Math.max(layerOf.get(cls) ?? 0, layer))
      processed += 1
      for (const child of childCount.get(cls) ?? []) {
        const remaining = (indegree.get(child) ?? 1) - 1
        indegree.set(child, remaining)
        if (remaining === 0) next.push(child)
      }
    }
    frontier = next
    layer += 1
  }
  if (processed < allClasses.length) {
    warnings.push(
      'containment cycle detected; affected nodes appended to the last layer',
    )
    for (const cls of allClasses) {
      if (!layerOf.has(cls)) layerOf.set(cls, layer)
    }
  }

  // ??? placeholder nodes: a non-covered class with children keeps
  // "everything else" space — shown explicitly, as in rectangle mode.
  interface PlannedNode {
    key: string
    cls: EntityClass | null
    parentKeys: Array<string>
    labels: Array<string>
    kind: 'entity' | 'placeholder'
    colorIndex: number | null
    layer: number
    orderIndex: number
  }
  const planned: Array<PlannedNode> = []
  const coveredOf = (cls: EntityClass): boolean =>
    cls.members.some((member) => member.coveredBySubsets)

  for (const cls of allClasses) {
    planned.push({
      key: classKey(cls),
      cls,
      parentKeys: (parentsOf.get(cls) ?? []).map(classKey),
      labels: cls.members.map((member) => member.name),
      kind: 'entity',
      colorIndex: cls.orderIndex % 12,
      layer: layerOf.get(cls) ?? 0,
      orderIndex: cls.orderIndex,
    })
  }
  for (const cls of allClasses) {
    const hasChildren = (childCount.get(cls) ?? []).length > 0
    if (hasChildren && !coveredOf(cls)) {
      planned.push({
        key: `${classKey(cls)}+rest`,
        cls: null,
        parentKeys: [classKey(cls)],
        labels: ['???'],
        kind: 'placeholder',
        colorIndex: null,
        layer: (layerOf.get(cls) ?? 0) + 1,
        orderIndex: Number.MAX_SAFE_INTEGER,
      })
    }
  }

  // Geometry: layers share the vertical span evenly; one barycenter
  // pass orders each layer under the mean x of its parents.
  const width = Math.max(MIN_VIEWPORT.width, input.viewport.width)
  const height = Math.max(MIN_VIEWPORT.height, input.viewport.height)

  // Isolated cluster geometry (computed first so the layered diagram
  // can center within the remaining width).
  const isolatedSorted = [...isolated].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  )
  const isolatedWidths = isolatedSorted.map((cls) =>
    Math.min(
      Math.max(
        72,
        cls.members.map((m) => m.name).join(' ≡ ').length * 8.5 + 24,
      ),
      Math.floor(width / 4),
    ),
  )
  const isolatedColWidth = Math.max(0, ...isolatedWidths)
  const isolatedCols = isolatedSorted.length > 5 ? 2 : 1
  const isolatedRegionWidth =
    isolatedSorted.length > 0
      ? isolatedCols * isolatedColWidth +
        (isolatedCols - 1) * HASSE_NODE_GAP +
        CANVAS_PAD
      : 0
  const hasLayered = planned.length > 0
  const mainWidth = hasLayered ? width - isolatedRegionWidth : width

  const layerCount = hasLayered
    ? Math.max(...planned.map((node) => node.layer)) + 1
    : 0
  const availableHeight = height - CANVAS_PAD * 2 - HASSE_NODE_HEIGHT
  const layerStep =
    layerCount <= 1
      ? 0
      : Math.min(
          Math.max(availableHeight / (layerCount - 1), HASSE_NODE_HEIGHT + 8),
          Math.max(HASSE_LAYER_GAP + HASSE_NODE_HEIGHT, 1),
        )
  const usedHeight = (layerCount - 1) * layerStep + HASSE_NODE_HEIGHT
  const topY = Math.max(CANVAS_PAD, (height - usedHeight) / 2)

  const nodeWidth = (labels: Array<string>, kind: string): number => {
    if (kind === 'placeholder') return 64
    const text = labels.join(' ≡ ')
    return Math.min(
      Math.max(72, text.length * 8.5 + 24),
      Math.floor(mainWidth / 3),
    )
  }

  const boxOf = new Map<string, Box>()
  const nodes: Array<HasseNode> = []
  for (let currentLayer = 0; currentLayer < layerCount; currentLayer += 1) {
    const row = planned.filter((node) => node.layer === currentLayer)
    // Barycenter: mean x of already-placed parents; declaration order
    // breaks ties and orders parentless rows.
    const scored = row.map((node) => {
      const parentXs = node.parentKeys
        .map((key) => boxOf.get(key))
        .filter((box): box is Box => Boolean(box))
        .map((box) => box.x + box.width / 2)
      const barycenter =
        parentXs.length > 0
          ? parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length
          : Number.MAX_SAFE_INTEGER
      return { node, barycenter }
    })
    scored.sort(
      (a, b) =>
        a.barycenter - b.barycenter ||
        a.node.orderIndex - b.node.orderIndex ||
        a.node.key.localeCompare(b.node.key),
    )

    let widths = scored.map(({ node }) => nodeWidth(node.labels, node.kind))
    let totalWidth =
      widths.reduce((sum, w) => sum + w, 0) +
      HASSE_NODE_GAP * (widths.length - 1)
    const available = mainWidth - CANVAS_PAD * 2
    if (totalWidth > available) {
      const scale = Math.max(
        0.35,
        (available - HASSE_NODE_GAP * (widths.length - 1)) /
          widths.reduce((sum, w) => sum + w, 0),
      )
      widths = widths.map((w) => Math.max(40, Math.floor(w * scale)))
      totalWidth =
        widths.reduce((sum, w) => sum + w, 0) +
        HASSE_NODE_GAP * (widths.length - 1)
      warnings.push(
        `hasse layer ${currentLayer} exceeds the viewport width; node chips compressed`,
      )
    }

    let x = Math.max(CANVAS_PAD, (mainWidth - totalWidth) / 2)
    const y = topY + currentLayer * layerStep
    scored.forEach(({ node }, index) => {
      const box: Box = {
        x,
        y,
        width: widths[index],
        height: HASSE_NODE_HEIGHT,
      }
      boxOf.set(node.key, box)
      nodes.push({
        key: node.key,
        entityIds: node.cls ? node.cls.members.map((member) => member.id) : [],
        labels: node.labels,
        kind: node.kind,
        box,
        colorIndex: node.colorIndex,
        layer: node.layer,
      })
      x += widths[index] + HASSE_NODE_GAP
    })
  }

  // Isolated cluster: compact wrap grid, top-right, declaration order.
  if (isolatedSorted.length > 0) {
    const gridLeft = hasLayered
      ? width - CANVAS_PAD - (isolatedRegionWidth - CANVAS_PAD)
      : Math.max(
          CANVAS_PAD,
          (width -
            (isolatedCols * isolatedColWidth +
              (isolatedCols - 1) * HASSE_NODE_GAP)) /
            2,
        )
    const gridTop = CANVAS_PAD + 8
    isolatedSorted.forEach((cls, index) => {
      const col = index % isolatedCols
      const row = Math.floor(index / isolatedCols)
      const box: Box = {
        x: gridLeft + col * (isolatedColWidth + HASSE_NODE_GAP),
        y: gridTop + row * (HASSE_NODE_HEIGHT + 10),
        width: isolatedWidths[index],
        height: HASSE_NODE_HEIGHT,
      }
      const key = classKey(cls)
      boxOf.set(key, box)
      nodes.push({
        key,
        entityIds: cls.members.map((member) => member.id),
        labels: cls.members.map((member) => member.name),
        kind: 'entity',
        box,
        colorIndex: cls.orderIndex % 12,
        layer: 0,
      })
    })
  }

  const edges: Array<HasseEdge> = []
  for (const node of planned) {
    const childBox = boxOf.get(node.key)
    if (!childBox) continue
    for (const parentKey of node.parentKeys) {
      const parentBox = boxOf.get(parentKey)
      if (!parentBox) continue
      edges.push({
        from: parentKey,
        to: node.key,
        x1: parentBox.x + parentBox.width / 2,
        y1: parentBox.y + parentBox.height,
        x2: childBox.x + childBox.width / 2,
        y2: childBox.y,
      })
    }
  }

  return { nodes, edges, universeIds, emptyIds, warnings }
}
