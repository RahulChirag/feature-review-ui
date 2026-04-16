import MetaSection from './MetaSection'
import { parseDbOperation } from './metaParsers'

export default function DatabaseOperationsSection({ items }) {
  if (items.length === 0) return null

  return (
    <MetaSection
      title="Database Operations"
      icon="🗄️"
      count={items.length}
      collapsible
      slug="database-operations"
    >
      {items.map((raw, index) => {
        const parsed = parseDbOperation(raw)

        return (
          <div
            key={`${raw}-${index}`}
            className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0 md:px-5"
          >
            {parsed.model && (
              <span className="shrink-0 border border-outline bg-primary/12 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                {parsed.model}
              </span>
            )}
            {parsed.ops.length > 0 && (
              <span className="shrink-0 border border-outline bg-surface-container-high px-1.5 py-0.5 font-mono text-xs font-semibold text-on-surface-variant">
                {parsed.ops.join(' ')}
              </span>
            )}
            {parsed.fileName && (
              <span className="min-w-0 break-all font-mono text-xs text-on-surface-muted">
                {parsed.fileName}
              </span>
            )}
          </div>
        )
      })}
    </MetaSection>
  )
}
