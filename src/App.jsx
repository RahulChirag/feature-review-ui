/**
 * App shell — z-index scale: content 0, header 10, bottomNav 40, scrim 100, drawer 110
 * Docs/Meta: two stacked scroll panels (absolute inset-0) so each tab keeps its own scrollTop.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import Sidebar from './components/Sidebar'
import DocOutline from './components/DocOutline'
import MetaViewer from './components/MetaViewer'
import MetaOutline from './components/MetaOutline'
import FeatureNavShell from './components/FeatureNavShell'
import DesktopHeader from './components/DesktopHeader'
import MobileHeader from './components/MobileHeader'
import ContentSkeleton from './components/ContentSkeleton'
import { DocIcon, EmptyIcon, MetaIcon } from './components/icons'
import {
  features,
  filterFeatures,
  formatGeneratedDateForDisplay,
  loadFeatureDoc,
} from './utils/featureUtils'
import { downloadTextFile } from './utils/downloadUtils'
import { chromeCountBadge } from './theme/chromeStyles'
import { useMobileDrawerSwipe } from './hooks/useMobileDrawerSwipe'
import { useMediaQuery } from './hooks/useMediaQuery'
import {
  tapScale,
  transitionContentEnter,
  transitionReducedOpacity,
  transitionDrawerSlide,
  transitionScrimFade,
} from './theme/motionTokens'
import { focusRingButton, focusRingOnScrim } from './theme/focusStyles'

// Code-split: pulls in react-markdown, rehype-slug, react-syntax-highlighter
const DocViewer = lazy(() => import('./components/DocViewer'))

const DESKTOP_SIDEBAR_STORAGE_KEY = 'feature-review-ui.desktopSidebarOpen'

/** Bottom tab bar height (56dp / Material touch target band) */
const MOBILE_NAV_H_PX = 56

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

export default function App() {
  const [activeId, setActiveId] = useState(features[0]?.id ?? null)
  const [tab, setTab] = useState('doc')
  const [featureQuery, setFeatureQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(readStoredDesktopSidebarOpen)

  /** 'idle' | 'loading' | 'ready' | 'error' */
  const [docStatus, setDocStatus] = useState('idle')
  const [docContent, setDocContent] = useState(null)

  const docScrollRef = useRef(null)
  const metaScrollRef = useRef(null)
  const docMarkdownRootRef = useRef(null)
  const metaRootRef = useRef(null)

  const isMobile = useMediaQuery('(max-width: 768px)')
  const prefersReducedMotion = useReducedMotion()

  useMobileDrawerSwipe({ isMobile, drawerOpen, setDrawerOpen })

  // Load markdown for the active feature on selection
  useEffect(() => {
    if (!activeId) return

    setDocContent(null)
    setDocStatus('loading')

    let cancelled = false
    loadFeatureDoc(activeId)
      .then((content) => {
        if (cancelled) return
        setDocContent(content || null)
        setDocStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setDocStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [activeId])

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

  // True when a doc is ready to download (loaded and non-empty)
  const canDownloadDoc = docStatus === 'ready' && !!docContent

  function selectFeature(id) {
    setActiveId(id)
    setTab('doc')
    setDrawerOpen(false)
  }

  function handleDownloadMd() {
    if (!docContent) return
    downloadTextFile(`${feature.id}.md`, docContent, 'text/markdown;charset=utf-8')
  }

  function handleDownloadMeta() {
    if (!feature?.meta) return
    downloadTextFile(
      `${feature.id}-meta.json`,
      JSON.stringify(feature.meta, null, 2),
      'application/json;charset=utf-8'
    )
  }

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
            <DesktopHeader
              activeId={activeId}
              feature={feature}
              generatedDisplay={generatedDisplay}
              desktopSidebarOpen={desktopSidebarOpen}
              setDesktopSidebarOpen={setDesktopSidebarOpen}
              tab={tab}
              setTab={setTab}
              canDownloadDoc={canDownloadDoc}
              handleDownloadMd={handleDownloadMd}
              handleDownloadMeta={handleDownloadMeta}
              prefersReducedMotion={!!prefersReducedMotion}
            />

            <MobileHeader
              activeId={activeId}
              feature={feature}
              generatedDisplay={generatedDisplay}
              drawerOpen={drawerOpen}
              setDrawerOpen={setDrawerOpen}
              canDownloadDoc={canDownloadDoc}
              handleDownloadMd={handleDownloadMd}
              handleDownloadMeta={handleDownloadMeta}
              prefersReducedMotion={!!prefersReducedMotion}
            />

            {/* Stacked scroll panels — instant visibility swap */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {/* Doc panel */}
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
                  {/* Suspense handles first-load of DocViewer chunk; inner condition handles content fetching */}
                  <Suspense fallback={<ContentSkeleton />}>
                    {docStatus === 'loading' ? (
                      <ContentSkeleton />
                    ) : docStatus === 'error' ? (
                      <div className="px-4 py-6 text-sm text-on-surface-muted md:px-8 md:py-8">
                        Failed to load documentation.
                      </div>
                    ) : (
                      <motion.div
                        key={activeId}
                        className="min-w-0 w-full"
                        initial={
                          prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.97, filter: 'blur(8px)' }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                        transition={prefersReducedMotion ? { duration: 0 } : transitionContentEnter}
                      >
                        <DocViewer ref={docMarkdownRootRef} content={docContent} />
                      </motion.div>
                    )}
                  </Suspense>
                </div>
                <DocOutline
                  scrollContainerRef={docScrollRef}
                  markdownRootRef={docMarkdownRootRef}
                  scanKey={`${activeId}-${docContent?.length ?? 0}`}
                  prefersReducedMotion={!!prefersReducedMotion}
                />
              </div>

              {/* Meta panel */}
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
