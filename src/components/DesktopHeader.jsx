import { motion } from 'motion/react'
import { chromeCountBadge, chromeDownloadPill, chromeMutedHint, chromeMetadata } from '../theme/chromeStyles'
import { focusRingButton } from '../theme/focusStyles'
import { hoverChrome, tapScale, transitionTitleEnter } from '../theme/motionTokens'
import { countMetaItems } from '../features/feature-reviews/lib/metaUtils'
import { formatFeatureName } from '../features/feature-reviews/lib/featureFormatters'
import { ChevronLeftIcon, ChevronRightIcon, DocIcon, MetaIcon } from './icons'

const tabClass = (active) =>
  `relative z-10 flex min-h-12 touch-manipulation items-center gap-2 rounded-t-lg px-5 text-sm font-semibold ${focusRingButton} ${
    active
      ? 'text-primary after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:rounded-full after:bg-primary'
      : 'text-on-surface-variant hover:text-on-surface'
  }`

export default function DesktopHeader({
  activeId,
  feature,
  generatedDisplay,
  desktopSidebarOpen,
  setDesktopSidebarOpen,
  tab,
  setTab,
  canDownloadDoc,
  handleDownloadMd,
  handleDownloadMeta,
  prefersReducedMotion,
}) {
  return (
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
            disabled={!canDownloadDoc}
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
          className={tabClass(tab === 'doc')}
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
          className={tabClass(tab === 'meta')}
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
  )
}
