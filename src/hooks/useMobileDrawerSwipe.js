import { useCallback, useRef } from 'react'

/** Start of gesture must be within this many px of the left screen edge */
const EDGE_PX = 28
/** Minimum horizontal travel to open / close */
const MIN_SWIPE_PX = 56

/**
 * Edge swipe-right opens the drawer; swipe-left on the drawer panel closes it.
 * @param {{ isMobile: boolean, drawerOpen: boolean, setDrawerOpen: (v: boolean) => void }} opts
 */
export function useMobileDrawerSwipe({ isMobile, drawerOpen, setDrawerOpen }) {
  const openGesture = useRef(null)
  const closeGesture = useRef(null)

  const onMainTouchStart = useCallback(
    (e) => {
      if (!isMobile || drawerOpen) return
      const x = e.touches[0].clientX
      if (x <= EDGE_PX) {
        openGesture.current = {
          x0: x,
          y0: e.touches[0].clientY,
        }
      } else {
        openGesture.current = null
      }
    },
    [isMobile, drawerOpen]
  )

  const onMainTouchEnd = useCallback(
    (e) => {
      if (!openGesture.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - openGesture.current.x0
      const dy = t.clientY - openGesture.current.y0
      openGesture.current = null
      if (dx >= MIN_SWIPE_PX && dx > Math.abs(dy) * 0.65) {
        setDrawerOpen(true)
      }
    },
    [isMobile, setDrawerOpen]
  )

  const onMainTouchCancel = useCallback(() => {
    openGesture.current = null
  }, [])

  const onDrawerTouchStart = useCallback(
    (e) => {
      if (!isMobile || !drawerOpen) return
      closeGesture.current = {
        x0: e.touches[0].clientX,
        y0: e.touches[0].clientY,
      }
    },
    [isMobile, drawerOpen]
  )

  const onDrawerTouchEnd = useCallback(
    (e) => {
      if (!closeGesture.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - closeGesture.current.x0
      const dy = t.clientY - closeGesture.current.y0
      closeGesture.current = null
      if (dx <= -MIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 0.65) {
        setDrawerOpen(false)
      }
    },
    [isMobile, setDrawerOpen]
  )

  const onDrawerTouchCancel = useCallback(() => {
    closeGesture.current = null
  }, [])

  return {
    mainSwipeHandlers: {
      onTouchStart: onMainTouchStart,
      onTouchEnd: onMainTouchEnd,
      onTouchCancel: onMainTouchCancel,
    },
    drawerSwipeHandlers: {
      onTouchStart: onDrawerTouchStart,
      onTouchEnd: onDrawerTouchEnd,
      onTouchCancel: onDrawerTouchCancel,
    },
  }
}
