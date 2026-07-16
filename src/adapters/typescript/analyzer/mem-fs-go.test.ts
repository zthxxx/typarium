import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { Go } from '#/adapters/typescript/analyzer/go-runtime.js'
import {
  MemFs,
  installGoGlobals,
} from '#/adapters/typescript/analyzer/mem-fs.ts'

/**
 * End-to-end check of the BROWSER execution path minus the network:
 * the vendored Go runtime + the MemFs shim run the real tsgo wasm
 * against a purely in-memory project. If this passes, the browser
 * runner's only unverified pieces are fetch/compileStreaming.
 */

const WASM_PATH = resolve(process.cwd(), 'node_modules/tsgo-wasm/tsgo.wasm')

const TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, noEmit: true },
  files: ['main.ts'],
})

async function runTsgoInMemory(files: Map<string, string>): Promise<string> {
  // Read the wasm BEFORE swapping globals: the shim owns fs during the run.
  const wasmBytes = readFileSync(WASM_PATH)
  const memfs = new MemFs(files)
  const restore = installGoGlobals(memfs)
  try {
    const go = new Go()
    go.argv = ['tsgo', '--project', '/app', '--pretty', 'false']
    go.env = { TMPDIR: '/tmp' }
    go.exit = () => undefined
    const { instance } = await WebAssembly.instantiate(
      wasmBytes,
      go.importObject,
    )
    await go.run(instance)
    return memfs.stdout + memfs.stderr
  } finally {
    restore()
  }
}

test('tsgo wasm runs against the in-memory fs shim', async () => {
  const output = await runTsgoInMemory(
    new Map([
      ['tsconfig.json', TSCONFIG],
      ['main.ts', 'const broken: string = 42\nconst fine: number = 1\n'],
    ]),
  )
  expect(output).toMatch(/main\.ts\(1,7\): error TS2322/)
  expect(output).not.toMatch(/\(2,/)
}, 30_000)
