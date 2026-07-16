/**
 * In-memory filesystem satisfying the node-style callback fs API that
 * Go's js/wasm syscall layer expects (`js.Global().Get("fs")`). Backs
 * the browser tsgo runner: source/probe files go in, tsc reads them,
 * stdout/stderr writes on fds 1/2 are captured as strings.
 *
 * Coverage: open/close/read/write(+Sync)/stat/lstat/fstat/readdir/
 * mkdir/rmdir/unlink/rename/truncate/ftruncate/chmod/fchmod/chown/
 * fchown/lchown/utimes/fsync + constants + errno-coded errors.
 * Symlink APIs report ENOSYS (nothing in the virtual project links).
 */

type NodeCallback = (err: Error | null, ...results: Array<unknown>) => void

interface FileNode {
  kind: 'file'
  data: Uint8Array
}

interface DirNode {
  kind: 'dir'
}

type MemNode = FileNode | DirNode

const S_IFDIR = 0o040000
const S_IFREG = 0o100000

function errnoError(code: string, path?: string): Error {
  const error = new Error(path ? `${code}: ${path}` : code)
  ;(error as Error & { code: string }).code = code
  return error
}

function normalizePath(path: string): string {
  const segments = path.split('/')
  const resolved: Array<string> = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }
  return `/${resolved.join('/')}`
}

function parentOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

/**
 * Go's js/wasm scheduler MUST NOT be re-entered from inside a host
 * call: invoking a node-style callback synchronously corrupts the
 * runtime (the classic wasm_exec fs-shim pitfall). Every callback is
 * therefore deferred to a microtask, which runs only after the wasm
 * host frame has returned and the goroutine parked.
 */
function deferred(cb: NodeCallback): NodeCallback {
  return (...args) => queueMicrotask(() => cb(...args))
}

export class MemFs {
  readonly constants = {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_TRUNC: 512,
    O_APPEND: 1024,
    O_DIRECTORY: 65536,
  }

  private nodes = new Map<string, MemNode>()
  private fds = new Map<number, { path: string; position: number }>()
  private nextFd = 3
  private stdoutChunks: Array<string> = []
  private stderrChunks: Array<string> = []

  constructor(files: Map<string, string>) {
    this.nodes.set('/', { kind: 'dir' })
    this.nodes.set('/tmp', { kind: 'dir' })
    for (const [name, content] of files) {
      const path = normalizePath(name.startsWith('/') ? name : `/app/${name}`)
      this.ensureDir(parentOf(path))
      this.nodes.set(path, { kind: 'file', data: encoder.encode(content) })
    }
  }

  get stdout(): string {
    return this.stdoutChunks.join('')
  }

  get stderr(): string {
    return this.stderrChunks.join('')
  }

  private ensureDir(path: string): void {
    if (path === '/') return
    this.ensureDir(parentOf(path))
    const existing = this.nodes.get(path)
    if (!existing) {
      this.nodes.set(path, { kind: 'dir' })
    }
  }

  private statsFor(node: MemNode) {
    const size = node.kind === 'file' ? node.data.byteLength : 0
    const mode = node.kind === 'dir' ? S_IFDIR | 0o755 : S_IFREG | 0o644
    return {
      dev: 0,
      ino: 0,
      mode,
      nlink: 1,
      uid: 0,
      gid: 0,
      rdev: 0,
      size,
      blksize: 4096,
      blocks: Math.ceil(size / 512),
      atimeMs: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      isDirectory: () => node.kind === 'dir',
      isFile: () => node.kind === 'file',
      isSymbolicLink: () => false,
    }
  }

  // --- API consumed by Go's syscall/js --------------------------------------

  open = (path: string, flags: number, _mode: number, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const normalized = normalizePath(path)
    let node = this.nodes.get(normalized)
    if (!node) {
      if ((flags & this.constants.O_CREAT) === 0) {
        cb(errnoError('ENOENT', normalized))
        return
      }
      node = { kind: 'file', data: new Uint8Array(0) }
      this.ensureDir(parentOf(normalized))
      this.nodes.set(normalized, node)
    } else if (node.kind === 'file' && (flags & this.constants.O_TRUNC) !== 0) {
      node.data = new Uint8Array(0)
    }
    const fd = this.nextFd
    this.nextFd += 1
    this.fds.set(fd, { path: normalized, position: 0 })
    cb(null, fd)
  }

