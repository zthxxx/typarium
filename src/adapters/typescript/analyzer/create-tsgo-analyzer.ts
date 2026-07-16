import { scanExports } from '#/adapters/typescript/analyzer/scan-exports.ts'
import type { VirtualType } from '#/core/analysis/adapter.ts'
import type {
  AnalysisResult,
  PairRelation,
  RelationKind,
  SourceDiagnostic,
  TypeEntity,
} from '#/core/set-model/types.ts'

/**
 * The v2 analysis engine (ADR-0013): semantics come from ONE tsgo
 * (TypeScript 7) compile per analysis. Every assignability question is
 * materialized as a probe line `declare const s: X; const d: Y = s;`
 * inside a synthetic module — the probe line errors iff X is NOT
 * assignable to Y. Diagnostics are the oracle; no compiler JS API.
 */

/** Runs tsc over a virtual project, returns raw diagnostic stdout. */
export interface TscRunner {
  run: (files: Map<string, string>) => Promise<string>
}

export interface TsgoAnalyzer {
  analyze: (
    source: string,
    virtualTypes: Array<VirtualType>,
  ) => Promise<AnalysisResult>
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
    target: 'esnext',
    module: 'esnext',
    moduleResolution: 'bundler',
    allowImportingTsExtensions: true,
    skipLibCheck: true,
  },
  files: ['main.ts', 'probes.ts'],
})

interface ProbeSubject {
  id: string
  name: string
  typeText: string
  origin: 'code' | 'preset'
  span: { start: number; end: number } | null
  /** Type expression usable inside probes.ts (alias reference). */
  alias: string
}

export function createTsgoAnalyzer(runner: TscRunner): TsgoAnalyzer {
  const analyze = async (
    source: string,
    virtualTypes: Array<VirtualType>,
  ): Promise<AnalysisResult> => {
    const { exports: scanned, diagnostics: scanDiagnostics } =
      scanExports(source)

    const subjects: Array<ProbeSubject> = [
      ...scanned.map((entry, index) => ({
        id: entry.name,
        name: entry.name,
        typeText: entry.typeText,
        origin: 'code' as const,
        span: entry.span,
        alias: `__E${index}`,
      })),
      ...virtualTypes.map((virtual, index) => ({
        id: `preset:${virtual.name}`,
        name: virtual.name,
        typeText: virtual.typeText,
        origin: 'preset' as const,
        span: null,
        alias: `__V${index}`,
      })),
    ]

    const plan = buildProbeFile(scanned.length > 0, subjects)
    const stdout = await runner.run(
      new Map([
        ['tsconfig.json', TSCONFIG],
        ['main.ts', source.length > 0 ? source : '\n'],
        ['probes.ts', plan.content],
      ]),
    )

    const parsed = parseDiagnostics(stdout, source)

    // Poisoning guard: the canary probe MUST fail on any real engine
    // run. Its absence means the diagnostics stream is empty/garbled
    // (engine crashed or never ran) — treating that as "everything is
    // assignable" would classify every entity as any. Fail loudly.
    if (!parsed.failedProbeLines.has(plan.canaryLine)) {
      throw new Error(
        'tsgo produced no parseable diagnostics (canary probe missing); ' +
          `stdout head: ${JSON.stringify(stdout.slice(0, 200))}`,
      )
    }

    if (parsed.userErrors.some((d) => d.severity === 'error')) {
      // Broken user code makes every probe answer meaningless: report
      // the diagnostics and let the canvas keep its last good result.
      return {
        entities: [],
        relations: [],
        diagnostics: [...parsed.userErrors, ...scanDiagnostics],
        anyEntityNames: [],
      }
    }

    const failedLines = parsed.failedProbeLines
    const assignable = (from: number, to: number): boolean =>
      !failedLines.has(plan.lineOf(from, to))
    const toNever = (index: number): boolean =>
      !failedLines.has(plan.lineToNever(index))
    const fromUnknown = (index: number): boolean =>
      !failedLines.has(plan.lineFromUnknown(index))
    const toStringSentinel = (index: number): boolean =>
      !failedLines.has(plan.lineToString(index))

    const entities: Array<TypeEntity> = subjects.map((subject, index) => {
      // `any` is assignable to everything EXCEPT never, so the never
      // probe cannot identify it. unknown ⊆ X holds only for unknown
      // and any; X ⊆ string additionally holds only for any.
      const isAny = fromUnknown(index) && toStringSentinel(index)
      const special = isAny
        ? ('outside-set-theory' as const)
        : toNever(index)
          ? ('empty' as const)
          : fromUnknown(index)
            ? ('universe' as const)
            : ('none' as const)
      return {
        id: subject.id,
        name: subject.name,
        typeText: subject.typeText,
        special,
        origin: subject.origin,
        declarationSpan: subject.span,
      }
    })

    const drawable = entities
      .map((entity, index) => ({ entity, index }))
      .filter(({ entity }) => entity.special === 'none')

    const relations: Array<PairRelation> = []
    for (let i = 0; i < drawable.length; i += 1) {
      for (let j = i + 1; j < drawable.length; j += 1) {
        const a = drawable[i]
        const b = drawable[j]
        const ab = assignable(a.index, b.index)
        const ba = assignable(b.index, a.index)
        const kind: RelationKind =
          ab && ba
            ? 'equivalent'
            : ab
              ? 'subset'
              : ba
                ? 'superset'
                : 'unrelated'
        relations.push({ a: a.entity.id, b: b.entity.id, kind })
      }
    }

    return {
      entities,
      relations,
      diagnostics: [...parsed.userErrors, ...scanDiagnostics],
      anyEntityNames: entities
        .filter((entity) => entity.special === 'outside-set-theory')
        .map((entity) => entity.name),
    }
  }

  return { analyze }
}

