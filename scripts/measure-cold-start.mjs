/**
 * Cold-start "time to usable" measurement (ADR-0020 acceptance gauge).
 *
 * Usable = the canvas has a computed diagram: navigation start until
 * `window.__typarium.analysis.lastGoodResult` is non-null, measured on
 * the production build (`vite preview`) behind a bandwidth-limiting
 * proxy. Throttling happens SERVER-side through a shared token bucket:
 * page, monaco and worker downloads all compete for the same simulated
 * link — page-level CDP emulation would miss dedicated-worker traffic
 * entirely (verified: the 3.9MB worker bypassed it).
 *
 * Usage: pnpm build && node scripts/measure-cold-start.mjs [runs]
 * Env:   THROTTLE_MBPS (default 20), LATENCY_MS (default 20)
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import { chromium } from '@playwright/test'

const RUNS = Number(process.argv[2] ?? 3)
const UPSTREAM_PORT = 4173
const PROXY_PORT = 4174
const THROTTLE_MBPS = Number(process.env.THROTTLE_MBPS ?? 20)
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 20)

const BYTES_PER_SEC = (THROTTLE_MBPS * 1024 * 1024) / 8
const TICK_MS = 20

/** Shared link: every in-flight response drains one token bucket. */
let bucket = 0
setInterval(() => {
  bucket = Math.min(
    BYTES_PER_SEC * 0.5,
    bucket + BYTES_PER_SEC * (TICK_MS / 1000),
  )
}, TICK_MS).unref()

async function drainThrottled(response, buffer) {
  let offset = 0
  while (offset < buffer.length) {
    const take = Math.min(Math.floor(bucket), buffer.length - offset)
    if (take > 0) {
      bucket -= take
      response.write(buffer.subarray(offset, offset + take))
      offset += take
    }
    if (offset < buffer.length) {
      await new Promise((resolve) => setTimeout(resolve, TICK_MS))
    }
  }
  response.end()
}

function startProxy() {
  // Raw http (NOT fetch): compressed upstream bytes pass through
  // untouched, so gzip wins count exactly like production.
  const server = http.createServer((request, response) => {
    const upstream = http.request(
      {
        host: 'localhost',
        port: UPSTREAM_PORT,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (upstreamResponse) => {
        const chunks = []
        upstreamResponse.on('data', (chunk) => chunks.push(chunk))
        upstreamResponse.on('end', () => {
          const body = Buffer.concat(chunks)
          const headers = { ...upstreamResponse.headers }
          delete headers['transfer-encoding']
          headers['content-length'] = String(body.length)
          setTimeout(() => {
            response.writeHead(upstreamResponse.statusCode ?? 200, headers)
            void drainThrottled(response, body)
          }, LATENCY_MS)
        })
      },
    )
    upstream.end()
  })
  return new Promise((resolve) => {
    server.listen(PROXY_PORT, () => resolve(server))
  })
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`preview server did not come up at ${url}`)
}

async function measureOnce(browser) {
  // A fresh context per run: isolated HTTP cache and storage = cold.
  const context = await browser.newContext()
  const page = await context.newPage()
  const startedAt = Date.now()
  await page.goto(`http://localhost:${PROXY_PORT}/`, { waitUntil: 'commit' })
  await page.waitForFunction(
    () => window.__typarium?.analysis?.lastGoodResult != null,
    undefined,
    { timeout: 180_000, polling: 50 },
  )
  const usableMs = Date.now() - startedAt
  await context.close()
  return usableMs
}

const server = spawn(
  'pnpm',
  ['exec', 'vite', 'preview', '--port', `${UPSTREAM_PORT}`],
  { stdio: 'ignore', detached: false },
)
try {
  await waitForServer(`http://localhost:${UPSTREAM_PORT}/`)
  const proxy = await startProxy()
  const browser = await chromium.launch()
  const samples = []
  for (let run = 0; run < RUNS; run += 1) {
    const ms = await measureOnce(browser)
    samples.push(ms)
    console.log(`run ${run + 1}: usable in ${ms} ms`)
  }
  await browser.close()
  proxy.close()
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  console.log(
    JSON.stringify({
      medianMs: median,
      samples,
      throttleMbps: THROTTLE_MBPS,
      latencyMs: LATENCY_MS,
    }),
  )
} finally {
  server.kill('SIGTERM')
}
