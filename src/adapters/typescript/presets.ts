import type { LanguagePreset } from '#/core/analysis/adapter.ts'

/**
 * Preset buttons insert real `export type` lines: the editor text stays
 * the single source of truth (visible, hand-editable, shareable), no
 * shadow preset state to reconcile.
 *
 * The lineup mirrors the assignability table of the TS handbook:
 * https://www.typescriptlang.org/docs/handbook/type-compatibility.html
 */
export const typescriptPresets: Array<LanguagePreset> = [
  { label: 'any', insertText: 'export type _any = any' },
  { label: 'unknown', insertText: 'export type _unknown = unknown' },
  { label: 'object', insertText: 'export type _object = object' },
  { label: 'void', insertText: 'export type _void = void' },
  { label: 'undefined', insertText: 'export type _undefined = undefined' },
  { label: 'null', insertText: 'export type _null = null' },
  { label: 'never', insertText: 'export type _never = never' },
  { label: '{}', insertText: 'export type _braces = {}' },
]
