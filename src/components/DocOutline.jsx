import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { focusRingButton } from '../theme/focusStyles'

const HEADING_SEL = 'h1, h2, h3, h4, h5, h6'

function depthFromTag(tag) {
  const n = Number.parseInt(tag.slice(1), 10)
  return Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 1
}

/** Indent step (px) per outline level after normalizing to shallowest heading in doc */
const INDENT_STEP = 14
const BASE_PAD = 6

function labelClassesForDepth(depth) {
  const base = 'text-[12px] leading-snug tracking-tight'
  if (depth <= 1) return `${base} font-semibold text-on-surface/95`
  if (depth === 2) return `${base} font-medium text-on-surface/90`
  if (depth === 3) return `${base} font-medium text-on-surface/80`
  return `${base} font-normal text-on-surface-variant`
}

function markerDot(isActive) {
  if (isActive) return 'mt-0.5 h-3 w-[2px] shrink-0 rounded-full bg-primary'
  return 'mt-0.5 h-2.5 w-px shrink-0 rounded-full bg-on-surface-muted/30'
}

/**
 * Notion-style right rail: collapsed ticks; expands on hover / focus-within to show titles.
 */
export default function DocOutline({ scrollContainerRef, markdownRootRef, scanKey, prefersReducedMotion }) {
  const [items, setItems] = useState(() => [])
  const [activeId, setActiveId] = useState(null)
  const [railOpen, setRailOpen] = useState(false)
  const rafScroll = useRef(0)

  useLayoutEffect(() => {
    const root = markdownRootRef?.current
    if (!root) {
      setItems([])
      return
    }
    const nodes = root.querySelectorAll(HEADING_SEL)
    const next = []
    nodes.forEach((el) => {
      const id = el.id
      if (!id) return
      const text = (el.textContent || '').trim()
      if (!text) return
      next.push({
        id,
        depth: depthFromTag(el.tagName.toLowerCase()),
        text,
      })
    })
    setItems(next)
    setActiveId(next[0]?.id ?? null)
  }, [markdownRootRef, scanKey])

  const updateActiveFromScroll = useCallback(() => {
    const root = scrollContainerRef?.current
    if (!root || items.length === 0) return

    const rootTop = root.getBoundingClientRect().top
    const offset = 88
    let current = items[0].id

    for (const item of items) {
      const el = document.getElementById(item.id)
      if (!el) continue
      const top = el.getBoundingClientRect().top
      if (top <= rootTop + offset) {
        current = item.id
      }
    }
    setActiveId((prev) => (prev === current ? prev : current))
  }, [scrollContainerRef, items])

  useEffect(() => {
    const root = scrollContainerRef?.current
    if (!root || items.length === 0) return

    const onScroll = () => {
      if (rafScroll.current) cancelAnimationFrame(rafScroll.current)
      rafScroll.current = requestAnimationFrame(() => {
        rafScroll.current = 0
        updateActiveFromScroll()
      })
    }

    updateActiveFromScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (rafScroll.current) cancelAnimationFrame(rafScroll.current)
    }
  }, [scrollContainerRef, items, updateActiveFromScroll])

  useEffect(() => {
    updateActiveFromScroll()
  }, [items, updateActiveFromScroll])

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

  const minDepth = items.length ? Math.min(...items.map((i) => i.depth)) : 1

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
        aria-label="On this page"
      >
        <span
          className={`mb-1.5 shrink-0 px-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-on-surface-muted/90 ${
            railOpen ? 'opacity-100' : 'sr-only'
          }`}
        >
          On this page
        </span>
        <ul className="flex flex-col gap-0.5" role="list">
          {items.map((item) => {
            const isActive = activeId === item.id
            const rel = Math.max(0, item.depth - minDepth)
            const indentCollapsed = Math.min(rel * 3, 12)
            const indentExpanded = BASE_PAD + rel * INDENT_STEP
            const padLeft = railOpen ? indentExpanded : 2 + indentCollapsed
            const labelCls = labelClassesForDepth(item.depth)
            return (
              <li key={item.id} className="relative">
                <button
                  type="button"
                  aria-label={item.text}
                  aria-current={isActive ? 'location' : undefined}
                  className={`flex w-full min-w-0 items-start gap-2 rounded-md py-1 text-left ${focusRingButton} ${
                    isActive ? 'bg-primary/5' : 'hover:bg-surface-container-high/60'
                  }`}
                  style={{ paddingLeft: `${padLeft}px`, paddingRight: '4px' }}
                  onClick={() => scrollToId(item.id)}
                >
                  <span className={`shrink-0 self-start ${markerDot(isActive)}`} aria-hidden />
                  <span
                    className={`min-w-0 flex-1 overflow-hidden text-left ${labelCls} ${
                      railOpen ? 'line-clamp-4' : 'sr-only'
                    } ${isActive && railOpen ? 'text-on-surface font-medium' : ''}`}
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
