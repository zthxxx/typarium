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
  // Toggle state is COLOR only: an active chip keeps the exact box and
  // shadow of its idle siblings, so rows stay visually aligned.
  const base =
    'rounded-full border-2 px-2.5 py-0.5 font-mono text-[11px] font-bold transition-[transform,box-shadow,background-color,border-color] hover:-translate-y-[1px]'
  const palette = warning
    ? active
      ? 'border-(--color-warn-any) bg-(--color-warn-any) text-white shadow-[0_3px_0_rgba(255,77,48,0.35)]'
      : 'border-(--color-warn-any)/70 bg-white text-(--color-warn-any) shadow-[0_3px_0_rgba(255,77,48,0.35)]'
    : active
      ? 'border-(--color-brand-deep) bg-(--color-brand) text-white shadow-(--shadow-keycap)'
      : 'border-(--color-ink) bg-white text-(--color-ink) shadow-(--shadow-keycap)'
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
