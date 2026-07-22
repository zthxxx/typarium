import { RING_INSET } from '@typarium/set-model'
import type { RectLayoutResult } from './types.ts'
import '@typarium/set-model/palette.css'
import './styles.css'

const HUE_COUNT = 12

export interface EulerDiagramProps {
  layout: RectLayoutResult
  /** Class-level dim/highlight predicates; both default to inert. */
  isDimmed?: (entityIds: Array<string>) => boolean
  isHighlighted?: (entityIds: Array<string>) => boolean
  /**
   * Per-placeholder dim/highlight by key: a `???` block is a hover
   * target of its own, so the host decides its state — it must be able
   * to highlight while everything else dims.
   */
  isPlaceholderDimmed?: (key: string) => boolean
  isPlaceholderHighlighted?: (key: string) => boolean
  /** Text inside the everything-else block; defaults to `???`. */
  placeholderLabel?: string
}

/**
 * The Euler rectangle diagram as a CONTROLLED component: pure layout
 * in, positioned divs out. No stores, no i18n, no host CSS framework —
 * embeddable anywhere React runs; colors resolve through the
 * --set-hue-* palette variables (overridable by the host).
 */
export function EulerDiagram({
  layout,
  isDimmed = () => false,
  isHighlighted = () => false,
  isPlaceholderDimmed = () => false,
  isPlaceholderHighlighted = () => false,
  placeholderLabel = '???',
}: EulerDiagramProps) {
  return (
    <>
      {layout.rects.map((rect) => {
        const hue = rect.colorIndex % HUE_COUNT
        const rings = Math.max(0, rect.ringCount - 1)
        const dimmed = isDimmed(rect.entityIds)
        const highlighted = isHighlighted(rect.entityIds)
        return (
          <div
            key={rect.key}
            className="ty-euler-rect"
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
                className="ty-euler-ring"
                style={{
                  inset: (index + 1) * RING_INSET,
                  border: `2.5px solid var(--set-hue-${hue}-stroke)`,
                }}
              />
            ))}
            <span
              className="ty-euler-label"
              style={{
                // Sit inside the innermost equivalence ring so stacked
                // ring borders never run through the text.
                top: rings * RING_INSET + 3,
                left: rings * RING_INSET + 10,
                color: `var(--set-hue-${hue}-stroke)`,
              }}
            >
              {rect.labels.join(' ≡ ')}
            </span>
          </div>
        )
      })}

      {layout.placeholders.map((placeholder) => (
        <div
          key={placeholder.key}
          className="ty-euler-placeholder"
          style={{
            left: placeholder.box.x,
            top: placeholder.box.y,
            width: placeholder.box.width,
            height: placeholder.box.height,
            opacity: isPlaceholderDimmed(placeholder.key) ? 0.3 : 1,
            boxShadow: isPlaceholderHighlighted(placeholder.key)
              ? '0 0 0 3px rgba(100, 106, 115, 0.25)'
              : undefined,
          }}
        >
          {/* SVG stroke instead of CSS dashed: dash gap is tunable —
              product rule wants twice the default spacing. */}
          <svg aria-hidden="true" className="ty-euler-placeholder-svg">
            <rect
              x="1"
              y="1"
              width="calc(100% - 2px)"
              height="calc(100% - 2px)"
              rx="11"
              fill="none"
              stroke="rgba(100, 106, 115, 0.55)"
              strokeWidth="2"
              strokeDasharray="8 12"
            />
          </svg>
          <span className="ty-euler-placeholder-label">{placeholderLabel}</span>
        </div>
      ))}
    </>
  )
}
