import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState } from 'react'
import { BootService } from '#/services/boot.service.ts'
import { SettingsService } from '#/services/settings.service.ts'
import { VisualizationStore } from '#/services/visualization.store.ts'
import { useService } from '#/views/di.tsx'
import { HasseView } from '#/views/canvas/HasseView.tsx'
import { EulerDiagram } from '@typarium/diagram-euler'
import { Popup } from '#/views/floating/Popup.tsx'
import type { RefObject } from 'react'
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
  const boot = useService(BootService)
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
  const euler = layout?.mode === 'euler' ? layout : null
  const hasse = layout?.mode === 'hasse' ? layout : null
  const universeActive = (layout?.universeIds.length ?? 0) > 0
  const neverActive = viz.neverDisplayed
  const hasContent =
    (euler?.rects.length ?? 0) > 0 || (hasse?.nodes.length ?? 0) > 0

  return (
    <div
      ref={hostRef}
      data-testid="rect-canvas"
      className={[
        // The game board: a floating card on the play-mat. The outline
        // is always drawn; unknown-universe recolors it brand blue.
        'relative h-full w-full overflow-hidden rounded-2xl border-4 shadow-(--shadow-sticker) transition-colors',
        universeActive ? 'border-(--color-brand)' : 'border-(--color-line)',
        neverActive ? 'canvas-dots' : 'bg-(--color-board)',
      ].join(' ')}
      onMouseMove={(event) => {
        const bounds = hostRef.current?.getBoundingClientRect()
        if (!bounds) return
        const x = event.clientX - bounds.left
        const y = event.clientY - bounds.top
        setPointer({ x, y })
        setStack(viz.stackAt(x, y))
        // Hover driving is EULER-only here: in hasse mode the node
        // chips own enter/leave, and this bubbling handler would wipe
        // their state right after every mouseenter.
        if (viz.layout?.mode !== 'euler') return
        // A ??? block is its own hover target; otherwise the whole
        // equivalence class of the innermost rect (hover may correspond
        // to SEVERAL equal exports in the editor).
        const placeholder = viz.placeholderAt(x, y)
        if (placeholder) {
          viz.hoverPlaceholder(placeholder.key)
        } else {
          viz.hoverClass(viz.rectAt(x, y)?.entityIds ?? null)
        }
      }}
      onMouseLeave={() => {
        setPointer(null)
        setStack(null)
        viz.hoverClass(null)
      }}
    >
      {universeActive ? (
        <span className="absolute top-2 left-4 z-10 font-mono text-sm font-bold text-(--color-brand)">
          {[
            viz.specialNames.universe,
            ...viz.universeLabels.filter(
              (label) => label !== viz.specialNames.universe,
            ),
          ].join(' ≡ ')}
        </span>
      ) : null}

      {euler ? (
        <EulerDiagram
          layout={euler}
          dimmedKeys={viz.dimmedKeys}
          highlightedKeys={viz.highlightedKeys}
        />
      ) : null}

      {neverActive ? <NeverLegend /> : null}

      {hasse ? <HasseView layout={hasse} /> : null}

      {!hasContent && !universeActive && !neverActive && boot.done ? (
        <p className="absolute inset-0 flex items-center justify-center text-base text-(--color-ink-soft)">
          {settings.t('canvas.emptyHint')}
        </p>
      ) : null}

      {!boot.done ? <BootOverlay /> : null}

      {pointer && stack && (stack.items.length > 0 || neverActive) ? (
        <StackTooltip
          pointer={pointer}
          stack={stack}
          neverRow={[
            settings.t('canvas.neverRow', { name: viz.specialNames.empty }),
            // The preset's own entity carries the language's empty-set
            // name already — only code exports add information here.
            ...viz.neverEntities
              .filter((entity) => entity.origin === 'code')
              .map((entity) => entity.name),
          ].join(' ≡ ')}
          otherRow={settings.t('canvas.otherTypes')}
          hostRef={hostRef}
        />
      ) : null}
    </div>
  )
})

const BOOT_STAGE_KEYS = {
  'engine-download': 'boot.engineDownload',
  'engine-init': 'boot.engineInit',
  restore: 'boot.restore',
  'first-analysis': 'boot.firstAnalysis',
} as const

/**
 * Real-progress boot overlay (ADR-0020): weighted stage completion +
 * live byte fractions drive the bar; the caption names the stage.
 * Cache-hydrated boots mark first-analysis done immediately, so the
 * overlay never covers an already-usable canvas.
 */
