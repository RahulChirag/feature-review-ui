import { formatFeatureName } from '../featureUtils'

/**
 * @param {object} props
 * @param {Array<{ id: string, meta?: object }>} props.features — filtered list to render
 * @param {number} props.totalCount — total features before filter (for empty states)
 * @param {string|null} props.activeId
 * @param {(id: string) => void} props.onSelect
 * @param {string} props.query
 * @param {(q: string) => void} props.onQueryChange
 */
export default function FeatureNav({ features, totalCount, activeId, onSelect, query, onQueryChange }) {
  const showClear = query.length > 0

  return (
    <>
      <div className="feature-nav-search">
        <input
          className="feature-nav-search-input"
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
            className="feature-nav-search-clear"
            onClick={() => onQueryChange('')}
            aria-label="Clear filter"
          >
            ×
          </button>
        )}
      </div>
      <nav className="feature-nav-list" aria-label="Feature list">
        {totalCount === 0 ? (
          <div className="nav-empty">No features found in feature-reviews/</div>
        ) : features.length === 0 ? (
          <div className="nav-empty">No features match your filter</div>
        ) : (
          features.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`nav-item${f.id === activeId ? ' active' : ''}`}
              onClick={() => onSelect(f.id)}
            >
              <span className="nav-dot" />
              <span className="nav-label-text">{formatFeatureName(f.meta?.feature ?? f.id)}</span>
              {f.meta && (
                <span className="nav-count">{(f.meta.files_involved?.length ?? 0)}f</span>
              )}
            </button>
          ))
        )}
      </nav>
    </>
  )
}
