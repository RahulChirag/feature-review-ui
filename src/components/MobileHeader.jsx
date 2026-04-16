import { motion } from 'motion/react'
import { chromeIconActionSm, chromeMetadataStrip } from '../theme/chromeStyles'
import { tapScale, transitionTitleEnter } from '../theme/motionTokens'
import { formatFeatureName } from '../features/feature-reviews/lib/featureFormatters'
import { DocIcon, JsonDownloadIcon, MenuIcon } from './icons'

export default function MobileHeader({
  activeId,
  feature,
  generatedDisplay,
  drawerOpen,
  setDrawerOpen,
  canDownloadDoc,
  handleDownloadDoc,
  docDownloadTitle,
  handleDownloadMeta,
  prefersReducedMotion,
}) {
  return (
    <div className="z-10 shrink-0 md:hidden">
      <div className="flex h-12 min-h-[48px] items-center gap-2 border-b border-outline bg-surface-container px-3">
        <motion.button
          type="button"
          className={`${chromeIconActionSm} shrink-0`}
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
          className="min-w-0 flex-1 truncate text-[15px] font-bold leading-snug text-on-surface"
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
            onClick={handleDownloadDoc}
            disabled={!canDownloadDoc}
            title={docDownloadTitle}
            whileTap={tapScale(!!prefersReducedMotion)}
          >
            <span className="sr-only">{docDownloadTitle}</span>
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
        <div className="border-b border-outline bg-surface-container px-3 py-1">
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
  )
}
