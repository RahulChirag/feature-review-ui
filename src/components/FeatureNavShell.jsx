/**
 * Unified feature navigation for desktop rail and mobile drawer.
 * Uses surface tokens only (no sidebar-* palette). Theme toggle is only here (rail + drawer), not in the main app bar.
 *
 * Desktop: `FeatureRailBrandRow`, `FeatureRailThemeRow`, and `FeatureNavRailBody` are placed in a shared
 * page-level grid so chrome row heights match the main column.
 */
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import ThemeToggle from '../theme/ThemeToggle'
import {
  chromeCountBadgeRailList,
  chromeCountBadgeRailActive,
  chromeCountBadgeRailMuted,
  chromeTopRowAlign,
} from '../theme/chromeStyles'
import { tapScale } from '../theme/motionTokens'
import { focusRingButton, focusRingInput } from '../theme/focusStyles'
import { APP_DISPLAY_VERSION } from '../utils/appVersion'
import { formatFeatureName } from '../features/feature-reviews/lib/featureFormatters'

const FOOTER_HINT = 'Drop folders into feature-reviews/ to add more'

/** Token-based accents for collapsible doc-kind groups (sidebar rail + drawer). */
const DOC_GROUP_TONE = {
  markdown: {
    header:
      'bg-primary/10 text-primary hover:bg-primary/15',
    accentBar: 'bg-primary',
    chevron: 'text-primary',
    count: 'bg-primary/15 text-primary',
  },
  pdf: {
    header:
      'bg-primary-container/30 text-on-primary-container hover:bg-primary-container/45',
    accentBar: 'bg-primary-container',
    chevron: 'text-on-primary-container',
    count: 'bg-primary-container/50 text-on-primary-container',
  },
  metaOnly: {
    header:
      'bg-outline-variant/60 text-on-surface-variant hover:bg-outline-variant',
    accentBar: 'bg-outline-variant',
    chevron: 'text-on-surface-muted',
    count: 'bg-surface-container-high text-on-surface-variant',
  },
  invalid: {
    header: 'bg-error/15 text-error hover:bg-error/20',
    accentBar: 'bg-error',
    chevron: 'text-error',
    count: 'bg-error/20 text-error',
  },
}

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

function FeatureRow({ f, active, index, onSelect, prefersReducedMotion }) {
  const staggerDelay = prefersReducedMotion ? 0 : Math.min(index * 0.07, 0.55)
  return (
    <motion.button
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
      className={`flex min-h-11 w-full min-w-0 touch-manipulation items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm font-medium motion-safe:transition-colors ${focusRingButton} ${
        active
          ? 'bg-primary/10 text-on-surface'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span
        className="flex h-1.5 w-1.5 shrink-0 items-center justify-center"
        aria-hidden
      >
        {active ? (
          <span className="h-4 w-[3px] shrink-0 rounded-sm bg-primary" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/50 opacity-60" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {formatFeatureName(f.normalizedMeta?.title ?? f.meta?.feature ?? f.id)}
      </span>
      {f.docKind === 'invalid' && (
        <span className="rounded-full bg-error/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-error">
          Fix
        </span>
      )}
      {f.meta && (
        <span
          className={`${chromeCountBadgeRailList} ${
            active ? chromeCountBadgeRailActive : chromeCountBadgeRailMuted
          }`}
        >
          {(f.normalizedMeta?.files?.length ?? 0)}f
        </span>
      )}
    </motion.button>
  )
}

function CollapsibleDocGroup({
  id,
  title,
  tone = 'markdown',
  items,
  activeId,
  onSelect,
  prefersReducedMotion,
  defaultOpen = true,
  startIndex = 0,
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (items.length === 0) return null

  const palette = DOC_GROUP_TONE[tone] ?? DOC_GROUP_TONE.markdown

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-0.5">
      <button
        type="button"
        id={`${id}-heading`}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 w-full min-w-0 max-w-full touch-manipulation items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-widest motion-safe:transition-colors ${palette.header} ${focusRingButton}`}
      >
        <span
          className="flex h-1.5 w-1.5 shrink-0 items-center justify-center"
          aria-hidden
        >
          <span className={`h-4 w-[3px] shrink-0 rounded-sm ${palette.accentBar}`} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`w-4 shrink-0 text-center text-[10px] leading-none ${palette.chevron}`}
            aria-hidden
          >
            {open ? '▾' : '▸'}
          </span>
          <span className="min-w-0 flex-1 truncate">{title}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${palette.count}`}
        >
          {items.length}
        </span>
      </button>
      {open && (
        <div
          id={`${id}-list`}
          role="group"
          aria-labelledby={`${id}-heading`}
          className="flex flex-col gap-0.5"
        >
          {items.map((f, i) => (
            <FeatureRow
              key={f.id}
              f={f}
              active={f.id === activeId}
              index={startIndex + i}
              onSelect={onSelect}
              prefersReducedMotion={prefersReducedMotion}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FeatureRailBrandRow({ totalCount, className = '' }) {
  return (
    <div
      className={`flex min-w-0 max-w-full shrink-0 items-center gap-2.5 overflow-hidden bg-surface-container px-3 py-2.5 ${chromeTopRowAlign} ${className}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container text-primary shadow-sm">
        <svg
          width="16"
          height="16"
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
        <p className="truncate text-sm font-bold leading-tight text-on-surface">
          Feature Reviews
          <span className="font-medium text-on-surface-variant">
            {' '}
            · {totalCount} feature{totalCount !== 1 ? 's' : ''}
          </span>
        </p>
      </div>
    </div>
  )
}

