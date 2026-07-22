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
    expect(store.activeEntityId).toBeNull()
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
