import { useLayoutEffect, useMemo, useState } from 'react'
import OutlineRail from './OutlineRail'

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

/**
 * Notion-style right rail: collapsed ticks; expands on hover / focus-within to show titles.
 */
export default function DocOutline({ scrollContainerRef, markdownRootRef, scanKey, prefersReducedMotion }) {
  const [items, setItems] = useState(() => [])

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
  }, [markdownRootRef, scanKey])

  const minDepth = useMemo(
    () => (items.length ? Math.min(...items.map((item) => item.depth)) : 1),
    [items]
  )

  return (
    <OutlineRail
      ariaLabel="On this page"
      headerLabel="On this page"
      items={items}
      prefersReducedMotion={prefersReducedMotion}
      scrollContainerRef={scrollContainerRef}
      resolvePaddingLeft={({ item, railOpen }) => {
            const rel = Math.max(0, item.depth - minDepth)
            const indentCollapsed = Math.min(rel * 3, 12)
            const indentExpanded = BASE_PAD + rel * INDENT_STEP
            return railOpen ? indentExpanded : 2 + indentCollapsed
      }}
      resolveLabelClass={(depth) => labelClassesForDepth(depth)}
    />
  )
}
