export default function Sidebar({ features, activeId, onSelect }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <div className="sidebar-title">Feature Reviews</div>
          <div className="sidebar-subtitle">{features.length} feature{features.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-label">Features</span>
        {features.length === 0 ? (
          <div className="nav-empty">No features found in feature-reviews/</div>
        ) : (
          features.map((f) => (
            <button
              key={f.id}
              className={`nav-item${f.id === activeId ? ' active' : ''}`}
              onClick={() => onSelect(f.id)}
            >
              <span className="nav-dot" />
              <span className="nav-label-text">
                {formatName(f.meta?.feature ?? f.id)}
              </span>
              {f.meta && (
                <span className="nav-count">
                  {(f.meta.files_involved?.length ?? 0)}f
                </span>
              )}
            </button>
          ))
        )}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer-text">Drop folders into feature-reviews/ to add more</span>
      </div>
    </aside>
  )
}

function formatName(str) {
  return str
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