// --- probe file -------------------------------------------------------------

interface ProbePlan {
  content: string
  /** 1-based probes.ts line of the ordered pair probe (from → to). */
  lineOf: (from: number, to: number) => number
  lineToNever: (index: number) => number
  lineFromUnknown: (index: number) => number
  lineToString: (index: number) => number
  /** Line of the always-failing sentinel; missing ⇒ engine did not run. */
  canaryLine: number
}

/**
 * Layout of probes.ts (all deterministic, one probe per line):
 *   import type * as U from './main.ts'      (only when code exports exist)
 *   type __E<i> = U.<name>                   (code entity aliases)
 *   type __V<i> = <typeText>                 (virtual preset aliases)
 *   declare const s_K: X; const d_K: Y = s_K;   (probe lines)
 * A TS2322 (or any) error on a probe line means "not assignable".
 */
function buildProbeFile(
  hasImports: boolean,
  subjects: Array<ProbeSubject>,
): ProbePlan {
  const header: Array<string> = []
  if (hasImports) {
    header.push(`import type * as U from './main.ts'`)
  }
  for (const subject of subjects) {
    header.push(
      subject.origin === 'code'
        ? `type ${subject.alias} = U.${subject.name}`
        : `type ${subject.alias} = ${subject.typeText}`,
    )
  }

  const probes: Array<string> = []
  const probeLine = new Map<string, number>()
  const firstProbeLine = header.length + 1
  const pushProbe = (key: string, from: string, to: string) => {
    probeLine.set(key, firstProbeLine + probes.length)
    const k = probes.length
    probes.push(`declare const s_${k}: ${from}; const d_${k}: ${to} = s_${k};`)
  }

  // Canary first: `string` is never assignable to `never`.
  pushProbe('canary', 'string', 'never')
  for (let i = 0; i < subjects.length; i += 1) {
    pushProbe(`n:${i}`, subjects[i].alias, 'never')
    pushProbe(`u:${i}`, 'unknown', subjects[i].alias)
    pushProbe(`s:${i}`, subjects[i].alias, 'string')
  }
  for (let i = 0; i < subjects.length; i += 1) {
    for (let j = 0; j < subjects.length; j += 1) {
      if (i === j) continue
      pushProbe(`p:${i}:${j}`, subjects[i].alias, subjects[j].alias)
    }
  }

  const lookup = (key: string): number => {
    const line = probeLine.get(key)
    if (line === undefined) {
      throw new Error(`internal: missing probe ${key}`)
    }
    return line
  }

  return {
    content: `${[...header, ...probes].join('\n')}\nexport {}\n`,
    lineOf: (from, to) => lookup(`p:${from}:${to}`),
    lineToNever: (index) => lookup(`n:${index}`),
    lineFromUnknown: (index) => lookup(`u:${index}`),
    lineToString: (index) => lookup(`s:${index}`),
    canaryLine: lookup('canary'),
  }
}

// --- diagnostics parsing ----------------------------------------------------

const DIAGNOSTIC_LINE =
  /(?:^|[/\\])(main|probes)\.ts\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s*(.*)$/

function parseDiagnostics(
  stdout: string,
  source: string,
): {
  userErrors: Array<SourceDiagnostic>
  failedProbeLines: Set<number>
} {
  const lineStarts = computeLineStarts(source)
  const userErrors: Array<SourceDiagnostic> = []
  const failedProbeLines = new Set<number>()

  for (const raw of stdout.split('\n')) {
    const match = DIAGNOSTIC_LINE.exec(raw.trim())
    if (!match) continue
    const [, file, lineText, columnText, severity, message] = match
    if (file === 'probes') {
      failedProbeLines.add(Number(lineText))
      continue
    }
    const line = Number(lineText) - 1
    const column = Number(columnText) - 1
    const start = (lineStarts[line] ?? 0) + column
    userErrors.push({
      message,
      span: { start, end: Math.min(start + 1, source.length) },
      severity: severity === 'warning' ? 'warning' : 'error',
    })
  }

  return { userErrors, failedProbeLines }
}

function computeLineStarts(source: string): Array<number> {
  const starts = [0]
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}
