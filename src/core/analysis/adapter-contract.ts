import { describe, expect, test } from 'vitest'
import type { LanguageAdapter, VirtualType } from '#/core/analysis/adapter.ts'
import type { AnalysisResult } from '#/core/set-model/types.ts'

/**
 * The cross-adapter contract suite: the same IR assertions run against
 * EVERY LanguageAdapter implementation (currently the TypeScript one
 * and the fake reference language). This is what backs the L in the
 * architecture doc's SOLID mapping — adapter substitutability is
 * verified, not declared.
 *
 * Test-kit module: imports vitest, so only *.test.ts files import it.
 */

export interface AdapterContractContext {
  adapter: LanguageAdapter
  /** A virtual type expression valid in this language. */
  virtualType: VirtualType
}

const VALID_KINDS = new Set(['equivalent', 'subset', 'superset', 'unrelated'])

function expectWellFormed(result: AnalysisResult): void {
  const ids = result.entities.map((entity) => entity.id)
  expect(new Set(ids).size).toBe(ids.length)

  for (const entity of result.entities) {
    expect(entity.name).not.toBe('')
    expect(entity.typeText).not.toBe('')
    if (entity.declarationSpan) {
      expect(entity.declarationSpan.start).toBeGreaterThanOrEqual(0)
      expect(entity.declarationSpan.end).toBeGreaterThanOrEqual(
        entity.declarationSpan.start,
      )
    }
  }

  // Pairwise completeness: exactly one relation per unordered pair of
  // DRAWABLE entities, every id resolving, every kind a known value.
  const drawableIds = new Set(
    result.entities
      .filter((entity) => entity.special === 'none')
      .map((entity) => entity.id),
  )
  const pairs = new Set<string>()
  for (const relation of result.relations) {
    expect(drawableIds.has(relation.a)).toBe(true)
    expect(drawableIds.has(relation.b)).toBe(true)
    expect(relation.a).not.toBe(relation.b)
    expect(VALID_KINDS.has(relation.kind)).toBe(true)
    const key = [relation.a, relation.b].sort().join('+')
    expect(pairs.has(key)).toBe(false)
    pairs.add(key)
  }
  const n = drawableIds.size
  expect(result.relations).toHaveLength((n * (n - 1)) / 2)

  const names = new Set(result.entities.map((entity) => entity.name))
  for (const anyName of result.anyEntityNames) {
    expect(names.has(anyName)).toBe(true)
  }

  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.span.start).toBeGreaterThanOrEqual(0)
    expect(diagnostic.span.end).toBeGreaterThanOrEqual(diagnostic.span.start)
    expect(['error', 'warning']).toContain(diagnostic.severity)
    expect(['syntax', 'type', 'value']).toContain(diagnostic.domain)
  }
}

export function describeAdapterContract(
  name: string,
  setup: () => Promise<AdapterContractContext>,
): void {
  // One adapter instance for the whole suite: engine boot can be
  // expensive (the TS analyzer loads the full lib set).
  let memo: Promise<AdapterContractContext> | null = null
  const context = () => (memo ??= setup())

  describe(`LanguageAdapter contract: ${name}`, () => {
    test('descriptor carries complete, non-empty language facts', async () => {
      const { adapter } = await context()
      const { descriptor } = adapter
      expect(descriptor.id).not.toBe('')
      expect(descriptor.label).not.toBe('')
      expect(descriptor.editorLanguageId).not.toBe('')
      expect(descriptor.engineLabel).not.toBe('')
      expect(descriptor.sampleSource.trim()).not.toBe('')
      const names = descriptor.specialTypeNames
      expect(names.universe).not.toBe('')
      expect(names.empty).not.toBe('')
      expect(names.any).not.toBe('')
      expect(new Set([names.universe, names.empty, names.any]).size).toBe(3)
    })

    test('snippet declarations auto-number against existing code', async () => {
      const { adapter } = await context()
      const { snippet } = adapter.descriptor
      const first = snippet.nextDeclaration('', 'x')
      expect(first).toContain('x')
      const second = snippet.nextDeclaration(first, 'x')
      expect(second).toContain('x')
      expect(second).not.toBe(first)
    })

    test('the sample source analyzes into a well-formed, clean result', async () => {
      const { adapter } = await context()
      const result = await adapter.analyze(adapter.descriptor.sampleSource, [])
      expect(result.entities.length).toBeGreaterThan(0)
      expect(
        result.diagnostics.filter(
          (diagnostic) =>
            diagnostic.severity === 'error' && diagnostic.domain !== 'value',
        ),
      ).toHaveLength(0)
      expectWellFormed(result)
    })

    test('analysis is deterministic for identical input', async () => {
      const { adapter } = await context()
      const source = adapter.descriptor.sampleSource
      const first = await adapter.analyze(source, [])
      const second = await adapter.analyze(source, [])
      expect(second).toEqual(first)
    })

    test('empty source yields an empty, valid result', async () => {
      const { adapter } = await context()
      const result = await adapter.analyze('', [])
      expect(result.entities).toHaveLength(0)
      expect(result.relations).toHaveLength(0)
      expectWellFormed(result)
    })

    test('virtual preset types join as preset-origin entities', async () => {
      const { adapter, virtualType } = await context()
      const result = await adapter.analyze(adapter.descriptor.sampleSource, [
        virtualType,
      ])
      const virtual = result.entities.find(
        (entity) => entity.name === virtualType.name,
      )
      expect(virtual).toBeDefined()
      expect(virtual?.origin).toBe('preset')
      expect(virtual?.declarationSpan).toBeNull()
      expectWellFormed(result)
    })

    test('check reports no errors for the sample source', async () => {
      const { adapter } = await context()
      const diagnostics = await adapter.check(adapter.descriptor.sampleSource)
      expect(
        diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      ).toHaveLength(0)
    })

    test('warmup resolves and event subscriptions return unsubscribers', async () => {
      const { adapter } = await context()
      await expect(adapter.warmup()).resolves.toBeUndefined()
      const offTypes = adapter.onTypesAcquired(() => {})
      const offBoot = adapter.onBootProgress(() => {})
      expect(typeof offTypes).toBe('function')
      expect(typeof offBoot).toBe('function')
      offTypes()
      offBoot()
    })
  })
}
