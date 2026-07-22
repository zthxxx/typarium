import * as ts from 'typescript'

import {
  createSystem,
  createVirtualTypeScriptEnvironment,
} from '@typescript/vfs'
import type { createTwoslasher } from 'twoslash'
import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'

import { scanExports } from '#/adapters/typescript/analyzer/scan-exports.ts'
import type {
  CompletionEntry,
  CompletionPreferences,
  InlineQuery,
  VirtualType,
} from '#/core/analysis/adapter.ts'
import type {
  AnalysisResult,
  DiagnosticDomain,
  PairRelation,
  RelationKind,
  SourceDiagnostic,
  TypeEntity,
} from '#/core/set-model/types.ts'

export { FIXED_COMPILER_OPTIONS_DISPLAY } from '#/adapters/typescript/compiler-options-display.ts'

/**
 * The v3 analysis engine (ADR-0015): ONE TypeScript implementation
 * (typescript@6.0.3, the last JS-API line) powers everything — the
 * containment matrix via `checker.isTypeAssignableTo`, plus the editor
 * language features (diagnostics, hover, completions) from the same
 * LanguageService. No probe files, no second toolchain in the bundle.
 */

export interface TsAnalyzerOptions {
  /**
   * lib file name -> content (e.g. `lib.es2022.d.ts` -> "..."), injected
   * so node tests read node_modules while the browser worker bundles the
   * files as raw assets. Names may come with or without a leading slash.
   */
  libFiles: Map<string, string>
}

export interface TsAnalyzer {
  analyze: (source: string, virtualTypes: Array<VirtualType>) => AnalysisResult
  check: (source: string) => Array<SourceDiagnostic>
  quickInfo: (source: string, offset: number) => string | null
  completions: (
    source: string,
    offset: number,
    preferences?: CompletionPreferences,
  ) => Array<CompletionEntry>
  /** Twoslash `// ^?` queries; skips the twoslasher when unmarked. */
  twoslashQueries: (source: string) => Promise<Array<InlineQuery>>
  /** Inject an acquired declaration file (ATA) into the project. */
  addLibraryFile: (path: string, content: string) => void
  dispose: () => void
}

const MAIN_FILE = '/main.ts'
/** Synthetic module resolving every displayed type to a probe alias. */
const PROBE_FILE = '/probe.ts'

const COMPLETION_LIMIT = 60

/**
 * The FIXED compiler baseline (product rule): every type computation —
 * canvas analysis, diagnostics, hover, completions — runs under these
 * options, and none of them is user-configurable. `strict` (and with
 * it `strictFunctionTypes`, load-bearing for the contravariance demos)
 * must never be weakened.
 */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  isolatedModules: true,
  strict: true,
  strictFunctionTypes: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  lib: ['lib.dom.d.ts', 'lib.dom.iterable.d.ts', 'lib.esnext.d.ts'],
  noEmit: true,
  skipLibCheck: true,
  noUnusedLocals: false,
}

/**
 * Read-only display rows for the editor-config panel. The `lib` row
 * mirrors the product spec verbatim; `react` / `react-dom` are not TS
 * libs — their typings arrive through automatic type acquisition the
 * moment the code imports them.
 */
/**
 * Sentinel witnesses backing the soundness correction: TypeScript's
 * assignability is deliberately unsound and NOT transitive (`{}` is
 * mutually assignable with `object`, yet `string ⊆ {}` while
 * `string ⊄ object`), so a raw pairwise matrix can merge sets that
 * differ. A claimed A ⊆ B must also be monotone over every witness:
 * whatever A accepts, B must accept.
 */
const SENTINEL_WITNESSES: Array<string> = [
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'null',
  'undefined',
  '{ __probe: string }',
  '() => void',
  'unknown[]',
  'Record<string, unknown>',
]

