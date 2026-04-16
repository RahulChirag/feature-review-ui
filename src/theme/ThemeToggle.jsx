import { motion, useReducedMotion } from 'motion/react'
import { useTheme } from './ThemeProvider'
import { hoverThemeSegment, tapScaleStrong } from './motionTokens'
import { focusRingButton } from './focusStyles'

export default function ThemeToggle({ className = '', rail = false }) {
  const { preference, setPreference } = useTheme()
  const prefersReducedMotion = useReducedMotion()

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={`grid w-full grid-cols-3 rounded-lg border border-outline bg-surface-container-high ${
        rail
          ? 'h-8 max-h-8 gap-0 p-0 shadow-none'
          : 'gap-0.5 p-0.5 shadow-sm'
      } ${className}`}
    >
      <CompactThemeBtn
        label="Light theme"
        pressed={preference === 'light'}
        onClick={() => setPreference('light')}
        prefersReducedMotion={!!prefersReducedMotion}
        rail={rail}
      >
        <SunIcon />
      </CompactThemeBtn>
      <CompactThemeBtn
        label="Dark theme"
        pressed={preference === 'dark'}
        onClick={() => setPreference('dark')}
        prefersReducedMotion={!!prefersReducedMotion}
        rail={rail}
      >
        <MoonIcon />
      </CompactThemeBtn>
      <CompactThemeBtn
        label="Match system theme"
        pressed={preference === 'system'}
        onClick={() => setPreference('system')}
        prefersReducedMotion={!!prefersReducedMotion}
        rail={rail}
      >
        <MonitorIcon />
      </CompactThemeBtn>
    </div>
  )
}

function CompactThemeBtn({ label, pressed, onClick, children, prefersReducedMotion, rail = false }) {
  return (
    <motion.button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      whileHover={!prefersReducedMotion ? hoverThemeSegment : undefined}
      whileTap={tapScaleStrong(!!prefersReducedMotion)}
      className={`flex min-w-0 touch-manipulation items-center justify-center rounded-md ${focusRingButton} motion-safe:transition-colors ${
        rail ? 'min-h-[28px] py-0.5' : 'min-h-9 py-1.5'
      } ${
        pressed
          ? 'bg-primary-container text-on-primary-container shadow-sm'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      }`}
    >
      <span
        className={`flex items-center justify-center [&_svg]:shrink-0 ${
          rail
            ? 'h-4 w-4 [&_svg]:h-4 [&_svg]:w-4'
            : 'h-[18px] w-[18px] [&_svg]:h-[18px] [&_svg]:w-[18px]'
        }`}
      >
        {children}
      </span>
    </motion.button>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}
