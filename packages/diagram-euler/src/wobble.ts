/**
 * Hand-drawn border wobble, deterministically seeded (ADR-0012 holds:
 * zero runtime randomness — the "randomness" is a pure function of the
 * element's content).
 *
 * Rectangles render as SVG paths whose edge control points are
 * perturbed by a seeded PRNG and smoothed with quadratic curves —
 * genuinely smooth wavy strokes (a displacement-filter approach tears
 * thin borders into terraces). Seed = content hash: the same element
 * draws the same wobble on every refresh and in every instance.
 *
 * Equivalence rings pass the SAME seed and the SAME per-edge segment
 * counts as their outer border, so ring point i replays exactly the
 * offset of outer point i — the stacked border lines of identical
 * elements wobble as one parallel hand-drawn nest, never each on its
 * own.
 */

/** FNV-1a 32-bit hash of the element content → wobble seed. */
export function wobbleSeed(content: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Max perpendicular offset in px — visible squiggle, legible border. */
export const WOBBLE_AMPLITUDE = 1.4

/** Target control-point spacing along an edge in px. */
const SEGMENT_TARGET = 26

export interface RoughSegments {
  horizontal: number
  vertical: number
}

/**
 * Control-point counts per edge, derived from the OUTER box only —
 * rings reuse the outer's counts so their PRNG sequences line up.
 */
export function roughSegments(width: number, height: number): RoughSegments {
  return {
    horizontal: Math.max(2, Math.round(width / SEGMENT_TARGET)),
    vertical: Math.max(2, Math.round(height / SEGMENT_TARGET)),
  }
}

/** Deterministic PRNG (mulberry32): same seed, same sequence. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Point {
  x: number
  y: number
}

const fmt = (point: Point): string =>
  `${point.x.toFixed(2)} ${point.y.toFixed(2)}`

/**
 * Straight edge → wavy control points: endpoints exact (corner arcs
 * must connect seamlessly), interior points offset along the edge
 * normal by the seeded PRNG.
 */
function wavyPoints(
  from: Point,
  to: Point,
  count: number,
  rand: () => number,
  amplitude: number,
): Array<Point> {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const normalX = -dy / length
  const normalY = dx / length
  const points: Array<Point> = [from]
  for (let index = 1; index < count; index++) {
    const t = index / count
    const offset = (rand() * 2 - 1) * amplitude
    points.push({
      x: from.x + dx * t + normalX * offset,
      y: from.y + dy * t + normalY * offset,
    })
  }
  points.push(to)
  return points
}

/** Quadratic smoothing through the wavy points, exact at both ends. */
function smoothTo(points: Array<Point>): string {
  if (points.length === 2) return ` L ${fmt(points[1])}`
  let path = ''
  for (let index = 1; index < points.length - 1; index++) {
    const control = points[index]
    const end =
      index < points.length - 2
        ? {
            x: (points[index].x + points[index + 1].x) / 2,
            y: (points[index].y + points[index + 1].y) / 2,
          }
        : points[points.length - 1]
    path += ` Q ${fmt(control)} ${fmt(end)}`
  }
  return path
}

export interface RoughRectOptions {
  x: number
  y: number
  width: number
  height: number
  radius: number
  seed: number
  segments: RoughSegments
  amplitude?: number
}

/**
 * A rounded-rect path with hand-wavy edges and exact corner arcs.
 * Pure: identical options, identical path string.
 */
export function roughRectPath({
  x,
  y,
  width,
  height,
  radius,
  seed,
  segments,
  amplitude = WOBBLE_AMPLITUDE,
}: RoughRectOptions): string {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2))
  // One PRNG per edge, derived from the seed alone: a ring replays
  // the exact per-edge sequences of its outer border.
  const edgeRand = (edge: number) =>
    mulberry32((seed ^ Math.imul(edge + 1, 0x9e3779b9)) >>> 0)
  const arc = (to: Point) => ` A ${r} ${r} 0 0 1 ${fmt(to)}`

  const topLeft = { x: x + r, y }
  const topRight = { x: x + width - r, y }
  const rightTop = { x: x + width, y: y + r }
  const rightBottom = { x: x + width, y: y + height - r }
  const bottomRight = { x: x + width - r, y: y + height }
  const bottomLeft = { x: x + r, y: y + height }
  const leftBottom = { x, y: y + height - r }
  const leftTop = { x, y: y + r }

  return (
    `M ${fmt(topLeft)}` +
    smoothTo(
      wavyPoints(
        topLeft,
        topRight,
        segments.horizontal,
        edgeRand(0),
        amplitude,
      ),
    ) +
    arc(rightTop) +
    smoothTo(
      wavyPoints(
        rightTop,
        rightBottom,
        segments.vertical,
        edgeRand(1),
        amplitude,
      ),
    ) +
    arc(bottomRight) +
    smoothTo(
      wavyPoints(
        bottomRight,
        bottomLeft,
        segments.horizontal,
        edgeRand(2),
        amplitude,
      ),
    ) +
    arc(leftBottom) +
    smoothTo(
      wavyPoints(
        leftBottom,
        leftTop,
        segments.vertical,
        edgeRand(3),
        amplitude,
      ),
    ) +
    arc(topLeft) +
    ' Z'
  )
}
