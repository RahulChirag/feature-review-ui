import { useCallback, useRef } from 'react'

/** Left edge band: at least this many px from the viewport left, or a fraction of width (whichever is larger). */
function edgeZoneX(clientX) {
  if (typeof window === 'undefined') return clientX <= 56
  const w = window.innerWidth
  const fromPct = w * 0.18
  const cap = 72
  return clientX <= Math.min(cap, Math.max(40, fromPct))
}

/** Minimum horizontal travel to open / close */
const MIN_SWIPE_PX = 44
/** Horizontal movement must dominate vertical by this factor */
const DIR_RATIO = 0.45

/**
 * Edge swipe-right opens the drawer; swipe-left on the drawer (or scrim) closes it.
 * Touch positions are tracked across touchmove so touchend isn't lossy when scrolling competes.
 */
export function useMobileDrawerSwipe({ isMobile, drawerOpen, setDrawerOpen }) {
  const openGesture = useRef(null)
  const closeGesture = useRef(null)
  const scrimGesture = useRef(null)

  const onMainTouchStart = useCallback(
    (e) => {
      if (!isMobile || drawerOpen) return
      const x = e.touches[0].clientX
      if (edgeZoneX(x)) {
        openGesture.current = {
          x0: x,
          y0: e.touches[0].clientY,
          x: x,
          y: e.touches[0].clientY,
        }
      } else {
        openGesture.current = null
      }
    },
    [isMobile, drawerOpen]
  )

  const onMainTouchMove = useCallback((e) => {
    if (!openGesture.current) return
    openGesture.current.x = e.touches[0].clientX
    openGesture.current.y = e.touches[0].clientY
  }, [])

  const onMainTouchEnd = useCallback(
    (e) => {
      if (!openGesture.current) return
      const t = e.changedTouches[0]
      const g = openGesture.current
      openGesture.current = null
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (dx >= MIN_SWIPE_PX && dx > Math.abs(dy) * DIR_RATIO) {
        setDrawerOpen(true)
      }
    },
    [setDrawerOpen]
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
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      }
    },
    [isMobile, drawerOpen]
  )

  const onDrawerTouchMove = useCallback((e) => {
    if (!closeGesture.current) return
    closeGesture.current.x = e.touches[0].clientX
    closeGesture.current.y = e.touches[0].clientY
  }, [])

  const onDrawerTouchEnd = useCallback(
    (e) => {
      if (!closeGesture.current) return
      const t = e.changedTouches[0]
      const g = closeGesture.current
      closeGesture.current = null
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (dx <= -MIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy) * DIR_RATIO) {
        setDrawerOpen(false)
      }
    },
    [setDrawerOpen]
  )

  const onDrawerTouchCancel = useCallback(() => {
    closeGesture.current = null
  }, [])

  /** Swipe left on scrim (outside panel) closes drawer */
  const onScrimTouchStart = useCallback(
    (e) => {
      if (!isMobile || !drawerOpen) return
      scrimGesture.current = {
        x0: e.touches[0].clientX,
        y0: e.touches[0].clientY,
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      }
    },
    [isMobile, drawerOpen]
  )

  const onScrimTouchMove = useCallback((e) => {
    if (!scrimGesture.current) return
    scrimGesture.current.x = e.touches[0].clientX
    scrimGesture.current.y = e.touches[0].clientY
  }, [])

  const onScrimTouchEnd = useCallback(
    (e) => {
      if (!scrimGesture.current) return
      const t = e.changedTouches[0]
      const g = scrimGesture.current
      scrimGesture.current = null
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (dx <= -MIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy) * DIR_RATIO) {
        setDrawerOpen(false)
      }
    },
    [setDrawerOpen]
  )

  const onScrimTouchCancel = useCallback(() => {
    scrimGesture.current = null
  }, [])

  return {
    mainSwipeHandlers: {
      onTouchStart: onMainTouchStart,
      onTouchMove: onMainTouchMove,
      onTouchEnd: onMainTouchEnd,
      onTouchCancel: onMainTouchCancel,
    },
    drawerSwipeHandlers: {
      onTouchStart: onDrawerTouchStart,
      onTouchMove: onDrawerTouchMove,
      onTouchEnd: onDrawerTouchEnd,
      onTouchCancel: onDrawerTouchCancel,
    },
    scrimSwipeHandlers: {
      onTouchStart: onScrimTouchStart,
      onTouchMove: onScrimTouchMove,
      onTouchEnd: onScrimTouchEnd,
      onTouchCancel: onScrimTouchCancel,
    },
  }
}
