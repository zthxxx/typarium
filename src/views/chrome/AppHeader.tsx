import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { useService } from '#/views/di.tsx'

/**
 * Top chrome: identity, language selector (astexplorer-style; only
 * TypeScript in phase 1), locale toggle and the share action.
 * All behavior delegates to services; this component only renders.
 */
export const AppHeader = observer(function AppHeader({
  languageLabel,
  onShare,
}: {
  languageLabel: string
  onShare: (withContent: boolean) => void
}) {
  const settings = useService(SettingsService)
  const [shareOpen, setShareOpen] = useState(false)

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
        <label className="flex items-center gap-1.5 text-sm">
          <span className="hidden text-(--color-ink-soft) sm:inline">
            {settings.t('header.language')}
          </span>
          <select
            className="rounded-xl border-2 border-(--color-ink) bg-white px-2 py-1 font-mono text-xs font-bold shadow-(--shadow-keycap)"
            value={languageLabel}
            onChange={() => {
              // Single language in phase 1; the selector exists so the
              // multi-language UI contract is already in place.
            }}
          >
            <option value={languageLabel}>{languageLabel}</option>
          </select>
        </label>

        <button
          type="button"
          className="rounded-full border-2 border-(--color-ink) bg-white px-3 py-1 font-mono text-xs font-bold whitespace-nowrap shadow-(--shadow-keycap) transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[2px] active:shadow-none"
          onClick={() => {
            settings.setLocale(settings.locale === 'zh' ? 'en' : 'zh')
          }}
        >
          {settings.locale === 'zh' ? 'EN' : '中文'}
        </button>

        <div className="relative">
          <button
            type="button"
            className="rounded-full border-2 border-(--color-brand-deep) bg-(--color-brand) px-4 py-1 text-sm font-bold whitespace-nowrap text-white shadow-[0_3px_0_var(--color-brand-deep)] transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[2px] active:shadow-none"
            onClick={() => setShareOpen((open) => !open)}
          >
            {settings.t('header.share')}
          </button>
          {shareOpen ? (
            <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border-2 border-(--color-ink) bg-white shadow-(--shadow-sticker)">
              <ShareMenuItem
                label={settings.t('header.share')}
                onClick={() => {
                  onShare(false)
                  setShareOpen(false)
                }}
              />
              <ShareMenuItem
                label={settings.t('header.shareWithContent')}
                onClick={() => {
                  onShare(true)
                  setShareOpen(false)
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
})

function ShareMenuItem({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="block w-full px-4 py-2.5 text-left text-sm hover:bg-(--color-paper)"
      onClick={onClick}
    >
      {label}
    </button>
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
