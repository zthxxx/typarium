import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createFakeAdapter,
  EMPTY_RESULT,
} from '#/core/analysis/fake-adapter.ts'
import { AnalysisService } from '#/services/analysis.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import type { FakeLanguageAdapter } from '#/core/analysis/fake-adapter.ts'
import type {
  PersistenceService,
  StoredDocument,
} from '#/services/persistence.service.ts'
import type { SourceDiagnostic } from '#/core/set-model/types.ts'

const ANALYZE_DEBOUNCE_MS = 1_200
const CHECK_DEBOUNCE_MS = 350
const SAVE_DEBOUNCE_MS = 300

function diagnostic(message: string): SourceDiagnostic {
  return {
    message,
    span: { start: 0, end: 1 },
    severity: 'error',
    domain: 'type',
  }
}

interface Harness {
  adapter: FakeLanguageAdapter
  analysis: AnalysisService
  editor: EditorService
  saved: Array<Omit<StoredDocument, 'updatedAt'>>
}

function makeHarness(): Harness {
  const adapter = createFakeAdapter()
  const analysis = new AnalysisService(adapter)
  const saved: Array<Omit<StoredDocument, 'updatedAt'>> = []
  const persistence = {
    saveDocument: (document: Omit<StoredDocument, 'updatedAt'>) => {
      saved.push(document)
      return Promise.resolve()
    },
    loadDocument: () => Promise.resolve(null),
  } as unknown as PersistenceService
  const editor = new EditorService(analysis, persistence)
  editor.connectPresets({
    virtualTypes: () => [{ name: 'string', typeText: 'string' }],
    activeLabels: () => ['string'],
  })
  return { adapter, analysis, editor, saved }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('EditorService debounce pipeline', () => {
  test('keystrokes coalesce into one analyze after the idle window', async () => {
    const { adapter, editor } = makeHarness()
    editor.setCode('a')
    editor.setCode('ab')
    editor.setCode('abc')
    expect(editor.analyzeQueued).toBe(true)
    await vi.advanceTimersByTimeAsync(ANALYZE_DEBOUNCE_MS - 1)
    expect(adapter.analyzeCalls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(adapter.analyzeCalls).toHaveLength(1)
    expect(adapter.analyzeCalls[0].source).toBe('abc')
    expect(adapter.analyzeCalls[0].virtualTypes).toEqual([
      { name: 'string', typeText: 'string' },
    ])
    expect(editor.analyzeQueued).toBe(false)
  })

  test('analyzeNow cancels the queued debounce instead of double-analyzing', async () => {
    const { adapter, editor } = makeHarness()
    editor.setCode('draft')
    editor.analyzeNow()
    expect(adapter.analyzeCalls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(ANALYZE_DEBOUNCE_MS * 2)
    expect(adapter.analyzeCalls).toHaveLength(1)
  })

  test('flushPendingAnalyze is a no-op when nothing is queued', async () => {
    const { adapter, editor } = makeHarness()
    editor.flushPendingAnalyze()
    await vi.advanceTimersByTimeAsync(ANALYZE_DEBOUNCE_MS)
    expect(adapter.analyzeCalls).toHaveLength(0)

    editor.setCode('x')
    editor.flushPendingAnalyze()
    expect(adapter.analyzeCalls).toHaveLength(1)
  })

  test('replaceCode analyzes immediately (boot restore, share links)', () => {
    const { adapter, editor } = makeHarness()
    editor.replaceCode('export type A = string')
    expect(adapter.analyzeCalls).toHaveLength(1)
  })

  test('a stale check resolving late never overwrites newer squiggles', async () => {
    const { adapter, editor } = makeHarness()
    editor.setCode('v1')
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS)
    editor.setCode('v2')
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS)
    expect(adapter.checkCalls).toHaveLength(2)

    adapter.checkCalls[1].resolve([diagnostic('new')])
    await vi.advanceTimersByTimeAsync(0)
    adapter.checkCalls[0].resolve([diagnostic('old')])
    await vi.advanceTimersByTimeAsync(0)
    expect(editor.editorDiagnostics.map((entry) => entry.message)).toEqual([
      'new',
    ])
  })

  test('saves debounce and carry code, language and active presets', async () => {
    const { editor, saved } = makeHarness()
    editor.setCode('draft')
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    expect(saved).toEqual([
      { code: 'draft', languageId: 'fake', presets: ['string'] },
    ])
  })

  test('type acquisition re-runs check and analyze against the same code', async () => {
    const { adapter, editor } = makeHarness()
    editor.replaceCode('import { x } from "pkg"')
    expect(adapter.analyzeCalls).toHaveLength(1)
    adapter.analyzeCalls[0].resolve(EMPTY_RESULT)

    adapter.emitTypesAcquired()
    expect(adapter.analyzeCalls).toHaveLength(2)
    expect(adapter.analyzeCalls[1].source).toBe('import { x } from "pkg"')
    await vi.advanceTimersByTimeAsync(CHECK_DEBOUNCE_MS)
    expect(adapter.checkCalls.length).toBeGreaterThan(0)
  })
})

describe('EditorService snippet insertion', () => {
  test('first snippet lands as C1 in empty code', () => {
    const { editor } = makeHarness()
    editor.insertSnippetLine('string | number')
    expect(editor.code).toBe('export type C1 = string | number\n')
  })

  test('numbering continues past the highest existing CN', () => {
    const { editor } = makeHarness()
    editor.replaceCode('export type C1 = string\n\nexport type C7 = number\n')
    editor.insertSnippetLine('boolean')
    expect(editor.code).toBe(
      'export type C1 = string\n\nexport type C7 = number\n\nexport type C8 = boolean\n',
    )
  })
})
