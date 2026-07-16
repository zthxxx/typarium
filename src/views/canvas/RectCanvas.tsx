import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { useService } from '#/views/di.tsx'
import { RING_INSET } from '#/core/layout/constants.ts'
import type { EntityRect } from '#/core/layout/types.ts'
import type { TooltipStack } from '#/services/visualization.store.ts'

const HUE_COUNT = 12

/**
 * The rectangle diagram (ADR-0012): nested rounded rectangles arranged
 * by containment, rendered as plain positioned divs. The canvas fills
 * its container fluidly; a ResizeObserver feeds the measured size back
 * into the layout. Empty analysis -> empty canvas (product rule).
 */
export const RectCanvas = observer(function RectCanvas() {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const hostRef = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [stack, setStack] = useState<TooltipStack | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(([entry]) => {
      viz.setViewport(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [viz])

  const layout = viz.layout
  const universeActive = (layout?.universeIds.length ?? 0) > 0
  const neverActive = viz.neverDisplayed
  const hasRects = (layout?.rects.length ?? 0) > 0

  return (
    <div
      ref={hostRef}
      data-testid="rect-canvas"
      className={[
        'relative h-full w-full overflow-hidden rounded-2xl transition-colors',
        universeActive
          ? 'border-4 border-(--color-brand)'
          : 'border-4 border-transparent',
        neverActive ? 'canvas-dots' : 'bg-(--color-board)',
      ].join(' ')}
      onMouseMove={(event) => {
        const bounds = hostRef.current?.getBoundingClientRect()
        if (!bounds) return
        const x = event.clientX - bounds.left
        const y = event.clientY - bounds.top
        setPointer({ x, y })
        setStack(viz.stackAt(x, y))
        viz.hoverEntity(viz.rectAt(x, y)?.entityIds[0] ?? null)
      }}
      onMouseLeave={() => {
        setPointer(null)
        setStack(null)
        viz.hoverEntity(null)
      }}
    >
      {universeActive ? (
        <span className="absolute top-2 left-4 z-10 font-mono text-sm font-bold text-(--color-brand)">
          {[
            'unknown',
            ...viz.universeLabels.filter((l) => l !== 'unknown'),
          ].join(' ≡ ')}
        </span>
      ) : null}

      {layout?.rects.map((rect) => (
        <RectView
          key={rect.key}
          rect={rect}
          dimmed={
            viz.activeEntityId !== null &&
            !rect.entityIds.includes(viz.activeEntityId)
          }
          highlighted={
            viz.activeEntityId !== null &&
            rect.entityIds.includes(viz.activeEntityId)
          }
        />
      ))}

      {neverActive ? (
        <span className="absolute bottom-3 left-4 z-10 rounded-full border-2 border-(--color-ink) bg-white px-3 py-1 font-mono text-[11px] font-semibold">
          {settings.t('canvas.neverLegend')}
        </span>
      ) : null}

      {!hasRects && !universeActive && !neverActive ? (
        <p className="absolute inset-0 flex items-center justify-center text-base text-(--color-ink-soft)">
          {settings.t('canvas.emptyHint')}
        </p>
      ) : null}

      {pointer && stack && (stack.items.length > 0 || neverActive) ? (
        <StackTooltip
          pointer={pointer}
          stack={stack}
          neverRow={settings.t('canvas.neverRow')}
          hostWidth={viz.viewportWidth}
        />
      ) : null}
    </div>
  )
})

/**
 * One containment rectangle. Equivalence classes render as stacked
 * rings: each extra member adds an inset border of the same hue.
 */
const RectView = observer(function RectView({
  rect,
  dimmed,
  highlighted,
}: {
  rect: EntityRect
  dimmed: boolean
  highlighted: boolean
}) {
  const hue = rect.colorIndex % HUE_COUNT
  const rings = Math.max(0, rect.ringCount - 1)

  return (
    <div
      className="absolute rounded-xl transition-[opacity,box-shadow] duration-200"
      style={{
        left: rect.outer.x,
        top: rect.outer.y,
        width: rect.outer.width,
        height: rect.outer.height,
        border: `3px solid var(--set-hue-${hue}-stroke)`,
        background: `var(--set-hue-${hue}-fill)`,
        opacity: dimmed ? 0.3 : 1,
        boxShadow: highlighted
          ? `0 0 0 3px color-mix(in srgb, var(--set-hue-${hue}-stroke) 35%, transparent)`
          : undefined,
      }}
    >
      {Array.from({ length: rings }, (_, index) => (
        <div
          key={index}
          className="pointer-events-none absolute rounded-lg"
          style={{
            inset: (index + 1) * RING_INSET,
            border: `2.5px solid var(--set-hue-${hue}-stroke)`,
          }}
        />
      ))}
      <span
        className="absolute top-1 left-2.5 max-w-[calc(100%-20px)] truncate font-mono text-xs font-bold"
        style={{ color: `var(--set-hue-${hue}-stroke)` }}
      >
        {rect.labels.join(' ≡ ')}
      </span>
    </div>
  )
})

/** Multi-item containment tooltip: outermost set first, ∅ row last. */
function StackTooltip({
  pointer,
  stack,
  neverRow,
  hostWidth,
}: {
  pointer: { x: number; y: number }
  stack: TooltipStack
  neverRow: string
  hostWidth: number
}) {
  const flipX = pointer.x > hostWidth - 280
  return (
    <div
      className="pointer-events-none absolute z-30 min-w-44 rounded-xl border-2 border-(--color-ink) bg-white px-3 py-2 shadow-[4px_4px_0_rgba(27,39,51,0.18)]"
      style={{
        left: flipX ? undefined : pointer.x + 16,
        right: flipX ? hostWidth - pointer.x + 16 : undefined,
        top: pointer.y + 16,
      }}
    >
      <ul className="flex flex-col gap-1">
        {stack.items.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            className="flex items-baseline gap-2 font-mono text-xs"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 self-center rounded-[4px] border-2"
              style={
                item.colorIndex === null
                  ? { borderColor: 'var(--color-brand)' }
                  : {
                      borderColor: `var(--set-hue-${item.colorIndex % HUE_COUNT}-stroke)`,
                      background: `var(--set-hue-${item.colorIndex % HUE_COUNT}-fill)`,
                    }
              }
            />
            <span className="font-bold">{item.name}</span>
            {item.typeText !== item.name ? (
              <span className="max-w-56 truncate text-(--color-ink-soft)">
                {item.typeText}
              </span>
            ) : null}
          </li>
        ))}
        {stack.onNever ? (
          <li className="font-mono text-xs text-(--color-ink-soft)">
            {neverRow}
          </li>
        ) : null}
      </ul>
    </div>
  )
}
