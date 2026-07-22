/**
 * Build-time sample analysis (ADR-0020): the teaching sample is fixed,
 * so its AnalysisResult can be computed at build time with the SAME
 * pinned typescript and shipped inline — a first-ever visit paints the
 * canvas the moment the app chunk runs, engine re-verification follows.
 *
 * Runs under `node --experimental-strip-types`: src imports resolve
 * through the package.json `#/*` subpath imports, all type syntax in
 * the touched modules is erasable.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createTsAnalyzer } from '@typarium/analyzer-typescript'
import { loadLibFilesFromNodeModules } from '@typarium/analyzer-typescript/node'
import { typescriptDescriptor } from '@typarium/analyzer-typescript/descriptor'

const outUrl = new URL(
  '../src/adapters/typescript/sample-snapshot.gen.json',
  import.meta.url,
)

const analyzer = createTsAnalyzer({ libFiles: loadLibFilesFromNodeModules() })
const result = analyzer.analyze(typescriptDescriptor.sampleSource, [])
analyzer.dispose()

if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
  throw new Error(
    `sample source no longer analyzes clean: ${JSON.stringify(result.diagnostics)}`,
  )
}

const payload = `${JSON.stringify(result, null, 2)}\n`
let previous = ''
try {
  previous = readFileSync(outUrl, 'utf8')
} catch {
  // first generation
}
if (previous !== payload) {
  writeFileSync(outUrl, payload)
  console.log(
    `sample-snapshot: ${result.entities.length} entities, ${result.relations.length} relations`,
  )
} else {
  console.log('sample-snapshot: up to date')
}
