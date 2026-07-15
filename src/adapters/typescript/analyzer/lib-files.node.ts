/**
 * NODE ONLY — never import from browser/app code.
 *
 * Loads the TypeScript default lib files from node_modules for tests and
 * other node-side consumers. The browser worker bundles the same files as
 * raw assets instead (see the worker entry, not this module).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export function loadLibFilesFromNodeModules(): Map<string, string> {
  const require = createRequire(import.meta.url)
  // resolve('typescript') -> .../node_modules/typescript/lib/typescript.js
  const libDirectory = dirname(require.resolve('typescript'))
  const files = new Map<string, string>()
  for (const name of readdirSync(libDirectory)) {
    if (name.startsWith('lib.') && name.endsWith('.d.ts')) {
      files.set(name, readFileSync(join(libDirectory, name), 'utf8'))
    }
  }
  return files
}
