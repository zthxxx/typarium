import { Card, Input, Radio, Switch, Tooltip } from 'animal-island-ui'
import { Bars3BottomLeftIcon, Cog6ToothIcon } from '@heroicons/react/20/solid'
import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { AnalysisService } from '#/services/analysis.service.ts'
import { EditorService } from '#/services/editor.service.ts'
import { PresetService } from '#/services/preset.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'
import type { ReactNode } from 'react'

/**
 * Editor toolbar: snippet templates menu, one-click format, and the
 * editor-config popover. Every popup positions itself through the
 * shared floating-ui Popup so window edges never clip it.
 *
 * Triggers are the pill family's DENSE variant (ADR-0024): the 36-40px
 * toolbar strip can't breathe around the library Button's 32px box, so
 * these are 26px token-drawn pills. Icons stay CONVENTIONAL glyphs
 * (heroicons) — tool actions must read at a glance.
 */
const PILL_SM =
  'flex h-[26px] items-center rounded-full border-[1.5px] border-(--color-outline) bg-(--color-board) text-(--color-ink) transition-colors hover:border-[#827157]'
export const EditorToolbar = observer(function EditorToolbar() {
  const settings = useService(SettingsService)
  const editor = useService(EditorService)
  const presets = useService(PresetService)
  const analysis = useService(AnalysisService)

  const snippets = presets.catalog.filter((preset) => preset.kind === 'snippet')

  return (
    <div className="flex items-center gap-1.5">
      <MenuButton
        label={settings.t('presets.snippets')}
        render={(close) => (
          <Card
            className="flex w-max max-w-[80vw] flex-col gap-1"
            style={{ padding: 8 }}
          >
            {snippets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="rounded-lg px-2.5 py-1 text-left font-mono text-xs whitespace-nowrap hover:bg-[#f0e8d8]"
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
          </Card>
        )}
      />

      {analysis.editor?.format ? (
        <Tooltip title={settings.t('editor.format')} variant="island">
          <button
            type="button"
            aria-label={settings.t('editor.format')}
            className={`${PILL_SM} w-[26px] justify-center`}
            onClick={() => {
              void editor.formatDocument(settings.editorConfig)
            }}
          >
            <Bars3BottomLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      ) : null}

      <MenuButton
        label={settings.t('editor.settings')}
        icon={<Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />}
        render={() => <EditorConfigPanel />}
      />
    </div>
  )
})

/** Editor-config popover body: word wrap + formatter style knobs. */
const EditorConfigPanel = observer(function EditorConfigPanel() {
  const settings = useService(SettingsService)
  const analysis = useService(AnalysisService)
  const config = settings.editorConfig

  return (
    <Card className="flex w-72 flex-col gap-2.5 text-xs">
      <ToggleRow
        label={settings.t('config.wordWrap')}
        checked={config.wordWrap}
        onChange={(wordWrap) => settings.updateEditorConfig({ wordWrap })}
      />
      <div className="flex items-center justify-between gap-2">
        <span>{settings.t('config.quotes')}</span>
        <Radio
          size="small"
          value={config.singleQuote ? 'single' : 'double'}
          onChange={(value) =>
            settings.updateEditorConfig({ singleQuote: value === 'single' })
          }
          options={[
            { value: 'single', label: settings.t('config.quotes.single') },
            { value: 'double', label: settings.t('config.quotes.double') },
          ]}
        />
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
        <span className="w-24">
          <Input
            size="small"
            type="number"
            min={20}
            max={160}
            value={config.printWidth}
            onChange={(event) => {
              const printWidth = Number(event.target.value)
              if (Number.isFinite(printWidth) && printWidth >= 20) {
                settings.updateEditorConfig({ printWidth })
              }
            }}
          />
        </span>
      </label>

      <div className="mt-1 border-t-2 border-dashed border-(--color-outline) pt-2">
        <span className="mb-1.5 block font-mono font-bold text-(--color-ink-soft)">
          compilerOptions
        </span>
        <ul className="flex flex-col gap-1 font-mono opacity-70">
          {analysis.descriptor.compilerOptionsDisplay.map(([key, value]) => (
            <li key={key} className="flex items-baseline justify-between gap-2">
              <span>{key}</span>
              <span className="max-w-36 text-right break-words text-(--color-ink-soft)">
                {value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
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
    <span className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <Switch size="small" checked={checked} onChange={onChange} />
    </span>
  )
}

/** Trigger + floating menu; closes on outside pointerdown. */
function MenuButton({
  label,
  icon,
  render,
}: {
  label: string
  /** Icon-only trigger (gets an island Tooltip); omit for a text trigger. */
  icon?: ReactNode
  render: (close: () => void) => ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)

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

  const trigger = (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      className={
        icon
          ? `${PILL_SM} w-[26px] justify-center`
          : `${PILL_SM} px-3 text-xs font-bold`
      }
      onClick={() => setOpen((value) => !value)}
    >
      {icon ?? label}
    </button>
  )

  return (
    <>
      <span ref={ref} className="inline-flex">
        {icon ? (
          <Tooltip title={label} variant="island">
            {trigger}
          </Tooltip>
        ) : (
          trigger
        )}
      </span>
      {open ? (
        <Popup anchor={ref} placement="bottom-end" distance={8}>
          <div data-popup="true">{render(() => setOpen(false))}</div>
        </Popup>
      ) : null}
    </>
  )
}
