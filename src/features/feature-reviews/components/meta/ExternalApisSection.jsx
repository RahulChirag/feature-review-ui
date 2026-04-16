import MetaSection from './MetaSection'
import { parseApi } from './metaParsers'

const METHOD_SAFE =
  'border border-outline bg-surface-container-high px-1.5 py-0.5 text-on-surface'
const METHOD_WRITE = 'border border-outline bg-primary/12 px-1.5 py-0.5 text-primary'
const METHOD_DELETE =
  'border border-outline bg-primary-container/90 px-1.5 py-0.5 text-on-primary-container'

const METHOD_BADGE = {
  GET: METHOD_SAFE,
  HEAD: METHOD_SAFE,
  POST: METHOD_WRITE,
  PUT: METHOD_WRITE,
  PATCH: METHOD_WRITE,
  DELETE: METHOD_DELETE,
}

export default function ExternalApisSection({ items }) {
  if (items.length === 0) return null

  return (
    <MetaSection
      title="External APIs"
      icon="🔌"
      count={items.length}
      collapsible
      slug="external-apis"
    >
      {items.map((raw, index) => {
        const parsed = parseApi(raw)
        const badgeClass = METHOD_BADGE[parsed.method] ?? METHOD_SAFE

        return (
          <div
            key={`${raw}-${index}`}
            className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0 md:px-5"
          >
            <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[11px] font-extrabold ${badgeClass}`}>
              {parsed.method}
            </span>
            <code className="min-w-0 max-w-full flex-1 break-all font-mono text-[13px] text-on-surface">
              {parsed.path}
            </code>
            {parsed.desc && (
              <span className="w-full text-xs text-on-surface-muted sm:w-auto">{parsed.desc}</span>
            )}
          </div>
        )
      })}
    </MetaSection>
  )
}