  close = (fd: number, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    this.fds.delete(fd)
    cb(null)
  }

  read = (
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null | undefined,
    rawCb: NodeCallback,
  ) => {
    const cb = deferred(rawCb)
    const handle = this.fds.get(fd)
    if (!handle) {
      cb(errnoError('EBADF'))
      return
    }
    const node = this.nodes.get(handle.path)
    if (!node || node.kind !== 'file') {
      cb(errnoError('EBADF', handle.path))
      return
    }
    const start = position ?? handle.position
    const available = Math.max(0, node.data.byteLength - start)
    const count = Math.min(length, available)
    buffer.set(node.data.subarray(start, start + count), offset)
    if (position === null || position === undefined) {
      handle.position = start + count
    }
    cb(null, count)
  }

  write = (
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null | undefined,
    rawCb: NodeCallback,
  ) => {
    const cb = deferred(rawCb)
    try {
      const written = this.writeSync(fd, buffer, offset, length, position)
      cb(null, written)
    } catch (error) {
      cb(error as Error)
    }
  }

  /** Also called directly by the Go runtime for `runtime.wasmWrite`. */
  writeSync = (
    fd: number,
    buffer: Uint8Array,
    offset = 0,
    length = buffer.byteLength,
    position: number | null | undefined = null,
  ): number => {
    const chunk = buffer.subarray(offset, offset + length)
    if (fd === 1) {
      this.stdoutChunks.push(decoder.decode(chunk))
      return length
    }
    if (fd === 2) {
      this.stderrChunks.push(decoder.decode(chunk))
      return length
    }
    const handle = this.fds.get(fd)
    if (!handle) throw errnoError('EBADF')
    const node = this.nodes.get(handle.path)
    if (!node || node.kind !== 'file') throw errnoError('EBADF', handle.path)
    const start = position ?? handle.position
    const end = start + chunk.byteLength
    if (end > node.data.byteLength) {
      const grown = new Uint8Array(end)
      grown.set(node.data)
      node.data = grown
    }
    node.data.set(chunk, start)
    if (position === null) {
      handle.position = end
    }
    return chunk.byteLength
  }

  stat = (path: string, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const normalized = normalizePath(path)
    const node = this.nodes.get(normalized)
    if (!node) {
      cb(errnoError('ENOENT', normalized))
      return
    }
    cb(null, this.statsFor(node))
  }

  lstat = (path: string, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    this.stat(path, cb)
  }

  fstat = (fd: number, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const handle = this.fds.get(fd)
    if (!handle) {
      cb(errnoError('EBADF'))
      return
    }
    this.stat(handle.path, cb)
  }

  readdir = (path: string, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const normalized = normalizePath(path)
    const node = this.nodes.get(normalized)
    if (!node) {
      cb(errnoError('ENOENT', normalized))
      return
    }
    if (node.kind !== 'dir') {
      cb(errnoError('ENOTDIR', normalized))
      return
    }
    const prefix = normalized === '/' ? '/' : `${normalized}/`
    const names: Array<string> = []
    for (const candidate of this.nodes.keys()) {
      if (candidate === '/' || !candidate.startsWith(prefix)) continue
      const rest = candidate.slice(prefix.length)
      if (rest !== '' && !rest.includes('/')) names.push(rest)
    }
    cb(null, names.sort())
  }

  mkdir = (path: string, _perm: number, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const normalized = normalizePath(path)
    if (this.nodes.has(normalized)) {
      cb(errnoError('EEXIST', normalized))
      return
    }
    if (!this.nodes.has(parentOf(normalized))) {
      cb(errnoError('ENOENT', parentOf(normalized)))
      return
    }
    this.nodes.set(normalized, { kind: 'dir' })
    cb(null)
  }

  rmdir = (path: string, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    this.nodes.delete(normalizePath(path))
    cb(null)
  }

  unlink = (path: string, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const normalized = normalizePath(path)
    if (!this.nodes.delete(normalized)) {
      cb(errnoError('ENOENT', normalized))
      return
    }
    cb(null)
  }

  rename = (from: string, to: string, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const source = normalizePath(from)
    const node = this.nodes.get(source)
    if (!node) {
      cb(errnoError('ENOENT', source))
      return
    }
    this.nodes.delete(source)
    this.nodes.set(normalizePath(to), node)
    cb(null)
  }

