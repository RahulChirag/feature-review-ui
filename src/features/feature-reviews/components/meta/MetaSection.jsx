import { useState } from 'react'
import { chromeCountBadge } from '../../../../theme/chromeStyles'
import { focusRingButton } from '../../../../theme/focusStyles'

export default function MetaSection({
  children,
  collapsible = false,
  count,
  icon,
  slug,
  title,
}) {
  const [open, setOpen] = useState(true)

  const outlineProps = slug
    ? {
        id: `meta-section-${slug}`,
        'data-meta-section': true,
        'data-meta-title': title,
      }
    : {}

  if (collapsible) {
    return (
      <div
        {...outlineProps}
        className={`overflow-hidden rounded-lg border border-outline bg-surface-container ${slug ? 'scroll-mt-6' : ''}`}
      >
        <button
          type="button"
          className={`flex w-full items-center justify-between border-b border-outline bg-surface-container-high px-4 py-3 text-left hover:bg-outline-variant/30 md:px-5 ${focusRingButton}`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <span aria-hidden>{icon}</span>
            {title}
            <span className={chromeCountBadge}>{count}</span>
          </div>
          <span
            className="inline-block text-on-surface-muted motion-safe:transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {open && <div>{children}</div>}
      </div>
    )
  }

  return (
    <div
      {...outlineProps}
      className={`overflow-hidden rounded-lg border border-outline bg-surface-container ${slug ? 'scroll-mt-6' : ''}`}
    >
      <div className="border-b border-outline bg-surface-container-high px-4 py-3 md:px-5">
        <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <span aria-hidden>{icon}</span>
          {title}
          <span className={chromeCountBadge}>{count}</span>
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}
