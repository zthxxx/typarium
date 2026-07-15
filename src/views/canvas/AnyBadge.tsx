import { observer } from 'mobx-react-lite'
import { useRef, useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { useService } from '#/views/di.tsx'

/**
 * The `any` escape hatch (ADR-0005): any is outside set theory, so it
 * floats ABOVE the plane — a draggable badge with a drop shadow (the
 * only shadowed element among the diagram's flat shapes), defaulting to
 * a spot straddling the canvas/editor boundary.
 */
export const AnyBadge = observer(function AnyBadge() {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const badgeRef = useRef<HTMLButtonElement>(null)
  const dragState = useRef<{ dx: number; dy: number } | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [showTip, setShowTip] = useState(false)

  const names = viz.anyEntityNames
  if (names.length === 0) return null

  return (
    <button
      ref={badgeRef}
      type="button"
      aria-label={settings.t('anyBadge.tooltip', { names: names.join(', ') })}
      className="fixed z-40 cursor-grab touch-none rounded-xl border-[3px] border-white bg-(--color-warn-any) px-5 py-2 font-mono text-lg font-bold text-white shadow-[0_10px_24px_rgba(255,77,48,0.45)] transition-transform active:cursor-grabbing"
      style={
        position
          ? { left: position.x, top: position.y, rotate: '-14deg' }
          : // Default spot straddles the canvas/editor divider (the main
            // split is 58/42): visually "not inside the diagram plane".
            {
              left: 'calc(58% - 40px)',
              top: '108px',
              rotate: '-14deg',
            }
      }
      onPointerEnter={() => setShowTip(true)}
      onPointerLeave={() => setShowTip(false)}
      onPointerDown={(event) => {
        const bounds = badgeRef.current?.getBoundingClientRect()
        if (!bounds) return
        dragState.current = {
          dx: event.clientX - bounds.left,
          dy: event.clientY - bounds.top,
        }
        badgeRef.current?.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!dragState.current) return
        setPosition({
          x: event.clientX - dragState.current.dx,
          y: event.clientY - dragState.current.dy,
        })
      }}
      onPointerUp={() => {
        dragState.current = null
      }}
    >
      {settings.t('anyBadge.label')}
      {showTip ? (
        <span className="absolute top-full left-1/2 mt-3 block w-64 -translate-x-1/2 rotate-[14deg] rounded-lg border-2 border-(--color-ink) bg-white px-3 py-2 text-left font-sans text-xs font-normal text-(--color-ink) shadow-[3px_3px_0_rgba(27,39,51,0.12)]">
          {settings.t('anyBadge.tooltip', { names: names.join(', ') })}
        </span>
      ) : null}
    </button>
  )
})
