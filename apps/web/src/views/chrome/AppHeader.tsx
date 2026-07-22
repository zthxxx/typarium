import { observer } from 'mobx-react-lite'
import { LanguageIcon } from '@heroicons/react/20/solid'
import { useEffect, useRef, useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'

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
    <header className="flex h-14 items-center gap-4 border-b-[3px] border-(--color-ink) bg-white px-4">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="font-game text-[22px] font-bold tracking-tight">
          typarium
        </span>
        <span className="hidden rounded-sm bg-[linear-gradient(to_top,rgba(247,223,30,0.6)_36%,transparent_36%)] px-1 text-sm font-semibold md:inline">
          {settings.t('app.tagline')}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <div ref={localeRef} className="relative">
          <button
            type="button"
            aria-label={settings.t('header.language')}
            aria-expanded={localeOpen}
            className="flex h-[30px] items-center gap-1 rounded-full border-2 border-(--color-ink) bg-white px-2.5 font-mono text-xs font-bold shadow-(--shadow-keycap) transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[2px] active:shadow-none"
            onClick={() => setLocaleOpen((open) => !open)}
          >
            <LanguageIcon className="h-4 w-4" aria-hidden="true" />
            <span aria-hidden="true" className="text-[9px]">
              {localeOpen ? '▲' : '▼'}
            </span>
          </button>
          {localeOpen ? (
            <Popup anchor={localeRef} placement="bottom-end" distance={8}>
              <div className="w-28 overflow-hidden rounded-xl border-2 border-(--color-ink) bg-white shadow-(--shadow-sticker)">
                {(
                  [
                    ['zh', '中文'],
                    ['en', 'English'],
                  ] as const
                ).map(([locale, label]) => (
                  <button
                    key={locale}
                    type="button"
                    className={
                      settings.locale === locale
                        ? 'block w-full bg-(--color-paper) px-3 py-2 text-left font-mono text-xs font-bold text-(--color-brand)'
                        : 'block w-full px-3 py-2 text-left font-mono text-xs hover:bg-(--color-paper)'
                    }
                    onClick={() => {
                      settings.setLocale(locale)
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
          className="flex h-[30px] items-center rounded-full border-2 border-(--color-brand-deep) bg-(--color-brand) px-4 text-sm font-bold whitespace-nowrap text-white shadow-(--shadow-keycap) transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[2px] active:shadow-none"
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
