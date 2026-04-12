import { useCallback, useLayoutEffect, useState } from 'react'
import { focusRingButton } from '../theme/focusStyles'
import { useScrollSpy } from '../hooks/useScrollSpy'

const SECTION_SEL = '[data-meta-section]'

/**
 * Right rail for metadata tab — mirrors DocOutline for section blocks.
 */
export default function MetaOutline({ scrollContainerRef, metaRootRef, scanKey, prefersReducedMotion }) {
  const [items, setItems] = useState(() => [])
  const [railOpen, setRailOpen] = useState(false)

  useLayoutEffect(() => {
    const root = metaRootRef?.current
    if (!root) {
      setItems([])
      return
    }
    const nodes = root.querySelectorAll(SECTION_SEL)
    const next = []
    nodes.forEach((el) => {
      const id = el.id
      if (!id) return
      const text = el.getAttribute('data-meta-title')?.trim() || (el.textContent || '').trim().slice(0, 80)
      if (!text) return
      next.push({ id, depth: 1, text })
    })
    setItems(next)
  }, [metaRootRef, scanKey])

  const { activeId } = useScrollSpy({ items, scrollContainerRef })

  const scrollToId = useCallback(
    (id) => {
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    },
    [prefersReducedMotion]
  )

  const transitionClass = prefersReducedMotion ? '' : 'transition-[width] duration-200 ease-out'

  if (items.length === 0) {
    return null
  }

  return (
    <aside
      className={`hidden shrink-0 flex-col border-l border-outline/35 bg-surface-container/40 py-2.5 lg:flex ${transitionClass} ${
        railOpen ? 'w-[12.5rem]' : 'w-10'
      }`}
      onMouseEnter={() => setRailOpen(true)}
      onMouseLeave={() => setRailOpen(false)}
      onFocusCapture={() => setRailOpen(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setRailOpen(false)
      }}
    >
      <nav
        className="flex min-h-0 max-h-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-1 [-webkit-overflow-scrolling:touch]"
        aria-label="Metadata sections"
      >
        <span
          className={`mb-1.5 shrink-0 px-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-on-surface-muted/90 ${
            railOpen ? 'opacity-100' : 'sr-only'
          }`}
        >
          Sections
        </span>
        <ul className="flex flex-col gap-0.5" role="list">
          {items.map((item) => {
            const isActive = activeId === item.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={item.text}
                  aria-current={isActive ? 'location' : undefined}
                  className={`flex w-full min-w-0 items-start gap-2 rounded-md py-1 text-left ${focusRingButton} ${
                    isActive ? 'bg-primary/5' : 'hover:bg-surface-container-high/60'
                  }`}
                  style={{ paddingLeft: 10, paddingRight: 4 }}
                  onClick={() => scrollToId(item.id)}
                >
                  <span
                    className={`mt-0.5 shrink-0 ${
                      isActive ? 'h-3 w-[2px] rounded-full bg-primary' : 'h-2.5 w-px rounded-full bg-on-surface-muted/30'
                    }`}
                    aria-hidden
                  />
                  <span
                    className={`min-w-0 flex-1 overflow-hidden text-left text-[12px] leading-snug tracking-tight ${
                      railOpen ? 'line-clamp-4' : 'sr-only'
                    } ${
                      isActive && railOpen
                        ? 'font-medium text-on-surface'
                        : 'font-normal text-on-surface/85'
                    }`}
                  >
                    {item.text}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
