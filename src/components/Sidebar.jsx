import FeatureNav from './FeatureNav'

export default function Sidebar({ features, totalCount, activeId, onSelect, query, onQueryChange }) {
  return (
    <aside className="sidebar sidebar--desktop">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <div className="sidebar-title">Feature Reviews</div>
          <div className="sidebar-subtitle">
            {totalCount} feature{totalCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="sidebar-nav">
        <span className="nav-section-label">Features</span>
        <FeatureNav
          features={features}
          totalCount={totalCount}
          activeId={activeId}
          onSelect={onSelect}
          query={query}
          onQueryChange={onQueryChange}
        />
      </div>

      <div className="sidebar-footer">
        <span className="sidebar-footer-text">Drop folders into feature-reviews/ to add more</span>
      </div>
    </aside>
  )
}
