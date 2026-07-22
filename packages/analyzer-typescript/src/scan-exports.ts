import * as ts from 'typescript'
import type { SourceDiagnostic, SourceSpan } from '@typarium/set-model'

/**
 * Syntactic export scan: which top-level declarations become displayed
 * entities, with their display text and source spans. Semantics (types,
 * relations, specials) come from the checker in create-ts-analyzer —
 * same typescript package, one toolchain (ADR-0015).
 */

export interface ScannedExport {
  /** Export identifier — the import target for the probe file. */
  name: string
  /** Entity label: `Name<T, U>` for generics, else the name itself. */
  displayName: string
  span: SourceSpan
  /** Single-line display text: alias RHS, or the whole declaration. */
  typeText: string
  /**
   * Explicit probe instantiation arguments (ADR-0022): per parameter,
   * default > constraint > `unknown`. Absent when a bare reference
   * already instantiates (non-generic, or every parameter defaulted).
   */
  typeArguments?: Array<string>
}

/**
 * Hard cap on displayed entities: a containment canvas past this count
 * stops teaching anything, and the O(N²) relation matrix grows quadratic.
 */
export const MAX_ENTITIES = 24

const TYPE_TEXT_LIMIT = 120

export function scanExports(source: string): {
  exports: Array<ScannedExport>
  diagnostics: Array<SourceDiagnostic>
} {
  const sourceFile = ts.createSourceFile(
    '/main.ts',
    source,
    ts.ScriptTarget.ESNext,
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

    // Generic types are sets only once instantiated (ADR-0022): the
    // canonical representative evaluates every parameter at
    // default > constraint > `unknown`. All-default generics keep the
    // bare reference (it instantiates with the defaults, and defaults
    // may legally reference earlier parameters).
    const typeParameters = ts.isEnumDeclaration(statement)
      ? undefined
      : statement.typeParameters

    const name = statement.name.text
    if (seen.has(name)) continue
    seen.add(name)

    let displayName = name
    let typeArguments: Array<string> | undefined
    if (typeParameters && typeParameters.length > 0) {
      // The label reproduces the parameter DECLARATIONS as authored —
      // constraints and defaults included (`C1<T extends string>`), so
      // the family's domain is readable right on the canvas.
      displayName = `${name}<${typeParameters
        .map((parameter) => singleLine(parameter.getText(sourceFile)))
        .join(', ')}>`
      const allDefaulted = typeParameters.every(
        (parameter) => parameter.default !== undefined,
      )
      if (!allDefaulted) {
        // Constraint text may reference a sibling parameter — the probe
        // alias then errors and the broken-alias defense drops ONLY
        // that entity.
        typeArguments = typeParameters.map((parameter) =>
          parameter.default
            ? parameter.default.getText(sourceFile)
            : parameter.constraint
              ? parameter.constraint.getText(sourceFile)
              : 'unknown',
        )
      }
    }

    const raw = ts.isTypeAliasDeclaration(statement)
      ? statement.type.getText(sourceFile)
      : statement.getText(sourceFile)

    all.push({
      name,
      displayName,
      span: { start: statement.getStart(sourceFile), end: statement.getEnd() },
      typeText: singleLine(raw),
      typeArguments,
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
        domain: 'value',
      },
    ],
  }
}

function singleLine(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > TYPE_TEXT_LIMIT
    ? `${compact.slice(0, TYPE_TEXT_LIMIT - 1)}…`
    : compact
}
