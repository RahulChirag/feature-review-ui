import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tracks which item is currently in view as the user scrolls a container.
 *
 * @param {{ items: Array<{ id: string }>, scrollContainerRef: React.RefObject, offsetPx?: number }} params
 * @returns {{ activeId: string | null, setActiveId: Function }}
 */
export function useScrollSpy({ items, scrollContainerRef, offsetPx = 88 }) {
  const [activeId, setActiveId] = useState(() => items[0]?.id ?? null)
  const rafRef = useRef(0)

  const updateActive = useCallback(() => {
    const root = scrollContainerRef?.current
    if (!root || items.length === 0) return

    const rootTop = root.getBoundingClientRect().top
    let current = items[0].id

    for (const item of items) {
      const el = document.getElementById(item.id)
      if (!el) continue
      const top = el.getBoundingClientRect().top
      if (top <= rootTop + offsetPx) {
        current = item.id
      }
    }
    setActiveId((prev) => (prev === current ? prev : current))
  }, [scrollContainerRef, items, offsetPx])

  useEffect(() => {
    const root = scrollContainerRef?.current
    if (!root || items.length === 0) return

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        updateActive()
      })
    }

    updateActive()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [scrollContainerRef, items, updateActive])

  // Re-sync when items change (e.g. after feature navigation resets scroll)
  useEffect(() => {
    updateActive()
  }, [items, updateActive])

  return { activeId, setActiveId }
}
