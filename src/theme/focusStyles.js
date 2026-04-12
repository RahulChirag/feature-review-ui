/**
 * Shared focus rings for interactive controls. Buttons use focus-visible; text fields use focus
 * so the ring stays visible whenever the field is focused (keyboard or pointer).
 */

const motionShadow = 'motion-safe:transition-shadow'
const motionColors = 'motion-safe:transition-colors'

/** Chrome on surface-container: header, rail, drawer, meta panels, pills */
export const focusRingButton = `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container ${motionShadow}`

/** Search and other text inputs on surface-container */
export const focusRingInput = `outline-none focus:border-primary/50 focus:bg-surface-container focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-surface-container ${motionColors}`

/** Full-screen scrim close control (sits on bg-scrim) */
export const focusRingOnScrim = `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${motionShadow}`

/** Markdown links inside doc viewer card */
export const focusRingLink = `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container ${motionShadow}`
