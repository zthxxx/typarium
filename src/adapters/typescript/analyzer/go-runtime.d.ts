/** Typed surface of the vendored Go js/wasm runtime (go-runtime.js). */
export class Go {
  argv: Array<string>
  env: Record<string, string>
  exit: (code: number) => void
  exited: boolean
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
}
