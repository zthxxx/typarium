import { computePosition, flip, offset, shift } from '@floating-ui/core'
import type { Dimensions, Placement, Rect } from '@floating-ui/core'

/**
 * Viewport-aware popup positioning on @floating-ui/core with a minimal
 * DOM platform (pattern follows react-dev-inspector's floating.ts):
 * the clipping rect is the window viewport, so every tooltip/popover
 * stays on screen near window edges via flip + shift.
 */

export interface PopupPosition {
  left: number
  top: number
}

export function getViewportBox(): Rect {
  return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
}

export function getBoundingRect(element: Element | null): Rect {
  const domRect = element?.getBoundingClientRect()
  if (!domRect) return { x: 0, y: 0, width: 0, height: 0 }
  return {
    x: domRect.left,
    y: domRect.top,
    width: domRect.width,
    height: domRect.height,
  }
}

export async function restrainPopupPosition({
  reference,
  popupSize,
  placement = 'bottom-start',
  distance = 6,
  boundary = getViewportBox(),
}: {
  /** Anchor rect in viewport coordinates (element box or pointer point). */
  reference: Rect
  /** Measured size of the floating element. */
  popupSize: Dimensions
  placement?: Placement
  distance?: number
  boundary?: Rect
}): Promise<PopupPosition> {
  const { x, y } = await computePosition(reference, popupSize, {
    platform: {
      getElementRects: (rects) => rects,
      getDimensions: (dimensions) => dimensions,
      getClippingRect: () => boundary,
    },
    placement,
    strategy: 'fixed',
    middleware: [
      offset(distance),
      flip({ crossAxis: false, fallbackAxisSideDirection: 'start' }),
      shift({ padding: 8, crossAxis: true }),
    ],
  })
  return { left: x, top: y }
}
