import { observer } from 'mobx-react-lite'
import { PresetService } from '#/services/preset.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { useService } from '#/views/di.tsx'
import type { LanguagePreset } from '@typarium/language-adapter'

/**
 * Preset picker: virtual presets (primitive / intrinsic / common) are
 * ALWAYS visible, wrapping to multiple rows — never hidden behind an
 * overlay. Catalog order is the display order; categories carry no
 * visual grouping. `any` always wears the warning tint. Snippet
 * templates live in the editor toolbar (EditorToolbar), not here.
 */
export const PresetsBar = observer(function PresetsBar() {
  const presets = useService(PresetService)
  const settings = useService(SettingsService)

  const virtual = presets.catalog.filter((preset) => preset.kind === 'virtual')

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
      <span className="mr-1 font-mono text-xs font-bold text-(--color-ink-soft)">
        {settings.t('presets.title')}
      </span>
      {virtual.map((preset) => (
        <PresetChip
          key={preset.label}
          preset={preset}
          active={presets.isActive(preset.label)}
          onClick={() => presets.toggle(preset)}
        />
      ))}
    </div>
  )
})

/**
 * Hand-drawn chip on island tokens (ADR-0024): the library Button's
 * hover lift / color flip made a dense wrapping row look staggered, so
 * chips keep ONE box and change COLOR only — active fills with the
 * island teal candy, idle stays a quiet parchment pill; `any` swaps
 * the same pair into the island error red. Real `<button>` (e2e
 * counts literal button elements for the `any` chip + badge).
 */
const PresetChip = observer(function PresetChip({
  preset,
  active,
  onClick,
}: {
  preset: LanguagePreset
  active: boolean
  onClick: () => void
}) {
  const warning = preset.tone === 'warning'
  const base =
    'h-[30px] rounded-full border-[1.5px] px-3 font-mono text-xs font-bold transition-colors'
  const palette = warning
    ? active
      ? 'border-[#c94444] bg-(--color-warn-any) text-white shadow-[0_2px_0_rgba(201,68,68,0.45)]'
      : 'border-(--color-warn-any)/60 bg-(--color-board) text-(--color-warn-any) hover:border-(--color-warn-any)'
    : active
      ? 'border-(--color-brand-deep) bg-(--color-brand) text-white shadow-[0_2px_0_rgba(15,168,155,0.45)]'
      : 'border-(--color-outline) bg-(--color-board) text-(--color-ink) hover:border-[#827157]'
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`${base} ${palette}`}
      onClick={onClick}
    >
      {preset.label}
    </button>
  )
})
