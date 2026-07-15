import type { SetUniverse } from '#/core/set-model/types.ts'

/**
 * The fixed basemap of the TypeScript universe: a partition of `unknown`.
 *
 * Positions and shapes live in the layout engine; this module only fixes
 * identity and structure. Derived facts the analyzer relies on:
 * - `unknown` = union of every domain (the canvas itself)
 * - `{}`      = every domain except `null` and `undefined`
 * - `object`  = the object domain including its subzones
 * - `void`    ≈ the `undefined` domain plus a deviation marker
 * - `boolean` = the two literal cells `true` / `false`
 */
export const TS_DOMAIN = {
  string: 'string',
  number: 'number',
  bigint: 'bigint',
  boolean: 'boolean',
  symbol: 'symbol',
  null: 'null',
  undefined: 'undefined',
  object: 'object',
} as const

export type TsDomainId = (typeof TS_DOMAIN)[keyof typeof TS_DOMAIN]

export const TS_SUBZONE = {
  callable: 'callable',
  array: 'array',
  plain: 'plain',
} as const

export type TsSubzoneId = (typeof TS_SUBZONE)[keyof typeof TS_SUBZONE]

export const typescriptUniverse: SetUniverse = {
  languageId: 'typescript',
  domains: [
    { id: TS_DOMAIN.string, label: 'string', cardinality: 'infinite' },
    { id: TS_DOMAIN.number, label: 'number', cardinality: 'infinite' },
    { id: TS_DOMAIN.bigint, label: 'bigint', cardinality: 'infinite' },
    { id: TS_DOMAIN.boolean, label: 'boolean', cardinality: 'infinite' },
    { id: TS_DOMAIN.symbol, label: 'symbol', cardinality: 'infinite' },
    { id: TS_DOMAIN.null, label: 'null', cardinality: 'unit' },
    { id: TS_DOMAIN.undefined, label: 'undefined', cardinality: 'unit' },
    {
      id: TS_DOMAIN.object,
      label: 'object',
      cardinality: 'infinite',
      subzones: [
        { id: TS_SUBZONE.callable, label: 'functions' },
        { id: TS_SUBZONE.array, label: 'arrays' },
        { id: TS_SUBZONE.plain, label: 'objects' },
      ],
    },
  ],
}
