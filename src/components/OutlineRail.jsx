import { useCallback, useState } from 'react'
import { useScrollSpy } from '../hooks/useScrollSpy'
import { focusRingButton } from '../theme/focusStyles'

function defaultLabelClass(depth) {
  const base = 'text-[12px] leading-snug tracking-tight'
  if (depth <= 1) return `${base} font-semibold text-on-surface/95`
  if (depth === 2) return `${base} font-medium text-on-surface/90`
  if (depth === 3) return `${base} font-medium text-on-surface/80`
  return `${base} font-normal text-on-surface-variant`
}

function defaultMarkerClass(isActive) {
  if (isActive) return 'mt-0.5 h-3 w-[2px] shrink-0 rounded-full bg-primary'
  return 'mt-0.5 h-2.5 w-px shrink-0 rounded-full bg-on-surface-muted/30'
}

export default function OutlineRail({
  ariaLabel,
  collapsedPadding = 2,
  expandedWidth = 'w-[12.5rem]',
  headerLabel,
  items,
  prefersReducedMotion,
  resolveLabelClass = defaultLabelClass,
  resolveMarkerClass = defaultMarkerClass,
  resolvePaddingLeft,
  scrollContainerRef,
}) {
  const [railOpen, setRailOpen] = useState(false)
  const { activeId } = useScrollSpy({ items, scrollContainerRef })

  const scrollToId = useCallback(
    (id) => {
      const element = document.getElementById(id)
      if (!element) return
      element.scrollIntoView({
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
        railOpen ? expandedWidth : 'w-10'
      }`}
      onMouseEnter={() => setRailOpen(true)}
      onMouseLeave={() => setRailOpen(false)}
      onFocusCapture={() => setRailOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setRailOpen(false)
      }}
    >
      <nav
        className="flex min-h-0 max-h-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-1 [-webkit-overflow-scrolling:touch]"
        aria-label={ariaLabel}
      >
        <span
          className={`mb-1.5 shrink-0 px-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-on-surface-muted/90 ${
            railOpen ? 'opacity-100' : 'sr-only'
          }`}
        >
          {headerLabel}
        </span>
        <ul className="flex flex-col gap-0.5" role="list">
          {items.map((item) => {
            const isActive = activeId === item.id
            const paddingLeft = resolvePaddingLeft
              ? resolvePaddingLeft({ item, railOpen })
              : railOpen
                ? 10
                : collapsedPadding

            return (
              <li key={item.id} className="relative">
                <button
                  type="button"
                  aria-label={item.text}
                  aria-current={isActive ? 'location' : undefined}
                  className={`flex w-full min-w-0 items-start gap-2 rounded-md py-1 text-left ${focusRingButton} ${
                    isActive ? 'bg-primary/5' : 'hover:bg-surface-container-high/60'
                  }`}
                  style={{ paddingLeft, paddingRight: 4 }}
                  onClick={() => scrollToId(item.id)}
                >
                  <span className={`shrink-0 self-start ${resolveMarkerClass(isActive)}`} aria-hidden />
                  <span
                    className={`min-w-0 flex-1 overflow-hidden text-left ${resolveLabelClass(item.depth)} ${
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
