import * as ts from 'typescript'
import {
  createSystem,
  createVirtualTypeScriptEnvironment,
} from '@typescript/vfs'
import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'

import { scanExports } from '#/adapters/typescript/analyzer/scan-exports.ts'
import type { CompletionEntry, VirtualType } from '#/core/analysis/adapter.ts'
import type {
  AnalysisResult,
  PairRelation,
  RelationKind,
  SourceDiagnostic,
  TypeEntity,
} from '#/core/set-model/types.ts'

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
  completions: (source: string, offset: number) => Array<CompletionEntry>
  dispose: () => void
}

const MAIN_FILE = '/main.ts'
/** Synthetic module resolving every displayed type to a probe alias. */
const PROBE_FILE = '/probe.ts'

const COMPLETION_LIMIT = 60

/**
 * `strictFunctionTypes` is load-bearing — the contravariance teaching
 * demos rely on function parameters being checked contravariantly.
 * No DOM lib: the type universe stays platform-neutral.
 */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  strictFunctionTypes: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  lib: ['lib.es2022.d.ts'],
  types: [],
  noEmit: true,
  skipLibCheck: true,
  noUnusedLocals: false,
}

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

  const mainDiagnostics = (): Array<SourceDiagnostic> => {
    const raw = [
      ...env.languageService.getSyntacticDiagnostics(MAIN_FILE),
      ...env.languageService.getSemanticDiagnostics(MAIN_FILE),
    ]
    return raw.map((diagnostic) => ({
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      span: {
        start: diagnostic.start ?? 0,
        end: (diagnostic.start ?? 0) + (diagnostic.length ?? 0),
      },
      severity:
        diagnostic.category === ts.DiagnosticCategory.Error
          ? ('error' as const)
          : ('warning' as const),
    }))
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
    const probeLines = [importLine, ...codeAliases, ...virtualAliases].filter(
      (line) => line !== '',
    )
    setFile(PROBE_FILE, probeLines.join('\n'))

    const userErrors = mainDiagnostics()
    if (userErrors.some((diagnostic) => diagnostic.severity === 'error')) {
      // Broken user code makes type queries meaningless: report the
      // diagnostics and let the canvas keep its last good result.
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
        entity: {
          id: entry.name,
          name: entry.name,
          typeText: entry.typeText,
          expandedText: expansionOf(type, entry.name, entry.typeText),
          special: classify(type),
          origin: 'code',
          declarationSpan: entry.span,
        },
      })
    })
    virtualTypes.forEach((virtual, index) => {
      if (brokenAliases.has(`__V${index}`)) return
      const type = aliasTypes.get(`__V${index}`)
      if (!type) return
      subjects.push({
        type,
        entity: {
          id: `preset:${virtual.name}`,
          name: virtual.name,
          typeText: virtual.typeText,
          expandedText: expansionOf(type, virtual.name, virtual.typeText),
          special: classify(type),
          origin: 'preset',
          declarationSpan: null,
        },
      })
    })

    const drawable = subjects.filter(
      (subject) => subject.entity.special === 'none',
    )
    const relations: Array<PairRelation> = []
    for (let i = 0; i < drawable.length; i += 1) {
      for (let j = i + 1; j < drawable.length; j += 1) {
        const forward = checker.isTypeAssignableTo(
          drawable[i].type,
          drawable[j].type,
        )
        const backward = checker.isTypeAssignableTo(
          drawable[j].type,
          drawable[i].type,
        )
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

    return {
      entities: subjects.map((subject) => subject.entity),
      relations,
      diagnostics: [...userErrors, ...scanDiagnostics],
      anyEntityNames: subjects
        .filter((subject) => subject.entity.special === 'outside-set-theory')
        .map((subject) => subject.entity.name),
    }
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
  ): Array<CompletionEntry> => {
    setFile(MAIN_FILE, source)
    const result = env.languageService.getCompletionsAtPosition(
      MAIN_FILE,
      offset,
      undefined,
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

  const dispose = () => {
    env.languageService.dispose()
  }

  return { analyze, check, quickInfo, completions, dispose }
}
