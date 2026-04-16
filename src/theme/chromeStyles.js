/**
 * Shared app chrome: metadata rows, count chips, download actions.
 * Pair with focusStyles for interactive elements.
 */
import { focusRingButton } from './focusStyles'

/**
 * Keeps the rail brand row and main title row the same minimum height so the
 * row-2 border-t (theme strip vs doc tabs) lines up at the desktop column split.
 */
export const chromeTopRowAlign = 'min-h-14'

/** Desktop title row: “Generated …” */
export const chromeMetadata = 'mt-1 text-xs text-on-surface-variant'

/** Mobile strip under header (single line, truncates) */
export const chromeMetadataStrip = 'truncate text-xs text-on-surface-variant'

/** Unified numeric chip: tabs, bottom nav, MetaViewer section counts */
export const chromeCountBadge =
  'inline-flex min-h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-outline-variant px-2 py-0.5 text-[11px] font-bold tabular-nums text-on-surface-variant dark:bg-surface-container dark:text-on-surface-variant'

/** Narrow feature rail list: file-count chip (shorter than chromeCountBadge so titles keep width) */
export const chromeCountBadgeRailList =
  'inline-flex h-5 max-w-full shrink-0 items-center justify-center rounded-full bg-outline-variant px-1.5 py-0 text-[10px] font-bold leading-none tabular-nums text-on-surface-variant dark:bg-surface-container dark:text-on-surface-variant'

/** Feature rail list: file count next to title */
export const chromeCountBadgeRailActive = 'bg-primary/15 text-primary'
export const chromeCountBadgeRailMuted = 'bg-surface-container-high text-on-surface-variant'

export const chromeMutedHint = 'self-center px-2 text-xs text-on-surface-muted'

/** Muted body copy (empty states, secondary lines) */
export const chromeMutedText = 'text-on-surface-muted'

export const chromeDownloadPill = `inline-flex min-h-10 touch-manipulation items-center justify-center rounded-full border border-outline bg-surface-container px-4 text-xs font-semibold text-on-surface shadow-sm hover:bg-surface-container-high disabled:opacity-40 ${focusRingButton}`

const iconActionBase = `shrink-0 touch-manipulation items-center justify-center rounded-full border border-outline bg-surface-container-high text-on-surface shadow-sm disabled:opacity-40 ${focusRingButton}`

export const chromeIconActionSm = `flex h-10 w-10 ${iconActionBase}`
export const chromeIconActionMd = `flex h-11 w-11 ${iconActionBase}`
