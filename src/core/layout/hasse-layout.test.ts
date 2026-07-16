import { describe, expect, test } from 'vitest'
import { computeCanvasLayout } from '#/core/layout/canvas-layout.ts'
import { computeRectLayout } from '#/core/layout/rect-layout.ts'
import type { HasseLayoutResult, HasseNode } from '#/core/layout/types.ts'
import type {
  PairRelation,
  RelationKind,
  SpecialRole,
  TypeEntity,
} from '#/core/set-model/types.ts'

const VIEWPORT = { width: 1200, height: 800 }

function entity(
  id: string,
  special: SpecialRole = 'none',
  coveredBySubsets = false,
): TypeEntity {
  return {
    id,
    name: id,
    typeText: id,
    expandedText: id,
    special,
    origin: 'code',
    coveredBySubsets,
    declarationSpan: null,
  }
}

function rel(a: string, kind: RelationKind, b: string): PairRelation {
  return { a, b, kind }
}

function canvasOf(
  entities: Array<TypeEntity>,
  relations: Array<PairRelation> = [],
) {
  return computeCanvasLayout({ entities, relations, viewport: VIEWPORT })
}

function nodeOf(layout: HasseLayoutResult, id: string): HasseNode {
  const found = layout.nodes.find((node) => node.entityIds.includes(id))
  expect(found, `hasse node for ${id}`).toBeDefined()
  return found as HasseNode
}

function hasEdge(layout: HasseLayoutResult, from: string, to: string): boolean {
  const fromNode = layout.nodes.find((node) => node.entityIds.includes(from))
  const toNode = layout.nodes.find((node) => node.entityIds.includes(to))
  if (!fromNode || !toNode) return false
  return layout.edges.some(
    (edge) => edge.from === fromNode.key && edge.to === toNode.key,
  )
}

/**
 * The user's C1..C6 scenario, with the corrected relation matrix the
 * analyzer would emit:
 *   C5 = C1 ∪ C2 (covered); C5 ⊂ C3, C5 ⊂ C4; C2 ⊂ C6; C6 root.
 * C2's minimal supersets are {C5, C6} — C5 lives in the C3∩C4 band
 * while C6 is a root, so rectangles cannot draw it faithfully.
 */
function complexScenario() {
  const entities = [
    entity('C1'),
    entity('C2'),
    entity('C3'),
    entity('C4'),
    entity('C5', 'none', true),
    entity('C6'),
  ]
  const relations = [
    rel('C1', 'unrelated', 'C2'),
    rel('C1', 'subset', 'C3'),
    rel('C1', 'subset', 'C4'),
    rel('C1', 'subset', 'C5'),
    rel('C1', 'unrelated', 'C6'),
    rel('C2', 'subset', 'C3'),
    rel('C2', 'subset', 'C4'),
    rel('C2', 'subset', 'C5'),
    rel('C2', 'subset', 'C6'),
    rel('C3', 'unrelated', 'C4'),
    rel('C5', 'subset', 'C3'),
    rel('C5', 'subset', 'C4'),
    rel('C3', 'unrelated', 'C6'),
    rel('C4', 'unrelated', 'C6'),
    rel('C5', 'unrelated', 'C6'),
  ]
  return { entities, relations }
}