export function createTsAnalyzer(options: TsAnalyzerOptions): TsAnalyzer {
  const files = new Map<string, string>()
  for (const [name, content] of options.libFiles) {
    files.set(name.startsWith('/') ? name : `/${name}`, content)
  }
  files.set(MAIN_FILE, '\n')
  files.set(PROBE_FILE, '\n')

  const env: VirtualTypeScriptEnvironment = createVirtualTypeScriptEnvironment(
    createSystem(files),
    [MAIN_FILE, PROBE_FILE],
    ts,
    COMPILER_OPTIONS,
  )

  // vfs deletes empty files on update; keep a newline floor so root
  // files always exist for the language service.
  const contents = new Map<string, string>([
    [MAIN_FILE, '\n'],
    [PROBE_FILE, '\n'],
  ])
  const setFile = (fileName: string, text: string) => {
    const next = text.length > 0 ? text : '\n'
    if (contents.get(fileName) === next) return
    contents.set(fileName, next)
    env.updateFile(fileName, next)
  }

  /**
   * Classify a semantic diagnostic by WHERE it sits: inside type space
   * (type aliases, interfaces, annotations, type parameters, heritage
   * clauses, enums) or in import/export wiring, its error can change
   * the meaning of exported types; anywhere else it is a value-space
   * error that cannot.
   */
  const semanticDomain = (
    sourceFile: ts.SourceFile,
    position: number,
  ): DiagnosticDomain => {
    let innermost: ts.Node = sourceFile
    const descend = (node: ts.Node): void => {
      if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
        innermost = node
        ts.forEachChild(node, descend)
      }
    }
    ts.forEachChild(sourceFile, descend)
    for (
      let node: ts.Node = innermost;
      !ts.isSourceFile(node);
      node = node.parent
    ) {
      if (
        ts.isTypeNode(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeParameterDeclaration(node) ||
        ts.isHeritageClause(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isImportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        ts.isExportAssignment(node)
      ) {
        return 'type'
      }
    }
    return 'value'
  }

  const mainDiagnostics = (): Array<SourceDiagnostic> => {
    const syntactic = env.languageService.getSyntacticDiagnostics(MAIN_FILE)
    const semantic = env.languageService.getSemanticDiagnostics(MAIN_FILE)
    const sourceFile = env.languageService
      .getProgram()
      ?.getSourceFile(MAIN_FILE)
    const toDiagnostic = (
      diagnostic: ts.Diagnostic,
      domain: DiagnosticDomain,
    ): SourceDiagnostic => ({
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      span: {
        start: diagnostic.start ?? 0,
        end: (diagnostic.start ?? 0) + (diagnostic.length ?? 0),
      },
      severity:
        diagnostic.category === ts.DiagnosticCategory.Error
          ? ('error' as const)
          : ('warning' as const),
      domain,
    })
    return [
      ...syntactic.map((diagnostic) => toDiagnostic(diagnostic, 'syntax')),
      ...semantic.map((diagnostic) =>
        toDiagnostic(
          diagnostic,
          // No span or no AST to place it in: assume it can affect
          // types rather than silently drawing a wrong diagram.
          diagnostic.start === undefined || !sourceFile
            ? 'type'
            : semanticDomain(sourceFile, diagnostic.start),
        ),
      ),
    ]
  }

  const analyze = (
    source: string,
    virtualTypes: Array<VirtualType>,
  ): AnalysisResult => {
    const { exports: scanned, diagnostics: scanDiagnostics } =
      scanExports(source)
    setFile(MAIN_FILE, source)

    // One probe alias per displayed type. Bare references to
    // all-default generics instantiate with the defaults, so probe
    // aliases uniformly yield fully instantiated types.
    const importLine =
      scanned.length > 0
        ? `import type { ${scanned
            .map((entry, index) => `${entry.name} as __I${index}`)
            .join(', ')} } from './main.ts'`
        : ''
    const codeAliases = scanned.map(
      (_, index) => `export type __E${index} = __I${index}`,
    )
    const virtualAliases = virtualTypes.map(
      (virtual, index) => `export type __V${index} = ${virtual.typeText}`,
    )
    const witnessAliases = SENTINEL_WITNESSES.map(
      (text, index) => `export type __W${index} = ${text}`,
    )
    const probeLines = [
      importLine,
      ...codeAliases,
      ...virtualAliases,
      ...witnessAliases,
    ].filter((line) => line !== '')
    setFile(PROBE_FILE, probeLines.join('\n'))

    const userErrors = mainDiagnostics()
    if (
      userErrors.some(
        (diagnostic) =>
          diagnostic.severity === 'error' && diagnostic.domain !== 'value',
      )
    ) {
      // Syntax or type-space errors make type queries meaningless:
      // report the diagnostics and let the canvas keep its last good
      // result. Value-space errors (e.g. a bad assignment) cannot
      // change exported type meaning, so analysis proceeds through
      // them (product rule).
      return {
        entities: [],
        relations: [],
        diagnostics: [...userErrors, ...scanDiagnostics],
        anyEntityNames: [],
      }
    }

    const program = env.languageService.getProgram()
    const probeFile = program?.getSourceFile(PROBE_FILE)
    if (!program || !probeFile) {
      throw new Error('language service lost its program or probe file')
    }
    const checker = program.getTypeChecker()

    // Defensive: a broken virtual-preset expression (catalog bug) must
    // drop that entity, not poison the whole result as an error type.
    const probeErrors = env.languageService.getSemanticDiagnostics(PROBE_FILE)
    const brokenSpans = probeErrors.map((diagnostic) => ({
      start: diagnostic.start ?? 0,
      end: (diagnostic.start ?? 0) + (diagnostic.length ?? 0),
    }))

    const aliasTypes = new Map<string, ts.Type>()
    const brokenAliases = new Set<string>()
    for (const statement of probeFile.statements) {
      if (!ts.isTypeAliasDeclaration(statement)) continue
      const overlapsError = brokenSpans.some(
        (span) =>
          span.start < statement.getEnd() &&
          span.end > statement.getStart(probeFile),
      )
      if (overlapsError) {
        brokenAliases.add(statement.name.text)
        continue
      }
      aliasTypes.set(
        statement.name.text,
        checker.getTypeAtLocation(statement.name),
      )
    }

    const neverType = checker.getNeverType()
    const unknownType = checker.getUnknownType()

    interface Subject {
      entity: TypeEntity
      type: ts.Type
      /** Probe alias (`__En` / `__Vn`) — pass-two lookups re-fetch by it. */
      aliasName: string
    }
    const subjects: Array<Subject> = []

    const classify = (type: ts.Type): TypeEntity['special'] => {
      if ((type.flags & ts.TypeFlags.Any) !== 0) return 'outside-set-theory'
      if (checker.isTypeAssignableTo(type, neverType)) return 'empty'
      if (checker.isTypeAssignableTo(unknownType, type)) return 'universe'
      return 'none'
    }

    const expansionOf = (
      type: ts.Type,
      name: string,
      fallback: string,
    ): string => {
      const printed = checker.typeToString(
        type,
        undefined,
        ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.NoTruncation,
      )
      // Interfaces/enums print as their own name — no expansion there;
      // keep the declaration text so the tooltip still teaches shape.
      return printed === name ? fallback : printed
    }

    scanned.forEach((entry, index) => {
      const type = aliasTypes.get(`__E${index}`)
      if (!type) return
      subjects.push({
        type,
        aliasName: `__E${index}`,
        entity: {
          id: entry.name,
          name: entry.name,
          typeText: entry.typeText,
          expandedText: expansionOf(type, entry.name, entry.typeText),
          special: classify(type),
          origin: 'code',
          declarationSpan: entry.span,
          coveredBySubsets: false,
        },
      })
    })
    virtualTypes.forEach((virtual, index) => {
      if (brokenAliases.has(`__V${index}`)) return
      const type = aliasTypes.get(`__V${index}`)
      if (!type) return
      subjects.push({
        type,
        aliasName: `__V${index}`,
        entity: {
          id: `preset:${virtual.name}`,
          name: virtual.name,
          typeText: virtual.typeText,
          expandedText: expansionOf(type, virtual.name, virtual.typeText),
          special: classify(type),
          origin: 'preset',
          declarationSpan: null,
          coveredBySubsets: false,
        },
      })
    })

    const drawable = subjects.filter(
      (subject) => subject.entity.special === 'none',
    )

    // Witness set: every displayed type plus the fixed sentinels.
    // acceptance[i][w] = "does subject i accept witness w".
    const witnessTypes: Array<ts.Type> = [
      ...drawable.map((subject) => subject.type),
    ]
    SENTINEL_WITNESSES.forEach((_, index) => {
      const type = aliasTypes.get(`__W${index}`)
      if (type) witnessTypes.push(type)
    })
    const acceptance: Array<Array<boolean>> = drawable.map((subject) =>
      witnessTypes.map((witness) =>
        checker.isTypeAssignableTo(witness, subject.type),
      ),
    )
    // A ⊆ B is unsound-safe only when monotone: ∀w accepted by A,
    // B accepts w too. This is what refutes `{} ⊆ object` (witness
    // `string`) while keeping every sound containment intact.
    const monotone = (a: number, b: number): boolean =>
      acceptance[a].every((accepted, w) => !accepted || acceptance[b][w])

    const relations: Array<PairRelation> = []
    for (let i = 0; i < drawable.length; i += 1) {
      for (let j = i + 1; j < drawable.length; j += 1) {
        const forward =
          checker.isTypeAssignableTo(drawable[i].type, drawable[j].type) &&
          monotone(i, j)
        const backward =
          checker.isTypeAssignableTo(drawable[j].type, drawable[i].type) &&
          monotone(j, i)
        const kind: RelationKind =
          forward && backward
            ? 'equivalent'
            : forward
              ? 'subset'
              : backward
                ? 'superset'
                : 'unrelated'
        relations.push({
          a: drawable[i].entity.id,
          b: drawable[j].entity.id,
          kind,
        })
      }
    }

    markUnionCoverage(drawable, relations)

    return {
      entities: subjects.map((subject) => subject.entity),
      relations,
      diagnostics: [...userErrors, ...scanDiagnostics],
      anyEntityNames: subjects
        .filter((subject) => subject.entity.special === 'outside-set-theory')
        .map((subject) => subject.entity.name),
    }
  }

  /**
   * Pass two: `coveredBySubsets` — is P exactly the union of its proper
   * subsets among displayed entities? ⊇ holds by construction, so one
   * `P ⊆ S₁ | … | Sₖ` query per candidate decides it. The checker has
   * no public union factory, so the unions are synthesized as extra
   * probe aliases; the file update invalidates pass-one `ts.Type`s,
   * hence every type here is re-fetched from the fresh program.
   * Special entities never appear in `relations` → zero subsets → the
   * constructor default `false` already answers for them.
   */
  const markUnionCoverage = (
    drawable: Array<{ entity: TypeEntity; aliasName: string }>,
    relations: Array<PairRelation>,
  ): void => {
    const aliasOf = new Map(
      drawable.map((subject) => [subject.entity.id, subject.aliasName]),
    )
    const subsetsOf = new Map<string, Array<string>>()
    for (const relation of relations) {
      if (relation.kind === 'subset') {
        subsetsOf.set(relation.b, [
          ...(subsetsOf.get(relation.b) ?? []),
          relation.a,
        ])
      } else if (relation.kind === 'superset') {
        subsetsOf.set(relation.a, [
          ...(subsetsOf.get(relation.a) ?? []),
          relation.b,
        ])
      }
    }

    const candidates = drawable.filter(
      (subject) => (subsetsOf.get(subject.entity.id)?.length ?? 0) > 0,
    )
    if (candidates.length === 0) return

    const unionLines = candidates.map((subject, index) => {
      const memberAliases = (subsetsOf.get(subject.entity.id) ?? []).map(
        (id) => aliasOf.get(id) ?? 'never',
      )
      return `export type __U${index} = ${memberAliases.join(' | ')}`
    })
    setFile(
      PROBE_FILE,
      `${contents.get(PROBE_FILE) ?? ''}\n${unionLines.join('\n')}`,
    )

    const program = env.languageService.getProgram()
    const probeFile = program?.getSourceFile(PROBE_FILE)
    if (!program || !probeFile) return
    const checker = program.getTypeChecker()
    const freshTypes = new Map<string, ts.Type>()
    for (const statement of probeFile.statements) {
      if (!ts.isTypeAliasDeclaration(statement)) continue
      freshTypes.set(
        statement.name.text,
        checker.getTypeAtLocation(statement.name),
      )
    }

    // Witness types must come from THIS program: pass-one ts.Types are
    // invalidated by the probe-file update above.
    const freshWitnesses: Array<ts.Type> = []
    for (const subject of drawable) {
      const type = freshTypes.get(subject.aliasName)
      if (type) freshWitnesses.push(type)
    }
    SENTINEL_WITNESSES.forEach((_, index) => {
      const type = freshTypes.get(`__W${index}`)
      if (type) freshWitnesses.push(type)
    })

    candidates.forEach((subject, index) => {
      const target = freshTypes.get(subject.aliasName)
      const union = freshTypes.get(`__U${index}`)
      if (!target || !union) return
      const rawCovered = checker.isTypeAssignableTo(target, union)
      if (!rawCovered) {
        subject.entity.coveredBySubsets = false
        return
      }
      // Unsound-safe guard, same witness discipline as the matrix:
      // every witness the candidate accepts must also land in the
      // members' union — otherwise `{}` would count as covered by
      // `object` through raw (non-transitive) assignability alone.
      subject.entity.coveredBySubsets = freshWitnesses.every(
        (witness) =>
          !checker.isTypeAssignableTo(witness, target) ||
          checker.isTypeAssignableTo(witness, union),
      )
    })
  }

  const check = (source: string): Array<SourceDiagnostic> => {
    setFile(MAIN_FILE, source)
    return mainDiagnostics()
  }

  const quickInfo = (source: string, offset: number): string | null => {
    setFile(MAIN_FILE, source)
    const info = env.languageService.getQuickInfoAtPosition(MAIN_FILE, offset)
    if (!info || !info.displayParts) return null
    const text = info.displayParts.map((part) => part.text).join('')
    return text.length > 0 ? text : null
  }

  const completions = (
    source: string,
    offset: number,
    preferences?: CompletionPreferences,
  ): Array<CompletionEntry> => {
    setFile(MAIN_FILE, source)
    const result = env.languageService.getCompletionsAtPosition(
      MAIN_FILE,
      offset,
      preferences
        ? { quotePreference: preferences.quotePreference }
        : undefined,
    )
    if (!result) return []
    // Filter by the typed prefix BEFORE capping — a blind cap of the
    // alphabetical list would drop the match the user is typing toward.
    let start = offset
    while (start > 0 && /[A-Za-z0-9_$]/.test(source[start - 1])) start -= 1
    const prefix = source.slice(start, offset).toLowerCase()
    return result.entries
      .filter(
        (entry) => prefix === '' || entry.name.toLowerCase().startsWith(prefix),
      )
      .slice(0, COMPLETION_LIMIT)
      .map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        sortText: entry.sortText,
      }))
  }

  // Twoslash builds its own program per call — lazily created, cached,
  // and only invoked when the source actually carries a `^?` marker.
  // The module itself loads on demand (dynamic import): it never rides
  // in the worker's boot-critical chunk (ADR-0020).
  let twoslasherPromise: Promise<ReturnType<typeof createTwoslasher>> | null =
    null
  const twoslashQueries = async (
    source: string,
  ): Promise<Array<InlineQuery>> => {
    if (!/\/\/\s*\^\?/.test(source)) return []
    twoslasherPromise ??= import('twoslash').then(({ createTwoslasher }) =>
      createTwoslasher({
        tsModule: ts,
        fsMap: new Map(files),
        compilerOptions: COMPILER_OPTIONS,
      }),
    )
    const twoslasher = await twoslasherPromise
    try {
      // keepNotations leaves `// ^?` lines in place so query positions
      // stay in ORIGINAL source coordinates — by default twoslash strips
      // notation lines and reports lines in the stripped output, which
      // shifts every query below the first marker.
      const result = twoslasher(source, 'ts', {
        handbookOptions: {
          noErrorValidation: true,
          noErrors: true,
          keepNotations: true,
        },
      })
      return result.queries
        .filter(
          (query): query is typeof query & { text: string } =>
            typeof query.text === 'string',
        )
        .map((query) => ({
          offset: query.start,
          line: query.line,
          text: query.text,
        }))
    } catch {
      // Twoslash failures (mid-edit broken code) must never take the
      // editor down; the annotation simply shows nothing.
      return []
    }
  }

  const addLibraryFile = (path: string, content: string): void => {
    const fileName = path.startsWith('/') ? path : `/${path}`
    if (contents.get(fileName) === content) return
    contents.set(fileName, content)
    env.createFile(fileName, content)
  }

  const dispose = () => {
    env.languageService.dispose()
  }

  return {
    analyze,
    check,
    quickInfo,
    completions,
    twoslashQueries,
    addLibraryFile,
    dispose,
  }
}
