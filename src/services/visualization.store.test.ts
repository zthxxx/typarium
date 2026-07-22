import { runInAction } from 'mobx'
import { describe, expect, test } from 'vitest'
import { createFakeAdapter } from '#/core/analysis/fake-adapter.ts'
import { MIN_VIEWPORT } from '#/core/layout/constants.ts'
import { AnalysisService } from '#/services/analysis.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import type { AnalysisResult, TypeEntity } from '#/core/set-model/types.ts'

function entity(
  name: string,
  span: { start: number; end: number } | null,
): TypeEntity {
  return {
    id: name,
    name,
    typeText: name,
    expandedText: name,
    special: 'none',
    origin: 'code',
    coveredBySubsets: false,
    declarationSpan: span,
  }
}

function makeStore(result: AnalysisResult) {
  const analysis = new AnalysisService(createFakeAdapter())
  runInAction(() => {
    analysis.lastGoodResult = result
  })
  const store = new VisualizationStore(analysis)
  return { analysis, store }
}

describe('VisualizationStore caret highlight', () => {
  const twoEntities: AnalysisResult = {
    entities: [
      entity('A', { start: 0, end: 20 }),
      entity('B', { start: 30, end: 50 }),
    ],
    relations: [{ a: 'A', b: 'B', kind: 'unrelated' }],
    diagnostics: [],
    anyEntityNames: [],
  }

  test('caret inside a declaration highlights that entity', () => {
    const { store } = makeStore(twoEntities)
    store.setCursorOffset(10)
    expect(store.cursorEntityId).toBe('A')
    store.setCursorOffset(40)
    expect(store.cursorEntityId).toBe('B')
    store.setCursorOffset(25)
    expect(store.cursorEntityId).toBeNull()
  })

  test('deleting the export clears the highlight without a cursor event', () => {
    const { analysis, store } = makeStore(twoEntities)
    store.setCursorOffset(10)
    expect(store.cursorEntityId).toBe('A')
    // The analysis moves on (entity A deleted) while the caret stays put:
    // the derived highlight must vanish on its own.
    runInAction(() => {
      analysis.lastGoodResult = {
        ...twoEntities,
        entities: [entity('B', { start: 0, end: 20 })],
      }
    })
    expect(store.cursorEntityId).toBe('B')
    runInAction(() => {
      analysis.lastGoodResult = { ...twoEntities, entities: [] }
    })
    expect(store.cursorEntityId).toBeNull()
  })

  test('blur clears the caret highlight', () => {
    const { store } = makeStore(twoEntities)
    store.setCursorOffset(10)
    store.clearCursor()
    expect(store.cursorEntityId).toBeNull()
    expect(store.activeEntityIds).toEqual([])
  })
})

describe('VisualizationStore hover class', () => {
  const equalPair: AnalysisResult = {
    entities: [
      entity('A', { start: 0, end: 20 }),
      entity('B', { start: 30, end: 50 }),
      { ...entity('P', null), origin: 'preset' },
    ],
    relations: [
      { a: 'A', b: 'B', kind: 'equivalent' },
      { a: 'A', b: 'P', kind: 'unrelated' },
      { a: 'B', b: 'P', kind: 'unrelated' },
    ],
    diagnostics: [],
    anyEntityNames: [],
  }

  test('hovering a class highlights every member and dims the rest', () => {
    const { store } = makeStore(equalPair)
    store.hoverClass(['A', 'B'])
    expect(store.isHighlighted(['A'])).toBe(true)
    expect(store.isHighlighted(['B'])).toBe(true)
    expect(store.isDimmed(['P'])).toBe(true)
    store.hoverClass(null)
    expect(store.hasActiveEntity).toBe(false)
  })

  test('editor spans cover every code-origin member of the hovered class', () => {
    const { store } = makeStore(equalPair)
    store.hoverClass(['A', 'B', 'P'])
    // P is a preset: nothing to highlight in the editor for it.
    expect(store.editorHighlightSpans).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 50 },
    ])
  })

  test('caret highlight never drives editor spans (hover only)', () => {
    const { store } = makeStore(equalPair)
    store.setCursorOffset(10)
    expect(store.activeEntityIds).toEqual(['A'])
    expect(store.editorHighlightSpans).toEqual([])
  })
})