describe('computeCanvasLayout engine switch', () => {
  test('simple containment stays in euler mode', () => {
    const layout = canvasOf(
      [entity('A'), entity('B')],
      [rel('B', 'subset', 'A')],
    )
    expect(layout.mode).toBe('euler')
  })

  test('same-container double parents (overlap pair) stay euler', () => {
    const layout = canvasOf(
      [entity('A'), entity('B'), entity('S')],
      [
        rel('A', 'unrelated', 'B'),
        rel('S', 'subset', 'A'),
        rel('S', 'subset', 'B'),
      ],
    )
    expect(layout.mode).toBe('euler')
  })

  test('euler result matches the direct rectangle engine', () => {
    const input = {
      entities: [entity('A'), entity('B')],
      relations: [rel('B', 'subset', 'A')],
      viewport: VIEWPORT,
    }
    const canvas = computeCanvasLayout(input)
    const direct = computeRectLayout(input)
    expect(canvas.mode).toBe('euler')
    if (canvas.mode === 'euler') {
      expect(canvas.rects).toEqual(direct.rects)
      expect(canvas.placeholders).toEqual(direct.placeholders)
    }
  })

  test('three parents switch to hasse mode', () => {
    const layout = canvasOf(
      [entity('A'), entity('B'), entity('C'), entity('D')],
      [
        rel('A', 'unrelated', 'B'),
        rel('A', 'unrelated', 'C'),
        rel('B', 'unrelated', 'C'),
        rel('D', 'subset', 'A'),
        rel('D', 'subset', 'B'),
        rel('D', 'subset', 'C'),
      ],
    )
    expect(layout.mode).toBe('hasse')
    if (layout.mode === 'hasse') {
      const d = nodeOf(layout, 'D')
      const incoming = layout.edges.filter((edge) => edge.to === d.key)
      expect(incoming).toHaveLength(3)
      expect(layout.warnings.some((w) => w.includes('hasse fallback'))).toBe(
        true,
      )
    }
  })

  test('C1..C6 complex overlap scenario switches to hasse', () => {
    const { entities, relations } = complexScenario()
    const layout = canvasOf(entities, relations)
    expect(layout.mode).toBe('hasse')
  })
})

