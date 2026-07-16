import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  getBoundingRect,
  restrainPopupPosition,
} from '#/views/floating/floating.ts'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { Placement, Rect } from '@floating-ui/core'

/**
 * Shared popup primitive: fixed-position container whose placement is
 * computed by @floating-ui/core against the viewport (flip + shift),
 * so hover cards and menus near window edges auto-align inside.
 *
 * `anchor` is either an element ref or a virtual point rect (for
 * cursor-following tooltips).
 */
export function Popup({
  anchor,
  placement = 'bottom-start',
  distance = 6,
  className,
  style,
  children,
}: {
  anchor: RefObject<Element | null> | Rect
  placement?: Placement
  distance?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{
    left: number
    top: number
  } | null>(null)

  const anchorRect: Rect =
    'current' in anchor ? getBoundingRect(anchor.current) : anchor

  const reposition = useCallback(async () => {
    const popup = popupRef.current
    if (!popup) return
    const rect = 'current' in anchor ? getBoundingRect(anchor.current) : anchor
    const next = await restrainPopupPosition({
      reference: rect,
      popupSize: { width: popup.offsetWidth, height: popup.offsetHeight },
      placement,
      distance,
    })
    setPosition(next)
  }, [placement, distance, anchorRect.x, anchorRect.y])

  useLayoutEffect(() => {
    void reposition()
  }, [reposition])

  useEffect(() => {
    const onWindowChange = () => void reposition()
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
    return () => {
      window.removeEventListener('resize', onWindowChange)
      window.removeEventListener('scroll', onWindowChange, true)
    }
  }, [reposition])

  return (
    <div
      ref={popupRef}
      className={className}
      style={{
        position: 'fixed',
        zIndex: 50,
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? 'visible' : 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