export function FeatureRailThemeRow({ className = '' }) {
  return (
    <div
      className={`flex h-10 min-h-10 min-w-0 max-w-full shrink-0 items-center overflow-hidden border-b border-outline border-t border-outline/70 bg-surface-container px-2 ${className}`}
    >
      <ThemeToggle rail className="w-full" />
    </div>
  )
}

export function FeatureNavRailBody({
  features,
  totalCount,
  activeId,
  onSelect,
  query,
  onQueryChange,
  className = '',
  searchInputId = 'feature-filter-input',
}) {
  const showClear = query.length > 0
  const prefersReducedMotion = useReducedMotion()

  const { invalidFeatures, markdownFeatures, pdfFeatures, otherFeatures } = useMemo(() => {
    const invalidFeatures = features.filter((f) => f.docKind === 'invalid')
    const markdownFeatures = features.filter((f) => f.docKind === 'markdown')
    const pdfFeatures = features.filter((f) => f.docKind === 'pdf')
    const otherFeatures = features.filter((f) => f.docKind === 'none')
    return { invalidFeatures, markdownFeatures, pdfFeatures, otherFeatures }
  }, [features])

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-container ${className}`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pb-2 pt-2">
        <span className="shrink-0 pb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Features
        </span>

        <div className="relative mb-3 shrink-0">
          <label htmlFor={searchInputId} className="sr-only">
            Filter features by name
          </label>
          <span
            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          >
            <SearchIcon />
          </span>
          <input
            id={searchInputId}
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

        <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          <nav className="flex min-w-0 flex-col gap-3 pb-4" aria-label="Feature list">
            {totalCount === 0 ? (
              <div className="px-2.5 py-3 text-xs leading-relaxed text-on-surface-muted">
                No features found in feature-reviews/
              </div>
            ) : features.length === 0 ? (
              <div className="px-2.5 py-3 text-xs leading-relaxed text-on-surface-muted">
                No features match your filter `{query}`.
              </div>
            ) : (
              <>
                <CollapsibleDocGroup
                  id="sidebar-invalid"
                  title="Needs attention"
                  tone="invalid"
                  items={invalidFeatures}
                  activeId={activeId}
                  onSelect={onSelect}
                  prefersReducedMotion={prefersReducedMotion}
                  defaultOpen
                  startIndex={0}
                />
                <CollapsibleDocGroup
                  id="sidebar-md"
                  title="Markdown"
                  tone="markdown"
                  items={markdownFeatures}
                  activeId={activeId}
                  onSelect={onSelect}
                  prefersReducedMotion={prefersReducedMotion}
                  startIndex={invalidFeatures.length}
                />
                <CollapsibleDocGroup
                  id="sidebar-pdf"
                  title="PDF"
                  tone="pdf"
                  items={pdfFeatures}
                  activeId={activeId}
                  onSelect={onSelect}
                  prefersReducedMotion={prefersReducedMotion}
                  startIndex={invalidFeatures.length + markdownFeatures.length}
                />
                <CollapsibleDocGroup
                  id="sidebar-other"
                  title="Metadata only"
                  tone="metaOnly"
                  items={otherFeatures}
                  activeId={activeId}
                  onSelect={onSelect}
                  prefersReducedMotion={prefersReducedMotion}
                  startIndex={invalidFeatures.length + markdownFeatures.length + pdfFeatures.length}
                />
              </>
            )}
          </nav>
        </div>
      </div>

      <div className="shrink-0 border-t border-outline px-4 py-3">
        <p className="text-[11px] leading-snug text-on-surface-muted">{FOOTER_HINT}</p>
        <p
          className="mt-2 text-[10px] tabular-nums tracking-wide text-on-surface-muted/70"
          aria-label={`App version ${APP_DISPLAY_VERSION}`}
        >
          v{APP_DISPLAY_VERSION}
        </p>
      </div>
    </div>
  )
}

/** Mobile drawer: header + theme + shared list body. */
export default function FeatureNavShell({ onClose, features, totalCount, activeId, onSelect, query, onQueryChange }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-container">
      {onClose && (
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

      <div className="shrink-0 border-b border-outline border-t border-outline/70 px-3 py-2">
        <ThemeToggle className="w-full" />
      </div>

      <FeatureNavRailBody
        searchInputId="feature-filter-drawer"
        features={features}
        totalCount={totalCount}
        activeId={activeId}
        onSelect={onSelect}
        query={query}
        onQueryChange={onQueryChange}
        className="min-h-0 flex-1"
      />
    </div>
  )
}
