import { useTheme } from './ThemeProvider'

const ring =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-safe:transition-shadow'

const ringMain =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-safe:transition-shadow'

export default function ThemeToggle({ variant = 'default', className = '' }) {
  const { preference, setPreference } = useTheme()

  if (variant === 'compact') {
    return (
      <div
        role="group"
        aria-label="Color theme"
        className={`inline-flex shrink-0 items-center rounded-lg border border-outline bg-surface-container p-0.5 shadow-sm ${className}`}
      >
        <CompactThemeBtn
          label="Light theme"
          pressed={preference === 'light'}
          onClick={() => setPreference('light')}
          r={ringMain}
        >
          <SunIcon />
        </CompactThemeBtn>
        <CompactThemeBtn
          label="Dark theme"
          pressed={preference === 'dark'}
          onClick={() => setPreference('dark')}
          r={ringMain}
        >
          <MoonIcon />
        </CompactThemeBtn>
        <CompactThemeBtn
          label="Match system theme"
          pressed={preference === 'system'}
          onClick={() => setPreference('system')}
          r={ringMain}
        >
          <MonitorIcon />
        </CompactThemeBtn>
      </div>
    )
  }

  const isSidebar = variant === 'sidebar'
  const r = isSidebar ? ring : ringMain

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={`inline-flex rounded-lg border p-0.5 shadow-sm ${
        isSidebar ? 'border-sidebar-border bg-sidebar-hover' : 'border-outline bg-surface-container'
      } ${className}`}
    >
      <ThemeBtn
        label="Light theme"
        pressed={preference === 'light'}
        onClick={() => setPreference('light')}
        isSidebar={isSidebar}
        r={r}
      >
        Light
      </ThemeBtn>
      <ThemeBtn
        label="Dark theme"
        pressed={preference === 'dark'}
        onClick={() => setPreference('dark')}
        isSidebar={isSidebar}
        r={r}
      >
        Dark
      </ThemeBtn>
      <ThemeBtn
        label="Match system theme"
        pressed={preference === 'system'}
        onClick={() => setPreference('system')}
        isSidebar={isSidebar}
        r={r}
      >
        System
      </ThemeBtn>
    </div>
  )
}

function CompactThemeBtn({ label, pressed, onClick, children, r }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-md motion-safe:transition-colors sm:h-10 sm:w-10 ${r} ${
        pressed
          ? 'bg-primary-container text-on-primary-container shadow-sm'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  )
}

function ThemeBtn({ label, pressed, onClick, children, isSidebar, r }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={`min-h-9 min-w-[4.25rem] rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide motion-safe:transition-colors sm:text-xs ${r} ${
        pressed
          ? isSidebar
            ? 'bg-sidebar-active-bg text-sidebar-on-active shadow-sm'
            : 'bg-primary-container text-on-primary-container shadow-sm'
          : isSidebar
            ? 'text-sidebar-on hover:bg-sidebar hover:text-sidebar-on-active'
            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}
