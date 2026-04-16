import MetaSection from './MetaSection'
import { parseEntryPoint } from './metaParsers'

export default function EntryPointsSection({ items }) {
  if (items.length === 0) return null

  return (
    <MetaSection title="Entry Points" icon="🚀" count={items.length} slug="entry-points">
      {items.map((raw, index) => {
        const parsed = parseEntryPoint(raw)

        if (!parsed.structured) {
          return (
            <div
              key={`${raw}-${index}`}
              className="min-w-0 border-b border-outline-variant px-4 py-3 text-sm text-on-surface-variant last:border-b-0 md:px-5"
            >
              {parsed.raw}
            </div>
          )
        }

        return (
          <div
            key={`${raw}-${index}`}
            className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0 md:px-5"
          >
            <code className="max-w-full break-all border border-outline bg-code-bg px-1.5 py-0.5 font-mono text-[12px] font-bold text-on-surface">
              {parsed.fileName}
            </code>
            <span className="text-on-surface-muted">→</span>
            <code className="min-w-0 max-w-full flex-1 break-words font-mono text-[13px] font-semibold text-primary">
              {parsed.methodPart}
            </code>
            {parsed.descPart && (
              <span className="w-full border border-outline-variant bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-muted sm:w-auto">
                {parsed.descPart}
              </span>
            )}
          </div>
        )
      })}
    </MetaSection>
  )
}
