import { describe, expect, test } from 'vitest'
import { createTsAnalyzer } from './create-ts-analyzer.ts'
import { createTypeAcquirer } from './type-acquisition.ts'
import { loadLibFilesFromNodeModules } from './lib-files.node.ts'

/**
 * ATA integration against the real jsdelivr CDN (the exact production
 * path — no mock drift). Skips cleanly when offline: local-first
 * verification must not fail on network absence.
 */

async function online(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3_000)
    const response = await fetch('https://data.jsdelivr.com/v1/', {
      signal: controller.signal,
    })
    clearTimeout(timer)
    return response.ok
  } catch {
    return false
  }
}

describe('type acquisition', () => {
  test('react typings resolve an import after acquisition', async () => {
    if (!(await online())) {
      console.warn('offline: skipping the real-network ATA test')
      return
    }

    const analyzer = createTsAnalyzer({
      libFiles: loadLibFilesFromNodeModules(),
    })
    const acquirer = createTypeAcquirer({
      receiveFile: (path, content) => analyzer.addLibraryFile(path, content),
    })

    const source = [
      "import type { FC } from 'react'",
      'export type Component = FC<{ label: string }>',
    ].join('\n')

    // Before acquisition: the bare module cannot resolve.
    const before = analyzer.check(source)
    expect(
      before.some((diagnostic) => diagnostic.message.includes("'react'")),
    ).toBe(true)

    await acquirer.ensureTypesFor(source)

    const after = analyzer.check(source)
    expect(
      after.some((diagnostic) => diagnostic.message.includes("'react'")),
    ).toBe(false)

    // The analysis pipeline sees the acquired types too.
    const result = analyzer.analyze(source, [])
    const component = result.entities.find(
      (entity) => entity.id === 'Component',
    )
    expect(component).toBeDefined()
    expect(component!.special).toBe('none')
  }, 60_000)

  test('unresolvable modules degrade silently', async () => {
    const acquirer = createTypeAcquirer({ receiveFile: () => undefined })
    await expect(
      acquirer.ensureTypesFor(
        "import x from 'no-such-package-typarium-test-9f2'",
      ),
    ).resolves.toBeUndefined()
  }, 20_000)
})
