import FeatureNav from './FeatureNav'
import ThemeToggle from '../theme/ThemeToggle'

export default function Sidebar({ features, totalCount, activeId, onSelect, query, onQueryChange }) {
  return (
    <aside className="hidden min-h-0 w-[280px] shrink-0 flex-col overflow-hidden border-sidebar-border bg-sidebar md:flex md:border-r">
      {/* Brand row — fixed height (64px / 8px grid) */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-purple-900 shadow-md shadow-primary/30">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-tight text-sidebar-on-active">Feature Reviews</div>
          <div className="mt-0.5 text-[11px] text-sidebar-on">
            {totalCount} feature{totalCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-sidebar-border px-3 py-3">
        <ThemeToggle variant="sidebar" className="w-full justify-center" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-1">
        <span className="shrink-0 px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-sidebar-on">
          Features
        </span>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <FeatureNav
            features={features}
            totalCount={totalCount}
            activeId={activeId}
            onSelect={onSelect}
            query={query}
            onQueryChange={onQueryChange}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
        <span className="text-[11px] leading-snug text-sidebar-on">
          Drop folders into feature-reviews/ to add more
        </span>
      </div>
    </aside>
  )
}
