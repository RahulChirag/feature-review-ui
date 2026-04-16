import { useLayoutEffect, useState } from 'react'
import OutlineRail from './OutlineRail'

const SECTION_SEL = '[data-meta-section]'

/**
 * Right rail for metadata tab — mirrors DocOutline for section blocks.
 */
export default function MetaOutline({ scrollContainerRef, metaRootRef, scanKey, prefersReducedMotion }) {
  const [items, setItems] = useState(() => [])

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

  return (
    <OutlineRail
      ariaLabel="Metadata sections"
      headerLabel="Sections"
      items={items}
      prefersReducedMotion={prefersReducedMotion}
      scrollContainerRef={scrollContainerRef}
      resolvePaddingLeft={() => 10}
      resolveLabelClass={() => 'text-[12px] font-normal leading-snug tracking-tight text-on-surface/85'}
    />
  )
}
