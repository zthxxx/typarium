import type {
  BootProgressEvent,
  LanguageAdapter,
  LanguageDescriptor,
  LanguagePreset,
  VirtualType,
} from './adapter.ts'
import type { AnalysisResult, SourceDiagnostic } from '@typarium/set-model'

/**
 * In-memory LanguageAdapter with manually-resolved analyze/check calls:
 * tests orchestrate ticket races without timers, and the adapter is the
 * second contract implementation next to the TypeScript one — its
 * deliberately non-TS syntax (`set CN = rhs`) proves no TS knowledge
 * leaks above the adapter boundary. Pure TS, no test-framework imports.
 */

export interface FakeAnalyzeCall {
  source: string
  virtualTypes: Array<VirtualType>
  resolve: (result: AnalysisResult) => void
  reject: (error: unknown) => void
}

export interface FakeCheckCall {
  source: string
  resolve: (diagnostics: Array<SourceDiagnostic>) => void
  reject: (error: unknown) => void
}

export interface FakeLanguageAdapter extends LanguageAdapter {
  /** Every analyze() call in arrival order, awaiting manual resolution. */
  analyzeCalls: Array<FakeAnalyzeCall>
  /** Every check() call in arrival order, awaiting manual resolution. */
  checkCalls: Array<FakeCheckCall>
  /** Fire the type-acquisition signal to every registered listener. */
  emitTypesAcquired: () => void
  /** Fire a boot-progress event to every registered listener. */
  emitBootProgress: (event: BootProgressEvent) => void
  disposed: boolean
}

export const EMPTY_RESULT: AnalysisResult = {
  entities: [],
  relations: [],
  diagnostics: [],
  anyEntityNames: [],
}

/**
 * Instant-resolution mode: analyze/check resolve immediately by
 * actually interpreting the fake language instead of queueing for
 * manual control — for contract runs and tests that only care about
 * the orchestration around calls.
 */
export interface FakeAdapterOptions {
  presets?: Array<LanguagePreset>
  autoResolve?: boolean
}

/**
 * The fake language's real semantics: `set Name = a | b | c` declares
 * the finite value set {a, b, c}. Keywords: `top` = universe, `bottom`
 * = the empty set, `wild` = outside set theory. Containment is literal
 * value-set inclusion — exercising every RelationKind honestly.
 */
export function analyzeFakeSource(
  source: string,
  virtualTypes: Array<VirtualType>,
): AnalysisResult {
  interface Subject {
    id: string
    name: string
    rhs: string
    origin: 'code' | 'preset'
    span: { start: number; end: number } | null
  }
  const subjects: Array<Subject> = []
  const diagnostics: Array<SourceDiagnostic> = []
  const seen = new Set<string>()

  let offset = 0
  for (const line of source.split('\n')) {
    const match = /^set (\w+) = (.+)$/.exec(line)
    if (match && !seen.has(match[1])) {
      seen.add(match[1])
      subjects.push({
        id: match[1],
        name: match[1],
        rhs: match[2].trim(),
        origin: 'code',
        span: { start: offset, end: offset + line.length },
      })
    } else if (!match && line.trim() !== '') {
      diagnostics.push({
        message: `not a set declaration: ${line}`,
        span: { start: offset, end: offset + line.length },
        severity: 'error',
        domain: 'syntax',
      })
    }
    offset += line.length + 1
  }
  for (const virtual of virtualTypes) {
    subjects.push({
      id: `preset:${virtual.name}`,
      name: virtual.name,
      rhs: virtual.typeText.trim(),
      origin: 'preset',
      span: null,
    })
  }

  const valueSet = (rhs: string) =>
    new Set(
      rhs
        .split('|')
        .map((value) => value.trim())
        .filter((value) => value !== '' && value !== 'bottom'),
    )
  const specialOf = (
    rhs: string,
  ): AnalysisResult['entities'][number]['special'] =>
    rhs === 'wild'
      ? 'outside-set-theory'
      : rhs === 'top'
        ? 'universe'
        : valueSet(rhs).size === 0
          ? 'empty'
          : 'none'

  const entities = subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    typeText: subject.rhs,
    expandedText: subject.rhs,
    special: specialOf(subject.rhs),
    origin: subject.origin,
    coveredBySubsets: false,
    declarationSpan: subject.span,
  }))

  const drawable = subjects.filter(
    (subject) => specialOf(subject.rhs) === 'none',
  )
  const relations: AnalysisResult['relations'] = []
  const includes = (a: Set<string>, b: Set<string>) =>
    [...b].every((value) => a.has(value))
  for (let i = 0; i < drawable.length; i += 1) {
    for (let j = i + 1; j < drawable.length; j += 1) {
      const setA = valueSet(drawable[i].rhs)
      const setB = valueSet(drawable[j].rhs)
      const forward = includes(setB, setA)
      const backward = includes(setA, setB)
      relations.push({
        a: drawable[i].id,
        b: drawable[j].id,
        kind:
          forward && backward
            ? 'equivalent'
            : forward
              ? 'subset'
              : backward
                ? 'superset'
                : 'unrelated',
      })
    }
  }

  return {
    entities,
    relations,
    diagnostics,
    anyEntityNames: entities
      .filter((entity) => entity.special === 'outside-set-theory')
      .map((entity) => entity.name),
  }
}

