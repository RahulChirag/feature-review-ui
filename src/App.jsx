/**
 * App shell — z-index scale: content 0, header 10, bottomNav 40, scrim 100, drawer 110
 * Docs/Meta: two stacked scroll panels (absolute inset-0) so each tab keeps its own scrollTop.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Sidebar from './components/Sidebar'
import DocViewer from './components/DocViewer'
import DocOutline from './components/DocOutline'
import MetaViewer from './components/MetaViewer'
import MetaOutline from './components/MetaOutline'
import FeatureNavShell from './components/FeatureNavShell'
import {
  filterFeatures,
  formatFeatureName,
  formatGeneratedDateForDisplay,
  parseGeneratedDate,
} from './featureUtils'
import { downloadTextFile } from './downloadUtils'
import {
  chromeCountBadge,
  chromeDownloadPill,
  chromeIconActionMd,
  chromeIconActionSm,
  chromeMetadata,
  chromeMetadataStrip,
  chromeMutedHint,
} from './theme/chromeStyles'
import { useMobileDrawerSwipe } from './hooks/useMobileDrawerSwipe'
import {
  hoverChrome,
  tapScale,
  transitionContentEnter,
  transitionReducedOpacity,
  transitionDrawerSlide,
  transitionScrimFade,
  transitionTitleEnter,
} from './theme/motionTokens'

const DESKTOP_SIDEBAR_STORAGE_KEY = 'feature-review-ui.desktopSidebarOpen'

function readStoredDesktopSidebarOpen() {
  if (typeof window === 'undefined') return true
  try {
    const v = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY)
    if (v === null) return true
    return v === 'true'
  } catch {
    return true
  }
}
import { focusRingButton, focusRingOnScrim } from './theme/focusStyles'

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
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(readStoredDesktopSidebarOpen)

  const docScrollRef = useRef(null)
  const metaScrollRef = useRef(null)
  const docMarkdownRootRef = useRef(null)
  const metaRootRef = useRef(null)

  const isMobile = useMediaQuery('(max-width: 768px)')
  const prefersReducedMotion = useReducedMotion()

  useMobileDrawerSwipe({
    isMobile,
    drawerOpen,
    setDrawerOpen,
  })

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false)
  }, [isMobile])

  useEffect(() => {
    try {
      window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, String(desktopSidebarOpen))
    } catch {
      /* ignore quota / private mode */
    }
  }, [desktopSidebarOpen])

  useEffect(() => {
    if (!drawerOpen || !isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawerOpen, isMobile])

  useEffect(() => {
    if (!activeId) return
    const d = docScrollRef.current
    const m = metaScrollRef.current
    if (d) d.scrollTop = 0
    if (m) m.scrollTop = 0
  }, [activeId])

  const filteredFeatures = useMemo(() => filterFeatures(features, featureQuery), [featureQuery])

  const feature = features.find((f) => f.id === activeId)

  const generatedDisplay = useMemo(
    () => formatGeneratedDateForDisplay(feature?.meta?.generated_date),
    [feature?.meta?.generated_date]
  )

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

  const tabDesktop = (active) =>
    `relative z-10 flex min-h-12 touch-manipulation items-center gap-2 rounded-t-lg px-5 text-sm font-semibold ${focusRingButton} ${
      active
        ? 'text-primary after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:rounded-full after:bg-primary'
        : 'text-on-surface-variant hover:text-on-surface'
    }`

  const tabMobile = (active) =>
    `relative flex h-14 min-h-[56px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 border-t-2 py-1 text-[11px] font-semibold leading-tight motion-safe:transition-colors ${focusRingButton} ${
      active
        ? 'border-primary bg-primary/10 text-primary [&_svg]:stroke-primary'
        : 'border-transparent text-on-surface-variant'
    }`

  return (
    <div className="grid h-[100dvh] min-h-0 w-full grid-cols-1 overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:grid-cols-[auto_minmax(0,1fr)]">
      <Sidebar
        open={desktopSidebarOpen}
        features={filteredFeatures}
        totalCount={features.length}
        activeId={activeId}
        onSelect={selectFeature}
        query={featureQuery}
        onQueryChange={setFeatureQuery}
      />

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface touch-manipulation md:bg-surface">
        {feature ? (
          <>
            {/* Desktop: title row + tab strip (z-10 sticky header region) */}
            <div className="z-10 hidden shrink-0 flex-col border-b border-outline bg-surface-container md:flex">
              <div className="flex min-h-16 flex-wrap items-start gap-3 px-6 py-4 lg:gap-4 lg:px-8">
                <motion.button
                  type="button"
                  className={`inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-outline bg-surface-container-high text-on-surface hover:bg-surface-container ${focusRingButton}`}
                  onClick={() => setDesktopSidebarOpen((v) => !v)}
                  aria-controls="feature-sidebar"
                  aria-expanded={desktopSidebarOpen}
                  title={desktopSidebarOpen ? 'Hide feature list' : 'Show feature list'}
                  whileHover={!prefersReducedMotion ? hoverChrome : undefined}
                  whileTap={tapScale(!!prefersReducedMotion)}
                >
                  <span className="sr-only">
                    {desktopSidebarOpen ? 'Hide feature list' : 'Show feature list'}
                  </span>
                  {desktopSidebarOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                </motion.button>
                <div className="min-w-0 flex-1">
                  <motion.h1
                    key={activeId}
                    className="text-balance text-2xl font-bold tracking-tight text-on-surface lg:text-[1.75rem]"
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -16, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    transition={prefersReducedMotion ? { duration: 0 } : transitionTitleEnter}
                  >
                    {formatFeatureName(feature.meta?.feature ?? feature.id)}
                  </motion.h1>
                  {feature.meta?.generated_date && generatedDisplay.label && (
                    <p className={chromeMetadata}>
                      Generated{' '}
                      {generatedDisplay.iso ? (
                        <time dateTime={generatedDisplay.iso}>{generatedDisplay.label}</time>
                      ) : (
                        <span>{generatedDisplay.label}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <motion.button
                    type="button"
                    className={chromeDownloadPill}
                    onClick={handleDownloadMd}
                    disabled={!feature.doc}
                    whileHover={!prefersReducedMotion ? hoverChrome : undefined}
                    whileTap={tapScale(!!prefersReducedMotion)}
                  >
                    Download .md
                  </motion.button>
                  {feature.meta ? (
                    <motion.button
                      type="button"
                      className={chromeDownloadPill}
                      onClick={handleDownloadMeta}
                      whileHover={!prefersReducedMotion ? hoverChrome : undefined}
                      whileTap={tapScale(!!prefersReducedMotion)}
                    >
                      Download meta.json
                    </motion.button>
                  ) : (
                    <span className={chromeMutedHint}>No meta.json</span>
                  )}
                </div>
              </div>
              <nav
                className="flex gap-1 border-t border-outline/70 px-4 lg:px-6"
                aria-label="Documentation and metadata"
              >
                <motion.button
                  type="button"
                  className={tabDesktop(tab === 'doc')}
                  onClick={() => setTab('doc')}
                  aria-current={tab === 'doc' ? 'page' : undefined}
                  whileHover={!prefersReducedMotion ? hoverChrome : undefined}
                  whileTap={tapScale(!!prefersReducedMotion)}
                >
                  <DocIcon />
                  Documentation
                </motion.button>
                <motion.button
                  type="button"
                  className={tabDesktop(tab === 'meta')}
                  onClick={() => setTab('meta')}
                  aria-current={tab === 'meta' ? 'page' : undefined}
                  whileHover={!prefersReducedMotion ? hoverChrome : undefined}
                  whileTap={tapScale(!!prefersReducedMotion)}
                >
                  <MetaIcon />
                  Metadata
                  {feature.meta && (
                    <span className={chromeCountBadge}>{countMetaItems(feature.meta)}</span>
                  )}
                </motion.button>
              </nav>
            </div>

            {/* Mobile: header row + optional generated strip (Option B) */}
            <div className="z-10 shrink-0 md:hidden">
              <div className="flex h-14 min-h-[56px] items-center gap-2 border-b border-outline bg-surface-container px-3">
                <motion.button
                  type="button"
                  className={`${chromeIconActionMd} shrink-0`}
                  onClick={() => setDrawerOpen(true)}
                  aria-expanded={drawerOpen}
                  aria-controls="feature-drawer"
                  aria-label="Open feature list"
                  whileTap={tapScale(!!prefersReducedMotion)}
                >
                  <MenuIcon />
                </motion.button>
                <motion.h1
                  key={activeId}
                  className="min-w-0 flex-1 truncate text-base font-bold leading-tight text-on-surface"
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : transitionTitleEnter}
                >
                  {formatFeatureName(feature.meta?.feature ?? feature.id)}
                </motion.h1>
                <div className="flex shrink-0 items-center gap-1" aria-label="Downloads">
                  <motion.button
                    type="button"
                    className={`${chromeIconActionSm} shrink-0`}
                    onClick={handleDownloadMd}
                    disabled={!feature.doc}
                    title="Download Markdown"
                    whileTap={tapScale(!!prefersReducedMotion)}
                  >
                    <span className="sr-only">Download Markdown</span>
                    <DocIcon />
                  </motion.button>
                  <motion.button
                    type="button"
                    className={`${chromeIconActionSm} shrink-0`}
                    onClick={handleDownloadMeta}
                    disabled={!feature.meta}
                    title={feature.meta ? 'Download meta.json' : 'No meta.json'}
                    whileTap={tapScale(!!prefersReducedMotion)}
                  >
                    <span className="sr-only">Download meta.json</span>
                    <JsonDownloadIcon />
                  </motion.button>
                </div>
              </div>
              {feature.meta?.generated_date && generatedDisplay.label && (
                <div className="border-b border-outline bg-surface-container px-3 py-1.5">
                  <p className={chromeMetadataStrip}>
                    Generated{' '}
                    {generatedDisplay.iso ? (
                      <time dateTime={generatedDisplay.iso}>{generatedDisplay.label}</time>
                    ) : (
                      <span>{generatedDisplay.label}</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Stacked scroll panels — instant visibility swap (opacity animation caused overlap/flicker) */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div
                className={`absolute inset-0 flex min-h-0 flex-row overflow-hidden ${
                  tab === 'doc' ? 'z-10' : 'invisible pointer-events-none z-0'
                }`}
                aria-hidden={tab !== 'doc'}
              >
                <div
                  ref={docScrollRef}
                  className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth"
                  style={
                    isMobile
                      ? { paddingBottom: `calc(${MOBILE_NAV_H_PX}px + env(safe-area-inset-bottom, 0px))` }
                      : undefined
                  }
                >
                  <motion.div
                    key={activeId}
                    className="min-w-0 w-full"
                    initial={
                      prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.97, filter: 'blur(8px)' }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    transition={prefersReducedMotion ? { duration: 0 } : transitionContentEnter}
                  >
                    <DocViewer ref={docMarkdownRootRef} content={feature.doc} />
                  </motion.div>
                </div>
                <DocOutline
                  scrollContainerRef={docScrollRef}
                  markdownRootRef={docMarkdownRootRef}
                  scanKey={`${activeId}-${feature.doc?.length ?? 0}`}
                  prefersReducedMotion={!!prefersReducedMotion}
                />
              </div>
              <div
                className={`absolute inset-0 flex min-h-0 flex-row overflow-hidden ${
                  tab === 'meta' ? 'z-10' : 'invisible pointer-events-none z-0'
                }`}
                aria-hidden={tab !== 'meta'}
              >
                <div
                  ref={metaScrollRef}
                  className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth"
                  style={
                    isMobile
                      ? { paddingBottom: `calc(${MOBILE_NAV_H_PX}px + env(safe-area-inset-bottom, 0px))` }
                      : undefined
                  }
                >
                  <motion.div
                    key={activeId}
                    className="min-w-0 w-full"
                    initial={
                      prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.97, filter: 'blur(8px)' }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    transition={prefersReducedMotion ? { duration: 0 } : transitionContentEnter}
                  >
                    <MetaViewer ref={metaRootRef} meta={feature.meta} />
                  </motion.div>
                </div>
                <MetaOutline
                  scrollContainerRef={metaScrollRef}
                  metaRootRef={metaRootRef}
                  scanKey={`${activeId}-meta`}
                  prefersReducedMotion={!!prefersReducedMotion}
                />
              </div>
            </div>

            {/* Bottom nav: z-40 */}
            {isMobile && (
              <nav
                className="fixed bottom-0 left-0 right-0 z-40 flex h-14 border-t border-outline bg-surface-container/95 shadow-[var(--shadow-nav)] backdrop-blur-md supports-[backdrop-filter]:bg-surface-container/90"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                aria-label="Documentation and metadata"
              >
                <motion.button
                  type="button"
                  className={tabMobile(tab === 'doc')}
                  onClick={() => setTab('doc')}
                  aria-current={tab === 'doc' ? 'page' : undefined}
                  whileTap={tapScale(!!prefersReducedMotion)}
                >
                  <DocIcon />
                  <span>Docs</span>
                </motion.button>
                <motion.button
                  type="button"
                  className={tabMobile(tab === 'meta')}
                  onClick={() => setTab('meta')}
                  aria-current={tab === 'meta' ? 'page' : undefined}
                  whileTap={tapScale(!!prefersReducedMotion)}
                >
                  <MetaIcon />
                  <span>Meta</span>
                  {feature.meta && (
                    <span className={chromeCountBadge}>{countMetaItems(feature.meta)}</span>
                  )}
                </motion.button>
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

      {isMobile && (
        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.button
                key="feature-drawer-scrim"
                type="button"
                data-drawer-scrim="true"
                className={`fixed inset-0 z-[100] border-0 bg-scrim backdrop-blur-sm touch-manipulation ${focusRingOnScrim}`}
                aria-label="Close feature list"
                onClick={() => setDrawerOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={prefersReducedMotion ? transitionReducedOpacity : transitionScrimFade}
              />
              <motion.div
                key="feature-drawer"
                id="feature-drawer"
                className="fixed inset-y-0 left-0 z-[110] flex h-[100dvh] w-full max-w-[20rem] min-h-0 touch-manipulation flex-col overflow-hidden border-r border-outline bg-surface-container pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-elevation-2)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-title"
                initial={prefersReducedMotion ? { opacity: 0 } : { x: '-100%' }}
                animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { x: '-100%' }}
                transition={prefersReducedMotion ? transitionReducedOpacity : transitionDrawerSlide}
              >
                <FeatureNavShell
                  variant="drawer"
                  onClose={() => setDrawerOpen(false)}
                  features={filteredFeatures}
                  totalCount={features.length}
                  activeId={activeId}
                  onSelect={selectFeature}
                  query={featureQuery}
                  onQueryChange={setFeatureQuery}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
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

/** Desktop sidebar: chevron tucks the rail away / brings it back (matches stroke weight of MenuIcon). */
function ChevronLeftIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
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