describe('VisualizationStore diagram mode (ADR-0018)', () => {
  const drawable: AnalysisResult = {
    entities: [entity('A', null), entity('B', null)],
    relations: [{ a: 'B', b: 'A', kind: 'subset' }],
    diagnostics: [],
    anyEntityNames: [],
  }
  // D sits inside three mutually-unrelated parents: rectangles cannot
  // nest that faithfully, so Euler is undrawable.
  const undrawable: AnalysisResult = {
    entities: [
      entity('A', null),
      entity('B', null),
      entity('C', null),
      entity('D', null),
    ],
    relations: [
      { a: 'A', b: 'B', kind: 'unrelated' },
      { a: 'A', b: 'C', kind: 'unrelated' },
      { a: 'B', b: 'C', kind: 'unrelated' },
      { a: 'D', b: 'A', kind: 'subset' },
      { a: 'D', b: 'B', kind: 'subset' },
      { a: 'D', b: 'C', kind: 'subset' },
    ],
    diagnostics: [],
    anyEntityNames: [],
  }

  test('never chose → euler while drawable', () => {
    const { store } = makeStore(drawable)
    expect(store.eulerDrawable).toBe(true)
    expect(store.effectiveMode).toBe('euler')
    expect(store.layout?.mode).toBe('euler')
  })

  test('undrawable input forces hasse and flags euler unavailable', () => {
    const { store } = makeStore(undrawable)
    expect(store.eulerDrawable).toBe(false)
    expect(store.effectiveMode).toBe('hasse')
    expect(store.layout?.mode).toBe('hasse')
    expect(
      store.layout?.warnings.some((warning) =>
        warning.includes('hasse fallback'),
      ),
    ).toBe(true)
  })

  test('euler returns automatically when drawable again, unless hasse was pinned', () => {
    const { analysis, store } = makeStore(undrawable)
    expect(store.effectiveMode).toBe('hasse')
    // The user never chose: back to euler when the code allows it.
    runInAction(() => {
      analysis.lastGoodResult = drawable
    })
    expect(store.effectiveMode).toBe('euler')

    // Explicit euler choice behaves the same through a fallback cycle.
    store.chooseMode('euler')
    runInAction(() => {
      analysis.lastGoodResult = undrawable
    })
    expect(store.effectiveMode).toBe('hasse')
    runInAction(() => {
      analysis.lastGoodResult = drawable
    })
    expect(store.effectiveMode).toBe('euler')

    // A manual hasse pin sticks even when euler becomes drawable.
    store.chooseMode('hasse')
    expect(store.effectiveMode).toBe('hasse')
    expect(store.layout?.mode).toBe('hasse')
    runInAction(() => {
      analysis.lastGoodResult = undrawable
    })
    runInAction(() => {
      analysis.lastGoodResult = drawable
    })
    expect(store.effectiveMode).toBe('hasse')
    // Choosing euler releases the pin.
    store.chooseMode('euler')
    expect(store.effectiveMode).toBe('euler')
  })
})

describe('VisualizationStore viewport and layout', () => {
  test('viewport measurements clamp to the minimum canvas size', () => {
    const { store } = makeStore({
      entities: [],
      relations: [],
      diagnostics: [],
      anyEntityNames: [],
    })
    store.setViewport(10, 10)
    expect(store.viewportWidth).toBe(MIN_VIEWPORT.width)
    expect(store.viewportHeight).toBe(MIN_VIEWPORT.height)
  })

  test('a simple containment produces a nested euler layout', () => {
    const { store } = makeStore({
      entities: [entity('Parent', null), entity('Child', null)],
      relations: [{ a: 'Child', b: 'Parent', kind: 'subset' }],
      diagnostics: [],
      anyEntityNames: [],
    })
    store.setViewport(800, 600)
    const layout = store.layout
    expect(layout?.mode).toBe('euler')
    if (layout?.mode === 'euler') {
      expect(layout.rects.map((rect) => rect.labels[0])).toEqual([
        'Parent',
        'Child',
      ])
      expect(layout.rects[1].depth).toBeGreaterThan(layout.rects[0].depth)
    }
  })
})
