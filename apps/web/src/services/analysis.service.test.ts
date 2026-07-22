import { describe, expect, test } from 'vitest'
import { createFakeAdapter, EMPTY_RESULT } from '@typarium/language-adapter'
import { AnalysisService } from '#/services/analysis.service.ts'
import type { AnalysisResult, SourceDiagnostic } from '@typarium/set-model'

function resultNamed(name: string): AnalysisResult {
  return {
    entities: [
      {
        id: name,
        name,
        typeText: name,
        expandedText: name,
        special: 'none',
        origin: 'code',
        coveredBySubsets: false,
        declarationSpan: { start: 0, end: 10 },
      },
    ],
    relations: [],
    diagnostics: [],
    anyEntityNames: [],
  }
}

function errorDiagnostic(domain: SourceDiagnostic['domain']): SourceDiagnostic {
  return {
    message: `${domain} error`,
    span: { start: 0, end: 1 },
    severity: 'error',
    domain,
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('AnalysisService', () => {
  test('successful analysis becomes the last good result', async () => {
    const adapter = createFakeAdapter()
    const service = new AnalysisService(adapter)
    const pending = service.analyze('code', [])
    expect(service.analyzing).toBe(true)
    adapter.analyzeCalls[0].resolve(resultNamed('A'))
    await pending
    expect(service.analyzing).toBe(false)
    expect(service.lastGoodResult?.entities[0].name).toBe('A')
  })

  test('a stale ticket resolving late never overwrites the newest result', async () => {
    const adapter = createFakeAdapter()
    const service = new AnalysisService(adapter)
    const first = service.analyze('v1', [])
    const second = service.analyze('v2', [])
    adapter.analyzeCalls[1].resolve(resultNamed('NEW'))
    await second
    adapter.analyzeCalls[0].resolve(resultNamed('OLD'))
    await first
    expect(service.lastGoodResult?.entities[0].name).toBe('NEW')
  })

  test('type-domain errors hold the canvas on the last good result', async () => {
    const adapter = createFakeAdapter()
    const service = new AnalysisService(adapter)
    const good = service.analyze('good', [])
    adapter.analyzeCalls[0].resolve(resultNamed('GOOD'))
    await good

    const broken = service.analyze('broken', [])
    adapter.analyzeCalls[1].resolve({
      ...EMPTY_RESULT,
      diagnostics: [errorDiagnostic('type')],
    })
    await broken
    expect(service.lastGoodResult?.entities[0].name).toBe('GOOD')
    expect(service.diagnostics).toHaveLength(1)
  })

  test('value-domain errors do not block canvas updates', async () => {
    const adapter = createFakeAdapter()
    const service = new AnalysisService(adapter)
    const pending = service.analyze('code', [])
    adapter.analyzeCalls[0].resolve({
      ...resultNamed('FRESH'),
      diagnostics: [errorDiagnostic('value')],
    })
    await pending
    expect(service.lastGoodResult?.entities[0].name).toBe('FRESH')
  })

  test('adapter failure flags failed and recovers on the next success', async () => {
    const adapter = createFakeAdapter()
    const service = new AnalysisService(adapter)
    const failing = service.analyze('boom', [])
    adapter.analyzeCalls[0].reject(new Error('engine down'))
    await failing
    await flush()
    expect(service.failed).toBe(true)

    const recovering = service.analyze('ok', [])
    adapter.analyzeCalls[1].resolve(resultNamed('BACK'))
    await recovering
    expect(service.failed).toBe(false)
    expect(service.lastGoodResult?.entities[0].name).toBe('BACK')
  })

  test('hydration paints once, never overrides, never claims a fresh input', async () => {
    const adapter = createFakeAdapter()
    const service = new AnalysisService(adapter)
    service.hydrate(resultNamed('CACHED'))
    expect(service.lastGoodResult?.entities[0].name).toBe('CACHED')
    // Hydrated results are not fresh engine output: no snapshot key.
    expect(service.lastGoodInput).toBeNull()

    service.hydrate(resultNamed('SECOND'))
    expect(service.lastGoodResult?.entities[0].name).toBe('CACHED')

    // The live engine replaces the snapshot and records its input.
    const live = service.analyze('code', [])
    adapter.analyzeCalls[0].resolve(resultNamed('LIVE'))
    await live
    expect(service.lastGoodResult?.entities[0].name).toBe('LIVE')
    expect(service.lastGoodInput?.source).toBe('code')
    service.hydrate(resultNamed('LATE'))
    expect(service.lastGoodResult?.entities[0].name).toBe('LIVE')
  })

  test('a stale failure does not mark the newer in-flight analysis failed', async () => {
    const adapter = createFakeAdapter()
    const service = new AnalysisService(adapter)
    const first = service.analyze('v1', [])
    const second = service.analyze('v2', [])
    adapter.analyzeCalls[0].reject(new Error('stale boom'))
    await first
    await flush()
    expect(service.failed).toBe(false)
    adapter.analyzeCalls[1].resolve(resultNamed('OK'))
    await second
    expect(service.lastGoodResult?.entities[0].name).toBe('OK')
  })
})
