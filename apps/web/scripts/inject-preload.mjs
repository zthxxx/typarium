/**
 * Post-build head injection (ADR-0020): flatten the cold-start
 * waterfall. The prerendered HTML only preloads the entry chunks; the
 * app chunk, the analysis worker and the ts-libs asset were discovered
 * one JS execution at a time. Injecting their preload links moves the
 * discovery to HTML parse time. Monaco is deliberately NOT preloaded —
 * it yields the network to the engine (canvas first).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const clientDir = new URL('../dist/client', import.meta.url).pathname
const assets = readdirSync(join(clientDir, 'assets'))

const workerChunk = assets.find((name) =>
  /^analysis\.worker-.+\.js$/.test(name),
)
const appChunk = assets.find((name) => /^ClientApp-.+\.js$/.test(name))
const tsLibsAsset = readdirSync(clientDir).find((name) =>
  /^ts-libs-.+\.json$/.test(name),
)

// The app chunk carries the sample snapshot = time-to-usable; the
// engine payloads trail at low priority so they never starve it.
const links = [
  appChunk && `<link rel="modulepreload" href="/assets/${appChunk}"/>`,
  workerChunk &&
    `<link rel="modulepreload" href="/assets/${workerChunk}" fetchpriority="low"/>`,
  tsLibsAsset &&
    `<link rel="preload" href="/${tsLibsAsset}" as="fetch" fetchpriority="low"/>`,
].filter(Boolean)

if (links.length < 3) {
  throw new Error(
    `inject-preload: expected app+worker+ts-libs, found ${JSON.stringify({ appChunk, workerChunk, tsLibsAsset })}`,
  )
}

let injected = 0
for (const name of readdirSync(clientDir)) {
  if (!name.endsWith('.html')) continue
  const path = join(clientDir, name)
  const html = readFileSync(path, 'utf8')
  // Anchor on the OPENING head tag: the streamed prerender output may
  // omit the optional </head>, and earlier links win the fetch queue.
  if (!html.includes('<head>')) {
    throw new Error(`inject-preload: no <head> in ${name}`)
  }
  if (html.includes('rel="modulepreload" href="/assets/analysis.worker')) {
    continue // already injected (idempotent re-run)
  }
  writeFileSync(path, html.replace('<head>', `<head>${links.join('')}`))
  injected += 1
}
console.log(`inject-preload: ${links.length} links into ${injected} page(s)`)
