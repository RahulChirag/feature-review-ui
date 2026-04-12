/**
 * App shell — z-index scale: content 0, header 10, bottomNav 40, scrim 100, drawer 110
 * Single scroll owner: main > scrollBody (flex-1 min-h-0 overflow-y-auto)
 */
import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import DocViewer from './components/DocViewer'
import MetaViewer from './components/MetaViewer'
import FeatureNav from './components/FeatureNav'
import ThemeToggle from './theme/ThemeToggle'
import { filterFeatures, formatFeatureName } from './featureUtils'
import { downloadTextFile } from './downloadUtils'

/** Bottom tab bar height (56dp / Material touch target band) */
const MOBILE_NAV_H_PX = 56

const mdModules = import.meta.glob('../feature-reviews/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const metaModules = import.meta.glob('../feature-reviews/**/meta.json', {
  eager: true,
})

function parseGeneratedDate(meta) {
  const raw = meta?.generated_date
  if (raw == null || raw === '') return null
  const t = Date.parse(String(raw))
  return Number.isNaN(t) ? null : t
}

function compareFeaturesByGeneratedDate(a, b) {
  const ta = parseGeneratedDate(a.meta)
  const tb = parseGeneratedDate(b.meta)
  if (ta !== null && tb !== null) {
    if (tb !== ta) return tb - ta
    return a.id.localeCompare(b.id)
  }
  if (ta !== null && tb === null) return -1
  if (ta === null && tb !== null) return 1
  return a.id.localeCompare(b.id)
}

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

  return Object.values(map).sort(compareFeaturesByGeneratedDate)
}

const features = buildFeatures()

const btnFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container motion-safe:transition-shadow'

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

  function handleDownloadMd() {
    if (!feature?.doc) return
    downloadTextFile(`${feature.id}.md`, feature.doc, 'text/markdown;charset=utf-8')
  }

  function handleDownloadMeta() {
    if (!feature?.meta) return
    downloadTextFile(
      `${feature.id}-meta.json`,
      JSON.stringify(feature.meta, null, 2),
      'application/json;charset=utf-8'
    )
  }

  const downloadPill = `inline-flex min-h-10 touch-manipulation items-center justify-center rounded-full border border-outline bg-surface-container px-4 text-xs font-semibold text-on-surface shadow-sm hover:bg-surface-container-high disabled:opacity-40 ${btnFocus}`

  const tabDesktop = (active) =>
    `relative z-10 flex min-h-12 touch-manipulation items-center gap-2 rounded-t-lg px-5 text-sm font-semibold ${btnFocus} ${
      active
        ? 'text-primary after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:rounded-full after:bg-primary'
        : 'text-on-surface-variant hover:text-on-surface'
    }`

  const tabMobile = (active) =>
    `relative flex h-14 min-h-[56px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 border-t-2 py-1 text-[11px] font-semibold leading-tight motion-safe:transition-colors ${btnFocus} ${
      active
        ? 'border-primary bg-primary/10 text-primary [&_svg]:stroke-primary'
        : 'border-transparent text-on-surface-variant'
    }`

  return (
    <div
      className="grid h-[100dvh] min-h-0 w-full grid-cols-1 overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <Sidebar
        features={filteredFeatures}
        totalCount={features.length}
        activeId={activeId}
        onSelect={selectFeature}
        query={featureQuery}
        onQueryChange={setFeatureQuery}
      />

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface md:bg-surface">
        {feature ? (
          <>
            {/* Desktop: title row + tab strip (z-10 sticky header region) */}
            <div className="z-10 hidden shrink-0 flex-col border-b border-outline bg-surface-container md:flex">
              <div className="flex min-h-16 flex-wrap items-start gap-4 px-6 py-4 lg:px-8">
                <div className="min-w-0 flex-1">
                  <h1 className="text-balance text-2xl font-bold tracking-tight text-on-surface lg:text-[1.75rem]">
                    {formatFeatureName(feature.meta?.feature ?? feature.id)}
                  </h1>
                  {feature.meta?.generated_date && (
                    <p className="mt-1.5 text-sm text-on-surface-variant">
                      Generated{' '}
                      <time dateTime={feature.meta.generated_date}>{feature.meta.generated_date}</time>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button type="button" className={downloadPill} onClick={handleDownloadMd} disabled={!feature.doc}>
                    Download .md
                  </button>
                  {feature.meta ? (
                    <button type="button" className={downloadPill} onClick={handleDownloadMeta}>
                      Download meta.json
                    </button>
                  ) : (
                    <span className="self-center px-2 text-xs text-on-surface-muted">No meta.json</span>
                  )}
                </div>
              </div>
              <nav
                className="flex gap-1 border-t border-outline/70 px-4 lg:px-6"
                aria-label="Documentation and metadata"
              >
                <button type="button" className={tabDesktop(tab === 'doc')} onClick={() => setTab('doc')}>
                  <DocIcon />
                  Documentation
                </button>
                <button type="button" className={tabDesktop(tab === 'meta')} onClick={() => setTab('meta')}>
                  <MetaIcon />
                  Metadata
                  {feature.meta && (
                    <span className="rounded-full bg-outline-variant px-2 py-0.5 text-[11px] font-bold tabular-nums text-on-surface-variant dark:bg-surface-container-high">
                      {countMetaItems(feature.meta)}
                    </span>
                  )}
                </button>
              </nav>
            </div>

            {/* Mobile: single 56dp row — menu, title, icon downloads, compact theme */}
            <div className="z-10 flex h-14 min-h-[56px] shrink-0 items-center gap-2 border-b border-outline bg-surface-container px-3 md:hidden">
              <button
                type="button"
                className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-outline bg-surface-container-high text-on-surface shadow-sm ${btnFocus}`}
                onClick={() => setDrawerOpen(true)}
                aria-expanded={drawerOpen}
                aria-controls="feature-drawer"
                aria-label="Open feature list"
              >
                <MenuIcon />
              </button>
              <h1 className="min-w-0 flex-1 truncate text-base font-bold leading-tight text-on-surface">
                {formatFeatureName(feature.meta?.feature ?? feature.id)}
              </h1>
              <div
                className="flex max-w-[min(11.5rem,46vw)] shrink-0 snap-x snap-mandatory items-center gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden sm:max-w-none"
                aria-label="Downloads and theme"
              >
                <button
                  type="button"
                  className={`flex h-10 w-10 shrink-0 snap-start touch-manipulation items-center justify-center rounded-full border border-outline bg-surface-container-high text-on-surface shadow-sm disabled:opacity-40 ${btnFocus}`}
                  onClick={handleDownloadMd}
                  disabled={!feature.doc}
                  title="Download Markdown"
                >
                  <span className="sr-only">Download Markdown</span>
                  <DocIcon />
                </button>
                <button
                  type="button"
                  className={`flex h-10 w-10 shrink-0 snap-start touch-manipulation items-center justify-center rounded-full border border-outline bg-surface-container-high text-on-surface shadow-sm disabled:opacity-40 ${btnFocus}`}
                  onClick={handleDownloadMeta}
                  disabled={!feature.meta}
                  title={feature.meta ? 'Download meta.json' : 'No meta.json'}
                >
                  <span className="sr-only">Download meta.json</span>
                  <JsonDownloadIcon />
                </button>
                <ThemeToggle variant="compact" className="shrink-0 snap-start" />
              </div>
            </div>

            {/* Single scroll body — full width of main column */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth"
              style={
                isMobile
                  ? { paddingBottom: `calc(${MOBILE_NAV_H_PX}px + env(safe-area-inset-bottom, 0px))` }
                  : undefined
              }
            >
              <div className="min-w-0 w-full">
                {tab === 'doc' ? <DocViewer content={feature.doc} /> : <MetaViewer meta={feature.meta} />}
              </div>
            </div>

            {/* Bottom nav: z-40 */}
            {isMobile && (
              <nav
                className="fixed bottom-0 left-0 right-0 z-40 flex h-14 border-t border-outline bg-surface-container/95 shadow-[var(--shadow-nav)] backdrop-blur-md supports-[backdrop-filter]:bg-surface-container/90"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                aria-label="Documentation and metadata"
              >
                <button type="button" className={tabMobile(tab === 'doc')} onClick={() => setTab('doc')}>
                  <DocIcon />
                  <span>Docs</span>
                </button>
                <button type="button" className={tabMobile(tab === 'meta')} onClick={() => setTab('meta')}>
                  <MetaIcon />
                  <span>Meta</span>
                  {feature.meta && (
                    <span className="rounded-full bg-outline-variant px-1.5 text-[10px] font-bold tabular-nums">
                      {countMetaItems(feature.meta)}
                    </span>
                  )}
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <EmptyIcon />
            <div>
              <p className="text-base font-medium text-on-surface">No feature selected</p>
              <p className="mt-1 text-sm text-on-surface-muted">Choose a feature from the sidebar</p>
            </div>
          </div>
        )}
      </main>

      {isMobile && drawerOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] border-0 bg-scrim backdrop-blur-sm motion-safe:transition-opacity"
            aria-label="Close feature list"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            id="feature-drawer"
            className="fixed inset-x-0 bottom-0 top-0 z-[110] m-4 flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar shadow-2xl"
            style={{ marginTop: 'max(1rem, env(safe-area-inset-top))' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
              <span id="drawer-title" className="text-lg font-semibold text-sidebar-on-active">
                Features
              </span>
              <button
                type="button"
                className={`flex h-11 w-11 items-center justify-center rounded-full text-sidebar-on hover:bg-sidebar-hover ${btnFocus}`}
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                <span className="text-2xl leading-none" aria-hidden>
                  ×
                </span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function JsonDownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9V6a2 2 0 0 1 2-2h2M4 15v3a2 2 0 0 0 2 2h2M20 9V6a2 2 0 0 0-2-2h-2M20 15v3a2 2 0 0 1-2 2h-2" />
      <line x1="9" y1="9" x2="9" y2="15" />
      <line x1="15" y1="9" x2="15" y2="15" />
    </svg>
  )
}

function MetaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function EmptyIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-on-surface-muted opacity-40" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
