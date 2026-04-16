import { AnimatePresence, motion } from 'motion/react'
import FeatureNavShell from '../../../components/FeatureNavShell'
import { focusRingOnScrim } from '../../../theme/focusStyles'
import { FEATURE_RAIL_WIDTH_PX } from '../../../theme/layoutTokens'
import {
  transitionDrawerSlide,
  transitionReducedOpacity,
  transitionScrimFade,
} from '../../../theme/motionTokens'

export default function FeatureDrawer({
  activeId,
  drawerOpen,
  features,
  isMobile,
  onClose,
  onSelect,
  prefersReducedMotion,
  query,
  setFeatureQuery,
  totalFeatures,
}) {
  if (!isMobile) return null

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          <motion.button
            key="feature-drawer-scrim"
            type="button"
            data-drawer-scrim="true"
            className={`fixed inset-0 z-[100] border-0 bg-scrim backdrop-blur-sm touch-manipulation ${focusRingOnScrim}`}
            aria-label="Close feature list"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? transitionReducedOpacity : transitionScrimFade}
          />
          <motion.div
            key="feature-drawer"
            id="feature-drawer"
            className="fixed inset-y-0 left-0 z-[110] flex h-[100dvh] w-full min-h-0 touch-manipulation flex-col overflow-hidden border-r border-outline bg-surface-container pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-elevation-2)]"
            style={{ maxWidth: FEATURE_RAIL_WIDTH_PX }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            initial={prefersReducedMotion ? { opacity: 0 } : { x: '-100%' }}
            animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { x: '-100%' }}
            transition={prefersReducedMotion ? transitionReducedOpacity : transitionDrawerSlide}
          >
            <FeatureNavShell
              onClose={onClose}
              features={features}
              totalCount={totalFeatures}
              activeId={activeId}
              onSelect={onSelect}
              query={query}
              onQueryChange={setFeatureQuery}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
