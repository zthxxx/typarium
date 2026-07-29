import { LanguageIcon } from '@heroicons/react/20/solid'
import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'
import type { Locale } from '#/i18n/messages.ts'

const LOCALE_OPTIONS: Array<{ key: Locale; label: string }> = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
]

/**
 * Header controls join the preset-chip pill family (ADR-0024): one
 * 30px capsule recipe, color-only states. The locale trigger is the
 * quiet outline variant, Share fills with the island teal — the same
 * idle/active pair the chips speak, so the chrome reads as one family.
 */
const PILL =
  'flex h-[30px] items-center rounded-full border-[1.5px] transition-colors'

/**
 * Top chrome: identity, locale picker and the share action. The
 * source-language selector stays hidden until a second language
 * adapter exists (the LanguageAdapter contract already covers it).
 * All behavior delegates to services; this component only renders.
 */
export const AppHeader = observer(function AppHeader({
  onShare,
}: {
  onShare: (withContent: boolean) => void
}) {
  const settings = useService(SettingsService)
  const [localeOpen, setLocaleOpen] = useState(false)
  const localeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!localeOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!localeRef.current?.contains(event.target as Node)) {
        setLocaleOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [localeOpen])

  return (
    <header className="flex h-14 items-center gap-4 border-b-2 border-(--color-line) bg-(--color-board) px-4">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="font-game text-[22px] font-extrabold tracking-tight">
          typarium
        </span>
        <span className="hidden rounded-sm bg-[linear-gradient(to_top,rgba(245,195,28,0.45)_36%,transparent_36%)] px-1 text-sm font-semibold md:inline">
          {settings.t('app.tagline')}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <div ref={localeRef} className="relative">
          <button
            type="button"
            aria-label={settings.t('header.language')}
            aria-expanded={localeOpen}
            className={`${PILL} gap-1.5 border-(--color-outline) bg-(--color-board) px-3.5 text-sm font-bold text-(--color-ink) hover:border-[#827157]`}
            onClick={() => setLocaleOpen((open) => !open)}
          >
            <LanguageIcon className="h-4 w-4" aria-hidden="true" />
            {LOCALE_OPTIONS.find((o) => o.key === settings.locale)?.label}
            <span
              aria-hidden="true"
              className="text-[9px] text-(--color-ink-soft)"
            >
              {localeOpen ? '▴' : '▾'}
            </span>
          </button>
          {localeOpen ? (
            <Popup anchor={localeRef} placement="bottom-end" distance={8}>
              <div className="w-28 overflow-hidden rounded-2xl border-[1.5px] border-(--color-outline) bg-(--color-board) py-1 shadow-(--shadow-sticker)">
                {LOCALE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      settings.locale === key
                        ? 'block w-full px-3.5 py-1.5 text-left text-sm font-bold text-(--color-brand)'
                        : 'block w-full px-3.5 py-1.5 text-left text-sm hover:bg-[#f0e8d8]'
                    }
                    onClick={() => {
                      settings.setLocale(key)
                      setLocaleOpen(false)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Popup>
          ) : null}
        </div>

        <button
          type="button"
          className={`${PILL} border-(--color-brand-deep) bg-(--color-brand) px-4 text-sm font-bold whitespace-nowrap text-white shadow-[0_2px_0_rgba(15,168,155,0.45)] hover:bg-[#3dd4c6]`}
          onClick={() => {
            // One click, one link: always share WITH the editor content.
            onShare(true)
          }}
        >
          {settings.t('header.share')}
        </button>
      </div>
    </header>
  )
})

/** Euler-mark: one set containing another — the product in one glyph. */
function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle
        cx="14"
        cy="14"
        r="12"
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="3"
      />
      <circle
        cx="17"
        cy="16"
        r="5.5"
        fill="var(--color-spark)"
        stroke="var(--color-ink)"
        strokeWidth="2"
      />
      <circle cx="9.5" cy="11" r="1.8" fill="var(--color-ink)" />
    </svg>
  )
}