  truncate = (path: string, length: number, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const normalized = normalizePath(path)
    const node = this.nodes.get(normalized)
    if (!node || node.kind !== 'file') {
      cb(errnoError('ENOENT', normalized))
      return
    }
    const next = new Uint8Array(length)
    next.set(node.data.subarray(0, Math.min(length, node.data.byteLength)))
    node.data = next
    cb(null)
  }

  ftruncate = (fd: number, length: number, rawCb: NodeCallback) => {
    const cb = deferred(rawCb)
    const handle = this.fds.get(fd)
    if (!handle) {
      cb(errnoError('EBADF'))
      return
    }
    this.truncate(handle.path, length, cb)
  }

  // Permission/time mutations are meaningless in a throwaway memfs.
  chmod = (_p: string, _m: number, cb: NodeCallback) => deferred(cb)(null)
  fchmod = (_f: number, _m: number, cb: NodeCallback) => deferred(cb)(null)
  chown = (_p: string, _u: number, _g: number, cb: NodeCallback) =>
    deferred(cb)(null)
  fchown = (_f: number, _u: number, _g: number, cb: NodeCallback) =>
    deferred(cb)(null)
  lchown = (_p: string, _u: number, _g: number, cb: NodeCallback) =>
    deferred(cb)(null)
  utimes = (_p: string, _a: number, _m: number, cb: NodeCallback) =>
    deferred(cb)(null)
  fsync = (_fd: number, cb: NodeCallback) => deferred(cb)(null)

  readlink = (_p: string, cb: NodeCallback) =>
    deferred(cb)(errnoError('ENOSYS'))
  link = (_f: string, _t: string, cb: NodeCallback) =>
    deferred(cb)(errnoError('ENOSYS'))
  symlink = (_f: string, _t: string, cb: NodeCallback) =>
    deferred(cb)(errnoError('ENOSYS'))
}

/**
 * Installs the fs/process globals the Go runtime reads. Returns a
 * restore function; the runner serializes runs, so global mutation is
 * confined to one Go execution at a time.
 */
export function installGoGlobals(memfs: MemFs): () => void {
  const scope = globalThis as Record<string, unknown>
  const previousFs = scope.fs
  const previousPath = scope.path
  const previousProcess = scope.process
  scope.fs = memfs
  // Go's syscall layer resolves paths through the host `path` module
  // (the tsgo launcher bridges node:path); a posix subset suffices.
  scope.path = posixPath
  // Go needs a FUNCTIONING process (cwd() etc). Node has one — leave
  // it alone (replacing it breaks the test runner). Browser workers
  // either have none, or only Vite's `{ env }` polyfill whose cwd is
  // missing — merge our methods over whatever is there.
  const existingProcess = previousProcess as { cwd?: unknown } | undefined
  if (typeof existingProcess?.cwd !== 'function') {
    scope.process = {
      ...existingProcess,
      cwd: () => '/app',
      chdir: () => undefined,
      getuid: () => -1,
      getgid: () => -1,
      geteuid: () => -1,
      getegid: () => -1,
      getgroups: () => {
        throw errnoError('ENOSYS')
      },
      umask: () => 0o22,
      pid: -1,
      ppid: -1,
    }
  }
  return () => {
    scope.fs = previousFs
    scope.path = previousPath
    scope.process = previousProcess
  }
}

/** Minimal posix path module for Go's js/wasm syscall layer. */
const posixPath = {
  sep: '/',
  delimiter: ':',
  isAbsolute: (path: string) => path.startsWith('/'),
  normalize: (path: string) => normalizePath(path) || '/',
  resolve: (...segments: Array<string>) => {
    let acc = '/app'
    for (const segment of segments) {
      if (segment === '') continue
      acc = segment.startsWith('/') ? segment : `${acc}/${segment}`
    }
    return normalizePath(acc)
  },
  join: (...segments: Array<string>) => {
    const joined = segments.filter((segment) => segment !== '').join('/')
    const normalized = normalizePath(joined)
    return joined.startsWith('/') ? normalized : normalized.slice(1)
  },
  dirname: (path: string) => parentOf(normalizePath(path)),
  basename: (path: string) => {
    const normalized = normalizePath(path)
    return normalized.slice(normalized.lastIndexOf('/') + 1)
  },
  extname: (path: string) => {
    const base = posixPath.basename(path)
    const dot = base.lastIndexOf('.')
    return dot > 0 ? base.slice(dot) : ''
  },
}
