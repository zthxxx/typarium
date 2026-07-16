import { setupTypeAcquisition } from '@typescript/ata'
import * as ts from 'typescript'

/**
 * Automatic Type Acquisition (TS-Playground behavior): when the source
 * imports a bare module, its typings are fetched from jsdelivr in the
 * browser and injected into the project — types only, no JS is ever
 * executed. Failures degrade silently: the ordinary "cannot find
 * module" diagnostic remains and nothing throws.
 */

const ATA_TIMEOUT_MS = 8_000

/** Bare module specifiers in import/export-from clauses. */
const SPECIFIER_PATTERN = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g

export interface TypeAcquirer {
  /** Resolves once typings for the source's imports are in (or timed out). */
  ensureTypesFor: (source: string) => Promise<void>
}

export function createTypeAcquirer(deps: {
  receiveFile: (path: string, content: string) => void
}): TypeAcquirer {
  const attempted = new Set<string>()
  let finishedResolve: (() => void) | null = null

  const ata = setupTypeAcquisition({
    projectName: 'typarium',
    typescript: ts,
    logger: {
      log: () => undefined,
      error: () => undefined,
      groupCollapsed: () => undefined,
      groupEnd: () => undefined,
    },
    delegate: {
      receivedFile: (content: string, path: string) => {
        deps.receiveFile(path, content)
      },
      finished: () => {
        finishedResolve?.()
        finishedResolve = null
      },
    },
  })

  const bareSpecifiers = (source: string): Array<string> => {
    const found = new Set<string>()
    for (const match of source.matchAll(SPECIFIER_PATTERN)) {
      const specifier = match[1]
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        found.add(specifier)
      }
    }
    return [...found]
  }

  const ensureTypesFor = async (source: string): Promise<void> => {
    const fresh = bareSpecifiers(source).filter(
      (specifier) => !attempted.has(specifier),
    )
    if (fresh.length === 0) return
    for (const specifier of fresh) attempted.add(specifier)

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        finishedResolve = null
        resolve()
      }, ATA_TIMEOUT_MS)
      finishedResolve = () => {
        clearTimeout(timer)
        resolve()
      }
      try {
        ata(source)
      } catch {
        clearTimeout(timer)
        finishedResolve = null
        resolve()
      }
    })
  }

  return { ensureTypesFor }
}