const BootOverlay = observer(function BootOverlay() {
  const boot = useService(BootService)
  const settings = useService(SettingsService)
  const stage = boot.activeStage

  return (
    <div
      data-testid="boot-overlay"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-(--color-board)/85"
    >
      <div className="h-2.5 w-56 overflow-hidden rounded-full border-2 border-(--color-ink) bg-white">
        <div
          className="h-full rounded-full bg-(--color-brand) transition-[width] duration-200"
          style={{ width: `${Math.round(boot.progress * 100)}%` }}
        />
      </div>
      {stage ? (
        <p className="font-mono text-[11px] text-(--color-ink-soft)">
          {settings.t(BOOT_STAGE_KEYS[stage])}
        </p>
      ) : null}
    </div>
  )
})

/** Multi-item containment tooltip: outermost set first, ∅ row last.
 * Anchored to the pointer as a floating-ui virtual reference — the
 * viewport clipping keeps it on screen near window edges. */
function StackTooltip({
  pointer,
  stack,
  neverRow,
  otherRow,
  hostRef,
}: {
  pointer: { x: number; y: number }
  stack: TooltipStack
  neverRow: string
  otherRow: string
  hostRef: RefObject<HTMLDivElement | null>
}) {
  const host = hostRef.current?.getBoundingClientRect()
  const reference = {
    x: (host?.left ?? 0) + pointer.x,
    y: (host?.top ?? 0) + pointer.y,
    width: 0,
    height: 0,
  }
  return (
    <Popup anchor={reference} placement="bottom-start" distance={14}>
      <div className="pointer-events-none min-w-44 rounded-xl border-2 border-(--color-ink) bg-white px-3 py-2 shadow-(--shadow-sticker)">
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
                <span className="max-w-[28rem] truncate text-(--color-ink-soft)">
                  {item.typeText}
                </span>
              ) : null}
            </li>
          ))}
          {stack.onPlaceholder ? (
            <li className="flex items-baseline gap-2 font-mono text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 self-center rounded-[4px] border"
                style={{ borderColor: 'rgba(100,106,115,0.6)' }}
              />
              <span className="font-bold text-(--color-ink-soft)">???</span>
              <span className="text-(--color-ink-soft)">{otherRow}</span>
            </li>
          ) : null}
          {stack.onNever ? (
            <li className="font-mono text-xs text-(--color-ink-soft)">
              {neverRow}
            </li>
          ) : null}
        </ul>
      </div>
    </Popup>
  )
}

/**
 * The ∅ legend pill: quiet by default (thin dense-dashed neutral
 * border), asserts itself on hover (solid dark border) and reveals
 * which exports resolved to the empty set.
 */
const NeverLegend = observer(function NeverLegend() {
  const viz = useService(VisualizationStore)
  const settings = useService(SettingsService)
  const pillRef = useRef<HTMLSpanElement>(null)
  const [hovered, setHovered] = useState(false)
  const resolved = viz.neverEntities

  return (
    <span
      ref={pillRef}
      className="absolute bottom-3 left-4 z-10 rounded-full bg-white px-3 py-1 font-mono text-[11px] font-semibold transition-colors"
      style={{
        color: hovered ? 'var(--color-ink)' : 'var(--color-ink-soft)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        <rect
          x="0.75"
          y="0.75"
          width="99%"
          height="94%"
          rx="12"
          fill="none"
          stroke={hovered ? 'var(--color-ink)' : 'rgba(100,106,115,0.55)'}
          strokeWidth="1.5"
          strokeDasharray={hovered ? undefined : '3 3'}
        />
      </svg>
      {settings.t('canvas.neverLegend', { name: viz.specialNames.empty })}
      {hovered && resolved.length > 0 ? (
        <Popup anchor={pillRef} placement="top-start" distance={8}>
          <span className="block w-max max-w-72 rounded-xl border-2 border-(--color-ink) bg-white px-3 py-2 font-mono text-[11px] shadow-(--shadow-sticker)">
            <ul className="flex flex-col gap-1">
              {resolved.map((entity) => (
                <li key={entity.id} className="flex items-baseline gap-2">
                  <span className="text-(--color-ink-soft)">∅</span>
                  <span className="font-bold">{entity.name}</span>
                  {entity.typeText !== entity.name ? (
                    <span className="max-w-44 truncate text-(--color-ink-soft)">
                      {entity.typeText}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </span>
        </Popup>
      ) : null}
    </span>
  )
})
