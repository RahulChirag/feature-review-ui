import { formatFeatureName } from '../featureUtils'

const focusSidebar =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border/70 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar'

const focusSheet =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container'

export default function FeatureNav({
  features,
  totalCount,
  activeId,
  onSelect,
  query,
  onQueryChange,
  variant = 'sidebar',
}) {
  const showClear = query.length > 0
  const sheet = variant === 'sheet'
  const focusRing = sheet ? focusSheet : focusSidebar

  return (
    <>
      <div className="relative mb-2 px-1">
        <input
          className={
            sheet
              ? `min-h-11 w-full rounded-lg border border-outline bg-surface-container-high py-2.5 pl-3 pr-10 text-sm text-on-surface placeholder:text-on-surface-muted ${focusRing} motion-safe:transition-colors`
              : `min-h-11 w-full rounded-md border border-sidebar-border bg-sidebar-hover py-2.5 pl-3 pr-10 text-sm text-sidebar-on-active placeholder:text-sidebar-on/80 ${focusRing} motion-safe:transition-colors`
          }
          type="search"
          placeholder="Filter features…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Filter features"
          autoComplete="off"
          spellCheck="false"
        />
        {showClear && (
          <button
            type="button"
            className={
              sheet
                ? `absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-lg leading-none text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface ${focusRing}`
                : `absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-lg leading-none text-sidebar-on hover:bg-sidebar hover:text-sidebar-on-active ${focusRing}`
            }
            onClick={() => onQueryChange('')}
            aria-label="Clear filter"
          >
            ×
          </button>
        )}
      </div>
      <nav className="flex flex-col gap-0.5 pb-2" aria-label="Feature list">
        {totalCount === 0 ? (
          <div
            className={`px-2.5 py-3 text-xs leading-relaxed ${sheet ? 'text-on-surface-muted' : 'text-sidebar-on'}`}
          >
            No features found in feature-reviews/
          </div>
        ) : features.length === 0 ? (
          <div
            className={`px-2.5 py-3 text-xs leading-relaxed ${sheet ? 'text-on-surface-muted' : 'text-sidebar-on'}`}
          >
            No features match your filter
          </div>
        ) : (
          features.map((f) => {
            const active = f.id === activeId
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f.id)}
                className={`flex min-h-11 w-full touch-manipulation items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm font-medium motion-safe:transition-colors ${focusRing} ${
                  sheet
                    ? active
                      ? 'border-l-[3px] border-l-primary bg-primary/10 pl-[7px] text-on-surface'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    : active
                      ? 'border-l-[3px] border-l-sidebar-active-border bg-sidebar-active-bg pl-[7px] text-sidebar-on-active'
                      : 'text-sidebar-on hover:bg-sidebar-hover hover:text-sidebar-on-active'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-primary opacity-100' : sheet ? 'bg-on-surface-variant/50 opacity-60' : 'opacity-40'}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{formatFeatureName(f.meta?.feature ?? f.id)}</span>
                {f.meta && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      sheet
                        ? active
                          ? 'bg-primary/15 text-primary'
                          : 'bg-surface-container-high text-on-surface-variant'
                        : active
                          ? 'bg-sidebar-active-bg text-primary'
                          : 'bg-sidebar text-sidebar-on'
                    }`}
                  >
                    {(f.meta.files_involved?.length ?? 0)}f
                  </span>
                )}
              </button>
            )
          })
        )}
      </nav>
    </>
  )
}
