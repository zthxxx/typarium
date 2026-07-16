import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import type { TscRunner } from '#/adapters/typescript/analyzer/create-tsgo-analyzer.ts'

/**
 * Node runner for tests: materializes the virtual project in a temp
 * directory and shells out to the tsgo-wasm CLI launcher. tsc exits
 * non-zero whenever diagnostics exist — that is the expected path, the
 * captured stdout is the oracle either way.
 */
export function createNodeTsgoRunner(): TscRunner {
  const launcher = resolve(process.cwd(), 'node_modules/tsgo-wasm/tsgo-wasm')

  return {
    run: (files) => {
      const root = mkdtempSync(join(tmpdir(), 'typarium-tsgo-'))
      try {
        for (const [name, content] of files) {
          const path = join(root, name)
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, content)
        }
        let stdout = ''
        try {
          stdout = execFileSync(
            process.execPath,
            [launcher, '--project', root, '--pretty', 'false'],
            {
              encoding: 'utf-8',
              // Go's wasm runtime packs argv+env into a fixed 8KB region;
              // pnpm run-scripts inject enough npm_* variables to blow it.
              env: { PATH: process.env.PATH ?? '' },
            },
          )
        } catch (error) {
          const failed = error as {
            stdout?: string
            stderr?: string
            message?: string
          }
          stdout = `${failed.stdout ?? ''}${failed.stderr ?? ''}`
          if (stdout.trim() === '') {
            // A silent empty result would poison the oracle downstream:
            // surface spawn-level failures (vs ordinary diagnostics exits).
            throw new Error(
              `tsgo-wasm CLI produced no output: ${failed.message ?? 'unknown'}`,
            )
          }
        }
        return Promise.resolve(stdout)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  }
}
