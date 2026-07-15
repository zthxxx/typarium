import { observer } from 'mobx-react-lite'
import { useRef, useState } from 'react'
import { EulerCanvas } from '#/views/canvas/EulerCanvas.tsx'
import { EditorService } from '#/services/editor.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { useService } from '#/views/di.tsx'
import type { LanguagePreset } from '#/core/analysis/adapter.ts'

/**
 * Left pane: preset chips row + the Euler canvas + the LSP hover card.
 * The canvas keeps a minimum width and scrolls horizontally on small
 * screens (the diagram itself never zooms).
 */
export const CanvasPane = observer(function CanvasPane({
  presets,
}: {
  presets: Array<LanguagePreset>
}) {
  const viz = useService(VisualizationStore)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PresetsBar presets={presets} />
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-auto p-3"
        onMouseMove={(event) => {
          const bounds = containerRef.current?.getBoundingClientRect()
          if (!bounds) return
          setPointer({
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          })
        }}
      >
        <EulerCanvas />
        {viz.hoveredEntityId !== null && viz.hoverInfo ? (
          <HoverCard x={pointer.x} y={pointer.y} text={viz.hoverInfo} />
        ) : null}
      </div>
    </div>
  )
})

const PresetsBar = observer(function PresetsBar({
  presets,
}: {
  presets: Array<LanguagePreset>
}) {
  const editor = useService(EditorService)
  const settings = useService(SettingsService)
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-(--color-line) bg-white px-3 py-2">
      <span className="mr-1 font-mono text-[11px] font-semibold text-(--color-ink-soft)">
        {settings.t('presets.title')}
      </span>
      {presets.map((preset) => {
        const active = editor.hasPresetLine(preset.insertText)
        return (
          <button
            key={preset.label}
            type="button"
            aria-pressed={active}
            className={
              active
                ? 'rounded-full border-2 border-(--color-brand) bg-(--color-brand) px-2.5 py-0.5 font-mono text-xs font-bold text-white transition-transform active:scale-[0.95]'
                : 'rounded-full border-2 border-(--color-line) bg-white px-2.5 py-0.5 font-mono text-xs font-semibold text-(--color-ink) transition-transform hover:border-(--color-brand) active:scale-[0.95]'
            }
            onClick={() => editor.togglePresetLine(preset.insertText)}
          >
            {preset.label}
          </button>
        )
      })}
    </div>
  )
})

/** VSCode-flavored quick-info card following the cursor. */
function HoverCard({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[420px] rounded-lg border-2 border-(--color-line) bg-white px-3 py-2 shadow-[3px_3px_0_rgba(27,39,51,0.12)]"
      style={{ left: x + 14, top: y + 14 }}
    >
      <pre className="overflow-hidden font-mono text-xs leading-relaxed whitespace-pre-wrap text-(--color-ink)">
        {text}
      </pre>
    </div>
  )
}
