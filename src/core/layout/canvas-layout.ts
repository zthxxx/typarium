import { computeHasseLayout } from '#/core/layout/hasse-layout.ts'
import {
  computeRectLayout,
  probeRectFaithfulness,
} from '#/core/layout/rect-layout.ts'
import type { CanvasLayout, RectLayoutInput } from '#/core/layout/types.ts'

/**
 * Canvas-level engine switch (ADR-0017). Euler rectangles whenever the
 * containment DAG is faithfully representable — the probe replays the
 * rectangle engine's planning and reports every place a containment
 * edge would be dropped (≥3 parents, cross-container double parents,
 * conflicting overlap pairings). Zero violations → Euler; otherwise the
 * layered Hasse diagram, which loses no containment edge by
 * construction. The violations ride along as warnings so the UI can
 * explain WHY the canvas switched.
 */
export function computeCanvasLayout(input: RectLayoutInput): CanvasLayout {
  const violations = probeRectFaithfulness(input)
  if (violations.length === 0) {
    return { mode: 'euler', ...computeRectLayout(input) }
  }
  const hasse = computeHasseLayout(input)
  return {
    mode: 'hasse',
    ...hasse,
    warnings: [
      ...violations.map((violation) => `hasse fallback: ${violation}`),
      ...hasse.warnings,
    ],
  }
}
