import { useEffect, useRef } from 'react'

/**
 * Left edge: generous band so thumbs can start the gesture without hugging the bezel.
 */
function edgeZoneX(clientX) {
  if (typeof window === 'undefined') return clientX <= 64
  const w = window.innerWidth || 400
  return clientX <= Math.min(96, Math.max(48, w * 0.26))
}

const MIN_SWIPE_PX = 36
const DIR_RATIO = 0.38

/**
 * Native capture-phase listeners on `document` — reliable with nested scroll areas and
 * avoids `touch-action: pan-y` blocking horizontal recognition on some browsers.
 *
 * - Drawer closed: swipe right from left edge opens.
 * - Drawer open: swipe left from drawer panel or scrim closes.
 */
export function useMobileDrawerSwipe({ isMobile, drawerOpen, setDrawerOpen }) {
  const openGesture = useRef(null)
  const closeGesture = useRef(null)

  useEffect(() => {
    if (!isMobile || drawerOpen) return undefined

    const onStart = (e) => {
      if (e.touches.length !== 1) return
      const x = e.touches[0].clientX
      if (!edgeZoneX(x)) {
        openGesture.current = null
        return
      }
      openGesture.current = {
        x0: x,
        y0: e.touches[0].clientY,
      }
    }

    const onEnd = (e) => {
      if (!openGesture.current) return
      const t = e.changedTouches[0]
      const g = openGesture.current
      openGesture.current = null
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (dx >= MIN_SWIPE_PX && dx > Math.abs(dy) * DIR_RATIO) {
        setDrawerOpen(true)
      }
    }

    const onCancel = () => {
      openGesture.current = null
    }

    document.addEventListener('touchstart', onStart, { capture: true, passive: true })
    document.addEventListener('touchend', onEnd, { capture: true, passive: true })
    document.addEventListener('touchcancel', onCancel, { capture: true, passive: true })

    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true })
      document.removeEventListener('touchend', onEnd, { capture: true })
      document.removeEventListener('touchcancel', onCancel, { capture: true })
    }
  }, [isMobile, drawerOpen, setDrawerOpen])

  useEffect(() => {
    if (!isMobile || !drawerOpen) return undefined

    const inCloseZone = (target) => {
      if (!target || typeof target.closest !== 'function') return false
      return Boolean(target.closest('#feature-drawer') || target.closest('[data-drawer-scrim="true"]'))
    }

    const onStart = (e) => {
      if (e.touches.length !== 1) return
      if (!inCloseZone(e.target)) {
        closeGesture.current = null
        return
      }
      closeGesture.current = {
        x0: e.touches[0].clientX,
        y0: e.touches[0].clientY,
      }
    }

    const onEnd = (e) => {
      if (!closeGesture.current) return
      const t = e.changedTouches[0]
      const g = closeGesture.current
      closeGesture.current = null
      if (!inCloseZone(e.target)) return
      const dx = t.clientX - g.x0
      const dy = t.clientY - g.y0
      if (dx <= -MIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy) * DIR_RATIO) {
        setDrawerOpen(false)
      }
    }

    const onCancel = () => {
      closeGesture.current = null
    }

    document.addEventListener('touchstart', onStart, { capture: true, passive: true })
    document.addEventListener('touchend', onEnd, { capture: true, passive: true })
    document.addEventListener('touchcancel', onCancel, { capture: true, passive: true })

    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true })
      document.removeEventListener('touchend', onEnd, { capture: true })
      document.removeEventListener('touchcancel', onCancel, { capture: true })
    }
  }, [isMobile, drawerOpen, setDrawerOpen])

}
