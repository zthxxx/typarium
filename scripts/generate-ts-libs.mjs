/**
 * Emits public/ts-libs-<version>.json — the TypeScript default lib
 * files, comment-stripped, fetched by the analysis worker at runtime
 * (ADR-0020). Moving libs out of the worker chunk restores a real
 * parallel download with byte progress; stripping JSDoc costs nothing
 * visible (quickInfo / inline queries render type text, not docs).
 *
 * Triple-slash directives are comments to the printer but load-bearing
 * to the compiler (lib.esnext.d.ts is ONLY references) — they are
 * extracted first and prepended back verbatim.
 *
 * Runs from predev/prebuild; verifies the version against the
 * manifest module so the worker URL and the asset can never drift.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const libDirectory = dirname(require.resolve('typescript'))
const version = JSON.parse(
  readFileSync(join(libDirectory, '..', 'package.json'), 'utf8'),
).version

const manifestSource = readFileSync(
  new URL('../src/adapters/typescript/ts-libs-manifest.ts', import.meta.url),
  'utf8',
)
if (!manifestSource.includes(`'${version}'`)) {
  throw new Error(
    `ts-libs-manifest.ts does not pin typescript ${version} — update TS_LIBS_VERSION to match package.json`,
  )
}

const printer = ts.createPrinter({ removeComments: true })
const DIRECTIVE_PATTERN = /^\/\/\/\s*<reference\b.*$/gm

const files = {}
let rawTotal = 0
let strippedTotal = 0
for (const name of readdirSync(libDirectory).sort()) {
  if (!name.startsWith('lib.') || !name.endsWith('.d.ts')) continue
  const content = readFileSync(join(libDirectory, name), 'utf8')
  const directives = content.match(DIRECTIVE_PATTERN) ?? []
  const sourceFile = ts.createSourceFile(
    name,
    content,
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.TS,
  )
  const stripped = printer.printFile(sourceFile)
  const output =
    directives.length > 0 ? `${directives.join('\n')}\n${stripped}` : stripped
  files[name] = output
  rawTotal += content.length
  strippedTotal += output.length
}

const payload = JSON.stringify({ version, files })
mkdirSync(new URL('../public', import.meta.url), { recursive: true })
writeFileSync(
  new URL(`../public/ts-libs-${version}.json`, import.meta.url),
  payload,
)
console.log(
  `ts-libs ${version}: ${Object.keys(files).length} files, ` +
    `raw ${(rawTotal / 1024).toFixed(0)}KB -> stripped ${(strippedTotal / 1024).toFixed(0)}KB, ` +
    `json gz ${(gzipSync(Buffer.from(payload)).length / 1024).toFixed(0)}KB`,
)
