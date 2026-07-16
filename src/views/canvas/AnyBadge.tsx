import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { useService } from '#/views/di.tsx'

/**
 * The `any` escape hatch: outside set theory, so it floats ABOVE the
 * plane — a draggable badge with a drop shadow, defaulting to a spot
 * straddling the canvas/editor boundary. Dragging is clamped to the
 * viewport: the badge can never be lost off-screen (product rule).
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

  const clamp = (x: number, y: number) => {
    const bounds = badgeRef.current?.getBoundingClientRect()
    const width = bounds?.width ?? 80
    const height = bounds?.height ?? 44
    const margin = 8
    return {
      x: Math.min(Math.max(x, margin), window.innerWidth - width - margin),
      y: Math.min(Math.max(y, margin), window.innerHeight - height - margin),
    }
  }

  // Window resizes must not strand the badge outside the viewport.
  useEffect(() => {
    const onResize = () => {
      setPosition((current) => (current ? clamp(current.x, current.y) : null))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const anyEntities = viz.anyEntities
  if (anyEntities.length === 0) return null

  return (
    <button
      ref={badgeRef}
      type="button"
      aria-label={settings.t('anyBadge.tooltip')}
      className="fixed z-40 cursor-grab touch-none rounded-xl border-[3px] border-white bg-(--color-warn-any) px-5 py-2 font-mono text-lg font-bold text-white shadow-[0_10px_24px_rgba(255,77,48,0.45)] transition-transform active:cursor-grabbing"
      style={
        position
          ? { left: position.x, top: position.y, rotate: '-14deg' }
          : // Default spot straddles the canvas/editor divider: visually
            // "not inside the diagram plane".
            { left: 'calc(58% - 40px)', top: '108px', rotate: '-14deg' }
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
        setPosition(
          clamp(
            event.clientX - dragState.current.dx,
            event.clientY - dragState.current.dy,
          ),
        )
      }}
      onPointerUp={() => {
        dragState.current = null
      }}
    >
      {settings.t('anyBadge.label')}
      {showTip ? (
        <span className="absolute top-full left-1/2 mt-3 block w-72 -translate-x-1/2 rotate-[14deg] rounded-xl border-2 border-(--color-ink) bg-white px-3 py-2 text-left font-sans text-xs font-normal text-(--color-ink) shadow-[4px_4px_0_rgba(27,39,51,0.18)]">
          <span className="mb-1 block">{settings.t('anyBadge.tooltip')}</span>
          <ul className="flex flex-col gap-1">
            {anyEntities.map((entity) => (
              <li
                key={entity.id}
                className="flex items-baseline gap-2 font-mono"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 self-center rounded-[4px] border-2 border-(--color-warn-any) bg-(--color-warn-any)/15"
                />
                <span className="font-bold">{entity.name}</span>
                {entity.typeText !== entity.name ? (
                  <span className="max-w-40 truncate text-(--color-ink-soft)">
                    {entity.typeText}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </span>
      ) : null}
    </button>
  )
})
