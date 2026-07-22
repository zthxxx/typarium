import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { Popup } from '#/views/floating/Popup.tsx'
import { useService } from '#/views/di.tsx'

/**
 * The `any` escape hatch: outside set theory, so it floats ABOVE the
 * plane like a little cloud — irregular puffy outline, saturated
 * colored shadow, and a slow vertical drift (the breathing motion
 * lives on the inner visual; the anchor and its tooltip stay put).
 * Dragging is clamped to the viewport; every fresh appearance starts
 * from the default spot straddling the canvas/editor boundary.
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

  const anyEntities = viz.anyEntities
  const anyName = viz.specialNames.any
  const visible = anyEntities.length > 0

  const clamp = (x: number, y: number) => {
    const bounds = badgeRef.current?.getBoundingClientRect()
    const width = bounds?.width ?? 90
    const height = bounds?.height ?? 48
    const margin = 8
    return {
      x: Math.min(Math.max(x, margin), window.innerWidth - width - margin),
      y: Math.min(Math.max(y, margin), window.innerHeight - height - margin),
    }
  }

  // Every disappearance forgets the dragged position: the next
  // appearance starts from the default spot (product rule).
  useEffect(() => {
    if (!visible) setPosition(null)
  }, [visible])

  // Window resizes must not strand the badge outside the viewport.
  useEffect(() => {
    const onResize = () => {
      setPosition((current) => (current ? clamp(current.x, current.y) : null))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!visible) return null

  return (
    <button
      ref={badgeRef}
      type="button"
      aria-label={settings.t('anyBadge.tooltip', { name: anyName })}
      className="fixed z-40 cursor-grab touch-none active:cursor-grabbing"
      style={
        position
          ? { left: position.x, top: position.y }
          : // Default spot straddles the canvas/editor divider: visually
            // "not inside the diagram plane".
            { left: 'calc(58% - 44px)', top: '104px' }
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
      {/* Drifting sticker: a rounded rect whose edges wobble via a fixed
          turbulence displacement (roughly-cut-sticker look); the label sits
          on an unfiltered layer so the text itself stays crisp. */}
      <span className="cloud-float relative block rotate-[-10deg]">
        <svg aria-hidden="true" width="0" height="0" className="absolute">
          <filter id="any-wobble" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.055"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="9" />
          </filter>
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-xl border-[3px] border-white bg-(--color-warn-any) shadow-[0_8px_0_rgba(255,77,48,0.35),0_14px_28px_rgba(255,77,48,0.55)]"
          style={{ filter: 'url(#any-wobble)' }}
        />
        <span className="relative block px-6 py-2 font-mono text-lg font-bold text-white">
          {anyName}
        </span>
      </span>

      {showTip ? (
        <Popup anchor={badgeRef} placement="bottom" distance={12}>
          <span className="block w-72 rounded-xl border-2 border-(--color-ink) bg-white px-3 py-2 text-left font-sans text-xs font-normal text-(--color-ink) shadow-(--shadow-sticker)">
            <span className="mb-1 block">
              {settings.t('anyBadge.tooltip', { name: anyName })}
            </span>
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
        </Popup>
      ) : null}
    </button>
  )
})
