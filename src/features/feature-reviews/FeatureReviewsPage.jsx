/**
 * App shell - z-index scale: content 0, header 10, bottomNav 40, scrim 100, drawer 110
 * Docs/Meta: two stacked scroll panels (absolute inset-0) so each tab keeps its own scrollTop.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import DesktopHeader from '../../components/DesktopHeader'
import MobileHeader from '../../components/MobileHeader'
import Sidebar from '../../components/Sidebar'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useMobileDrawerSwipe } from '../../hooks/useMobileDrawerSwipe'
import { downloadTextFile } from '../../utils/downloadUtils'
import { useFeatureDocument } from './hooks/useFeatureDocument'
import { useFeatureSelection } from './hooks/useFeatureSelection'
import { useSidebarPreference } from './hooks/useSidebarPreference'
import FeatureContentTabs from './components/FeatureContentTabs'
import FeatureDrawer from './components/FeatureDrawer'
import FeatureEmptyState from './components/FeatureEmptyState'
import { formatGeneratedDateForDisplay } from './lib/featureFormatters'

export default function FeatureReviewsPage() {
  const {
    activeId,
    feature,
    featureQuery,
    filteredFeatures,
    selectFeature,
    setFeatureQuery,
    setTab,
    tab,
    totalFeatures,
  } = useFeatureSelection()
  const { desktopSidebarOpen, setDesktopSidebarOpen } = useSidebarPreference()
  const { canDownloadDoc, docContent, docStatus, docType } = useFeatureDocument(activeId)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const docScrollRef = useRef(null)
  const metaScrollRef = useRef(null)
  const docMarkdownRootRef = useRef(null)
  const metaRootRef = useRef(null)

  const isMobile = useMediaQuery('(max-width: 768px)')
  const prefersReducedMotion = useReducedMotion()

  useMobileDrawerSwipe({ isMobile, drawerOpen, setDrawerOpen })

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false)
  }, [isMobile])

  useEffect(() => {
    if (!drawerOpen || !isMobile) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [drawerOpen, isMobile])

  useEffect(() => {
    if (!activeId) return
    const docNode = docScrollRef.current
    const metaNode = metaScrollRef.current
    if (docNode) docNode.scrollTop = 0
    if (metaNode) metaNode.scrollTop = 0
  }, [activeId])

  const generatedDisplay = useMemo(
    () => formatGeneratedDateForDisplay(feature?.meta?.generated_date),
    [feature?.meta?.generated_date]
  )

  function handleSelectFeature(id) {
    selectFeature(id)
    setDrawerOpen(false)
  }

  function handleDownloadDoc() {
    if (!docContent || !feature) return
    if (docType === 'pdf') {
      const anchor = document.createElement('a')
      anchor.href = docContent
      anchor.download = `${feature.id}.pdf`
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      return
    }
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

  return (
    <div className="grid h-[100dvh] min-h-0 w-full grid-cols-1 overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:grid-cols-[auto_minmax(0,1fr)]">
      <Sidebar
        open={desktopSidebarOpen}
        features={filteredFeatures}
        totalCount={totalFeatures}
        activeId={activeId}
        onSelect={handleSelectFeature}
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
              handleDownloadDoc={handleDownloadDoc}
              docDownloadLabel={docType === 'pdf' ? 'Download .pdf' : 'Download .md'}
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
              handleDownloadDoc={handleDownloadDoc}
              docDownloadTitle={docType === 'pdf' ? 'Download PDF' : 'Download Markdown'}
              handleDownloadMeta={handleDownloadMeta}
              prefersReducedMotion={!!prefersReducedMotion}
            />

            <FeatureContentTabs
              activeId={activeId}
              docContent={docContent}
              docType={docType}
              docMarkdownRootRef={docMarkdownRootRef}
              docScrollRef={docScrollRef}
              docStatus={docStatus}
              feature={feature}
              isMobile={isMobile}
              metaRootRef={metaRootRef}
              metaScrollRef={metaScrollRef}
              prefersReducedMotion={!!prefersReducedMotion}
              setTab={setTab}
              tab={tab}
            />
          </>
        ) : (
          <FeatureEmptyState />
        )}
      </main>

      <FeatureDrawer
        activeId={activeId}
        drawerOpen={drawerOpen}
        features={filteredFeatures}
        isMobile={isMobile}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelectFeature}
        prefersReducedMotion={!!prefersReducedMotion}
        query={featureQuery}
        setFeatureQuery={setFeatureQuery}
        totalFeatures={totalFeatures}
      />
    </div>
  )
}
