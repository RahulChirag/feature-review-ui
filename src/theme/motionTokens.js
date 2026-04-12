/**
 * Shared Motion transitions; pair with useReducedMotion() for accessibility.
 * Values tuned to read clearly on desktop + mobile (springs alone felt too fast).
 */

/** Drawer panel: explicit tween so the slide stays visible (~0.5s) */
export const transitionDrawerSlide = {
  type: 'tween',
  duration: 0.52,
  ease: [0.22, 1, 0.36, 1],
}

/** Desktop sidebar rail collapse/expand width */
export const transitionDesktopSidebar = {
  type: 'tween',
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
}

/** Legacy spring — kept if needed; drawer uses transitionDrawerSlide in App */
export const transitionDrawerSpring = { type: 'spring', stiffness: 260, damping: 32, mass: 1 }

/** Opacity-only: prefers-reduced-motion */
export const transitionReducedOpacity = { duration: 0.12, ease: [0.4, 0, 0.2, 1] }

/** Scrim fade — long enough to read */
export const transitionScrimFade = { duration: 0.45, ease: [0.4, 0, 0.2, 1] }

/** Press: slower return so the squash reads (whileTap) */
export const tapTransition = { type: 'spring', stiffness: 380, damping: 22, mass: 0.45 }

/** Desktop hover — obvious lift */
export const hoverChrome = {
  scale: 1.08,
  y: -2,
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
}

export const hoverThemeSegment = {
  scale: 1.08,
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
}

/** Main doc/meta block when feature changes */
export const transitionContentEnter = { duration: 0.42, ease: [0.22, 1, 0.36, 1] }

/** Feature title in header when activeId changes */
export const transitionTitleEnter = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

/** whileTap — omit when reduced motion */
export function tapScale(prefersReduced) {
  if (prefersReduced) return undefined
  return { scale: 0.82, transition: tapTransition }
}

export function tapScaleStrong(prefersReduced) {
  if (prefersReduced) return undefined
  return { scale: 0.78, transition: tapTransition }
}