const FAKE_DESCRIPTOR: Omit<LanguageDescriptor, 'presets'> = {
  id: 'fake',
  label: 'Fake',
  editorLanguageId: 'plaintext',
  sampleSource: 'set Sample = sample',
  engineLabel: 'Fake Engine',
  compilerOptionsDisplay: [['mode', 'strict']],
  specialTypeNames: { universe: 'top', empty: 'bottom', any: 'wild' },
  snippet: {
    nextDeclaration: (code, rhs) => {
      const next =
        Math.max(
          0,
          ...[...code.matchAll(/^set C(\d+)\b/gm)].map((match) =>
            Number(match[1]),
          ),
        ) + 1
      return `set C${next} = ${rhs}`
    },
  },
}

export function createFakeAdapter(
  options?: FakeAdapterOptions,
): FakeLanguageAdapter {
  const typesListeners = new Set<() => void>()
  const bootListeners = new Set<(event: BootProgressEvent) => void>()
  const autoResolve = options?.autoResolve ?? false

  const adapter: FakeLanguageAdapter = {
    descriptor: { ...FAKE_DESCRIPTOR, presets: options?.presets ?? [] },
    analyzeCalls: [],
    checkCalls: [],
    disposed: false,

    analyze: (source, virtualTypes) =>
      new Promise<AnalysisResult>((resolve, reject) => {
        adapter.analyzeCalls.push({ source, virtualTypes, resolve, reject })
        if (autoResolve) resolve(analyzeFakeSource(source, virtualTypes))
      }),
    check: (source) =>
      new Promise<Array<SourceDiagnostic>>((resolve, reject) => {
        adapter.checkCalls.push({ source, resolve, reject })
        if (autoResolve) resolve(analyzeFakeSource(source, []).diagnostics)
      }),

    editor: {
      quickInfo: () => Promise.resolve(null),
      completions: () => Promise.resolve([]),
      format: (source) => Promise.resolve(source),
      inlineQueries: () => Promise.resolve([]),
    },

    onTypesAcquired: (listener) => {
      typesListeners.add(listener)
      return () => typesListeners.delete(listener)
    },
    onBootProgress: (listener) => {
      bootListeners.add(listener)
      return () => bootListeners.delete(listener)
    },
    warmup: () => {
      for (const listener of bootListeners) listener({ stage: 'ready' })
      return Promise.resolve()
    },

    emitTypesAcquired: () => {
      for (const listener of typesListeners) listener()
    },
    emitBootProgress: (event) => {
      for (const listener of bootListeners) listener(event)
    },
    dispose: () => {
      adapter.disposed = true
    },
  }
  return adapter
}
