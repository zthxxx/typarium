import { Bars3BottomLeftIcon, Cog6ToothIcon } from '@heroicons/react/20/solid'
import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { EditorService } from '#/services/editor.service.ts'
import { PresetService } from '#/services/preset.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'
import type { ReactNode, RefObject } from 'react'

/**
 * Editor toolbar: snippet templates menu, one-click format, and the
 * editor-config popover. Every popup positions itself through the
 * shared floating-ui Popup so window edges never clip it.
 */
export const EditorToolbar = observer(function EditorToolbar() {
  const settings = useService(SettingsService)
  const editor = useService(EditorService)
  const presets = useService(PresetService)

  const snippets = presets.catalog.filter((preset) => preset.kind === 'snippet')

  return (
    <div className="flex items-center gap-1.5">
      <MenuButton
        label={settings.t('presets.snippets')}
        render={(close) => (
          <div className="flex w-max max-w-[80vw] flex-col gap-1 rounded-xl border-2 border-(--color-ink) bg-white p-2 shadow-(--shadow-sticker)">
            {snippets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="rounded-lg px-2.5 py-1 text-left font-mono text-xs whitespace-nowrap hover:bg-(--color-paper)"
                onClick={() => {
                  presets.toggle(preset)
                  close()
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
        )}
      />

      <IconButton
        label={settings.t('editor.format')}
        onClick={() => {
          void editor.formatDocument(settings.editorConfig)
        }}
      >
        <Bars3BottomLeftIcon className="h-4 w-4" aria-hidden="true" />
      </IconButton>

      <MenuButton
        icon={<Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />}
        label={settings.t('editor.settings')}
        render={() => <EditorConfigPanel />}
      />
    </div>
  )
})

/** Editor-config popover body: word wrap + formatter style knobs. */
const EditorConfigPanel = observer(function EditorConfigPanel() {
  const settings = useService(SettingsService)
  const config = settings.editorConfig

  return (
    <div className="flex w-56 flex-col gap-2.5 rounded-xl border-2 border-(--color-ink) bg-white p-3 font-mono text-xs shadow-(--shadow-sticker)">
      <ToggleRow
        label={settings.t('config.wordWrap')}
        checked={config.wordWrap}
        onChange={(wordWrap) => settings.updateEditorConfig({ wordWrap })}
      />
      <div className="flex items-center justify-between gap-2">
        <span>{settings.t('config.quotes')}</span>
        <div className="flex overflow-hidden rounded-lg border-2 border-(--color-ink)">
          {(
            [
              [true, settings.t('config.quotes.single')],
              [false, settings.t('config.quotes.double')],
            ] as const
          ).map(([single, label]) => (
            <button
              key={label}
              type="button"
              className={
                config.singleQuote === single
                  ? 'bg-(--color-brand) px-2 py-0.5 font-bold text-white'
                  : 'bg-white px-2 py-0.5 hover:bg-(--color-paper)'
              }
              onClick={() =>
                settings.updateEditorConfig({ singleQuote: single })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ToggleRow
        label={settings.t('config.semi')}
        checked={config.semi}
        onChange={(semi) => settings.updateEditorConfig({ semi })}
      />
      <ToggleRow
        label={settings.t('config.trailingComma')}
        checked={config.trailingComma}
        onChange={(trailingComma) =>
          settings.updateEditorConfig({ trailingComma })
        }
      />
      <label className="flex items-center justify-between gap-2">
        <span>{settings.t('config.printWidth')}</span>
        <input
          type="number"
          min={20}
          max={160}
          value={config.printWidth}
          className="w-16 rounded-lg border-2 border-(--color-ink) px-1.5 py-0.5 text-right"
          onChange={(event) => {
            const printWidth = Number(event.target.value)
            if (Number.isFinite(printWidth) && printWidth >= 20) {
              settings.updateEditorConfig({ printWidth })
            }
          }}
        />
      </label>
    </div>
  )
})

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="flex items-center justify-between gap-2"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span
        className={
          checked
            ? 'flex h-4 w-7 items-center rounded-full bg-(--color-brand) pl-3.5 transition-[padding]'
            : 'flex h-4 w-7 items-center rounded-full bg-(--color-line) pl-0.5 transition-[padding]'
        }
      >
        <span className="h-3 w-3 rounded-full bg-white shadow" />
      </span>
    </button>
  )
}

/** Icon button with a floating hover tooltip. */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-(--color-ink) bg-white text-(--color-ink) shadow-(--shadow-keycap) transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {children}
      </button>
      {hovered ? <HoverTip anchor={ref} text={label} /> : null}
    </>
  )
}

/** Trigger + floating menu; closes on outside pointerdown. */
function MenuButton({
  label,
  icon,
  render,
}: {
  label: string
  icon?: ReactNode
  render: (close: () => void) => ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (ref.current?.contains(target)) return
      // Clicks inside the floating panel keep it open; panels mount in
      // a fixed container marked with data-popup.
      if ((target as Element).closest('[data-popup]')) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-expanded={open}
        aria-label={label}
        className={
          icon
            ? 'flex h-7 w-7 items-center justify-center rounded-lg border-2 border-(--color-ink) bg-white text-(--color-ink) shadow-(--shadow-keycap) transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none'
            : 'flex h-7 items-center rounded-lg border-2 border-(--color-ink) bg-white px-2.5 font-mono text-xs font-bold text-(--color-ink) shadow-(--shadow-keycap) transition-[transform,box-shadow] hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none'
        }
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {icon ?? label}
      </button>
      {hovered && !open && icon ? <HoverTip anchor={ref} text={label} /> : null}
      {open ? (
        <Popup anchor={ref} placement="bottom-end" distance={8}>
          <div data-popup="true">{render(() => setOpen(false))}</div>
        </Popup>
      ) : null}
    </>
  )
}

function HoverTip({
  anchor,
  text,
}: {
  anchor: RefObject<Element | null>
  text: string
}) {
  return (
    <Popup anchor={anchor} placement="bottom" distance={8}>
      <span className="pointer-events-none rounded-lg border-2 border-(--color-ink) bg-white px-2 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap shadow-(--shadow-sticker)">
        {text}
      </span>
    </Popup>
  )
}
