import * as ts from 'typescript'
import {
  createSystem,
  createVirtualTypeScriptEnvironment,
} from '@typescript/vfs'
import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'

import { TS_DOMAIN } from '#/adapters/typescript/universe.ts'
import type { TsDomainId } from '#/adapters/typescript/universe.ts'
import {
  classifyPart,
  unionParts,
} from '#/adapters/typescript/analyzer/decompose.ts'
import type { DomainProbes } from '#/adapters/typescript/analyzer/decompose.ts'
import { assemble } from '#/adapters/typescript/analyzer/assemble.ts'
import type {
  PairProbeRequest,
  PairProbeResolution,
  ResolvedEntity,
} from '#/adapters/typescript/analyzer/assemble.ts'
import type {
  AnalysisResult,
  SourceDiagnostic,
  SourceSpan,
  SpecialRole,
  TypeEntity,
} from '#/core/set-model/types.ts'

export interface TsAnalyzerOptions {
  /**
   * lib file name -> content (e.g. `lib.es2022.d.ts` -> "..."), injected
   * so node tests read node_modules while the browser worker bundles the
   * files as raw assets. Names may come with or without a leading slash.
   */
  libFiles: Map<string, string>
}

export interface TsAnalyzer {
  analyze: (source: string) => AnalysisResult
  quickInfo: (source: string, position: number) => string | null
  dispose: () => void
}

const MAIN_FILE = '/main.ts'
const PROBE_FILE = '/__typarium_probes.ts'

/**
 * Hard cap on displayed entities: an Euler canvas past this count stops
 * teaching anything, and the O(N²) relation matrix stops being free.
 */
const MAX_ENTITIES = 24

/**
 * The analysis engine pins TypeScript 5.9.x: TS 7 is the native compiler
 * with no JS API, so 5.9 is the last line that runs in a browser.
 *
 * `strictFunctionTypes` is load-bearing — the contravariance teaching
 * demos rely on function parameters being checked contravariantly.
 * `noUnusedLocals` stays off: teaching snippets keep scratch types around.
 */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  strictFunctionTypes: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts'],
  types: [],
  noEmit: true,
  skipLibCheck: true,
  noUnusedLocals: false,
}

interface ScannedExport {
  name: string
  span: SourceSpan
  isEnum: boolean
  hasMethodSignature: boolean
}

export function createTsAnalyzer(options: TsAnalyzerOptions): TsAnalyzer {
  const files = new Map<string, string>()
  for (const [name, content] of options.libFiles) {
    files.set(name.startsWith('/') ? name : `/${name}`, content)
  }
  files.set(MAIN_FILE, '\n')
  files.set(PROBE_FILE, buildProbeFile([], []))

  const env: VirtualTypeScriptEnvironment = createVirtualTypeScriptEnvironment(
    createSystem(files),
    [MAIN_FILE, PROBE_FILE],
    ts,
    COMPILER_OPTIONS,
  )

  let currentSource: string | null = null
  const setMain = (source: string) => {
    if (currentSource === source) return
    currentSource = source
    // vfs deletes empty files on update; keep a newline floor so the
    // root file always exists for the language service.
    env.updateFile(MAIN_FILE, source.length > 0 ? source : '\n')
  }

  const analyze = (source: string): AnalysisResult => {
    setMain(source)

    const { exports: scanned, diagnostics: scanDiagnostics } =
      scanExports(source)
    env.updateFile(PROBE_FILE, buildProbeFile(scanned, []))

    const first = runPass(env, scanned, new Map())
    if (first.missingProbes.length === 0) {
      return {
        ...first.result,
        diagnostics: [...first.result.diagnostics, ...scanDiagnostics],
      }
    }

    // Second pass: synthesize `(A) & (B)` aliases for every undecided
    // refinement pair, then redo the whole analysis in the new checker
    // (ts.Type identities are per-program and must not cross passes).
    const requests = dedupeRequests(first.missingProbes)
    env.updateFile(PROBE_FILE, buildProbeFile(scanned, requests))
    const second = runPass(env, scanned, resolvePairProbes(env, requests))
    return {
      ...second.result,
      diagnostics: [...second.result.diagnostics, ...scanDiagnostics],
    }
  }

  const quickInfo = (source: string, position: number): string | null => {
    setMain(source)
    const info = env.languageService.getQuickInfoAtPosition(MAIN_FILE, position)
    if (!info || !info.displayParts) return null
    const text = info.displayParts.map((part) => part.text).join('')
    return text.length > 0 ? text : null
  }

  const dispose = () => {
    env.languageService.dispose()
  }

  return { analyze, quickInfo, dispose }
}

