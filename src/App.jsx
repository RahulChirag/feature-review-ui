import { useState } from 'react'
import Sidebar from './components/Sidebar'
import DocViewer from './components/DocViewer'
import MetaViewer from './components/MetaViewer'

// Vite glob imports — picks up any .md and meta.json added to feature-reviews/
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

export default function App() {
  const [activeId, setActiveId] = useState(features[0]?.id ?? null)
  const [tab, setTab] = useState('doc')

  const feature = features.find((f) => f.id === activeId)

  function selectFeature(id) {
    setActiveId(id)
    setTab('doc')
  }

  return (
    <div className="app-shell">
      <Sidebar features={features} activeId={activeId} onSelect={selectFeature} />

      <div className="main-content">
        {feature ? (
          <>
            <header className="feature-header">
              <div className="feature-meta-row">
                <h1 className="feature-title">
                  {formatName(feature.meta?.feature ?? feature.id)}
                </h1>
                {feature.meta?.generated_date && (
                  <span className="feature-date-badge">
                    Generated {feature.meta.generated_date}
                  </span>
                )}
              </div>
              <nav className="tab-bar">
                <button
                  className={`tab-btn${tab === 'doc' ? ' active' : ''}`}
                  onClick={() => setTab('doc')}
                >
                  <DocIcon />
                  Documentation
                </button>
                <button
                  className={`tab-btn${tab === 'meta' ? ' active' : ''}`}
                  onClick={() => setTab('meta')}
                >
                  <MetaIcon />
                  Metadata
                  {feature.meta && (
                    <span className="tab-badge">
                      {countMetaItems(feature.meta)}
                    </span>
                  )}
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
          </>
        ) : (
          <div className="empty-state">
            <EmptyIcon />
            <p>Select a feature from the sidebar to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatName(str) {
  return str
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function EmptyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
