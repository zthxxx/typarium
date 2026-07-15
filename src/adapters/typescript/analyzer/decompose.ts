import * as ts from 'typescript'

import { TS_DOMAIN, TS_SUBZONE } from '#/adapters/typescript/universe.ts'
import type { TsDomainId, TsSubzoneId } from '#/adapters/typescript/universe.ts'

/**
 * A displayed type decomposes into parts, each anchored somewhere on the
 * fixed basemap. Union members are the decomposition unit; every part
 * falls into exactly one of:
 *
 * - `literal`      a unit type — a point on the basemap (`"foo"`, `42`)
 * - `domain-full`  one or more whole domains (`string`, or `{}` which
 *                  covers every domain except null/undefined)
 * - `refinement`   an infinite proper subset of one domain (`{a: string}`,
 *                  `(x: string) => void`, `` `a${string}` ``)
 * - `void-like`    TS `void`: treated as the undefined domain plus a
 *                  deviation marker (the set view of `void` is {undefined})
 */
export type DecomposedPart =
  | {
      kind: 'literal'
      domain: TsDomainId
      label: string
      type: ts.Type
    }
  | {
      kind: 'domain-full'
      domains: Array<TsDomainId>
      type: ts.Type
    }
  | {
      kind: 'refinement'
      domain: TsDomainId
      subzone?: TsSubzoneId
      /** Display text (default printer). */
      typeText: string
      /**
       * Round-trippable source text used to synthesize intersection
       * probes (`NoTruncation`; entity-name reference when the part is
       * exactly an exported entity, resolved by the caller).
       */
      probeText: string
      type: ts.Type
    }
  | {
      kind: 'void-like'
      type: ts.Type
    }

export interface DomainProbes {
  /** domain id -> the ts.Type of that whole domain (e.g. `string`). */
  byDomain: Map<TsDomainId, ts.Type>
}

const PRIMITIVE_DOMAINS: Array<TsDomainId> = [
  TS_DOMAIN.string,
  TS_DOMAIN.number,
  TS_DOMAIN.bigint,
  TS_DOMAIN.boolean,
  TS_DOMAIN.symbol,
]

/** All domains a cross-domain part may cover (unit domains included). */
const COVERAGE_DOMAINS: Array<TsDomainId> = [
  TS_DOMAIN.string,
  TS_DOMAIN.number,
  TS_DOMAIN.bigint,
  TS_DOMAIN.boolean,
  TS_DOMAIN.symbol,
  TS_DOMAIN.null,
  TS_DOMAIN.undefined,
  TS_DOMAIN.object,
]

export function unionParts(type: ts.Type): Array<ts.Type> {
  return type.isUnion() ? type.types : [type]
}

/**
 * Classifies one union member. `entityProbeName` maps a type identity to
 * `U.<name>` when the part is exactly an exported entity, so probe text
 * stays resolvable for named (interface) types that do not round-trip
 * through the structural printer.
 */
export function classifyPart(
  checker: ts.TypeChecker,
  probes: DomainProbes,
  part: ts.Type,
  entityProbeName: (type: ts.Type) => string | undefined,
): DecomposedPart {
  const flags = part.flags

  if (flags & ts.TypeFlags.Undefined) {
    return { kind: 'domain-full', domains: [TS_DOMAIN.undefined], type: part }
  }
  if (flags & ts.TypeFlags.Null) {
    return { kind: 'domain-full', domains: [TS_DOMAIN.null], type: part }
  }
  if (flags & ts.TypeFlags.Void) {
    return { kind: 'void-like', type: part }
  }

  const literalDomain = literalDomainOf(part)
  if (literalDomain) {
    return {
      kind: 'literal',
      domain: literalDomain,
      label: checker.typeToString(part),
      type: part,
    }
  }

  if (flags & ts.TypeFlags.StringLike) {
    // Non-literal StringLike: `string` itself, template literals,
    // `Uppercase<...>` string mappings.
    if (flags & ts.TypeFlags.String) {
      return { kind: 'domain-full', domains: [TS_DOMAIN.string], type: part }
    }
    return refinementIn(
      checker,
      part,
      TS_DOMAIN.string,
      undefined,
      entityProbeName,
    )
  }
  if (flags & ts.TypeFlags.Number) {
    return { kind: 'domain-full', domains: [TS_DOMAIN.number], type: part }
  }
  if (flags & ts.TypeFlags.BigInt) {
    return { kind: 'domain-full', domains: [TS_DOMAIN.bigint], type: part }
  }
  if (flags & ts.TypeFlags.Boolean) {
    return { kind: 'domain-full', domains: [TS_DOMAIN.boolean], type: part }
  }
  if (flags & ts.TypeFlags.ESSymbol) {
    return { kind: 'domain-full', domains: [TS_DOMAIN.symbol], type: part }
  }
  if (flags & ts.TypeFlags.UniqueESSymbol) {
    return {
      kind: 'literal',
      domain: TS_DOMAIN.symbol,
      label: checker.typeToString(part),
      type: part,
    }
  }

  // Object-like or intersection parts. First check whether the part is a
  // cross-domain cover (`{}`, `Object`, empty interfaces): if whole
  // domains are assignable INTO the part, the part is the union of those
  // domains rather than an object refinement.
  const covered = COVERAGE_DOMAINS.filter((domain) => {
    const probe = probes.byDomain.get(domain)
    return probe !== undefined && checker.isTypeAssignableTo(probe, part)
  })
  if (covered.length > 0) {
    return { kind: 'domain-full', domains: covered, type: part }
  }

  // A proper subset of some domain. Branded primitives
  // (`string & { __brand: 1 }`) land in their primitive domain.
  for (const domain of PRIMITIVE_DOMAINS) {
    const probe = probes.byDomain.get(domain)
    if (probe !== undefined && checker.isTypeAssignableTo(part, probe)) {
      return refinementIn(checker, part, domain, undefined, entityProbeName)
    }
  }

  return refinementIn(
    checker,
    part,
    TS_DOMAIN.object,
    objectSubzoneOf(checker, part),
    entityProbeName,
  )
}

function refinementIn(
  checker: ts.TypeChecker,
  part: ts.Type,
  domain: TsDomainId,
  subzone: TsSubzoneId | undefined,
  entityProbeName: (type: ts.Type) => string | undefined,
): DecomposedPart {
  const named = entityProbeName(part)
  return {
    kind: 'refinement',
    domain,
    subzone,
    typeText: checker.typeToString(part),
    probeText:
      named ??
      checker.typeToString(
        part,
        undefined,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias,
      ),
    type: part,
  }
}

function literalDomainOf(part: ts.Type): TsDomainId | undefined {
  const flags = part.flags
  // Enum members carry EnumLiteral together with String/NumberLiteral;
  // they classify into their value domain (nominality is surfaced as a
  // deviation at the entity level, not here).
  if (flags & ts.TypeFlags.StringLiteral) return TS_DOMAIN.string
  if (flags & ts.TypeFlags.NumberLiteral) return TS_DOMAIN.number
  if (flags & ts.TypeFlags.BigIntLiteral) return TS_DOMAIN.bigint
  if (flags & ts.TypeFlags.BooleanLiteral) return TS_DOMAIN.boolean
  return undefined
}

function objectSubzoneOf(checker: ts.TypeChecker, part: ts.Type): TsSubzoneId {
  if (part.getCallSignatures().length > 0) return TS_SUBZONE.callable
  if (checker.isArrayLikeType(part)) return TS_SUBZONE.array
  return TS_SUBZONE.plain
}
