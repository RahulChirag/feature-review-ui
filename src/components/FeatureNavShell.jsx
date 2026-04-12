/**
 * Unified feature navigation for desktop rail and mobile drawer.
 * Uses surface tokens only (no sidebar-* palette). Theme toggle is only here (rail + drawer), not in the main app bar.
 */
import { motion, useReducedMotion } from 'motion/react'
import ThemeToggle from '../theme/ThemeToggle'
import {
  chromeCountBadge,
  chromeCountBadgeRailActive,
  chromeCountBadgeRailMuted,
} from '../theme/chromeStyles'
import { tapScale } from '../theme/motionTokens'
import { focusRingButton, focusRingInput } from '../theme/focusStyles'
import { formatFeatureName } from '../featureUtils'

const FOOTER_HINT = 'Drop folders into feature-reviews/ to add more'

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
      />
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 16l4.5 4.5" />
    </svg>
  )
}

export default function FeatureNavShell({
  variant = 'rail',
  onClose,
  features,
  totalCount,
  activeId,
  onSelect,
  query,
  onQueryChange,
}) {
  const isDrawer = variant === 'drawer'
  const showClear = query.length > 0
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-container">
      {isDrawer && onClose && (
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-outline bg-surface-container-high px-4">
          <span id="drawer-title" className="text-base font-semibold text-on-surface">
            Features
          </span>
          <motion.button
            type="button"
            className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-outline bg-surface-container text-on-surface hover:bg-surface-container-high ${focusRingButton}`}
            onClick={onClose}
            aria-label="Close feature list"
            whileTap={tapScale(!!prefersReducedMotion)}
          >
            <span className="text-2xl leading-none" aria-hidden>
              ×
            </span>
          </motion.button>
        </div>
      )}

      {!isDrawer && (
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-outline px-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container text-primary shadow-sm">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold tracking-tight text-on-surface">Feature Reviews</div>
            <div className="mt-0.5 text-[11px] text-on-surface-variant">
              {totalCount} feature{totalCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-outline px-3 py-3">
        <ThemeToggle variant="compact" className="w-full" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-2 pt-2">
        <span className="shrink-0 pb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Features
        </span>

        {/* Search stays fixed; only the list below scrolls */}
        <div className="relative mb-3 shrink-0">
          <label htmlFor="feature-filter-input" className="sr-only">
            Filter features by name
          </label>
          <span
            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          >
            <SearchIcon />
          </span>
          <input
            id="feature-filter-input"
            className={`h-11 w-full rounded-lg border border-outline bg-surface-container-high py-2 pl-10 text-base text-on-surface shadow-sm placeholder:text-on-surface-muted hover:border-outline-variant sm:text-sm ${focusRingInput} ${showClear ? 'pr-11' : 'pr-3'}`}
            type="text"
            inputMode="search"
            role="searchbox"
            placeholder="Search features…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            enterKeyHint="search"
          />
          {showClear && (
            <motion.button
              type="button"
              className={`absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface sm:h-9 sm:w-9 ${focusRingButton}`}
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              whileTap={tapScale(!!prefersReducedMotion)}
            >
              <span className="text-xl leading-none sm:text-lg" aria-hidden>
                ×
              </span>
            </motion.button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]">
          <nav className="flex flex-col gap-0.5 pb-1" aria-label="Feature list">
            {totalCount === 0 ? (
              <div className="px-2.5 py-3 text-xs leading-relaxed text-on-surface-muted">
                No features found in feature-reviews/
              </div>
            ) : features.length === 0 ? (
              <div className="px-2.5 py-3 text-xs leading-relaxed text-on-surface-muted">
                No features match your filter
              </div>
            ) : (
              features.map((f, index) => {
                const active = f.id === activeId
                const staggerDelay = prefersReducedMotion ? 0 : Math.min(index * 0.07, 0.55)
                return (
                  <motion.button
                    key={f.id}
                    type="button"
                    onClick={() => onSelect(f.id)}
                    aria-current={active ? 'page' : undefined}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -28 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={
                      prefersReducedMotion
                        ? undefined
                        : {
                            type: 'tween',
                            duration: 0.4,
                            ease: [0.22, 1, 0.36, 1],
                            delay: staggerDelay,
                          }
                    }
                    whileTap={tapScale(!!prefersReducedMotion)}
                    className={`flex min-h-11 w-full touch-manipulation items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm font-medium motion-safe:transition-colors ${focusRingButton} ${
                      active
                        ? 'border-l-[3px] border-l-primary bg-primary/10 pl-[7px] text-on-surface'
                        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-primary opacity-100' : 'bg-on-surface-variant/50 opacity-60'}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{formatFeatureName(f.meta?.feature ?? f.id)}</span>
                    {f.meta && (
                      <span
                        className={`${chromeCountBadge} shrink-0 ${
                          active ? chromeCountBadgeRailActive : chromeCountBadgeRailMuted
                        }`}
                      >
                        {(f.meta.files_involved?.length ?? 0)}f
                      </span>
                    )}
                  </motion.button>
                )
              })
            )}
          </nav>
        </div>
      </div>

      <div className="shrink-0 border-t border-outline px-4 py-3">
        <p className="text-[11px] leading-snug text-on-surface-muted">{FOOTER_HINT}</p>
      </div>
    </div>
  )
}