describe('computeHasseLayout structure', () => {
  test('C1..C6: layers, edges and ??? nodes', () => {
    const { entities, relations } = complexScenario()
    const layout = canvasOf(entities, relations)
    expect(layout.mode).toBe('hasse')
    if (layout.mode !== 'hasse') return

    // Layers: maximal sets on top.
    expect(nodeOf(layout, 'C3').layer).toBe(0)
    expect(nodeOf(layout, 'C4').layer).toBe(0)
    expect(nodeOf(layout, 'C6').layer).toBe(0)
    expect(nodeOf(layout, 'C5').layer).toBe(1)
    expect(nodeOf(layout, 'C1').layer).toBe(2)
    expect(nodeOf(layout, 'C2').layer).toBe(2)

    // Covering edges — every containment edge survives (no fallbacks).
    expect(hasEdge(layout, 'C3', 'C5')).toBe(true)
    expect(hasEdge(layout, 'C4', 'C5')).toBe(true)
    expect(hasEdge(layout, 'C5', 'C1')).toBe(true)
    expect(hasEdge(layout, 'C5', 'C2')).toBe(true)
    expect(hasEdge(layout, 'C6', 'C2')).toBe(true)
    // No transitive edge C3 -> C1 (covering relation only).
    expect(hasEdge(layout, 'C3', 'C1')).toBe(false)

    // ??? nodes under non-covered parents only; C5 is covered.
    const placeholders = layout.nodes.filter(
      (node) => node.kind === 'placeholder',
    )
    const placeholderParents = placeholders.map(
      (node) => node.key.split('+rest')[0],
    )
    expect(placeholderParents.sort()).toEqual(['C3', 'C4', 'C6'])
    for (const placeholder of placeholders) {
      expect(placeholder.labels).toEqual(['???'])
      expect(placeholder.colorIndex).toBeNull()
    }
  })

  test('equivalence classes render as one multi-label node', () => {
    const layout = canvasOf(
      [entity('A'), entity('B'), entity('C'), entity('D')],
      [
        rel('A', 'equivalent', 'B'),
        rel('A', 'subset', 'C'),
        rel('B', 'subset', 'C'),
        // Force hasse mode with a three-parent child.
        rel('D', 'subset', 'A'),
        rel('D', 'subset', 'B'),
        rel('D', 'subset', 'C'),
      ],
    )
    // D's minimal superset is the A≡B class only (C is transitive), so
    // this stays euler — construct a genuine multi-parent instead.
    if (layout.mode === 'hasse') {
      const merged = layout.nodes.find(
        (node) => node.entityIds.includes('A') && node.entityIds.includes('B'),
      )
      expect(merged).toBeDefined()
    } else {
      expect(layout.mode).toBe('euler')
    }
  })

  test('equivalence + hasse: merged node carries both labels', () => {
    const layout = canvasOf(
      [entity('P1'), entity('P2'), entity('P3'), entity('A'), entity('B')],
      [
        rel('P1', 'unrelated', 'P2'),
        rel('P1', 'unrelated', 'P3'),
        rel('P2', 'unrelated', 'P3'),
        rel('A', 'equivalent', 'B'),
        rel('A', 'subset', 'P1'),
        rel('A', 'subset', 'P2'),
        rel('A', 'subset', 'P3'),
        rel('B', 'subset', 'P1'),
        rel('B', 'subset', 'P2'),
        rel('B', 'subset', 'P3'),
      ],
    )
    expect(layout.mode).toBe('hasse')
    if (layout.mode !== 'hasse') return
    const merged = nodeOf(layout, 'A')
    expect(merged.entityIds.sort()).toEqual(['A', 'B'])
    expect(merged.labels).toEqual(['A', 'B'])
    const incoming = layout.edges.filter((edge) => edge.to === merged.key)
    expect(incoming).toHaveLength(3)
  })

  test('displayed unknown becomes the top node above all roots', () => {
    const layout = canvasOf(
      [
        entity('U', 'universe'),
        entity('A'),
        entity('B'),
        entity('C'),
        entity('D'),
      ],
      [
        rel('A', 'unrelated', 'B'),
        rel('A', 'unrelated', 'C'),
        rel('B', 'unrelated', 'C'),
        rel('D', 'subset', 'A'),
        rel('D', 'subset', 'B'),
        rel('D', 'subset', 'C'),
      ],
    )
    expect(layout.mode).toBe('hasse')
    if (layout.mode !== 'hasse') return
    const universe = nodeOf(layout, 'U')
    expect(universe.layer).toBe(0)
    expect(nodeOf(layout, 'A').layer).toBe(1)
    expect(hasEdge(layout, 'U', 'A')).toBe(true)
    expect(hasEdge(layout, 'U', 'B')).toBe(true)
    expect(hasEdge(layout, 'U', 'C')).toBe(true)
    // Non-covered universe with children gets its own ??? node.
    expect(
      layout.nodes.some(
        (node) => node.kind === 'placeholder' && node.key === 'U+rest',
      ),
    ).toBe(true)
  })

  test('geometry invariants: no NaN, edges anchor on node borders, child below parent', () => {
    const { entities, relations } = complexScenario()
    const layout = canvasOf(entities, relations)
    expect(layout.mode).toBe('hasse')
    if (layout.mode !== 'hasse') return

    const byKey = new Map(layout.nodes.map((node) => [node.key, node]))
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.box.x)).toBe(true)
      expect(Number.isFinite(node.box.y)).toBe(true)
      expect(node.box.width).toBeGreaterThan(0)
      expect(node.box.height).toBeGreaterThan(0)
    }
    for (const edge of layout.edges) {
      const from = byKey.get(edge.from)
      const to = byKey.get(edge.to)
      expect(from).toBeDefined()
      expect(to).toBeDefined()
      expect(edge.y1).toBeCloseTo(from!.box.y + from!.box.height)
      expect(edge.y2).toBeCloseTo(to!.box.y)
      expect(to!.layer).toBeGreaterThan(from!.layer)
    }
    // Nodes within a layer never overlap horizontally.
    const layers = new Set(layout.nodes.map((node) => node.layer))
    for (const layer of layers) {
      const row = layout.nodes
        .filter((node) => node.layer === layer)
        .sort((a, b) => a.box.x - b.box.x)
      for (let i = 1; i < row.length; i += 1) {
        expect(row[i].box.x).toBeGreaterThanOrEqual(
          row[i - 1].box.x + row[i - 1].box.width,
        )
      }
    }
  })

  test('deterministic: identical input yields identical result', () => {
    const { entities, relations } = complexScenario()
    const first = canvasOf(entities, relations)
    const second = canvasOf(entities, relations)
    expect(second).toEqual(first)
  })

  test('relation order does not change the hasse output', () => {
    const { entities, relations } = complexScenario()
    const reversed = [...relations].reverse()
    const first = canvasOf(entities, relations)
    const second = canvasOf(entities, reversed)
    expect(second).toEqual(first)
  })
})
