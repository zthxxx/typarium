import type { LanguagePreset } from '#/core/analysis/adapter.ts'

/**
 * Preset catalog, in display order (product rule: categories order the
 * buttons but no visible group chrome). `virtual` presets toggle canvas
 * display without touching the editor; `snippet` presets insert an
 * auto-numbered `export type CN = <rhs>` line.
 */

const virtual = (
  category: LanguagePreset['category'],
  label: string,
  typeText = label,
  tone?: 'warning',
): LanguagePreset => ({ label, category, kind: 'virtual', typeText, tone })

const snippet = (rhs: string): LanguagePreset => ({
  label: rhs,
  category: 'snippet',
  kind: 'snippet',
  snippetRhs: rhs,
})

export const typescriptPresets: Array<LanguagePreset> = [
  // Primitives
  virtual('primitive', 'string'),
  virtual('primitive', 'number'),
  virtual('primitive', 'boolean'),
  virtual('primitive', 'bigint'),
  virtual('primitive', 'symbol'),
  virtual('primitive', 'null'),
  virtual('primitive', 'undefined'),
  virtual('primitive', 'object'),
  // Intrinsics
  virtual('intrinsic', 'unknown'),
  virtual('intrinsic', 'never'),
  virtual('intrinsic', 'void'),
  virtual('intrinsic', 'any', 'any', 'warning'),
  // Common built-ins
  virtual('common', 'Array<T>', 'Array<unknown>'),
  virtual('common', 'Object'),
  virtual('common', 'Function'),
  // Demo snippets (insert `export type CN = <rhs>` into the editor)
  snippet('string & number'),
  snippet('string | number'),
  snippet('string | number | boolean'),
  snippet('() => string'),
  snippet('() => number'),
  snippet('() => string | number'),
  snippet('(_: string) => void'),
  snippet('(_: number) => void'),
  snippet('(_: string | number) => void'),
  snippet('<T extends string>(_: T) => void'),
  snippet('<T extends string | number>(_: T) => void'),
]
