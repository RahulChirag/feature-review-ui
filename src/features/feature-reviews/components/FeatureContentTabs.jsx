import { lazy, Suspense } from 'react'
import { motion } from 'motion/react'
import ContentSkeleton from '../../../components/ContentSkeleton'
import DocOutline from '../../../components/DocOutline'
import MetaOutline from '../../../components/MetaOutline'
import MetaViewer from '../../../components/MetaViewer'
import { DocIcon, MetaIcon } from '../../../components/icons'
import { chromeCountBadge } from '../../../theme/chromeStyles'
import { focusRingButton } from '../../../theme/focusStyles'
import { tapScale, transitionContentEnter } from '../../../theme/motionTokens'
import { countMetaItems } from '../lib/metaUtils'

const DocViewer = lazy(() => import('../../../components/DocViewer'))

const MOBILE_NAV_H_PX = 56

function mobileTabClass(active) {
  return `relative flex h-14 min-h-[56px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 border-t-2 py-1 text-[11px] font-semibold leading-tight motion-safe:transition-colors ${focusRingButton} ${
    active
      ? 'border-primary bg-primary/10 text-primary [&_svg]:stroke-primary'
      : 'border-transparent text-on-surface-variant'
  }`
}

export default function FeatureContentTabs({
  activeId,
  docContent,
  docType,
  docMarkdownRootRef,
  docScrollRef,
  docStatus,
  feature,
  isMobile,
  metaRootRef,
  metaScrollRef,
  prefersReducedMotion,
  setTab,
  tab,
}) {
  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={`absolute inset-0 flex min-h-0 flex-row overflow-hidden ${
            tab === 'doc' ? 'z-10' : 'pointer-events-none invisible z-0'
          }`}
          aria-hidden={tab !== 'doc'}
        >
          <div
            ref={docScrollRef}
            className={`h-full min-h-0 min-w-0 flex-1 overflow-x-hidden scroll-smooth ${
              docType === 'pdf' ? 'overflow-y-hidden' : 'overflow-y-auto overscroll-y-contain'
            }`}
            style={
              isMobile
                ? { paddingBottom: `calc(${MOBILE_NAV_H_PX}px + env(safe-area-inset-bottom, 0px))` }
                : undefined
            }
          >
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
                  className="h-full w-full min-w-0"
                  initial={
                    prefersReducedMotion
                      ? false
                      : { opacity: 0, y: 28, scale: 0.97, filter: 'blur(8px)' }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  transition={prefersReducedMotion ? { duration: 0 } : transitionContentEnter}
                >
                  <DocViewer ref={docMarkdownRootRef} content={docContent} contentType={docType} />
                </motion.div>
              )}
            </Suspense>
            {isMobile && <div aria-hidden className="h-[calc(56px+env(safe-area-inset-bottom,0px))] shrink-0" />}
          </div>
          <DocOutline
            scrollContainerRef={docScrollRef}
            markdownRootRef={docMarkdownRootRef}
            scanKey={`${activeId}-${docContent?.length ?? 0}`}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>

        <div
          className={`absolute inset-0 flex min-h-0 flex-row overflow-hidden ${
            tab === 'meta' ? 'z-10' : 'pointer-events-none invisible z-0'
          }`}
          aria-hidden={tab !== 'meta'}
        >
          <div
            ref={metaScrollRef}
            className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth"
            style={
              isMobile
                ? { paddingBottom: `calc(${MOBILE_NAV_H_PX}px + env(safe-area-inset-bottom, 0px))` }
                : undefined
            }
          >
            <motion.div
              key={activeId}
              className="h-full w-full min-w-0"
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 28, scale: 0.97, filter: 'blur(8px)' }
              }
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={prefersReducedMotion ? { duration: 0 } : transitionContentEnter}
            >
              <MetaViewer ref={metaRootRef} meta={feature.meta} />
            </motion.div>
            {isMobile && <div aria-hidden className="h-[calc(56px+env(safe-area-inset-bottom,0px))] shrink-0" />}
          </div>
          <MetaOutline
            scrollContainerRef={metaScrollRef}
            metaRootRef={metaRootRef}
            scanKey={`${activeId}-meta`}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>
      </div>

      {isMobile && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 flex h-14 border-t border-outline bg-surface-container/95 shadow-[var(--shadow-nav)] backdrop-blur-md supports-[backdrop-filter]:bg-surface-container/90"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Documentation and metadata"
        >
          <motion.button
            type="button"
            className={mobileTabClass(tab === 'doc')}
            onClick={() => setTab('doc')}
            aria-current={tab === 'doc' ? 'page' : undefined}
            whileTap={tapScale(prefersReducedMotion)}
          >
            <DocIcon />
            <span>Docs</span>
          </motion.button>
          <motion.button
            type="button"
            className={mobileTabClass(tab === 'meta')}
            onClick={() => setTab('meta')}
            aria-current={tab === 'meta' ? 'page' : undefined}
            whileTap={tapScale(prefersReducedMotion)}
          >
            <MetaIcon />
            <span>Meta</span>
            {feature.meta && <span className={chromeCountBadge}>{countMetaItems(feature.meta)}</span>}
          </motion.button>
        </nav>
      )}
    </>
  )
}
