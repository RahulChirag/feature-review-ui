import { motion } from 'motion/react'
import {
  chromeCountBadge,
  chromeDownloadPill,
  chromeMutedHint,
  chromeMetadata,
  chromeTopRowAlign,
} from '../theme/chromeStyles'
import { focusRingButton } from '../theme/focusStyles'
import { hoverChrome, tapScale, transitionTitleEnter } from '../theme/motionTokens'
import { countMetaItems } from '../features/feature-reviews/lib/metaUtils'
import { formatFeatureName } from '../features/feature-reviews/lib/featureFormatters'
import { ChevronLeftIcon, ChevronRightIcon, DocIcon, MetaIcon } from './icons'

const tabClass = (active) =>
  `relative z-10 flex min-h-10 touch-manipulation items-center gap-1.5 rounded-t-lg px-4 text-sm font-semibold ${focusRingButton} ${
    active
      ? 'text-primary after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:rounded-full after:bg-primary'
      : 'text-on-surface-variant hover:text-on-surface'
  }`

export function DesktopHeaderTitleRow({
  className = '',
  activeId,
  feature,
  generatedDisplay,
  desktopSidebarOpen,
  setDesktopSidebarOpen,
  canDownloadDoc,
  handleDownloadDoc,
  docDownloadLabel,
  handleDownloadMeta,
  prefersReducedMotion,
}) {
  return (
    <div
      className={`z-10 flex min-h-0 flex-wrap items-center gap-2.5 bg-surface-container px-5 py-2.5 lg:gap-3 lg:px-6 ${chromeTopRowAlign} ${className}`}
    >
      <motion.button
        type="button"
        className={`inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-outline bg-surface-container-high text-on-surface hover:bg-surface-container ${focusRingButton}`}
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
          className="text-balance text-xl font-bold tracking-tight text-on-surface lg:text-2xl"
          initial={prefersReducedMotion ? false : { opacity: 0, x: -16, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={prefersReducedMotion ? { duration: 0 } : transitionTitleEnter}
        >
          {formatFeatureName(feature.normalizedMeta?.title ?? feature.meta?.feature ?? feature.id)}
        </motion.h1>
        {feature.normalizedMeta?.generatedAt && generatedDisplay.label && (
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
          className={`${chromeDownloadPill} min-h-9 px-3 py-1.5 text-[11px]`}
          onClick={handleDownloadDoc}
          disabled={!canDownloadDoc}
          whileHover={!prefersReducedMotion ? hoverChrome : undefined}
          whileTap={tapScale(!!prefersReducedMotion)}
        >
          {docDownloadLabel}
        </motion.button>
        {feature.meta ? (
          <motion.button
            type="button"
            className={`${chromeDownloadPill} min-h-9 px-3 py-1.5 text-[11px]`}
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
  )
}

export function DesktopHeaderTabNav({
  className = '',
  tab,
  setTab,
  feature,
  prefersReducedMotion,
}) {
  return (
    <nav
      className={`flex h-10 min-h-10 shrink-0 items-stretch gap-1 border-b border-outline border-t border-outline/70 bg-surface-container px-4 lg:px-6 ${className}`}
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
          <span className={chromeCountBadge}>{countMetaItems(feature)}</span>
        )}
      </motion.button>
    </nav>
  )
}
