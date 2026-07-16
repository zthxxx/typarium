import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { PresetService } from '#/services/preset.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { useService } from '#/views/di.tsx'
import type { LanguagePreset } from '#/core/analysis/adapter.ts'

/**
 * Preset picker (product rules, revision 2):
 * - virtual presets (primitive / intrinsic / common) are ALWAYS visible,
 *   wrapping to multiple rows — never hidden behind an overlay
 * - snippet presets (long code templates) live in a popover
 * - catalog order is the display order; categories are not visually
 *   grouped
 * - `any` always carries the warning tint, active or not
 */
export const PresetsBar = observer(function PresetsBar() {
  const presets = useService(PresetService)
  const settings = useService(SettingsService)
  const [snippetsOpen, setSnippetsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const virtual = presets.catalog.filter((preset) => preset.kind === 'virtual')
  const snippets = presets.catalog.filter((preset) => preset.kind === 'snippet')

  useEffect(() => {
    if (!snippetsOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setSnippetsOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [snippetsOpen])

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
      <div ref={popoverRef} className="relative">
        <button
          type="button"
          aria-expanded={snippetsOpen}
          className="rounded-none border-2 border-dashed border-(--color-ink-soft) bg-white/70 px-3 py-1 font-mono text-xs font-bold text-(--color-ink-soft) transition-[transform,color,border-color] hover:border-(--color-brand) hover:text-(--color-brand) active:scale-[0.95]"
          onClick={() => setSnippetsOpen((open) => !open)}
        >
          {settings.t('presets.snippets')} {snippetsOpen ? '▴' : '▾'}
        </button>
        {snippetsOpen ? (
          <div className="absolute top-full left-0 z-40 mt-2 flex w-max max-w-[80vw] flex-col gap-1 rounded-xl border-2 border-(--color-ink) bg-white p-2 shadow-(--shadow-sticker)">
            {snippets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="rounded-lg px-2.5 py-1 text-left font-mono text-xs whitespace-nowrap hover:bg-(--color-paper)"
                onClick={() => {
                  presets.toggle(preset)
                  setSnippetsOpen(false)
                }}
              >
                <span
                  aria-hidden="true"
                  className="mr-1.5 text-(--color-ink-soft)"
                >
                  +
                </span>
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
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
  // Keycap physics: raised when idle, pressed-in (down + no shadow)
  // once active — the chip IS the toggle state.
  const base =
    'rounded-full border-2 px-3 py-1 font-mono text-xs font-bold transition-[transform,box-shadow,background-color,border-color]'
  const palette = warning
    ? active
      ? 'translate-y-[2px] border-(--color-warn-any) bg-(--color-warn-any) text-white'
      : 'border-(--color-warn-any)/70 bg-white text-(--color-warn-any) shadow-[0_3px_0_rgba(255,77,48,0.35)] hover:-translate-y-[1px]'
    : active
      ? 'translate-y-[2px] border-(--color-brand-deep) bg-(--color-brand) text-white'
      : 'border-(--color-ink) bg-white text-(--color-ink) shadow-(--shadow-keycap) hover:-translate-y-[1px]'
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
