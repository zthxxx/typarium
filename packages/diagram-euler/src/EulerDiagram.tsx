import { RING_INSET } from '@typarium/set-model'
import { roughRectPath, roughSegments, wobbleSeed } from './wobble.ts'
import type { RectLayoutResult } from './types.ts'
import '@typarium/set-model/palette.css'
import './styles.css'

const HUE_COUNT = 12
/** Canvas padding around each shape svg so the wobble never clips. */
const WOBBLE_PAD = 4

export interface EulerDiagramProps {
  layout: RectLayoutResult
  /**
   * Highlight state as PLAIN DATA keyed by rect/placeholder key. The
   * component subscribes to nothing — hosts with reactive stores must
   * derive these sets where their reactivity system can see the reads
   * and re-render with new props.
   */
  dimmedKeys?: ReadonlySet<string>
  highlightedKeys?: ReadonlySet<string>
  /** Text inside the everything-else block; defaults to `???`. */
  placeholderLabel?: string
}

const EMPTY_KEYS: ReadonlySet<string> = new Set()

/**
 * The Euler rectangle diagram as a CONTROLLED component: pure layout
 * in, positioned divs out. No stores, no i18n, no host CSS framework —
 * embeddable anywhere React runs; colors resolve through the
 * --set-hue-* palette variables (overridable by the host).
 *
 * Borders are hand-wavy SVG paths seeded by the class CONTENT (see
 * wobble.ts): refresh-stable, and a class's equivalence rings replay
 * the outer border's exact offsets — stacked lines of identical
 * elements wobble as one parallel hand-drawn nest. Labels render
 * outside the shape svg and stay crisp.
 */
export function EulerDiagram({
  layout,
  dimmedKeys = EMPTY_KEYS,
  highlightedKeys = EMPTY_KEYS,
  placeholderLabel = '???',
}: EulerDiagramProps) {
  return (
    <>
      {layout.rects.map((rect) => {
        const hue = rect.colorIndex % HUE_COUNT
        const rings = Math.max(0, rect.ringCount - 1)
        const dimmed = dimmedKeys.has(rect.key)
        const highlighted = highlightedKeys.has(rect.key)
        const seed = wobbleSeed(rect.labels.join(' ≡ '))
        const segments = roughSegments(rect.outer.width, rect.outer.height)
        return (
          <div
            key={rect.key}
            className="ty-euler-rect"
            style={{
              left: rect.outer.x,
              top: rect.outer.y,
              width: rect.outer.width,
              height: rect.outer.height,
              opacity: dimmed ? 0.3 : 1,
              boxShadow: highlighted
                ? `0 0 0 3px color-mix(in srgb, var(--set-hue-${hue}-stroke) 35%, transparent)`
                : undefined,
            }}
          >
            <svg
              aria-hidden="true"
              className="ty-euler-shape"
              width={rect.outer.width + WOBBLE_PAD * 2}
              height={rect.outer.height + WOBBLE_PAD * 2}
            >
              {/* Fill and border share one wavy path: the tint always
                  ends exactly at the hand-drawn stroke. */}
              <path
                d={roughRectPath({
                  x: WOBBLE_PAD + 1.5,
                  y: WOBBLE_PAD + 1.5,
                  width: rect.outer.width - 3,
                  height: rect.outer.height - 3,
                  radius: 10.5,
                  seed,
                  segments,
                })}
                fill={`var(--set-hue-${hue}-fill)`}
                stroke={`var(--set-hue-${hue}-stroke)`}
                strokeWidth={3}
              />
              {Array.from({ length: rings }, (_, ringIndex) => {
                // Mirrors the old CSS geometry: ring n sat RING_INSET*n
                // inside the 3px border; +1.25 centers the 2.5px stroke.
                const inset = 3 + (ringIndex + 1) * RING_INSET + 1.25
                return (
                  <path
                    key={ringIndex}
                    d={roughRectPath({
                      x: WOBBLE_PAD + inset,
                      y: WOBBLE_PAD + inset,
                      width: rect.outer.width - inset * 2,
                      height: rect.outer.height - inset * 2,
                      radius: 8,
                      seed,
                      segments,
                    })}
                    fill="none"
                    stroke={`var(--set-hue-${hue}-stroke)`}
                    strokeWidth={2.5}
                  />
                )
              })}
            </svg>
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
            opacity: dimmedKeys.has(placeholder.key) ? 0.3 : 1,
            boxShadow: highlightedKeys.has(placeholder.key)
              ? '0 0 0 3px rgba(100, 106, 115, 0.25)'
              : undefined,
          }}
        >
          {/* SVG stroke instead of CSS dashed: dash gap is tunable —
              product rule wants twice the default spacing. The tint
              fill rides the same wavy path as the dash. */}
          <svg
            aria-hidden="true"
            className="ty-euler-shape"
            width={placeholder.box.width + WOBBLE_PAD * 2}
            height={placeholder.box.height + WOBBLE_PAD * 2}
          >
            <path
              d={roughRectPath({
                x: WOBBLE_PAD + 1,
                y: WOBBLE_PAD + 1,
                width: placeholder.box.width - 2,
                height: placeholder.box.height - 2,
                radius: 11,
                seed: wobbleSeed(placeholder.key),
                segments: roughSegments(
                  placeholder.box.width,
                  placeholder.box.height,
                ),
              })}
              fill="rgba(143, 149, 158, 0.08)"
              stroke="rgba(100, 106, 115, 0.55)"
              strokeWidth={2}
              strokeDasharray="8 12"
            />
          </svg>
          <span className="ty-euler-placeholder-label">{placeholderLabel}</span>
        </div>
      ))}
    </>
  )
}
