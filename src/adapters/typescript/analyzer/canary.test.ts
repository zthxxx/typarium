import { expect, test } from 'vitest'
import { createTsgoAnalyzer } from '#/adapters/typescript/analyzer/create-tsgo-analyzer.ts'

/**
 * The canary guard: a runner yielding no parseable diagnostics must
 * make analyze() throw — an empty oracle would otherwise read as
 * "everything assignable" and classify every entity as `any`.
 */
test('empty diagnostics stream throws instead of poisoning results', async () => {
  const analyzer = createTsgoAnalyzer({ run: () => Promise.resolve('') })
  await expect(analyzer.analyze('export type A = string', [])).rejects.toThrow(
    /canary/,
  )
})

test('garbled diagnostics stream also throws', async () => {
  const analyzer = createTsgoAnalyzer({
    run: () => Promise.resolve('panic: something exploded\n\ngoroutine 1:\n'),
  })
  await expect(analyzer.analyze('export type A = string', [])).rejects.toThrow(
    /canary/,
  )
})
