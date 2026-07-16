import wasmUrl from 'tsgo-wasm/tsgo.wasm?url'
import { Go } from '#/adapters/typescript/analyzer/go-runtime.js'
import {
  MemFs,
  installGoGlobals,
} from '#/adapters/typescript/analyzer/mem-fs.ts'
import type { TscRunner } from '#/adapters/typescript/analyzer/create-tsgo-analyzer.ts'

/**
 * Browser (worker) tsgo runner: the 47MB wasm module is fetched and
 * compiled ONCE per worker; every run re-instantiates it (a Go program
 * runs main() to completion and exits) against a fresh in-memory fs.
 * Runs are serialized — the Go runtime reads `globalThis.fs`, so only
 * one execution may own the globals at a time.
 */
export function createBrowserTsgoRunner(): TscRunner {
  let modulePromise: Promise<WebAssembly.Module> | null = null
  let queue: Promise<unknown> = Promise.resolve()

  const compile = (): Promise<WebAssembly.Module> => {
    modulePromise ??= WebAssembly.compileStreaming(fetch(wasmUrl))
    return modulePromise
  }

  const runOnce = async (files: Map<string, string>): Promise<string> => {
    const module = await compile()
    const memfs = new MemFs(files)
    const restoreGlobals = installGoGlobals(memfs)
    try {
      const go = new Go()
      go.argv = ['tsgo', '--project', '/app', '--pretty', 'false']
      go.env = { TMPDIR: '/tmp' }
      // tsc exits non-zero when diagnostics exist — that IS our output,
      // so every exit code is a successful oracle run.
      go.exit = () => undefined
      const instance = await WebAssembly.instantiate(module, go.importObject)
      await go.run(instance)
      return memfs.stdout + memfs.stderr
    } finally {
      restoreGlobals()
    }
  }

  return {
    run: (files) => {
      const next = queue.then(() => runOnce(files))
      queue = next.catch(() => undefined)
      return next
    },
  }
}
