import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import DocViewer from './components/DocViewer'
import MetaViewer from './components/MetaViewer'
import FeatureNav from './components/FeatureNav'
import { filterFeatures, formatFeatureName } from './featureUtils'

const mdModules = import.meta.glob('../feature-reviews/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const metaModules = import.meta.glob('../feature-reviews/**/meta.json', {
  eager: true,
})

function buildFeatures() {
  const map = {}

  Object.entries(mdModules).forEach(([path, content]) => {
    const folder = path.split('/').at(-2)
    if (!map[folder]) map[folder] = { id: folder }
    map[folder].doc = content
  })

  Object.entries(metaModules).forEach(([path, mod]) => {
    const folder = path.split('/').at(-2)
    if (!map[folder]) map[folder] = { id: folder }
    map[folder].meta = mod.default ?? mod
  })

  return Object.values(map).sort((a, b) =>
    (a.meta?.feature ?? a.id).localeCompare(b.meta?.feature ?? b.id)
  )
}

const features = buildFeatures()

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const m = window.matchMedia(query)
    const onChange = () => setMatches(m.matches)
    m.addEventListener('change', onChange)
    setMatches(m.matches)
    return () => m.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export default function App() {
  const [activeId, setActiveId] = useState(features[0]?.id ?? null)
  const [tab, setTab] = useState('doc')
  const [featureQuery, setFeatureQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isMobile = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false)
  }, [isMobile])

  useEffect(() => {
    if (!drawerOpen || !isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawerOpen, isMobile])

  const filteredFeatures = useMemo(() => filterFeatures(features, featureQuery), [featureQuery])

  const feature = features.find((f) => f.id === activeId)

  function selectFeature(id) {
    setActiveId(id)
    setTab('doc')
    setDrawerOpen(false)
  }

  return (
    <div className={`app-shell${feature ? ' app-shell--has-feature' : ''}`}>
      <Sidebar
        features={filteredFeatures}
        totalCount={features.length}
        activeId={activeId}
        onSelect={selectFeature}
        query={featureQuery}
        onQueryChange={setFeatureQuery}
      />

      <div className="main-content">
        {feature ? (
          <>
            <header className="feature-header">
              {isMobile ? (
                <div className="mobile-feature-toolbar">
                  <button
                    type="button"
                    className="mobile-open-features-btn"
                    onClick={() => setDrawerOpen(true)}
                    aria-expanded={drawerOpen}
                    aria-controls="feature-drawer"
                  >
                    <MenuIcon />
                    Features
                  </button>
                  <div className="mobile-feature-heading">
                    <h1 className="feature-title feature-title--toolbar">
                      {formatFeatureName(feature.meta?.feature ?? feature.id)}
                    </h1>
                    {feature.meta?.generated_date && (
                      <span className="feature-date-badge feature-date-badge--toolbar">
                        Generated {feature.meta.generated_date}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="feature-meta-row">
                  <h1 className="feature-title">{formatFeatureName(feature.meta?.feature ?? feature.id)}</h1>
                  {feature.meta?.generated_date && (
                    <span className="feature-date-badge">Generated {feature.meta.generated_date}</span>
                  )}
                </div>
              )}
              <nav className="tab-bar tab-bar--header" aria-label="Documentation and metadata">
                <button
                  type="button"
                  className={`tab-btn${tab === 'doc' ? ' active' : ''}`}
                  onClick={() => setTab('doc')}
                >
                  <DocIcon />
                  Documentation
                </button>
                <button
                  type="button"
                  className={`tab-btn${tab === 'meta' ? ' active' : ''}`}
                  onClick={() => setTab('meta')}
                >
                  <MetaIcon />
                  Metadata
                  {feature.meta && <span className="tab-badge">{countMetaItems(feature.meta)}</span>}
                </button>
              </nav>
            </header>

            <div className="tab-content">
              {tab === 'doc' ? (
                <DocViewer content={feature.doc} />
              ) : (
                <MetaViewer meta={feature.meta} />
              )}
            </div>

            {isMobile && (
              <nav className="mobile-tab-bar" aria-label="Documentation and metadata">
                <button
                  type="button"
                  className={`mobile-tab-btn${tab === 'doc' ? ' active' : ''}`}
                  onClick={() => setTab('doc')}
                >
                  <DocIcon />
                  <span>Docs</span>
                </button>
                <button
                  type="button"
                  className={`mobile-tab-btn${tab === 'meta' ? ' active' : ''}`}
                  onClick={() => setTab('meta')}
                >
                  <MetaIcon />
                  <span>Metadata</span>
                  {feature.meta && <span className="tab-badge">{countMetaItems(feature.meta)}</span>}
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="empty-state">
            <EmptyIcon />
            <p>Select a feature from the sidebar to get started</p>
          </div>
        )}
      </div>

      {isMobile && drawerOpen && (
        <>
          <button
            type="button"
            className="feature-drawer-backdrop"
            aria-label="Close feature list"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            id="feature-drawer"
            className="feature-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a feature"
          >
            <div className="feature-drawer-top">
              <span className="feature-drawer-title">Features</span>
              <button
                type="button"
                className="feature-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="feature-drawer-body">
              <FeatureNav
                features={filteredFeatures}
                totalCount={features.length}
                activeId={activeId}
                onSelect={selectFeature}
                query={featureQuery}
                onQueryChange={setFeatureQuery}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function countMetaItems(meta) {
  return (
    (meta.files_involved?.length ?? 0) +
    (meta.entry_points?.length ?? 0) +
    (meta.apis_used?.length ?? 0) +
    (meta.db_operations?.length ?? 0) +
    (meta.functions_traced?.length ?? 0)
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function MetaIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function EmptyIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: 0.3 }}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