// --- syntactic scan --------------------------------------------------------

function scanExports(source: string): {
  exports: Array<ScannedExport>
  diagnostics: Array<SourceDiagnostic>
} {
  const sourceFile = ts.createSourceFile(
    MAIN_FILE,
    source,
    ts.ScriptTarget.ES2022,
    true,
  )
  const seen = new Set<string>()
  const all: Array<ScannedExport> = []

  for (const statement of sourceFile.statements) {
    if (
      !ts.isTypeAliasDeclaration(statement) &&
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isEnumDeclaration(statement)
    ) {
      continue
    }
    const isExported =
      (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0
    if (!isExported) continue

    // Generic types are sets only once instantiated: include a generic
    // export only when every type parameter has a default (TS 2.3 allows
    // referencing it bare, which instantiates with the defaults).
    const typeParameters = ts.isEnumDeclaration(statement)
      ? undefined
      : statement.typeParameters
    if (
      typeParameters &&
      typeParameters.length > 0 &&
      !typeParameters.every((parameter) => parameter.default !== undefined)
    ) {
      continue
    }

    const name = statement.name.text
    if (seen.has(name)) continue
    seen.add(name)
    all.push({
      name,
      span: { start: statement.getStart(sourceFile), end: statement.getEnd() },
      isEnum: ts.isEnumDeclaration(statement),
      hasMethodSignature: containsMethodSignature(statement),
    })
  }

  if (all.length <= MAX_ENTITIES) {
    return { exports: all, diagnostics: [] }
  }
  const truncated = all.slice(0, MAX_ENTITIES)
  const firstDropped = all[MAX_ENTITIES]
  return {
    exports: truncated,
    diagnostics: [
      {
        message: `Too many exported types: showing the first ${MAX_ENTITIES} of ${all.length}.`,
        span: firstDropped.span,
        severity: 'warning',
      },
    ],
  }
}

function containsMethodSignature(node: ts.Node): boolean {
  let found = false
  const visit = (child: ts.Node) => {
    if (found) return
    if (ts.isMethodSignature(child)) {
      found = true
      return
    }
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node, visit)
  return found
}

// --- probe file ------------------------------------------------------------

const DOMAIN_PROBE_SOURCES: Array<[TsDomainId, string]> = [
  [TS_DOMAIN.string, 'string'],
  [TS_DOMAIN.number, 'number'],
  [TS_DOMAIN.bigint, 'bigint'],
  [TS_DOMAIN.boolean, 'boolean'],
  [TS_DOMAIN.symbol, 'symbol'],
  [TS_DOMAIN.null, 'null'],
  [TS_DOMAIN.undefined, 'undefined'],
  [TS_DOMAIN.object, 'object'],
]

const domainAliasName = (domain: string) => `__dom_${domain}`
const entityAliasName = (name: string) => `__ent_${name}`
const pairAliasName = (index: number) => `__x_${index}`

/**
 * The probe file lives beside the user's module in the same program:
 * domain aliases anchor the basemap, `__ent_*` aliases resolve exported
 * types (bare reference instantiates all-default generics), `__x_*`
 * aliases materialize intersections for emptiness checks. Probe
 * diagnostics are never surfaced — only `/main.ts` diagnostics are.
 */
function buildProbeFile(
  exports: Array<ScannedExport>,
  requests: Array<PairProbeRequest>,
): string {
  const lines: Array<string> = []
  if (exports.length > 0) {
    lines.push(`import type * as U from './main'`)
  }
  for (const [domain, source] of DOMAIN_PROBE_SOURCES) {
    lines.push(`type ${domainAliasName(domain)} = ${source}`)
  }
  for (const scanned of exports) {
    lines.push(`type ${entityAliasName(scanned.name)} = U.${scanned.name}`)
  }
  requests.forEach((request, index) => {
    lines.push(
      `type ${pairAliasName(index)} = (${request.probeTextA}) & (${request.probeTextB})`,
    )
  })
  lines.push('export {}')
  return `${lines.join('\n')}\n`
}

function dedupeRequests(
  requests: Array<PairProbeRequest>,
): Array<PairProbeRequest> {
  const byKey = new Map<string, PairProbeRequest>()
  for (const request of requests) {
    if (!byKey.has(request.key)) byKey.set(request.key, request)
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

// --- pass execution ---------------------------------------------------------

interface PassOutput {
  result: AnalysisResult
  missingProbes: Array<PairProbeRequest>
}

function getProgramOrThrow(env: VirtualTypeScriptEnvironment): ts.Program {
  const program = env.languageService.getProgram()
  if (!program)
    throw new Error('typarium analyzer: language service lost its program')
  return program
}

function probeAliasTypes(
  program: ts.Program,
  checker: ts.TypeChecker,
): Map<string, { type: ts.Type; declaration: ts.TypeAliasDeclaration }> {
  const probeFile = program.getSourceFile(PROBE_FILE)
  const byName = new Map<
    string,
    { type: ts.Type; declaration: ts.TypeAliasDeclaration }
  >()
  if (!probeFile) return byName
  for (const statement of probeFile.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue
    byName.set(statement.name.text, {
      type: checker.getTypeAtLocation(statement.name),
      declaration: statement,
    })
  }
  return byName
}

function runPass(
  env: VirtualTypeScriptEnvironment,
  scanned: Array<ScannedExport>,
  resolutions: Map<string, PairProbeResolution>,
): PassOutput {
  const program = getProgramOrThrow(env)
  const checker = program.getTypeChecker()
  const aliases = probeAliasTypes(program, checker)

  const domainProbes: DomainProbes = { byDomain: new Map() }
  for (const [domain] of DOMAIN_PROBE_SOURCES) {
    const alias = aliases.get(domainAliasName(domain))
    if (alias) domainProbes.byDomain.set(domain, alias.type)
  }

  const diagnostics = collectMainDiagnostics(env)
  const hasErrors = diagnostics.some(
    (diagnostic) => diagnostic.severity === 'error',
  )

  // Entity resolution. Error types share TypeFlags.Any with real `any`;
  // `intrinsicName === 'error'` (a long-stable internal) plus the error
  // diagnostics tell them apart: broken entities are dropped — the editor
  // already owns the error presentation.
  interface Prepared extends ResolvedEntity {
    scanned: ScannedExport
  }
  const prepared: Array<Prepared> = []
  for (const scannedExport of scanned) {
    const alias = aliases.get(entityAliasName(scannedExport.name))
    if (!alias) continue
    const type = alias.type
    const intrinsicName = (type as { intrinsicName?: string }).intrinsicName
    const isAnyLike = (type.flags & ts.TypeFlags.Any) !== 0
    if (isAnyLike && (intrinsicName === 'error' || hasErrors)) continue

    const special: SpecialRole =
      (type.flags & ts.TypeFlags.Unknown) !== 0
        ? 'universe'
        : (type.flags & ts.TypeFlags.Never) !== 0
          ? 'empty'
          : isAnyLike
            ? 'outside-set-theory'
            : 'none'

    prepared.push({
      scanned: scannedExport,
      id: scannedExport.name,
      type,
      special,
      parts: [],
      isEnum: scannedExport.isEnum,
      hasMethodSignature: scannedExport.hasMethodSignature,
    })
  }

  // `U.<name>` keeps probe text resolvable for named (interface/enum)
  // types whose structural print would not round-trip in the probe file.
  const probeNameByType = new Map<ts.Type, string>()
  for (const entity of prepared) {
    probeNameByType.set(entity.type, `U.${entity.id}`)
  }
  const entityProbeName = (type: ts.Type) => probeNameByType.get(type)

  for (const entity of prepared) {
    if (entity.special !== 'none') continue
    entity.parts = unionParts(entity.type).map((part) =>
      classifyPart(checker, domainProbes, part, entityProbeName),
    )
  }

  const { cells, relations, deviations, missingProbes } = assemble(
    checker,
    domainProbes,
    prepared,
    resolutions,
  )

  const entities: Array<TypeEntity> = prepared.map((entity) => ({
    id: entity.id,
    name: entity.scanned.name,
    // InTypeAlias suppresses the alias symbol so `R1` prints as its
    // structure (`string | boolean`); default truncation keeps labels sane.
    typeText: checker.typeToString(
      entity.type,
      undefined,
      ts.TypeFormatFlags.InTypeAlias,
    ),
    expandedText: checker.typeToString(
      entity.type,
      undefined,
      ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.NoTruncation,
    ),
    special: entity.special,
    declarationSpan: entity.scanned.span,
  }))

  return {
    result: {
      entities,
      cells,
      relations,
      deviations,
      diagnostics,
      anyEntityNames: prepared
        .filter((entity) => entity.special === 'outside-set-theory')
        .map((entity) => entity.id),
    },
    missingProbes,
  }
}

/**
 * Resolves `__x_*` intersection aliases into overlap verdicts.
 *
 * Emptiness must go through `isTypeAssignableTo(type, never)` — the 3.9
 * discriminant-property reduction is lazy, so `TypeFlags.Never` misses a
 * whole class of empty intersections. A non-empty object intersection
 * with a `never` property (`{a: string} & {a: number}`) is one the
 * checker refuses to reduce: reported as `unknown`, never as fact.
 */
function resolvePairProbes(
  env: VirtualTypeScriptEnvironment,
  requests: Array<PairProbeRequest>,
): Map<string, PairProbeResolution> {
  const program = getProgramOrThrow(env)
  const checker = program.getTypeChecker()
  const aliases = probeAliasTypes(program, checker)
  const neverType = checker.getNeverType()

  const resolutions = new Map<string, PairProbeResolution>()
  requests.forEach((request, index) => {
    const alias = aliases.get(pairAliasName(index))
    if (!alias) {
      resolutions.set(request.key, { verdict: 'unknown' })
      return
    }
    const type = alias.type
    if ((type.flags & ts.TypeFlags.Any) !== 0) {
      // Probe text failed to parse; stay honest with an OR-witness fallback.
      resolutions.set(request.key, { verdict: 'unknown' })
      return
    }
    if (checker.isTypeAssignableTo(type, neverType)) {
      resolutions.set(request.key, { verdict: 'empty', intersectionType: type })
      return
    }
    if (
      request.domain === TS_DOMAIN.object &&
      hasNeverProperty(checker, type, alias.declaration)
    ) {
      resolutions.set(request.key, {
        verdict: 'unknown',
        intersectionType: type,
      })
      return
    }
    resolutions.set(request.key, { verdict: 'overlap', intersectionType: type })
  })
  return resolutions
}

function hasNeverProperty(
  checker: ts.TypeChecker,
  type: ts.Type,
  location: ts.Node,
): boolean {
  return checker.getPropertiesOfType(type).some((property) => {
    const propertyType = checker.getTypeOfSymbolAtLocation(property, location)
    return (propertyType.flags & ts.TypeFlags.Never) !== 0
  })
}

function collectMainDiagnostics(
  env: VirtualTypeScriptEnvironment,
): Array<SourceDiagnostic> {
  const service = env.languageService
  const raw = [
    ...service.getSyntacticDiagnostics(MAIN_FILE),
    ...service.getSemanticDiagnostics(MAIN_FILE),
  ]
  const out: Array<SourceDiagnostic> = []
  for (const diagnostic of raw) {
    const severity =
      diagnostic.category === ts.DiagnosticCategory.Error
        ? 'error'
        : diagnostic.category === ts.DiagnosticCategory.Warning
          ? 'warning'
          : null
    if (severity === null) continue
    const start = diagnostic.start ?? 0
    out.push({
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      span: { start, end: start + (diagnostic.length ?? 0) },
      severity,
    })
  }
  return out
}
