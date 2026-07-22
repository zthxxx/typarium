import { FIXED_COMPILER_OPTIONS_DISPLAY } from './compiler-options-display.ts'
import { typescriptPresets } from './presets.ts'
import type { LanguageDescriptor } from '@typarium/language-adapter'

/**
 * Pure-data half of the TypeScript adapter — importable from node
 * (contract tests) without dragging in the worker/comlink glue.
 *
 * ENGINE_LABEL is kept in sync with the exact `typescript` pin in
 * package.json — the single implementation powering analysis,
 * diagnostics, hover and completions (ADR-0015). 6.0.3 is the last
 * line with a JS compiler API, required for checker-level containment
 * queries.
 */
const ENGINE_LABEL = 'TypeScript 6.0.3'

const SAMPLE_SOURCE = `// typarium — every exported type is drawn as a set of values

export type Fruit = 'apple' | 'banana'
export type Text = string
export type TextOrNumber = string | number

export type Point = { x: number; y: number }

// Function parameters are contravariant under strict mode, so
// WideHandler ends up INSIDE StrHandler — and the bare generic
// Handler<X>, drawn at its unknown bound (ADR-0022), sits innermost:
export type Handler<X> = (value: X) => void
export type StrHandler = Handler<string>
export type WideHandler = Handler<string | number>
`

export const typescriptDescriptor: LanguageDescriptor = {
  id: 'typescript',
  label: 'TypeScript',
  editorLanguageId: 'typescript',
  presets: typescriptPresets,
  sampleSource: SAMPLE_SOURCE,
  engineLabel: ENGINE_LABEL,
  compilerOptionsDisplay: FIXED_COMPILER_OPTIONS_DISPLAY,
  /** What the special set-roles are CALLED in TypeScript (ADR-0019). */
  specialTypeNames: { universe: 'unknown', empty: 'never', any: 'any' },
  snippet: {
    /**
     * Product rule: snippet presets append auto-incremented `CN`
     * exports; the numbering scan and the declaration grammar are both
     * TypeScript knowledge and live here, not in EditorService.
     */
    nextDeclaration: (code, rhs) => {
      const next =
        Math.max(
          0,
          ...[...code.matchAll(/^export type C(\d+)\b/gm)].map((match) =>
            Number(match[1]),
          ),
        ) + 1
      return `export type C${next} = ${rhs}`
    },
  },
}
