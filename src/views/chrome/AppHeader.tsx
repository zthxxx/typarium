import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
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
            className="flex items-center gap-1 rounded-full border-2 border-(--color-ink) bg-white px-2.5 py-1 font-mono text-xs font-bold shadow-(--shadow-keycap) transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[2px] active:shadow-none"
            onClick={() => setLocaleOpen((open) => !open)}
          >
            <LocaleGlyph />
            <span aria-hidden="true" className="text-[9px]">
              {localeOpen ? '▲' : '▼'}
            </span>
          </button>
          {localeOpen ? (
            <div className="absolute top-full right-0 z-30 mt-2 w-28 overflow-hidden rounded-xl border-2 border-(--color-ink) bg-white shadow-(--shadow-sticker)">
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
          ) : null}
        </div>

        <button
          type="button"
          className="rounded-full border-2 border-(--color-brand-deep) bg-(--color-brand) px-4 py-1 text-sm font-bold whitespace-nowrap text-white shadow-[0_3px_0_var(--color-brand-deep)] transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[2px] active:shadow-none"
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

/** The conventional i18n glyph: 文 over A with a translation slash. */
function LocaleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <text
        x="4.5"
        y="7.5"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="var(--color-ink)"
      >
        文
      </text>
      <text
        x="11"
        y="14"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="var(--color-ink)"
      >
        A
      </text>
      <path
        d="M2.5 13.5 L8.5 2.5"
        stroke="var(--color-ink-soft)"
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  )
}

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
