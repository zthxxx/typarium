import { makeAutoObservable } from 'mobx'
import type { LanguagePreset, VirtualType } from '@typarium/language-adapter'

/**
 * Preset picker state (product rules, revision 2):
 * - `virtual` presets toggle canvas display WITHOUT touching the editor
 *   code — they join the analysis as extra type expressions.
 * - `snippet` presets insert an auto-numbered `export type CN = ...`
 *   line into the editor (blank-line separated); code stays the single
 *   source of truth for those.
 */
export class PresetService {
  /** Toggled virtual presets, in catalog order (labels). */
  private readonly toggled = new Set<string>()

  constructor(
    private readonly presets: Array<LanguagePreset>,
    private readonly deps: {
      insertSnippet: (rhs: string) => void
      onVirtualChange: () => void
    },
  ) {
    makeAutoObservable<PresetService, 'presets' | 'deps'>(this, {
      presets: false,
      deps: false,
    })
  }

  get catalog(): Array<LanguagePreset> {
    return this.presets
  }

  isActive(label: string): boolean {
    return this.toggled.has(label)
  }

  /** Ordered virtual type expressions for the analyzer. */
  get virtualTypes(): Array<VirtualType> {
    return this.presets
      .filter(
        (preset) =>
          preset.kind === 'virtual' &&
          this.toggled.has(preset.label) &&
          preset.typeText !== undefined,
      )
      .map((preset) => ({ name: preset.label, typeText: preset.typeText! }))
  }

  get activeLabels(): Array<string> {
    return this.presets
      .filter((preset) => this.toggled.has(preset.label))
      .map((preset) => preset.label)
  }

  toggle(preset: LanguagePreset): void {
    if (preset.kind === 'snippet') {
      if (preset.snippetRhs !== undefined) {
        this.deps.insertSnippet(preset.snippetRhs)
      }
      return
    }
    if (this.toggled.has(preset.label)) {
      this.toggled.delete(preset.label)
    } else {
      this.toggled.add(preset.label)
    }
    this.deps.onVirtualChange()
  }

  /** Boot restore: replaces the toggle set wholesale (no analysis kick). */
  restore(labels: Array<string>): void {
    this.toggled.clear()
    const known = new Set(
      this.presets
        .filter((preset) => preset.kind === 'virtual')
        .map((preset) => preset.label),
    )
    for (const label of labels) {
      if (known.has(label)) this.toggled.add(label)
    }
  }
}
