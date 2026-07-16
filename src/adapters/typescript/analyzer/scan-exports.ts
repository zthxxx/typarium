import * as ts from 'typescript'
import type { SourceDiagnostic, SourceSpan } from '#/core/set-model/types.ts'

/**
 * Syntactic export scan: which top-level declarations become displayed
 * entities, with their display text and source spans. Semantics (types,
 * relations, specials) come from the checker in create-ts-analyzer —
 * same typescript package, one toolchain (ADR-0015).
 */

export interface ScannedExport {
  name: string
  span: SourceSpan
  /** Single-line display text: alias RHS, or the whole declaration. */
  typeText: string
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

    // Generic types are sets only once instantiated: include a generic
    // export only when every type parameter has a default (referencing
    // it bare instantiates with the defaults).
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

    const raw = ts.isTypeAliasDeclaration(statement)
      ? statement.type.getText(sourceFile)
      : statement.getText(sourceFile)

    all.push({
      name,
      span: { start: statement.getStart(sourceFile), end: statement.getEnd() },
      typeText: singleLine(raw),
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
